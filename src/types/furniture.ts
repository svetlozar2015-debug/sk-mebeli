export type Language = 'bg' | 'en';

export type Manufacturer = 'Egger' | 'Kronospan' | 'Kastamonu' | 'MDF';
export type DecorCategory = 'wood' | 'matte' | 'gloss' | 'stone';
export type MaterialType = 'MFC' | 'MDF';
export type HardwareTierLevel = 'economy' | 'standard' | 'premium' | 'luxury';
export type FurnitureCategory = 'kitchen' | 'wardrobe' | 'dresser' | 'living' | 'hallway' | 'office';
export type SlotType =
  | 'door_left'
  | 'door_right'
  | 'door_double'
  | 'glass_door'
  | 'glass_double'
  | 'flap_up'
  | 'cargo_basket'
  | 'drawers_1'
  | 'drawers_2'
  | 'drawers_3'
  | 'drawers_4'
  | 'drawers_5'
  | 'drawers_6'
  | 'open_shelves'
  | 'oven_hob'
  | 'oven_only'
  | 'hob_only'
  | 'dishwasher'
  | 'washing_machine'
  | 'dryer'
  | 'extractor_hood'
  | 'sink_unit'
  | 'fridge_builtin'
  | 'microwave'
  | 'trouser_rack'
  | 'double_hanging_rod'
  | 'shoe_rack'
  | 'coat_panel'
  | 'bench_seat'
  | 'mirror_front'
  | 'tv_niche'
  | 'corner_blind';

export type DrawerSlideType = 'ball_bearing' | 'telescopic_soft' | 'blum_hidden';

export type HandleStyle = 'standard_bar' | 'profile_j' | 'gola_profile' | 'push_to_open' | 'knob';
export type UpperProfileStyle = 'none' | 'recessed_bottom' | 'led_single' | 'led_double';
export type UpperBayType = 'none' | 'doors' | 'glass_doors' | 'flap_up' | 'extractor_builtin' | 'extractor_chimney';
export type CountertopThicknessMm = 20 | 30 | 40;
export type BacksplashThicknessMm = 8 | 10 | 12 | 15;
export type WardrobeDoorStyle = 'hinged' | 'sliding';
export type DecorPriceGroup = 1 | 2 | 3;
export type EdgeBandingType = 'eva' | 'pur';
export type CornerSide = 'left' | 'right';
export type ApplianceOwnership = 'client' | 'included';
export type DishwasherFrontStyle = 'full_door' | 'integrated_panel';
export type ProjectStatus =
  | 'draft'
  | 'inquiry_sent'
  | 'under_review'
  | 'approved'
  | 'in_production'
  | 'ready_for_install';

export interface SiteSettings {
  companyNameBg: string;
  companyNameEn: string;
  logoUrl: string;
  phone: string;
  email: string;
  cityBg: string;
  cityEn: string;
  aboutTitleBg: string;
  aboutTitleEn: string;
  aboutBodyBg: string;
  aboutBodyEn: string;
  workingHoursBg?: string;
  workingHoursEn?: string;
  gallerySlideIntervalSec?: number;
  updatedAt?: string;
}

export interface BoardDecor {
  id: string;
  manufacturer: Manufacturer;
  code: string;
  nameBg: string;
  nameEn: string;
  category: DecorCategory;
  materialType: MaterialType;
  priceGroup?: DecorPriceGroup;
  colorHex: string;
  grainHex?: string;
  roughness: number;
  thicknessMm: number;
  isBaseDefault?: boolean;
  active: boolean;
}

export interface HardwareTier {
  id: string;
  brand: string;
  tier: HardwareTierLevel;
  nameBg: string;
  nameEn: string;
  descriptionBg: string;
  descriptionEn: string;
  warrantyYears: number;
  loadCapacityKg: number;
  softClose: boolean;
  isBaseDefault?: boolean;
  active: boolean;
}

