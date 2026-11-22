import {
  BoardDecor,
  BomSummary,
  ColumnConfig,
  FurnitureConfig,
  HardwareTier,
  HardwareTierLevel,
  MeritCatalogItem,
  PartnerCatalogItem,
  SlotConfig,
  SlotType,
} from '../types/furniture';
import {
  columnHasVitrine,
  computeFurnitureBOM,
  enforceStructuralStandards,
  getBayCarcassDepthMm,
  getBayFrontThicknessMm,
  getDrawerCount,
  isDrawerSlotType,
  isVitrineSlotType,
  resolveDrawerSlideLengthMm,
  upperBayHasVitrine,
} from './carpentryEngine';

export const PROJECT_3D_JSON_FILENAME = 'Proekt_3D.json';

export interface Project3DJsonPackage {
  format: 'sk-mebeli-3d-project';
  version: 1;
  exportedAt: string;
  projectCode: string;
  title: string;
  client?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  summary?: {
    totalPriceEur: number;
    hardwareTierId: string;
    hardwareTierLabel: string;
    category: FurnitureConfig['category'];
    layoutShape: FurnitureConfig['layoutShape'];
    dimensionsMm: {
      width: number;
      height: number;
      depth: number;
      wingWidth?: number;
    };
  };
  config: FurnitureConfig;
  notes?: string;
}

export function buildProject3DJson(params: {
  config: FurnitureConfig;
  projectCode: string;
  title: string;
  totalPriceEur: number;
  hardwareTier?: HardwareTier;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  notes?: string;
}): string {
  const pkg: Project3DJsonPackage = {
    format: 'sk-mebeli-3d-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    projectCode: params.projectCode,
    title: params.title || params.projectCode,
    client: {
      name: params.clientName?.trim() || undefined,
      email: params.clientEmail?.trim() || undefined,
      phone: params.clientPhone?.trim() || undefined,
    },
    summary: {
      totalPriceEur: Math.round(params.totalPriceEur || 0),
      hardwareTierId: params.config.hardwareTierId,
      hardwareTierLabel: params.hardwareTier
        ? `${params.hardwareTier.brand} — ${params.hardwareTier.nameBg}`
        : params.config.hardwareTierId,
      category: params.config.category,
      layoutShape: params.config.layoutShape,
      dimensionsMm: {
        width: Math.round(params.config.widthCm * 10),
        height: Math.round(params.config.heightCm * 10),
        depth: Math.round(params.config.depthCm * 10),
        wingWidth:
          params.config.layoutShape === 'l_shape'
            ? Math.round((params.config.wingWidthCm || 0) * 10)
            : undefined,
      },
    },
    config: params.config,
    notes: params.notes?.trim() || undefined,
  };
  return JSON.stringify(pkg, null, 2);
}

export function parseProject3DJson(rawText: string): {
  config: FurnitureConfig;
  projectCode?: string;
  title?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  calculatedPriceEur?: number;
  notes?: string;
} | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const candidateConfig = (
      parsed.format === 'sk-mebeli-3d-project' &&
      parsed.config &&
      typeof parsed.config === 'object'
        ? parsed.config
        : parsed.config && typeof parsed.config === 'object'
          ? parsed.config
          : parsed
    ) as FurnitureConfig;

    if (
      !candidateConfig ||
      typeof candidateConfig !== 'object' ||
      !Array.isArray(candidateConfig.columns) ||
      typeof candidateConfig.category !== 'string'
    ) {
      return null;
    }

    const { config: normalized } = enforceStructuralStandards(candidateConfig, 'standard');
    const client =
      parsed.client && typeof parsed.client === 'object'
        ? (parsed.client as { name?: string; email?: string; phone?: string })
        : undefined;
    const summary =
      parsed.summary && typeof parsed.summary === 'object'
        ? (parsed.summary as { totalPriceEur?: number })
        : undefined;

    return {
      config: normalized,
      projectCode: typeof parsed.projectCode === 'string' ? parsed.projectCode : undefined,
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      clientName: typeof client?.name === 'string' ? client.name : undefined,
      clientEmail: typeof client?.email === 'string' ? client.email : undefined,
      clientPhone: typeof client?.phone === 'string' ? client.phone : undefined,
      calculatedPriceEur:
        typeof summary?.totalPriceEur === 'number' ? summary.totalPriceEur : undefined,
      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
    };
  } catch {
    return null;
  }
}

