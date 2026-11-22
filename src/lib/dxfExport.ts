import {
  ColumnConfig,
  FurnitureConfig,
  SlotConfig,
} from '../types/furniture';
import {
  columnHasVitrine,
  computeDrawerFrontMetrics,
  computeSlotClearancesCm,
  getBayCarcassDepthMm,
  getBayFrontThicknessMm,
  getDrawerCount,
  isDrawerSlotType,
  isVitrineSlotType,
  resolveDrawerSlideLengthMm,
  STANDARD_DOOR_THICKNESS_MM,
  upperBayHasVitrine,
  VITRINE_PROFILE_THICKNESS_MM,
} from './carpentryEngine';

export const AUTOCAD_3D_DXF_FILENAME = 'Proekt_AutoCAD_3D.dxf';

type Point2D = [number, number];
type TransformXY = (localX: number, localY: number) => Point2D;

// AutoCAD WCS: +X = Right, +Y = Back (wall), -Y = Front (towards viewer), +Z = Up.
// Mapping local (lx right, ly forward from back wall) -> [lx, -ly] preserves right-handed
// orientation relative to Three.js (+X right, +Y up, +Z front) with zero mirroring.
const identityXY: TransformXY = (x, y) => [x, -y];

const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ж: 'Zh', З: 'Z',
  И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P',
  Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'Ts', Ч: 'Ch',
  Ш: 'Sh', Щ: 'Sht', Ъ: 'A', Ь: 'Y', Ю: 'Yu', Я: 'Ya',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

function toAsciiDxfText(text: string): string {
  return text
    .split('')
    .map((ch) => {
      if (CYRILLIC_TO_LATIN[ch]) return CYRILLIC_TO_LATIN[ch];
      const map: Record<string, string> = {
        '×': 'x',
        '−': '-',
        '–': '-',
        '—': '-',
        '·': '-',
        '€': 'EUR',
      };
      if (map[ch]) return map[ch];
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126 ? ch : '';
    })
    .join('')
    .trim();
}

/**
 * Generates an AutoCAD R12 (AC1009) 3D ASCII DXF drawing in millimeters ($INSUNITS = 4)
 * with genuine 3DFACE geometry across 5 dedicated AutoCAD layers:
 *   - 3D_KORPUS       (Carcass side/bottom/top boards, HDF backs, plinths; -2 mm depth for S02)
 *   - 3D_VRATI        (18 mm doors, drawers + inner drawer boxes, handles, built-in appliances)
 *   - 3D_VITRINI      (20 mm S02 aluminum perimeter profiles + 4 mm recessed glass panes)
 *   - 3D_PLOT_RAFTOVE (Countertops 20/30/40 mm, backsplashes, internal & wall shelves)
 *   - 3D_RAZMERI      (3D dimension lines and millimeter annotations)
 */
