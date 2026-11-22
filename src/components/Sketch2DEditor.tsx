import React from 'react';
import {
  columnHasVitrine,
  computeDrawerFrontMetrics,
  computeSlotClearancesCm,
  getBayCarcassDepthMm,
  getDrawerCount,
  isDrawerSlotType,
  resolveDrawerSlideLengthMm,
} from '../lib/carpentryEngine';
import {
  BoardDecor,
  ColumnConfig,
  FurnitureConfig,
  Language,
  SlotType,
} from '../types/furniture';

interface Sketch2DEditorProps {
  lang: Language;
  config: FurnitureConfig;
  decors: BoardDecor[];
  selectedColumnId: string | null;
  onSelectColumn: (colId: string) => void;
  onUpdateSlotType: (colId: string, slotId: string, nextType: SlotType) => void;
  onSplitColumn: (colId: string) => void;
  onSplitSlotVertically: (colId: string, slotId: string) => void;
  onExportDxf?: () => void;
}

const SLOT_LABELS: Record<SlotType, { bg: string; en: string }> = {
  door_left: { bg: 'Врата (Л)', en: 'Door (L)' },
  door_right: { bg: 'Врата (Д)', en: 'Door (R)' },
  door_double: { bg: 'Двойна врата', en: 'Double Door' },
  glass_door: { bg: 'Витрина (стък.)', en: 'Glass Door' },
  glass_double: { bg: 'Двойна витрина', en: 'Double Glass' },
  flap_up: { bg: 'Клапа горе', en: 'Lift Flap' },
  cargo_basket: { bg: 'Карго кошница', en: 'Cargo Pull-out' },
  drawers_1: { bg: '1 Чекмед.', en: '1 Drawer' },
  drawers_2: { bg: '2 Чекмед.', en: '2 Drawers' },
  drawers_3: { bg: '3 Чекмед.', en: '3 Drawers' },
  drawers_4: { bg: '4 Чекмед.', en: '4 Drawers' },
  drawers_5: { bg: '5 Чекмед.', en: '5 Drawers' },
  drawers_6: { bg: '6 Чекмед.', en: '6 Drawers' },
  open_shelves: { bg: 'Рафтове', en: 'Open Shelves' },
  oven_hob: { bg: 'Фурна/Котл.', en: 'Oven/Hob' },
  oven_only: { bg: 'Фурна', en: 'Built-in Oven' },
  hob_only: { bg: 'Котлони', en: 'Cooktop/Hob' },
  dishwasher: { bg: 'Съдомиялна', en: 'Dishwasher' },
  washing_machine: { bg: 'Пералня', en: 'Washer' },
  dryer: { bg: 'Сушилня', en: 'Dryer' },
  extractor_hood: { bg: 'Аспиратор', en: 'Extractor' },
  sink_unit: { bg: 'Мивка', en: 'Sink Base' },
  fridge_builtin: { bg: 'Хладилник', en: 'Fridge' },
  microwave: { bg: 'Микровълн.', en: 'Microwave' },
  trouser_rack: { bg: 'Панталонник', en: 'Trouser Rack' },
  double_hanging_rod: { bg: 'Двоен лост', en: 'Double Rail' },
  shoe_rack: { bg: 'Обувки', en: 'Shoe Rack' },
  coat_panel: { bg: 'Закачалка', en: 'Coat Panel' },
  bench_seat: { bg: 'Пейка', en: 'Bench Seat' },
  mirror_front: { bg: 'Огледало', en: 'Mirror Door' },
  tv_niche: { bg: 'ТВ ниша', en: 'TV Niche' },
  corner_blind: { bg: 'Глух ъгъл', en: 'Blind Corner' },
};

