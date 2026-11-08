// modelPaths.cjs — где HC AI ищет внешние модели и бинарники движков.
//
// Проект самодостаточен: `npm run download:all` кладёт всё внутрь приложения
// (node_modules/electron/dist/resources/), и без единой переменной окружения
// приложение работает. Этот модуль нужен только чтобы взять веса из ОБЩЕГО
// каталога, если он у вас уже есть, — неважно, кто его наполнил.
//
// Порядок для корня весов:
//   HC_MODELS_ROOT      только для этого приложения (побеждает)
//   LOCAL_LLM_MODELS    ОБЩИЙ корень: нейтральное имя, его может читать любой
//                       другой локальный инструмент, поэтому один каталог
//                       обслуживает несколько приложений без знания путей друг друга
//   resources приложения — то, что скачали npm-скрипты; дефолт
//
// Ожидаемая раскладка в общем корне (её создаёт любой из инструментов):
//   image/z-image-turbo/   diffusion + VAE + текстовый энкодер (sd-server)
//   llm/                   чат-GGUF
//   vlm/Qwen2.5-VL-7B/     vision (llama-server / mtmd)
//   text_image_3D/3d_gen/3d_comfy/ComfyUI-Easy-Install   ComfyUI для фона и 3D
//
// Ни одного пути к другому проекту здесь нет: связь только через переменную
// окружения, и она необязательна. Пути приложения (process.resourcesPath,
// node_modules/electron/dist/resources) по-прежнему в приоритете — движки
// вызывают эти функции ПОСЛЕ своих собственных кандидатов.
const path = require('path');
const fs = require('fs');

const APP_ROOT = __dirname;

// `.env` рядом с приложением — единственный файл, где можно записать пути один раз
// и не трогать окружение системы. Формат: KEY=VALUE, `#` — комментарий. Уже
// выставленные переменные окружения главнее файла, поэтому `setx` тоже работает.
// В git файла нет (`.env*` в .gitignore), есть только `.env.example`.
(function loadDotEnv() {
  const file = path.join(APP_ROOT, '.env');
  if (!fs.existsSync(file)) return;
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
})();

// Куда electron-builder кладёт extraResources: в собранном .exe это
// process.resourcesPath, в разработке — node_modules/electron/dist/resources.
const APP_RESOURCES = process.resourcesPath
  ? process.resourcesPath
  : path.join(APP_ROOT, 'node_modules', 'electron', 'dist', 'resources');

const MODELS_ROOT =
  process.env.HC_MODELS_ROOT ||
  process.env.LOCAL_LLM_MODELS ||
  APP_RESOURCES;

// Бинарники: рядом с приложением (sd-vulkan/, llama-mtmd/) либо там, куда указали.
const BIN_ROOT = process.env.HC_BIN_ROOT || APP_ROOT;

const COMFY_ROOT_CANDIDATES = [
  process.env.HC_COMFY_ROOT,
  path.join(MODELS_ROOT, 'text_image_3D', '3d_gen', '3d_comfy', 'ComfyUI-Easy-Install'),
  path.join(APP_ROOT, 'comfy', 'ComfyUI-Easy-Install'),
].filter(Boolean);

function pickComfyRoot() {
  for (const c of COMFY_ROOT_CANDIDATES) {
    if (fs.existsSync(path.join(c, 'ComfyUI', 'main.py'))) return c;
  }
  return COMFY_ROOT_CANDIDATES[0];
}

const COMFY_ROOT_3D = pickComfyRoot();

/** Корни, где ищутся GGUF/safetensors по паре (папка модели, файл). */
function modelRoots() {
  const roots = [
    path.join(MODELS_ROOT, 'image'),
    path.join(MODELS_ROOT, 'llm'),
    path.join(MODELS_ROOT, 'vlm'),
    MODELS_ROOT,
    APP_RESOURCES,
  ];
  return [...new Set(roots)];
}

/** Ищет файл dir/file во внешних моделях. Возвращает абсолютный путь или null. */
function resolveModelFile(dir, file) {
  for (const root of modelRoots()) {
    const full = path.join(root, dir, file);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** Ищет путь относительно каждой внешней папки моделей (варианты с parts...). */
function resolveModelParts(...parts) {
  for (const root of modelRoots()) {
    const full = path.join(root, ...parts);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

/** Ищет exe по относительным путям внутри BIN_ROOT. */
function resolveBinary(...relParts) {
  const full = path.join(BIN_ROOT, ...relParts);
  return fs.existsSync(full) ? full : null;
}

module.exports = {
  APP_ROOT,
  APP_RESOURCES,
  MODELS_ROOT,
  BIN_ROOT,
  COMFY_ROOT_3D,
  modelRoots,
  resolveModelFile,
  resolveModelParts,
  resolveBinary,
};
