// comfyEngine.cjs — HC AI → ComfyUI (sidecar).
//
// Зачем: hc_ai умеет txt2img (stable-diffusion.cpp) и VLM, но не умеет
// удаление фона и 3D. Это всё уже собрано в ComfyUI (портатив, Python) —
// поэтому ComfyUI поднимается как ДОЧЕРНИЙ процесс, а общение идёт по HTTP
// (/prompt, /history, /view, /upload/image) + WS (/ws) для прогресса.
// Ничего портировать в node не нужно: воркфлоу лежат в API-формате
// (workflows/comfy/*.json), флаттенинг сабграфов уже сделан заранее.
//
// Зависимостей нет: fetch/FormData/Blob/AbortController — из Node 22,
// WS — минимальный клиент поверх net (как в dev-скрипте run_workflow_api.py).
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const PORT = Number(process.env.HC_COMFY_PORT || 8188);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

// Имя папки портативной сборки ComfyUI-Easy-Install.
const CEI_DIR = 'ComfyUI-Easy-Install';

// PID-файл: позволяет добить ComfyUI, оставшийся от прошлого запуска приложения
// (python с torch и моделями в --lowvram держит ГИГАБАЙТЫ системной RAM и
// переживает закрытие Electron). Без этого на 16 ГБ ОЗУ уходит под ноль,
// а sd-server потом перечитывает модели с диска — генерация 30-130с вместо ~20с.
const PID_FILE = path.join(os.tmpdir(), 'hc-ai-comfy.pid');

// Авто-стоп сервера после простоя. 0 / отрицательное — не гасить по таймауту.
// Нужен как страховка: если юзер сделал 3D и ушёл, ComfyUI не должен висеть вечно.
const IDLE_STOP_MS = Number(process.env.HC_COMFY_IDLE_STOP_MS ?? 90000);

let serverProc = null;
let abortCtrl = null;
let busy = false;
let lastError = null;
let idleTimer = null;
// Колбэк арбитража VRAM, ставится из main.cjs: () => Promise<void>.
// На 8 ГБ VRAM ComfyUI не уживается с sd-server (6.5 ГБ) и llama-server (5.5 ГБ),
// поэтому перед прогоном гасим их.
let beforeRun = null;
let vramMode = 'lowvram'; // 'lowvram' | 'normal'

function configure(opts) {
  if (opts && typeof opts.beforeRun === 'function') beforeRun = opts.beforeRun;
  if (opts && typeof opts.vramMode === 'string') vramMode = opts.vramMode;
}

// ---------- владение процессом (pid-файл) + авто-стоп по простою ----------
function writePidFile(pid) { try { fs.writeFileSync(PID_FILE, String(pid)); } catch {} }
function readPidFile() {
  try {
    const n = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}
function clearPidFile() { try { fs.unlinkSync(PID_FILE); } catch {} }

function clearIdleStop() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
}

/** Запланировать гашение сервера после простоя (страховка от «вечно живого» python). */
function scheduleIdleStop() {
  clearIdleStop();
  if (!(IDLE_STOP_MS > 0)) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    console.error(`[hc/comfy] простой ${Math.round(IDLE_STOP_MS / 1000)}с — гашу сервер, освобождаю RAM/VRAM`);
    stopServerAndWait().catch(() => {});
  }, IDLE_STOP_MS);
  if (idleTimer.unref) idleTimer.unref();
}

function execCapture(cmd, args) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (_e, stdout) => resolve(String(stdout || '')));
    } catch { resolve(''); }
  });
}

/** PID процесса, слушающего наш порт (только Windows). */
async function portOwnerPid() {
  if (process.platform !== 'win32') return 0;
  const out = await execCapture('netstat', ['-ano', '-p', 'TCP']);
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
    if (m && Number(m[1]) === PORT) return Number(m[2]);
  }
  return 0;
}