export interface HardwareUnitPricing {
  // Панти (€ / 1 бр.)
  hingeEur: number; // Обикновена панта
  hingeSoftCloseEur?: number; // Панта с плавно прибиране
  hingeCornerEur?: number; // Ъглова панта
  // Водачи за чекмеджета (€ / комплект-чифт)
  drawerSlideEur: number; // Обикновен ролков водач
  slideTelescopicEur?: number; // Телескопичен водач с плавно прибиране
  slideHiddenEur?: number; // Скрит водач с долно водене
  slideMetalBoxEur?: number; // Метална страница (чекмедже)
  // Повдигащи механизми за горни шкафове (€ / комплект)
  liftEur: number; // Газов амортисьор (икономичен)
  liftDoubleAventosEur?: number; // Двоен / клапващ механизъм (стандартен и Blum Aventos)
  // Плъзгащи системи за гардероби
  slidingRail3mEur?: number; // Релси (горна + долна на 3-метрова пръчка €)
  slidingMechPerDoorEur?: number; // Механизми за плъзгане (комплект за 1 врата €)
  slidingHandleBar3mEur?: number; // Кант-дръжки (3-метрова пръчка €)
  // Базови аксесоари
  hangerEur: number;
  handleEur: number;
  legEur: number;
}

export interface PricingConfig {
  boardPricesPerSqm: Record<string, number>;
  boardGroupMultipliers?: {
    group1: number;
    group2: number;
    group3: number;
  };
  hardwarePrices: Record<string, HardwareUnitPricing>;
  edgeBandingEurPerMeter: number;
  purEdgeBandingEurPerMeter?: number;
  handleMillingEurPerMeter?: number;
  hdfBackEurPerSqm: number;
  countertopEurPerMeter: number;
  backsplashEurPerSqm?: number;
  golaProfileEurPerMeter?: number;
  upperLedProfileEurPerMeter?: number;
  // Expensive Mechanisms & Internal Equipment
  cargoBasketEur?: number;
  cornerMechanismEur?: number;
  slidingTrackEurPerMeter?: number;
  clothesRailEurPerMeter?: number;
  // Kitchen Details & CNC Milling
  plinthEurPerMeter?: number;
  waterSealEurPerMeter?: number;
  cutoutEurPerHole?: number;
  cornerMillingEur?: number;
  glassFrameEurPerSqm?: number;
  vitrineS02?: VitrineS02Pricing;
  // Logistics & Safeguards
  craftsmanshipPercent: number;
  globalMarginPercent?: number;
  wastePercent?: number;
  installationPercent?: number;
  transportEur?: number;
  floorCarryEurPerFloor?: number;
  measurementFeeEur?: number;
  outsideCityEurPerKm?: number;
  serviceZoneBg?: string;
  serviceZoneEn?: string;
  minOrderEur?: number;
  productionDaysKitchen?: number;
  productionDaysWardrobe?: number;
  productionDaysOther?: number;
  updatedAt?: string;
}

export type QualityClass = 'high' | 'medium' | 'low';

export interface VitrineS02Pricing {
  frameUpTo350x1100Eur: number;
  frameUpTo500x1300Eur: number;
  frameUpTo500x2300Eur: number;
  glassDarkGrey4mmPerSqmEur: number;
  glassEdgeProcessingPerMeterEur: number;
  hexiHandleProfileEur: number;
  blumOnixHingeSetEur: number;
  qualityClass?: QualityClass;
}

export interface WallDecorAddon {
  id: string;
  kind: 'cabinet' | 'shelf' | 'coat_hooks' | 'round_mirror' | 'tv_panel';
  xCm: number;
  elevationCm: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  carcassDecorId?: string;
  frontDecorId?: string;
  slots?: SlotConfig[];
  hooksCount?: number;
}

export interface SlotConfig {
  id: string;
  heightRatio: number; // relative share of column height
  type: SlotType;
  prevDoorType?: 'door_left' | 'door_right' | 'door_double'; // remembers original standard door side when toggled to Vitrine
  internalShelves: number;
  shelfClearancesCm?: number[]; // clear vertical spacing (cm) for each of (internalShelves + 1) compartments
  drawerCount?: number; // overrides count for drawer slots (1..8)
  drawerSlideType?: DrawerSlideType; // per-cabinet slide mechanism: ball_bearing | telescopic_soft | blum_hidden
  drawerSlideLengthMm?: number; // auto-selected standard runner length (250..550 mm)
  applianceOwnership?: ApplianceOwnership; // built-in appliance provided by client vs included
  dishwasherStyle?: DishwasherFrontStyle; // full front door vs exposed top control panel
  hasCooktop?: boolean; // render induction cooktop above drawer/base bay
  hasLedLight?: boolean; // warm LED recessed strip at top of open shelving niche
  hasBenchCushion?: boolean; // upholstered hallway seat + backrest cushion + wood bench top
  hasWoodTop?: boolean; // wood top plank atop suspended hallway module
  hideHandles?: boolean; // flat handleless front on individual slot (e.g. bench drawers)
}

