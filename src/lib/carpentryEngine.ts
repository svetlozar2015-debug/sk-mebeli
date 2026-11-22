import {
  BomSummary,
  ColumnConfig,
  FurnitureConfig,
  HandleStyle,
  HardwareTierLevel,
  SlotConfig,
  SlotType,
  StructuralNotice,
} from '../types/furniture';

const BOARD_THICKNESS_M = 0.018;
const BOARD_THICKNESS_CM = 1.8;
const MAX_UNSUPPORTED_SPAN_CM = 90;
const MAX_SINGLE_DOOR_CM = 60;
const L_CORNER_FILLER_CM = 6;

export const GOLA_L_TOTAL_CM = 5;
export const GOLA_L_COVER_CM = 2;
export const GOLA_C_TOTAL_CM = 7;
export const GOLA_C_COVER_CM = 2;
export const GOLA_VISIBLE_GAP_CM = 3;

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export const STANDARD_DOOR_THICKNESS_MM = 18;
export const VITRINE_PROFILE_THICKNESS_MM = 20;
export const VITRINE_DEPTH_DEDUCTION_MM =
  VITRINE_PROFILE_THICKNESS_MM - STANDARD_DOOR_THICKNESS_MM; // 2 mm

export function isVitrineSlotType(type?: SlotType | null): boolean {
  return type === 'glass_door' || type === 'glass_double';
}

export function isStandardDoorSlotType(type?: SlotType | null): boolean {
  return type === 'door_left' || type === 'door_right' || type === 'door_double';
}

export function columnHasVitrine(col?: ColumnConfig | null): boolean {
  return Boolean(col?.slots?.some((sl) => isVitrineSlotType(sl.type)));
}

export function upperBayHasVitrine(col?: ColumnConfig | null): boolean {
  return col?.upperType === 'glass_doors';
}

export const STANDARD_DRAWER_SLIDE_LENGTHS_MM = [250, 300, 350, 400, 450, 500, 550] as const;

export function resolveDrawerSlideLengthMm(carcassDepthMm: number): number {
  const safeDepthMm = Math.max(220, Math.round(carcassDepthMm || 500));
  const innerClearanceMm = safeDepthMm - 25; // 4 mm HDF back + front/rear runner clearance
  let matched: number = STANDARD_DRAWER_SLIDE_LENGTHS_MM[0];
  for (const len of STANDARD_DRAWER_SLIDE_LENGTHS_MM) {
    if (len <= innerClearanceMm) {
      matched = len;
    }
  }
  return matched;
}

export function getDrawerSlideLengthMultiplier(slideLengthMm: number): number {
  switch (slideLengthMm) {
    case 250:
      return 0.72;
    case 300:
      return 0.78;
    case 350:
      return 0.86;
    case 400:
      return 0.93;
    case 450:
      return 1.0;
    case 500:
      return 1.12;
    case 550:
      return 1.24;
    default:
      return Math.max(0.7, Math.min(1.3, Number((slideLengthMm / 450).toFixed(2))));
  }
}

export function getBayCarcassDepthMm(
  config: Pick<FurnitureConfig, 'depthCm' | 'upperDepthCm'>,
  col?: ColumnConfig | null,
  isUpper = false,
): number {
  const baseCm = isUpper
    ? config.upperDepthCm || 32
    : col && typeof col.depthCm === 'number' && Number.isFinite(col.depthCm)
      ? col.depthCm
      : config.depthCm || 58;
  const baseDepthMm = Math.round(baseCm * 10);
  if (!col) return baseDepthMm;
  const hasVitrine = isUpper ? upperBayHasVitrine(col) : columnHasVitrine(col);
  return hasVitrine
    ? Math.max(180, baseDepthMm - VITRINE_DEPTH_DEDUCTION_MM)
    : baseDepthMm;
}

export function getBayFrontThicknessMm(
  col?: ColumnConfig | null,
  isUpper = false,
): 18 | 20 {
  if (!col) return STANDARD_DOOR_THICKNESS_MM;
  const hasVitrine = isUpper ? upperBayHasVitrine(col) : columnHasVitrine(col);
  return hasVitrine ? VITRINE_PROFILE_THICKNESS_MM : STANDARD_DOOR_THICKNESS_MM;
}

export function isDrawerSlotType(type: SlotType): boolean {
  return type.startsWith('drawers_');
}

export function getDrawerCount(slot: Pick<SlotConfig, 'type' | 'drawerCount'>): number {
  if (typeof slot.drawerCount === 'number' && slot.drawerCount >= 1) {
    return Math.min(8, Math.round(slot.drawerCount));
  }
  switch (slot.type) {
    case 'drawers_1':
      return 1;
    case 'drawers_2':
      return 2;
    case 'drawers_3':
      return 3;
    case 'drawers_4':
      return 4;
    case 'drawers_5':
      return 5;
    case 'drawers_6':
      return 6;
    default:
      return 0;
  }
}

export interface DrawerFrontMetrics {
  drawerCount: number;
  frontHeightCm: number;
  frontWidthCm: number;
  visibleGapCm: number;
  totalGapCm: number;
  lProfilesCount: number;
  cProfilesCount: number;
  usableInnerHeightCm: number;
}

/**
 * Calculates exact drawer front dimensions for standard handles vs Gola handleless profiles:
 * - Top L-profile (5 cm): front/door overlaps 2 cm, leaving 3 cm grip space above.
 * - Middle C-profile (7 cm): adjacent fronts each overlap 2 cm, leaving 3 cm grip space between drawers.
 * Total visible profile opening for N stacked drawers = 3 cm * N.
 */
export function computeDrawerFrontMetrics(
  slotHeightCm: number,
  drawerCount: number,
  bayWidthCm: number,
  handleStyle: HandleStyle,
): DrawerFrontMetrics {
  const n = Math.max(1, Math.min(8, Math.round(drawerCount)));
  const isGola = handleStyle === 'gola_profile';
  const gapPerDrawer = isGola ? GOLA_VISIBLE_GAP_CM : 0.3;
  const totalGapCm = isGola ? n * GOLA_VISIBLE_GAP_CM : Math.max(0, n - 1) * 0.3;
  const remainingFrontCm = Math.max(4 * n, slotHeightCm - totalGapCm);
  const frontHeightCm = Number((remainingFrontCm / n).toFixed(1));
  const frontWidthCm = Number(Math.max(10, bayWidthCm - 0.4).toFixed(1));

  return {
    drawerCount: n,
    frontHeightCm,
    frontWidthCm,
    visibleGapCm: gapPerDrawer,
    totalGapCm: Number(totalGapCm.toFixed(1)),
    lProfilesCount: isGola ? 1 : 0,
    cProfilesCount: isGola ? Math.max(0, n - 1) : 0,
    usableInnerHeightCm: Number(Math.max(3.5, frontHeightCm - (isGola ? 3.5 : 3.2)).toFixed(1)),
  };
}

