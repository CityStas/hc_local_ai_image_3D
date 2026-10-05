import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Copy, 
  Check, 
  Brain, 
  ChevronDown, 
  ChevronRight, 
  Volume2, 
  RefreshCw, 
  Zap, 
  Code2, 
  Eye, 
  Play,
  Download,
  ImageIcon,
  Maximize2,
  ZoomIn,
  Scissors,
  Box
} from 'lucide-react';
import { Message, Comfy3dConfig } from '../types';
import { soundEffects } from '../utils/audioSynth';
import { cleanCodeBody, sanitizeModelOutput } from '../utils/sanitizeOutput';
import { upscaleEngineService } from '../services/upscaleEngine';
import { comfyEngineService } from '../services/comfyEngine';

// three.js (~600 кБ) тянем только когда реально открыли 3D-превью — чтобы не
// раздувать стартовый бандл и не грузить его при обычном чате.
const GlbViewer = React.lazy(() =>
  import('./GlbViewer').then((m) => ({ default: m.GlbViewer }))
);

interface MessageItemProps {
  key?: React.Key;
  message: Message;
  isLast: boolean;
  isGenerating: boolean;
  onRegenerate?: () => void;
  soundEnabled: boolean;
  /** Настройки 3D из настроек (воркфлоу/разрешение/шаги/сид). */
  comfy3d?: Comfy3dConfig;
}