export interface ColumnConfig {
  id: string;
  widthCm: number;
  heightCm?: number; // optional per-bay height override (e.g. 215 cm tall columns next to 85 cm kitchen base)
  depthCm?: number; // optional per-bay depth override (cm, 1 mm precision)
  isSuspended?: boolean; // wall-hung module (no floor plinth)
  elevationCm?: number; // bottom clearance from floor for wall-hung modules (cm)
  frontDecorId?: string; // optional per-bay front decor override
  carcassDecorId?: string; // optional per-bay carcass decor override
  upperFrontDecorId?: string; // optional per-bay upper cabinet front decor override
  hasUnderLed?: boolean; // warm under-cabinet LED glow underneath suspended module
  slots: SlotConfig[];
  upperType?: UpperBayType; // per-bay upper cabinet mode (doors, glass_doors, flap_up, built-in extractor, chimney hood)
}

export interface FurnitureConfig {
  templateId: string;
  category: FurnitureCategory;
  roomSubcategory?: string;
  layoutShape: 'straight' | 'l_shape';
  cornerSide?: CornerSide; // left or right return corner for L-shaped layouts & blind corners
  widthCm: number;
  wingWidthCm: number; // for L-shape perpendicular arm
  heightCm: number;
  depthCm: number;
  plinthCm: number;
  includeUpperCabinets: boolean;
  includeWingUpperCabinets?: boolean;
  upperHeightCm: number;
  upperDepthCm: number;
  upperProfileStyle?: UpperProfileStyle;
  countertopThicknessMm?: CountertopThicknessMm;
  includeBacksplash?: boolean;
  backsplashThicknessMm?: BacksplashThicknessMm;
  backsplashHeightMm?: number; // max 600 mm
  backsplashDecorId?: string;
  // Special Mechanisms & Wardrobe Options
  wardrobeDoorStyle?: WardrobeDoorStyle;
  includeClothesRails?: boolean;
  includeCornerMechanism?: boolean;
  // Delivery & Logistics Estimator
  deliveryFloor?: number;
  hasElevator?: boolean;
  outsideCityKm?: number;
  carcassDecorId: string;
  frontDecorId: string;
  countertopDecorId: string;
  hardwareTierId: string;
  handleStyle: HandleStyle;
  edgeBandingType?: EdgeBandingType;
  columns: ColumnConfig[];
  wingColumns: ColumnConfig[];
  wallDecorItems?: WallDecorAddon[];
  vitrineHexiHandle?: boolean;
  selectedMeritItems?: SelectedMeritItem[];
  selectedPartnerItems?: SelectedPartnerItem[];
}

export interface StructuralNotice {
  code: string;
  severity: 'info' | 'warning';
  messageBg: string;
  messageEn: string;
}

export interface BomSummary {
  carcassAreaSqm: number;
  frontAreaSqm: number;
  glassFrontAreaSqm?: number;
  vitrineDoors?: Array<{ widthMm: number; heightMm: number }>;
  hdfBackAreaSqm: number;
  edgeBandingMeters: number;
  handleMillingMeters?: number;
  countertopMeters: number;
  backsplashAreaSqm?: number;
  plinthMeters?: number;
  waterSealMeters?: number;
  cutoutsCount?: number;
  cornerMillingCount?: number;
  cargoBasketsCount?: number;
  cornerMechanismsCount?: number;
  slidingTrackMeters?: number;
  slidingDoorsCount?: number;
  slidingRailBars3m?: number;
  slidingRailWasteMeters?: number;
  slidingHandleBars3m?: number;
  slidingHandleWasteMeters?: number;
  clothesRailsMeters?: number;
  hingesCount: number;
  standardHingesCount?: number;
  softCloseHingesCount?: number;
  cornerHingesCount?: number;
  drawerSlidePairs: number;
  ballBearingSlidePairs?: number;
  telescopicSlidePairs?: number;
  blumHiddenSlidePairs?: number;
  metalBoxSlidePairs?: number;
  drawerSlidePairsByLength?: Record<string, number>;
  drawerSlideCostUnits?: {
    defaultTier: number;
    ballBearing: number;
    telescopic: number;
    blumHidden: number;
  };
  liftMechanismsCount: number;
  liftGasCount?: number;
  liftDoubleCount?: number;
  wallHangersCount: number;
  handlesCount: number;
  golaLMeters?: number;
  golaCMeters?: number;
  upperProfileMeters?: number;
  legsCount: number;
  dividersCount: number;
  sheetsEstimated: number;
  notices: StructuralNotice[];
}