async function processImagePath(pid) {
  if (process.platform !== 'win32') return '';
  const out = await execCapture('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`,
  ]);
  return out.trim();
}

/**
 * Добить сервер, оставшийся от ПРЕДЫДУЩЕГО запуска приложения.
 * Если pid-файла нет (сервер поднят сборкой до его появления) — ищем владельца
 * порта и убиваем ТОЛЬКО когда это наш портативный ComfyUI (путь содержит
 * ComfyUI-Easy-Install). Чужой ComfyUI, запущенный пользователем вручную, не трогаем.
 */
async function killStaleServer() {
  if (serverProc) return false;
  if (!(await isServerAlive())) { clearPidFile(); return false; }
  let pid = readPidFile();
  if (!pid) {
    const owner = await portOwnerPid();
    if (owner) {
      const img = await processImagePath(owner);
      if (img && new RegExp(CEI_DIR, 'i').test(img)) pid = owner;
      else console.error(`[hc/comfy] порт ${PORT} занят посторонним процессом (${img || 'путь неизвестен'}) — не трогаю`);
    }
  }
  if (!pid) return false;
  console.error('[hc/comfy] найден ComfyUI от прошлого запуска (pid', pid, ') — гашу');
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/F', '/T'], { windowsHide: true }).unref();
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {}
  clearPidFile();
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (!(await isServerAlive())) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------- поиск установки ComfyUI --------------------------------------
// Порядок: env HC_COMFY_ROOT → packaged resources → dev-раскладка рядом с проектом.
function comfyRoots() {
  const roots = [];
  if (process.env.HC_COMFY_ROOT) roots.push(process.env.HC_COMFY_ROOT);
  if (process.resourcesPath) {
    roots.push(path.join(process.resourcesPath, CEI_DIR));
    roots.push(path.join(process.resourcesPath, 'comfy', CEI_DIR));
  }
  // hc_ai/hc_ai → вверх до F:\Pets\Projects\local, затем 3d_gen/3d_comfy/...
  const projectLocal = path.resolve(__dirname, '..', '..');
  roots.push(path.join(projectLocal, '3d_gen', '3d_comfy', CEI_DIR));
  roots.push(path.join(projectLocal, '3d', '3d_comfy', CEI_DIR)); // старая раскладка
  roots.push(path.join(__dirname, 'comfy', CEI_DIR));
  return roots;
}

/** Корень сборки: папка, где лежат python_embeded\python.exe и ComfyUI\main.py. */
function findComfyRoot() {
  for (const root of comfyRoots()) {
    const py = path.join(root, 'python_embeded', 'python.exe');
    const main = path.join(root, 'ComfyUI', 'main.py');
    if (fs.existsSync(py) && fs.existsSync(main)) return root;
  }
  return null;
}

function findPython() {
  const root = findComfyRoot();
  return root ? path.join(root, 'python_embeded', 'python.exe') : null;
}

/** Папка с API-воркфлоу. */
function workflowsDir() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'workflows', 'comfy'));
  candidates.push(path.join(__dirname, 'workflows', 'comfy'));
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return candidates[candidates.length - 1];
}

function loadManifest() {
  const p = path.join(workflowsDir(), 'manifest.json');
  if (!fs.existsSync(p)) return { workflows: [] };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('[hc/comfy] манифест воркфлоу нечитаем:', e.message);
    return { workflows: [] };
  }
}

function getWorkflowDef(id) {
  return (loadManifest().workflows || []).find((w) => w.id === id) || null;
}

// ---------- HTTP ---------------------------------------------------------
async function getJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function postJson(url, payload, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 800)}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(t);
  }
}

async function isServerAlive() {
  try {
    await getJson(`${BASE}/system_stats`, 3000);
    return true;
  } catch {
    return false;
  }
}