export const Sketch2DEditor: React.FC<Sketch2DEditorProps> = ({
  lang,
  config,
  decors,
  selectedColumnId,
  onSelectColumn,
  onUpdateSlotType,
  onSplitColumn,
  onSplitSlotVertically,
  onExportDxf,
}) => {
  const carcassDecor = decors.find((d) => d.id === config.carcassDecorId);
  const frontDecor = decors.find((d) => d.id === config.frontDecorId);
  const frontColor = frontDecor?.colorHex || '#ECEAE4';
  const carcassColor = carcassDecor?.colorHex || '#DFDDD6';

  const isEmpty = config.columns.length === 0 && config.wingColumns.length === 0;
  if (isEmpty) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#161618] p-6 text-center text-zinc-300">
        <div className="max-w-md rounded-xl border border-zinc-800 bg-zinc-900/70 px-6 py-8 space-y-2">
          <div className="text-sm font-semibold text-white">
            {lang === 'bg' ? 'Празен проект (0 модула)' : 'Empty Project (0 modules)'}
          </div>
          <p className="text-xs text-zinc-400">
            {lang === 'bg'
              ? 'Изберете категория от горното меню (напр. „Кухня — Долни“ или „Гардероби“), за да добавите модул или шаблон.'
              : 'Pick a category folder in the top bar to add a module or load a template.'}
          </p>
        </div>
      </div>
    );
  }

  // Build visual blueprint SVG geometry (scaled cleanly)
  const marginX = 48;
  const marginY = 38;
  const svgW = 760;
  const svgH = 440;
  const drawW = svgW - marginX * 2;
  const drawH = svgH - marginY * 2;

  const counterMm = config.category === 'kitchen' ? config.countertopThicknessMm || 40 : 0;
  const backMm = config.includeBacksplash
    ? Math.min(600, Math.max(100, config.backsplashHeightMm ?? 600))
    : 0;
  const upperGapCm = config.includeBacksplash ? Math.max(56, backMm / 10) : 58;

  const maxBayHeightCm = Math.max(
    config.heightCm,
    ...config.columns.map((c) => (c.heightCm || config.heightCm) + (c.isSuspended ? c.elevationCm || 28 : 0)),
  );
  const totalDesignHeight =
    config.category === 'kitchen' && config.includeUpperCabinets
      ? Math.max(maxBayHeightCm, config.heightCm + counterMm / 10 + upperGapCm + config.upperHeightCm)
      : maxBayHeightCm + counterMm / 10;

  const scale = Math.min(drawW / Math.max(80, config.widthCm), drawH / Math.max(60, totalDesignHeight));
  const runPxW = config.widthCm * scale;
  const startX = (svgW - runPxW) / 2;
  const basePxH = config.heightCm * scale;
  const plinthPxH = config.plinthCm * scale;
  const baseTopY = svgH - marginY - basePxH;
  const floorY = svgH - marginY;

  const renderColumns = (cols: ColumnConfig[], originX: number, topY: number, boxH: number, isUpper = false) => {
    let cursorX = originX;
    return cols.map((col) => {
      const colW = col.widthCm * scale;
      const x = cursorX;
      cursorX += colW;
      const isSelected = col.id === selectedColumnId;

      const colEffectiveCm = isUpper ? config.upperHeightCm : col.heightCm || config.heightCm;
      const colPlinthPx = isUpper || col.isSuspended ? 0 : plinthPxH;
      const colElevPx = !isUpper && col.isSuspended ? (col.elevationCm ?? 28) * scale : 0;
      const colBoxH = isUpper ? boxH : Math.max(24, colEffectiveCm * scale - colPlinthPx);
      const colTopY = isUpper ? topY : floorY - colElevPx - colPlinthPx - colBoxH;

      const ratioSum = col.slots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;
      let cursorY = colTopY;

      return (
        <g
          key={col.id}
          onClick={() => onSelectColumn(col.id)}
          className="cursor-pointer"
        >
          {/* Carcass border */}
          <rect
            x={x}
            y={colTopY}
            width={colW}
            height={colBoxH}
            fill={carcassColor}
            stroke={isSelected ? '#B47B44' : '#52525B'}
            strokeWidth={isSelected ? 2.5 : 1.2}
          />

          {/* Slots */}
          {col.slots.map((slot) => {
            const slotH = colBoxH * (Math.max(0.1, slot.heightRatio) / ratioSum);
            const y = cursorY;
            cursorY += slotH;
            const label = SLOT_LABELS[slot.type]?.[lang] || slot.type;

            const isDrawer = isDrawerSlotType(slot.type);
            const drawerCount = isDrawer ? Math.max(1, getDrawerCount(slot)) : 0;
            const slotRealCm = Math.max(10, slotH / scale);
            const shelfCount = slot.internalShelves || 0;
            const clearancesCm =
              shelfCount > 0
                ? computeSlotClearancesCm(slotRealCm, shelfCount, slot.shelfClearancesCm)
                : [];

            return (
              <g key={slot.id}>
                {slot.type === 'open_shelves' ? (
                  <>
                    <rect
                      x={x + 3}
                      y={y + 3}
                      width={Math.max(4, colW - 6)}
                      height={Math.max(4, slotH - 6)}
                      fill={carcassColor}
                      stroke="#71717A"
                      strokeDasharray="3 2"
                    />
                    {(() => {
                      let bottomCursorPx = y + slotH;
                      return Array.from({ length: shelfCount }).map((_, si) => {
                        const gapPx = (clearancesCm[si] ?? slotRealCm / (shelfCount + 1)) * scale;
                        bottomCursorPx -= gapPx;
                        const shelfY = Math.max(y + 4, bottomCursorPx - 0.9 * scale);
                        bottomCursorPx -= 1.8 * scale;
                        return (
                          <line
                            key={si}
                            x1={x + 4}
                            y1={shelfY}
                            x2={x + colW - 4}
                            y2={shelfY}
                            stroke="#52525B"
                            strokeWidth={2}
                          />
                        );
                      });
                    })()}
                  </>
                ) : isDrawer ? (
                  (() => {
                    const isGola = config.handleStyle === 'gola_profile';
                    const gapPx = isGola ? 3 * scale : 2;
                    const metrics = computeDrawerFrontMetrics(
                      slotRealCm,
                      drawerCount,
                      col.widthCm,
                      config.handleStyle,
                    );
                    const totalGapsPx = isGola ? drawerCount * gapPx : Math.max(0, drawerCount - 1) * gapPx;
                    const eachFrontPx = Math.max(4, (slotH - 4 - totalGapsPx) / drawerCount);

                    return Array.from({ length: drawerCount }).map((_, di) => {
                      const gapOffsetTop = isGola ? (di + 1) * gapPx : di * gapPx;
                      const dy = y + 2 + gapOffsetTop + di * eachFrontPx;
                      return (
                        <g key={di}>
                          {/* Recessed L-profile (top) or C-profile (between drawers) 3 cm grip channel */}
                          {isGola && (
                            <rect
                              x={x + 3}
                              y={dy - gapPx}
                              width={Math.max(4, colW - 6)}
                              height={Math.max(2, gapPx)}
                              fill="#27272A"
                              stroke="#52525B"
                              strokeWidth={0.5}
                            />
                          )}
                          <rect
                            x={x + 3}
                            y={dy}
                            width={Math.max(4, colW - 6)}
                            height={Math.max(4, eachFrontPx)}
                            fill={frontColor}
                            stroke="#3F3F46"
                            strokeWidth={1}
                          />
                          {!isGola && (
                            <line
                              x1={x + colW * 0.35}
                              y1={dy + eachFrontPx / 2}
                              x2={x + colW * 0.65}
                              y2={dy + eachFrontPx / 2}
                              stroke="#27272A"
                              strokeWidth={2}
                            />
                          )}
                          <text
                            x={x + colW - 7}
                            y={dy + eachFrontPx / 2 + 3}
                            textAnchor="end"
                            className="pointer-events-none fill-zinc-700 font-mono-tabular text-[8px] font-semibold"
                          >
                            {metrics.frontHeightCm}см
                          </text>
                        </g>
                      );
                    });
                  })()
                ) : (
                  <>
                    {!isUpper && config.handleStyle === 'gola_profile' && (
                      <rect
                        x={x + 3}
                        y={y + 3}
                        width={Math.max(4, colW - 6)}
                        height={Math.max(3, 3 * scale)}
                        fill="#27272A"
                        stroke="#52525B"
                        strokeWidth={0.5}
                      />
                    )}
                    <rect
                      x={x + 3}
                      y={!isUpper && config.handleStyle === 'gola_profile' ? y + 3 + 3 * scale : y + 3}
                      width={Math.max(4, colW - 6)}
                      height={Math.max(
                        4,
                        slotH - 6 - (!isUpper && config.handleStyle === 'gola_profile' ? 3 * scale : 0),
                      )}
                      fill={
                        slot.type === 'oven_hob' || slot.type === 'oven_only'
                          ? '#27272A'
                          : slot.type === 'washing_machine' || slot.type === 'dryer'
                            ? '#E4E4E7'
                            : slot.type === 'glass_door' || slot.type === 'glass_double'
                              ? '#334155'
                              : frontColor
                      }
                      fillOpacity={slot.type === 'glass_door' || slot.type === 'glass_double' ? 0.48 : 1}
                      stroke={slot.type === 'glass_door' || slot.type === 'glass_double' ? '#09090B' : '#3F3F46'}
                      strokeWidth={slot.type === 'glass_door' || slot.type === 'glass_double' ? 3 : 1}
                    />
                    {slot.type === 'cargo_basket' && (
                      <>
                        <line x1={x + 6} y1={y + slotH * 0.35} x2={x + colW - 6} y2={y + slotH * 0.35} stroke="#71717A" strokeDasharray="3 2" />
                        <line x1={x + 6} y1={y + slotH * 0.68} x2={x + colW - 6} y2={y + slotH * 0.68} stroke="#71717A" strokeDasharray="3 2" />
                      </>
                    )}
                    {(slot.type === 'washing_machine' || slot.type === 'dryer') && (
                      <circle
                        cx={x + colW / 2}
                        cy={y + slotH * 0.56}
                        r={Math.max(5, Math.min(colW, slotH) * 0.25)}
                        fill="#27272A"
                        stroke="#71717A"
                        strokeWidth={2}
                      />
                    )}
                    {/* Hinge swing dashed lines */}
                    {(slot.type === 'door_left' || slot.type === 'glass_door') && (
                      <polyline
                        points={`${x + 4},${y + 4} ${x + colW - 4},${y + slotH / 2} ${x + 4},${y + slotH - 4}`}
                        fill="none"
                        stroke="#71717A"
                        strokeWidth={0.9}
                        strokeDasharray="4 3"
                      />
                    )}
                    {slot.type === 'door_right' && (
                      <polyline
                        points={`${x + colW - 4},${y + 4} ${x + 4},${y + slotH / 2} ${x + colW - 4},${y + slotH - 4}`}
                        fill="none"
                        stroke="#71717A"
                        strokeWidth={0.9}
                        strokeDasharray="4 3"
                      />
                    )}
                    {(slot.type === 'door_double' || slot.type === 'glass_double') && (
                      <>
                        <line
                          x1={x + colW / 2}
                          y1={y + 3}
                          x2={x + colW / 2}
                          y2={y + slotH - 3}
                          stroke="#3F3F46"
                          strokeWidth={1.2}
                        />
                      </>
                    )}
                    {slot.type === 'flap_up' && (
                      <polyline
                        points={`${x + 4},${y + slotH - 4} ${x + colW / 2},${y + 4} ${x + colW - 4},${y + slotH - 4}`}
                        fill="none"
                        stroke="#71717A"
                        strokeWidth={0.9}
                        strokeDasharray="4 3"
                      />
                    )}
                  </>
                )}
                <text
                  x={x + colW / 2}
                  y={y + slotH / 2 + 4}
                  textAnchor="middle"
                  className="pointer-events-none fill-zinc-900 text-[10px] font-medium"
                  style={{
                    paintOrder: 'stroke',
                    stroke: 'rgba(255,255,255,0.8)',
                    strokeWidth: 3,
                  }}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Column width & real carcass depth label (shown for vitrine or custom bay depth) */}
          <text
            x={x + colW / 2}
            y={svgH - 12}
            textAnchor="middle"
            className="fill-zinc-300 font-mono-tabular text-[11px]"
          >
            {Math.round(col.widthCm * 10)} мм
            {columnHasVitrine(col) ||
            (!isUpper &&
              typeof col.depthCm === 'number' &&
              Math.round(col.depthCm * 10) !== Math.round(config.depthCm * 10))
              ? ` · Д:${getBayCarcassDepthMm(config, col, isUpper)}мм`
              : ''}
          </text>
        </g>
      );
    });
  };

  const selectedCol =
    config.columns.find((c) => c.id === selectedColumnId) || config.columns[0];

  return (
    <div className="flex h-full w-full flex-col bg-[#161618] text-zinc-100">
      {/* Blueprint SVG Canvas */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="h-full w-full max-h-[470px] select-none"
        >
          {/* Architectural grid */}
          <defs>
            <pattern id="blueprintGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={svgW} height={svgH} fill="url(#blueprintGrid)" rx={8} />

          {/* Thermopanel Backsplash (8/10/12/15mm thick, max 600mm tall) */}
          {config.category === 'kitchen' && config.includeBacksplash && (
            <g>
              <rect
                x={startX}
                y={baseTopY - Math.max(3, (counterMm / 10) * scale) - (backMm / 10) * scale}
                width={runPxW}
                height={(backMm / 10) * scale}
                fill="#27272A"
                fillOpacity={0.5}
                stroke="#52525B"
                strokeDasharray="4 2"
              />
              <text
                x={startX + 8}
                y={baseTopY - Math.max(3, (counterMm / 10) * scale) - 6}
                className="fill-zinc-300 font-mono-tabular text-[9px]"
              >
                {lang === 'bg'
                  ? `Термо гръб ${config.backsplashThicknessMm || 10} мм · ${backMm} мм`
                  : `Backsplash ${config.backsplashThicknessMm || 10} mm · ${backMm} mm`}
              </text>
            </g>
          )}

          {/* Upper kitchen cabinets if enabled (skip tall columns > 130 cm) */}
          {config.category === 'kitchen' && config.includeUpperCabinets && (() => {
            let upX = startX;
            return config.columns.map((c) => {
              const cw = c.widthCm * scale;
              const bx = upX;
              upX += cw;
              if ((c.heightCm || config.heightCm) > 130) return null;
              const hasHob = c.slots.some((sl) => sl.type === 'oven_hob' || sl.type === 'hob_only');
              const resolvedUpper = c.upperType || (hasHob ? 'extractor_builtin' : 'doors');
              const uCol: ColumnConfig = {
                ...c,
                slots: [
                  {
                    id: `${c.id}_u`,
                    heightRatio: 1,
                    type:
                      resolvedUpper === 'flap_up'
                        ? 'flap_up'
                        : resolvedUpper === 'glass_doors'
                          ? c.widthCm > 60
                            ? 'glass_double'
                            : 'glass_door'
                          : resolvedUpper === 'extractor_builtin' || resolvedUpper === 'extractor_chimney'
                            ? 'extractor_hood'
                            : c.widthCm > 60
                              ? 'door_double'
                              : 'door_left',
                    internalShelves: 1,
                  },
                ],
              };
              const upTopY = baseTopY - Math.max(3, (counterMm / 10) * scale) - (upperGapCm + config.upperHeightCm) * scale;
              return (
                <g key={`${c.id}_upg`}>
                  {renderColumns([uCol], bx, upTopY, config.upperHeightCm * scale, true)}
                  {config.upperProfileStyle && config.upperProfileStyle !== 'none' && (
                    <rect
                      x={bx + 1}
                      y={baseTopY - Math.max(3, (counterMm / 10) * scale) - upperGapCm * scale - 2}
                      width={Math.max(4, cw - 2)}
                      height={config.upperProfileStyle === 'led_double' ? 4 : 2.5}
                      fill={config.upperProfileStyle === 'recessed_bottom' ? '#52525B' : '#FCD34D'}
                    />
                  )}
                </g>
              );
            });
          })()}

          {/* Kitchen Countertop segments (20 / 30 / 40 mm) over low base bays only */}
          {config.category === 'kitchen' && (() => {
            let ctX = startX;
            return config.columns.map((c) => {
              const cw = c.widthCm * scale;
              const x = ctX;
              ctX += cw;
              if ((c.heightCm || config.heightCm) > 130) return null;
              return (
                <rect
                  key={`${c.id}_ct`}
                  x={x}
                  y={baseTopY - Math.max(3, (counterMm / 10) * scale)}
                  width={cw}
                  height={Math.max(3, (counterMm / 10) * scale)}
                  fill="#52525B"
                  stroke="#A1A1AA"
                  strokeWidth={0.8}
                />
              );
            });
          })()}

          {/* Base Run Columns */}
          {renderColumns(config.columns, startX, baseTopY, basePxH - plinthPxH, false)}

          {/* Plinth */}
          {plinthPxH > 0 && (
            <rect
              x={startX}
              y={svgH - marginY - plinthPxH}
              width={runPxW}
              height={plinthPxH}
              fill="#27272A"
              stroke="#52525B"
            />
          )}

          {/* Dimension annotations (overall outer only, no cut-list) */}
          <line
            x1={startX}
            y1={svgH - 26}
            x2={startX + runPxW}
            y2={svgH - 26}
            stroke="#C8935A"
            strokeWidth={1.2}
          />
          <text
            x={startX - 18}
            y={baseTopY + basePxH / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${startX - 18} ${baseTopY + basePxH / 2})`}
            className="fill-[#D49B62] font-mono-tabular text-[11px]"
          >
            {config.heightCm} cm
          </text>
          {config.layoutShape === 'l_shape' && (
            <text
              x={svgW / 2}
              y={22}
              textAnchor="middle"
              className="fill-amber-300 text-[11px] font-medium"
            >
              {lang === 'bg'
                ? `Г-образна схема: рамо А (${config.widthCm} см) + бленда 6 см + рамо Б (${config.wingWidthCm} см) · Корпус ${config.depthCm} см`
                : `L-Shape Plan: Run A (${config.widthCm} cm) + 6 cm filler + Run B (${config.wingWidthCm} cm) · ${config.depthCm} cm Carcass`}
            </text>
          )}
        </svg>
      </div>

      {/* Selected Column Quick 2D Editor Bar */}
      {selectedCol && (
        <div className="border-t border-zinc-800 bg-zinc-900/95 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-[#D49B62] font-mono-tabular">
              {(() => {
                const bayD = getBayCarcassDepthMm(config, selectedCol, false);
                const hasDrawers = selectedCol.slots.some((sl) => isDrawerSlotType(sl.type));
                const slideHint = hasDrawers
                  ? lang === 'bg'
                    ? ` · Водач ${resolveDrawerSlideLengthMm(bayD)} мм`
                    : ` · Slide ${resolveDrawerSlideLengthMm(bayD)} mm`
                  : '';
                return lang === 'bg'
                  ? `Секция (${Math.round(selectedCol.widthCm * 10)} мм · Д: ${bayD} мм${columnHasVitrine(selectedCol) ? ' (−2 мм профил 20 мм)' : ''}${slideHint}):`
                  : `Bay (${Math.round(selectedCol.widthCm * 10)} mm · D: ${bayD} mm${columnHasVitrine(selectedCol) ? ' (−2 mm for 20 mm)' : ''}${slideHint}):`;
              })()}
            </span>
            {selectedCol.slots.map((slot, sIdx) => (
              <div key={slot.id} className="flex items-center gap-1.5">
                <span className="text-zinc-400">#{sIdx + 1}</span>
                <select
                  value={slot.type}
                  onChange={(e) =>
                    onUpdateSlotType(selectedCol.id, slot.id, e.target.value as SlotType)
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-[#B47B44] focus:outline-none"
                >
                  {(Object.keys(SLOT_LABELS) as SlotType[]).map((st) => (
                    <option key={st} value={st}>
                      {SLOT_LABELS[st][lang]}
                    </option>
                  ))}
                </select>
                {selectedCol.slots.length < 2 && (
                  <button
                    type="button"
                    onClick={() => onSplitSlotVertically(selectedCol.id, slot.id)}
                    className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-[#B47B44] hover:text-white"
                  >
                    {lang === 'bg' ? '+ Раздели по височина' : '+ Split Height'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {onExportDxf && (
              <button
                type="button"
                onClick={onExportDxf}
                className="rounded-md bg-[#B47B44] px-3 py-1.5 font-semibold text-white hover:bg-[#9E6835] transition-colors"
              >
                {lang === 'bg' ? 'AutoCAD (.DXF)' : 'AutoCAD (.DXF)'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onSplitColumn(selectedCol.id)}
              className="rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 font-medium text-zinc-100 hover:border-[#B47B44] transition-colors"
            >
              {lang === 'bg' ? 'Раздели колоната с делител' : 'Split Bay with Divider'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
