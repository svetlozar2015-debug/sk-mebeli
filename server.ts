import express from 'express';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  ADMIN_EMAIL,
  DEFAULT_BOARD_DECORS,
  DEFAULT_GALLERY_PROJECTS,
  DEFAULT_HARDWARE_TIERS,
  DEFAULT_PRICING_CONFIG,
  DEFAULT_SITE_SETTINGS,
} from './src/data/catalogDefaults.ts';
import { DEFAULT_MERIT_ITEMS } from './src/data/meritCatalogDefaults.ts';
import {
  DEFAULT_GALPLAS_ITEMS,
  DEFAULT_NASTEH_ITEMS,
} from './src/data/partnerCatalogDefaults.ts';
import { computeFurnitureBOM } from './src/lib/carpentryEngine.ts';
import { AUTOCAD_3D_DXF_FILENAME, generateFurnitureDxf } from './src/lib/dxfExport.ts';
import {
  buildProject3DJson,
  buildProjectBomEmailReport,
  PROJECT_3D_JSON_FILENAME,
} from './src/lib/projectPackage.ts';
import {
  BoardDecor,
  FurnitureConfig,
  GalleryProject,
  HardwareTier,
  HardwareTierLevel,
  MeritCatalogItem,
  PartnerCatalogItem,
  PartnerSubsectionDef,
  PartnerVendorId,
  PricingConfig,
  QuoteResponse,
  SiteSettings,
  UserProject,
} from './src/types/furniture.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const PRICING_FILE = path.join(DATA_DIR, 'pricing-config.json');
const DECORS_FILE = path.join(DATA_DIR, 'board-decors.json');
const HARDWARE_FILE = path.join(DATA_DIR, 'hardware-tiers.json');
const GALLERY_FILE = path.join(DATA_DIR, 'gallery-projects.json');
const COMPANY_FILE = path.join(DATA_DIR, 'site-settings.json');
const MERIT_FILE = path.join(DATA_DIR, 'merit-catalog.json');
const GALPLAS_FILE = path.join(DATA_DIR, 'galplas-catalog.json');
const NASTEH_FILE = path.join(DATA_DIR, 'nasteh-catalog.json');
const CRM_PROJECTS_FILE = path.join(DATA_DIR, 'crm-projects.json');

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch (err) {
    console.warn(`Could not read ${filePath}:`, err);
  }
  return structuredClone(fallback);
}

