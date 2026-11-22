import React, { useEffect, useState } from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
import { Language } from '../types/furniture';
import { t } from '../lib/i18n';

interface ProtectedViewportProps {
  lang: Language;
  projectCode: string;
  userEmail?: string | null;
  isAdmin?: boolean;
  children: React.ReactNode;
}

export const ProtectedViewport: React.FC<ProtectedViewportProps> = ({
  lang,
  projectCode,
  userEmail,
  isAdmin = false,
  children,
}) => {
  const [curtainActive, setCurtainActive] = useState(false);

  useEffect(() => {
    if (isAdmin) return; // Owner can freely inspect without privacy curtain blocking

    const triggerCurtain = () => {
      setCurtainActive(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        e.key === 'PrintScreen' ||
        ((e.ctrlKey || e.metaKey) && (key === 'p' || key === 's')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (key === 's' || key === '3' || key === '4' || key === '5' || key === 'i'))
      ) {
        e.preventDefault();
        triggerCurtain();
      }
    };

    const handleBlur = () => {
      triggerCurtain();
    };

    const handleVisibility = () => {
      if (document.hidden) triggerCurtain();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAdmin]);

  const watermarkText = `ATELIER FORMA · ${projectCode} · ${userEmail || (lang === 'bg' ? 'ЗАЩИТЕН ИЗГЛЕД' : 'PROTECTED')}`;

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden"
      onContextMenu={(e) => {
        if (!isAdmin) e.preventDefault();
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}

      {/* Non-intrusive dynamic diagonal anti-theft watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-[0.14]"
      >
        <div className="grid grid-cols-2 gap-16 -rotate-24 scale-125 py-8">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="text-center font-mono-tabular text-[11px] font-semibold tracking-widest text-white/80 whitespace-nowrap"
            >
              {watermarkText}
            </div>
          ))}
        </div>
      </div>

      {/* Top-left quiet protection indicator */}
      <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 py-1 text-[11px] text-zinc-200 border border-white/10">
        <Lock className="w-3 h-3 text-[#C8935A]" />
        <span className="font-mono-tabular">{projectCode}</span>
        <span className="text-zinc-400">·</span>
        <span className="hidden sm:inline">{t(lang, 'watermarkProtected')}</span>
      </div>

      {/* Privacy Blur Curtain triggered on PrintScreen / Save / Print / Window blur */}
      {curtainActive && !isAdmin && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-zinc-950/92 px-6 text-center text-white">
          <div className="max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-[#B47B44]/20 text-[#D49B62]">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <h3 className="font-display text-2xl font-semibold text-white">
              {t(lang, 'curtainTitle')}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {t(lang, 'curtainSubtitle')}
            </p>
            <button
              type="button"
              onClick={() => setCurtainActive(false)}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#B47B44] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#9E6835]"
            >
              {t(lang, 'curtainResume')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