/**
 * Computes exact clear vertical spacing (cm) for each compartment (shelves + 1 compartments),
 * subtracting 1.8 cm per 18 mm MFC/MDF shelf board.
 */
export function computeSlotClearancesCm(
  slotInnerHeightCm: number,
  shelvesCount: number,
  existing?: number[],
): number[] {
  const n = Math.max(0, Math.min(8, Math.round(shelvesCount)));
  const totalClear = Math.max(10, slotInnerHeightCm - n * BOARD_THICKNESS_CM);
  const compartments = n + 1;

  if (existing && existing.length === compartments) {
    const sum = existing.reduce((a, b) => a + Math.max(4, b), 0);
    if (sum > 0) {
      const scale = totalClear / sum;
      const scaled = existing.map((v) => Number((Math.max(4, v) * scale).toFixed(1)));
      const diff = Number((totalClear - scaled.reduce((a, b) => a + b, 0)).toFixed(1));
      scaled[scaled.length - 1] = Number((scaled[scaled.length - 1] + diff).toFixed(1));
      return scaled;
    }
  }

  const each = Number((totalClear / compartments).toFixed(1));
  const arr = Array.from({ length: compartments }, () => each);
  const diff = Number((totalClear - arr.reduce((a, b) => a + b, 0)).toFixed(1));
  arr[arr.length - 1] = Number((arr[arr.length - 1] + diff).toFixed(1));
  return arr;
}

/**
 * Updates one compartment's clear height (cm) and rebalances the remaining compartments
 * cleanly so shelves never exceed the interior cabinet height.
 */
export function rebalanceShelfClearances(
  slotInnerHeightCm: number,
  current: number[],
  editedIndex: number,
  nextCm: number,
): number[] {
  const count = current.length;
  if (count <= 1) return [Number(Math.max(8, slotInnerHeightCm).toFixed(1))];
  const nShelves = count - 1;
  const totalClear = Math.max(count * 6, slotInnerHeightCm - nShelves * BOARD_THICKNESS_CM);
  const minGap = 6;
  const maxForEdited = Math.max(minGap, totalClear - (count - 1) * minGap);
  const clamped = Number(Math.max(minGap, Math.min(maxForEdited, nextCm)).toFixed(1));

  const remainingBudget = Number((totalClear - clamped).toFixed(1));
  const otherIndices = current.map((_, i) => i).filter((i) => i !== editedIndex);
  const otherCurrentSum = otherIndices.reduce((s, i) => s + Math.max(minGap, current[i]), 0);

  const result = [...current];
  result[editedIndex] = clamped;

  let allocated = 0;
  otherIndices.forEach((idx, k) => {
    if (k === otherIndices.length - 1) {
      result[idx] = Number(Math.max(minGap, remainingBudget - allocated).toFixed(1));
    } else {
      const share =
        otherCurrentSum > 0
          ? (Math.max(minGap, current[idx]) / otherCurrentSum) * remainingBudget
          : remainingBudget / otherIndices.length;
      const rounded = Number(Math.max(minGap, share).toFixed(1));
      result[idx] = rounded;
      allocated += rounded;
    }
  });
  return result;
}

export function createEmptyFurnitureConfig(): FurnitureConfig {
  return {
    templateId: 'empty',
    category: 'kitchen',
    layoutShape: 'straight',
    cornerSide: 'right',
    widthCm: 0,
    heightCm: 86,
    depthCm: 58,
    wingWidthCm: 0,
    plinthCm: 10,
    includeUpperCabinets: false,
    upperHeightCm: 72,
    upperDepthCm: 32,
    upperProfileStyle: 'none',
    countertopThicknessMm: 40,
    includeBacksplash: false,
    backsplashThicknessMm: 10,
    backsplashHeightMm: 600,
    carcassDecorId: 'kron_k001',
    frontDecorId: 'egger_u708',
    countertopDecorId: 'egger_f206',
    backsplashDecorId: 'egger_f206',
    hardwareTierId: 'hw_gtv',
    handleStyle: 'standard_bar',
    edgeBandingType: 'eva',
    wardrobeDoorStyle: 'hinged',
    includeClothesRails: false,
    includeCornerMechanism: false,
    columns: [],
    wingColumns: [],
    deliveryFloor: 0,
    hasElevator: false,
    outsideCityKm: 0,
  };
}

/**
 * Normalizes and enforces real-world MFC/MDF carpentry standards:
 * 1. If a straight run > 90 cm has columns > 90 cm wide, automatically inserts vertical dividers (splits columns <= 90 cm).
 * 2. If a column > 60 cm wide has a single-leaf door (door_left or door_right), upgrades to door_double.
 * 3. For L-shaped kitchens, enforces minimum 58 cm lower carcass depth (or warns if < 56 cm) + corner filler clearance.
 * 4. Ensures column widths always sum cleanly to the total run width (accounting for L-corner junction).
 */