export function generateFurnitureDxf(
  config: FurnitureConfig,
  projectCode = 'AF-PROJECT',
): string {
  const out: string[] = [];

  const pushPair = (code: number, value: string | number) => {
    out.push(String(code), String(value));
  };

  const addLine3D = (
    layer: string,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    color?: number,
  ) => {
    pushPair(0, 'LINE');
    pushPair(8, layer);
    if (color !== undefined) pushPair(62, color);
    pushPair(10, x1.toFixed(2));
    pushPair(20, y1.toFixed(2));
    pushPair(30, z1.toFixed(2));
    pushPair(11, x2.toFixed(2));
    pushPair(21, y2.toFixed(2));
    pushPair(31, z2.toFixed(2));
  };

  const addFace3D = (
    layer: string,
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    p4: [number, number, number],
    color?: number,
  ) => {
    pushPair(0, '3DFACE');
    pushPair(8, layer);
    if (color !== undefined) pushPair(62, color);
    pushPair(10, p1[0].toFixed(2));
    pushPair(20, p1[1].toFixed(2));
    pushPair(30, p1[2].toFixed(2));
    pushPair(11, p2[0].toFixed(2));
    pushPair(21, p2[1].toFixed(2));
    pushPair(31, p2[2].toFixed(2));
    pushPair(12, p3[0].toFixed(2));
    pushPair(22, p3[1].toFixed(2));
    pushPair(32, p3[2].toFixed(2));
    pushPair(13, p4[0].toFixed(2));
    pushPair(23, p4[1].toFixed(2));
    pushPair(33, p4[2].toFixed(2));
  };

  /**
   * Emits a 6-sided closed 3DFACE prism in local coordinates (lx, ly, z) -> AutoCAD world (X, Y, Z)
   */
  const addBox3D = (
    layer: string,
    lx: number,
    ly: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    color?: number,
    tx: TransformXY = identityXY,
  ) => {
    if (dx <= 0.1 || dy <= 0.1 || dz <= 0.1) return;
    const [x00, y00] = tx(lx, ly);
    const [x10, y10] = tx(lx + dx, ly);
    const [x11, y11] = tx(lx + dx, ly + dy);
    const [x01, y01] = tx(lx, ly + dy);
    const z0 = z;
    const z1 = z + dz;

    const b0: [number, number, number] = [x00, y00, z0];
    const b1: [number, number, number] = [x10, y10, z0];
    const b2: [number, number, number] = [x11, y11, z0];
    const b3: [number, number, number] = [x01, y01, z0];

    const t0: [number, number, number] = [x00, y00, z1];
    const t1: [number, number, number] = [x10, y10, z1];
    const t2: [number, number, number] = [x11, y11, z1];
    const t3: [number, number, number] = [x01, y01, z1];

    addFace3D(layer, b0, b1, b2, b3, color); // Bottom
    addFace3D(layer, t0, t1, t2, t3, color); // Top
    addFace3D(layer, b0, b1, t1, t0, color); // Back (ly)
    addFace3D(layer, b3, b2, t2, t3, color); // Front (ly + dy)
    addFace3D(layer, b0, b3, t3, t0, color); // Left (lx)
    addFace3D(layer, b1, b2, t2, t1, color); // Right (lx + dx)
  };

  const addText3D = (
    layer: string,
    x: number,
    y: number,
    z: number,
    height: number,
    text: string,
    color?: number,
  ) => {
    const safeText = toAsciiDxfText(text);
    if (!safeText) return;
    pushPair(0, 'TEXT');
    pushPair(8, layer);
    if (color !== undefined) pushPair(62, color);
    pushPair(10, x.toFixed(2));
    pushPair(20, y.toFixed(2));
    pushPair(30, z.toFixed(2));
    pushPair(40, height.toFixed(2));
    pushPair(1, safeText);
  };

  // DXF Header & Tables (AutoCAD R12 AC1009, Millimeter units)
  pushPair(0, 'SECTION');
  pushPair(2, 'HEADER');
  pushPair(9, '$ACADVER');
  pushPair(1, 'AC1009');
  pushPair(9, '$INSUNITS');
  pushPair(70, 4); // 4 = Millimeters
  pushPair(9, '$MEASUREMENT');
  pushPair(70, 1); // 1 = Metric (mm)
  pushPair(0, 'ENDSEC');

  pushPair(0, 'SECTION');
  pushPair(2, 'TABLES');
  pushPair(0, 'TABLE');
  pushPair(2, 'LTYPE');
  pushPair(70, 1);
  pushPair(0, 'LTYPE');
  pushPair(2, 'CONTINUOUS');
  pushPair(70, 0);
  pushPair(3, 'Solid line');
  pushPair(72, 65);
  pushPair(73, 0);
  pushPair(40, 0.0);
  pushPair(0, 'ENDTAB');

  pushPair(0, 'TABLE');
  pushPair(2, 'LAYER');
  pushPair(70, 5);

  const layers: Array<[string, number]> = [
    ['3D_KORPUS', 7],
    ['3D_VRATI', 30],
    ['3D_VITRINI', 4],
    ['3D_PLOT_RAFTOVE', 2],
    ['3D_RAZMERI', 3],
  ];
  layers.forEach(([name, color]) => {
    pushPair(0, 'LAYER');
    pushPair(2, name);
    pushPair(70, 0);
    pushPair(62, color);
    pushPair(6, 'CONTINUOUS');
  });
  pushPair(0, 'ENDTAB');
  pushPair(0, 'ENDSEC');

  // Entities
  pushPair(0, 'SECTION');
  pushPair(2, 'ENTITIES');

  const BOARD_T = STANDARD_DOOR_THICKNESS_MM; // 18 mm
  const HDF_T = 4;
  const GAP = 2;
  const isKitchen = config.category === 'kitchen';
  const baseDepthMm = Math.round((config.depthCm || 58) * 10);
  const plinthMm = Math.round((config.plinthCm || 0) * 10);
  const counterMm = isKitchen ? config.countertopThicknessMm || 40 : 0;
  const backMm = isKitchen && config.includeBacksplash ? config.backsplashThicknessMm || 10 : 0;
  const backH = isKitchen && config.includeBacksplash
    ? Math.max(100, Math.min(600, Math.round(config.backsplashHeightMm ?? 600)))
    : 0;
  const upperGapMm = isKitchen && config.includeBacksplash ? Math.max(560, backH) : 560;
  const upperH = Math.round((config.upperHeightCm || 72) * 10);
  const isLeftCorner = config.cornerSide === 'left';

  addText3D(
    '3D_RAZMERI',
    0,
    180,
    0,
    42,
    `SK MEBELI AUTOCAD 3D - ${projectCode} (ALL UNITS IN MM | S02 PROFILE=${VITRINE_PROFILE_THICKNESS_MM}MM)`,
    3,
  );

  const buildS02VitrineLeaf = (
    lx: number,
    lyFrontStart: number,
    lz: number,
    leafW: number,
    leafH: number,
    tx: TransformXY,
  ) => {
    const profileW = VITRINE_PROFILE_THICKNESS_MM; // 20 mm wide perimeter alu profile
    const profileD = VITRINE_PROFILE_THICKNESS_MM; // 20 mm front thickness
    const glassT = 4;
    // Left stile
    addBox3D('3D_VITRINI', lx, lyFrontStart, lz, profileW, profileD, leafH, 4, tx);
    // Right stile
    addBox3D('3D_VITRINI', lx + leafW - profileW, lyFrontStart, lz, profileW, profileD, leafH, 4, tx);
    // Bottom rail
    addBox3D('3D_VITRINI', lx + profileW, lyFrontStart, lz, Math.max(10, leafW - profileW * 2), profileD, profileW, 4, tx);
    // Top rail
    addBox3D('3D_VITRINI', lx + profileW, lyFrontStart, lz + leafH - profileW, Math.max(10, leafW - profileW * 2), profileD, profileW, 4, tx);
    // Recessed 4 mm smoked glass pane centered in profile
    addBox3D(
      '3D_VITRINI',
      lx + profileW,
      lyFrontStart + (profileD - glassT) / 2,
      lz + profileW,
      Math.max(10, leafW - profileW * 2),
      glassT,
      Math.max(10, leafH - profileW * 2),
      4,
      tx,
    );
  };

  const buildDoorLeaf = (
    lx: number,
    lyFrontStart: number,
    lz: number,
    leafW: number,
    leafH: number,
    tx: TransformXY,
  ) => {
    addBox3D('3D_VRATI', lx, lyFrontStart, lz, leafW, BOARD_T, leafH, 30, tx);
  };

  const buildSlot3D = (
    bayX: number,
    boxZ: number,
    bayW: number,
    slotZ: number,
    slotH: number,
    carcassD: number,
    slot: SlotConfig,
    isUpper: boolean,
    tx: TransformXY,
  ) => {
    const innerW = Math.max(40, bayW - BOARD_T * 2);
    const frontY = carcassD + GAP;

    // Bottom horizontal divider shelf between stacked slots (except floor bottom)
    if (slotZ > boxZ + BOARD_T + 5) {
      addBox3D('3D_KORPUS', bayX + BOARD_T, HDF_T, slotZ, innerW, Math.max(40, carcassD - HDF_T), BOARD_T, 7, tx);
    }

    // Internal shelves on 3D_PLOT_RAFTOVE
    const shelvesCount = Math.max(0, slot.internalShelves || 0);
    if (shelvesCount > 0) {
      const slotInnerCm = Math.max(10, (slotH - BOARD_T * 2) / 10);
      const gapsCm = computeSlotClearancesCm(slotInnerCm, shelvesCount, slot.shelfClearancesCm);
      let cursorZ = slotZ + BOARD_T;
      for (let s = 0; s < shelvesCount; s++) {
        cursorZ += Math.round((gapsCm[s] || 20) * 10);
        addBox3D(
          '3D_PLOT_RAFTOVE',
          bayX + BOARD_T + 1,
          HDF_T + 4,
          cursorZ,
          Math.max(20, innerW - 2),
          Math.max(40, carcassD - HDF_T - 20),
          BOARD_T,
          2,
          tx,
        );
        cursorZ += BOARD_T;
      }
    }

    // Front leaves / drawers / vitrines / appliances
    if (isVitrineSlotType(slot.type)) {
      if (slot.type === 'glass_double') {
        const leafW = (bayW - 6) / 2;
        buildS02VitrineLeaf(bayX + 2, frontY, slotZ + 2, leafW, Math.max(40, slotH - 4), tx);
        buildS02VitrineLeaf(bayX + 4 + leafW, frontY, slotZ + 2, leafW, Math.max(40, slotH - 4), tx);
      } else {
        buildS02VitrineLeaf(bayX + 2, frontY, slotZ + 2, Math.max(40, bayW - 4), Math.max(40, slotH - 4), tx);
      }
    } else if (isDrawerSlotType(slot.type)) {
      const count = Math.max(1, getDrawerCount(slot));
      const metrics = computeDrawerFrontMetrics(slotH / 10, count, bayW / 10, config.handleStyle);
      const frontH = Math.max(40, Math.round(metrics.frontHeightCm * 10));
      const gapMm = Math.round(metrics.visibleGapCm * 10);
      const slideLenMm = resolveDrawerSlideLengthMm(carcassD);
      const boxD = Math.min(carcassD - HDF_T - 10, slideLenMm);
      const step = slotH / count;
      for (let d = 0; d < count; d++) {
        const dz = slotZ + slotH - (d + 1) * step + Math.max(2, gapMm / 2);
        const hActual = Math.min(frontH, Math.max(40, step - Math.max(3, gapMm)));
        // Front face
        buildDoorLeaf(bayX + 2, frontY, dz, Math.max(40, bayW - 4), hActual, tx);
        // Inner drawer box (left, right, back, bottom) on 3D_VRATI
        const boxZ0 = dz + 16;
        const boxH = Math.max(45, Math.min(165, hActual - 32));
        const boxW = Math.max(40, innerW - 26);
        const boxX = bayX + BOARD_T + 13;
        const boxY = Math.max(HDF_T + 12, carcassD - boxD);
        addBox3D('3D_VRATI', boxX, boxY, boxZ0, 16, boxD, boxH, 30, tx);
        addBox3D('3D_VRATI', boxX + boxW - 16, boxY, boxZ0, 16, boxD, boxH, 30, tx);
        addBox3D('3D_VRATI', boxX + 16, boxY, boxZ0, Math.max(20, boxW - 32), 16, boxH, 30, tx);
        addBox3D('3D_VRATI', boxX + 16, boxY + 16, boxZ0, Math.max(20, boxW - 32), Math.max(20, boxD - 16), 12, 30, tx);
      }
    } else if (slot.type === 'door_double') {
      const leafW = (bayW - 6) / 2;
      buildDoorLeaf(bayX + 2, frontY, slotZ + 2, leafW, Math.max(40, slotH - 4), tx);
      buildDoorLeaf(bayX + 4 + leafW, frontY, slotZ + 2, leafW, Math.max(40, slotH - 4), tx);
    } else if (
      slot.type === 'oven_hob' ||
      slot.type === 'oven_only' ||
      slot.type === 'microwave'
    ) {
      const hasLowerDrw = slot.type === 'oven_hob' || slot.type === 'oven_only';
      const drwH = hasLowerDrw ? Math.round(slotH * 0.24) : 0;
      const appZ = slotZ + drwH;
      const appH = slotH - drwH;
      if (hasLowerDrw && drwH > 40) {
        buildDoorLeaf(bayX + 2, frontY, slotZ + 2, Math.max(40, bayW - 4), drwH - 4, tx);
      }
      // Appliance housing + door panel
      addBox3D('3D_VRATI', bayX + BOARD_T + 4, 30, appZ + 4, Math.max(40, innerW - 8), Math.max(100, carcassD - 34), Math.max(60, appH - 8), 30, tx);
      addBox3D('3D_VRATI', bayX + 4, carcassD, appZ + 4, Math.max(40, bayW - 8), 22, Math.max(60, appH - 8), 30, tx);
    } else if (slot.type !== 'open_shelves' && slot.type !== 'tv_niche' && slot.type !== 'coat_panel') {
      // Standard single door / flap / cargo / dishwasher / fridge / sink front / mirror / shoe rack
      buildDoorLeaf(bayX + 2, frontY, slotZ + 2, Math.max(40, bayW - 4), Math.max(40, slotH - 4), tx);
      if (slot.type === 'fridge_builtin' && slotH > 1100) {
        // Freezer / fridge horizontal split reveal shelf
        addBox3D('3D_KORPUS', bayX + BOARD_T, HDF_T, slotZ + Math.round(slotH * 0.36), innerW, carcassD - HDF_T, BOARD_T, 7, tx);
      }
    }

    void isUpper;
  };

  const buildColumnRun3D = (
    cols: ColumnConfig[],
    tx: TransformXY,
    labelPrefix: string,
    isUpperRun: boolean,
    fixedStartZ?: number,
    fixedColHeightMm?: number,
  ) => {
    let cx = 0;
    cols.forEach((col, idx) => {
      const bayW = Math.round(col.widthCm * 10);
      const colTotalH = fixedColHeightMm ?? Math.round((col.heightCm || config.heightCm) * 10);
      const colPlinth = col.isSuspended || isUpperRun ? 0 : plinthMm;
      const elevZ = isUpperRun
        ? fixedStartZ ?? 1450
        : col.isSuspended
          ? Math.round((col.elevationCm ?? 28) * 10)
          : 0;
      const boxZ = elevZ + colPlinth;
      const boxH = Math.max(180, colTotalH - colPlinth);
      const carcassD = getBayCarcassDepthMm(config, col, isUpperRun);
      const frontT = getBayFrontThicknessMm(col, isUpperRun);
      const hasVit = isUpperRun ? upperBayHasVitrine(col) : columnHasVitrine(col);

      // Plinth (3D_KORPUS)
      if (colPlinth > 0) {
        addBox3D('3D_KORPUS', cx + 4, 20, elevZ, Math.max(40, bayW - 8), Math.max(80, carcassD - 60), colPlinth, 7, tx);
      }

      // Carcass Left, Right, Bottom, Top/Rails & HDF Back (3D_KORPUS)
      addBox3D('3D_KORPUS', cx, 0, boxZ, BOARD_T, carcassD, boxH, 7, tx);
      addBox3D('3D_KORPUS', cx + bayW - BOARD_T, 0, boxZ, BOARD_T, carcassD, boxH, 7, tx);
      const innerW = Math.max(20, bayW - BOARD_T * 2);
      addBox3D('3D_KORPUS', cx + BOARD_T, HDF_T, boxZ, innerW, Math.max(40, carcassD - HDF_T), BOARD_T, 7, tx);
      addBox3D('3D_KORPUS', cx + BOARD_T, HDF_T, boxZ + boxH - BOARD_T, innerW, Math.max(40, carcassD - HDF_T), BOARD_T, 7, tx);
      addBox3D('3D_KORPUS', cx + BOARD_T, 0, boxZ + 2, innerW, HDF_T, Math.max(40, boxH - 4), 7, tx);

      // Slots inside bay
      const rSum = col.slots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;
      let sz = boxZ + boxH;
      col.slots.forEach((slot) => {
        const sh = boxH * (Math.max(0.1, slot.heightRatio) / rSum);
        sz -= sh;
        buildSlot3D(cx, boxZ, bayW, sz, sh, carcassD, slot, isUpperRun, tx);
      });

      // Low kitchen base countertop + backsplash (3D_PLOT_RAFTOVE)
      if (!isUpperRun && isKitchen && colTotalH <= 1300) {
        const counterDepthMm = baseDepthMm + 20;
        addBox3D('3D_PLOT_RAFTOVE', cx, 0, colTotalH, bayW, counterDepthMm, counterMm, 2, tx);
        if (backMm > 0 && backH > 0) {
          addBox3D('3D_PLOT_RAFTOVE', cx, 0, colTotalH + counterMm, bayW, backMm, backH, 2, tx);
        }
      }

      // 3D_RAZMERI bay dimensions
      const [dx0, dy0] = tx(cx, carcassD + 80);
      const [dx1, dy1] = tx(cx + bayW, carcassD + 80);
      const [tx0a, ty0a] = tx(cx, carcassD + 50);
      const [tx0b, ty0b] = tx(cx, carcassD + 110);
      const [tx1a, ty1a] = tx(cx + bayW, carcassD + 50);
      const [tx1b, ty1b] = tx(cx + bayW, carcassD + 110);
      const [dxMid, dyMid] = tx(cx + Math.max(15, bayW * 0.08), carcassD + (isUpperRun ? 140 : 200));
      addLine3D('3D_RAZMERI', dx0, dy0, 0, dx1, dy1, 0, 3);
      addLine3D('3D_RAZMERI', tx0a, ty0a, 0, tx0b, ty0b, 0, 3);
      addLine3D('3D_RAZMERI', tx1a, ty1a, 0, tx1b, ty1b, 0, 3);

      const drwSlot = col.slots.find((sl) => isDrawerSlotType(sl.type));
      const slideNote = drwSlot
        ? ` | SLIDE ${resolveDrawerSlideLengthMm(carcassD)}mm`
        : '';
      addText3D(
        '3D_RAZMERI',
        dxMid,
        dyMid,
        isUpperRun ? boxZ + boxH + 40 : 0,
        24,
        `${labelPrefix}#${idx + 1}: ${bayW}x${colTotalH}mm D=${carcassD}mm (${hasVit ? 'S02 20mm/-2mm' : `${frontT}mm`}${slideNote})`,
        3,
      );

      cx += bayW;
    });
    return cx;
  };

  // 1. Main Base Run
  const mainRunW = buildColumnRun3D(config.columns || [], identityXY, '', false);

  // 2. Main Kitchen Upper Cabinets
  if (isKitchen && config.includeUpperCabinets) {
    const baseHeightMm = Math.round((config.heightCm || 86) * 10);
    const upperStartZ = baseHeightMm + counterMm + upperGapMm;
    let ux = 0;
    (config.columns || []).forEach((col, idx) => {
      const bayW = Math.round(col.widthCm * 10);
      const colTotalH = Math.round((col.heightCm || config.heightCm) * 10);
      if (colTotalH <= 1300 && col.upperType !== 'none') {
        const hasHob = col.slots.some((sl) => sl.type === 'oven_hob' || sl.type === 'hob_only');
        const resolvedUpper = col.upperType || (hasHob ? 'extractor_builtin' : 'doors');
        const upperCol: ColumnConfig = {
          ...col,
          id: `${col.id}_up`,
          slots: [
            {
              id: `${col.id}_ups`,
              heightRatio: 1,
              type:
                resolvedUpper === 'flap_up'
                  ? 'flap_up'
                  : resolvedUpper === 'extractor_builtin'
                    ? 'extractor_hood'
                    : resolvedUpper === 'extractor_chimney'
                      ? 'open_shelves'
                      : resolvedUpper === 'glass_doors'
                        ? col.widthCm > 60
                          ? 'glass_double'
                          : 'glass_door'
                        : col.widthCm > 60
                          ? 'door_double'
                          : 'door_left',
              internalShelves: resolvedUpper === 'extractor_chimney' ? 0 : 1,
            },
          ],
        };
        const bayTransform: TransformXY = (lx, ly) => [ux + lx, -ly];
        buildColumnRun3D([upperCol], bayTransform, `UP-#${idx + 1}`, true, upperStartZ, upperH);
      }
      ux += bayW;
    });
  }

  // 3. L-Shape Blind Corner & Perpendicular Wing
  if (config.layoutShape === 'l_shape' && (config.wingColumns || []).length > 0) {
    const baseHeightMm = Math.round((config.heightCm || 86) * 10);
    const wingW = config.wingColumns.reduce((s, c) => s + Math.round(c.widthCm * 10), 0);
    const cornerX = isLeftCorner ? 0 : Math.max(0, mainRunW - baseDepthMm);
    const boxH = Math.max(180, baseHeightMm - plinthMm);

    // Blind corner carcass + 60 mm front filler
    addBox3D('3D_KORPUS', cornerX, 0, plinthMm, baseDepthMm, baseDepthMm, boxH, 7, identityXY);
    addBox3D(
      '3D_VRATI',
      isLeftCorner ? cornerX + baseDepthMm - 60 : cornerX,
      baseDepthMm,
      plinthMm,
      60,
      BOARD_T,
      boxH,
      30,
      identityXY,
    );
    if (isKitchen) {
      addBox3D(
        '3D_PLOT_RAFTOVE',
        isLeftCorner ? cornerX : Math.max(0, mainRunW - (baseDepthMm + 20)),
        0,
        baseHeightMm,
        baseDepthMm + 20,
        baseDepthMm + 20,
        counterMm,
        2,
        identityXY,
      );
    }

    const wingTransform: TransformXY = isLeftCorner
      ? (lx, ly) => [ly, -(baseDepthMm + 60 + wingW - lx)]
      : (lx, ly) => [mainRunW - ly, -(baseDepthMm + 60 + lx)];

    buildColumnRun3D(config.wingColumns, wingTransform, 'G-', false);

    if (isKitchen && config.includeUpperCabinets && config.includeWingUpperCabinets !== false) {
      const upperStartZ = baseHeightMm + counterMm + upperGapMm;
      const upperWingCols: ColumnConfig[] = config.wingColumns
        .filter((wc) => (wc.heightCm || config.heightCm) <= 130 && wc.upperType !== 'none')
        .map((wc) => ({
          ...wc,
          id: `${wc.id}_upw`,
          slots: [
            {
              id: `${wc.id}_upws`,
              heightRatio: 1,
              type:
                wc.upperType === 'glass_doors'
                  ? wc.widthCm > 60
                    ? 'glass_double'
                    : 'glass_door'
                  : wc.upperType === 'flap_up'
                    ? 'flap_up'
                    : wc.widthCm > 60
                      ? 'door_double'
                      : 'door_right',
              internalShelves: 1,
            },
          ],
        }));
      if (upperWingCols.length > 0) {
        buildColumnRun3D(upperWingCols, wingTransform, 'G-UP-', true, upperStartZ, upperH);
      }
    }
  }

  // 4. Floating Wall Decor Cabinets & Shelves
  if (Array.isArray(config.wallDecorItems) && config.wallDecorItems.length > 0) {
    config.wallDecorItems.forEach((addon, aIdx) => {
      const ax = Math.round(addon.xCm * 10);
      const az = Math.round(addon.elevationCm * 10);
      const aw = Math.round(addon.widthCm * 10);
      const ah = Math.round(addon.heightCm * 10);
      const ad = Math.round(addon.depthCm * 10);
      if (addon.kind === 'shelf') {
        addBox3D('3D_PLOT_RAFTOVE', ax, 0, az, aw, ad, BOARD_T, 2, identityXY);
      } else if (addon.kind === 'cabinet') {
        const cabCol: ColumnConfig = {
          id: addon.id,
          widthCm: addon.widthCm,
          heightCm: addon.heightCm,
          isSuspended: true,
          elevationCm: addon.elevationCm,
          slots:
            addon.slots && addon.slots.length > 0
              ? addon.slots
              : [{ id: `${addon.id}_sl`, heightRatio: 1, type: 'open_shelves', internalShelves: 1 }],
        };
        const tx: TransformXY = (lx, ly) => [ax + lx, -ly];
        buildColumnRun3D([cabCol], tx, `WALL-${aIdx + 1}-`, true, az, ah);
      }
    });
  }

  // 5. Overall 3D Bounding Dimension Callouts
  if (mainRunW > 0) {
    const hMm = Math.round((config.heightCm || 86) * 10);
    addLine3D('3D_RAZMERI', 0, -(baseDepthMm + 260), 0, mainRunW, -(baseDepthMm + 260), 0, 3);
    addLine3D('3D_RAZMERI', 0, 0, 0, 0, 0, hMm, 3);
    addText3D(
      '3D_RAZMERI',
      Math.max(0, mainRunW / 2 - 260),
      -(baseDepthMm + 340),
      0,
      30,
      `OBSHTA SHIRINA: ${mainRunW}mm | VIS=${hMm}mm | D=${baseDepthMm}mm${isKitchen ? ` | PLOT=${counterMm}mm` : ''}`,
      3,
    );
  }

  pushPair(0, 'ENDSEC');
  pushPair(0, 'EOF');

  return out.join('\n') + '\n';
}
