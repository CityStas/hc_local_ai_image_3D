import type { Comfy3dConfig } from '../types';

/** Значения по умолчанию для image-to-3D. */
export const DEFAULT_COMFY3D: Comfy3dConfig = {
  workflowId: 'trellis2_image_to_3d',
  resolution: 1024,
  steps: 20,
  seed: -1,
  removeBgFirst: true,
};

/** Варианты воркфлоу 3D для UI. */
export const COMFY3D_WORKFLOWS: Array<{
  id: Comfy3dConfig['workflowId'];
  title: string;
  tagline: string;
}> = [
  {
    id: 'trellis2_image_to_3d',
    title: 'Trellis2',
    tagline: 'Детальнее, дольше',
  },
  {
    id: 'triposplat_image_to_3d',
    title: 'TripoSplat',
    tagline: 'Быстрее, грубее',
  },
];

export const COMFY3D_RESOLUTIONS: Array<Comfy3dConfig['resolution']> = [512, 1024];