function writeJsonFile(filePath: string, data: unknown): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to write ${filePath}:`, err);
  }
}

function mergeHardwarePricesMap(
  rawHw?: Record<string, PricingConfig['hardwarePrices'][string]>,
): PricingConfig['hardwarePrices'] {
  const merged: PricingConfig['hardwarePrices'] = {};
  for (const [k, defRates] of Object.entries(DEFAULT_PRICING_CONFIG.hardwarePrices)) {
    merged[k] = { ...defRates, ...(rawHw?.[k] || {}) };
  }
  for (const [k, customRates] of Object.entries(rawHw || {})) {
    if (!merged[k]) merged[k] = customRates;
  }
  return merged;
}

function loadPricingStore(): PricingConfig {
  const parsed = readJsonFile<PricingConfig | null>(PRICING_FILE, null);
  if (parsed && typeof parsed.craftsmanshipPercent === 'number') {
    return {
      ...DEFAULT_PRICING_CONFIG,
      ...parsed,
      boardGroupMultipliers: {
        group1: parsed.boardGroupMultipliers?.group1 ?? 1.0,
        group2: parsed.boardGroupMultipliers?.group2 ?? 1.12,
        group3: parsed.boardGroupMultipliers?.group3 ?? 1.35,
      },
      vitrineS02: {
        ...DEFAULT_PRICING_CONFIG.vitrineS02!,
        ...(parsed.vitrineS02 || {}),
      },
      boardPricesPerSqm: {
        ...DEFAULT_PRICING_CONFIG.boardPricesPerSqm,
        ...(parsed.boardPricesPerSqm || {}),
      },
      hardwarePrices: mergeHardwarePricesMap(parsed.hardwarePrices),
    };
  }
  return structuredClone(DEFAULT_PRICING_CONFIG);
}

function savePricingStore(pricing: PricingConfig): void {
  writeJsonFile(PRICING_FILE, pricing);
}

let activePricing: PricingConfig = loadPricingStore();
let activeDecors: BoardDecor[] = readJsonFile<BoardDecor[]>(DECORS_FILE, DEFAULT_BOARD_DECORS);
let activeHardwareTiers: HardwareTier[] = readJsonFile<HardwareTier[]>(
  HARDWARE_FILE,
  DEFAULT_HARDWARE_TIERS,
);
let activeMeritItems: MeritCatalogItem[] = readJsonFile<MeritCatalogItem[]>(
  MERIT_FILE,
  DEFAULT_MERIT_ITEMS,
);
let activeGalplasItems: PartnerCatalogItem[] = readJsonFile<PartnerCatalogItem[]>(
  GALPLAS_FILE,
  DEFAULT_GALPLAS_ITEMS,
);
const initialNastehStore = readJsonFile<{
  items?: PartnerCatalogItem[];
  customSubsections?: PartnerSubsectionDef[];
}>(NASTEH_FILE, {
  items: DEFAULT_NASTEH_ITEMS,
  customSubsections: [],
});
let activeNastehItems: PartnerCatalogItem[] = Array.isArray(initialNastehStore.items)
  ? initialNastehStore.items
  : structuredClone(DEFAULT_NASTEH_ITEMS);
let activeNastehSubsections: PartnerSubsectionDef[] = Array.isArray(
  initialNastehStore.customSubsections,
)
  ? initialNastehStore.customSubsections
  : [];

async function verifyAdminFirebaseUser(
  authHeader?: string,
): Promise<{ isAdmin: boolean; email: string | null }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { isAdmin: false, email: null };
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return { isAdmin: false, email: null };
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!resp.ok) return { isAdmin: false, email: null };
    const data = (await resp.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user || !user.localId || !user.email || user.emailVerified !== true) {
      return { isAdmin: false, email: null };
    }
    if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      return { isAdmin: true, email: user.email };
    }
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    const adminDocResp = await fetch(
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(user.localId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
      },
    );
    if (adminDocResp.ok) {
      return { isAdmin: true, email: user.email };
    }
    return { isAdmin: false, email: null };
  } catch {
    return { isAdmin: false, email: null };
  }
}

async function verifyAdminFirebaseToken(authHeader?: string): Promise<boolean> {
  const res = await verifyAdminFirebaseUser(authHeader);
  return res.isAdmin;
}

async function verifyFirebaseUserEmail(authHeader?: string): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{ email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    return user && user.emailVerified === true && user.email ? user.email : null;
  } catch {
    return null;
  }
}

function computePriceEur(config: FurnitureConfig, pricing: PricingConfig) {
  const matchedHw = activeHardwareTiers.find((h) => h.id === config.hardwareTierId);
  const hwLevel: HardwareTierLevel = matchedHw?.tier || 'economy';
  const { normalized, bom } = computeFurnitureBOM(config, hwLevel);

  if (normalized.columns.length === 0 && normalized.wingColumns.length === 0) {
    return {
      normalized,
      bom,
      totalPriceEur: 0,
      logisticsFeeEur: 0,
      materialCostEur: 0,
      hardwareCostEur: 0,
      meritItemsCount: 0,
      meritItemsCostEur: 0,
      partnerItemsCount: 0,
      partnerItemsCostEur: 0,
      vitrineS02Count: 0,
      vitrineS02CostEur: 0,
      edgeAndHdfCostEur: 0,
      rawCostEur: 0,
      craftsmanshipProfitEur: 0,
      globalMarginPercent: Math.max(0, Number(pricing.globalMarginPercent) || 0),
      globalMarginEur: 0,
    };
  }

  const carcassRate = pricing.boardPricesPerSqm[normalized.carcassDecorId] ?? 20;
  const frontRate = pricing.boardPricesPerSqm[normalized.frontDecorId] ?? 22;
  const hwRates = pricing.hardwarePrices[normalized.hardwareTierId] ?? pricing.hardwarePrices.hw_economy;

  // Material Price Group Multipliers (Group 1 / 2 / 3)
  const carcassDecor = activeDecors.find((d) => d.id === normalized.carcassDecorId);
  const frontDecor = activeDecors.find((d) => d.id === normalized.frontDecorId);
  const groupMults = pricing.boardGroupMultipliers || { group1: 1.0, group2: 1.12, group3: 1.35 };
  const resolveGroupMult = (group?: number) =>
    group === 3 ? groupMults.group3 : group === 2 ? groupMults.group2 : groupMults.group1;

  // Apply configurable sheet cutting waste factor to board areas (default 15%)
  const wasteFactor = 1 + (pricing.wastePercent ?? 15) / 100;
  const carcassCost =
    bom.carcassAreaSqm * wasteFactor * carcassRate * resolveGroupMult(carcassDecor?.priceGroup);
  const frontCost =
    bom.frontAreaSqm * wasteFactor * frontRate * resolveGroupMult(frontDecor?.priceGroup);
  const glassFrontCost = (bom.glassFrontAreaSqm || 0) * (pricing.glassFrameEurPerSqm ?? 95);
  const ctMm = normalized.countertopThicknessMm || 40;
  const ctThicknessFactor = ctMm === 20 ? 0.82 : ctMm === 30 ? 0.92 : 1.0;
  const countertopCost = bom.countertopMeters * pricing.countertopEurPerMeter * ctThicknessFactor;
  const bsMm = normalized.backsplashThicknessMm || 10;
  const bsThicknessFactor = bsMm === 8 ? 0.9 : bsMm === 12 ? 1.12 : bsMm === 15 ? 1.25 : 1.0;
  const backsplashCost =
    (bom.backsplashAreaSqm || 0) * (pricing.backsplashEurPerSqm ?? 44.0) * bsThicknessFactor;
  const plinthTrimCost = (bom.plinthMeters || 0) * (pricing.plinthEurPerMeter ?? 12.0);
  const waterSealCost = (bom.waterSealMeters || 0) * (pricing.waterSealEurPerMeter ?? 9.0);
  const materialCostEur =
    carcassCost + frontCost + glassFrontCost + countertopCost + backsplashCost + plinthTrimCost + waterSealCost;

  const cutoutsCost = (bom.cutoutsCount || 0) * (pricing.cutoutEurPerHole ?? 25.0);
  const cornerMillingCost = (bom.cornerMillingCount || 0) * (pricing.cornerMillingEur ?? 55.0);
  const handleMillingCost = (bom.handleMillingMeters || 0) * (pricing.handleMillingEurPerMeter ?? 14.0);
  const edgeRate =
    normalized.edgeBandingType === 'pur'
      ? pricing.purEdgeBandingEurPerMeter ?? 3.2
      : pricing.edgeBandingEurPerMeter;
  const edgeAndHdfCostEur =
    bom.edgeBandingMeters * edgeRate +
    bom.hdfBackAreaSqm * pricing.hdfBackEurPerSqm +
    cutoutsCost +
    cornerMillingCost +
    handleMillingCost;

  const explicitSlides =
    (bom.ballBearingSlidePairs || 0) +
    (bom.telescopicSlidePairs || 0) +
    (bom.blumHiddenSlidePairs || 0);
  const defaultSlidePairs = Math.max(0, bom.drawerSlidePairs - explicitSlides);

  // Tier default drawer slide rate from Admin's detailed purchasing table:
  // Level 1 (Economy): Roller (drawerSlideEur)
  // Level 2 (Standard Balance): Hidden undermount or Telescopic (slideHiddenEur / slideTelescopicEur)
  // Level 3 (Premium Blum/Hettich): Metal Box / Hidden (slideMetalBoxEur / slideHiddenEur)
  const tierDefaultSlideEur =
    hwLevel === 'economy'
      ? hwRates.drawerSlideEur
      : hwLevel === 'standard'
        ? hwRates.slideHiddenEur ?? hwRates.slideTelescopicEur ?? hwRates.drawerSlideEur
        : hwRates.slideMetalBoxEur ?? hwRates.slideHiddenEur ?? hwRates.drawerSlideEur;

  const economySlideEur = pricing.hardwarePrices.hw_economy?.drawerSlideEur ?? 4.5;
  const telescopicSlideEur =
    hwRates.slideTelescopicEur ?? pricing.hardwarePrices.hw_gtv?.slideTelescopicEur ?? 13.5;
  const blumSlideEur =
    hwRates.slideMetalBoxEur ??
    hwRates.slideHiddenEur ??
    pricing.hardwarePrices.hw_blum?.slideMetalBoxEur ??
    58.0;

  const slideUnits = bom.drawerSlideCostUnits;
  const drawerSlideCostEur =
    (slideUnits ? slideUnits.defaultTier : defaultSlidePairs) * tierDefaultSlideEur +
    (slideUnits ? slideUnits.ballBearing : bom.ballBearingSlidePairs || 0) * economySlideEur +
    (slideUnits ? slideUnits.telescopic : bom.telescopicSlidePairs || 0) * telescopicSlideEur +
    (slideUnits ? slideUnits.blumHidden : bom.blumHiddenSlidePairs || 0) * blumSlideEur;

  const hingesCostEur =
    (bom.standardHingesCount ?? (hwLevel === 'economy' ? bom.hingesCount : 0)) * hwRates.hingeEur +
    (bom.softCloseHingesCount ?? (hwLevel !== 'economy' ? bom.hingesCount : 0)) *
      (hwRates.hingeSoftCloseEur ?? hwRates.hingeEur) +
    (bom.cornerHingesCount || 0) * (hwRates.hingeCornerEur ?? hwRates.hingeEur * 1.4);

  const liftsCostEur =
    (bom.liftGasCount || 0) * hwRates.liftEur +
    (bom.liftDoubleCount || 0) * (hwRates.liftDoubleAventosEur ?? hwRates.liftEur);

  const golaMetersTotal = (bom.golaLMeters || 0) + (bom.golaCMeters || 0);
  const golaProfileCostEur = golaMetersTotal * (pricing.golaProfileEurPerMeter ?? 18.0);

  const upperProfileRate =
    normalized.upperProfileStyle === 'led_double'
      ? (pricing.upperLedProfileEurPerMeter ?? 22.0) * 1.45
      : normalized.upperProfileStyle === 'led_single'
        ? (pricing.upperLedProfileEurPerMeter ?? 22.0)
        : normalized.upperProfileStyle === 'recessed_bottom'
          ? (pricing.golaProfileEurPerMeter ?? 18.0)
          : 0;
  const upperProfileCostEur = (bom.upperProfileMeters || 0) * upperProfileRate;

  const cargoBasketCostEur = (bom.cargoBasketsCount || 0) * (pricing.cargoBasketEur ?? 75.0);
  const cornerMechCostEur = (bom.cornerMechanismsCount || 0) * (pricing.cornerMechanismEur ?? 240.0);

  // Wardrobe Sliding Systems: 3m rail sticks + mechanisms per door + 3m handle bars
  const slidingSystemCostEur =
    (bom.slidingDoorsCount || 0) > 0 &&
    (hwRates.slidingRail3mEur !== undefined ||
      hwRates.slidingMechPerDoorEur !== undefined ||
      hwRates.slidingHandleBar3mEur !== undefined)
      ? (bom.slidingRailBars3m || 0) * (hwRates.slidingRail3mEur ?? 64) +
        (bom.slidingDoorsCount || 0) * (hwRates.slidingMechPerDoorEur ?? 44) +
        (bom.slidingHandleBars3m || 0) * (hwRates.slidingHandleBar3mEur ?? 34)
      : (bom.slidingTrackMeters || 0) * (pricing.slidingTrackEurPerMeter ?? 85.0);

  const clothesRailCostEur = (bom.clothesRailsMeters || 0) * (pricing.clothesRailEurPerMeter ?? 18.0);

  let meritItemsCount = 0;
  let meritItemsCostEur = 0;
  if (Array.isArray(config.selectedMeritItems) && config.selectedMeritItems.length > 0) {
    const meritMap = new Map(activeMeritItems.map((m) => [m.id, m]));
    for (const sel of config.selectedMeritItems) {
      const qty = Math.max(0, Number(sel.quantity) || 0);
      if (qty <= 0) continue;
      const item = meritMap.get(sel.itemId);
      if (item && item.active !== false) {
        meritItemsCount += qty;
        meritItemsCostEur += Math.max(0, Number(item.priceEur) || 0) * qty;
      }
    }
  }

  let partnerItemsCount = 0;
  let partnerItemsCostEur = 0;
  if (Array.isArray(config.selectedPartnerItems) && config.selectedPartnerItems.length > 0) {
    const galplasMap = new Map(activeGalplasItems.map((m) => [m.id, m]));
    const nastehMap = new Map(activeNastehItems.map((m) => [m.id, m]));
    for (const sel of config.selectedPartnerItems) {
      const qty = Math.max(0, Number(sel.quantity) || 0);
      if (qty <= 0) continue;
      const item =
        sel.vendor === 'galplas'
          ? galplasMap.get(sel.itemId)
          : sel.vendor === 'nasteh'
            ? nastehMap.get(sel.itemId)
            : undefined;
      const priceVal = Number(item?.priceEur) || 0;
      if (item && item.active !== false && priceVal > 0) {
        partnerItemsCount += qty;
        partnerItemsCostEur += priceVal * qty;
      }
    }
  }

  // Automatic Glass Vitrine w/ Aluminium Profile (тип S02) Calculator
  const vitrineDoors = bom.vitrineDoors || [];
  const vitrineS02Count = vitrineDoors.length;
  let vitrineS02CostEur = 0;
  if (vitrineS02Count > 0) {
    const s02 = pricing.vitrineS02 || DEFAULT_PRICING_CONFIG.vitrineS02!;
    const frameSmall = Math.max(0, Number(s02.frameUpTo350x1100Eur ?? 44.01));
    const frameMed = Math.max(0, Number(s02.frameUpTo500x1300Eur ?? 52.33));
    const frameLarge = Math.max(0, Number(s02.frameUpTo500x2300Eur ?? 76.08));
    const glassPerSqm = Math.max(0, Number(s02.glassDarkGrey4mmPerSqmEur ?? 52.15));
    const edgePerM = Math.max(0, Number(s02.glassEdgeProcessingPerMeterEur ?? 1.86));
    const hexiHandleEur = Math.max(0, Number(s02.hexiHandleProfileEur ?? 18.42));
    const blumOnixEur = Math.max(0, Number(s02.blumOnixHingeSetEur ?? 5.01));
    const useHexiHandle = config.vitrineHexiHandle !== false;

    for (const door of vitrineDoors) {
      const wM = Math.max(0.1, (Number(door.widthMm) || 400) / 1000);
      const hM = Math.max(0.1, (Number(door.heightMm) || 720) / 1000);
      const frameCost =
        door.heightMm <= 1100
          ? frameSmall
          : door.heightMm <= 1300
            ? frameMed
            : frameLarge;
      const glassAreaCost = wM * hM * 1.05 * glassPerSqm;
      const glassEdgeCost = 2 * (wM + hM) * edgePerM;
      const handleCost = useHexiHandle ? hexiHandleEur : 0;
      const hingesPerDoor = door.heightMm <= 1000 ? 2 : door.heightMm <= 1600 ? 3 : 4;
      const hingesCost = hingesPerDoor * blumOnixEur;
      vitrineS02CostEur += frameCost + glassAreaCost + glassEdgeCost + handleCost + hingesCost;
    }
  }

  const hardwareCostEur =
    hingesCostEur +
    drawerSlideCostEur +
    liftsCostEur +
    bom.wallHangersCount * hwRates.hangerEur +
    bom.handlesCount * hwRates.handleEur +
    golaProfileCostEur +
    upperProfileCostEur +
    cargoBasketCostEur +
    cornerMechCostEur +
    slidingSystemCostEur +
    clothesRailCostEur +
    bom.legsCount * hwRates.legEur +
    meritItemsCostEur +
    partnerItemsCostEur +
    vitrineS02CostEur;

  const rawCostEur = materialCostEur + edgeAndHdfCostEur + hardwareCostEur;
  const craftsmanshipProfitEur = rawCostEur * (pricing.craftsmanshipPercent / 100);
  const installationFeeEur = rawCostEur * ((pricing.installationPercent ?? 0) / 100);

  // Logistics: base transport + floor carry without elevator + outside-city km
  const baseTransportEur = pricing.transportEur ?? 0;
  const floorNum = Math.max(0, Math.round(normalized.deliveryFloor || 0));
  const floorCarryFeeEur =
    !normalized.hasElevator && floorNum > 0
      ? floorNum * (pricing.floorCarryEurPerFloor ?? 15)
      : 0;
  const outsideKmFeeEur =
    Math.max(0, Number(normalized.outsideCityKm) || 0) * (pricing.outsideCityEurPerKm ?? 0.9);
  const logisticsFeeEur = Math.round(baseTransportEur + floorCarryFeeEur + outsideKmFeeEur);

  const subtotalBeforeGlobalMargin =
    rawCostEur + craftsmanshipProfitEur + installationFeeEur + logisticsFeeEur;
  const globalMarginPercent = Math.max(0, Number(pricing.globalMarginPercent) || 0);
  const globalMarginEur = subtotalBeforeGlobalMargin * (globalMarginPercent / 100);

  const totalPriceEur =
    Math.round((subtotalBeforeGlobalMargin + globalMarginEur) / 5) * 5;

  return {
    normalized,
    bom,
    totalPriceEur: Math.max(85, totalPriceEur),
    logisticsFeeEur,
    materialCostEur: Number(materialCostEur.toFixed(2)),
    hardwareCostEur: Number(hardwareCostEur.toFixed(2)),
    meritItemsCount,
    meritItemsCostEur: Number(meritItemsCostEur.toFixed(2)),
    partnerItemsCount,
    partnerItemsCostEur: Number(partnerItemsCostEur.toFixed(2)),
    vitrineS02Count,
    vitrineS02CostEur: Number(vitrineS02CostEur.toFixed(2)),
    edgeAndHdfCostEur: Number(edgeAndHdfCostEur.toFixed(2)),
    rawCostEur: Number(rawCostEur.toFixed(2)),
    craftsmanshipProfitEur: Number(craftsmanshipProfitEur.toFixed(2)),
    globalMarginPercent,
    globalMarginEur: Number(globalMarginEur.toFixed(2)),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/admin/verify', async (req, res) => {
    const adminCheck = await verifyAdminFirebaseUser(req.headers.authorization);
    if (!adminCheck.isAdmin) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({ ok: true, email: adminCheck.email });
  });

  // Public catalog overrides persisted on server
  app.get('/api/catalog', (_req, res) => {
    const siteSettings = fs.existsSync(COMPANY_FILE)
      ? readJsonFile<SiteSettings | null>(COMPANY_FILE, null)
      : null;
    const decors = fs.existsSync(DECORS_FILE)
      ? readJsonFile<BoardDecor[] | null>(DECORS_FILE, null)
      : null;
    const hardwareTiers = fs.existsSync(HARDWARE_FILE)
      ? readJsonFile<HardwareTier[] | null>(HARDWARE_FILE, null)
      : null;
    const gallery = fs.existsSync(GALLERY_FILE)
      ? readJsonFile<GalleryProject[] | null>(GALLERY_FILE, null)
      : null;
    const meritItems = fs.existsSync(MERIT_FILE)
      ? readJsonFile<MeritCatalogItem[] | null>(MERIT_FILE, null)
      : activeMeritItems;
    const meritServerOverride = fs.existsSync(MERIT_FILE);
    const galplasServerOverride = fs.existsSync(GALPLAS_FILE);
    const nastehServerOverride = fs.existsSync(NASTEH_FILE);
    res.json({
      siteSettings,
      decors,
      hardwareTiers,
      gallery,
      meritItems,
      meritServerOverride,
      galplasItems: activeGalplasItems,
      galplasServerOverride,
      nastehItems: activeNastehItems,
      nastehCustomSubsections: activeNastehSubsections,
      nastehServerOverride,
    });
  });

  // Public quote endpoint: NEVER leaks raw board prices, hardware unit costs, or markup %
  app.post('/api/quote/calculate', async (req, res) => {
    try {
      const config = req.body?.config as FurnitureConfig | undefined;
      if (!config || !Array.isArray(config.columns)) {
        res.status(400).json({ error: 'Invalid furniture configuration' });
        return;
      }

      const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
      const currentResult = computePriceEur(config, activePricing);

      // Also calculate cheapest baseline start for comparison
      const baseConfig: FurnitureConfig = {
        ...config,
        carcassDecorId: 'kast_d152',
        frontDecorId: 'kast_d152',
        hardwareTierId: 'hw_economy',
      };
      const baseResult = computePriceEur(baseConfig, activePricing);

      const isEmptyProject =
        currentResult.normalized.columns.length === 0 &&
        currentResult.normalized.wingColumns.length === 0;
      const totalBoardArea = Number(
        (currentResult.bom.carcassAreaSqm + currentResult.bom.frontAreaSqm).toFixed(2),
      );
      const productionDays = isEmptyProject
        ? 0
        : config.category === 'kitchen'
          ? activePricing.productionDaysKitchen ?? 18
          : config.category === 'wardrobe'
            ? activePricing.productionDaysWardrobe ?? 14
            : activePricing.productionDaysOther ?? 10;

      const minOrderEur = activePricing.minOrderEur ?? 450;
      const belowMinOrder =
        !isEmptyProject && minOrderEur > 0 && currentResult.totalPriceEur < minOrderEur;

      const payload: QuoteResponse = {
        totalPriceEur: currentResult.totalPriceEur,
        baseStartPriceEur: baseResult.totalPriceEur,
        productionDays,
        minOrderEur,
        belowMinOrder,
        logisticsFeeEur: currentResult.logisticsFeeEur,
        measurementFeeEur: activePricing.measurementFeeEur ?? 0,
        meritItemsCount: currentResult.meritItemsCount,
        meritItemsTotalEur: currentResult.meritItemsCostEur,
        partnerItemsCount: currentResult.partnerItemsCount,
        partnerItemsTotalEur: currentResult.partnerItemsCostEur,
        vitrineS02Count: currentResult.vitrineS02Count,
        vitrineS02TotalEur: currentResult.vitrineS02CostEur,
        serviceZoneBg:
          activePricing.serviceZoneBg || 'Пловдив и областта (безплатно замерване при поръчка)',
        serviceZoneEn:
          activePricing.serviceZoneEn || 'Plovdiv & Region (free measurement on confirmed order)',
        summaryStats: {
          totalWidthCm:
            currentResult.normalized.widthCm +
            (currentResult.normalized.layoutShape === 'l_shape'
              ? currentResult.normalized.wingWidthCm
              : 0),
          boardAreaSqm: totalBoardArea,
          hingesCount: currentResult.bom.hingesCount,
          drawersCount: currentResult.bom.drawerSlidePairs,
          dividersCount: currentResult.bom.dividersCount,
          notices: currentResult.bom.notices,
        },
      };

      if (isAdmin) {
        payload.adminBreakdown = {
          materialCostEur: currentResult.materialCostEur,
          hardwareCostEur: currentResult.hardwareCostEur,
          edgeAndHdfCostEur: currentResult.edgeAndHdfCostEur,
          rawCostEur: currentResult.rawCostEur,
          craftsmanshipPercent: activePricing.craftsmanshipPercent,
          craftsmanshipProfitEur: currentResult.craftsmanshipProfitEur,
          transportAndLogisticsEur: currentResult.logisticsFeeEur,
          meritItemsCostEur: currentResult.meritItemsCostEur,
          partnerItemsCostEur: currentResult.partnerItemsCostEur,
          vitrineS02CostEur: currentResult.vitrineS02CostEur,
          globalMarginPercent: currentResult.globalMarginPercent,
          globalMarginEur: currentResult.globalMarginEur,
          bom: currentResult.bom,
        };
      }

      res.json(payload);
    } catch (err) {
      console.error('Quote calculation error:', err);
      res.status(400).json({ error: 'Invalid furniture configuration payload' });
    }
  });

  // Admin-only hidden pricing endpoints
  app.get('/api/admin/pricing', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    res.json(activePricing);
  });

  app.post('/api/admin/pricing', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const nextPricing = req.body?.pricing as PricingConfig | undefined;
    if (
      !nextPricing ||
      typeof nextPricing.craftsmanshipPercent !== 'number' ||
      typeof nextPricing.boardPricesPerSqm !== 'object'
    ) {
      res.status(400).json({ error: 'Invalid pricing payload' });
      return;
    }
    activePricing = {
      ...DEFAULT_PRICING_CONFIG,
      ...nextPricing,
      updatedAt: new Date().toISOString(),
    };
    savePricingStore(activePricing);
    res.json({ ok: true, pricing: activePricing });
  });

  app.post('/api/admin/decors', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const decorsList = req.body?.decors as BoardDecor[] | undefined;
    if (!Array.isArray(decorsList)) {
      res.status(400).json({ error: 'Invalid decors payload' });
      return;
    }
    activeDecors = decorsList;
    writeJsonFile(DECORS_FILE, decorsList);
    res.json({ ok: true, decors: decorsList });
  });

  app.post('/api/admin/hardware', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const hardwareList = req.body?.hardwareTiers as HardwareTier[] | undefined;
    if (!Array.isArray(hardwareList)) {
      res.status(400).json({ error: 'Invalid hardware tiers payload' });
      return;
    }
    activeHardwareTiers = hardwareList;
    writeJsonFile(HARDWARE_FILE, hardwareList);
    res.json({ ok: true, hardwareTiers: hardwareList });
  });

  app.post('/api/admin/gallery', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const galleryList = req.body?.gallery as GalleryProject[] | undefined;
    if (!Array.isArray(galleryList)) {
      res.status(400).json({ error: 'Invalid gallery payload' });
      return;
    }
    writeJsonFile(GALLERY_FILE, galleryList);
    res.json({ ok: true, gallery: galleryList });
  });

  app.post('/api/admin/merit', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const items = req.body?.meritItems as MeritCatalogItem[] | undefined;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Invalid Merit catalog payload' });
      return;
    }
    const sanitized: MeritCatalogItem[] = items
      .filter((it) => it && typeof it.id === 'string' && typeof it.name === 'string' && it.name.trim())
      .map((it) => ({
        id: it.id.trim(),
        categoryId: String(it.categoryId || '').trim(),
        subsectionId: String(it.subsectionId || '').trim(),
        name: it.name.trim().slice(0, 180),
        sizeLabel: String(it.sizeLabel || '').trim().slice(0, 80),
        featureLabel: String(it.featureLabel || '').trim().slice(0, 240),
        brandLevel: String(it.brandLevel || '').trim().slice(0, 80),
        unit: String(it.unit || 'бр.').trim().slice(0, 32) || 'бр.',
        priceEur: Math.max(0, Number(it.priceEur) || 0),
        active: it.active !== false,
        updatedAt: new Date().toISOString(),
      }));
    activeMeritItems = sanitized;
    writeJsonFile(MERIT_FILE, sanitized);
    res.json({ ok: true, meritItems: sanitized });
  });

  const sanitizePartnerItemsList = (
    rawItems: PartnerCatalogItem[],
    vendor: PartnerVendorId,
  ): PartnerCatalogItem[] =>
    rawItems
      .filter((it) => it && typeof it.id === 'string' && typeof it.name === 'string' && it.name.trim())
      .map((it) => ({
        id: it.id.trim(),
        vendor,
        categoryId: String(it.categoryId || '').trim().slice(0, 64),
        subsectionId: String(it.subsectionId || '').trim().slice(0, 80),
        name: it.name.trim().slice(0, 180),
        sizeLabel: String(it.sizeLabel || '').trim().slice(0, 80),
        featureLabel: String(it.featureLabel || '').trim().slice(0, 240),
        brandLevel: String(it.brandLevel || '').trim().slice(0, 80),
        qualityClass:
          it.qualityClass === 'high' || it.qualityClass === 'medium' || it.qualityClass === 'low'
            ? it.qualityClass
            : 'medium',
        unit: String(it.unit || 'бр.').trim().slice(0, 32) || 'бр.',
        priceEur: Math.max(0, Number(it.priceEur) || 0),
        active: it.active !== false,
        updatedAt: new Date().toISOString(),
      }));

  app.post('/api/admin/galplas', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const items = req.body?.items as PartnerCatalogItem[] | undefined;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Invalid GAL PLAS catalog payload' });
      return;
    }
    const sanitized = sanitizePartnerItemsList(items, 'galplas');
    activeGalplasItems = sanitized;
    writeJsonFile(GALPLAS_FILE, sanitized);
    res.json({ ok: true, items: sanitized });
  });

  app.post('/api/admin/nasteh', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const items = req.body?.items as PartnerCatalogItem[] | undefined;
    const customSubsections = req.body?.customSubsections as PartnerSubsectionDef[] | undefined;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'Invalid Nasteh catalog payload' });
      return;
    }
    const sanitizedItems = sanitizePartnerItemsList(items, 'nasteh');
    const sanitizedSubs: PartnerSubsectionDef[] = Array.isArray(customSubsections)
      ? customSubsections
          .filter(
            (s) =>
              s &&
              typeof s.id === 'string' &&
              typeof s.categoryId === 'string' &&
              typeof s.nameBg === 'string' &&
              s.nameBg.trim(),
          )
          .map((s) => ({
            id: s.id.trim().slice(0, 80),
            categoryId: s.categoryId.trim().slice(0, 64),
            nameBg: s.nameBg.trim().slice(0, 140),
            nameEn: String(s.nameEn || s.nameBg).trim().slice(0, 140),
            isCustom: true,
          }))
      : activeNastehSubsections;

    activeNastehItems = sanitizedItems;
    activeNastehSubsections = sanitizedSubs;
    writeJsonFile(NASTEH_FILE, { items: sanitizedItems, customSubsections: sanitizedSubs });
    res.json({ ok: true, items: sanitizedItems, customSubsections: sanitizedSubs });
  });

  app.post('/api/admin/company', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const settings = req.body?.siteSettings as SiteSettings | undefined;
    if (!settings || !settings.companyNameBg) {
      res.status(400).json({ error: 'Invalid company profile payload' });
      return;
    }
    const nextSettings = {
      ...DEFAULT_SITE_SETTINGS,
      ...settings,
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile(COMPANY_FILE, nextSettings);
    res.json({ ok: true, siteSettings: nextSettings });
  });

  // Client -> Server CRM Project Sync (captures drafts, inquiries, contact details, and remarketing thread)
  app.post('/api/projects/sync', (req, res) => {
    const proj = req.body?.project as UserProject | undefined;
    if (!proj || !proj.id || !proj.projectCode || !proj.config) {
      res.status(400).json({ error: 'Invalid project payload' });
      return;
    }
    const list = readJsonFile<UserProject[]>(CRM_PROJECTS_FILE, []);
    const idx = list.findIndex((p) => p.id === proj.id || p.projectCode === proj.projectCode);
    const nowIso = new Date().toISOString();
    const existing = idx >= 0 ? list[idx] : undefined;
    const merged: UserProject = {
      ...existing,
      ...proj,
      crmMessages: proj.crmMessages || existing?.crmMessages || [],
      adminNote: proj.adminNote || existing?.adminNote || '',
      bomReportText: proj.bomReportText || existing?.bomReportText,
      emailDeliveryMode: proj.emailDeliveryMode || existing?.emailDeliveryMode,
      emailSentAt: proj.emailSentAt || existing?.emailSentAt,
      createdAt: existing?.createdAt || proj.createdAt || nowIso,
      updatedAt: nowIso,
    };
    if (idx >= 0) {
      list[idx] = merged;
    } else {
      list.unshift(merged);
    }
    writeJsonFile(CRM_PROJECTS_FILE, list.slice(0, 500));
    res.json({ ok: true, project: merged });
  });

  // Full 3-Part Quote Package & Email Dispatch (Proekt_AutoCAD_3D.dxf + Proekt_3D.json + BOM with real suppliers)
  app.post('/api/quote/send-email', async (req, res) => {
    try {
      const body = req.body as {
        config?: FurnitureConfig;
        projectId?: string;
        projectCode?: string;
        title?: string;
        ownerId?: string;
        clientName?: string;
        clientEmail?: string;
        clientPhone?: string;
        questionText?: string;
      };

      const config = body?.config;
      if (!config || typeof config !== 'object' || !Array.isArray(config.columns)) {
        res.status(400).json({ error: 'Invalid furniture configuration payload' });
        return;
      }

      const cleanCode = String(body.projectCode || `AF-${Math.floor(1000 + Math.random() * 8999)}`)
        .trim()
        .slice(0, 40) || 'AF-PROJECT';
      const cleanTitle = String(body.title || cleanCode).trim().slice(0, 160) || cleanCode;
      const cleanName = String(body.clientName || 'Клиент').trim().slice(0, 140) || 'Клиент';
      const cleanEmail = String(body.clientEmail || '').trim().slice(0, 160);
      const cleanPhone = String(body.clientPhone || '').trim().slice(0, 60);
      const cleanQuestion = String(body.questionText || '').trim().slice(0, 2500);
      const cleanOwnerId = String(body.ownerId || 'guest').trim().slice(0, 128) || 'guest';
      const projId =
        String(body.projectId || '').trim().slice(0, 128) ||
        `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const result = computePriceEur(config, activePricing);
      const matchedHw = activeHardwareTiers.find((h) => h.id === result.normalized.hardwareTierId);

      const siteFromDisk = fs.existsSync(COMPANY_FILE)
        ? readJsonFile<SiteSettings | null>(COMPANY_FILE, null)
        : null;
      const candidateRecipient = String(siteFromDisk?.email || DEFAULT_SITE_SETTINGS.email || '').trim();
      const recipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateRecipient)
        ? candidateRecipient
        : 'mebelikolev71@gmail.com';

      const dxfContent = generateFurnitureDxf(result.normalized, cleanCode);
      const projectJsonContent = buildProject3DJson({
        config: result.normalized,
        projectCode: cleanCode,
        title: cleanTitle,
        totalPriceEur: result.totalPriceEur,
        hardwareTier: matchedHw,
        clientName: cleanName,
        clientEmail: cleanEmail,
        clientPhone: cleanPhone,
        notes: cleanQuestion,
      });

      const report = buildProjectBomEmailReport({
        projectCode: cleanCode,
        title: cleanTitle,
        clientName: cleanName,
        clientEmail: cleanEmail,
        clientPhone: cleanPhone,
        questionText: cleanQuestion,
        totalPriceEur: result.totalPriceEur,
        config: result.normalized,
        decors: activeDecors,
        hardwareTiers: activeHardwareTiers,
        meritItems: activeMeritItems,
        partnerItems: [...activeGalplasItems, ...activeNastehItems],
      });

      let deliveryMode: 'resend' | 'smtp' | 'mailto' = 'mailto';
      let deliveryError: string | undefined;
      const validReplyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ? cleanEmail : undefined;

      if (process.env.RESEND_API_KEY) {
        try {
          const resendFrom = process.env.RESEND_FROM || 'SK Mebeli 3D Studio <onboarding@resend.dev>';
          const resendResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: resendFrom,
              to: [recipientEmail],
              ...(validReplyTo ? { reply_to: validReplyTo } : {}),
              subject: report.subject,
              text: report.fullReportText,
              html: report.htmlBody,
              attachments: [
                {
                  filename: AUTOCAD_3D_DXF_FILENAME,
                  content: Buffer.from(dxfContent, 'utf-8').toString('base64'),
                },
                {
                  filename: PROJECT_3D_JSON_FILENAME,
                  content: Buffer.from(projectJsonContent, 'utf-8').toString('base64'),
                },
              ],
            }),
          });
          if (resendResp.ok) {
            deliveryMode = 'resend';
          } else {
            const errTxt = await resendResp.text().catch(() => '');
            deliveryError = `Resend HTTP ${resendResp.status}: ${errTxt.slice(0, 180)}`;
            console.warn('Resend email failed, falling back to mailto:', deliveryError);
          }
        } catch (err) {
          deliveryError = err instanceof Error ? err.message : 'Resend dispatch error';
          console.warn('Resend exception, falling back to mailto:', deliveryError);
        }
      } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
          const smtpPort = Number(process.env.SMTP_PORT) || 587;
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: recipientEmail,
            ...(validReplyTo ? { replyTo: validReplyTo } : {}),
            subject: report.subject,
            text: report.fullReportText,
            html: report.htmlBody,
            attachments: [
              {
                filename: AUTOCAD_3D_DXF_FILENAME,
                content: Buffer.from(dxfContent, 'utf-8'),
                contentType: 'application/dxf',
              },
              {
                filename: PROJECT_3D_JSON_FILENAME,
                content: Buffer.from(projectJsonContent, 'utf-8'),
                contentType: 'application/json',
              },
            ],
          });
          deliveryMode = 'smtp';
        } catch (err) {
          deliveryError = err instanceof Error ? err.message : 'SMTP dispatch error';
          console.warn('SMTP exception, falling back to mailto:', deliveryError);
        }
      }

      // Persist full inquiry snapshot + BOM report in Admin CRM store
      const nowIso = new Date().toISOString();
      const crmList = readJsonFile<UserProject[]>(CRM_PROJECTS_FILE, []);
      const idx = crmList.findIndex(
        (p) => p.id === projId || p.projectCode === cleanCode,
      );
      const existing = idx >= 0 ? crmList[idx] : undefined;
      const savedProject: UserProject = {
        ...existing,
        id: existing?.id || projId,
        projectCode: cleanCode,
        ownerId: existing?.ownerId || cleanOwnerId,
        ownerEmail: cleanEmail || existing?.ownerEmail || '',
        ownerName: cleanName || existing?.ownerName || 'Клиент',
        customerPhone: cleanPhone || existing?.customerPhone || '',
        title: cleanTitle,
        config: result.normalized,
        calculatedPriceEur: result.totalPriceEur,
        status: 'inquiry_sent',
        initialQuestion: cleanQuestion || existing?.initialQuestion || '',
        adminNote: existing?.adminNote || '',
        publishedToTemplates: existing?.publishedToTemplates ?? false,
        crmMessages: existing?.crmMessages || [],
        bomReportText: report.fullReportText,
        emailDeliveryMode: deliveryMode,
        emailSentAt: nowIso,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      if (idx >= 0) {
        crmList[idx] = savedProject;
      } else {
        crmList.unshift(savedProject);
      }
      writeJsonFile(CRM_PROJECTS_FILE, crmList.slice(0, 500));

      res.json({
        ok: true,
        deliveryMode,
        deliveryError,
        recipientEmail,
        projectCode: cleanCode,
        totalPriceEur: result.totalPriceEur,
        subject: report.subject,
        mailtoBody: report.mailtoBody,
        fullReportText: report.fullReportText,
        dxfFilename: AUTOCAD_3D_DXF_FILENAME,
        jsonFilename: PROJECT_3D_JSON_FILENAME,
        dxfContent,
        projectJsonContent,
        savedProject,
      });
    } catch (err) {
      console.error('Quote package email dispatch error:', err);
      res.status(500).json({ error: 'Failed to prepare quote email package' });
    }
  });

  // Client reads their own synced CRM messages/offers (requires Firebase auth email match)
  app.get('/api/projects/my', async (req, res) => {
    const email = await verifyFirebaseUserEmail(req.headers.authorization);
    if (!email) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const list = readJsonFile<UserProject[]>(CRM_PROJECTS_FILE, []);
    const mine = list.filter((p) => p.ownerEmail.toLowerCase() === email.toLowerCase());
    res.json({ projects: mine });
  });

  // Admin CRM: Read all client drafts, inquiries, orders & history
  app.get('/api/admin/crm-projects', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const list = readJsonFile<UserProject[]>(CRM_PROJECTS_FILE, []);
    res.json({ projects: list });
  });

  // Admin CRM: Send special offer / reminder or approve project in CRM store
  app.post('/api/admin/crm-offer', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    const { projectId, projectCode, offerText, nextStatus, adminNote, projectSnapshot } = req.body as {
      projectId?: string;
      projectCode?: string;
      offerText?: string;
      nextStatus?: UserProject['status'];
      adminNote?: string;
      projectSnapshot?: UserProject;
    };
    const list = readJsonFile<UserProject[]>(CRM_PROJECTS_FILE, []);
    let idx = list.findIndex(
      (p) => (projectId && p.id === projectId) || (projectCode && p.projectCode === projectCode),
    );
    if (idx === -1 && projectSnapshot) {
      list.unshift(projectSnapshot);
      idx = 0;
    }
    if (idx === -1) {
      res.status(404).json({ error: 'Project not found in CRM store' });
      return;
    }
    const target = list[idx];
    const nowIso = new Date().toISOString();
    const crmMessages = [...(target.crmMessages || [])];
    if (offerText && offerText.trim()) {
      crmMessages.push({
        id: `offer_${Date.now().toString(36)}`,
        senderRole: 'admin',
        senderName: 'Atelier Forma (Специална оферта)',
        text: offerText.trim(),
        createdAt: new Date().toLocaleString('bg-BG'),
      });
    }
    const updated: UserProject = {
      ...target,
      status: nextStatus || (offerText?.trim() && target.status === 'inquiry_sent' ? 'under_review' : target.status),
      adminNote: typeof adminNote === 'string' ? adminNote : target.adminNote,
      crmMessages,
      updatedAt: nowIso,
    };
    list[idx] = updated;
    writeJsonFile(CRM_PROJECTS_FILE, list);
    res.json({ ok: true, project: updated });
  });

  // Fallback helper reference check so defaults are available if files don't exist
  if (!fs.existsSync(DECORS_FILE)) void DEFAULT_BOARD_DECORS;
  if (!fs.existsSync(GALLERY_FILE)) void DEFAULT_GALLERY_PROJECTS;

  // Public quick contact form endpoint (persisted on server)
  const CONTACTS_FILE = path.join(DATA_DIR, 'contact-inquiries.json');
  app.post('/api/contact', (req, res) => {
    const { name, contact, message } = req.body as {
      name?: string;
      contact?: string;
      message?: string;
    };
    if (!name?.trim() || !contact?.trim() || !message?.trim()) {
      res.status(400).json({ error: 'Name, phone/email, and message are required' });
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const existingList = fs.existsSync(CONTACTS_FILE)
        ? (JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8')) as Array<Record<string, string>>)
        : [];
      const entry = {
        id: `msg_${Date.now().toString(36)}`,
        name: name.trim().slice(0, 120),
        contact: contact.trim().slice(0, 120),
        message: message.trim().slice(0, 2000),
        createdAt: new Date().toISOString(),
      };
      existingList.unshift(entry);
      fs.writeFileSync(CONTACTS_FILE, JSON.stringify(existingList.slice(0, 200), null, 2), 'utf-8');
      res.json({ ok: true, entry });
    } catch (err) {
      console.error('Failed to save contact message:', err);
      res.status(500).json({ error: 'Failed to save message' });
    }
  });

  app.get('/api/admin/contacts', async (req, res) => {
    const isAdmin = await verifyAdminFirebaseToken(req.headers.authorization);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin authorization required' });
      return;
    }
    try {
      const list = fs.existsSync(CONTACTS_FILE)
        ? JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'))
        : [];
      res.json({ contacts: list });
    } catch {
      res.json({ contacts: [] });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier Forma server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
