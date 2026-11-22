import React from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Focus,
  Plus,
  Rows3,
  SlidersHorizontal,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import {
  columnHasVitrine,
  computeDrawerFrontMetrics,
  computeSlotClearancesCm,
  getBayCarcassDepthMm,
  getDrawerCount,
  isDrawerSlotType,
  isStandardDoorSlotType,
  isVitrineSlotType,
  resolveDrawerSlideLengthMm,
  upperBayHasVitrine,
} from '../lib/carpentryEngine';
import { t } from '../lib/i18n';
import {
  ApplianceOwnership,
  ColumnConfig,
  CornerSide,
  DishwasherFrontStyle,
  DrawerSlideType,
  FurnitureConfig,
  Language,
  SlotConfig,
  SlotType,
  UpperBayType,
  WardrobeDoorStyle,
} from '../types/furniture';
import { MmDimensionControl } from './MmDimensionControl';

export interface StudioRightInspectorProps {
  lang: Language;
  open: boolean;
  onToggleOpen: () => void;
  config: FurnitureConfig;
  selectedColumn: ColumnConfig | null;
  selectedColIndex: number;
  selectedSlotIdx: number;
  onSelectSlotIdx: (idx: number) => void;
  canDeleteSelectedColumn: boolean;
  isolatedMode: boolean;
  onToggleIsolate: () => void;
  onUpdateColumnWidth: (colId: string, widthCm: number) => void;
  onUpdateColumnProps: (colId: string, patch: Partial<ColumnConfig>) => void;
  onUpdateConfig: (next: FurnitureConfig) => void;
  onUpdateSlotType: (colId: string, slotId: string, type: SlotType) => void;
  onToggleSlotVitrine: (colId: string, slotId: string, enableVitrine: boolean) => void;
  onUpdateSlotProps: (colId: string, slotId: string, patch: Partial<SlotConfig>) => void;
  onArrangeDrawersPosition: (
    colId: string,
    mode: 'top' | 'bottom' | 'door_only' | 'only',
  ) => void;
  onApplyTallColumnPreset: (
    colId: string,
    kind: 'fridge_top' | 'fridge_no_top' | 'oven_mw' | 'pantry',
  ) => void;
  onSetTallTopCabinetMode: (colId: string, withOverCabinet: boolean) => void;
  onSetUpperBayType: (colId: string, upperType: UpperBayType) => void;
  onSetShelvesCount: (colId: string, slotId: string, count: number) => void;
  onChangeShelfClearance: (
    colId: string,
    slotId: string,
    gapIdx: number,
    nextGapCm: number,
  ) => void;
  onSetDrawerCount: (colId: string, slotId: string, count: number) => void;
  onSetDrawerSlide: (colId: string, slotId: string, slideType: DrawerSlideType) => void;
  onUpdateDrawerDimensions: (
    colId: string,
    slotId: string,
    dims: { widthMm?: number; slotHeightMm?: number; depthMm?: number },
  ) => void;
  onAddColumn: () => void;
  onSplitColumn: (colId: string) => void;
  onSplitSlotVertically: (colId: string, slotId: string) => void;
  onRemoveColumn: (colId: string) => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canSwap: boolean;
  isSwapSource: boolean;
  onMoveColumn: (colId: string, direction: 'left' | 'right') => void;
  onToggleSwapMode: (colId: string) => void;
  onCancelSwapMode: () => void;
  getSlotShortLabel: (slot: SlotConfig, lang: Language) => string;
}