export function enforceStructuralStandards(
  raw: FurnitureConfig,
  hardwareTier: HardwareTierLevel = 'economy',
): { config: FurnitureConfig; notices: StructuralNotice[] } {
  const notices: StructuralNotice[] = [];
  const config: FurnitureConfig = structuredClone(raw);

  const isEmptyProject =
    (!config.columns || config.columns.length === 0) &&
    (!config.wingColumns || config.wingColumns.length === 0);

  if (isEmptyProject) {
    config.columns = [];
    config.wingColumns = [];
    config.widthCm = 0;
    config.wingWidthCm = 0;
    config.heightCm = Math.max(35, Math.min(275, Math.round(config.heightCm || 86)));
    config.depthCm = Math.max(20, Math.min(85, Math.round(config.depthCm || 58)));
    config.plinthCm = Math.max(0, Math.min(20, Math.round(config.plinthCm ?? 10)));
    config.cornerSide = config.cornerSide === 'left' ? 'left' : 'right';
    config.includeUpperCabinets = false;
    config.includeBacksplash = false;
    config.includeCornerMechanism = false;
    return { config, notices: [] };
  }

  const roundMmCm = (v: number) => Math.round(v * 10) / 10;

  // Clamp sensible manufacturing limits (in cm, keeping 1 mm resolution)
  config.widthCm = Math.max(25, Math.min(540, roundMmCm(config.widthCm)));
  config.heightCm = Math.max(35, Math.min(275, roundMmCm(config.heightCm)));
  config.depthCm = Math.max(20, Math.min(85, roundMmCm(config.depthCm)));
  config.plinthCm = Math.max(0, Math.min(20, Math.round(config.plinthCm)));
  config.wingWidthCm = Math.max(100, Math.min(360, roundMmCm(config.wingWidthCm || 160)));
  config.cornerSide = config.cornerSide === 'left' ? 'left' : 'right';

  if (config.category === 'kitchen') {
    const validCountertop = [20, 30, 40] as const;
    config.countertopThicknessMm = validCountertop.includes(config.countertopThicknessMm as 20 | 30 | 40)
      ? (config.countertopThicknessMm as 20 | 30 | 40)
      : 40;
    const validBacksplash = [8, 10, 12, 15] as const;
    config.backsplashThicknessMm = validBacksplash.includes(config.backsplashThicknessMm as 8 | 10 | 12 | 15)
      ? (config.backsplashThicknessMm as 8 | 10 | 12 | 15)
      : 10;
    config.backsplashHeightMm = Math.max(
      100,
      Math.min(600, Math.round(config.backsplashHeightMm ?? 600)),
    );
    config.upperProfileStyle = config.upperProfileStyle || 'none';
  }

  if (config.category === 'kitchen' && config.layoutShape === 'l_shape' && config.depthCm < 56) {
    config.depthCm = 58;
    notices.push({
      code: 'KITCHEN_DEPTH_58',
      severity: 'info',
      messageBg: 'За Г-образна кухня корпусът е настроен на стандартните 58 см от стената (под 60 см плот).',
      messageEn: 'L-shaped kitchen lower carcass depth set to standard 58 cm from wall (under 60 cm worktop).',
    });
  }

  // Split any oversized columns (> 90 cm) to prevent shelf sagging & oversized doors
  const splitOversizedColumns = (cols: ColumnConfig[], targetTotalCm: number): ColumnConfig[] => {
    let working: ColumnConfig[] =
      cols.length > 0
        ? cols
        : [
            {
              id: makeId('col'),
              widthCm: targetTotalCm,
              slots: [{ id: makeId('slot'), heightRatio: 1, type: 'door_double', internalShelves: 1 }],
            },
          ];

    working = working.map((c) => ({
      ...c,
      widthCm: Math.max(25, roundMmCm(c.widthCm || 60)),
      slots:
        Array.isArray(c.slots) && c.slots.length > 0
          ? c.slots
          : [{ id: makeId('slot'), heightRatio: 1, type: 'door_double', internalShelves: 1 }],
      heightCm:
        typeof c.heightCm === 'number'
          ? Math.max(35, Math.min(275, roundMmCm(c.heightCm)))
          : undefined,
      depthCm:
        typeof c.depthCm === 'number'
          ? Math.max(20, Math.min(85, roundMmCm(c.depthCm)))
          : undefined,
      elevationCm:
        typeof c.elevationCm === 'number'
          ? Math.max(0, Math.min(180, Math.round(c.elevationCm)))
          : undefined,
    }));

    // Scale column widths proportionally only when out of sync with targetTotalCm (> 1.5 mm)
    const currentSum = working.reduce((s, c) => s + Math.max(20, c.widthCm), 0);
    if (currentSum > 0 && Math.abs(currentSum - targetTotalCm) > 0.15) {
      let running = 0;
      working = working.map((c, idx) => {
        if (idx === working.length - 1) {
          return { ...c, widthCm: Math.max(25, roundMmCm(targetTotalCm - running)) };
        }
        const scaled = Math.max(25, roundMmCm((c.widthCm / currentSum) * targetTotalCm));
        running += scaled;
        return { ...c, widthCm: scaled };
      });
    }

    // Now enforce <= 90 cm per bay by splitting any bay > 90 cm (except corner_blind / bench_seat / shoe_rack up to 120 cm)
    const result: ColumnConfig[] = [];
    for (const col of working) {
      const allowWide =
        col.slots.some((sl) =>
          ['corner_blind', 'bench_seat', 'coat_panel', 'tv_niche'].includes(sl.type),
        ) && col.widthCm <= 125;
      if (col.widthCm > MAX_UNSUPPORTED_SPAN_CM && !allowWide) {
        const parts = Math.ceil(col.widthCm / MAX_UNSUPPORTED_SPAN_CM);
        const baseW = Math.floor(col.widthCm / parts);
        const rem = col.widthCm - baseW * parts;
        for (let i = 0; i < parts; i++) {
          const w = baseW + (i === parts - 1 ? rem : 0);
          result.push({
            ...col,
            id: i === 0 ? col.id : makeId('col'),
            widthCm: w,
            slots: col.slots.map((s): SlotConfig => {
              const nextType: SlotType =
                w <= MAX_SINGLE_DOOR_CM && s.type === 'door_double'
                  ? 'door_left'
                  : w > MAX_SINGLE_DOOR_CM && (s.type === 'door_left' || s.type === 'door_right')
                    ? 'door_double'
                    : s.type;
              return {
                ...s,
                id: i === 0 ? s.id : makeId('slot'),
                type: nextType,
              };
            }),
          });
        }
        notices.push({
          code: 'AUTO_DIVIDER_ADDED',
          severity: 'info',
          messageBg: `Добавен е конструктивен делител (секция ${col.widthCm} см надвишава 90 см лимит за ПДЧ без провисване).`,
          messageEn: `Structural divider added (${col.widthCm} cm bay exceeds 90 cm MFC anti-sag limit).`,
        });
      } else {
        result.push(col);
      }
    }

    // Enforce door width <= 60 cm and drawer/cargo/appliance ergonomic warnings
    return result.map((col) => {
      const effectiveColH = col.heightCm || config.heightCm;
      const effectivePlinth = col.isSuspended ? 0 : config.plinthCm;
      const updatedSlots: SlotConfig[] = col.slots.map((slot) => {
        if ((slot.type === 'door_left' || slot.type === 'door_right') && col.widthCm > MAX_SINGLE_DOOR_CM) {
          notices.push({
            code: 'AUTO_DOUBLE_DOOR',
            severity: 'info',
            messageBg: `Секция ${col.widthCm} см е преобразувана в двойна вратичка (единично крило над 60 см провисва).`,
            messageEn: `Bay (${col.widthCm} cm) switched to double doors (single leaf over 60 cm risks hinge sag).`,
          });
          return { ...slot, type: 'door_double' };
        }
        if (slot.type === 'glass_door' && col.widthCm > MAX_SINGLE_DOOR_CM) {
          return { ...slot, type: 'glass_double' };
        }
        if (slot.type === 'cargo_basket' && col.widthCm > 45) {
          notices.push({
            code: 'CARGO_WIDTH_INFO',
            severity: 'info',
            messageBg: `Карго кошницата в секция ${col.widthCm} см стандартно се изработва до 40–45 см ширина.`,
            messageEn: `Cargo pull-out basket in ${col.widthCm} cm bay is normally 15–45 cm wide.`,
          });
        }
        if (
          isDrawerSlotType(slot.type) &&
          col.widthCm > 80 &&
          (slot.drawerSlideType === 'ball_bearing' ||
            (!slot.drawerSlideType && (hardwareTier === 'economy' || hardwareTier === 'standard')))
        ) {
          notices.push({
            code: 'WIDE_DRAWER_HARDWARE',
            severity: 'warning',
            messageBg: `Чекмедже ${col.widthCm} см изисква скрит водач с плавно прибиране (обикновените сачмени са до 80 см).`,
            messageEn: `Wide drawer (${col.widthCm} cm) recommends concealed soft-close runners (ball-bearing slides support up to 80 cm).`,
          });
        }
        if (config.handleStyle === 'gola_profile' && isDrawerSlotType(slot.type)) {
          const boxH = Math.max(25, effectiveColH - effectivePlinth);
          const rSum = col.slots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;
          const slotCm = boxH * (Math.max(0.1, slot.heightRatio) / rSum);
          const n = getDrawerCount(slot);
          const metrics = computeDrawerFrontMetrics(slotCm, n, col.widthCm, config.handleStyle);
          if (metrics.frontHeightCm < 10) {
            notices.push({
              code: 'GOLA_DRAWER_LOW',
              severity: 'warning',
              messageBg: `С кант профил L+C (3 см отвор) при ${n} чекмеджета всяко чело става ${metrics.frontHeightCm} см — препоръчително е до ${Math.max(2, Math.floor(slotCm / 15))} чекмеджета.`,
              messageEn: `With L+C Gola profile (3 cm gaps), ${n} drawers leave only ${metrics.frontHeightCm} cm per front — consider ${Math.max(2, Math.floor(slotCm / 15))} drawers max.`,
            });
          }
        }
        if ((slot.type === 'washing_machine' || slot.type === 'dryer') && col.widthCm < 60) {
          notices.push({
            code: 'APPLIANCE_WIDTH_60',
            severity: 'warning',
            messageBg: `Секция ${col.widthCm} см е тясна за пералня/сушилня (стандартен отвор минимум 60 см).`,
            messageEn: `Bay (${col.widthCm} cm) is too narrow for a washing machine/dryer (minimum 60 cm opening).`,
          });
        }
        if (slot.type === 'dishwasher' && col.widthCm < 45) {
          notices.push({
            code: 'DISHWASHER_WIDTH_45',
            severity: 'warning',
            messageBg: `Секция ${col.widthCm} см е тясна за съдомиялна (стандарт 45 или 60 см).`,
            messageEn: `Bay (${col.widthCm} cm) is too narrow for a dishwasher (standard 45 or 60 cm).`,
          });
        }
        return slot;
      });
      return { ...col, slots: updatedSlots };
    });
  };

  config.columns = splitOversizedColumns(config.columns, config.widthCm);

  if (config.layoutShape === 'l_shape') {
    const usableWingCm = Math.max(40, config.wingWidthCm - config.depthCm - L_CORNER_FILLER_CM);
    config.wingColumns = splitOversizedColumns(config.wingColumns, usableWingCm);
    notices.push({
      code: 'L_CORNER_CLEARANCE',
      severity: 'info',
      messageBg: `Включена е ъглова бленда (${L_CORNER_FILLER_CM} см, ${
        config.cornerSide === 'left' ? 'ляв ъгъл' : 'десен ъгъл'
      }) и ${config.depthCm} см корпус за свободно отваряне под 90°.`,
      messageEn: `Includes ${L_CORNER_FILLER_CM} cm corner filler (${
        config.cornerSide === 'left' ? 'left corner' : 'right corner'
      }) & ${config.depthCm} cm carcass clearance for 90° swing.`,
    });
  } else {
    config.wingColumns = [];
  }

  // Deduplicate notices by code + message
  const seen = new Set<string>();
  const uniqueNotices = notices.filter((n) => {
    const key = `${n.code}:${n.messageBg}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { config, notices: uniqueNotices };
}

/**
 * Calculates exact Bill of Materials (BOM) for pricing on the server & internal admin breakdown.
 */
export function computeFurnitureBOM(
  rawConfig: FurnitureConfig,
  hardwareTier: HardwareTierLevel = 'economy',
): { normalized: FurnitureConfig; bom: BomSummary } {
  const { config, notices } = enforceStructuralStandards(rawConfig, hardwareTier);

  if (config.columns.length === 0 && config.wingColumns.length === 0) {
    return {
      normalized: config,
      bom: {
        carcassAreaSqm: 0,
        frontAreaSqm: 0,
        glassFrontAreaSqm: 0,
        vitrineDoors: [],
        hdfBackAreaSqm: 0,
        edgeBandingMeters: 0,
        handleMillingMeters: 0,
        countertopMeters: 0,
        backsplashAreaSqm: 0,
        plinthMeters: 0,
        waterSealMeters: 0,
        cutoutsCount: 0,
        cornerMillingCount: 0,
        cargoBasketsCount: 0,
        cornerMechanismsCount: 0,
        slidingTrackMeters: 0,
        slidingDoorsCount: 0,
        slidingRailBars3m: 0,
        slidingRailWasteMeters: 0,
        slidingHandleBars3m: 0,
        slidingHandleWasteMeters: 0,
        clothesRailsMeters: 0,
        hingesCount: 0,
        standardHingesCount: 0,
        softCloseHingesCount: 0,
        cornerHingesCount: 0,
        drawerSlidePairs: 0,
        ballBearingSlidePairs: 0,
        telescopicSlidePairs: 0,
        blumHiddenSlidePairs: 0,
        liftMechanismsCount: 0,
        liftGasCount: 0,
        liftDoubleCount: 0,
        wallHangersCount: 0,
        handlesCount: 0,
        golaLMeters: 0,
        golaCMeters: 0,
        upperProfileMeters: 0,
        legsCount: 0,
        dividersCount: 0,
        sheetsEstimated: 0,
        notices: [],
      },
    };
  }

  let carcassAreaSqm = 0;
  let frontAreaSqm = 0;
  let glassFrontAreaSqm = 0;
  const vitrineDoors: Array<{ widthMm: number; heightMm: number }> = [];
  let hdfBackAreaSqm = 0;
  let edgeBandingMeters = 0;
  let handleMillingMeters = 0;
  let hingesCount = 0;
  let drawerSlidePairs = 0;
  let ballBearingSlidePairs = 0;
  let telescopicSlidePairs = 0;
  let blumHiddenSlidePairs = 0;
  const drawerSlidePairsByLength: Record<string, number> = {};
  const drawerSlideCostUnits = {
    defaultTier: 0,
    ballBearing: 0,
    telescopic: 0,
    blumHidden: 0,
  };
  let liftMechanismsCount = 0;
  let wallHangersCount = 0;
  let handlesCount = 0;
  let golaLMeters = 0;
  let golaCMeters = 0;
  let upperProfileMeters = 0;
  let cargoBasketsCount = 0;
  let extraCornerMechanisms = 0;
  let clothesRailsMeters = 0;
  let cutoutsCount = 0;
  let legsCount = 0;
  let dividersCount = 0;

  const basePlinthM = config.plinthCm / 100;
  const boxHeightM = Math.max(0.25, (config.heightCm - config.plinthCm) / 100);
  const depthM = config.depthCm / 100;
  const isWardrobeSliding = config.category === 'wardrobe' && config.wardrobeDoorStyle === 'sliding';
  const includeClothesRails =
    (config.category === 'wardrobe' || config.category === 'hallway') &&
    config.includeClothesRails !== false;

  const accumulateRun = (cols: ColumnConfig[], runDepthM: number, isUpper: boolean) => {
    if (cols.length === 0) return;
    const totalRunM = cols.reduce((sum, c) => sum + c.widthCm / 100, 0);
    const defaultRunHeightM = isUpper ? config.upperHeightCm / 100 : boxHeightM;
    dividersCount += Math.max(0, cols.length - 1);

    if (isUpper) {
      wallHangersCount += cols.length * 2;
      if (config.upperProfileStyle && config.upperProfileStyle !== 'none') {
        upperProfileMeters += totalRunM;
        if (config.upperProfileStyle === 'recessed_bottom') {
          handleMillingMeters += totalRunM;
        }
      }
    }

    const upperUsesProfile = Boolean(
      isUpper && config.upperProfileStyle && config.upperProfileStyle !== 'none',
    );

    cols.forEach((col, colIdx) => {
      const colW = col.widthCm / 100;
      const colPlinthM = isUpper || col.isSuspended ? 0 : basePlinthM;
      const colHeightM = isUpper
        ? config.upperHeightCm / 100
        : col.heightCm
          ? Math.max(0.25, col.heightCm / 100 - colPlinthM)
          : defaultRunHeightM;

      const baseColDepthM =
        !isUpper && typeof col.depthCm === 'number' && Number.isFinite(col.depthCm)
          ? Math.max(0.2, col.depthCm / 100)
          : runDepthM;

      const colDepthM = Math.max(
        0.18,
        baseColDepthM - (columnHasVitrine(col) ? VITRINE_DEPTH_DEDUCTION_MM / 1000 : 0),
      );

      // Top + Bottom panels + Side walls (left for each bay + right outer wall for last bay) + HDF Back
      carcassAreaSqm += 2 * colW * colDepthM;
      const sideWallsForCol = colIdx === cols.length - 1 ? 2 : 1;
      carcassAreaSqm += sideWallsForCol * colHeightM * colDepthM;
      hdfBackAreaSqm += colW * colHeightM;
      edgeBandingMeters += 2 * colW + sideWallsForCol * colHeightM;

      if (!isUpper && col.isSuspended) {
        wallHangersCount += 2;
      } else if (!isUpper && colPlinthM > 0) {
        carcassAreaSqm += colW * colPlinthM;
        legsCount += colIdx === cols.length - 1 ? 4 : 2;
      }

      const ratioSum = col.slots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;

      for (const slot of col.slots) {
        const slotH = colHeightM * (Math.max(0.1, slot.heightRatio) / ratioSum);
        const shelfDepth = Math.max(0.18, colDepthM - 0.04);

        // Internal shelves
        if (slot.internalShelves > 0) {
          carcassAreaSqm += slot.internalShelves * Math.max(0.1, colW - BOARD_THICKNESS_M) * shelfDepth;
          edgeBandingMeters += slot.internalShelves * colW;
        }

        // Wardrobe / Hallway closet clothes rail
        if (
          !isUpper &&
          includeClothesRails &&
          slotH > 1.2 &&
          (slot.internalShelves || 0) <= 2 &&
          slot.type !== 'double_hanging_rod' &&
          slot.type !== 'trouser_rack'
        ) {
          clothesRailsMeters += Math.max(0.3, colW - BOARD_THICKNESS_M * 2);
        }

        const hingePerLeaf = slotH > 1.5 ? 4 : slotH > 0.9 ? 3 : 2;

        const hasIntegratedMilling =
          !isUpper &&
          (config.handleStyle === 'profile_j' || config.handleStyle === 'gola_profile');

        if (slot.hasCooktop && !isUpper && config.category === 'kitchen' && slot.type !== 'oven_hob' && slot.type !== 'hob_only') {
          cutoutsCount += 1;
        }

        switch (slot.type) {
          case 'sink_unit':
            if (!isUpper && config.category === 'kitchen') cutoutsCount += 1;
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            hingesCount += hingePerLeaf;
            if (!upperUsesProfile) handlesCount += 1;
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            if (hasIntegratedMilling) handleMillingMeters += colW;
            break;
          case 'door_left':
          case 'door_right':
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            if (!isWardrobeSliding || isUpper) {
              hingesCount += hingePerLeaf;
              if (!upperUsesProfile) handlesCount += 1;
            }
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            if (hasIntegratedMilling) handleMillingMeters += colW;
            break;
          case 'door_double':
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + 2 * slotH);
            if (!isWardrobeSliding || isUpper) {
              hingesCount += hingePerLeaf * 2;
              if (!upperUsesProfile) handlesCount += 2;
            }
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            if (hasIntegratedMilling) handleMillingMeters += colW;
            break;
          case 'mirror_front':
            glassFrontAreaSqm += colW * slotH;
            if (!isWardrobeSliding || isUpper) {
              hingesCount += hingePerLeaf;
              if (!upperUsesProfile) handlesCount += 1;
            }
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            break;
          case 'glass_door':
            vitrineDoors.push({
              widthMm: Math.round(colW * 1000),
              heightMm: Math.round(slotH * 1000),
            });
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            break;
          case 'glass_double': {
            const leafW = Math.round((colW / 2) * 1000);
            const leafH = Math.round(slotH * 1000);
            vitrineDoors.push({ widthMm: leafW, heightMm: leafH });
            vitrineDoors.push({ widthMm: leafW, heightMm: leafH });
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            break;
          }
          case 'cargo_basket':
            cargoBasketsCount += 1;
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            handlesCount += 1;
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            if (hasIntegratedMilling) handleMillingMeters += colW;
            break;
          case 'flap_up':
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            liftMechanismsCount += 2;
            if (!upperUsesProfile) handlesCount += 1;
            if (hasIntegratedMilling) handleMillingMeters += colW;
            break;
          case 'drawers_1':
          case 'drawers_2':
          case 'drawers_3':
          case 'drawers_4':
          case 'drawers_5':
          case 'drawers_6': {
            const count = getDrawerCount(slot);
            const slideLenMm = resolveDrawerSlideLengthMm(Math.round(colDepthM * 1000));
            const slideLenKey = `${slideLenMm}`;
            drawerSlidePairsByLength[slideLenKey] =
              (drawerSlidePairsByLength[slideLenKey] || 0) + count;
            const slideMult = getDrawerSlideLengthMultiplier(slideLenMm);
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += count * 2 * (colW + slotH / count);
            const drawerBoxH = Math.min(0.18, (slotH / count) * 0.72);
            const drawerBoxD = Math.max(0.2, slideLenMm / 1000 - 0.01);
            carcassAreaSqm += count * (2 * drawerBoxD * drawerBoxH + colW * drawerBoxH + colW * drawerBoxD);
            drawerSlidePairs += count;
            if (slot.drawerSlideType === 'ball_bearing') {
              ballBearingSlidePairs += count;
              drawerSlideCostUnits.ballBearing += count * slideMult;
            } else if (slot.drawerSlideType === 'telescopic_soft') {
              telescopicSlidePairs += count;
              drawerSlideCostUnits.telescopic += count * slideMult;
            } else if (slot.drawerSlideType === 'blum_hidden') {
              blumHiddenSlidePairs += count;
              drawerSlideCostUnits.blumHidden += count * slideMult;
            } else {
              drawerSlideCostUnits.defaultTier += count * slideMult;
            }
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
              golaCMeters += Math.max(0, count - 1) * colW;
            }
            if (hasIntegratedMilling) handleMillingMeters += count * colW;
            if (!slot.hideHandles) handlesCount += count;
            break;
          }
          case 'oven_hob': {
            const subSlideLenMm = resolveDrawerSlideLengthMm(Math.round(colDepthM * 1000));
            const subSlideMult = getDrawerSlideLengthMultiplier(subSlideLenMm);
            drawerSlidePairsByLength[`${subSlideLenMm}`] =
              (drawerSlidePairsByLength[`${subSlideLenMm}`] || 0) + 1;
            drawerSlideCostUnits.defaultTier += subSlideMult;
            if (!isUpper && config.category === 'kitchen') cutoutsCount += 1;
            carcassAreaSqm += colW * colDepthM * 2;
            frontAreaSqm += colW * (slotH * 0.25);
            drawerSlidePairs += 1;
            handlesCount += 1;
            break;
          }
          case 'oven_only': {
            const subSlideLenMm = resolveDrawerSlideLengthMm(Math.round(colDepthM * 1000));
            const subSlideMult = getDrawerSlideLengthMultiplier(subSlideLenMm);
            drawerSlidePairsByLength[`${subSlideLenMm}`] =
              (drawerSlidePairsByLength[`${subSlideLenMm}`] || 0) + 1;
            drawerSlideCostUnits.defaultTier += subSlideMult;
            carcassAreaSqm += colW * colDepthM * 2;
            frontAreaSqm += colW * (slotH * 0.25);
            drawerSlidePairs += 1;
            handlesCount += 1;
            break;
          }
          case 'microwave':
            carcassAreaSqm += colW * runDepthM;
            edgeBandingMeters += colW;
            break;
          case 'fridge_builtin':
            carcassAreaSqm += colW * runDepthM * 2;
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            hingesCount += hingePerLeaf * 2;
            handlesCount += 2;
            break;
          case 'hob_only':
            if (!isUpper && config.category === 'kitchen') cutoutsCount += 1;
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            hingesCount += col.widthCm > MAX_SINGLE_DOOR_CM ? hingePerLeaf * 2 : hingePerLeaf;
            handlesCount += col.widthCm > MAX_SINGLE_DOOR_CM ? 2 : 1;
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            if (hasIntegratedMilling) handleMillingMeters += colW;
            break;
          case 'dishwasher':
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            handlesCount += 1;
            if (!isUpper && config.handleStyle === 'gola_profile') {
              golaLMeters += colW;
            }
            if (hasIntegratedMilling) handleMillingMeters += colW;
            break;
          case 'washing_machine':
          case 'dryer':
            break;
          case 'extractor_hood':
            cutoutsCount += 1;
            frontAreaSqm += colW * (slotH * 0.65);
            edgeBandingMeters += 2 * (colW + slotH * 0.65);
            hingesCount += col.widthCm > MAX_SINGLE_DOOR_CM ? 4 : 2;
            break;
          case 'double_hanging_rod':
            clothesRailsMeters += 2 * Math.max(0.3, colW - BOARD_THICKNESS_M * 2);
            break;
          case 'trouser_rack':
            drawerSlidePairs += 1;
            clothesRailsMeters += Math.max(0.3, colW - BOARD_THICKNESS_M * 2);
            break;
          case 'shoe_rack':
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            carcassAreaSqm += 2 * colW * shelfDepth;
            hingesCount += 4;
            handlesCount += 2;
            break;
          case 'coat_panel':
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            handlesCount += 4;
            break;
          case 'bench_seat':
            frontAreaSqm += colW * slotH * 0.65;
            carcassAreaSqm += colW * runDepthM;
            hingesCount += 2;
            handlesCount += 1;
            break;
          case 'corner_blind':
            frontAreaSqm += colW * slotH;
            edgeBandingMeters += 2 * (colW + slotH);
            hingesCount += hingePerLeaf;
            handlesCount += 1;
            if (config.includeCornerMechanism) extraCornerMechanisms += 1;
            break;
          case 'tv_niche':
          case 'open_shelves':
            break;
        }
      }
    });
  };

  accumulateRun(config.columns, depthM, false);

  if (config.layoutShape === 'l_shape' && config.wingColumns.length > 0) {
    carcassAreaSqm += 2 * depthM * depthM + 2 * boxHeightM * depthM;
    frontAreaSqm += (L_CORNER_FILLER_CM / 100) * boxHeightM;
    accumulateRun(config.wingColumns, depthM, false);
  }

  const baseLowColumns = config.columns.filter((c) => (c.heightCm || config.heightCm) <= 130);

  if (config.category === 'kitchen' && config.includeUpperCabinets) {
    const upperDepthM = (config.upperDepthCm || 32) / 100;
    const makeUpperSlot = (c: ColumnConfig, defaultDoor: 'door_left' | 'door_right'): SlotConfig => {
      const hasHob = c.slots.some((sl) => sl.type === 'oven_hob' || sl.type === 'hob_only');
      const resolvedUpperType = c.upperType || (hasHob ? 'extractor_builtin' : 'doors');
      if (resolvedUpperType === 'flap_up') {
        return { id: `${c.id}_ups`, heightRatio: 1, type: 'flap_up', internalShelves: 1 };
      }
      if (resolvedUpperType === 'glass_doors') {
        return {
          id: `${c.id}_ups`,
          heightRatio: 1,
          type: c.widthCm > MAX_SINGLE_DOOR_CM ? 'glass_double' : 'glass_door',
          internalShelves: 1,
        };
      }
      if (resolvedUpperType === 'extractor_builtin') {
        return { id: `${c.id}_ups`, heightRatio: 1, type: 'extractor_hood', internalShelves: 1 };
      }
      if (resolvedUpperType === 'extractor_chimney') {
        return { id: `${c.id}_ups`, heightRatio: 1, type: 'open_shelves', internalShelves: 0 };
      }
      return {
        id: `${c.id}_ups`,
        heightRatio: 1,
        type: c.widthCm > MAX_SINGLE_DOOR_CM ? 'door_double' : defaultDoor,
        internalShelves: 1,
      };
    };

    // Only place upper wall cabinets above low base bays (exclude tall columns > 130 cm and explicit 'none')
    const upperCols: ColumnConfig[] = baseLowColumns
      .filter((c) => c.upperType !== 'none')
      .map((c) => ({
        id: `${c.id}_up`,
        widthCm: c.widthCm,
        slots: [makeUpperSlot(c, 'door_left')],
      }));
    accumulateRun(upperCols, upperDepthM, true);

    if (config.layoutShape === 'l_shape' && config.wingColumns.length > 0 && config.includeWingUpperCabinets !== false) {
      const upperWingCols: ColumnConfig[] = config.wingColumns
        .filter((c) => (c.heightCm || config.heightCm) <= 130 && c.upperType !== 'none')
        .map((c) => ({
          id: `${c.id}_upw`,
          widthCm: c.widthCm,
          slots: [makeUpperSlot(c, 'door_right')],
        }));
      accumulateRun(upperWingCols, upperDepthM, true);
    }
  }

  if (Array.isArray(config.wallDecorItems) && config.wallDecorItems.length > 0) {
    config.wallDecorItems.forEach((addon) => {
      if (addon.kind === 'cabinet') {
        accumulateRun(
          [
            {
              id: addon.id,
              widthCm: addon.widthCm,
              heightCm: addon.heightCm,
              isSuspended: true,
              elevationCm: addon.elevationCm,
              carcassDecorId: addon.carcassDecorId,
              frontDecorId: addon.frontDecorId,
              slots:
                addon.slots && addon.slots.length > 0
                  ? addon.slots
                  : [{ id: `${addon.id}_sl`, heightRatio: 1, type: 'open_shelves', internalShelves: 1 }],
            },
          ],
          Math.max(0.18, addon.depthCm / 100),
          false,
        );
      } else if (addon.kind === 'shelf') {
        const w = addon.widthCm / 100;
        const d = addon.depthCm / 100;
        carcassAreaSqm += w * d;
        edgeBandingMeters += w + 2 * d;
        wallHangersCount += 2;
      } else if (addon.kind === 'round_mirror') {
        const r = (addon.widthCm / 100) / 2;
        glassFrontAreaSqm += Math.PI * r * r;
      } else if (addon.kind === 'coat_hooks') {
        handlesCount += addon.hooksCount || 5;
      }
    });
  }

  const lowMainMeters = baseLowColumns.reduce((sum, c) => sum + c.widthCm / 100, 0);
  const lowWingMeters =
    config.layoutShape === 'l_shape' ? config.wingWidthCm / 100 : 0;
  const totalRunMeters =
    config.widthCm / 100 + (config.layoutShape === 'l_shape' ? config.wingWidthCm / 100 : 0);
  const countertopMeters = config.category === 'kitchen' ? lowMainMeters + lowWingMeters : 0;
  const backsplashAreaSqm =
    config.category === 'kitchen' && config.includeBacksplash
      ? countertopMeters * (Math.min(600, Math.max(100, config.backsplashHeightMm ?? 600)) / 1000)
      : 0;
  const plinthMeters =
    config.plinthCm > 0 && !config.columns.every((c) => c.isSuspended) ? totalRunMeters : 0;
  const waterSealMeters = config.category === 'kitchen' ? countertopMeters : 0;
  const cornerMillingCount = config.category === 'kitchen' && config.layoutShape === 'l_shape' ? 1 : 0;
  const cornerMechanismsCount =
    extraCornerMechanisms > 0
      ? extraCornerMechanisms
      : config.category === 'kitchen' && config.layoutShape === 'l_shape' && config.includeCornerMechanism
        ? 1
        : 0;
  const slidingTrackMeters = isWardrobeSliding ? totalRunMeters : 0;
  let slidingDoorsCount = 0;
  let slidingRailBars3m = 0;
  let slidingRailWasteMeters = 0;
  let slidingHandleBars3m = 0;
  let slidingHandleWasteMeters = 0;

  if (isWardrobeSliding) {
    slidingDoorsCount = Math.max(2, config.columns.length);
    const trackLenM = config.widthCm / 100;
    slidingRailBars3m = Math.max(1, Math.ceil(trackLenM / 3));
    slidingRailWasteMeters = Number(Math.max(0, slidingRailBars3m * 3 - trackLenM).toFixed(2));

    const stileLenM = Math.min(3, Math.max(0.5, boxHeightM));
    const totalStiles = slidingDoorsCount * 2;
    const bars: number[] = [3];
    for (let s = 0; s < totalStiles; s++) {
      const idx = bars.findIndex((rem) => rem + 0.001 >= stileLenM);
      if (idx >= 0) {
        bars[idx] = Number((bars[idx] - stileLenM).toFixed(3));
      } else {
        bars.push(Number((3 - stileLenM).toFixed(3)));
      }
    }
    slidingHandleBars3m = bars.length;
    slidingHandleWasteMeters = Number(
      Math.max(0, slidingHandleBars3m * 3 - totalStiles * stileLenM).toFixed(2),
    );
  }

  const cornerHingesCount =
    config.layoutShape === 'l_shape' && hingesCount > 0 ? Math.min(hingesCount, 4) : 0;
  const nonCornerHinges = Math.max(0, hingesCount - cornerHingesCount);
  const standardHingesCount = hardwareTier === 'economy' ? nonCornerHinges : 0;
  const softCloseHingesCount = hardwareTier === 'economy' ? 0 : nonCornerHinges;

  const liftSetsCount = Math.ceil(liftMechanismsCount / 2);
  const liftGasCount = hardwareTier === 'economy' ? liftSetsCount : 0;
  const liftDoubleCount = hardwareTier === 'economy' ? 0 : liftSetsCount;

  // Standard Bulgarian sheet size 2800x2070 mm = 5.796 sqm, ~15% cutting kerf/waste
  const totalBoardSqm = (carcassAreaSqm + frontAreaSqm) * 1.15;
  const sheetsEstimated = Math.max(1, Math.ceil(totalBoardSqm / 5.796));

  return {
    normalized: config,
    bom: {
      carcassAreaSqm: Number(carcassAreaSqm.toFixed(2)),
      frontAreaSqm: Number(frontAreaSqm.toFixed(2)),
      glassFrontAreaSqm: Number(glassFrontAreaSqm.toFixed(2)),
      vitrineDoors,
      hdfBackAreaSqm: Number(hdfBackAreaSqm.toFixed(2)),
      edgeBandingMeters: Number(edgeBandingMeters.toFixed(1)),
      handleMillingMeters: Number(handleMillingMeters.toFixed(2)),
      countertopMeters: Number(countertopMeters.toFixed(2)),
      backsplashAreaSqm: Number(backsplashAreaSqm.toFixed(2)),
      plinthMeters: Number(plinthMeters.toFixed(2)),
      waterSealMeters: Number(waterSealMeters.toFixed(2)),
      cutoutsCount,
      cornerMillingCount,
      cargoBasketsCount,
      cornerMechanismsCount,
      slidingTrackMeters: Number(slidingTrackMeters.toFixed(2)),
      slidingDoorsCount,
      slidingRailBars3m,
      slidingRailWasteMeters,
      slidingHandleBars3m,
      slidingHandleWasteMeters,
      clothesRailsMeters: Number(clothesRailsMeters.toFixed(2)),
      hingesCount,
      standardHingesCount,
      softCloseHingesCount,
      cornerHingesCount,
      drawerSlidePairs,
      ballBearingSlidePairs,
      telescopicSlidePairs,
      blumHiddenSlidePairs,
      drawerSlidePairsByLength,
      drawerSlideCostUnits: {
        defaultTier: Number(drawerSlideCostUnits.defaultTier.toFixed(3)),
        ballBearing: Number(drawerSlideCostUnits.ballBearing.toFixed(3)),
        telescopic: Number(drawerSlideCostUnits.telescopic.toFixed(3)),
        blumHidden: Number(drawerSlideCostUnits.blumHidden.toFixed(3)),
      },
      liftMechanismsCount,
      liftGasCount,
      liftDoubleCount,
      wallHangersCount,
      handlesCount:
        config.handleStyle === 'push_to_open' ||
        config.handleStyle === 'gola_profile' ||
        config.handleStyle === 'profile_j' ||
        isWardrobeSliding
          ? 0
          : handlesCount,
      golaLMeters: Number(golaLMeters.toFixed(2)),
      golaCMeters: Number(golaCMeters.toFixed(2)),
      upperProfileMeters: Number(upperProfileMeters.toFixed(2)),
      legsCount,
      dividersCount,
      sheetsEstimated,
      notices,
    },
  };
}