const SLOT_BG_LABELS: Record<SlotType, string> = {
  door_left: 'Врата (лява)',
  door_right: 'Врата (дясна)',
  door_double: 'Двойна врата',
  glass_door: 'Витрина S02 (20 мм)',
  glass_double: 'Двойна витрина S02 (20 мм)',
  flap_up: 'Повдигаща клапа',
  cargo_basket: 'Карго кошница',
  drawers_1: 'Чекмедже (1 бр.)',
  drawers_2: 'Чекмеджета (2 бр.)',
  drawers_3: 'Чекмеджета (3 бр.)',
  drawers_4: 'Чекмеджета (4 бр.)',
  drawers_5: 'Чекмеджета (5 бр.)',
  drawers_6: 'Чекмеджета (6 бр.)',
  open_shelves: 'Отворени рафтове',
  oven_hob: 'Фурна + Индукционен плот',
  oven_only: 'Вградена фурна',
  hob_only: 'Индукционен плот',
  dishwasher: 'Съдомиялна за вграждане',
  washing_machine: 'Пералня',
  dryer: 'Сушилня',
  extractor_hood: 'Аспиратор',
  sink_unit: 'Мивка + Смесител',
  fridge_builtin: 'Хладилник за вграждане',
  microwave: 'Микровълнова за вграждане',
  trouser_rack: 'Панталонник',
  double_hanging_rod: 'Двоен лост за дрехи',
  shoe_rack: 'Механизъм за обувки',
  coat_panel: 'Пано закачалка',
  bench_seat: 'Седалка / Пейка',
  mirror_front: 'Огледална врата',
  tv_niche: 'ТВ ниша',
  corner_blind: 'Глух ъгъл',
};

const APPLIANCE_SLOT_TYPES = new Set<SlotType>([
  'oven_hob',
  'oven_only',
  'hob_only',
  'dishwasher',
  'washing_machine',
  'dryer',
  'extractor_hood',
  'sink_unit',
  'fridge_builtin',
  'microwave',
]);

function formatSlideTypeBg(t?: SlotConfig['drawerSlideType']): string {
  if (t === 'ball_bearing') return 'Обикновен ролков/съчмен водач';
  if (t === 'telescopic_soft') return 'Телескопичен с плавно прибиране';
  if (t === 'blum_hidden') return 'Скрит водач долен монтаж (плавно)';
  return 'По избрания клас обков';
}

function formatCategoryBg(cat: FurnitureConfig['category']): string {
  const map: Record<FurnitureConfig['category'], string> = {
    kitchen: 'Кухня по поръчка',
    wardrobe: 'Гардероб',
    dresser: 'Скрин / Комод',
    living: 'Хол / ТВ секция',
    hallway: 'Антре / Портманто',
    office: 'Офис обзавеждане',
  };
  return map[cat] || cat;
}

function formatHandleStyleBg(style: FurnitureConfig['handleStyle']): string {
  const map: Record<FurnitureConfig['handleStyle'], string> = {
    standard_bar: 'Стандартни дръжки',
    profile_j: 'Фрезован J-профил',
    gola_profile: 'Алуминиев Gola профил (L+C)',
    push_to_open: 'Push-to-Open (без дръжки)',
    knob: 'Топка дръжки',
  };
  return map[style] || style;
}

function formatQualityClassBg(hw?: HardwareTier): string {
  if (!hw) return 'Среден клас';
  if (hw.tier === 'luxury' || hw.tier === 'premium') return 'Висок клас (Премиум)';
  if (hw.tier === 'economy') return 'Нисък / Икономичен клас';
  return 'Среден / Стандартен клас';
}