export const StudioRightInspector: React.FC<StudioRightInspectorProps> = ({
  lang,
  open,
  onToggleOpen,
  config,
  selectedColumn,
  selectedColIndex,
  selectedSlotIdx,
  onSelectSlotIdx,
  canDeleteSelectedColumn,
  isolatedMode,
  onToggleIsolate,
  onUpdateColumnWidth,
  onUpdateColumnProps,
  onUpdateConfig,
  onUpdateSlotType,
  onToggleSlotVitrine,
  onUpdateSlotProps,
  onArrangeDrawersPosition,
  onApplyTallColumnPreset,
  onSetTallTopCabinetMode,
  onSetUpperBayType,
  onSetShelvesCount,
  onChangeShelfClearance,
  onSetDrawerCount,
  onSetDrawerSlide,
  onUpdateDrawerDimensions,
  onAddColumn,
  onSplitColumn,
  onSplitSlotVertically,
  onRemoveColumn,
  canMoveLeft,
  canMoveRight,
  canSwap,
  isSwapSource,
  onMoveColumn,
  onToggleSwapMode,
  onCancelSwapMode,
  getSlotShortLabel,
}) => {
  if (!open || !selectedColumn) return null;

  const activeSlot = selectedColumn.slots[selectedSlotIdx] || selectedColumn.slots[0] || null;
  if (!activeSlot) return null;

  const selectedBayHeightCm = selectedColumn.heightCm || config.heightCm;
  const selectedBayPlinthCm = selectedColumn.isSuspended ? 0 : config.plinthCm;
  const boxInnerHeightCm = Math.max(22, selectedBayHeightCm - selectedBayPlinthCm - 3.6);
  const ratioSum =
    selectedColumn.slots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;
  const activeSlotInnerCm =
    boxInnerHeightCm * (Math.max(0.1, activeSlot.heightRatio) / ratioSum);
  const activeSlotClearances =
    activeSlot.internalShelves > 0
      ? computeSlotClearancesCm(
          activeSlotInnerCm,
          activeSlot.internalShelves,
          activeSlot.shelfClearancesCm,
        )
      : [];
  const exteriorBoxCm = Math.max(25, selectedBayHeightCm - selectedBayPlinthCm);
  const activeSlotExteriorCm =
    exteriorBoxCm * (Math.max(0.1, activeSlot.heightRatio) / ratioSum);
  const activeDrawerMetrics = isDrawerSlotType(activeSlot.type)
    ? computeDrawerFrontMetrics(
        activeSlotExteriorCm,
        getDrawerCount(activeSlot),
        selectedColumn.widthCm,
        config.handleStyle,
      )
    : null;

  const hasDrawers = selectedColumn.slots.some((s) => isDrawerSlotType(s.type));
  const firstSlotIsDrawer = isDrawerSlotType(selectedColumn.slots[0]?.type);
  const lastSlotIsDrawer = isDrawerSlotType(
    selectedColumn.slots[selectedColumn.slots.length - 1]?.type,
  );
  const isAllDrawers = selectedColumn.slots.length === 1 && firstSlotIsDrawer;
  const isDoorOnly =
    selectedColumn.slots.length === 1 &&
    ['door_left', 'door_right', 'door_double', 'glass_door', 'glass_double'].includes(
      selectedColumn.slots[0]?.type,
    );
  const bayHasVitrine = columnHasVitrine(selectedColumn);
  const baseDepthMm = Math.round(config.depthCm * 10);
  const realCarcassDepthMm = getBayCarcassDepthMm(config, selectedColumn, false);
  const isDoorOrVitrineSlot =
    isStandardDoorSlotType(activeSlot.type) || isVitrineSlotType(activeSlot.type);
  const slotIsVitrine = isVitrineSlotType(activeSlot.type);
  const upperIsVitrine = upperBayHasVitrine(selectedColumn);

  return (
    <aside className="w-[300px] sm:w-[325px] shrink-0 border-l border-[#252D3F] bg-[#101520] flex flex-col min-h-0 z-20">
      {/* Inspector Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#252D3F] bg-[#0B0F17] px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="h-4 w-4 text-[#D49B62] shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {selectedColIndex >= 0
                ? `${lang === 'bg' ? 'Модул' : 'Bay'} #${selectedColIndex + 1}`
                : lang === 'bg'
                  ? 'Крило Г'
                  : 'Wing'}
            </div>
            <div className="font-mono-tabular text-[10px] text-[#E6B88A]">
              {Math.round(selectedColumn.widthCm * 10)} × {Math.round(selectedBayHeightCm * 10)} ×{' '}
              {realCarcassDepthMm} мм
              {bayHasVitrine ? (lang === 'bg' ? ' (−2 мм)' : ' (−2 mm)') : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleIsolate}
            title={isolatedMode ? t(lang, 'showFullAssemblyBtn') : t(lang, 'isolateCabinetBtn')}
            className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
              isolatedMode
                ? 'bg-[#B47B44] text-white'
                : 'border border-[#2C354A] bg-[#141A26] text-zinc-200 hover:border-[#B47B44]'
            }`}
          >
            <Focus className="h-3.5 w-3.5 inline mr-1" />
            {isolatedMode ? (lang === 'bg' ? 'Всички' : 'All') : lang === 'bg' ? 'Изолирай' : 'Isolate'}
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            title={lang === 'bg' ? 'Скрий десния панел' : 'Collapse panel'}
            className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Quick Bay Actions (+ Модул / Делител / Горе-Долу) */}
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={onAddColumn}
            className="flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-950/40 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900/60"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{lang === 'bg' ? 'Модул' : 'Bay'}</span>
          </button>
          <button
            type="button"
            disabled={selectedColumn.widthCm < 50}
            onClick={() => onSplitColumn(selectedColumn.id)}
            className="flex items-center justify-center gap-1 rounded-md border border-[#2C354A] bg-[#141A26] py-1.5 text-[11px] text-zinc-200 hover:border-[#D49B62] disabled:opacity-40"
          >
            <Split className="h-3.5 w-3.5 text-sky-300" />
            <span>{lang === 'bg' ? 'Делител' : 'Split'}</span>
          </button>
          <button
            type="button"
            disabled={selectedColumn.slots.length >= 4}
            onClick={() => onSplitSlotVertically(selectedColumn.id, activeSlot.id)}
            className="flex items-center justify-center gap-1 rounded-md border border-[#2C354A] bg-[#141A26] py-1.5 text-[11px] text-zinc-200 hover:border-[#D49B62] disabled:opacity-40"
          >
            <Rows3 className="h-3.5 w-3.5 text-sky-300" />
            <span>{lang === 'bg' ? 'Горе/Долу' : 'Zone'}</span>
          </button>
        </div>

        {/* Reorder & Swap Module Position */}
        <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
            <span>{lang === 'bg' ? 'Пренареждане в редицата' : 'Reorder in Row'}</span>
            <span className="font-mono-tabular text-[10px] text-zinc-400">
              {selectedColIndex >= 0 ? `#${selectedColIndex + 1}` : lang === 'bg' ? 'Крило Г' : 'Wing'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!canMoveLeft}
              onClick={() => onMoveColumn(selectedColumn.id, 'left')}
              className="flex items-center justify-center gap-1 rounded-md border border-[#2C354A] bg-[#141A26] px-2 py-1.5 text-[11px] font-medium text-zinc-100 hover:border-[#D49B62] hover:bg-[#1B2233] disabled:opacity-35 disabled:pointer-events-none transition-colors"
              title={lang === 'bg' ? 'Премести модула с една позиция наляво' : 'Move module one step left'}
            >
              <ArrowLeft className="h-3.5 w-3.5 text-[#E6B88A] shrink-0" />
              <span>{lang === 'bg' ? 'Премести наляво' : 'Move Left'}</span>
            </button>
            <button
              type="button"
              disabled={!canMoveRight}
              onClick={() => onMoveColumn(selectedColumn.id, 'right')}
              className="flex items-center justify-center gap-1 rounded-md border border-[#2C354A] bg-[#141A26] px-2 py-1.5 text-[11px] font-medium text-zinc-100 hover:border-[#D49B62] hover:bg-[#1B2233] disabled:opacity-35 disabled:pointer-events-none transition-colors"
              title={lang === 'bg' ? 'Премести модула с една позиция надясно' : 'Move module one step right'}
            >
              <span>{lang === 'bg' ? 'Премести надясно' : 'Move Right'}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#E6B88A] shrink-0" />
            </button>
          </div>
          <button
            type="button"
            disabled={!canSwap && !isSwapSource}
            onClick={() => (isSwapSource ? onCancelSwapMode() : onToggleSwapMode(selectedColumn.id))}
            className={`w-full flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-35 disabled:pointer-events-none ${
              isSwapSource
                ? 'border-amber-400 bg-[#B47B44] text-white'
                : 'border-[#2C354A] bg-[#141A26] text-amber-200 hover:border-[#D49B62] hover:bg-[#B47B44]/20'
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
            <span>
              {isSwapSource
                ? lang === 'bg'
                  ? 'Изберете друг шкаф (Отказ)'
                  : 'Pick another cabinet (Cancel)'
                : lang === 'bg'
                  ? 'Размени местата'
                  : 'Swap Positions'}
            </span>
          </button>
        </div>

        {/* Millimeter Sliders & Inputs (Ширина, Височина, Дълбочина в мм) */}
        <div className="space-y-2">
          <MmDimensionControl
            label={lang === 'bg' ? 'Ширина на шкафа (мм)' : 'Cabinet Width (mm)'}
            valueMm={Math.round(selectedColumn.widthCm * 10)}
            minMm={250}
            maxMm={1800}
            stepMm={10}
            onChangeMm={(mm) => onUpdateColumnWidth(selectedColumn.id, mm / 10)}
          />
          <MmDimensionControl
            label={lang === 'bg' ? 'Височина на шкафа (мм)' : 'Cabinet Height (mm)'}
            valueMm={Math.round(selectedBayHeightCm * 10)}
            minMm={350}
            maxMm={2750}
            stepMm={10}
            onChangeMm={(mm) => {
              const nextCm = Math.max(35, Math.min(275, Math.round(mm / 10)));
              if (config.columns.length === 1 && config.wingColumns.length === 0) {
                onUpdateConfig({
                  ...config,
                  heightCm: nextCm,
                  columns: config.columns.map((c) =>
                    c.id === selectedColumn.id ? { ...c, heightCm: undefined } : c,
                  ),
                });
              } else {
                onUpdateColumnProps(selectedColumn.id, {
                  heightCm: nextCm === config.heightCm ? undefined : nextCm,
                });
              }
            }}
          />
          <MmDimensionControl
            label={lang === 'bg' ? 'Дълбочина (мм)' : 'Depth (mm)'}
            valueMm={realCarcassDepthMm}
            minMm={220}
            maxMm={800}
            stepMm={10}
            onChangeMm={(mm) => {
              const targetBaseMm = bayHasVitrine ? mm + 2 : mm;
              const nextCm = Math.max(22, Math.min(80, Math.round(targetBaseMm) / 10));
              if (config.columns.length === 1 && config.wingColumns.length === 0) {
                onUpdateConfig({
                  ...config,
                  depthCm: nextCm,
                  columns: config.columns.map((c) =>
                    c.id === selectedColumn.id ? { ...c, depthCm: undefined } : c,
                  ),
                });
              } else {
                onUpdateColumnProps(selectedColumn.id, {
                  depthCm: Math.abs(nextCm - config.depthCm) < 0.05 ? undefined : nextCm,
                });
              }
            }}
          />
          {bayHasVitrine && (
            <div className="rounded-md border border-amber-500/35 bg-amber-950/25 px-2.5 py-1.5 text-[10px] leading-snug text-amber-200 font-mono-tabular">
              {lang === 'bg'
                ? `Корпус: ${realCarcassDepthMm} мм (база ${baseDepthMm} мм − 2 мм за 20 мм алуминиев профил вместо 18 мм плоча)`
                : `Carcass: ${realCarcassDepthMm} mm (base ${baseDepthMm} mm − 2 mm for 20 mm alu profile vs 18 mm board)`}
            </div>
          )}
        </div>

        {/* Dedicated Vitrine (20 mm Alu Profile + Glass) Toggle when a door or vitrine is selected */}
        {isDoorOrVitrineSlot && (
          <div
            className={`rounded-lg border p-2.5 space-y-2 transition-colors ${
              slotIsVitrine
                ? 'border-amber-400/60 bg-[#1B1712]'
                : 'border-[#2B354B] bg-[#0D111A]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-zinc-200">
                {lang === 'bg' ? 'Тип врата на маркирания модул' : 'Selected Door Front'}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono-tabular font-semibold ${
                  slotIsVitrine
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                    : 'bg-[#171E2C] text-zinc-300 border border-[#2C354A]'
                }`}
              >
                {slotIsVitrine
                  ? lang === 'bg'
                    ? 'Витрина · 20 мм'
                    : 'Vitrine · 20 mm'
                  : lang === 'bg'
                    ? 'Плоча · 18 мм'
                    : 'Board · 18 mm'}
              </span>
            </div>

            {!slotIsVitrine ? (
              <button
                type="button"
                onClick={() => onToggleSlotVitrine(selectedColumn.id, activeSlot.id, true)}
                className="w-full rounded-md border border-[#D49B62] bg-[#B47B44] px-3 py-2 text-xs font-semibold text-white hover:bg-[#9E6835] transition-colors text-center shadow-sm"
              >
                {lang === 'bg'
                  ? 'Витрина (Ал. профил 20 мм + стъкло)'
                  : 'Vitrine (20 mm Alu Profile + Glass)'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onToggleSlotVitrine(selectedColumn.id, activeSlot.id, false)}
                className="w-full rounded-md border border-[#3A4661] bg-[#171F30] px-3 py-2 text-xs font-semibold text-zinc-100 hover:border-[#D49B62] hover:bg-[#1F293F] transition-colors text-center"
              >
                {lang === 'bg'
                  ? 'Стандартна врата (18 мм)'
                  : 'Standard Door (18 mm)'}
              </button>
            )}

            <p className="text-[10px] leading-snug text-zinc-400">
              {slotIsVitrine
                ? lang === 'bg'
                  ? `Активен черен матов профил S02 (20 мм) + тъмносиво стъкло. Автоматично са приспаднати 2 мм от дълбочината (${realCarcassDepthMm} мм).`
                  : `Active matte black S02 frame (20 mm) + dark grey glass. 2 mm depth deducted automatically (${realCarcassDepthMm} mm).`
                : lang === 'bg'
                  ? 'Превключва маркираната врата към тъмносиво стъкло с черен 20 мм профил и приспада 2 мм от дълбочината.'
                  : 'Switches door to dark grey glass with 20 mm black alu frame and deducts 2 mm carcass depth.'}
            </p>
          </div>
        )}

        {upperIsVitrine && config.category === 'kitchen' && config.includeUpperCabinets && (
          <div className="rounded-md border border-amber-500/35 bg-amber-950/20 px-2.5 py-1.5 text-[10px] text-amber-200 font-mono-tabular">
            {lang === 'bg'
              ? `Горен ред витрина (20 мм): корпус ${getBayCarcassDepthMm(config, selectedColumn, true)} мм (−2 мм)`
              : `Upper vitrine (20 mm): carcass ${getBayCarcassDepthMm(config, selectedColumn, true)} mm (−2 mm)`}
          </div>
        )}

        {/* Wall-hung / Suspended Toggle (in mm) */}
        <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] px-2.5 py-2 space-y-2">
          <label className="flex items-center justify-between gap-2 text-xs text-zinc-200 cursor-pointer">
            <span>{lang === 'bg' ? 'Окачен на стена (без цокъл)' : 'Wall-hung (no plinth)'}</span>
            <input
              type="checkbox"
              checked={Boolean(selectedColumn.isSuspended)}
              onChange={(e) =>
                onUpdateColumnProps(selectedColumn.id, {
                  isSuspended: e.target.checked,
                  elevationCm: e.target.checked ? selectedColumn.elevationCm ?? 28 : undefined,
                })
              }
              className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
            />
          </label>
          {selectedColumn.isSuspended && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 pt-1 border-t border-[#1E2638]">
              <span>{lang === 'bg' ? 'Височина от пода (мм):' : 'Floor offset (mm):'}</span>
              <input
                type="number"
                min={100}
                max={1600}
                step={10}
                value={Math.round((selectedColumn.elevationCm ?? 28) * 10)}
                onChange={(e) =>
                  onUpdateColumnProps(selectedColumn.id, {
                    elevationCm: Math.max(
                      10,
                      Math.min(160, Math.round((Number(e.target.value) || 280) / 10)),
                    ),
                  })
                }
                className="w-20 rounded border border-[#2F394F] bg-[#141A26] px-2 py-0.5 text-right font-mono-tabular text-xs text-white"
              />
            </div>
          )}
        </div>

        {/* Vertical Zone Switcher when split */}
        {selectedColumn.slots.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {selectedColumn.slots.map((sl, idx) => (
              <button
                key={sl.id}
                type="button"
                onClick={() => onSelectSlotIdx(idx)}
                className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  selectedSlotIdx === idx
                    ? 'bg-[#B47B44] text-white font-semibold'
                    : 'bg-[#171E2C] text-zinc-300 hover:text-white'
                }`}
              >
                {lang === 'bg' ? `Зона #${idx + 1}` : `Zone #${idx + 1}`} ·{' '}
                {getSlotShortLabel(sl, lang)}
              </button>
            ))}
          </div>
        )}

        {/* Quick Visual Presets: Drawers Top/Bottom/Door-Only/Drawers-Only */}
        {selectedBayHeightCm <= 135 && (
          <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2.5 space-y-1.5">
            <div className="text-[11px] font-semibold text-zinc-300">
              {lang === 'bg' ? 'Бърза подредба на врата / чекмеджета' : 'Quick Door / Drawer Layout'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onArrangeDrawersPosition(selectedColumn.id, 'top')}
                className={`rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  hasDrawers && firstSlotIsDrawer && selectedColumn.slots.length > 1
                    ? 'border-[#D49B62] bg-[#B47B44]/25 text-white'
                    : 'border-[#273045] bg-[#141A26] text-zinc-200 hover:border-[#D49B62]'
                }`}
              >
                {lang === 'bg' ? 'Чекмеджета отгоре' : 'Drawers Top'}
              </button>
              <button
                type="button"
                onClick={() => onArrangeDrawersPosition(selectedColumn.id, 'bottom')}
                className={`rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  hasDrawers && lastSlotIsDrawer && selectedColumn.slots.length > 1
                    ? 'border-[#D49B62] bg-[#B47B44]/25 text-white'
                    : 'border-[#273045] bg-[#141A26] text-zinc-200 hover:border-[#D49B62]'
                }`}
              >
                {lang === 'bg' ? 'Чекмеджета отдолу' : 'Drawers Bottom'}
              </button>
              <button
                type="button"
                onClick={() => onArrangeDrawersPosition(selectedColumn.id, 'door_only')}
                className={`rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  isDoorOnly
                    ? 'border-[#D49B62] bg-[#B47B44]/25 text-white'
                    : 'border-[#273045] bg-[#141A26] text-zinc-200 hover:border-[#D49B62]'
                }`}
              >
                {lang === 'bg' ? 'Само врата' : 'Door Only'}
              </button>
              <button
                type="button"
                onClick={() => onArrangeDrawersPosition(selectedColumn.id, 'only')}
                className={`rounded border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  isAllDrawers
                    ? 'border-[#D49B62] bg-[#B47B44]/25 text-white'
                    : 'border-[#273045] bg-[#141A26] text-zinc-200 hover:border-[#D49B62]'
                }`}
              >
                {lang === 'bg' ? 'Само чекмеджета' : 'Drawers Only'}
              </button>
            </div>
          </div>
        )}

        {/* Corner Side (Left / Right) + Magic Corner Mechanism */}
        {(config.layoutShape === 'l_shape' || activeSlot.type === 'corner_blind') && (
          <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2.5 space-y-2">
            <div className="text-[11px] font-semibold text-zinc-300">
              {lang === 'bg' ? 'Посока на ъгъла и механизъм' : 'Corner Side & Mechanism'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['left', 'right'] as CornerSide[]).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => onUpdateConfig({ ...config, cornerSide: side })}
                  className={`rounded border py-1.5 text-[11px] font-medium transition-colors ${
                    (config.cornerSide || 'right') === side
                      ? 'border-[#D49B62] bg-[#B47B44]/25 text-white font-semibold'
                      : 'border-[#273045] bg-[#141A26] text-zinc-300'
                  }`}
                >
                  {side === 'left'
                    ? lang === 'bg'
                      ? '↙ Ляв ъгъл'
                      : '↙ Left Corner'
                    : lang === 'bg'
                      ? 'Десен ъгъл ↘'
                      : 'Right Corner ↘'}
                </button>
              ))}
            </div>
            {config.category === 'kitchen' && (
              <label className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer pt-1">
                <span>
                  {lang === 'bg'
                    ? 'Механизъм „Бъбрек“ / Magic Corner'
                    : 'Magic Corner Mechanism'}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(config.includeCornerMechanism)}
                  onChange={(e) =>
                    onUpdateConfig({ ...config, includeCornerMechanism: e.target.checked })
                  }
                  className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
                />
              </label>
            )}
          </div>
        )}

        {/* Tall Column Over-Cabinet Toggle & Quick Presets */}
        {config.category === 'kitchen' && (
          <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2.5 space-y-2">
            <div className="text-[11px] font-semibold text-zinc-300">
              {lang === 'bg' ? 'Висока колона / Надстройка' : 'Tall Column / Over-Cabinet'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onSetTallTopCabinetMode(selectedColumn.id, true)}
                className={`rounded border px-2 py-1 text-[10px] font-medium ${
                  selectedBayHeightCm >= 210
                    ? 'border-[#D49B62] bg-[#B47B44]/25 text-white'
                    : 'border-[#273045] bg-[#141A26] text-zinc-200 hover:border-[#D49B62]'
                }`}
              >
                {lang === 'bg' ? 'С надстройка (2200 мм)' : 'With Over-Cab (2200 mm)'}
              </button>
              <button
                type="button"
                onClick={() => onSetTallTopCabinetMode(selectedColumn.id, false)}
                className={`rounded border px-2 py-1 text-[10px] font-medium ${
                  selectedBayHeightCm >= 175 && selectedBayHeightCm <= 195
                    ? 'border-[#D49B62] bg-[#B47B44]/25 text-white'
                    : 'border-[#273045] bg-[#141A26] text-zinc-200 hover:border-[#D49B62]'
                }`}
              >
                {lang === 'bg' ? 'Без надстр. (1850 мм)' : 'No Over-Cab (1850 mm)'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => onApplyTallColumnPreset(selectedColumn.id, 'fridge_top')}
                className="rounded border border-[#273045] bg-[#141A26] px-2 py-1 text-[10px] text-zinc-200 hover:border-[#D49B62]"
              >
                {lang === 'bg' ? 'Хладилник + надстр.' : 'Fridge + Top'}
              </button>
              <button
                type="button"
                onClick={() => onApplyTallColumnPreset(selectedColumn.id, 'fridge_no_top')}
                className="rounded border border-[#273045] bg-[#141A26] px-2 py-1 text-[10px] text-zinc-200 hover:border-[#D49B62]"
              >
                {lang === 'bg' ? 'Хладилник без надстр.' : 'Fridge Only'}
              </button>
              <button
                type="button"
                onClick={() => onApplyTallColumnPreset(selectedColumn.id, 'oven_mw')}
                className="rounded border border-[#273045] bg-[#141A26] px-2 py-1 text-[10px] text-zinc-200 hover:border-[#D49B62]"
              >
                {lang === 'bg' ? 'Фурна + Микров.' : 'Oven + MW'}
              </button>
              <button
                type="button"
                onClick={() => onApplyTallColumnPreset(selectedColumn.id, 'pantry')}
                className="rounded border border-[#273045] bg-[#141A26] px-2 py-1 text-[10px] text-zinc-200 hover:border-[#D49B62]"
              >
                {lang === 'bg' ? 'Колона Килер' : 'Pantry Tower'}
              </button>
            </div>
          </div>
        )}

        {/* Full Slot Type Selector */}
        <label className="block">
          <span className="text-[11px] text-zinc-400">
            {lang === 'bg' ? 'Тип модул / зона / врата' : 'Module / Zone / Door Type'}
          </span>
          <select
            value={activeSlot.type}
            onChange={(e) =>
              onUpdateSlotType(selectedColumn.id, activeSlot.id, e.target.value as SlotType)
            }
            className="mt-1 w-full rounded-md border border-[#2C354A] bg-[#0B0F17] px-2.5 py-1.5 text-xs text-zinc-100 focus:border-[#B47B44] focus:outline-none"
          >
            <optgroup label={lang === 'bg' ? 'Врати, чекмеджета и рафтове' : 'Doors, Drawers & Shelves'}>
              <option value="door_left">{lang === 'bg' ? 'Врата (ляво отваряне)' : 'Door (Left)'}</option>
              <option value="door_right">{lang === 'bg' ? 'Врата (дясно отваряне)' : 'Door (Right)'}</option>
              <option value="door_double">{lang === 'bg' ? 'Двойна врата' : 'Double Door'}</option>
              <option value="glass_door">{lang === 'bg' ? 'Стъкл. витрина + алу. рамка' : 'Glass Vitrine'}</option>
              <option value="glass_double">{lang === 'bg' ? 'Двойна стъкл. витрина' : 'Double Vitrine'}</option>
              <option value="cargo_basket">{lang === 'bg' ? 'Карго кошница / Бутилково' : 'Cargo Basket'}</option>
              <option value="flap_up">{lang === 'bg' ? 'Клапа нагоре' : 'Lift Flap'}</option>
              <option value="open_shelves">{lang === 'bg' ? 'Открити рафтове' : 'Open Shelves'}</option>
              <option value="drawers_1">{lang === 'bg' ? '1 Чекмедже' : '1 Drawer'}</option>
              <option value="drawers_2">{lang === 'bg' ? '2 Чекмеджета' : '2 Drawers'}</option>
              <option value="drawers_3">{lang === 'bg' ? '3 Чекмеджета' : '3 Drawers'}</option>
              <option value="drawers_4">{lang === 'bg' ? '4 Чекмеджета' : '4 Drawers'}</option>
              <option value="drawers_5">{lang === 'bg' ? '5 Чекмеджета' : '5 Drawers'}</option>
              <option value="drawers_6">{lang === 'bg' ? '6 Чекмеджета' : '6 Drawers'}</option>
            </optgroup>
            <optgroup label={lang === 'bg' ? 'Кухня, ъгли и уреди' : 'Kitchen, Corners & Appliances'}>
              <option value="sink_unit">{lang === 'bg' ? 'Шкаф мивка' : 'Sink Unit'}</option>
              <option value="corner_blind">{lang === 'bg' ? 'Глух ъглов шкаф' : 'Blind Corner'}</option>
              <option value="oven_hob">{lang === 'bg' ? 'Фурна и котлон' : 'Oven & Hob'}</option>
              <option value="oven_only">{lang === 'bg' ? 'Фурна за вграждане' : 'Built-in Oven'}</option>
              <option value="microwave">{lang === 'bg' ? 'Микровълнова за вграждане' : 'Microwave'}</option>
              <option value="fridge_builtin">{lang === 'bg' ? 'Хладилник за вграждане' : 'Built-in Fridge'}</option>
              <option value="hob_only">{lang === 'bg' ? 'Котлони' : 'Cooktop'}</option>
              <option value="dishwasher">{lang === 'bg' ? 'Съдомиялна' : 'Dishwasher'}</option>
              <option value="washing_machine">{lang === 'bg' ? 'Пералня под плот' : 'Washing Machine'}</option>
              <option value="dryer">{lang === 'bg' ? 'Сушилня' : 'Dryer'}</option>
              <option value="extractor_hood">{lang === 'bg' ? 'Аспиратор' : 'Extractor Hood'}</option>
            </optgroup>
            <optgroup label={lang === 'bg' ? 'Гардероб — вътрешно разпр.' : 'Wardrobe Interior'}>
              <option value="double_hanging_rod">{lang === 'bg' ? 'Двоен лост за дрехи' : 'Double Clothes Rail'}</option>
              <option value="trouser_rack">{lang === 'bg' ? 'Изтеглящ панталонник' : 'Trouser Rack'}</option>
            </optgroup>
            <optgroup label={lang === 'bg' ? 'Антре и ТВ дневна' : 'Hallway & Living TV'}>
              <option value="shoe_rack">{lang === 'bg' ? 'Шкаф за обувки' : 'Shoe Cabinet'}</option>
              <option value="coat_panel">{lang === 'bg' ? 'Закачалка / Стенно пано' : 'Coat Rack Panel'}</option>
              <option value="bench_seat">{lang === 'bg' ? 'Пейка за сядане' : 'Seating Bench'}</option>
              <option value="mirror_front">{lang === 'bg' ? 'Огледална врата' : 'Mirror Front Door'}</option>
              <option value="tv_niche">{lang === 'bg' ? 'ТВ / медия ниша' : 'Open TV Niche'}</option>
            </optgroup>
          </select>
        </label>

        {/* Wardrobe Door Style & Rail */}
        {config.category === 'wardrobe' && (
          <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2.5 space-y-2">
            <div className="text-[11px] font-semibold text-zinc-300">
              {lang === 'bg' ? 'Гардероб: Врати и релси' : 'Wardrobe Doors & Tracks'}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['hinged', lang === 'bg' ? 'На панти' : 'Hinged'],
                  ['sliding', lang === 'bg' ? 'Плъзгащи + релси' : 'Sliding + Tracks'],
                ] as [WardrobeDoorStyle, string][]
              ).map(([wStyle, wLabel]) => (
                <button
                  key={wStyle}
                  type="button"
                  onClick={() => onUpdateConfig({ ...config, wardrobeDoorStyle: wStyle })}
                  className={`rounded border py-1.5 text-[11px] font-medium transition-colors ${
                    (config.wardrobeDoorStyle || 'hinged') === wStyle
                      ? 'border-[#D49B62] bg-[#B47B44]/25 text-white'
                      : 'border-[#273045] bg-[#141A26] text-zinc-300'
                  }`}
                >
                  {wLabel}
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer pt-1">
              <span>{lang === 'bg' ? 'Алуминиев лост за дрехи' : 'Aluminum clothes rail'}</span>
              <input
                type="checkbox"
                checked={config.includeClothesRails !== false}
                onChange={(e) =>
                  onUpdateConfig({ ...config, includeClothesRails: e.target.checked })
                }
                className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
              />
            </label>
          </div>
        )}

        {/* Appliance Ownership & Dishwasher Front */}
        {[
          'oven_hob',
          'oven_only',
          'hob_only',
          'dishwasher',
          'washing_machine',
          'dryer',
          'fridge_builtin',
          'microwave',
        ].includes(activeSlot.type) && (
          <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2.5 space-y-2">
            <label className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer">
              <span>{lang === 'bg' ? 'Уредът е от клиента' : 'Client-Supplied Appliance'}</span>
              <input
                type="checkbox"
                checked={(activeSlot.applianceOwnership || 'client') === 'client'}
                onChange={(e) =>
                  onUpdateSlotProps(selectedColumn.id, activeSlot.id, {
                    applianceOwnership: (e.target.checked
                      ? 'client'
                      : 'included') as ApplianceOwnership,
                  })
                }
                className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
              />
            </label>
            {activeSlot.type === 'dishwasher' && (
              <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-[#1E2638]">
                {(['full_door', 'integrated_panel'] as DishwasherFrontStyle[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() =>
                      onUpdateSlotProps(selectedColumn.id, activeSlot.id, {
                        dishwasherStyle: st,
                      })
                    }
                    className={`rounded border py-1 text-[10px] ${
                      (activeSlot.dishwasherStyle || 'full_door') === st
                        ? 'border-[#D49B62] bg-[#B47B44]/25 text-white font-semibold'
                        : 'border-[#273045] bg-[#141A26] text-zinc-300'
                    }`}
                  >
                    {st === 'full_door'
                      ? lang === 'bg'
                        ? 'Цяла врата'
                        : 'Full Door'
                      : lang === 'bg'
                        ? 'Панел за вграждане'
                        : 'Panel'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upper Cabinet Type above Bay */}
        {config.category === 'kitchen' &&
          config.includeUpperCabinets &&
          selectedBayHeightCm <= 130 && (
            <label className="block">
              <span className="text-[11px] text-zinc-400">
                {t(lang, 'upperModuleTypeTitle')}
              </span>
              <select
                value={
                  selectedColumn.upperType ||
                  (selectedColumn.slots.some(
                    (sl) => sl.type === 'oven_hob' || sl.type === 'hob_only',
                  )
                    ? 'extractor_builtin'
                    : 'doors')
                }
                onChange={(e) =>
                  onSetUpperBayType(selectedColumn.id, e.target.value as UpperBayType)
                }
                className="mt-1 w-full rounded-md border border-[#2C354A] bg-[#0B0F17] px-2.5 py-1.5 text-xs text-zinc-100 focus:border-[#B47B44] focus:outline-none"
              >
                <option value="doors">{lang === 'bg' ? 'Стандартни врати' : 'Standard Doors'}</option>
                <option value="glass_doors">{lang === 'bg' ? 'Стъкл. витрини' : 'Glass Vitrines'}</option>
                <option value="flap_up">{lang === 'bg' ? 'Клапа нагоре' : 'Lift Flap'}</option>
                <option value="extractor_builtin">
                  {lang === 'bg' ? 'Вграден аспиратор в шкаф' : 'Built-in Extractor'}
                </option>
                <option value="extractor_chimney">
                  {lang === 'bg' ? 'Коминен аспиратор' : 'Chimney Extractor'}
                </option>
                <option value="none">
                  {lang === 'bg' ? 'Без горен шкаф (прозорец/свободно)' : 'No Upper Cabinet (Window/Open)'}
                </option>
              </select>
            </label>
          )}

        {/* Shelves & Compartments */}
        {!isDrawerSlotType(activeSlot.type) &&
          !['oven_hob', 'oven_only', 'dishwasher', 'washing_machine', 'dryer'].includes(
            activeSlot.type,
          ) && (
            <div className="space-y-2 border-t border-[#252D3F] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-300">{t(lang, 'shelvesCountLabel')}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onSetShelvesCount(
                        selectedColumn.id,
                        activeSlot.id,
                        (activeSlot.internalShelves || 0) - 1,
                      )
                    }
                    className="h-6 w-6 rounded bg-[#1A2233] text-xs font-bold text-white hover:bg-[#27324A]"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono-tabular text-xs font-semibold text-white">
                    {activeSlot.internalShelves || 0}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onSetShelvesCount(
                        selectedColumn.id,
                        activeSlot.id,
                        (activeSlot.internalShelves || 0) + 1,
                      )
                    }
                    className="h-6 w-6 rounded bg-[#1A2233] text-xs font-bold text-white hover:bg-[#27324A]"
                  >
                    +
                  </button>
                </div>
              </div>

              {activeSlotClearances.length > 0 && (
                <div className="space-y-1.5 rounded-lg bg-[#0D111A] p-2 border border-[#252D3F]">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400">
                    <span>{t(lang, 'clearSpaceTitle')}</span>
                    <span className="font-mono-tabular text-zinc-200">
                      {Math.round(activeSlotInnerCm * 10)} мм
                    </span>
                  </div>
                  {activeSlotClearances.map((gapCm, gIdx) => (
                    <div key={gIdx} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        {t(lang, 'compartmentLabel')} {gIdx + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min={6}
                          max={Math.max(12, Math.floor(activeSlotInnerCm - 10))}
                          step={0.5}
                          value={gapCm}
                          onChange={(e) =>
                            onChangeShelfClearance(
                              selectedColumn.id,
                              activeSlot.id,
                              gIdx,
                              Number(e.target.value),
                            )
                          }
                          className="w-20 accent-[#B47B44]"
                        />
                        <span className="w-14 text-right font-mono-tabular text-[11px] text-zinc-200">
                          {Math.round(gapCm * 10)} мм
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Drawers Count & Slide Mechanism */}
        {isDrawerSlotType(activeSlot.type) && (
          <div className="space-y-2 border-t border-[#252D3F] pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-300">{t(lang, 'drawersCountLabel')}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onSetDrawerCount(
                      selectedColumn.id,
                      activeSlot.id,
                      getDrawerCount(activeSlot) - 1,
                    )
                  }
                  className="h-6 w-6 rounded bg-[#1A2233] text-xs font-bold text-white hover:bg-[#27324A]"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono-tabular text-xs font-semibold text-white">
                  {getDrawerCount(activeSlot)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onSetDrawerCount(
                      selectedColumn.id,
                      activeSlot.id,
                      getDrawerCount(activeSlot) + 1,
                    )
                  }
                  className="h-6 w-6 rounded bg-[#1A2233] text-xs font-bold text-white hover:bg-[#27324A]"
                >
                  +
                </button>
              </div>
            </div>

            {activeDrawerMetrics && (
              <div className="rounded-lg border border-[#252D3F] bg-[#0D111A] p-2 text-[11px] text-zinc-300 font-mono-tabular">
                {activeDrawerMetrics.drawerCount} ×{' '}
                {Math.round(activeDrawerMetrics.frontHeightCm * 10)} ×{' '}
                {Math.round(activeDrawerMetrics.frontWidthCm * 10)} мм
              </div>
            )}

            <div className="space-y-1">
              {(
                [
                  ['ball_bearing', t(lang, 'slideBallBearing')],
                  ['telescopic_soft', t(lang, 'slideTelescopic')],
                  ['blum_hidden', t(lang, 'slideBlumHidden')],
                ] as [DrawerSlideType, string][]
              ).map(([slideKey, slideLabel]) => {
                const currentSlide: DrawerSlideType =
                  activeSlot.drawerSlideType ||
                  (config.hardwareTierId === 'hw_blum'
                    ? 'blum_hidden'
                    : config.hardwareTierId === 'hw_gtv' ||
                        config.hardwareTierId === 'hw_hettich'
                      ? 'telescopic_soft'
                      : 'ball_bearing');
                return (
                  <button
                    key={slideKey}
                    type="button"
                    onClick={() => onSetDrawerSlide(selectedColumn.id, activeSlot.id, slideKey)}
                    className={`w-full rounded border px-2 py-1 text-left text-[11px] transition-colors ${
                      currentSlide === slideKey
                        ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                        : 'border-[#252D3F] bg-[#141A26] text-zinc-300'
                    }`}
                  >
                    {slideLabel}
                  </button>
                );
              })}
            </div>

            {/* Editable Drawer Dimensions (Width / Height / Depth in mm) */}
            <div className="space-y-1.5 border-t border-[#252D3F] pt-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-200">
                  {lang === 'bg' ? 'Размери на чекмеджето (мм)' : 'Drawer Dimensions (mm)'}
                </span>
                <span className="rounded bg-[#171E2C] border border-[#2C354A] px-1.5 py-0.5 text-[10px] font-mono-tabular text-[#E6B88A]">
                  {lang === 'bg'
                    ? `Водач: ${resolveDrawerSlideLengthMm(realCarcassDepthMm)} мм`
                    : `Slide: ${resolveDrawerSlideLengthMm(realCarcassDepthMm)} mm`}
                </span>
              </div>

              <MmDimensionControl
                label={lang === 'bg' ? 'Ширина (мм)' : 'Width (mm)'}
                valueMm={Math.round(selectedColumn.widthCm * 10)}
                minMm={250}
                maxMm={1800}
                stepMm={1}
                buttonStepMm={10}
                showButtons
                showSlider={false}
                onChangeMm={(mm) =>
                  onUpdateDrawerDimensions(selectedColumn.id, activeSlot.id, { widthMm: mm })
                }
              />

              <MmDimensionControl
                label={
                  lang === 'bg'
                    ? 'Височина (мм) — секция'
                    : 'Height (mm) — section'
                }
                valueMm={Math.round(activeSlotExteriorCm * 10)}
                minMm={100}
                maxMm={2200}
                stepMm={1}
                buttonStepMm={10}
                showButtons
                showSlider={false}
                onChangeMm={(mm) =>
                  onUpdateDrawerDimensions(selectedColumn.id, activeSlot.id, { slotHeightMm: mm })
                }
              />

              <MmDimensionControl
                label={lang === 'bg' ? 'Дълбочина (мм)' : 'Depth (mm)'}
                valueMm={realCarcassDepthMm}
                minMm={220}
                maxMm={800}
                stepMm={1}
                buttonStepMm={10}
                showButtons
                showSlider={false}
                onChangeMm={(mm) =>
                  onUpdateDrawerDimensions(selectedColumn.id, activeSlot.id, {
                    depthMm: bayHasVitrine ? mm + 2 : mm,
                  })
                }
              />
            </div>
          </div>
        )}

        {/* Prominent Delete Module Button */}
        {canDeleteSelectedColumn && (
          <div className="border-t border-[#252D3F] pt-3">
            <button
              type="button"
              onClick={() => onRemoveColumn(selectedColumn.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/45 bg-rose-950/60 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-700 hover:text-white transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{lang === 'bg' ? 'Изтрий модула' : 'Delete Module'}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