export interface AdminQuoteBreakdown {
  materialCostEur: number;
  hardwareCostEur: number;
  edgeAndHdfCostEur: number;
  rawCostEur: number;
  craftsmanshipPercent: number;
  craftsmanshipProfitEur: number;
  transportAndLogisticsEur?: number;
  meritItemsCostEur?: number;
  partnerItemsCostEur?: number;
  vitrineS02CostEur?: number;
  globalMarginPercent?: number;
  globalMarginEur?: number;
  bom: BomSummary;
}

export interface QuoteResponse {
  totalPriceEur: number;
  baseStartPriceEur: number;
  productionDays: number;
  minOrderEur: number;
  belowMinOrder: boolean;
  logisticsFeeEur: number;
  measurementFeeEur: number;
  meritItemsCount?: number;
  meritItemsTotalEur?: number;
  partnerItemsCount?: number;
  partnerItemsTotalEur?: number;
  vitrineS02Count?: number;
  vitrineS02TotalEur?: number;
  serviceZoneBg: string;
  serviceZoneEn: string;
  summaryStats: {
    totalWidthCm: number;
    boardAreaSqm: number;
    hingesCount: number;
    drawersCount: number;
    dividersCount: number;
    notices: StructuralNotice[];
  };
  adminBreakdown?: AdminQuoteBreakdown;
}

export interface GalleryProject {
  id: string;
  titleBg: string;
  titleEn: string;
  category: FurnitureCategory;
  dimensionsLabel: string;
  materialsLabel: string;
  imageUrl: string;
  presetId: string;
  sortOrder?: number;
  createdAt?: string;
}

export interface CompletedTemplate {
  id: string;
  titleBg: string;
  titleEn: string;
  category: FurnitureCategory;
  dimensionsLabel: string;
  summaryBg: string;
  summaryEn: string;
  config: FurnitureConfig;
  sourceProjectCode?: string;
  createdAt?: string;
}

export interface CrmOfferMessage {
  id: string;
  senderRole: 'client' | 'admin';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface UserProject {
  id: string;
  projectCode: string;
  ownerId: string;
  ownerEmail: string;
  ownerName?: string;
  customerPhone?: string;
  title: string;
  config: FurnitureConfig;
  calculatedPriceEur: number;
  status: ProjectStatus;
  initialQuestion?: string;
  adminNote?: string;
  publishedToTemplates?: boolean;
  crmMessages?: CrmOfferMessage[];
  bomReportText?: string;
  emailDeliveryMode?: 'smtp' | 'resend' | 'mailto';
  emailSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMessage {
  id: string;
  projectOwnerId: string;
  senderId: string;
  senderRole: 'client' | 'admin';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface MeritSubsectionDef {
  id: string;
  nameBg: string;
  nameEn: string;
}

export interface MeritCategoryDef {
  id: string;
  nameBg: string;
  nameEn: string;
  subsections: MeritSubsectionDef[];
}

export interface MeritCatalogItem {
  id: string;
  categoryId: string;
  subsectionId: string;
  name: string;
  sizeLabel: string;
  featureLabel: string;
  brandLevel: string;
  unit: string;
  priceEur: number;
  active: boolean;
  updatedAt?: string;
}

export interface SelectedMeritItem {
  itemId: string;
  quantity: number;
}

export type PartnerVendorId = 'galplas' | 'nasteh';

export interface PartnerSubsectionDef {
  id: string;
  categoryId: string;
  nameBg: string;
  nameEn: string;
  isCustom?: boolean;
}

export interface PartnerCategoryDef {
  id: string;
  nameBg: string;
  nameEn: string;
  subsections: PartnerSubsectionDef[];
}

export interface PartnerCatalogItem {
  id: string;
  vendor: PartnerVendorId;
  categoryId: string;
  subsectionId: string;
  name: string;
  sizeLabel: string;
  featureLabel: string;
  brandLevel: string;
  qualityClass?: QualityClass;
  unit: string;
  priceEur: number;
  active: boolean;
  updatedAt?: string;
}

export interface SelectedPartnerItem {
  vendor: PartnerVendorId;
  itemId: string;
  quantity: number;
}