export interface ProjectBomEmailReport {
  subject: string;
  fullReportText: string;
  mailtoBody: string;
  htmlBody: string;
  bom: BomSummary;
  totalPriceEur: number;
}

export function buildProjectBomEmailReport(params: {
  projectCode: string;
  title: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  questionText?: string;
  totalPriceEur: number;
  config: FurnitureConfig;
  decors: BoardDecor[];
  hardwareTiers: HardwareTier[];
  meritItems?: MeritCatalogItem[];
  partnerItems?: PartnerCatalogItem[];
}): ProjectBomEmailReport {
  const hwTier = params.hardwareTiers.find((h) => h.id === params.config.hardwareTierId);
  const hwLevel: HardwareTierLevel = hwTier?.tier || 'economy';
  const { normalized, bom } = computeFurnitureBOM(params.config, hwLevel);

  const carcassDecor = params.decors.find((d) => d.id === normalized.carcassDecorId);
  const frontDecor = params.decors.find((d) => d.id === normalized.frontDecorId);
  const counterDecor = params.decors.find((d) => d.id === normalized.countertopDecorId);
  const backsplashDecor = params.decors.find((d) => d.id === normalized.backsplashDecorId);

  const fmtDecor = (d: BoardDecor | undefined, fallbackId: string) =>
    d ? `${d.manufacturer} ${d.code} — ${d.nameBg} (${d.materialType} ${d.thicknessMm} мм)` : fallbackId;

  const totalWmm = Math.round(normalized.widthCm * 10);
  const totalHmm = Math.round(normalized.heightCm * 10);
  const totalDmm = Math.round(normalized.depthCm * 10);
  const wingWmm =
    normalized.layoutShape === 'l_shape' ? Math.round((normalized.wingWidthCm || 0) * 10) : 0;

  const bayLines: string[] = [];
  const applianceLines: string[] = [];

  const collectColumns = (prefix: string, cols: ColumnConfig[]) => {
    cols.forEach((col, idx) => {
      const bayW = Math.round(col.widthCm * 10);
      const bayH = Math.round((col.heightCm || normalized.heightCm) * 10);
      const bayD = getBayCarcassDepthMm(normalized, col, false);
      const frontT = getBayFrontThicknessMm(col, false);
      const hasVit = columnHasVitrine(col);
      const upperInfo =
        normalized.category === 'kitchen' && normalized.includeUpperCabinets && bayH <= 1300
          ? col.upperType === 'none'
            ? 'без горен'
            : `горен: ${col.upperType || 'doors'} (D=${getBayCarcassDepthMm(normalized, col, true)} мм${upperBayHasVitrine(col) ? ', S02 20 мм / -2 мм' : ''})`
          : '';

      const slotDetails = (col.slots || []).map((sl) => {
        const label = SLOT_BG_LABELS[sl.type] || sl.type;
        if (isDrawerSlotType(sl.type)) {
          const cnt = getDrawerCount(sl);
          const slideLen = resolveDrawerSlideLengthMm(bayD);
          return `${label} (${cnt} бр., ${formatSlideTypeBg(sl.drawerSlideType)}, дължина ${slideLen} мм)`;
        }
        if (APPLIANCE_SLOT_TYPES.has(sl.type)) {
          const ownership =
            sl.applianceOwnership === 'included' ? 'включен в проекта' : 'предоставен от клиента';
          applianceLines.push(
            `• ${prefix}#${idx + 1} (${bayW} мм): ${label} [${ownership}]`,
          );
          if (sl.hasCooktop) {
            applianceLines.push(`• ${prefix}#${idx + 1} (${bayW} мм): Индукционен плот отгоре`);
          }
          return `${label} [${ownership}]`;
        }
        if (sl.hasCooktop) {
          applianceLines.push(`• ${prefix}#${idx + 1} (${bayW} мм): Индукционен плот над модула`);
        }
        const shelfNote = sl.internalShelves > 0 ? `, ${sl.internalShelves} рафта` : '';
        return `${label}${shelfNote}`;
      });

      if (normalized.category === 'kitchen' && normalized.includeUpperCabinets && col.upperType === 'extractor_builtin') {
        applianceLines.push(`• Горен ${prefix}#${idx + 1} (${bayW} мм): Аспиратор за вграждане`);
      } else if (normalized.category === 'kitchen' && normalized.includeUpperCabinets && col.upperType === 'extractor_chimney') {
        applianceLines.push(`• Горен ${prefix}#${idx + 1} (${bayW} мм): Свободно стоящ / декоративен аспиратор`);
      }

      bayLines.push(
        `• ${prefix}#${idx + 1}: Ш=${bayW} мм × В=${bayH} мм × Д корпус=${bayD} мм (лице ${frontT} мм${hasVit ? ' — Витрина S02, -2 мм компенсация' : ''})${upperInfo ? ` | ${upperInfo}` : ''}\n   Секции: ${slotDetails.join('; ')}`,
      );
    });
  };

  collectColumns('Модул ', normalized.columns || []);
  if (normalized.layoutShape === 'l_shape' && (normalized.wingColumns || []).length > 0) {
    collectColumns('Крило Г ', normalized.wingColumns || []);
  }

  // Real Supplier Catalog Selections
  const supplierItemLines: string[] = [];
  if (Array.isArray(normalized.selectedMeritItems) && normalized.selectedMeritItems.length > 0) {
    const meritMap = new Map((params.meritItems || []).map((m) => [m.id, m]));
    for (const sel of normalized.selectedMeritItems) {
      const qty = Math.max(0, Number(sel.quantity) || 0);
      if (qty <= 0) continue;
      const item = meritMap.get(sel.itemId);
      if (item) {
        const lineSum = (qty * (Number(item.priceEur) || 0)).toFixed(2);
        supplierItemLines.push(
          `• [Мерит Пловдив / meritbg.com] ${item.name} (${item.sizeLabel || '-'}, ${item.featureLabel || '-'}, марка: ${item.brandLevel || '-'}) — ${qty} ${item.unit} × ${Number(item.priceEur).toFixed(2)} € = ${lineSum} €`,
        );
      } else {
        supplierItemLines.push(`• [Мерит Пловдив / meritbg.com] Артикул ID ${sel.itemId} × ${qty} бр.`);
      }
    }
  }
  if (Array.isArray(normalized.selectedPartnerItems) && normalized.selectedPartnerItems.length > 0) {
    const partnerMap = new Map(
      (params.partnerItems || []).map((p) => [`${p.vendor}:${p.id}`, p]),
    );
    for (const sel of normalized.selectedPartnerItems) {
      const qty = Math.max(0, Number(sel.quantity) || 0);
      if (qty <= 0) continue;
      const item = partnerMap.get(`${sel.vendor}:${sel.itemId}`);
      const vendorLabel =
        sel.vendor === 'galplas'
          ? 'GAL PLAS LTD (galplas.bg)'
          : 'Настех ООД (гр. Пловдив)';
      if (item) {
        const lineSum = (qty * (Number(item.priceEur) || 0)).toFixed(2);
        supplierItemLines.push(
          `• [${vendorLabel}] ${item.name} (${item.sizeLabel || '-'}, ${item.featureLabel || '-'}, марка: ${item.brandLevel || '-'}) — ${qty} ${item.unit} × ${Number(item.priceEur).toFixed(2)} € = ${lineSum} €`,
        );
      } else {
        supplierItemLines.push(`• [${vendorLabel}] Артикул ID ${sel.itemId} × ${qty} бр.`);
      }
    }
  }

  const slideLenEntries = Object.entries(bom.drawerSlidePairsByLength || {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([len, qty]) => `${len} мм × ${qty} чифта`);

  const vitrineDoorsList = (bom.vitrineDoors || []).map(
    (v, i) => `Витрина #${i + 1}: ${v.widthMm} × ${v.heightMm} мм (профил S02 20 мм)`,
  );

  const lines: string[] = [
    `══════════════════════════════════════════════════`,
    `СК МЕБЕЛИ (Светлозар Колев, гр. Пловдив)`,
    `ЗАПИТВАНЕ И ПЪЛЕН СПЕЦИФИКАЦИОНЕН ПАКЕТ (BOM)`,
    `══════════════════════════════════════════════════`,
    `Код на проекта: ${params.projectCode}`,
    `Заглавие: ${params.title || params.projectCode}`,
    `Клиент: ${params.clientName?.trim() || 'Клиент'}`,
    `Имейл: ${params.clientEmail?.trim() || 'не е посочен'}`,
    `Телефон: ${params.clientPhone?.trim() || 'не е посочен'}`,
    `Обща ориентировъчна сума: ${Math.round(params.totalPriceEur).toLocaleString('bg-BG')} €`,
    ``,
    `── 1. КОНФИГУРАЦИЯ И МАТЕРИАЛИ ──`,
    `Категория: ${formatCategoryBg(normalized.category)}`,
    `Форма: ${normalized.layoutShape === 'l_shape' ? `Г-образна (${normalized.cornerSide === 'left' ? 'ляв' : 'десен'} ъгъл)` : 'Права редица'}`,
    `Външни размери (мм): Ш=${totalWmm} мм × В=${totalHmm} мм × Д=${totalDmm} мм${wingWmm > 0 ? ` + Г-крило ${wingWmm} мм` : ''} (Цокъл ${Math.round((normalized.plinthCm || 0) * 10)} мм)`,
    `Клас обков: ${formatQualityClassBg(hwTier)}${hwTier ? ` (${hwTier.brand} — ${hwTier.nameBg})` : ''}`,
    `Корпус плоча: ${fmtDecor(carcassDecor, normalized.carcassDecorId)}`,
    `Лице / Врати: ${fmtDecor(frontDecor, normalized.frontDecorId)}`,
    ...(normalized.category === 'kitchen'
      ? [
          `Работен плот: ${fmtDecor(counterDecor, normalized.countertopDecorId)} (дебелина ${normalized.countertopThicknessMm || 40} мм)`,
          normalized.includeBacksplash
            ? `Термо гръб: ${fmtDecor(backsplashDecor, normalized.backsplashDecorId || normalized.countertopDecorId)} (${normalized.backsplashThicknessMm || 10} мм × ${normalized.backsplashHeightMm || 600} мм)`
            : `Термо гръб: Не`,
        ]
      : []),
    `Кантиране: ${(normalized.edgeBandingType || 'eva').toUpperCase()} | Отваряне: ${formatHandleStyleBg(normalized.handleStyle)}`,
    ``,
    `── 2. МОДУЛИ И ШКАФОВЕ (БРОЙКИ И РАЗМЕРИ В MM) ──`,
    `Общ брой модули: ${(normalized.columns?.length || 0) + (normalized.wingColumns?.length || 0)} бр.`,
    ...bayLines,
    ``,
    `── 3. ОБОБЩЕН СПИСЪК С ОБКОВА И РАЗХОДНА НОРМА (BOM) ──`,
    `• Плочи корпус: ${bom.carcassAreaSqm.toFixed(2)} м² | Лице: ${bom.frontAreaSqm.toFixed(2)} м² | Прибл. плочи (2800×2070 мм): ${bom.sheetsEstimated} бр.`,
    `• HDF гръб 4 мм: ${bom.hdfBackAreaSqm.toFixed(2)} м² | Кант: ${bom.edgeBandingMeters} л.м.`,
    `• Панти общо: ${bom.hingesCount} бр. (Стандарт: ${bom.standardHingesCount ?? 0} | Плавно: ${bom.softCloseHingesCount ?? 0} | Ъглови: ${bom.cornerHingesCount ?? 0})`,
    `• Водачи за чекмеджета: ${bom.drawerSlidePairs} чифта${slideLenEntries.length > 0 ? ` (${slideLenEntries.join(', ')})` : ''}`,
    ...(bom.vitrineDoors && bom.vitrineDoors.length > 0
      ? [
          `• Витрини S02 (20 мм алуминиев профил + 4 мм стъкло, -2 мм корпус): ${bom.vitrineDoors.length} бр. (${bom.glassFrontAreaSqm ?? 0} м²) — ${vitrineDoorsList.join('; ')}`,
        ]
      : [`• Витрини S02: 0 бр.`]),
    `• Клапи / Повдигачи: ${bom.liftMechanismsCount} бр. | Дръжки: ${bom.handlesCount} бр. | Окачвачи: ${bom.wallHangersCount} бр. | Крачета: ${bom.legsCount} бр.`,
    ...((bom.golaLMeters || 0) + (bom.golaCMeters || 0) > 0
      ? [`• Gola профили: L=${bom.golaLMeters} л.м. | C=${bom.golaCMeters} л.м.`]
      : []),
    ...((bom.upperProfileMeters || 0) > 0
      ? [`• Горен LED / вкопан профил: ${bom.upperProfileMeters} л.м.`]
      : []),
    ...((bom.cargoBasketsCount || 0) > 0 ? [`• Карго кошници: ${bom.cargoBasketsCount} бр.`] : []),
    ...((bom.cornerMechanismsCount || 0) > 0 ? [`• Ъглови механизми: ${bom.cornerMechanismsCount} бр.`] : []),
    ...((bom.slidingDoorsCount || 0) > 0
      ? [`• Плъзгащи врати: ${bom.slidingDoorsCount} бр. | 3м релси: ${bom.slidingRailBars3m} бр. | 3м кант-дръжки: ${bom.slidingHandleBars3m} бр.`]
      : []),
    ...((bom.clothesRailsMeters || 0) > 0 ? [`• Лостове за дрехи: ${bom.clothesRailsMeters} л.м.`] : []),
    ...(normalized.category === 'kitchen'
      ? [
          `• Плот: ${bom.countertopMeters} л.м. | Термо гръб: ${bom.backsplashAreaSqm ?? 0} м² | Цокъл: ${bom.plinthMeters ?? 0} л.м. | Водобран: ${bom.waterSealMeters ?? 0} л.м. | Отвори: ${bom.cutoutsCount ?? 0} бр.`,
        ]
      : []),
    ``,
    `── 4. УРЕДИ В ПРОЕКТА ──`,
    ...(applianceLines.length > 0 ? applianceLines : [`• Няма вградени уреди`]),
  ];

  if (supplierItemLines.length > 0) {
    lines.push(``, `── 5. ДОПЪЛНИТЕЛЕН ОБКОВ ОТ ДОСТАВЧИЦИТЕ ──`, ...supplierItemLines);
  }

  if (params.questionText?.trim()) {
    lines.push(``, `── БЕЛЕЖКИ И ВЪПРОСИ ОТ КЛИЕНТА ──`, params.questionText.trim());
  }

  lines.push(
    ``,
    `── ПРИКАЧЕНИ ФАЙЛОВЕ ──`,
    `1. Proekt_AutoCAD_3D.dxf (3D AutoCAD чертеж в мм, слоеве: 3D_KORPUS, 3D_VRATI, 3D_VITRINI, 3D_PLOT_RAFTOVE, 3D_RAZMERI)`,
    `2. Proekt_3D.json (Пълна 3D конфигурация за директно отваряне в конфигуратора и админ панела)`,
  );

  const fullReportText = lines.join('\n');

  // Mailto bodies over ~1900 chars get clipped on some Windows/browser mail clients; keep compact structured mailtoBody
  const mailtoLines: string[] = [
    `СК МЕБЕЛИ — ЗАПИТВАНЕ ЗА ОФЕРТА (${params.projectCode})`,
    `Клиент: ${params.clientName?.trim() || 'Клиент'} | Тел: ${params.clientPhone?.trim() || '-'} | Имейл: ${params.clientEmail?.trim() || '-'}`,
    `Проект: ${params.title || params.projectCode} | Сума: ${Math.round(params.totalPriceEur)} EUR`,
    `Размери: ${totalWmm}x${totalHmm}x${totalDmm} mm${wingWmm > 0 ? ` + Г ${wingWmm} mm` : ''}`,
    `Обков: ${formatQualityClassBg(hwTier)}${hwTier ? ` (${hwTier.brand})` : ''}`,
    `Материали: Корпус ${fmtDecor(carcassDecor, normalized.carcassDecorId)} | Лице ${fmtDecor(frontDecor, normalized.frontDecorId)}`,
    ``,
    `МОДУЛИ (${(normalized.columns?.length || 0) + (normalized.wingColumns?.length || 0)} бр.):`,
    ...normalized.columns.map((c, i) => {
      const w = Math.round(c.widthCm * 10);
      const h = Math.round((c.heightCm || normalized.heightCm) * 10);
      const d = getBayCarcassDepthMm(normalized, c, false);
      return `#${i + 1}: ${w}x${h}x${d}mm${columnHasVitrine(c) ? ' [S02 20mm/-2mm]' : ''} (${c.slots.map((s) => SLOT_BG_LABELS[s.type] || s.type).join(', ')})`;
    }),
    ``,
    `BOM: Плочи ${bom.sheetsEstimated} бр. (${(bom.carcassAreaSqm + bom.frontAreaSqm).toFixed(1)} m2) | Кант ${bom.edgeBandingMeters} m | Панти ${bom.hingesCount} бр. | Водачи ${bom.drawerSlidePairs} чифта${slideLenEntries.length ? ` (${slideLenEntries.join(', ')})` : ''} | Витрини S02: ${bom.vitrineDoors?.length || 0} бр. | Дръжки ${bom.handlesCount} бр.`,
    ...(applianceLines.length > 0 ? [`УРЕДИ: ${applianceLines.map((l) => l.replace(/^•\s*/, '')).join('; ')}`] : []),
    ...(supplierItemLines.length > 0
      ? [`ДОП. ОБКОВ: ${supplierItemLines.slice(0, 8).map((l) => l.replace(/^•\s*/, '')).join(' | ')}`]
      : []),
    ...(params.questionText?.trim() ? [``, `Въпрос/Бележка: ${params.questionText.trim().slice(0, 350)}`] : []),
    ``,
    `МОЛЯ ПРИКАЧЕТЕ ДВАТА СВАЛЕНИ ФАЙЛА: Proekt_AutoCAD_3D.dxf и Proekt_3D.json`,
  ];

  const mailtoBody = mailtoLines.join('\n').slice(0, 1850);

  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #18181b; max-width: 780px; line-height: 1.5;">
      <h2 style="margin: 0 0 8px; color: #8c5a2b;">СК МЕБЕЛИ — Ново запитване (${escapeHtml(params.projectCode)})</h2>
      <p style="margin: 0 0 14px; font-size: 13px; color: #52525b;">
        Клиент: <strong>${escapeHtml(params.clientName?.trim() || 'Клиент')}</strong> ·
        Тел: <strong>${escapeHtml(params.clientPhone?.trim() || '-')}</strong> ·
        Имейл: <strong>${escapeHtml(params.clientEmail?.trim() || '-')}</strong> ·
        Сума: <strong>${Math.round(params.totalPriceEur).toLocaleString('bg-BG')} €</strong>
      </p>
      <pre style="background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px; font-size: 12px; white-space: pre-wrap;">${escapeHtml(fullReportText)}</pre>
    </div>
  `.trim();

  const subject = `СК МЕБЕЛИ · Оферта 3D Проект ${params.projectCode} (${params.title || formatCategoryBg(normalized.category)}) — ${Math.round(params.totalPriceEur)} EUR`;

  return {
    subject,
    fullReportText,
    mailtoBody,
    htmlBody,
    bom,
    totalPriceEur: Math.round(params.totalPriceEur),
  };
}

export function triggerBrowserFileDownload(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8;',
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
