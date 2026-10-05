import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  X,
  RotateCcw,
  Play,
  Pause,
  Download,
  Box,
  Layers,
  Sun,
  Maximize2,
} from 'lucide-react';

/**
 * Полноэкранный просмотрщик GLB на three.js — без CDN и внешних сервисов
 * (приложение офлайн). Даёт вращение/зум/пан, авто-вращение, каркас, сброс
 * камеры и выбор фона (прозрачный/тёмный/светлый/градиент/студия).
 */

interface BgPreset {
  id: string;
  label: string;
  /** CSS-фон под прозрачным canvas. */
  style: React.CSSProperties;
  /** Тёмный фон → светлые подписи, и наоборот. */
  dark: boolean;
}

const CHECKER: React.CSSProperties = {
  backgroundColor: '#141419',
  backgroundImage:
    'conic-gradient(#1d1d24 90deg, #141419 90deg 180deg, #1d1d24 180deg 270deg, #141419 270deg)',
  backgroundSize: '24px 24px',
};

const BG_PRESETS: BgPreset[] = [
  { id: 'transparent', label: 'Прозрачный', style: CHECKER, dark: true },
  { id: 'dark', label: 'Тёмный', style: { backgroundColor: '#0a0a0f' }, dark: true },
  { id: 'light', label: 'Светлый', style: { backgroundColor: '#e9e9ee' }, dark: false },
  {
    id: 'gradient',
    label: 'Градиент',
    style: { backgroundImage: 'radial-gradient(circle at 50% 32%, #2b3240 0%, #0a0a0f 72%)' },
    dark: true,
  },
  {
    id: 'studio',
    label: 'Студия',
    style: { backgroundImage: 'linear-gradient(180deg, #f4f4f7 0%, #c9cdd6 100%)' },
    dark: false,
  },
];

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const any = o as unknown as { geometry?: { dispose?: () => void }; material?: unknown };
    any.geometry?.dispose?.();
    const m = any.material;
    if (Array.isArray(m)) m.forEach((x) => (x as { dispose?: () => void })?.dispose?.());
    else (m as { dispose?: () => void })?.dispose?.();
  });
}

