import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cuboid,
  Images,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { resolveGalleryImageUrl } from '../data/localImages';
import { FurnitureCategory, GalleryProject, Language } from '../types/furniture';

interface GallerySlideshowModalProps {
  open: boolean;
  lang: Language;
  items: GalleryProject[];
  initialIndex?: number;
  slideIntervalSec?: number;
  companyName: string;
  onClose: () => void;
  onLoadIn3D?: (presetId: string, category: FurnitureCategory) => void;
}

const MOTION_VARIANT_COUNT = 5;
const FADE_SETTLE_MS = 1000;

const CATEGORY_LABELS: Record<FurnitureCategory, { bg: string; en: string }> = {
  kitchen: { bg: 'Кухня', en: 'Kitchen' },
  wardrobe: { bg: 'Гардероб', en: 'Wardrobe' },
  dresser: { bg: 'Скрин', en: 'Dresser' },
  living: { bg: 'Хол и ТВ', en: 'Living & TV' },
  hallway: { bg: 'Антре', en: 'Hallway' },
  office: { bg: 'Офис', en: 'Office' },
};

export const GallerySlideshowModal: React.FC<GallerySlideshowModalProps> = ({
  open,
  lang,
  items,
  initialIndex = 0,
  slideIntervalSec = 5,
  companyName,
  onClose,
  onLoadIn3D,
}) => {
  const orderedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        return ao - bo;
      }),
    [items],
  );

  const clampedIntervalSec = useMemo(
    () => Math.min(12, Math.max(3, Math.round(slideIntervalSec || 5))),
    [slideIntervalSec],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [slideVariants, setSlideVariants] = useState<Record<number, number>>({ 0: 0 });
  const [isPlaying, setIsPlaying] = useState(true);
  const motionStepRef = useRef(0);
  const outgoingTimerRef = useRef<number | null>(null);

  const transitionToSlide = useCallback(
    (nextIndex: number) => {
      if (orderedItems.length === 0) return;
      const safeNext = ((nextIndex % orderedItems.length) + orderedItems.length) % orderedItems.length;
      setCurrentIndex((prevIdx) => {
        if (prevIdx === safeNext) return prevIdx;
        motionStepRef.current = (motionStepRef.current + 1) % MOTION_VARIANT_COUNT;
        const assignedVariant = motionStepRef.current;
        setSlideVariants((prevMap) => ({
          ...prevMap,
          [safeNext]: assignedVariant,
        }));
        setOutgoingIndex(prevIdx);
        if (outgoingTimerRef.current !== null) {
          window.clearTimeout(outgoingTimerRef.current);
        }
        outgoingTimerRef.current = window.setTimeout(() => {
          setOutgoingIndex(null);
          outgoingTimerRef.current = null;
        }, FADE_SETTLE_MS);
        return safeNext;
      });
    },
    [orderedItems.length],
  );

  useEffect(() => {
    if (!open) {
      if (outgoingTimerRef.current !== null) {
        window.clearTimeout(outgoingTimerRef.current);
        outgoingTimerRef.current = null;
      }
      setOutgoingIndex(null);
      return;
    }
    const safeIdx =
      orderedItems.length > 0
        ? Math.max(0, Math.min(initialIndex, orderedItems.length - 1))
        : 0;
    motionStepRef.current = safeIdx % MOTION_VARIANT_COUNT;
    setCurrentIndex(safeIdx);
    setOutgoingIndex(null);
    setSlideVariants({ [safeIdx]: motionStepRef.current });
    setIsPlaying(true);
  }, [open, initialIndex, orderedItems.length]);

  useEffect(() => {
    if (orderedItems.length === 0) {
      setCurrentIndex(0);
      setOutgoingIndex(null);
      return;
    }
    if (currentIndex >= orderedItems.length) {
      setCurrentIndex(orderedItems.length - 1);
      setOutgoingIndex(null);
    }
  }, [orderedItems.length, currentIndex]);

  useEffect(() => {
    if (!open || !isPlaying || orderedItems.length <= 1) return;
    const timer = window.setInterval(() => {
      transitionToSlide(currentIndex + 1);
    }, clampedIntervalSec * 1000);
    return () => window.clearInterval(timer);
  }, [open, isPlaying, orderedItems.length, clampedIntervalSec, currentIndex, transitionToSlide]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && orderedItems.length > 1) {
        e.preventDefault();
        transitionToSlide(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && orderedItems.length > 1) {
        e.preventDefault();
        transitionToSlide(currentIndex + 1);
      } else if (e.key === ' ' && orderedItems.length > 1) {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, orderedItems.length, currentIndex, transitionToSlide, onClose]);

  if (!open) return null;

  const total = orderedItems.length;
  const activeItem = total > 0 ? orderedItems[currentIndex] || orderedItems[0] : null;
  const categoryText = activeItem
    ? lang === 'bg'
      ? CATEGORY_LABELS[activeItem.category]?.bg || activeItem.category
      : CATEGORY_LABELS[activeItem.category]?.en || activeItem.category
    : '';

  const motionDurationMs = clampedIntervalSec * 1000 + 1200;

  const goPrev = () => {
    if (total <= 1) return;
    transitionToSlide(currentIndex - 1);
  };

  const goNext = () => {
    if (total <= 1) return;
    transitionToSlide(currentIndex + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'bg' ? 'Обща слайд-галерия' : 'Slideshow Gallery'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06070A]/92 backdrop-blur-md p-2 sm:p-5"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl max-h-[95vh] flex-col overflow-hidden rounded-2xl border border-[#C59B57]/40 bg-[#0E1015] text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90 bg-[#0B0C10] px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C59B57]/40 bg-[#151821] text-[#E5C17B] shrink-0">
              <Images className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm sm:text-base font-bold text-[#E5C17B] truncate">
                {lang === 'bg' ? 'Обща галерия с реализации' : 'Project Gallery Slideshow'}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                {companyName}
                {total > 0 && (
                  <>
                    {' · '}
                    <span className="font-mono-tabular text-zinc-200 font-semibold">
                      {lang === 'bg'
                        ? `Снимка ${currentIndex + 1} от ${total}`
                        : `Photo ${currentIndex + 1} of ${total}`}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {total > 1 && (
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C59B57]/55 bg-[#151821] px-3 py-1.5 text-xs font-semibold text-[#E5C17B] hover:bg-[#1E2330] transition-colors"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    <span>{lang === 'bg' ? 'Пауза' : 'Pause'}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    <span>{lang === 'bg' ? 'Продължи' : 'Resume'}</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={lang === 'bg' ? 'Затвори' : 'Close'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-[#161922] px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-[#C59B57] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">{lang === 'bg' ? 'Затвори' : 'Close'}</span>
            </button>
          </div>
        </div>

        {/* Main Slide Viewport with Alternating Smooth Directional & Ken Burns Motion */}
        <div
          className="relative flex-1 min-h-[280px] sm:min-h-[420px] md:min-h-[480px] bg-[#07080B] overflow-hidden"
          style={{ ['--slide-motion-dur' as string]: `${motionDurationMs}ms` }}
        >
          {total === 0 ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <Images className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm font-medium text-zinc-300">
                {lang === 'bg'
                  ? 'В момента няма качени снимки в галерията.'
                  : 'No photos in the gallery yet.'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {lang === 'bg'
                  ? 'Можете да качите снимки от Админ панела → таб „Галерия“.'
                  : 'Add photos from the Admin panel → Gallery tab.'}
              </p>
            </div>
          ) : (
            <>
              {orderedItems.map((slide, idx) => {
                const isActive = idx === currentIndex;
                const isOutgoing = idx === outgoingIndex;
                const shouldAnimate = isActive || isOutgoing;
                const variantIdx = slideVariants[idx] ?? idx % MOTION_VARIANT_COUNT;
                return (
                  <div
                    key={slide.id}
                    aria-hidden={!isActive}
                    className={`absolute inset-0 flex items-center justify-center overflow-hidden transition-opacity duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      isActive
                        ? 'opacity-100 z-20'
                        : isOutgoing
                          ? 'opacity-0 z-10 pointer-events-none'
                          : 'opacity-0 z-0 pointer-events-none'
                    }`}
                  >
                    <img
                      src={resolveGalleryImageUrl(slide.imageUrl)}
                      alt={lang === 'bg' ? slide.titleBg : slide.titleEn}
                      referrerPolicy="no-referrer"
                      className={`h-full w-full object-contain select-none will-change-transform ${
                        shouldAnimate ? `gallery-slide-motion-${variantIdx}` : ''
                      }`}
                    />
                  </div>
                );
              })}

              {/* Subtle Bottom Scrim for Legibility */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 z-20 bg-gradient-to-t from-[#0B0C10]/90 via-[#0B0C10]/40 to-transparent"
              />

              {/* Slide Counter Badge Top-Left */}
              <div className="pointer-events-none absolute top-3 left-3 z-30 rounded-lg border border-white/15 bg-black/65 backdrop-blur-sm px-3 py-1 font-mono-tabular text-xs font-semibold text-white">
                {lang === 'bg'
                  ? `Снимка ${currentIndex + 1} от ${total}`
                  : `Photo ${currentIndex + 1} of ${total}`}
              </div>

              {/* Left / Right Overlay Arrow Buttons */}
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label={lang === 'bg' ? 'Предишна снимка' : 'Previous photo'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-30 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-[#C59B57]/45 bg-black/65 backdrop-blur-sm text-white hover:border-[#E5C17B] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all shadow-lg"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label={lang === 'bg' ? 'Следваща снимка' : 'Next photo'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-[#C59B57]/45 bg-black/65 backdrop-blur-sm text-white hover:border-[#E5C17B] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all shadow-lg"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer Info, Controls & Thumbnails */}
        {activeItem && (
          <div className="border-t border-zinc-800/90 bg-[#0B0C10] px-4 sm:px-6 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#C59B57]">
                  <span>{categoryText}</span>
                  {activeItem.dimensionsLabel && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="font-mono-tabular text-zinc-300 normal-case">
                        {activeItem.dimensionsLabel}
                      </span>
                    </>
                  )}
                  {activeItem.materialsLabel && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-400 normal-case font-normal">
                        {activeItem.materialsLabel}
                      </span>
                    </>
                  )}
                </div>
                <h3 className="mt-0.5 font-display text-base sm:text-lg font-bold text-white truncate">
                  {lang === 'bg' ? activeItem.titleBg : activeItem.titleEn}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {total > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={goPrev}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-[#151821] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-[#C59B57] hover:text-[#E5C17B] transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>{lang === 'bg' ? 'Предишна' : 'Previous'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#C59B57]/55 bg-[#151821] px-3 py-2 text-xs font-semibold text-[#E5C17B] hover:bg-[#1E2330] transition-colors"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="h-3.5 w-3.5" />
                          <span>{lang === 'bg' ? 'Пауза' : 'Pause'}</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          <span>{lang === 'bg' ? 'Продължи' : 'Resume'}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-[#151821] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-[#C59B57] hover:text-[#E5C17B] transition-colors"
                    >
                      <span>{lang === 'bg' ? 'Следваща' : 'Next'}</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {activeItem.presetId && onLoadIn3D && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLoadIn3D(activeItem.presetId, activeItem.category);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#C59B57] px-3.5 py-2 text-xs font-bold text-[#0B0C10] hover:bg-[#D8B06E] transition-colors"
                  >
                    <Cuboid className="h-3.5 w-3.5" />
                    <span>{lang === 'bg' ? 'Адаптирай в 3D' : 'Adapt in 3D'} →</span>
                  </button>
                )}
              </div>
            </div>

            {/* Thumbnail Strip for Quick Jump */}
            {total > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5">
                {orderedItems.map((thumb, idx) => {
                  const selected = idx === currentIndex;
                  return (
                    <button
                      key={thumb.id}
                      type="button"
                      onClick={() => transitionToSlide(idx)}
                      aria-label={`${lang === 'bg' ? 'Снимка' : 'Photo'} ${idx + 1}: ${
                        lang === 'bg' ? thumb.titleBg : thumb.titleEn
                      }`}
                      className={`relative h-12 w-16 sm:h-14 sm:w-20 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        selected
                          ? 'border-[#E5C17B] ring-2 ring-[#C59B57]/35 scale-[1.03]'
                          : 'border-zinc-800 opacity-60 hover:opacity-100 hover:border-zinc-600'
                      }`}
                    >
                      <img
                        src={resolveGalleryImageUrl(thumb.imageUrl)}
                        alt={lang === 'bg' ? thumb.titleBg : thumb.titleEn}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 font-mono-tabular text-[9px] font-bold text-white">
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