export function MessageItem({
  message,
  isLast,
  isGenerating,
  onRegenerate,
  soundEnabled,
  comfy3d,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  const isUser = message.role === 'user';
  const displayImage = message.imageUrl || message.previewUrl;
  const isPreview = !message.imageUrl && !!message.previewUrl;

  // Пока ассистент ещё ничего не выдал — не раздуваем пустой бабл, показываем
  // компактную пилюлю ожидания. Готовое изображение тоже уходит сюда (превью).
  const isWaiting = !isUser && isLast && isGenerating && !message.imageUrl;
  // У ассистента с картинкой отдельный бабл не нужен — описание, метрики и
  // действия живут прямо под картинкой (см. ImageBlock).
  const showBubble = isUser || !message.imageUrl;

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    if (soundEnabled) soundEffects.click();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  if (isWaiting) {
    return (
      <div className="flex flex-col w-full items-start gap-2">
        {displayImage && (
          <ImageBlock
            src={displayImage}
            alt={message.imageMeta?.prompt || 'Изображение'}
            isPreview={isPreview}
            isGenerating
            imageMeta={message.imageMeta}
            imageUrl={message.imageUrl}
            soundEnabled={soundEnabled}
            comfy3d={comfy3d}
          />
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 w-fit">
          <span className="flex items-center gap-1">
            {[0, 150, 300].map((d) => (
              <span
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-[#00f2ff] animate-bounce"
                style={{ animationDelay: `${d}ms`, opacity: 0.6 }}
              />
            ))}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {displayImage ? 'Рисую…' : 'Готовлю ответ…'}
          </span>
        </div>
        {message.thinking && (
          <div className="max-w-[85%] w-full rounded-xl border border-[#7000ff]/20 bg-[#7000ff]/10 overflow-hidden text-xs">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="w-full px-3 py-1.5 flex items-center justify-between bg-[#7000ff]/20 hover:bg-[#7000ff]/30 text-purple-200 font-mono text-[11px] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                <span className="font-semibold">РАССУЖДЕНИЯ</span>
              </div>
              {showThinking ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {showThinking && (
              <div className="p-3 font-mono text-[11px] text-purple-200/90 leading-relaxed whitespace-pre-wrap border-t border-[#7000ff]/15 bg-black/40 select-text max-h-52 overflow-y-auto">
                {message.thinking}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col w-full transition-all duration-200 ${
        isUser ? 'items-end' : 'items-start'
      }`}
    >
      {/* Картинка ВНЕ bubble с backdrop-blur — иначе fixed/lightbox и img ломаются в Electron */}
      {displayImage && (
        <ImageBlock
          src={displayImage}
          alt={message.imageMeta?.prompt || 'Изображение'}
          isPreview={isPreview}
          isGenerating={isLast && isGenerating}
          imageMeta={message.imageMeta}
          imageUrl={message.imageUrl}
          soundEnabled={soundEnabled}
          onRegenerate={!isUser && isLast ? onRegenerate : undefined}
          comfy3d={comfy3d}
        />
      )}

      {showBubble && (
      <div
        className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed transition-all ${
          isUser
            ? 'bg-[#7000ff]/15 border border-[#7000ff]/30 text-white rounded-br-sm shadow-[0_4px_20px_rgba(112,0,255,0.1)]'
            : 'bg-[#0f0f14]/70 border border-white/10 text-slate-200 rounded-bl-sm backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.3)]'
        }`}
      >
        {/* AI Header Label & Telemetry Badge */}
        {!isUser && (
          <div className="flex items-center justify-between gap-3 mb-2 pb-1.5 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-[#00f2ff] text-xs font-bold uppercase tracking-wider font-mono">
                HC AI
              </span>
              {isLast && isGenerating && isPreview && (
                <span className="text-[10px] text-purple-300 font-mono ml-1">превью</span>
              )}
            </div>

            {/* Stats Pill */}
            {(message.speedTps || message.tokensGenerated) && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/5">
                {message.speedTps && (
                  <span className="text-[#00f2ff] flex items-center gap-0.5 font-bold">
                    <Zap className="w-2.5 h-2.5" />
                    {message.speedTps} tok/s
                  </span>
                )}
                {message.ttftMs && <span>{message.ttftMs}ms TTFT</span>}
                {message.tokensGenerated && <span>{message.tokensGenerated} tok</span>}
              </div>
            )}
          </div>
        )}

        {/* User Header */}
        {isUser && (
          <div className="flex items-center justify-end gap-2 mb-1.5 text-[10px] text-purple-300/60 font-mono">
            <span>USER_01</span>
            <span>•</span>
            <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}

        {/* Expandable Thinking Section (<think> block) */}
        {message.thinking && (
          <div className="rounded-xl border border-[#7000ff]/20 bg-[#7000ff]/10 overflow-hidden text-xs my-2">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="w-full px-3 py-1.5 flex items-center justify-between bg-[#7000ff]/20 hover:bg-[#7000ff]/30 text-purple-200 font-mono text-[11px] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                <span className="font-semibold">ЦЕПОЧКА МЫШЛЕНИЯ (REASONING PROCESS)</span>
              </div>
              {showThinking ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            {showThinking && (
              <div className="p-3 font-mono text-[11px] text-purple-200/90 leading-relaxed whitespace-pre-wrap border-t border-[#7000ff]/15 bg-black/40 select-text">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Rendered Text Content */}
        <div className="text-slate-100 text-[14px] leading-relaxed select-text space-y-2.5">
          <FormattedMessageContent content={sanitizeModelOutput(message.content)} soundEnabled={soundEnabled} />
        </div>

        {/* Bottom Action Toolbar for AI */}
        {!isUser && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/5 text-slate-500 text-xs">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.06] hover:text-slate-200 transition-colors cursor-pointer text-[11px] font-mono"
              title="Скопировать ответ"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Скопировано' : 'Копировать'}</span>
            </button>

            <button
              onClick={handleSpeak}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.06] hover:text-slate-200 transition-colors cursor-pointer text-[11px] font-mono"
              title="Озвучить ответ"
            >
              <Volume2 className={`w-3 h-3 ${speaking ? 'text-[#00f2ff]' : ''}`} />
              <span>{speaking ? 'Остановить' : 'Озвучить'}</span>
            </button>

            {onRegenerate && !isGenerating && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/[0.06] hover:text-slate-200 transition-colors cursor-pointer text-[11px] font-mono ml-auto"
                title="Перегенерировать ответ"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Перегенерировать</span>
              </button>
            )}
          </div>
        )}
      </div>
      )}

    </div>
  );
}

function ImageBlock({
  src,
  alt,
  isPreview,
  isGenerating,
  imageMeta,
  imageUrl,
  soundEnabled,
  onRegenerate,
  comfy3d,
}: {
  src: string;
  alt: string;
  isPreview: boolean;
  isGenerating: boolean;
  imageMeta?: Message['imageMeta'];
  imageUrl?: string;
  soundEnabled: boolean;
  /** Перегенерировать — кнопка переезжает из бабла сюда. */
  onRegenerate?: () => void;
  /** Настройки 3D из настроек. */
  comfy3d?: Comfy3dConfig;
}) {
  const [broken, setBroken] = useState(false);
  const [copied, setCopied] = useState(false);
  // Лайтбокс живёт здесь, а не в MessageItem: он обязан показывать АКТИВНЫЙ
  // вариант (после удаления фона — без фона), а не исходный src сообщения.
  const [lightbox, setLightbox] = useState(false);
  // Активный вариант из галереи: 'orig' | 'nobg' | 'up4' | '3d'.
  const [activeKey, setActiveKey] = useState('orig');
  const [upscaling, setUpscaling] = useState(false);
  const [upscalePct, setUpscalePct] = useState(0);
  const [upscaleErr, setUpscaleErr] = useState<string | null>(null);
  const [upscaledUrl, setUpscaledUrl] = useState<string | null>(null);

  // ComfyUI-операции: удаление фона (birefnet → альфа) и image-to-3D (Trellis2 → GLB).
  const [bgBusy, setBgBusy] = useState(false);
  const [bgPct, setBgPct] = useState(0);
  const [bgErr, setBgErr] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [d3Busy, setD3Busy] = useState(false);
  const [d3Pct, setD3Pct] = useState(0);
  const [d3Err, setD3Err] = useState<string | null>(null);
  const [d3Url, setD3Url] = useState<string | null>(null);
  const [d3Name, setD3Name] = useState<string>('model.glb');
  const [viewer3d, setViewer3d] = useState(false);
  const comfyBusy = bgBusy || d3Busy;
  const comfyPct = bgBusy ? bgPct : d3Pct;

  useEffect(() => {
    setBroken(false);
    setUpscaledUrl(null);
    setUpscaleErr(null);
    setBgUrl(null);
    setBgErr(null);
    setD3Url((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setD3Err(null);
    setViewer3d(false);
    setActiveKey('orig');
  }, [src]);

  // Галерея вариантов: всё, что получилось из этого изображения. Активный вариант
  // уходит и в лайтбокс, и в инструменты — апскейл/удаление фона/3D работают с ним.
  type ImgVariant = { key: string; label: string; src: string; kind: 'image' | 'model'; name?: string };
  const variants: ImgVariant[] = [
    { key: 'orig', label: 'Оригинал', src, kind: 'image' },
    ...(bgUrl ? [{ key: 'nobg', label: 'Без фона', src: bgUrl, kind: 'image' as const }] : []),
    ...(upscaledUrl ? [{ key: 'up4', label: '×4', src: upscaledUrl, kind: 'image' as const }] : []),
    ...(d3Url ? [{ key: '3d', label: '3D', src: d3Url, kind: 'model' as const, name: d3Name }] : []),
  ];
  const activeVariant = variants.find((v) => v.key === activeKey) ?? variants[0];
  const displaySrc = activeVariant.kind === 'image' ? activeVariant.src : src;

  const handleCopy = () => {
    navigator.clipboard.writeText(
      imageMeta?.promptEn || imageMeta?.prompt || ''
    );
    setCopied(true);
    if (soundEnabled) soundEffects.click();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpscale = async () => {
    if (upscaling || isPreview || isGenerating) return;
    setUpscaling(true);
    setUpscalePct(0);
    setUpscaleErr(null);
    try {
      const result = await upscaleEngineService.upscale(src, {
        onProgress: (p) => setUpscalePct(p),
      });
      setUpscaledUrl(result.dataUrl);
      setActiveKey('up4');
      if (soundEnabled) soundEffects.modelLoaded?.();
    } catch (e: any) {
      setUpscaleErr(String(e?.message || e));
      console.error('[upscale]', e);
    } finally {
      setUpscaling(false);
      // Иначе кнопка навсегда остаётся disabled: `disabled={upscaling || upscalePct > 0}`.
      setUpscalePct(0);
    }
  };

  const handleRemoveBg = async () => {
    if (comfyBusy || isPreview || isGenerating) return;
    setBgBusy(true);
    setBgPct(0);
    setBgErr(null);
    try {
      const url = await comfyEngineService.removeBackground(displaySrc, (p) =>
        setBgPct(typeof p.progress === 'number' ? p.progress : 0)
      );
      setBgUrl(url);
      setActiveKey('nobg');
      if (soundEnabled) soundEffects.modelLoaded?.();
    } catch (e: any) {
      setBgErr(String(e?.message || e));
      console.error('[comfy/bg]', e);
    } finally {
      setBgBusy(false);
    }
  };

  const handle3D = async () => {
    if (comfyBusy || isPreview || isGenerating) return;
    setD3Busy(true);
    setD3Pct(0);
    setD3Err(null);
    try {
      const r = await comfyEngineService.imageTo3D(displaySrc, {
        workflowId: comfy3d?.workflowId,
        resolution: comfy3d?.resolution,
        steps: comfy3d?.steps,
        seed: comfy3d?.seed,
        removeBgFirst: comfy3d?.removeBgFirst,
        // Имя файла — из промпта, а не ComfyUI_TripoSplat_00011_.
        nameBase: imageMeta?.promptEn || imageMeta?.prompt || 'hc-3d',
        onProgress: (p) => setD3Pct(typeof p.progress === 'number' ? p.progress : 0),
      });
      if (!r.objectUrl) throw new Error('Модель не получена');
      setD3Url((prev) => { if (prev) URL.revokeObjectURL(prev); return r.objectUrl; });
      setD3Name(r.name);
      setViewer3d(true);
      if (soundEnabled) soundEffects.modelLoaded?.();
    } catch (e: any) {
      setD3Err(String(e?.message || e));
      console.error('[comfy/3d]', e);
    } finally {
      setD3Busy(false);
    }
  };

  return (
    <div className="max-w-[min(100%,640px)] w-full mb-2 rounded-xl border border-purple-500/25 bg-[#0a0a0f] overflow-hidden shadow-lg">
      <div className="relative group">
        {!broken ? (
          <img
            src={displaySrc}
            alt={alt}
            decoding="async"
            className={`block w-full h-auto max-h-[560px] object-contain bg-[#0a0a0f] cursor-zoom-in ${
              isPreview ? 'opacity-95 ring-1 ring-purple-400/30' : ''
            } ${isGenerating && !isPreview ? 'opacity-90' : ''}`}
            onClick={() => setLightbox(true)}
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="p-6 text-center text-slate-400 text-xs font-mono">
            Не удалось показать превью — скачайте PNG
          </div>
        )}
        {isPreview && (
          <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-purple-200 border border-purple-400/30">
            превью · формируется...
          </span>
        )}
        {/* Оверлей прогресса: апскейл / удаление фона / 3D */}
        {(upscaling || comfyBusy) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-44 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all ${comfyBusy ? 'bg-purple-400' : 'bg-[#00f2ff]'}`}
                style={{ width: `${Math.max(4, upscaling ? upscalePct : comfyPct)}%` }}
              />
            </div>
            <span className={`mt-2 text-[11px] font-mono ${comfyBusy ? 'text-purple-300' : 'text-[#00f2ff]'}`}>
              {upscaling
                ? `Апскейл ×4 · ${upscalePct}%`
                : bgBusy
                  ? `Удаление фона · ${bgPct}%`
                  : `3D-генерация · ${d3Pct}%`}
            </span>
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="p-1.5 rounded-lg bg-black/70 border border-white/10 text-slate-200 hover:text-white cursor-pointer"
            title={`Открыть на весь экран (${activeVariant.label})`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={() => {
                const a = document.createElement('a');
                a.href = displaySrc;
                a.download = `hc-ai-${activeVariant.key}-${Date.now()}.png`;
                a.click();
                if (soundEnabled) soundEffects.click();
              }}
              className="p-1.5 rounded-lg bg-black/70 border border-white/10 text-slate-200 hover:text-white cursor-pointer"
              title="Скачать PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Панель действий — всегда видима, не зависит от hover */}
      {!isPreview && !isGenerating && (
        <div className="px-3 py-2 border-t border-white/5 space-y-2">
          {/* Ряд инструментов. Состав фиксирован — результат 3D выносится
              отдельной плашкой ниже, чтобы «Копировать»/«Перегенерировать» не съезжали. */}
          <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleUpscale}
            disabled={upscaling || upscalePct > 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono cursor-pointer transition-colors ${
              upscaledUrl
                ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'
                : 'bg-[#00f2ff]/10 border border-[#00f2ff]/40 text-[#00f2ff] hover:bg-[#00f2ff]/20'
            }${upscaling ? ' disabled:opacity-60 cursor-wait' : ''}`}
            title="Увеличить изображение ×4 и убрать шум (Real-ESRGAN)"
          >
            {upscaling ? (
              <span>{upscalePct}%</span>
            ) : upscaledUrl ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <ZoomIn className="w-3.5 h-3.5" />
            )}
            <span>{upscaling ? 'Увеличиваю…' : upscaledUrl ? 'Увеличено ×4' : 'Увеличить ×4'}</span>
          </button>
          <button
            type="button"
            onClick={handleRemoveBg}
            disabled={comfyBusy || !!bgUrl}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono cursor-pointer transition-colors ${
              bgUrl
                ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'
                : 'bg-purple-500/10 border border-purple-400/40 text-purple-200 hover:bg-purple-500/20'
            }${bgBusy ? ' disabled:opacity-60 cursor-wait' : ''}`}
            title="Убрать фон нейросетью (birefnet) → PNG с прозрачностью"
          >
            {bgBusy ? (
              <span>{bgPct}%</span>
            ) : bgUrl ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Scissors className="w-3.5 h-3.5" />
            )}
            <span>{bgBusy ? 'Убираю фон…' : bgUrl ? 'Фон убран' : 'Убрать фон'}</span>
          </button>
          <button
            type="button"
            onClick={handle3D}
            disabled={comfyBusy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono cursor-pointer transition-colors ${
              d3Url
                ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-300'
                : 'bg-purple-500/10 border border-purple-400/40 text-purple-200 hover:bg-purple-500/20'
            }${d3Busy ? ' disabled:opacity-60 cursor-wait' : ''}`}
            title="Сгенерировать 3D-модель из картинки (Trellis2 → GLB)"
          >
            {d3Busy ? (
              <span>{d3Pct}%</span>
            ) : d3Url ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Box className="w-3.5 h-3.5" />
            )}
            <span>{d3Busy ? 'Генерирую 3D…' : d3Url ? '3D готово' : 'В 3D'}</span>
          </button>
          {upscaledUrl && (
            <span className="text-[10px] font-mono text-slate-400">Результат показан вверху</span>
          )}
          </div>

          {/* Результат 3D — отдельная плашка под рядом инструментов. */}
          {d3Url && (
            <div className="flex items-center gap-2 flex-wrap rounded-lg border border-purple-400/25 bg-purple-500/[0.07] px-2 py-1.5">
              <span
                className="flex items-center gap-1.5 text-[10px] font-mono text-purple-300 max-w-[190px] mr-0.5"
                title={d3Name}
              >
                <Box className="w-3 h-3 shrink-0" />
                <span className="truncate">{d3Name}</span>
              </span>
              <button
                type="button"
                onClick={() => setViewer3d(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono bg-purple-500/15 border border-purple-400/40 text-purple-200 hover:bg-purple-500/25 cursor-pointer"
                title="Открыть 3D-превью (вращение, фон, каркас)"
              >
                <Box className="w-3.5 h-3.5" />
                <span>Открыть 3D</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = d3Url;
                  a.download = d3Name;
                  a.click();
                  if (soundEnabled) soundEffects.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono bg-black/40 border border-white/10 text-slate-200 hover:text-white cursor-pointer"
                title={`Скачать ${d3Name}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать</span>
              </button>
            </div>
          )}

        </div>
      )}
      {(bgErr || d3Err) && (
        <div className="px-3 py-2 text-[10px] font-mono text-red-400 bg-red-500/10 border-t border-red-500/20">
          {bgErr ? `Удаление фона не удалось: ${bgErr}` : `3D-генерация не удалась: ${d3Err}`}
        </div>
      )}
      {upscaleErr && (
        <div className="px-3 py-2 text-[10px] font-mono text-red-400 bg-red-500/10 border-t border-red-500/20">
          Апскейл не удался: {upscaleErr}
        </div>
      )}
      {/* История вариантов: оригинал / без фона / ×4 / 3D. Активный вариант —
          то, что показано вверху и с чем работают инструменты и лайтбокс. */}
      {!isPreview && !isGenerating && variants.length > 1 && (
        <div className="px-3 py-2 border-t border-white/5">
          <div className="text-[10px] font-mono text-slate-500 mb-1.5">
            Варианты · {variants.length}
            <span className="text-slate-600"> — выберите, чтобы работать с ним</span>
          </div>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {variants.map((v) => {
              const active = v.kind === 'image' && v.key === activeVariant.key;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    if (soundEnabled) soundEffects.click();
                    if (v.kind === 'model') setViewer3d(true);
                    else setActiveKey(v.key);
                  }}
                  className={`shrink-0 w-[78px] rounded-lg border overflow-hidden text-left cursor-pointer transition-colors ${
                    active
                      ? 'border-[#00f2ff]/60 bg-[#00f2ff]/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                  }`}
                  title={v.kind === 'model' ? `Открыть 3D · ${v.name || ''}` : `Показать: ${v.label}`}
                >
                  <span
                    className="w-full h-[58px] flex items-center justify-center overflow-hidden"
                    style={{
                      backgroundImage: 'repeating-conic-gradient(#242428 0% 25%, #16161a 0% 50%)',
                      backgroundSize: '12px 12px',
                    }}
                  >
                    {v.kind === 'image' ? (
                      <img src={v.src} alt={v.label} className="w-full h-full object-contain" />
                    ) : (
                      <Box className="w-5 h-5 text-purple-300" />
                    )}
                  </span>
                  <span
                    className={`block px-1.5 py-1 text-[10px] font-mono truncate ${
                      active ? 'text-[#00f2ff]' : 'text-slate-400'
                    }`}
                  >
                    {v.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {imageMeta && (
        <div className="px-3 py-2 text-[10px] font-mono text-slate-500 border-t border-white/5 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-purple-300 flex items-center gap-0.5 font-bold">
              <ImageIcon className="w-2.5 h-2.5" />
              {imageMeta.width}×{imageMeta.height}
            </span>
            <span className="text-slate-300">{Math.round(imageMeta.elapsedMs / 1000)} с</span>
            <span>{imageMeta.steps} steps · CFG {imageMeta.cfg}</span>
            {imageMeta.seed >= 0 && <span>seed {imageMeta.seed}</span>}
            {upscaledUrl && <span className="text-[#00f2ff]">увеличено ×4</span>}
            {bgUrl && <span className="text-purple-300">фон убран</span>}
          </div>
          {imageMeta.promptEn && (
            <div className="text-slate-400 normal-case leading-snug">{imageMeta.promptEn}</div>
          )}
        </div>
      )}
      {/* Копировать / Перегенерировать — самый низ панели, ПОД текстом промпта. */}
      {!isPreview && !isGenerating && (
        <div className="px-3 py-2 border-t border-white/5 flex items-center gap-2">
          <span className="flex-1" />
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono bg-white/[0.04] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08] cursor-pointer transition-colors"
            title="Скопировать промпт"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono bg-white/[0.04] border border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08] cursor-pointer transition-colors"
              title="Перегенерировать изображение"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Перегенерировать</span>
            </button>
          )}
        </div>
      )}
      {viewer3d && d3Url && (
        <React.Suspense
          fallback={
            <div className="fixed inset-0 z-[220] bg-black/85 flex items-center justify-center">
              <span className="text-[11px] font-mono text-slate-300">Загружаю просмотрщик…</span>
            </div>
          }
        >
          <GlbViewer url={d3Url} name={d3Name} onClose={() => setViewer3d(false)} />
        </React.Suspense>
      )}
      {/* Лайтбокс показывает активный вариант, а не исходный src — иначе после
          удаления фона лупа открывала картинку С фоном. */}
      {lightbox && <ImageLightbox src={displaySrc} onClose={() => setLightbox(false)} />}
    </div>
  );
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/92 flex items-center justify-center p-4 sm:p-8 cursor-zoom-out"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <img
        src={src}
        alt=""
        className="max-w-[min(96vw,1400px)] max-h-[92vh] w-auto h-auto object-contain shadow-2xl rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

function FormattedMessageContent({ content, soundEnabled }: { content: string; soundEnabled: boolean }) {
  // Parse code blocks with regex
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('```')) {
          const firstLineEnd = part.indexOf('\n');
          const lang = part.slice(3, firstLineEnd).trim() || 'code';
          // Закрытый блок: режем ``` в конце; незакрытый (стриминг/обрыв) — код до конца текста.
          const closed = part.endsWith('```');
          const code = closed ? part.slice(firstLineEnd + 1, -3) : part.slice(firstLineEnd + 1);

          if (!code.trim()) {
            return (
              <p key={idx} className="text-slate-500 text-xs font-mono italic">
                [блок кода пуст — попробуйте «Перегенерировать» или персону «Программист»]
              </p>
            );
          }

          return <CodeSnippet key={idx} lang={lang} code={cleanCodeBody(code, lang)} soundEnabled={soundEnabled} />;
        }

        // Parse standard text lines & headers
        return (
          <div key={idx} className="whitespace-pre-wrap font-sans">
            {renderMarkdownText(part)}
          </div>
        );
      })}
    </>
  );
}

function CodeSnippet({ lang, code, soundEnabled }: { key?: React.Key; lang: string; code: string; soundEnabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    if (soundEnabled) soundEffects.click();
    setTimeout(() => setCopied(false), 2000);
  };

  const isHtml = lang === 'html' || lang === 'xml';

  return (
    <div className="my-3 rounded-xl border border-white/10 bg-[#090b10] overflow-hidden shadow-lg">
      {/* Code Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.03] border-b border-white/10 text-xs font-mono">
        <div className="flex items-center gap-2 text-[#00f2ff]">
          <Code2 className="w-3.5 h-3.5" />
          <span className="uppercase text-[11px] font-bold">{lang}</span>
        </div>

        <div className="flex items-center gap-2">
          {isHtml && (
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#00f2ff]/10 border border-[#00f2ff]/30 text-[#00f2ff] text-[10px] hover:bg-[#00f2ff]/20 cursor-pointer"
            >
              <Eye className="w-3 h-3" />
              <span>{showPreview ? 'Код' : 'Превью'}</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-200 text-[11px] transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Скопировано' : 'Копировать'}</span>
          </button>
        </div>
      </div>

      {/* Code Body or Live Preview */}
      {showPreview && isHtml ? (
        <div className="p-4 bg-white rounded-b-xl">
          <iframe
            srcDoc={code}
            title="HTML Preview"
            className="w-full min-h-[220px] border-0"
            sandbox="allow-scripts"
          />
        </div>
      ) : (
        <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed selection:bg-[#00f2ff]/30">
          <code>{highlightCode(lang, code)}</code>
        </pre>
      )}
    </div>
  );
}

function renderMarkdownText(text: string) {
  // Simple markdown renderer for bold, list, and headers
  const lines = text.split('\n');

  return lines.map((line, lIdx) => {
    if (line.startsWith('### ')) {
      return (
        <h3 key={lIdx} className="text-base font-bold text-[#00f2ff] mt-3 mb-1 font-['Syne']">
          {line.replace('### ', '')}
        </h3>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={lIdx} className="text-lg font-bold text-white mt-4 mb-2 font-['Syne']">
          {line.replace('## ', '')}
        </h2>
      );
    }
    if (line.startsWith('#### ')) {
      return (
        <h4 key={lIdx} className="text-sm font-semibold text-slate-200 mt-2 mb-1">
          {line.replace('#### ', '')}
        </h4>
      );
    }
    if (line.startsWith('* ') || line.startsWith('- ')) {
      return (
        <div key={lIdx} className="flex items-start gap-2 my-1 pl-1">
          <span className="text-slate-500 mt-0.5 shrink-0">–</span>
          <span>{renderInlineFormatting(line.slice(2))}</span>
        </div>
      );
    }

    return (
      <p key={lIdx} className={line.trim() === '' ? 'h-2' : 'my-1'}>
        {renderInlineFormatting(line)}
      </p>
    );
  });
}

function renderInlineFormatting(text: string) {
  // Replace **bold** and `code`
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[#00f2ff] font-mono text-xs border border-white/10">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
// Лёгкая подсветка синтаксиса без внешних зависимостей.
// Определяет язык и раскрашивает ключевые слова, строки, комментарии, числа, теги.
const HIGHLIGHT_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch',
  'case', 'break', 'continue', 'import', 'export', 'from', 'default', 'new', 'class',
  'extends', 'super', 'async', 'await', 'try', 'catch', 'finally', 'typeof', 'instanceof',
  'in', 'of', 'this', 'null', 'undefined', 'true', 'false', 'package', 'interface', 'type',
  'enum', 'public', 'private', 'protected', 'static', 'readonly',
]);

// Цвета темы (тёмная).
const C = {
  str: '#a5d6ff',      // строки
  num: '#f9c74f',      // числа
  kw: '#00f2ff',       // ключевые слова (циан)
  comment: '#7d8590',  // комментарии
  tag: '#f07178',      // html-теги
  attr: '#82aaff',     // html-атрибуты
  css: '#c792ea',      // css-селекторы/свойства
  fn: '#82aaff',       // функции
  punct: '#9aa5b1',    // пунктуация
};

function tok(text: string, color?: string, className?: string) {
  return <span key={text + (Math.random() * 1e7 | 0)} className={className || ''} style={color ? { color } : undefined}>{text}</span>;
}

function highlightCode(lang, raw) {
  const code = String(raw || '');
  const lines = code.split('\n');

  const renderLine = (line: string, lineIdx: number) => {
    const lineNo = lineIdx + 1;
    const html = lang === 'html' || lang === 'xml' || lang === 'markup'
      ? highlightHtml(line)
      : lang === 'css'
      ? highlightCss(line)
      : highlightJs(line, lang);

    return (
      <div key={lineIdx} className="flex">
        <span className="select-none text-right pr-3 text-slate-600 w-8 shrink-0">{lineNo}</span>
        <span className="whitespace-pre">{html}</span>
      </div>
    );
  };

  return (
    <div className="space-y-0">
      {code.split('\n').map((l, i) => renderLine(l, i))}
    </div>
  );
}

function highlightJs(line, lang) {
  const parts = [];
  // комментарии
  const commentMatch = line.match(/^(\s*)(\/\/.*|\/\*[\s\S]*)$/);
  if (commentMatch && !line.includes('"') && !line.includes("'")) {
    return tok(commentMatch[1] + commentMatch[2], C.comment);
  }
  // строки
  const strRe = /("[^"]*"|'[^']*'|`[^`]*`)/g;
  let lastIdx = 0;
  let m;
  const out = [];
  while ((m = strRe.exec(line)) !== null) {
    if (m.index > lastIdx) {
      const pre = line.slice(lastIdx, m.index);
      if (pre.trim()) out.push(tok(pre, undefined, ''));
      else if (pre) out.push(tok(pre, undefined, ''));
    }
    out.push(tok(m[0], C.num));
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < line.length) out.push(tok(line.slice(lastIdx), undefined, ''));

  // keywords, numbers, function calls
  const final = [];
  for (let i = 0; i < out.length; i++) {
    let el = out[i];
    if (el.props.style === undefined) {
      const words = String(el.props.children || '').split(/([^\w\s])/g);
      final.push(...words.map((w) => {
        if (!w) return '';
        if (HIGHLIGHT_KEYWORDS.has(w)) return tok(w, C.kw);
        if (/^\d+(\.\d+)?$/.test(w)) return tok(w, C.num);
        return w;
      }));
    } else {
      final.push(el);
    }
  }
  return (
    <>{final}</>
  );
}

function highlightCss(line) {
  const out = [];
  const re = /(\{|\}|\;|\:)|([a-zA-Z-]+)(?=\s*:)|(#[0-9a-fA-F]{3,8})|(--?[a-zA-Z][\w-]*)/g;
  // Упрощённо: свойства с двоеточием, селекторы, hex-цвета
  const inComment = line.includes('/*');
  let cursor = 0;
  let m;
  const re2 = /(".*?"|'[^']*'|\/\*[\s\S]*?\*\/|#[0-9a-fA-F]{3,8}|\b\d+(?:\.\d+)?(?:px|em|rem|%)?\b|([\w-]+)\s*:|\{|\})/g;
  const seg = [];
  while ((m = re2.exec(line)) !== null) {
    if (m.index > cursor) seg.push(tok(line.slice(cursor, m.index), undefined, ''));
    const t = m[0];
    if (t.includes('#')  || /^\d/.test(t)|| t.includes('/*')) {
      seg.push(tok(t, t.includes('#') || /^\d/.test(t) ? C.num : C.comment));
    } else if (t.includes(':')) {
      seg.push(tok(t.replace(':',''), C.css));
    } else seg.push(tok(t, undefined, ''));
    cursor = m.index + t.length;
  }
  if (cursor < line.length) seg.push(tok(line.slice(cursor), undefined, ''));
  return <>{seg}</>;
}

function highlightHtml(line) {
  const out = [];
  const re = /(<\/?)([\w-]+)|([\w-]+)\s?=|("[^"]*")|(&[a-z]+;|\s*\/>|>)/g;
  let cursor = 0;
  let m;
  const seg = [];
  while ((m = re.exec(line)) !== null) {
    if (m.index > cursor) seg.push(tok(line.slice(cursor, m.index), undefined, ''));
    if (m[2]) seg.push(tok(m[1] + m[2], C.tag));
    else if (m[3]) seg.push(tok(m[3], C.attr));
    else if (m[4]) seg.push(tok(m[4], C.num));
    else seg.push(tok(m[0], C.tag));
    cursor = m.index + m[0].length;
  }
  if (cursor < line.length) seg.push(tok(line.slice(cursor), undefined, ''));
  return <>{seg}</>;
}
