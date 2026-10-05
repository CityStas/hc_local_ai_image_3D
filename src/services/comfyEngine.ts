import { isElectron } from './localEngine';

/**
 * ComfyUI-мост (sidecar на :8188). Даёт то, чего нет у stable-diffusion.cpp:
 * детерминированное удаление фона (birefnet → альфа) и image-to-3D (Trellis2 /
 * TripoSplat → GLB). Воркфлоу лежат в API-формате в workflows/comfy/ и описаны
 * в manifest.json — здесь только тонкая обёртка над IPC.
 */

export interface ComfyWorkflowInfo {
  id: string;
  title: string;
  kind: 'image' | '3d' | string;
}

export interface ComfyStatus {
  available: boolean;
  root: string | null;
  python: string | null;
  port: number;
  running: boolean;
  busy: boolean;
  vramMode: string;
  workflows: ComfyWorkflowInfo[];
}

export interface ComfyFile {
  name: string;
  mime: string;
  base64: string;
  /** Заполнено только для картинок; для GLB/SPZ — null. */
  dataUrl: string | null;
  kind: string;
}

export interface ComfyRunResult {
  files: ComfyFile[];
  elapsedMs: number;
  promptId: string;
}

export interface ComfyProgress {
  progress?: number;
  text?: string;
  phase?: string;
  step?: number;
  steps?: number;
  node?: string;
}

export class ComfyEngineService {
  async status(): Promise<ComfyStatus | null> {
    if (!isElectron() || !window.nexus?.comfyStatus) return null;
    try {
      return (await window.nexus.comfyStatus()) as ComfyStatus;
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!(await this.status())?.available;
  }

  /** Поднять сервер заранее — первый холодный старт ~30-90 с (импорт torch). */
  async preload(): Promise<boolean> {
    if (!window.nexus?.comfyPreload) return false;
    const r = await window.nexus.comfyPreload();
    return !!r?.ok;
  }

  /** Погасить сервер (освободить VRAM под SD/VLM). */
  async stop(): Promise<void> {
    await window.nexus?.comfyStop?.().catch(() => {});
  }

  abort() {
    window.nexus?.comfyAbort?.().catch(() => {});
  }

  async run(
    workflowId: string,
    options: {
      imageDataUrls?: string[];
      prompt?: string;
      params?: Record<string, unknown>;
    } = {},
    callbacks: { onProgress?: (p: ComfyProgress) => void } = {}
  ): Promise<ComfyRunResult> {
    if (!window.nexus?.comfyRun) {
      throw new Error('ComfyUI-воркфлоу доступны только в десктопной версии.');
    }
    const off = window.nexus.onComfyProgress?.((p) => callbacks.onProgress?.(p));
    try {
      const res = await window.nexus.comfyRun({ workflowId, ...options });
      if (res?.aborted) throw new Error('Прогон отменён');
      if (!res?.ok || !res.files?.length) throw new Error(res?.error || 'ComfyUI не вернул результат');
      return {
        files: res.files,
        elapsedMs: res.elapsedMs ?? 0,
        promptId: res.promptId ?? '',
      };
    } finally {
      off?.();
    }
  }

  /** Удаление фона → PNG с альфа-каналом. */
  async removeBackground(dataUrl: string, onProgress?: (p: ComfyProgress) => void): Promise<string> {
    const r = await this.run('bg_remove', { imageDataUrls: [dataUrl] }, { onProgress });
    const img = r.files.find((f) => f.dataUrl);
    if (!img?.dataUrl) throw new Error('Удаление фона не вернуло изображение');
    return img.dataUrl;
  }

  /** Image-to-3D. Возвращает GLB как Blob URL (dataUrl для больших GLB не нужен). */
  async imageTo3D(
    dataUrl: string,
    opts: {
      workflowId?: string;
      /** Разрешение препроцессинга/кропа: 512 (быстро) или 1024 (детально). */
      resolution?: number;
      /** Шаги сэмплинга. */
      steps?: number;
      /** Сид, −1 → случайный. */
      seed?: number;
      /** Сначала убрать фон (birefnet), потом 3D. */
      removeBgFirst?: boolean;
      /**
       * Основа имени файла (обычно промпт картинки). ComfyUI отдаёт шаблонное
       * `ComfyUI_TripoSplat_00011_.spz` — переименовываем в осмысленный slug.
       */
      nameBase?: string;
      onProgress?: (p: ComfyProgress) => void;
    } = {}
  ): Promise<{ files: ComfyFile[]; objectUrl: string | null; name: string; elapsedMs: number }> {
    const params: Record<string, unknown> = {};
    if (opts.resolution) params.resolution = opts.resolution;
    if (opts.steps) params.steps = opts.steps;
    if (typeof opts.seed === 'number') {
      params.seed = opts.seed >= 0 ? opts.seed : Math.floor(Math.random() * 0x7fffffff);
    }
    if (typeof opts.removeBgFirst === 'boolean') params.removeBgFirst = opts.removeBgFirst;

    const r = await this.run(
      opts.workflowId || 'trellis2_image_to_3d',
      { imageDataUrls: [dataUrl], params },
      { onProgress: opts.onProgress }
    );
    const glb = r.files.find((f) => /\.(glb|gltf)$/i.test(f.name)) || r.files[0];
    let objectUrl: string | null = null;
    if (glb?.base64) {
      const bytes = Uint8Array.from(atob(glb.base64), (c) => c.charCodeAt(0));
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: glb.mime || 'model/gltf-binary' }));
    }
    // Расширение берём у реального файла ComfyUI (.glb / .gltf / .spz / .ply),
    // а имя — из промпта: `sleek-modern-sneakers.glb` вместо `ComfyUI_TripoSplat_00011_.glb`.
    const ext = (String(glb?.name || '').match(/\.(glb|gltf|spz|ply|obj)$/i) || ['.glb'])[0].toLowerCase();
    return { files: r.files, objectUrl, name: `${slugifyFileName(opts.nameBase || 'hc-3d')}${ext}`, elapsedMs: r.elapsedMs };
  }
}

/** Промпт → безопасное имя файла: латиница/цифры/дефисы, максимум 6 слов. */
export function slugifyFileName(input: string | undefined, fallback = 'hc-3d'): string {
  const s = String(input || '')
    .toLowerCase()
    // транслит не делаем — кириллицу оставляем, Windows её в именах переваривает
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join('-')
    .slice(0, 64)
    .replace(/^-+|-+$/g, '');
  return s || fallback;
}

export const comfyEngineService = new ComfyEngineService();
export const fetchComfyStatus = (): Promise<ComfyStatus | null> => new ComfyEngineService().status();