// ---------- жизненный цикл сервера ---------------------------------------
async function startServer(send) {
  if (await isServerAlive()) return true;
  const root = findComfyRoot();
  if (!root) {
    throw new Error(
      'Сборка ComfyUI не найдена. Ожидается папка ' + CEI_DIR +
      ' (python_embeded\\python.exe + ComfyUI\\main.py). ' +
      'Укажите путь через переменную HC_COMFY_ROOT.'
    );
  }
  if (serverProc) return waitAlive(send);

  const py = path.join(root, 'python_embeded', 'python.exe');
  const args = [
    '-I', '-W', 'ignore::FutureWarning',
    path.join('ComfyUI', 'main.py'),
    '--windows-standalone-build',
    '--port', String(PORT),
    // Без этого ComfyUI открывает свой GUI в браузере (args.auto_launch) — из
    // приложения это лишнее окно поверх UI.
    '--disable-auto-launch',
  ];
  if (vramMode === 'lowvram') args.push('--lowvram');

  console.error('[hc/comfy] spawn:', py);
  console.error('[hc/comfy] cmd:', args.join(' '));
  send?.('comfy:progress', { progress: 0, phase: 'boot', text: 'Запуск ComfyUI…' });

  serverProc = spawn(py, args, {
    cwd: root,
    windowsHide: true,
    env: { ...process.env },
  });
  writePidFile(serverProc.pid);
  serverProc.stdout.on('data', (c) => {
    const s = c.toString();
    if (/To see the GUI|Starting server|import times/i.test(s)) console.error('[hc/comfy]', s.trim());
  });
  serverProc.stderr.on('data', (c) => {
    const s = c.toString().trimEnd();
    if (s && !/^\s*$/.test(s)) console.error('[hc/comfy-stderr]', s);
  });
  serverProc.on('close', (code) => {
    console.error('[hc/comfy] сервер завершился, код', code);
    serverProc = null;
    clearPidFile();
  });
  serverProc.on('error', (err) => {
    console.error('[hc/comfy] не удалось запустить:', err.message);
    serverProc = null;
    clearPidFile();
  });
  return waitAlive(send);
}

/** Ждём готовности порта. Первый старт холодный — до ~90 с (импорт torch). */
async function waitAlive(send, timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await isServerAlive()) {
      send?.('comfy:progress', { progress: 2, phase: 'boot', text: 'ComfyUI готов' });
      return true;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('ComfyUI не поднялся за 3 минуты (проверьте лог hc-ai.log).');
}

function stopServer() {
  clearIdleStop();
  const proc = serverProc;
  serverProc = null;
  clearPidFile();
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(proc.pid), '/F', '/T'], { windowsHide: true }).unref();
    } else {
      proc.kill('SIGKILL');
    }
  } catch {}
}

/**
 * Освободить RAM/VRAM: гасим ComfyUI и ЖДЁМ фактического освобождения порта.
 * Вызывается перед sd:generate / sd:preload / vlm:analyze / upscale:generate —
 * иначе python с torch+моделями (--lowvram → веса в системной RAM) висит рядом
 * с sd-server, ОЗУ уходит в ноль, и следующая генерация перечитывает модели с диска.
 */