export function GlbViewer({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => {});
  const modelRef = useRef<THREE.Object3D | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bgId, setBgId] = useState('transparent');
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);

  const bg = BG_PRESETS.find((b) => b.id === bgId) || BG_PRESETS[0];

  // Esc закрывает.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Сцена three.js: создаётся один раз на url.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(320, mount.clientWidth);
    const height = Math.max(240, mount.clientHeight);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 5000);
    camera.position.set(0, 0.4, 2.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.2;
    controls.minDistance = 0.05;
    controls.maxDistance = 500;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a48, 1.0));
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.9);
    fill.position.set(-4, 2, -3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(0, -3, -6);
    scene.add(rim);

    let disposed = false;
    let raf = 0;

    const fit = () => {
      const model = modelRef.current;
      if (!model) return;
      const bbox = new THREE.Box3().setFromObject(model);
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fitDist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
      model.position.sub(center); // центрируем модель в начале координат
      controls.target.set(0, 0, 0);
      camera.near = Math.max(maxDim / 200, 0.001);
      camera.far = maxDim * 200;
      camera.position.set(0, maxDim * 0.12, fitDist * 1.85);
      camera.updateProjectionMatrix();
      controls.update();
    };
    fitRef.current = fit;

    const loader = new GLTFLoader();
    setLoading(true);
    setError(null);
    setProgress(0);

    loader.load(
      url,
      (gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        modelRef.current = gltf.scene;
        scene.add(gltf.scene);
        fit();
        setLoading(false);
      },
      (ev) => {
        if (ev.total) setProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      },
      (err) => {
        if (disposed) return;
        const msg = String((err as { message?: string })?.message || err);
        setError(
          /draco|ktx2|meshopt/i.test(msg)
            ? 'Модель сжата (Draco/KTX2/Meshopt) — такой GLB просмотрщик не открывает. Скачайте файл и откройте во внешнем вьюере.'
            : `Не удалось загрузить GLB: ${msg}`
        );
        setLoading(false);
      }
    );

    const resize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      controlsRef.current = null;
      fitRef.current = () => {};
      const m = modelRef.current;
      modelRef.current = null;
      if (m) {
        scene.remove(m);
        disposeObject(m);
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [url]);

  // Авто-вращение.
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  // Каркас.
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    model.traverse((o) => {
      const mat = (o as unknown as { material?: THREE.Material | THREE.Material[] }).material;
      const apply = (m: THREE.Material) => {
        const mm = m as THREE.MeshStandardMaterial;
        if ('wireframe' in mm) mm.wireframe = wireframe;
      };
      if (Array.isArray(mat)) mat.forEach(apply);
      else if (mat) apply(mat);
    });
  }, [wireframe, loading]);

  const toolbarText = bg.dark ? 'text-slate-200' : 'text-slate-800';
  const toolbarBtn = `p-2 rounded-lg border cursor-pointer transition-colors ${
    bg.dark
      ? 'bg-black/40 border-white/10 hover:bg-black/60 text-slate-200'
      : 'bg-white/60 border-black/10 hover:bg-white/85 text-slate-800'
  }`;

  return createPortal(
    <div className="fixed inset-0 z-[220] bg-black/85 flex items-center justify-center p-3 sm:p-6">
      <div
        className="relative w-full max-w-[1200px] h-full max-h-[860px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col"
        style={bg.style}
      >
        {/* Верхняя панель */}
        <div
          className={`absolute top-0 left-0 right-0 z-10 flex items-center gap-2 px-3 py-2.5 ${
            bg.dark ? 'bg-gradient-to-b from-black/55 to-transparent' : 'bg-gradient-to-b from-white/70 to-transparent'
          }`}
        >
          <Box className={`w-4 h-4 ${bg.dark ? 'text-[#00f2ff]' : 'text-slate-700'}`} />
          <span className={`text-xs font-mono truncate max-w-[38%] ${toolbarText}`}>{name}</span>
          <span className="flex-1" />

          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className={toolbarBtn}
            title={autoRotate ? 'Остановить вращение' : 'Авто-вращение'}
          >
            {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((v) => !v)}
            className={`${toolbarBtn} ${wireframe ? 'ring-1 ring-[#00f2ff]/60' : ''}`}
            title="Показать каркас"
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => fitRef.current()}
            className={toolbarBtn}
            title="Сбросить камеру"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const a = document.createElement('a');
              a.href = url;
              a.download = name || 'model.glb';
              a.click();
            }}
            className={toolbarBtn}
            title="Скачать GLB"
          >
            <Download className="w-4 h-4" />
          </button>
          <button type="button" onClick={onClose} className={toolbarBtn} title="Закрыть (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Канва */}
        <div ref={mountRef} className="flex-1 w-full h-full" />

        {/* Нижняя панель: фон + подсказка */}
        <div
          className={`absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center gap-2 px-3 py-2.5 ${
            bg.dark ? 'bg-gradient-to-t from-black/60 to-transparent' : 'bg-gradient-to-t from-white/75 to-transparent'
          }`}
        >
          <Sun className={`w-3.5 h-3.5 ${bg.dark ? 'text-slate-300' : 'text-slate-700'}`} />
          <span className={`text-[11px] font-mono ${toolbarText}`}>Фон:</span>
          <div className="flex items-center gap-1.5">
            {BG_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setBgId(p.id)}
                title={p.label}
                className={`w-7 h-7 rounded-md border cursor-pointer transition-transform hover:scale-105 ${
                  bgId === p.id
                    ? 'border-[#00f2ff] ring-2 ring-[#00f2ff]/40'
                    : bg.dark
                      ? 'border-white/20'
                      : 'border-black/20'
                }`}
                style={p.style}
              />
            ))}
          </div>
          <span className={`ml-auto text-[10px] font-mono hidden sm:block ${bg.dark ? 'text-slate-400' : 'text-slate-600'}`}>
            ЛКМ — вращать · колесо — зум · ПКМ — сдвиг
          </span>
        </div>

        {/* Статусы */}
        {loading && !error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55">
            <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-[#00f2ff] transition-all"
                style={{ width: `${Math.max(6, progress)}%` }}
              />
            </div>
            <span className="mt-3 text-[11px] font-mono text-slate-300">
              Загрузка модели… {progress}%
            </span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 p-8 text-center">
            <Maximize2 className="w-6 h-6 text-red-400" />
            <p className="text-xs font-mono text-red-300 max-w-md leading-relaxed">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-slate-200 text-xs font-mono cursor-pointer hover:bg-white/20"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
