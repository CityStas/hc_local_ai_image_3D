// modelPaths.cjs — единая точка поиска внешних моделей и бинарников (3GS_Master).
//
// Раскладка 3GS_Master:
//   models/image/z-image-turbo/   → diffusion, VAE, LLM-энкодер (sd-server)
//   models/llm/qwen-3.5-0.8b/     → лёгкий чат
//   models/vlm/Qwen2.5-VL-7B/     → vision (llama-server / mtmd)
//   text_image_3D/3d_gen/3d_comfy/ComfyUI-Easy-Install → ComfyUI (3D: TripoSplat, Trellis2/Pixal3D)
//   bin/                          → sd-server/sd-cli, llama-server, llama-mtmd-cli
//
// Переопределение через env: HC_3GS_ROOT, HC_MODELS_ROOT, HC_COMFY_ROOT_3D.
// Пути из приложения (resourcesPath, node_modules/electron/dist/resources) имеют приоритет:
// эти функции вызываются ПОСЛЕ них, поэтому упакованная сборка не меняется.
//
// Абсолютных путей здесь нет намеренно. Раскладка «3GS_Master лежит рядом» - это
// единственное, что можно предположить о чужой машине: клон двух репозиториев в один
// каталог работает на любой букве диска. Всё остальное - через HC_3GS_ROOT.
const path = require('path');
const fs = require('fs');

const GS_CANDIDATES = [
  process.env.HC_3GS_ROOT,
  path.resolve(__dirname, '..', '3GS_Master'),
].filter(Boolean);

function pickGsRoot() {
  for (const c of GS_CANDIDATES) if (fs.existsSync(c)) return c;
  return GS_CANDIDATES[GS_CANDIDATES.length - 1];
}

const GS_ROOT = pickGsRoot();
// Порядок: свой корень HC -> корень 3GS_Master (та же переменная, что читает сам
// 3GS_Master, так что «веса на диске D:» настраивается один раз и для обоих) ->
// <3GS>/models.
const MODELS_ROOT =
  process.env.HC_MODELS_ROOT ||
  process.env.GS_MODELS_ROOT ||
  path.join(GS_ROOT, 'models');
const BIN_ROOT = path.join(GS_ROOT, 'bin');

// Реальная раскладка 3GS_Master — ComfyUI лежит ВНУТРИ models/:
//   models/text_image_3D/3d_gen/3d_comfy/ComfyUI-Easy-Install
// Старый путь без models/ оставлен как фолбэк: у части сборок ComfyUI
// распакован прямо в корне, и ломать их не хочется.
const COMFY_ROOT_CANDIDATES = [
  process.env.HC_COMFY_ROOT_3D,
  // 3GS_Master зовёт её THREE_COMFY_ROOT; принимаем обе, чтобы один local.env.cmd
  // настраивал оба инструмента.
  process.env.THREE_COMFY_ROOT,
  path.join(MODELS_ROOT, 'text_image_3D', '3d_gen', '3d_comfy', 'ComfyUI-Easy-Install'),
  path.join(GS_ROOT, 'text_image_3D', '3d_gen', '3d_comfy', 'ComfyUI-Easy-Install'),
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
  return [
    path.join(MODELS_ROOT, 'image'),
    path.join(MODELS_ROOT, 'llm'),
    path.join(MODELS_ROOT, 'vlm'),
    MODELS_ROOT,
  ];
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

/** Ищет exe в bin/ 3GS_Master по относительным путям. */
function resolveBinary(...relParts) {
  const full = path.join(BIN_ROOT, ...relParts);
  return fs.existsSync(full) ? full : null;
}

module.exports = {
  GS_ROOT,
  MODELS_ROOT,
  BIN_ROOT,
  COMFY_ROOT_3D,
  modelRoots,
  resolveModelFile,
  resolveModelParts,
  resolveBinary,
};