async function stopServerAndWait(timeoutMs = 15000) {
  clearIdleStop();
  if (!serverProc) {
    // Сервер мог пережить закрытие приложения — добиваем по pid-файлу.
    await killStaleServer();
    return;
  }
  stopServer();
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (!(await isServerAlive())) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ---------- загрузка картинки в input/ -----------------------------------
/**
 * ComfyUI читает LoadImage из своей папки input/. Кладём файл через /upload/image
 * и получаем имя, которое надо прописать в узел LoadImage.
 */
async function uploadImage(buf, filename) {
  const fd = new FormData();
  fd.append('image', new Blob([buf]), filename);
  fd.append('overwrite', 'true');
  fd.append('type', 'input');
  const r = await fetch(`${BASE}/upload/image`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error(`upload/image HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

// ---------- правка API-промпта -------------------------------------------
function setInput(prompt, nodeKey, input, value) {
  const n = prompt[nodeKey];
  if (!n) throw new Error(`В воркфлоу нет узла ${nodeKey}`);
  n.inputs[input] = value;
}

/** Удаляет узлы (превью/сравнение) и все ссылки на них. */
function dropNodes(prompt, keys) {
  for (const k of keys || []) {
    if (prompt[k]) delete prompt[k];
  }
  for (const node of Object.values(prompt)) {
    for (const name of Object.keys(node.inputs)) {
      const v = node.inputs[name];
      if (Array.isArray(v) && v.length === 2 && (keys || []).includes(String(v[0]))) {
        delete node.inputs[name];
      }
    }
  }
}

/**
 * Применяет options.params к API-промпту. Два вида ключей:
 *   1) прямая правка — "nodeKey.input": value;
 *   2) логический параметр — "resolution"/"steps"/"seed"/"removeBgFirst",
 *      раскрывается в конкретные узлы через def.paramMap манифеста.
 * nodeKey может сам содержать точки (флаттенинг сабграфов: "88.2", "459.474"),
 * поэтому и ключ, и цель режутся по ПОСЛЕДНЕЙ точке.
 */
function applyParams(prompt, def, params) {
  for (const [k, v] of Object.entries(params || {})) {
    const dot = k.lastIndexOf('.');
    if (dot <= 0) continue;
    setInput(prompt, k.slice(0, dot), k.slice(dot + 1), v);
  }
  for (const [pname, pval] of Object.entries(params || {})) {
    if (pname.includes('.')) continue; // уже применено выше как node.input
    const map = def.paramMap && def.paramMap[pname];
    if (!map) continue;
    for (const [target, cast] of Object.entries(map)) {
      const dot = target.lastIndexOf('.');
      if (dot <= 0) continue;
      const nodeKey = target.slice(0, dot);
      const input = target.slice(dot + 1);
      if (!prompt[nodeKey]) continue;
      let v = pval;
      if (cast === 'num') v = Number(pval);
      else if (cast === 'str') v = String(pval);
      else if (cast === 'bool') v = !!pval;
      setInput(prompt, nodeKey, input, v);
    }
  }
}

// ---------- WebSocket-прогресс (минимальный клиент, без зависимостей) -----
function connectProgress(send, promptId) {
  let closed = false;
  const key = crypto.randomBytes(16).toString('base64');
  const sock = net.connect(PORT, HOST);
  let buf = Buffer.alloc(0);
  let handshaken = false;

  const finish = () => { if (!closed) { closed = true; try { sock.destroy(); } catch {} } };

  sock.on('connect', () => {
    sock.write(
      `GET /ws HTTP/1.1\r\nHost: ${HOST}:${PORT}\r\n` +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
    );
  });

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshaken) {
      const i = buf.indexOf('\r\n\r\n');
      if (i === -1) return;
      handshaken = true;
      buf = buf.subarray(i + 4);
    }
    // Разбор кадров: сервер → клиент не маскирует.
    for (;;) {
      if (buf.length < 2) return;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
      }
      if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = buf.subarray(off, off + len);
      buf = buf.subarray(off + len);

      if (opcode === 0x8) return finish();
      if (opcode === 0x9) continue; // ping — pong не обязателен для локального сервера
      if (opcode !== 0x1) continue;
      let msg;
      try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; }
      handleWs(msg, send, promptId);
    }
  });

  sock.on('error', () => finish());
  sock.on('close', () => { closed = true; });

  return finish;
}

function handleWs(msg, send, promptId) {
  const { type, data } = msg || {};
  if (!data) return;
  if (data.prompt_id && promptId && data.prompt_id !== promptId) return;
  if (type === 'executing') {
    if (data.node === null) {
      send?.('comfy:progress', { progress: 99, phase: 'done', text: 'Сборка результата…' });
    } else {
      send?.('comfy:progress', { phase: 'node', node: data.node, text: `Узел ${data.node}` });
    }
  } else if (type === 'progress') {
    const max = Number(data.max) || 1;
    const val = Number(data.value) || 0;
    send?.('comfy:progress', {
      progress: Math.max(1, Math.min(98, Math.round((val / max) * 100))),
      phase: 'sample',
      step: val,
      steps: max,
      text: `Сэмплинг ${val}/${max}`,
    });
  } else if (type === 'execution_error' || type === 'execution_interrupted') {
    send?.('comfy:progress', { phase: 'error', text: String(data.exception_message || type) });
  }
}

// ---------- получение выходов --------------------------------------------
async function fetchOutput(item) {
  const q = new URLSearchParams({
    filename: item.filename,
    subfolder: item.subfolder || '',
    type: item.type || 'output',
  });
  const r = await fetch(`${BASE}/view?${q.toString()}`);
  if (!r.ok) throw new Error(`view HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

function mimeFor(name) {
  const e = String(name || '').toLowerCase();
  if (e.endsWith('.png')) return 'image/png';
  if (e.endsWith('.jpg') || e.endsWith('.jpeg')) return 'image/jpeg';
  if (e.endsWith('.webp')) return 'image/webp';
  if (e.endsWith('.glb')) return 'model/gltf-binary';
  if (e.endsWith('.spz')) return 'application/octet-stream';
  return 'application/octet-stream';
}

// ---------- основной прогон ----------------------------------------------
/**
 * @param {string} workflowId — id из workflows/comfy/manifest.json
 * @param {{ imageDataUrls?: string[], imageDataUrl?: string, prompt?: string,
 *           params?: Record<string, any> }} options
 * @param {(channel: string, data: any) => void} send
 * @returns Promise<{ files: Array<{name, mime, base64, dataUrl, kind}>, elapsedMs, promptId }>
 */
async function runWorkflow(workflowId, options, send) {
  if (busy) throw new Error('ComfyUI занят другим прогоном — дождитесь завершения');
  clearIdleStop(); // прогон начался — авто-стоп не должен стрелять в процессе
  const def = getWorkflowDef(workflowId);
  if (!def) throw new Error(`Воркфлоу "${workflowId}" нет в manifest.json`);

  const wfFile = path.join(workflowsDir(), def.file);
  if (!fs.existsSync(wfFile)) throw new Error(`Файл воркфлоу не найден: ${def.file}`);
  const prompt = JSON.parse(fs.readFileSync(wfFile, 'utf8'));

  // Арбитраж VRAM до старта сервера.
  if (beforeRun) {
    send?.('comfy:progress', { progress: 0, phase: 'vram', text: 'Освобождаю VRAM…' });
    await beforeRun();
  }

  await startServer(send);

  // Подставляем входные картинки (LoadImage читает из input/, поэтому заливаем).
  // def.imageNodes — массив узлов LoadImage; options.imageDataUrls — массив dataUrl
  // (если пришла одна картинка, а узлов несколько — она идёт в первый).
  const imageNodes = def.imageNodes || (def.imageNode ? [def.imageNode] : []);
  const dataUrls = options?.imageDataUrls
    || (options?.imageDataUrl ? [options.imageDataUrl] : []);
  if (dataUrls.length && !imageNodes.length) {
    throw new Error(`Воркфлоу ${workflowId} не принимает изображение`);
  }
  for (let i = 0; i < Math.min(dataUrls.length, imageNodes.length); i++) {
    const m = String(dataUrls[i]).match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) throw new Error('Некорректный dataUrl входного изображения');
    // Стабильное имя + overwrite=true: не копим файлы в input/ ComfyUI.
    const name = await uploadImage(Buffer.from(m[2], 'base64'), `hc_in_${i}.png`);
    setInput(prompt, imageNodes[i], 'image', name);
  }

  if (options?.prompt && def.promptNode) {
    setInput(prompt, def.promptNode, def.promptInput || 'prompt', String(options.prompt));
  }
  applyParams(prompt, def, options?.params);
  dropNodes(prompt, def.drop);

  abortCtrl = new AbortController();
  busy = true;
  const t0 = Date.now();
  let stopWs = null;
  try {
    const res = await postJson(`${BASE}/prompt`, { prompt });
    const promptId = res.prompt_id;
    if (!promptId) throw new Error('ComfyUI не вернул prompt_id: ' + JSON.stringify(res).slice(0, 400));
    console.error('[hc/comfy] prompt_id =', promptId);

    stopWs = connectProgress(send, promptId);

    // Ждём завершения по /history.
    const TIMEOUT = Number(def.timeoutMs) || 15 * 60 * 1000;
    for (;;) {
      if (abortCtrl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (Date.now() - t0 > TIMEOUT) throw new Error('Таймаут воркфлоу ComfyUI');
      await new Promise((r) => setTimeout(r, 1200));
      const h = await getJson(`${BASE}/history/${promptId}`, 15000);
      const entry = h[promptId];
      if (!entry) continue;
      const st = entry.status || {};
      if (st.status_str === 'error' || st.completed === false) {
        const msgs = (st.messages || []).filter((m) => m[0] === 'execution_error');
        throw new Error('ComfyUI: ' + (msgs[0] ? JSON.stringify(msgs[0][1]).slice(0, 600) : 'ошибка выполнения'));
      }

      const wanted = def.outputs || [];
      const files = [];
      const outputs = entry.outputs || {};
      for (const spec of wanted) {
        const nodeOut = outputs[spec.node];
        if (!nodeOut) continue;
        for (const val of Object.values(nodeOut)) {
          for (const item of Array.isArray(val) ? val : [val]) {
            if (!item || !item.filename) continue;
            const buf = await fetchOutput(item);
            const mime = mimeFor(item.filename);
            files.push({
              name: item.filename,
              mime,
              base64: buf.toString('base64'),
              dataUrl: mime.startsWith('image/') ? `data:${mime};base64,${buf.toString('base64')}` : null,
              kind: spec.type || (mime.startsWith('image/') ? 'image' : 'file'),
            });
          }
        }
      }
      if (!files.length) {
        throw new Error(
          'ComfyUI отработал, но выходов нет. Частая причина — отсутствующий файл модели ' +
          '(ComfyUI валидирует все узлы промпта). Смотрите stdout сервера в hc-ai.log.'
        );
      }
      send?.('comfy:progress', { progress: 100, phase: 'done', text: 'Готово' });
      return { files, elapsedMs: Date.now() - t0, promptId };
    }
  } finally {
    stopWs?.();
    busy = false;
    abortCtrl = null;
    scheduleIdleStop();
  }
}

/** Прервать текущий прогон (POST /interrupt). Сервер остаётся живым. */
async function abort() {
  if (abortCtrl) { try { abortCtrl.abort(); } catch {} }
  try { await postJson(`${BASE}/interrupt`, {}, 10000); } catch {}
  return true;
}

function getStatus() {
  const root = findComfyRoot();
  const manifest = loadManifest();
  return {
    available: !!root,
    root,
    python: findPython(),
    port: PORT,
    running: !!serverProc,
    busy,
    vramMode,
    lastError,
    workflows: (manifest.workflows || []).map((w) => ({ id: w.id, title: w.title, kind: w.kind })),
  };
}

module.exports = {
  configure,
  runWorkflow,
  abort,
  getStatus,
  startServer,
  stopServer,
  stopServerAndWait,
  killStaleServer,
  isServerAlive,
  findComfyRoot,
  PORT,
  // экспортируется для тестов/отладки (чистая функция без побочек)
  applyParams,
  getWorkflowDef,
};
