import React, { useEffect, useState } from 'react';

interface MmDimensionControlProps {
  label: string;
  valueMm: number;
  minMm: number;
  maxMm: number;
  stepMm?: number;
  buttonStepMm?: number;
  showButtons?: boolean;
  showSlider?: boolean;
  onChangeMm: (nextMm: number) => void;
}

export const MmDimensionControl: React.FC<MmDimensionControlProps> = ({
  label,
  valueMm,
  minMm,
  maxMm,
  stepMm = 10,
  buttonStepMm,
  showButtons = false,
  showSlider = true,
  onChangeMm,
}) => {
  const [draft, setDraft] = useState(String(valueMm));
  const btnStep = buttonStepMm ?? stepMm;

  useEffect(() => {
    setDraft(String(valueMm));
  }, [valueMm]);

  const clampAndSnap = (rawNum: number, snapStep: number) =>
    Math.max(minMm, Math.min(maxMm, Math.round(rawNum / snapStep) * snapStep));

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(valueMm));
      return;
    }
    const clamped = clampAndSnap(parsed, 1);
    setDraft(String(clamped));
    if (clamped !== valueMm) {
      onChangeMm(clamped);
    }
  };

  return (
    <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-300">{label}</span>
        <div className="flex items-center gap-1">
          {showButtons && (
            <button
              type="button"
              disabled={valueMm <= minMm}
              onClick={() => onChangeMm(clampAndSnap(valueMm - btnStep, 1))}
              className="h-6 w-6 rounded border border-[#2F394F] bg-[#1A2233] text-xs font-bold text-white hover:border-[#D49B62] hover:bg-[#27324A] disabled:opacity-35"
              aria-label={`${label} minus`}
            >
              −
            </button>
          )}
          <input
            type="number"
            min={minMm}
            max={maxMm}
            step={stepMm}
            value={draft}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              const n = Number(raw);
              if (Number.isFinite(n) && n >= minMm && n <= maxMm && raw.length >= 3) {
                onChangeMm(Math.round(n));
              }
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft();
              }
            }}
            className="w-[66px] rounded border border-[#2F394F] bg-[#141A26] px-2 py-1 text-right font-mono-tabular text-xs font-semibold text-white focus:border-[#D49B62] focus:outline-none"
          />
          {showButtons && (
            <button
              type="button"
              disabled={valueMm >= maxMm}
              onClick={() => onChangeMm(clampAndSnap(valueMm + btnStep, 1))}
              className="h-6 w-6 rounded border border-[#2F394F] bg-[#1A2233] text-xs font-bold text-white hover:border-[#D49B62] hover:bg-[#27324A] disabled:opacity-35"
              aria-label={`${label} plus`}
            >
              +
            </button>
          )}
          <span className="text-[10px] text-zinc-400">мм</span>
        </div>
      </div>
      {showSlider && (
        <>
          <input
            type="range"
            min={minMm}
            max={maxMm}
            step={stepMm}
            value={Math.max(minMm, Math.min(maxMm, valueMm))}
            onChange={(e) => onChangeMm(Number(e.target.value))}
            className="w-full h-1.5 cursor-pointer accent-[#D49B62]"
          />
          <div className="flex justify-between text-[9px] font-mono-tabular text-zinc-500">
            <span>{minMm} мм</span>
            <span>{(valueMm / 10).toFixed(valueMm % 10 === 0 ? 0 : 1)} см</span>
            <span>{maxMm} мм</span>
          </div>
        </>
      )}
    </div>
  );
};
