import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bookmark,
  Check,
  Copy,
  Crosshair,
  DoorOpen,
  Download,
  Eye,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Hand,
  LocateFixed,
  Mail,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Phone,
  PlayCircle,
  Plus,
  Redo2,
  Ruler,
  Send,
  Square,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { ROOM_CATALOG_GROUPS, ROOM_MODULE_LIBRARY, RoomCatalogGroupId, RoomModuleTemplate, STARTER_PRESETS } from '../data/catalogDefaults';
import {
  columnHasVitrine,
  computeSlotClearancesCm,
  createEmptyFurnitureConfig,
  enforceStructuralStandards,
  getBayCarcassDepthMm,
  getDrawerCount,
  isDrawerSlotType,
  isStandardDoorSlotType,
  isVitrineSlotType,
  rebalanceShelfClearances,
  resolveDrawerSlideLengthMm,
} from '../lib/carpentryEngine';
import { AUTOCAD_3D_DXF_FILENAME, generateFurnitureDxf } from '../lib/dxfExport';
import {
  buildProject3DJson,
  buildProjectBomEmailReport,
  parseProject3DJson,
  PROJECT_3D_JSON_FILENAME,
  triggerBrowserFileDownload,
} from '../lib/projectPackage';
import { getNeutralHardwareTierInfo } from '../lib/brandSanitizer';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { t } from '../lib/i18n';
import {
  ApplianceOwnership,
  BoardDecor,
  ColumnConfig,
  DishwasherFrontStyle,
  DrawerSlideType,
  FurnitureConfig,
  HardwareTier,
  HardwareTierLevel,
  Language,
  MeritCatalogItem,
  PartnerCatalogItem,
  PartnerCategoryDef,
  QuoteResponse,
  SlotConfig,
  SlotType,
  UpperBayType,
} from '../types/furniture';
import { CameraPreset, Configurator3D, MeasureReadout } from './Configurator3D';
import { ProtectedViewport } from './ProtectedViewport';
import { Sketch2DEditor } from './Sketch2DEditor';
import { LIVE_DEMO_STEPS, StudioDemoVideoModal } from './StudioDemoVideoModal';
import { StudioRightInspector } from './StudioRightInspector';
import { StudioTopFolderMenu, TopFolderId } from './StudioTopFolderMenu';

interface StudioWorkspaceProps {
  lang: Language;
  config: FurnitureConfig;
  activeProjectId: string | null;
  activeProjectCode: string;
  onChangeConfig: (next: FurnitureConfig) => void;
  decors: BoardDecor[];
  hardwareTiers: HardwareTier[];
  meritItems?: MeritCatalogItem[];
  partnerItems?: PartnerCatalogItem[];
  partnerCategories?: PartnerCategoryDef[];
  pricingVersion?: number;
  user: User | null;
  isAdmin: boolean;
  isFullPage?: boolean;
  onToggleFullPage?: () => void;
  onResetNewProject?: () => void;
  externalLoadSeq?: number;
  demoLaunchSeq?: number;
  onSignInGoogle: () => Promise<void>;
  onSavedToProfile: (projectId: string, projectCode: string, sentInquiry: boolean) => void;
}

type StudioTab = 'templates' | 'sketch2d' | 'view3d';

export function generateProjectCode(): string {
  const num = Math.floor(1000 + Math.random() * 8999);
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `AF-${num}${letter}`;
}

function getSlotShortLabel(slot: SlotConfig, lang: Language): string {
  if (isDrawerSlotType(slot.type)) {
    const n = getDrawerCount(slot);
    return lang === 'bg' ? `${n} Чекм.` : `${n} Drw`;
  }
  const map: Record<SlotType, { bg: string; en: string }> = {
    door_left: { bg: 'Врата (Л)', en: 'Door L' },
    door_right: { bg: 'Врата (Д)', en: 'Door R' },
    door_double: { bg: 'Двойна вр.', en: 'Double' },
    glass_door: { bg: 'Витрина', en: 'Vitrine' },
    glass_double: { bg: 'Дв. витрина', en: '2× Vitrine' },
    flap_up: { bg: 'Клапа', en: 'Flap' },
    cargo_basket: { bg: 'Карго', en: 'Cargo' },
    drawers_1: { bg: '1 Чекм.', en: '1 Drw' },
    drawers_2: { bg: '2 Чекм.', en: '2 Drw' },
    drawers_3: { bg: '3 Чекм.', en: '3 Drw' },
    drawers_4: { bg: '4 Чекм.', en: '4 Drw' },
    drawers_5: { bg: '5 Чекм.', en: '5 Drw' },
    drawers_6: { bg: '6 Чекм.', en: '6 Drw' },
    open_shelves: { bg: 'Рафтове', en: 'Shelves' },
    oven_hob: { bg: 'Фурна+Котл.', en: 'Oven/Hob' },
    oven_only: { bg: 'Фурна', en: 'Oven' },
    hob_only: { bg: 'Котлони', en: 'Hob' },
    dishwasher: { bg: 'Миялна', en: 'Dishwash.' },
    washing_machine: { bg: 'Пералня', en: 'Washer' },
    dryer: { bg: 'Сушилня', en: 'Dryer' },
    extractor_hood: { bg: 'Аспиратор', en: 'Extractor' },
    sink_unit: { bg: 'Мивка', en: 'Sink' },
    fridge_builtin: { bg: 'Хладилник', en: 'Fridge' },
    microwave: { bg: 'Микровълн.', en: 'Microwave' },
    trouser_rack: { bg: 'Панталонн.', en: 'Trousers' },
    double_hanging_rod: { bg: '2× Лост', en: '2× Rail' },
    shoe_rack: { bg: 'Обувки', en: 'Shoes' },
    coat_panel: { bg: 'Закачалка', en: 'Coat Rack' },
    bench_seat: { bg: 'Пейка', en: 'Bench' },
    mirror_front: { bg: 'Огледало', en: 'Mirror' },
    tv_niche: { bg: 'ТВ Ниша', en: 'TV Niche' },
    corner_blind: { bg: 'Глух ъгъл', en: 'Corner' },
  };
  return map[slot.type]?.[lang] || slot.type;
}

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  lang,
  config,
  activeProjectId,
  activeProjectCode,
  onChangeConfig,
  decors,
  hardwareTiers,
  meritItems = [],
  partnerItems = [],
  partnerCategories = [],
  pricingVersion = 0,
  user,
  isAdmin,
  isFullPage = false,
  onToggleFullPage,
  onResetNewProject,
  externalLoadSeq = 0,
  demoLaunchSeq = 0,
  onSignInGoogle,
  onSavedToProfile,
}) => {
  const studioSectionRef = useRef<HTMLElement | null>(null);
  const [studioTab, setStudioTab] = useState<StudioTab>('view3d');
  const [openTopFolder, setOpenTopFolder] = useState<TopFolderId | null>(null);
  const [rightInspectorOpen, setRightInspectorOpen] = useState(false);
  const [windowMinimized, setWindowMinimized] = useState(false);
  const [windowExpanded, setWindowExpanded] = useState(false);
  const [customHeightPx, setCustomHeightPx] = useState<number | null>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [isolatedMode, setIsolatedMode] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [seeInside, setSeeInside] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureReadout, setMeasureReadout] = useState<MeasureReadout | null>(null);
  const [clearMeasureTriggerSeq, setClearMeasureTriggerSeq] = useState(0);
  const [centerTriggerSeq, setCenterTriggerSeq] = useState(0);
  const [panMode, setPanMode] = useState(false);
  const [panNudgeTrigger, setPanNudgeTrigger] = useState<{
    dx: number;
    dy?: number;
    seq: number;
  } | null>(null);
  const [activeCameraPreset, setActiveCameraPreset] = useState<CameraPreset | null>('iso');
  const [lightingMode, setLightingMode] = useState<'day' | 'evening'>('day');
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState<{
    preset: CameraPreset;
    seq: number;
  } | null>(null);
  const [undoStack, setUndoStack] = useState<FurnitureConfig[]>([]);
  const [redoStack, setRedoStack] = useState<FurnitureConfig[]>([]);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [demoVideoOpen, setDemoVideoOpen] = useState(false);
  const [demoStepIdx, setDemoStepIdx] = useState(0);
  const [demoPlaying, setDemoPlaying] = useState(true);
  const demoBackupRef = useRef<{
    config: FurnitureConfig;
    selectedColumnId: string | null;
    rightInspectorOpen: boolean;
    allOpen: boolean;
    showDimensions: boolean;
    measureMode: boolean;
    openTopFolder: TopFolderId | null;
    studioTab: StudioTab;
    isolatedMode: boolean;
    swapSourceColId: string | null;
  } | null>(null);
  const [activeCatalogGroup, setActiveCatalogGroup] = useState<RoomCatalogGroupId>('kitchen_base');
  const [catalogSizeOverrides, setCatalogSizeOverrides] = useState<
    Record<string, { w: number; h: number; d: number }>
  >({});
  const [defaultApplianceOwnership, setDefaultApplianceOwnership] =
    useState<ApplianceOwnership>('client');
  const [defaultDishwasherStyle, setDefaultDishwasherStyle] =
    useState<DishwasherFrontStyle>('full_door');
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(
    config.columns[0]?.id ?? null,
  );
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0);
  const [swapSourceColId, setSwapSourceColId] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Save & Inquiry Modal State
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);
  const [importToast, setImportToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bomCopied, setBomCopied] = useState(false);
  const [quotePackageResult, setQuotePackageResult] = useState<{
    deliveryMode: 'resend' | 'smtp' | 'mailto';
    recipientEmail: string;
    projectCode: string;
    totalPriceEur: number;
    subject: string;
    mailtoBody: string;
    fullReportText: string;
    dxfFilename: string;
    jsonFilename: string;
    dxfContent: string;
    projectJsonContent: string;
  } | null>(null);

  // Quick Master Consultation Modal (No Google sign-in required)
  const [quickConsultOpen, setQuickConsultOpen] = useState(false);
  const [qcName, setQcName] = useState('');
  const [qcPhone, setQcPhone] = useState('');
  const [qcNote, setQcNote] = useState('');
  const [qcSending, setQcSending] = useState(false);
  const [qcSent, setQcSent] = useState(false);
  const [qcError, setQcError] = useState<string | null>(null);

  const handleSendQuickConsult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcName.trim() || !qcPhone.trim()) return;
    setQcSending(true);
    setQcError(null);
    try {
      const frontD = decors.find((d) => d.id === config.frontDecorId);
      const carcassD = decors.find((d) => d.id === config.carcassDecorId);
      const counterD = decors.find((d) => d.id === config.countertopDecorId);
      const specSummary = [
        `[Бърза заявка от 3D Студио] Код: ${activeProjectCode}`,
        `Категория: ${config.category} | Размери: ${config.widthCm}×${config.heightCm}×${config.depthCm} см`,
        `Лице: ${frontD ? `${frontD.manufacturer} ${frontD.code}` : config.frontDecorId} | Корпус: ${carcassD ? `${carcassD.manufacturer} ${carcassD.code}` : config.carcassDecorId}${
          config.category === 'kitchen' && counterD
            ? ` | Плот: ${counterD.manufacturer} ${counterD.code} (${config.countertopThicknessMm || 40}мм)`
            : ''
        }`,
        `Обков: ${selectedHwTier?.brand || config.hardwareTierId} | Кант: ${(config.edgeBandingType || 'eva').toUpperCase()} | Ориентировъчна цена: ${quote?.totalPriceEur ?? 0} €`,
        qcNote.trim() ? `Бележка от клиента: ${qcNote.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const resp = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: qcName.trim(),
          contact: qcPhone.trim(),
          message: specSummary,
        }),
      });
      if (!resp.ok) throw new Error('Неуспешно изпращане');
      setQcSent(true);
      setQcName('');
      setQcPhone('');
      setQcNote('');
    } catch {
      setQcError(
        lang === 'bg'
          ? 'Възникна проблем при изпращането. Опитайте отново.'
          : 'Failed to submit consultation request.',
      );
    } finally {
      setQcSending(false);
    }
  };

  const selectedHwTier = useMemo(
    () => hardwareTiers.find((h) => h.id === config.hardwareTierId) || hardwareTiers[0],
    [hardwareTiers, config.hardwareTierId],
  );

  // Keep selectedColumnId synced whenever preset/template swaps or project is cleared
  const selectedColumn = useMemo(() => {
    const allCols = [...config.columns, ...config.wingColumns];
    return allCols.find((c) => c.id === selectedColumnId) || config.columns[0] || null;
  }, [config.columns, config.wingColumns, selectedColumnId]);

  useEffect(() => {
    if (!selectedColumn && selectedColumnId !== null) {
      setSelectedColumnId(null);
      setRightInspectorOpen(false);
      setSelectedSlotIdx(0);
    } else if (selectedColumn && selectedColumn.id !== selectedColumnId) {
      setSelectedColumnId(selectedColumn.id);
      setSelectedSlotIdx(0);
    }
  }, [selectedColumn, selectedColumnId]);

  useEffect(() => {
    if (selectedColumn && selectedSlotIdx >= selectedColumn.slots.length) {
      setSelectedSlotIdx(0);
    }
  }, [selectedColumn, selectedSlotIdx]);

  useEffect(() => {
    if (!swapSourceColId) return;
    const exists =
      config.columns.some((c) => c.id === swapSourceColId) ||
      config.wingColumns.some((c) => c.id === swapSourceColId);
    if (!exists) {
      setSwapSourceColId(null);
    }
  }, [config.columns, config.wingColumns, swapSourceColId]);

  useEffect(() => {
    const onFsChange = () => {
      setNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Live 3D Demo Guide Choreography (single calm walkthrough across all sections)
  const applyDemoStepRef = useRef<(stepIdx: number) => (() => void) | void>(() => {});
  applyDemoStepRef.current = (stepIdx: number) => {
    const hwLevel: HardwareTierLevel = selectedHwTier?.tier || 'economy';
    const norm = (draft: FurnitureConfig) => enforceStructuralStandards(draft, hwLevel).config;

    const baseDecorWhite =
      decors.find((d) => d.active && d.id === 'egger_w1000')?.id || decors[0]?.id || 'egger_w1000';
    const warmWoodDecor =
      decors.find((d) => d.active && d.category === 'wood')?.id ||
      decors.find((d) => d.active && d.id !== baseDecorWhite)?.id ||
      baseDecorWhite;
    const darkStoneCounter =
      decors.find((d) => d.active && (d.category === 'stone' || d.id === 'egger_f186'))?.id ||
      decors[0]?.id ||
      'egger_f186';
    const lightCounter =
      decors.find((d) => d.active && d.id !== darkStoneCounter)?.id || baseDecorWhite;
    const blumTier =
      hardwareTiers.find((h) => h.active && h.id === 'hw_blum')?.id ||
      hardwareTiers[hardwareTiers.length - 1]?.id ||
      'hw_gtv';

    const getTpl = (id: string) =>
      structuredClone(
        ROOM_MODULE_LIBRARY.find((m) => m.id === id)?.config || STARTER_PRESETS[0].config,
      );

    const colDoorLeft = (): FurnitureConfig['columns'][number] => ({
      id: 'demo_col_1',
      widthCm: 60,
      slots: [{ id: 'demo_s1', heightRatio: 1, type: 'door_left', internalShelves: 1 }],
    });
    const colDrawersAll = (widthCm: number): FurnitureConfig['columns'][number] => ({
      id: 'demo_col_2',
      widthCm,
      slots: [
        {
          id: 'demo_s2',
          heightRatio: 1,
          type: 'drawers_3',
          internalShelves: 0,
          drawerCount: 3,
          drawerSlideType: 'telescopic_soft',
        },
      ],
    });
    const colDrawersTop = (widthCm: number): FurnitureConfig['columns'][number] => ({
      id: 'demo_col_2',
      widthCm,
      slots: [
        {
          id: 'demo_s2_top',
          heightRatio: 0.4,
          type: 'drawers_2',
          internalShelves: 0,
          drawerCount: 2,
          drawerSlideType: 'telescopic_soft',
        },
        {
          id: 'demo_s2_bot',
          heightRatio: 0.6,
          type: 'door_double',
          internalShelves: 1,
        },
      ],
    });
    const colDrawersBottom = (widthCm: number): FurnitureConfig['columns'][number] => ({
      id: 'demo_col_2',
      widthCm,
      slots: [
        {
          id: 'demo_s2_top_d',
          heightRatio: 0.6,
          type: 'door_double',
          internalShelves: 1,
        },
        {
          id: 'demo_s2_bot_dr',
          heightRatio: 0.4,
          type: 'drawers_2',
          internalShelves: 0,
          drawerCount: 2,
          drawerSlideType: 'telescopic_soft',
        },
      ],
    });
    const colSink = (): FurnitureConfig['columns'][number] => ({
      id: 'demo_col_3',
      widthCm: 60,
      slots: [{ id: 'demo_s3', heightRatio: 1, type: 'sink_unit', internalShelves: 0 }],
    });

    const makeDemoKitchen = (
      cols: FurnitureConfig['columns'],
      opts?: Partial<FurnitureConfig>,
    ): FurnitureConfig => {
      const totalW = cols.reduce((s, c) => s + c.widthCm, 0);
      return norm({
        ...createEmptyFurnitureConfig(),
        templateId: 'demo_live',
        category: 'kitchen',
        widthCm: totalW,
        heightCm: 85,
        depthCm: 58,
        plinthCm: 10,
        carcassDecorId: baseDecorWhite,
        frontDecorId: baseDecorWhite,
        countertopDecorId: lightCounter,
        countertopThicknessMm: 40,
        hardwareTierId: 'hw_gtv',
        handleStyle: 'standard_bar',
        edgeBandingType: 'eva',
        includeUpperCabinets: false,
        columns: cols,
        wingColumns: [],
        ...opts,
      });
    };

    const timers: number[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timers.push(id);
    };
    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
    };

    setStudioTab('view3d');
    setIsolatedMode(false);
    setMeasureMode(false);
    setSwapSourceColId(null);

    // 1. Kitchen — open folder on empty room
    if (stepIdx === 0) {
      setOpenTopFolder('kitchen_base');
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      setSelectedColumnId(null);
      onChangeConfig(norm(createEmptyFurnitureConfig()));
      triggerCameraPreset('iso');
      return clearTimers;
    }

    // 2. Kitchen — place 3 base cabinets & widen middle 600 -> 800 mm
    if (stepIdx === 1) {
      setOpenTopFolder(null);
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      onChangeConfig(makeDemoKitchen([colDoorLeft(), colDrawersAll(60), colSink()]));
      setSelectedColumnId('demo_col_2');
      setSelectedSlotIdx(0);
      triggerCameraPreset('iso');
      schedule(() => {
        onChangeConfig(makeDemoKitchen([colDoorLeft(), colDrawersAll(80), colSink()]));
        setSelectedColumnId('demo_col_2');
        setSelectedSlotIdx(0);
        setRightInspectorOpen(true);
      }, 3400);
      return clearTimers;
    }

    // 3. Kitchen — drawers top / bottom + swap sink and drawers
    if (stepIdx === 2) {
      setOpenTopFolder(null);
      setAllOpen(false);
      setShowDimensions(true);
      onChangeConfig(makeDemoKitchen([colDoorLeft(), colDrawersTop(80), colSink()]));
      setSelectedColumnId('demo_col_2');
      setSelectedSlotIdx(0);
      setRightInspectorOpen(true);
      schedule(() => {
        onChangeConfig(makeDemoKitchen([colDoorLeft(), colDrawersBottom(80), colSink()]));
      }, 3200);
      schedule(() => {
        onChangeConfig(makeDemoKitchen([colDoorLeft(), colSink(), colDrawersTop(80)]));
        setSelectedColumnId('demo_col_2');
      }, 6400);
      return clearTimers;
    }

    // 4. Kitchen — upper cabinets & tall fridge/oven columns
    if (stepIdx === 3) {
      setOpenTopFolder('kitchen_upper_tall');
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      const upperKitchen = norm(getTpl('kt_upper_set'));
      onChangeConfig(upperKitchen);
      setSelectedColumnId(upperKitchen.columns[0]?.id ?? null);
      triggerCameraPreset('iso');
      schedule(() => {
        setOpenTopFolder(null);
        const fullTowers = norm(getTpl('kt_full_kitchen_with_towers'));
        onChangeConfig(fullTowers);
        setSelectedColumnId(fullTowers.columns[4]?.id ?? null);
        triggerCameraPreset('iso');
      }, 3800);
      return clearTimers;
    }

    // 5. Wardrobes — hinged 3-door, resize, open to show interior shelves/rails/drawers
    if (stepIdx === 4) {
      setOpenTopFolder('wardrobes');
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      const wd3 = norm(getTpl('wd_hinged_3door'));
      onChangeConfig(wd3);
      setSelectedColumnId(wd3.columns[1]?.id ?? wd3.columns[0]?.id ?? null);
      triggerCameraPreset('iso');
      schedule(() => {
        setOpenTopFolder(null);
        const resizedWd: FurnitureConfig = {
          ...wd3,
          widthCm: 210,
          heightCm: 235,
          columns: wd3.columns.map((c) => ({ ...c, widthCm: 70 })),
        };
        onChangeConfig(norm(resizedWd));
        setRightInspectorOpen(true);
      }, 3000);
      schedule(() => {
        setAllOpen(true);
      }, 5800);
      return clearTimers;
    }

    // 6. Wardrobes — 3-door sliding wardrobe & glide doors sideways
    if (stepIdx === 5) {
      setOpenTopFolder(null);
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      const slidingWd = norm(getTpl('wd_sliding_3'));
      onChangeConfig(slidingWd);
      setSelectedColumnId(slidingWd.columns[1]?.id ?? slidingWd.columns[0]?.id ?? null);
      triggerCameraPreset('iso');
      schedule(() => {
        setAllOpen(true);
      }, 3200);
      schedule(() => {
        setAllOpen(false);
      }, 6800);
      return clearTimers;
    }

    // 7. Hallway — mirror, bench seat & shoe cabinet + resize
    if (stepIdx === 6) {
      setOpenTopFolder('hallway');
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      const hallway = norm(getTpl('hw_full_entryway'));
      onChangeConfig(hallway);
      setSelectedColumnId(hallway.columns[2]?.id ?? hallway.columns[0]?.id ?? null);
      triggerCameraPreset('iso');
      schedule(() => {
        setOpenTopFolder(null);
        const resizedHallway: FurnitureConfig = {
          ...hallway,
          widthCm: 250,
          columns: hallway.columns.map((c, i) =>
            i === 2 ? { ...c, widthCm: 100, heightCm: 115 } : c,
          ),
        };
        onChangeConfig(norm(resizedHallway));
        setRightInspectorOpen(true);
      }, 3400);
      return clearTimers;
    }

    // 8. Living & TV modules — console/media wall + resize center bay
    if (stepIdx === 7) {
      setOpenTopFolder('living_tv');
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      const tvWall = norm(getTpl('tv_media_wall'));
      onChangeConfig(tvWall);
      setSelectedColumnId(tvWall.columns[1]?.id ?? tvWall.columns[0]?.id ?? null);
      triggerCameraPreset('iso');
      schedule(() => {
        setOpenTopFolder(null);
        const widerTv: FurnitureConfig = {
          ...tvWall,
          widthCm: 290,
          columns: tvWall.columns.map((c, i) =>
            i === 1 || i === 2 ? { ...c, widthCm: 85 } : c,
          ),
        };
        onChangeConfig(norm(widerTv));
        setRightInspectorOpen(true);
      }, 3400);
      return clearTimers;
    }

    // 9. Appliances — open Appliances folder on built-in kitchen
    if (stepIdx === 8) {
      setOpenTopFolder('appliances');
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      const fullKitchen = norm(getTpl('kt_full_kitchen_with_towers'));
      onChangeConfig(fullKitchen);
      setSelectedColumnId(fullKitchen.columns[4]?.id ?? fullKitchen.columns[1]?.id ?? null);
      triggerCameraPreset('iso');
      return clearTimers;
    }

    // 10. Materials, colors, hardware tier & live price update
    if (stepIdx === 9) {
      setOpenTopFolder('materials');
      setRightInspectorOpen(false);
      setAllOpen(false);
      setShowDimensions(true);
      const baseKitchen = makeDemoKitchen([colDoorLeft(), colSink(), colDrawersTop(80)], {
        includeUpperCabinets: true,
        hardwareTierId: 'hw_economy',
      });
      onChangeConfig(baseKitchen);
      setSelectedColumnId(null);
      triggerCameraPreset('iso');
      schedule(() => {
        onChangeConfig(
          makeDemoKitchen([colDoorLeft(), colSink(), colDrawersTop(80)], {
            includeUpperCabinets: true,
            frontDecorId: warmWoodDecor,
            countertopDecorId: darkStoneCounter,
            hardwareTierId: 'hw_economy',
          }),
        );
      }, 3000);
      schedule(() => {
        onChangeConfig(
          makeDemoKitchen([colDoorLeft(), colSink(), colDrawersTop(80)], {
            includeUpperCabinets: true,
            frontDecorId: warmWoodDecor,
            countertopDecorId: darkStoneCounter,
            hardwareTierId: blumTier,
          }),
        );
      }, 6000);
      return clearTimers;
    }

    // 11. 3D Views, open all doors & dimension lines
    if (stepIdx === 10) {
      setOpenTopFolder(null);
      setRightInspectorOpen(false);
      setShowDimensions(true);
      onChangeConfig(
        makeDemoKitchen([colDoorLeft(), colSink(), colDrawersTop(80)], {
          includeUpperCabinets: true,
          frontDecorId: warmWoodDecor,
          countertopDecorId: darkStoneCounter,
          hardwareTierId: blumTier,
        }),
      );
      setSelectedColumnId(null);
      setAllOpen(true);
      triggerCameraPreset('front');
      schedule(() => {
        triggerCameraPreset('iso_sw');
      }, 3200);
      schedule(() => {
        triggerCameraPreset('iso');
      }, 6400);
      return clearTimers;
    }

    // 12. Save to account & New Project
    setOpenTopFolder(null);
    setRightInspectorOpen(false);
    setAllOpen(false);
    setShowDimensions(true);
    onChangeConfig(
      makeDemoKitchen([colDoorLeft(), colSink(), colDrawersTop(80)], {
        includeUpperCabinets: true,
        frontDecorId: warmWoodDecor,
        countertopDecorId: darkStoneCounter,
        hardwareTierId: blumTier,
      }),
    );
    setSelectedColumnId(null);
    triggerCameraPreset('iso');
    return clearTimers;
  };

  useEffect(() => {
    if (!demoVideoOpen) return;
    const cleanupSub = applyDemoStepRef.current(demoStepIdx);
    return () => {
      if (typeof cleanupSub === 'function') cleanupSub();
    };
  }, [demoVideoOpen, demoStepIdx]);

  useEffect(() => {
    if (!demoVideoOpen || !demoPlaying) return;
    if (demoStepIdx >= LIVE_DEMO_STEPS.length - 1) {
      setDemoPlaying(false);
      return;
    }
    const duration = LIVE_DEMO_STEPS[demoStepIdx]?.durationMs ?? 9000;
    const timer = window.setTimeout(() => {
      setDemoStepIdx((prev) => Math.min(LIVE_DEMO_STEPS.length - 1, prev + 1));
    }, duration);
    return () => window.clearTimeout(timer);
  }, [demoVideoOpen, demoPlaying, demoStepIdx]);

  const handleOpenDemoGuide = () => {
    if (demoVideoOpen) {
      handleCloseDemoGuide();
      return;
    }
    demoBackupRef.current = {
      config: structuredClone(config),
      selectedColumnId,
      rightInspectorOpen,
      allOpen,
      showDimensions,
      measureMode,
      openTopFolder,
      studioTab,
      isolatedMode,
      swapSourceColId,
    };
    setDemoStepIdx(0);
    setDemoPlaying(true);
    setDemoVideoOpen(true);
  };

  useEffect(() => {
    if (externalLoadSeq <= 0) return;
    setDemoVideoOpen(false);
    setDemoPlaying(false);
    demoBackupRef.current = null;
    setWindowMinimized(false);
    setUndoStack([]);
    setRedoStack([]);
    setIsolatedMode(false);
    setMeasureMode(false);
    setMeasureReadout(null);
    setAllOpen(false);
    setSeeInside(false);
    setOpenTopFolder(null);
    setRightInspectorOpen(false);
    setSwapSourceColId(null);
    setSelectedColumnId(config.columns[0]?.id ?? null);
    setSelectedSlotIdx(0);
    setStudioTab('view3d');
    setCenterTriggerSeq((s) => s + 1);
  }, [externalLoadSeq]);

  useEffect(() => {
    if (demoLaunchSeq <= 0) return;
    setWindowMinimized(false);
    if (!demoBackupRef.current) {
      demoBackupRef.current = {
        config: structuredClone(config),
        selectedColumnId,
        rightInspectorOpen,
        allOpen,
        showDimensions,
        measureMode,
        openTopFolder,
        studioTab,
        isolatedMode,
        swapSourceColId,
      };
    }
    setDemoStepIdx(0);
    setDemoPlaying(true);
    setDemoVideoOpen(true);
  }, [demoLaunchSeq]);

  const handleCloseDemoGuide = () => {
    setDemoVideoOpen(false);
    setDemoPlaying(false);
    const backup = demoBackupRef.current;
    demoBackupRef.current = null;
    if (backup) {
      onChangeConfig(backup.config);
      setSelectedColumnId(backup.selectedColumnId);
      setRightInspectorOpen(backup.rightInspectorOpen);
      setAllOpen(backup.allOpen);
      setShowDimensions(backup.showDimensions);
      setMeasureMode(backup.measureMode);
      setOpenTopFolder(backup.openTopFolder);
      setStudioTab(backup.studioTab);
      setIsolatedMode(backup.isolatedMode);
      setSwapSourceColId(backup.swapSourceColId);
      setCenterTriggerSeq((s) => s + 1);
    }
  };

  const handleToggleTrueFullScreen = async () => {
    setWindowMinimized(false);
    if (isFullPage || nativeFullscreen) {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Ignore iframe fullscreen restrictions
        }
      }
      if (isFullPage) onToggleFullPage?.();
    } else {
      if (!isFullPage) onToggleFullPage?.();
      try {
        await studioSectionRef.current?.requestFullscreen?.();
      } catch {
        // Fallback to fixed full-page studio overlay cleanly
      }
    }
  };

  const handleToggleBrowserFullscreen = async () => {
    setWindowMinimized(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore iframe fullscreen restrictions
      }
      return;
    }
    if (!isFullPage) onToggleFullPage?.();
    try {
      await studioSectionRef.current?.requestFullscreen?.();
    } catch {
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        // Fallback: stay cleanly expanded in full-page studio overlay
      }
    }
  };

  const handleWindowMinimize = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore
      }
    }
    if (isFullPage) {
      onToggleFullPage?.();
      setWindowMinimized(true);
      return;
    }
    setWindowMinimized((v) => !v);
  };

  const handleWindowResizeToggle = async () => {
    if (windowMinimized) {
      setWindowMinimized(false);
      return;
    }
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore
      }
    }
    if (isFullPage) {
      onToggleFullPage?.();
      setWindowExpanded(false);
      setCustomHeightPx(null);
      return;
    }
    setCustomHeightPx(null);
    setWindowExpanded((v) => !v);
  };

  const handleWindowExit = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore
      }
    }
    if (isFullPage) {
      onToggleFullPage?.();
      return;
    }
    setWindowMinimized(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStartHeightDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isFullPage) return;
    e.preventDefault();
    const startY = e.clientY;
    const baseHeight = customHeightPx ?? (windowExpanded ? Math.round(window.innerHeight * 0.8) : 600);
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(920, Math.max(380, Math.round(baseHeight + (ev.clientY - startY))));
      setCustomHeightPx(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Live structural check + server-side hidden price calculation
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const storedAdminTok = window.sessionStorage.getItem('af_admin_token');
        if (storedAdminTok) {
          headers.Authorization = `Bearer ${storedAdminTok}`;
        } else if (user) {
          const token = await user.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        }
        const resp = await fetch('/api/quote/calculate', {
          method: 'POST',
          headers,
          body: JSON.stringify({ config }),
        });
        if (resp.ok && !cancelled) {
          const data = (await resp.json()) as QuoteResponse;
          setQuote(data);
        }
      } catch (err) {
        console.error('Quote calculation error:', err);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [config, user, pricingVersion]);

  const applyNormalized = (draft: FurnitureConfig) => {
    const hwLevel: HardwareTierLevel = selectedHwTier?.tier || 'economy';
    const { config: normalized } = enforceStructuralStandards(draft, hwLevel);
    const snapshot = structuredClone(config);
    setUndoStack((prev) => [...prev.slice(-39), snapshot]);
    setRedoStack([]);
    onChangeConfig(normalized);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const snapshot = structuredClone(config);
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-39), snapshot]);
    onChangeConfig(structuredClone(previous));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const snapshot = structuredClone(config);
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-39), snapshot]);
    onChangeConfig(structuredClone(next));
  };

  const undoFnRef = useRef(handleUndo);
  const redoFnRef = useRef(handleRedo);
  undoFnRef.current = handleUndo;
  redoFnRef.current = handleRedo;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSwapSourceColId(null);
      }
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redoFnRef.current();
        } else {
          undoFnRef.current();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoFnRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleConfirmNewProject = () => {
    setDemoVideoOpen(false);
    setDemoPlaying(false);
    demoBackupRef.current = null;
    setUndoStack([]);
    setRedoStack([]);
    setIsolatedMode(false);
    setMeasureMode(false);
    setMeasureReadout(null);
    setAllOpen(false);
    setSeeInside(false);
    setOpenTopFolder(null);
    setRightInspectorOpen(false);
    setSelectedColumnId(null);
    setSwapSourceColId(null);
    setSelectedSlotIdx(0);
    setProjectTitle('');
    setCustomerPhone('');
    setQuestionText('');
    setNewProjectModalOpen(false);
    if (onResetNewProject) {
      onResetNewProject();
    } else {
      onChangeConfig(createEmptyFurnitureConfig());
    }
    setStudioTab('view3d');
    setCenterTriggerSeq((s) => s + 1);
  };

  const handleSetUpperBayType = (colId: string, upperType: UpperBayType) => {
    applyNormalized({
      ...config,
      columns: config.columns.map((c) => (c.id === colId ? { ...c, upperType } : c)),
      wingColumns: config.wingColumns.map((c) => (c.id === colId ? { ...c, upperType } : c)),
    });
  };

  const handleAddColumn = () => {
    const newColId = `col_${Date.now().toString(36)}`;
    const nextCols = [
      ...config.columns,
      {
        id: newColId,
        widthCm: 60,
        slots: [
          {
            id: `sl_${Date.now().toString(36)}`,
            heightRatio: 1,
            type: 'door_left' as SlotType,
            internalShelves: 1,
          },
        ],
      },
    ];
    const nextWidth = Math.min(480, config.widthCm + 60);
    applyNormalized({ ...config, widthCm: nextWidth, columns: nextCols });
    setSelectedColumnId(newColId);
    setSelectedSlotIdx(0);
  };

  const handleRemoveColumn = (colId: string) => {
    const inMain = config.columns.some((c) => c.id === colId);
    if (inMain) {
      const idx = config.columns.findIndex((c) => c.id === colId);
      const remaining = config.columns.filter((c) => c.id !== colId);
      if (remaining.length === 0) {
        if (config.wingColumns.length > 0) {
          const wingWidth = config.wingColumns.reduce((s, c) => s + c.widthCm, 0);
          applyNormalized({
            ...config,
            layoutShape: 'straight',
            widthCm: Math.max(30, wingWidth),
            wingWidthCm: 0,
            columns: config.wingColumns,
            wingColumns: [],
          });
          setSelectedColumnId(config.wingColumns[0]?.id ?? null);
          setSelectedSlotIdx(0);
          return;
        }
        applyNormalized({
          ...config,
          layoutShape: 'straight',
          widthCm: 0,
          wingWidthCm: 0,
          includeUpperCabinets: false,
          includeBacksplash: false,
          includeCornerMechanism: false,
          columns: [],
          wingColumns: [],
        });
        setSelectedColumnId(null);
        setRightInspectorOpen(false);
        setIsolatedMode(false);
        setAllOpen(false);
        setSelectedSlotIdx(0);
        return;
      }
      const nextWidth = remaining.reduce((s, c) => s + c.widthCm, 0);
      applyNormalized({ ...config, widthCm: Math.max(30, nextWidth), columns: remaining });
      const fallback = remaining[Math.max(0, idx - 1)] || remaining[0];
      setSelectedColumnId(fallback?.id ?? null);
      setSelectedSlotIdx(0);
      return;
    }

    const inWing = config.wingColumns.some((c) => c.id === colId);
    if (inWing) {
      const remainingWing = config.wingColumns.filter((c) => c.id !== colId);
      if (remainingWing.length === 0) {
        applyNormalized({
          ...config,
          layoutShape: 'straight',
          wingWidthCm: 0,
          wingColumns: [],
        });
        setSelectedColumnId(config.columns[0]?.id ?? null);
        setSelectedSlotIdx(0);
        return;
      }
      const wingRunSum = remainingWing.reduce((s, c) => s + c.widthCm, 0);
      applyNormalized({
        ...config,
        wingWidthCm: wingRunSum + config.depthCm + 6,
        wingColumns: remainingWing,
      });
      setSelectedColumnId(remainingWing[0]?.id ?? config.columns[0]?.id ?? null);
      setSelectedSlotIdx(0);
    }
  };

  const handleMoveColumn = (colId: string, direction: 'left' | 'right') => {
    setSwapSourceColId(null);
    const mainIdx = config.columns.findIndex((c) => c.id === colId);
    if (mainIdx >= 0) {
      const targetIdx = direction === 'left' ? mainIdx - 1 : mainIdx + 1;
      if (targetIdx < 0 || targetIdx >= config.columns.length) return;
      const nextCols = [...config.columns];
      [nextCols[mainIdx], nextCols[targetIdx]] = [nextCols[targetIdx], nextCols[mainIdx]];
      applyNormalized({ ...config, columns: nextCols });
      setSelectedColumnId(colId);
      return;
    }

    const wingIdx = config.wingColumns.findIndex((c) => c.id === colId);
    if (wingIdx >= 0) {
      const targetIdx = direction === 'left' ? wingIdx - 1 : wingIdx + 1;
      if (targetIdx < 0 || targetIdx >= config.wingColumns.length) return;
      const nextWing = [...config.wingColumns];
      [nextWing[wingIdx], nextWing[targetIdx]] = [nextWing[targetIdx], nextWing[wingIdx]];
      applyNormalized({ ...config, wingColumns: nextWing });
      setSelectedColumnId(colId);
    }
  };

  const handleSwapColumns = (colIdA: string, colIdB: string) => {
    if (!colIdA || !colIdB || colIdA === colIdB) {
      setSwapSourceColId(null);
      return;
    }
    const mainIdxA = config.columns.findIndex((c) => c.id === colIdA);
    const mainIdxB = config.columns.findIndex((c) => c.id === colIdB);
    const wingIdxA = config.wingColumns.findIndex((c) => c.id === colIdA);
    const wingIdxB = config.wingColumns.findIndex((c) => c.id === colIdB);

    if (mainIdxA >= 0 && mainIdxB >= 0) {
      const nextCols = [...config.columns];
      [nextCols[mainIdxA], nextCols[mainIdxB]] = [nextCols[mainIdxB], nextCols[mainIdxA]];
      applyNormalized({ ...config, columns: nextCols });
    } else if (wingIdxA >= 0 && wingIdxB >= 0) {
      const nextWing = [...config.wingColumns];
      [nextWing[wingIdxA], nextWing[wingIdxB]] = [nextWing[wingIdxB], nextWing[wingIdxA]];
      applyNormalized({ ...config, wingColumns: nextWing });
    } else if (mainIdxA >= 0 && wingIdxB >= 0) {
      const nextCols = [...config.columns];
      const nextWing = [...config.wingColumns];
      const temp = nextCols[mainIdxA];
      nextCols[mainIdxA] = nextWing[wingIdxB];
      nextWing[wingIdxB] = temp;
      const nextWidth = nextCols.reduce((s, c) => s + c.widthCm, 0);
      const nextWingRun = nextWing.reduce((s, c) => s + c.widthCm, 0);
      applyNormalized({
        ...config,
        widthCm: Math.max(30, nextWidth),
        wingWidthCm: nextWingRun + config.depthCm + 6,
        columns: nextCols,
        wingColumns: nextWing,
      });
    } else if (wingIdxA >= 0 && mainIdxB >= 0) {
      const nextCols = [...config.columns];
      const nextWing = [...config.wingColumns];
      const temp = nextWing[wingIdxA];
      nextWing[wingIdxA] = nextCols[mainIdxB];
      nextCols[mainIdxB] = temp;
      const nextWidth = nextCols.reduce((s, c) => s + c.widthCm, 0);
      const nextWingRun = nextWing.reduce((s, c) => s + c.widthCm, 0);
      applyNormalized({
        ...config,
        widthCm: Math.max(30, nextWidth),
        wingWidthCm: nextWingRun + config.depthCm + 6,
        columns: nextCols,
        wingColumns: nextWing,
      });
    }

    setSwapSourceColId(null);
    setSelectedColumnId(colIdA);
    setSelectedSlotIdx(0);
  };

  const handleSelectOrSwapColumn = (colId: string, slotIdx?: number) => {
    if (swapSourceColId) {
      if (colId === swapSourceColId) {
        setSwapSourceColId(null);
      } else {
        handleSwapColumns(swapSourceColId, colId);
      }
      return;
    }
    let resolvedSlotIdx = slotIdx;
    if (resolvedSlotIdx === undefined) {
      const targetCol =
        config.columns.find((c) => c.id === colId) ||
        config.wingColumns.find((c) => c.id === colId);
      const drawerIdx = targetCol?.slots.findIndex((sl) => isDrawerSlotType(sl.type)) ?? -1;
      resolvedSlotIdx = drawerIdx >= 0 ? drawerIdx : 0;
    }
    setSelectedColumnId(colId);
    setSelectedSlotIdx(resolvedSlotIdx);
    setRightInspectorOpen(true);
  };

  const selectedMainColIdx = selectedColumn
    ? config.columns.findIndex((c) => c.id === selectedColumn.id)
    : -1;
  const selectedWingColIdx = selectedColumn
    ? config.wingColumns.findIndex((c) => c.id === selectedColumn.id)
    : -1;
  const canMoveSelectedLeft = selectedMainColIdx > 0 || selectedWingColIdx > 0;
  const canMoveSelectedRight =
    (selectedMainColIdx >= 0 && selectedMainColIdx < config.columns.length - 1) ||
    (selectedWingColIdx >= 0 && selectedWingColIdx < config.wingColumns.length - 1);
  const totalRowModulesCount =
    config.columns.length + (config.layoutShape === 'l_shape' ? config.wingColumns.length : 0);
  const canSwapSelected = Boolean(selectedColumn && totalRowModulesCount >= 2);

  const handleSplitColumn = (colId: string) => {
    const idx = config.columns.findIndex((c) => c.id === colId);
    if (idx === -1) return;
    const target = config.columns[idx];
    if (target.widthCm < 50) return;
    const halfA = Math.floor(target.widthCm / 2);
    const halfB = target.widthCm - halfA;
    const nextCols = [...config.columns];
    nextCols.splice(
      idx,
      1,
      { ...target, widthCm: halfA },
      {
        id: `col_${Date.now().toString(36)}`,
        widthCm: halfB,
        slots: target.slots.map((s) => ({
          ...s,
          id: `sl_${Math.random().toString(36).slice(2, 7)}`,
        })),
      },
    );
    applyNormalized({ ...config, columns: nextCols });
  };

  const handleUpdateColumnWidth = (colId: string, rawWidthCm: number) => {
    const round1 = (v: number) => Math.round(v * 10) / 10;
    const nextColW = Math.max(25, Math.min(180, round1(rawWidthCm || 60)));
    const inMain = config.columns.some((c) => c.id === colId);
    if (inMain) {
      const nextCols = config.columns.map((c) =>
        c.id === colId ? { ...c, widthCm: nextColW } : c,
      );
      const nextTotalW = round1(nextCols.reduce((s, c) => s + c.widthCm, 0));
      applyNormalized({ ...config, widthCm: nextTotalW, columns: nextCols });
    } else {
      const nextWingCols = config.wingColumns.map((c) =>
        c.id === colId ? { ...c, widthCm: nextColW } : c,
      );
      const wingRunSum = round1(nextWingCols.reduce((s, c) => s + c.widthCm, 0));
      applyNormalized({
        ...config,
        wingWidthCm: round1(wingRunSum + config.depthCm + 6),
        wingColumns: nextWingCols,
      });
    }
  };

  const triggerCameraPreset = (preset: CameraPreset) => {
    setStudioTab('view3d');
    setActiveCameraPreset(preset);
    setCameraPresetTrigger((prev) => ({ preset, seq: (prev?.seq ?? 0) + 1 }));
  };

  const updateSlotAnywhere = (
    colId: string,
    slotId: string,
    updater: (slot: SlotConfig, colInnerHeightCm: number) => SlotConfig,
  ) => {
    const mapCols = (list: typeof config.columns) =>
      list.map((c) => {
        if (c.id !== colId) return c;
        const bayH = c.heightCm || config.heightCm;
        const bayPlinth = c.isSuspended ? 0 : config.plinthCm;
        const boxInnerCm = Math.max(22, bayH - bayPlinth - 3.6);
        const ratioSum = c.slots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;
        return {
          ...c,
          slots: c.slots.map((s) => {
            if (s.id !== slotId) return s;
            const slotInnerCm = boxInnerCm * (Math.max(0.1, s.heightRatio) / ratioSum);
            return updater(s, slotInnerCm);
          }),
        };
      });

    applyNormalized({
      ...config,
      columns: mapCols(config.columns),
      wingColumns: mapCols(config.wingColumns),
    });
  };

  const handleUpdateSlotType = (colId: string, slotId: string, nextType: SlotType) => {
    updateSlotAnywhere(colId, slotId, (s) => ({
      ...s,
      prevDoorType: isStandardDoorSlotType(s.type) && isVitrineSlotType(nextType)
        ? (s.type as 'door_left' | 'door_right' | 'door_double')
        : s.prevDoorType,
      type: nextType,
      drawerCount: isDrawerSlotType(nextType) ? getDrawerCount({ type: nextType }) : undefined,
      shelfClearancesCm: isDrawerSlotType(nextType) ? undefined : s.shelfClearancesCm,
    }));
  };

  const handleToggleSlotVitrine = (colId: string, slotId: string, enableVitrine: boolean) => {
    const col =
      config.columns.find((c) => c.id === colId) ||
      config.wingColumns.find((c) => c.id === colId);
    const colWidthCm = col?.widthCm ?? 50;

    updateSlotAnywhere(colId, slotId, (s) => {
      if (enableVitrine) {
        const nextType: SlotType =
          s.type === 'door_double' || colWidthCm > 60 ? 'glass_double' : 'glass_door';
        return {
          ...s,
          prevDoorType: isStandardDoorSlotType(s.type)
            ? (s.type as 'door_left' | 'door_right' | 'door_double')
            : s.prevDoorType,
          type: nextType,
        };
      }
      const restored: SlotType =
        colWidthCm > 60
          ? 'door_double'
          : s.prevDoorType === 'door_right'
            ? 'door_right'
            : 'door_left';
      return {
        ...s,
        type: restored,
      };
    });
  };

  const handleUpdateSlotProps = (
    colId: string,
    slotId: string,
    patch: Partial<SlotConfig>,
  ) => {
    updateSlotAnywhere(colId, slotId, (s) => ({
      ...s,
      ...patch,
    }));
  };

  const handleUpdateColumnProps = (colId: string, patch: Partial<ColumnConfig>) => {
    applyNormalized({
      ...config,
      columns: config.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
      wingColumns: config.wingColumns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    });
  };

  const handleArrangeDrawersPosition = (
    colId: string,
    mode: 'top' | 'bottom' | 'door_only' | 'only',
  ) => {
    const uid = Date.now().toString(36);
    const mapCols = (list: typeof config.columns) =>
      list.map((c) => {
        if (c.id !== colId) return c;
        const doorType: SlotType = c.widthCm > 65 ? 'door_double' : 'door_left';
        if (mode === 'top') {
          return {
            ...c,
            slots: [
              { id: `sl_${uid}a`, heightRatio: 0.38, type: 'drawers_2' as SlotType, internalShelves: 0, drawerCount: 2 },
              { id: `sl_${uid}b`, heightRatio: 0.62, type: doorType, internalShelves: 1 },
            ],
          };
        }
        if (mode === 'bottom') {
          return {
            ...c,
            slots: [
              { id: `sl_${uid}a`, heightRatio: 0.55, type: doorType, internalShelves: 1 },
              { id: `sl_${uid}b`, heightRatio: 0.45, type: 'drawers_2' as SlotType, internalShelves: 0, drawerCount: 2 },
            ],
          };
        }
        if (mode === 'door_only') {
          return {
            ...c,
            slots: [
              { id: `sl_${uid}d`, heightRatio: 1, type: doorType, internalShelves: 1 },
            ],
          };
        }
        return {
          ...c,
          slots: [
            { id: `sl_${uid}o`, heightRatio: 1, type: 'drawers_3' as SlotType, internalShelves: 0, drawerCount: 3 },
          ],
        };
      });
    applyNormalized({
      ...config,
      columns: mapCols(config.columns),
      wingColumns: mapCols(config.wingColumns),
    });
    setSelectedSlotIdx(0);
  };

  const handleSetTallTopCabinetMode = (colId: string, withOverCabinet: boolean) => {
    const target = [...config.columns, ...config.wingColumns].find((c) => c.id === colId);
    if (!target) return;
    if (target.slots.some((s) => s.type === 'fridge_builtin')) {
      handleApplyTallColumnPreset(colId, withOverCabinet ? 'fridge_top' : 'fridge_no_top');
      return;
    }
    const uid = Date.now().toString(36);
    const mapCols = (list: typeof config.columns) =>
      list.map((c) => {
        if (c.id !== colId) return c;
        if (withOverCabinet) {
          const hasSmallTop =
            c.slots.length > 1 &&
            c.slots[0].heightRatio <= 0.32 &&
            ['door_left', 'door_right', 'door_double', 'flap_up'].includes(c.slots[0].type);
          const nextSlots = hasSmallTop
            ? c.slots
            : [
                { id: `tc_${uid}a`, heightRatio: 0.22, type: (c.widthCm > 60 ? 'door_double' : 'door_left') as SlotType, internalShelves: 1 },
                ...c.slots.map((sl) => ({ ...sl, heightRatio: Number((sl.heightRatio * 0.78).toFixed(3)) })),
              ];
          return { ...c, heightCm: 220, isSuspended: false, slots: nextSlots };
        }
        const trimmedSlots =
          c.slots.length > 1 &&
          c.slots[0].heightRatio <= 0.32 &&
          ['door_left', 'door_right', 'door_double', 'flap_up'].includes(c.slots[0].type)
            ? c.slots.slice(1)
            : c.slots;
        return { ...c, heightCm: 185, isSuspended: false, slots: trimmedSlots };
      });
    applyNormalized({
      ...config,
      columns: mapCols(config.columns),
      wingColumns: mapCols(config.wingColumns),
    });
    setSelectedSlotIdx(0);
  };

  const handleApplyTallColumnPreset = (
    colId: string,
    kind: 'fridge_top' | 'fridge_no_top' | 'oven_mw' | 'pantry',
  ) => {
    const uid = Date.now().toString(36);
    const ownership = defaultApplianceOwnership;
    const makeSlots = (): { heightCm: number; slots: SlotConfig[] } => {
      if (kind === 'fridge_top') {
        return {
          heightCm: 220,
          slots: [
            { id: `tf_${uid}a`, heightRatio: 0.22, type: 'door_left', internalShelves: 1 },
            { id: `tf_${uid}b`, heightRatio: 0.78, type: 'fridge_builtin', internalShelves: 0, applianceOwnership: ownership },
          ],
        };
      }
      if (kind === 'fridge_no_top') {
        return {
          heightCm: 185,
          slots: [
            { id: `fn_${uid}a`, heightRatio: 1, type: 'fridge_builtin', internalShelves: 0, applianceOwnership: ownership },
          ],
        };
      }
      if (kind === 'oven_mw') {
        return {
          heightCm: 215,
          slots: [
            { id: `om_${uid}a`, heightRatio: 0.24, type: 'door_left', internalShelves: 1 },
            { id: `om_${uid}b`, heightRatio: 0.19, type: 'microwave', internalShelves: 0, applianceOwnership: ownership },
            { id: `om_${uid}c`, heightRatio: 0.28, type: 'oven_only', internalShelves: 0, applianceOwnership: ownership },
            { id: `om_${uid}d`, heightRatio: 0.29, type: 'drawers_2', internalShelves: 0, drawerCount: 2 },
          ],
        };
      }
      return {
        heightCm: 215,
        slots: [
          { id: `pt_${uid}a`, heightRatio: 0.62, type: 'door_left', internalShelves: 3 },
          { id: `pt_${uid}b`, heightRatio: 0.38, type: 'cargo_basket', internalShelves: 0 },
        ],
      };
    };

    const spec = makeSlots();
    const mapCols = (list: typeof config.columns) =>
      list.map((c) =>
        c.id === colId ? { ...c, heightCm: spec.heightCm, isSuspended: false, slots: spec.slots } : c,
      );
    applyNormalized({
      ...config,
      columns: mapCols(config.columns),
      wingColumns: mapCols(config.wingColumns),
    });
    setSelectedSlotIdx(0);
  };

  const handleLoadRoomTemplate = (tpl: RoomModuleTemplate) => {
    const nextCfg = structuredClone(tpl.config);
    const sz = catalogSizeOverrides[tpl.id];
    if (sz) {
      const oldW = nextCfg.widthCm || 60;
      const ratio = sz.w / oldW;
      nextCfg.widthCm = sz.w;
      nextCfg.heightCm = sz.h;
      nextCfg.depthCm = sz.d;
      if (nextCfg.columns.length === 1) {
        nextCfg.columns[0].widthCm = sz.w;
        if (nextCfg.columns[0].heightCm !== undefined) {
          nextCfg.columns[0].heightCm = sz.h;
        }
      } else if (nextCfg.columns.length > 1 && Math.abs(ratio - 1) > 0.01) {
        let acc = 0;
        nextCfg.columns = nextCfg.columns.map((c, idx) => {
          if (idx === nextCfg.columns.length - 1) {
            return { ...c, widthCm: Math.max(25, sz.w - acc) };
          }
          const scaled = Math.max(25, Math.round(c.widthCm * ratio));
          acc += scaled;
          return { ...c, widthCm: scaled };
        });
      }
    }
    applyNormalized(nextCfg);
    setSelectedColumnId(nextCfg.columns[0]?.id ?? null);
    setSelectedSlotIdx(0);
    setIsolatedMode(false);
    setRightInspectorOpen(false);
    setStudioTab('view3d');
    setCenterTriggerSeq((s) => s + 1);
  };

  const handleAppendModuleToProject = (tpl: RoomModuleTemplate) => {
    const wasEmpty = config.columns.length === 0 && config.wingColumns.length === 0;
    const uid = Date.now().toString(36);
    const sz = catalogSizeOverrides[tpl.id];
    const targetW = sz ? sz.w : tpl.config.widthCm;
    const targetH = sz ? sz.h : tpl.config.heightCm;
    const targetD = sz ? sz.d : tpl.config.depthCm;
    const oldW = tpl.config.widthCm || 60;
    const ratio = targetW / oldW;

    const clonedCols: ColumnConfig[] = tpl.config.columns.map((c, cIdx) => {
      const colW =
        tpl.config.columns.length === 1
          ? targetW
          : Math.max(25, Math.round(c.widthCm * ratio));
      const bayHeight = wasEmpty
        ? c.heightCm
        : c.heightCm ?? (targetH !== config.heightCm ? targetH : undefined);
      return {
        ...structuredClone(c),
        id: `mod_${uid}_${cIdx}`,
        widthCm: colW,
        heightCm: bayHeight,
        slots: c.slots.map((sl, sIdx) => ({
          ...structuredClone(sl),
          id: `ms_${uid}_${cIdx}_${sIdx}`,
        })),
      };
    });

    const addedWidth = clonedCols.reduce((s, c) => s + c.widthCm, 0);
    const nextCols = [...config.columns, ...clonedCols];
    if (wasEmpty) {
      applyNormalized({
        ...config,
        category: tpl.config.category,
        layoutShape: 'straight',
        widthCm: addedWidth,
        heightCm: targetH,
        depthCm: targetD,
        plinthCm: tpl.config.plinthCm,
        includeUpperCabinets: tpl.config.includeUpperCabinets,
        includeBacksplash: tpl.config.includeBacksplash,
        countertopThicknessMm: tpl.config.countertopThicknessMm || config.countertopThicknessMm,
        wardrobeDoorStyle: tpl.config.wardrobeDoorStyle || config.wardrobeDoorStyle,
        includeClothesRails: tpl.config.includeClothesRails ?? config.includeClothesRails,
        includeCornerMechanism: Boolean(tpl.config.includeCornerMechanism),
        wingWidthCm: 0,
        wingColumns: [],
        columns: clonedCols,
      });
    } else {
      applyNormalized({
        ...config,
        widthCm: nextCols.reduce((s, c) => s + c.widthCm, 0) || config.widthCm + addedWidth,
        includeCornerMechanism:
          config.includeCornerMechanism || Boolean(tpl.config.includeCornerMechanism),
        columns: nextCols,
      });
    }
    setSelectedColumnId(clonedCols[0]?.id ?? null);
    setSelectedSlotIdx(0);
    setIsolatedMode(false);
    setStudioTab('view3d');
    setCenterTriggerSeq((s) => s + 1);
  };

  const handleSetShelvesCount = (colId: string, slotId: string, nextShelves: number) => {
    const clamped = Math.max(0, Math.min(6, nextShelves));
    updateSlotAnywhere(colId, slotId, (s, slotInnerCm) => ({
      ...s,
      internalShelves: clamped,
      shelfClearancesCm:
        clamped > 0 ? computeSlotClearancesCm(slotInnerCm, clamped) : undefined,
    }));
  };

  const handleChangeShelfClearance = (
    colId: string,
    slotId: string,
    gapIdx: number,
    nextGapCm: number,
  ) => {
    updateSlotAnywhere(colId, slotId, (s, slotInnerCm) => {
      const shelves = Math.max(1, s.internalShelves || 1);
      const current = computeSlotClearancesCm(slotInnerCm, shelves, s.shelfClearancesCm);
      return {
        ...s,
        internalShelves: shelves,
        shelfClearancesCm: rebalanceShelfClearances(slotInnerCm, current, gapIdx, nextGapCm),
      };
    });
  };

  const handleSetDrawerCount = (colId: string, slotId: string, nextCount: number) => {
    const clamped = Math.max(1, Math.min(8, nextCount));
    const slotType: SlotType =
      clamped <= 6 ? (`drawers_${clamped}` as SlotType) : 'drawers_6';
    updateSlotAnywhere(colId, slotId, (s) => ({
      ...s,
      type: slotType,
      drawerCount: clamped,
      internalShelves: 0,
      shelfClearancesCm: undefined,
    }));
  };

  const handleSetDrawerSlide = (colId: string, slotId: string, slideType: DrawerSlideType) => {
    updateSlotAnywhere(colId, slotId, (s) => ({
      ...s,
      drawerSlideType: slideType,
    }));
  };

  const handleUpdateDrawerDimensions = (
    colId: string,
    slotId: string,
    dims: { widthMm?: number; slotHeightMm?: number; depthMm?: number },
  ) => {
    const col =
      config.columns.find((c) => c.id === colId) ||
      config.wingColumns.find((c) => c.id === colId);
    if (!col) return;

    const nextConfig = structuredClone(config);
    const inMain = nextConfig.columns.some((c) => c.id === colId);
    const isSingleBayProject =
      nextConfig.columns.length === 1 && nextConfig.wingColumns.length === 0;
    const round1 = (v: number) => Math.round(v * 10) / 10;

    if (typeof dims.widthMm === 'number' && Number.isFinite(dims.widthMm)) {
      const nextColW = Math.max(25, Math.min(180, round1(dims.widthMm / 10)));
      if (inMain) {
        nextConfig.columns = nextConfig.columns.map((c) =>
          c.id === colId ? { ...c, widthCm: nextColW } : c,
        );
        nextConfig.widthCm = round1(nextConfig.columns.reduce((s, c) => s + c.widthCm, 0));
      } else {
        nextConfig.wingColumns = nextConfig.wingColumns.map((c) =>
          c.id === colId ? { ...c, widthCm: nextColW } : c,
        );
        const wingRunSum = round1(nextConfig.wingColumns.reduce((s, c) => s + c.widthCm, 0));
        nextConfig.wingWidthCm = round1(wingRunSum + nextConfig.depthCm + 6);
      }
    }

    if (typeof dims.slotHeightMm === 'number' && Number.isFinite(dims.slotHeightMm)) {
      const targetSlotMm = Math.max(100, Math.min(2200, Math.round(dims.slotHeightMm)));
      const mapHeight = (cols: ColumnConfig[]) =>
        cols.map((c) => {
          if (c.id !== colId) return c;
          const plinthCm = c.isSuspended ? 0 : nextConfig.plinthCm;
          const bayHeightCm = c.heightCm || nextConfig.heightCm;
          const boxHeightCm = Math.max(25, bayHeightCm - plinthCm);

          if (c.slots.length <= 1) {
            const nextBayCm = Math.max(35, Math.min(275, round1(targetSlotMm / 10 + plinthCm)));
            if (isSingleBayProject) {
              nextConfig.heightCm = nextBayCm;
              return { ...c, heightCm: undefined };
            }
            return {
              ...c,
              heightCm: Math.abs(nextBayCm - nextConfig.heightCm) < 0.05 ? undefined : nextBayCm,
            };
          }

          const nextRatio = Math.max(0.15, Math.min(0.85, (targetSlotMm / 10) / boxHeightCm));
          const otherSlots = c.slots.filter((sl) => sl.id !== slotId);
          const otherSum =
            otherSlots.reduce((sum, sl) => sum + Math.max(0.1, sl.heightRatio), 0) || 1;
          const remainingRatio = Math.max(0.15, 1 - nextRatio);
          return {
            ...c,
            slots: c.slots.map((sl) => {
              if (sl.id === slotId) {
                return { ...sl, heightRatio: Number(nextRatio.toFixed(4)) };
              }
              return {
                ...sl,
                heightRatio: Number(
                  ((Math.max(0.1, sl.heightRatio) / otherSum) * remainingRatio).toFixed(4),
                ),
              };
            }),
          };
        });

      nextConfig.columns = mapHeight(nextConfig.columns);
      nextConfig.wingColumns = mapHeight(nextConfig.wingColumns);
    }

    if (typeof dims.depthMm === 'number' && Number.isFinite(dims.depthMm)) {
      const clampedMm = Math.max(220, Math.min(850, Math.round(dims.depthMm)));
      const nextDepthCm = round1(clampedMm / 10);
      const matchedSlideMm = resolveDrawerSlideLengthMm(clampedMm);

      if (isSingleBayProject) {
        nextConfig.depthCm = nextDepthCm;
      }

      const mapDepth = (cols: ColumnConfig[]) =>
        cols.map((c) => {
          if (c.id !== colId) return c;
          return {
            ...c,
            depthCm: isSingleBayProject
              ? undefined
              : Math.abs(nextDepthCm - nextConfig.depthCm) < 0.05
                ? undefined
                : nextDepthCm,
            slots: c.slots.map((sl) =>
              sl.id === slotId || isDrawerSlotType(sl.type)
                ? { ...sl, drawerSlideLengthMm: matchedSlideMm }
                : sl,
            ),
          };
        });

      nextConfig.columns = mapDepth(nextConfig.columns);
      nextConfig.wingColumns = mapDepth(nextConfig.wingColumns);
    }

    applyNormalized(nextConfig);
  };

  const handleSplitSlotVertically = (colId: string, slotId: string) => {
    const uid = Date.now().toString(36);
    const mapCols = (list: typeof config.columns) =>
      list.map((c) => {
        if (c.id !== colId) return c;
        const idx = c.slots.findIndex((s) => s.id === slotId);
        if (idx === -1 || c.slots.length >= 4) return c;
        const target = c.slots[idx];
        const nextSlots = [...c.slots];
        nextSlots.splice(
          idx,
          1,
          { ...target, heightRatio: Number((target.heightRatio * 0.62).toFixed(3)) },
          {
            id: `sl_${uid}`,
            heightRatio: Number((target.heightRatio * 0.38).toFixed(3)),
            type: 'drawers_2' as SlotType,
            internalShelves: 0,
            drawerCount: 2,
          },
        );
        return { ...c, slots: nextSlots };
      });
    applyNormalized({
      ...config,
      columns: mapCols(config.columns),
      wingColumns: mapCols(config.wingColumns),
    });
  };

  const handleEmbedAppliance = (
    slotType: SlotType,
    opts?: {
      tallKind?: 'fridge_top' | 'fridge_no_top' | 'oven_mw';
      upperType?: UpperBayType;
      dishwasherStyle?: DishwasherFrontStyle;
    },
  ) => {
    if (!selectedColumn || !activeSlot) return;
    if (opts?.upperType) {
      handleSetUpperBayType(selectedColumn.id, opts.upperType);
      return;
    }
    if (opts?.tallKind) {
      handleApplyTallColumnPreset(selectedColumn.id, opts.tallKind);
      return;
    }
    updateSlotAnywhere(selectedColumn.id, activeSlot.id, (s) => ({
      ...s,
      type: slotType,
      applianceOwnership: defaultApplianceOwnership,
      dishwasherStyle:
        slotType === 'dishwasher'
          ? opts?.dishwasherStyle || defaultDishwasherStyle
          : s.dishwasherStyle,
      drawerCount: undefined,
      shelfClearancesCm: undefined,
    }));
  };

  const handleAddApplianceModule = (
    slotType: SlotType,
    opts?: {
      widthCm?: number;
      heightCm?: number;
      tallKind?: 'fridge_top' | 'fridge_no_top' | 'oven_mw';
      dishwasherStyle?: DishwasherFrontStyle;
    },
  ) => {
    const uid = Date.now().toString(36);
    const w = opts?.widthCm || (slotType === 'washing_machine' ? 65 : 60);
    let newCol: ColumnConfig;
    if (opts?.tallKind === 'fridge_top') {
      newCol = {
        id: `app_${uid}`,
        widthCm: w,
        heightCm: 220,
        slots: [
          { id: `as_${uid}a`, heightRatio: 0.22, type: 'door_left', internalShelves: 1 },
          { id: `as_${uid}b`, heightRatio: 0.78, type: 'fridge_builtin', internalShelves: 0, applianceOwnership: defaultApplianceOwnership },
        ],
      };
    } else if (opts?.tallKind === 'fridge_no_top') {
      newCol = {
        id: `app_${uid}`,
        widthCm: w,
        heightCm: 185,
        slots: [
          { id: `as_${uid}a`, heightRatio: 1, type: 'fridge_builtin', internalShelves: 0, applianceOwnership: defaultApplianceOwnership },
        ],
      };
    } else if (opts?.tallKind === 'oven_mw') {
      newCol = {
        id: `app_${uid}`,
        widthCm: w,
        heightCm: 215,
        slots: [
          { id: `as_${uid}a`, heightRatio: 0.24, type: 'door_left', internalShelves: 1 },
          { id: `as_${uid}b`, heightRatio: 0.19, type: 'microwave', internalShelves: 0, applianceOwnership: defaultApplianceOwnership },
          { id: `as_${uid}c`, heightRatio: 0.28, type: 'oven_only', internalShelves: 0, applianceOwnership: defaultApplianceOwnership },
          { id: `as_${uid}d`, heightRatio: 0.29, type: 'drawers_2', internalShelves: 0, drawerCount: 2 },
        ],
      };
    } else {
      newCol = {
        id: `app_${uid}`,
        widthCm: w,
        heightCm: opts?.heightCm,
        upperType: slotType === 'oven_hob' || slotType === 'hob_only' ? 'extractor_builtin' : undefined,
        slots: [
          {
            id: `as_${uid}a`,
            heightRatio: 1,
            type: slotType,
            internalShelves: 0,
            applianceOwnership: defaultApplianceOwnership,
            dishwasherStyle: slotType === 'dishwasher' ? opts?.dishwasherStyle || defaultDishwasherStyle : undefined,
          },
        ],
      };
    }
    const wasEmpty = config.columns.length === 0 && config.wingColumns.length === 0;
    const nextCols = [...config.columns, newCol];
    applyNormalized({
      ...config,
      ...(wasEmpty
        ? {
            category: 'kitchen' as const,
            layoutShape: 'straight' as const,
            heightCm: opts?.heightCm ?? 86,
            depthCm: 58,
            plinthCm: 10,
            wingWidthCm: 0,
            wingColumns: [],
          }
        : {}),
      widthCm: nextCols.reduce((s, c) => s + c.widthCm, 0),
      columns: nextCols,
    });
    setSelectedColumnId(newCol.id);
    setSelectedSlotIdx(0);
    setStudioTab('view3d');
    setCenterTriggerSeq((s) => s + 1);
  };

  const triggerMailtoClient = (recipientEmail: string, subject: string, bodyText: string) => {
    const mailtoHref = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(bodyText)}`;
    const link = document.createElement('a');
    link.href = mailtoHref;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportProjectJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const parsed = parseProject3DJson(raw);
      if (!parsed) {
        setImportToast({
          type: 'err',
          text:
            lang === 'bg'
              ? 'Невалиден 3D JSON файл на проект.'
              : 'Invalid 3D project JSON file.',
        });
        window.setTimeout(() => setImportToast(null), 4000);
        return;
      }
      applyNormalized(parsed.config);
      const firstCol = parsed.config.columns[0]?.id ?? parsed.config.wingColumns[0]?.id ?? null;
      setSelectedColumnId(firstCol);
      setSelectedSlotIdx(0);
      if (parsed.title) setProjectTitle(parsed.title);
      if (parsed.clientName) setGuestName(parsed.clientName);
      if (parsed.clientEmail) setGuestEmail(parsed.clientEmail);
      if (parsed.clientPhone) setCustomerPhone(parsed.clientPhone);
      if (parsed.notes) setQuestionText(parsed.notes);
      setStudioTab('view3d');
      setCenterTriggerSeq((s) => s + 1);
      setImportToast({
        type: 'ok',
        text:
          lang === 'bg'
            ? `Зареден 3D проект ${parsed.projectCode || file.name} (${parsed.config.columns.length} модула)`
            : `Loaded 3D project ${parsed.projectCode || file.name}`,
      });
      window.setTimeout(() => setImportToast(null), 4500);
    };
    reader.readAsText(file, 'utf-8');
  };

  const openSaveModal = () => {
    const preset = STARTER_PRESETS.find((p) => p.id === config.templateId);
    if (!projectTitle) {
      setProjectTitle(
        preset
          ? lang === 'bg'
            ? preset.titleBg
            : preset.titleEn
          : lang === 'bg'
            ? 'Проект по поръчка'
            : 'Custom Project',
      );
    }
    setQuotePackageResult(null);
    setBomCopied(false);
    setSaveError(null);
    setModalOpen(true);
  };

  const handleSaveProject = async (sendInquiry: boolean) => {
    if (!sendInquiry && !user) return;
    if (sendInquiry && !user && (!guestName.trim() || !customerPhone.trim())) {
      setSaveError(
        lang === 'bg'
          ? 'Моля, въведете Вашето име и телефон за връзка, за да изпратите офертата.'
          : 'Please enter your name and phone number to send the quote inquiry.',
      );
      return;
    }
    if (sendInquiry && quote?.belowMinOrder) {
      setSaveError(
        lang === 'bg'
          ? `Минималната стойност за изпращане на поръчка е ${quote.minOrderEur} €. Добавете модули/механизми или запазете като чернова.`
          : `Minimum order value is ${quote.minOrderEur} €. Add more items or save as draft.`,
      );
      return;
    }
    setSaving(true);
    setSaveError(null);

    try {
      const codeToUse = activeProjectCode || generateProjectCode();
      const docId =
        activeProjectId ||
        `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const price = quote?.totalPriceEur ?? 0;
      const effectiveTitle = projectTitle.trim() || codeToUse;
      const effectiveName = (user?.displayName || guestName).trim() || 'Клиент';
      const effectiveEmail = (user?.email || guestEmail).trim();
      const effectivePhone = customerPhone.trim();

      const cleanConfig = JSON.parse(JSON.stringify(config)) as FurnitureConfig;

      if (user) {
        if (activeProjectId) {
          const ref = doc(db, 'user_projects', activeProjectId);
          await updateDoc(ref, {
            title: effectiveTitle,
            config: cleanConfig,
            calculatedPriceEur: price,
            status: sendInquiry ? 'inquiry_sent' : 'draft',
            customerPhone: effectivePhone,
            initialQuestion: questionText.trim(),
            updatedAt: serverTimestamp(),
          }).catch((err) =>
            handleFirestoreError(err, OperationType.UPDATE, `user_projects/${activeProjectId}`),
          );
        } else {
          const ref = doc(db, 'user_projects', docId);
          await setDoc(ref, {
            projectCode: codeToUse,
            ownerId: user.uid,
            ownerEmail: effectiveEmail,
            ownerName: effectiveName,
            customerPhone: effectivePhone,
            title: effectiveTitle,
            config: cleanConfig,
            calculatedPriceEur: price,
            status: sendInquiry ? 'inquiry_sent' : 'draft',
            initialQuestion: questionText.trim(),
            adminNote: '',
            publishedToTemplates: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch((err) =>
            handleFirestoreError(err, OperationType.CREATE, `user_projects/${docId}`),
          );
        }

        if (sendInquiry && questionText.trim()) {
          await addDoc(collection(db, 'user_projects', docId, 'messages'), {
            projectOwnerId: user.uid,
            senderId: user.uid,
            senderRole: 'client',
            senderName: effectiveName || effectiveEmail || 'Клиент',
            text: questionText.trim(),
            createdAt: serverTimestamp(),
          }).catch((err) =>
            handleFirestoreError(err, OperationType.CREATE, `user_projects/${docId}/messages`),
          );
        }
      }

      if (!sendInquiry) {
        await fetch('/api/projects/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: {
              id: docId,
              projectCode: codeToUse,
              ownerId: user?.uid || 'guest',
              ownerEmail: effectiveEmail,
              ownerName: effectiveName,
              customerPhone: effectivePhone,
              title: effectiveTitle,
              config: cleanConfig,
              calculatedPriceEur: price,
              status: 'draft',
              initialQuestion: questionText.trim(),
            },
          }),
        }).catch((err) => console.warn('CRM sync skipped:', err));

        setModalOpen(false);
        onSavedToProfile(docId, codeToUse, false);
        return;
      }

      // Send full 3-part quote package (Proekt_AutoCAD_3D.dxf + Proekt_3D.json + Detailed BOM with real suppliers)
      let pkgResult: {
        deliveryMode: 'resend' | 'smtp' | 'mailto';
        recipientEmail: string;
        projectCode: string;
        totalPriceEur: number;
        subject: string;
        mailtoBody: string;
        fullReportText: string;
        dxfFilename: string;
        jsonFilename: string;
        dxfContent: string;
        projectJsonContent: string;
      } | null = null;

      try {
        const emailResp = await fetch('/api/quote/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: cleanConfig,
            projectId: docId,
            projectCode: codeToUse,
            title: effectiveTitle,
            ownerId: user?.uid || 'guest',
            clientName: effectiveName,
            clientEmail: effectiveEmail,
            clientPhone: effectivePhone,
            questionText: questionText.trim(),
          }),
        });
        if (emailResp.ok) {
          const data = await emailResp.json();
          if (data?.ok) {
            pkgResult = {
              deliveryMode: data.deliveryMode || 'mailto',
              recipientEmail: data.recipientEmail || 'mebelikolev71@gmail.com',
              projectCode: data.projectCode || codeToUse,
              totalPriceEur: Number(data.totalPriceEur ?? price),
              subject: data.subject,
              mailtoBody: data.mailtoBody,
              fullReportText: data.fullReportText,
              dxfFilename: data.dxfFilename || AUTOCAD_3D_DXF_FILENAME,
              jsonFilename: data.jsonFilename || PROJECT_3D_JSON_FILENAME,
              dxfContent: data.dxfContent,
              projectJsonContent: data.projectJsonContent,
            };
          }
        }
      } catch (err) {
        console.warn('Server email dispatch fallback triggered:', err);
      }

      if (!pkgResult) {
        const dxfContent = generateFurnitureDxf(cleanConfig, codeToUse);
        const projectJsonContent = buildProject3DJson({
          config: cleanConfig,
          projectCode: codeToUse,
          title: effectiveTitle,
          totalPriceEur: price,
          hardwareTier: selectedHwTier,
          clientName: effectiveName,
          clientEmail: effectiveEmail,
          clientPhone: effectivePhone,
          notes: questionText.trim(),
        });
        const report = buildProjectBomEmailReport({
          projectCode: codeToUse,
          title: effectiveTitle,
          clientName: effectiveName,
          clientEmail: effectiveEmail,
          clientPhone: effectivePhone,
          questionText: questionText.trim(),
          totalPriceEur: price,
          config: cleanConfig,
          decors,
          hardwareTiers,
          meritItems,
          partnerItems,
        });
        pkgResult = {
          deliveryMode: 'mailto',
          recipientEmail: 'mebelikolev71@gmail.com',
          projectCode: codeToUse,
          totalPriceEur: price,
          subject: report.subject,
          mailtoBody: report.mailtoBody,
          fullReportText: report.fullReportText,
          dxfFilename: AUTOCAD_3D_DXF_FILENAME,
          jsonFilename: PROJECT_3D_JSON_FILENAME,
          dxfContent,
          projectJsonContent,
        };
      }

      setQuotePackageResult(pkgResult);

      if (pkgResult.deliveryMode === 'mailto') {
        triggerBrowserFileDownload(
          pkgResult.dxfFilename,
          pkgResult.dxfContent,
          'application/dxf;charset=utf-8;',
        );
        window.setTimeout(() => {
          triggerBrowserFileDownload(
            pkgResult!.jsonFilename,
            pkgResult!.projectJsonContent,
            'application/json;charset=utf-8;',
          );
        }, 220);
        triggerMailtoClient(pkgResult.recipientEmail, pkgResult.subject, pkgResult.mailtoBody);
      }

      if (user) {
        onSavedToProfile(docId, codeToUse, true);
      }
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : lang === 'bg'
            ? 'Грешка при запазване.'
            : 'Failed to save project.',
      );
    } finally {
      setSaving(false);
    }
  };

  const frontDecor = decors.find((d) => d.id === config.frontDecorId);
  const counterDecor = decors.find((d) => d.id === config.countertopDecorId);

  const selectedColIndex = selectedColumn
    ? config.columns.findIndex((c) => c.id === selectedColumn.id)
    : -1;
  const canDeleteSelectedColumn = Boolean(selectedColumn);
  const selectedColumnLabel = selectedColumn
    ? `${
        selectedColIndex >= 0
          ? `${lang === 'bg' ? 'Модул' : 'Bay'} #${selectedColIndex + 1}`
          : lang === 'bg'
            ? 'Крило Г'
            : 'Wing'
      } · ${Math.round(selectedColumn.widthCm * 10)} мм`
    : undefined;
  const activeSlot =
    selectedColumn?.slots[selectedSlotIdx] || selectedColumn?.slots[0] || null;

  return (
    <section
      ref={studioSectionRef}
      id="studio"
      className={
        isFullPage || nativeFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-[#0F131C] text-zinc-100 overflow-hidden'
          : 'border-t border-zinc-200 bg-[#0F131C] text-zinc-100 flex flex-col'
      }
    >
      {/* Clean Bulgarian Studio Top Toolbar */}
      <div className="bg-[#0B0F17] border-b border-[#252D3F] px-3 py-1.5 shrink-0">
        <div className="mx-auto max-w-[1720px] flex flex-wrap items-center justify-between gap-2">
          {/* Left: Clean Navigation & Direct Modeling Actions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isFullPage || nativeFullscreen ? (
              <>
                <button
                  type="button"
                  onClick={handleToggleTrueFullScreen}
                  className="inline-flex items-center gap-1 rounded-md border border-[#D49B62]/70 bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-zinc-100 hover:bg-zinc-800 transition-colors whitespace-nowrap"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-[#D49B62]" />
                  <span>{t(lang, 'exitFullPageBtn')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleBrowserFullscreen}
                  title={
                    nativeFullscreen
                      ? lang === 'bg'
                        ? 'Изход от цял екран'
                        : 'Exit Full Screen'
                      : lang === 'bg'
                        ? 'Отвори на цял екран'
                        : 'Full Screen'
                  }
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    nativeFullscreen
                      ? 'border border-[#D49B62]/80 bg-[#273147] text-[#E6B88A] hover:bg-[#313D58]'
                      : 'bg-[#B47B44] text-white hover:bg-[#9E6835]'
                  }`}
                >
                  {nativeFullscreen ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" />
                      <span>{lang === 'bg' ? 'Изход от цял екран' : 'Exit Full Screen'}</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>{lang === 'bg' ? 'Цял екран' : 'Full Screen'}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleToggleTrueFullScreen}
                className="inline-flex items-center gap-1 rounded-md bg-[#B47B44] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#9E6835] transition-colors whitespace-nowrap"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>{t(lang, 'openFullScreenBtn')}</span>
              </button>
            )}

            {/* Primary Project Tools: Нов проект | Отвори .JSON | Назад | Напред | Изтрий */}
            <div className="flex items-center gap-0.5 rounded-md border border-[#2C354A] bg-[#141924] p-0.5">
              <button
                type="button"
                onClick={() => setNewProjectModalOpen(true)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-950/70 transition-colors whitespace-nowrap"
                title={lang === 'bg' ? 'Започни нов проект' : 'New Project'}
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Нов проект' : 'New Project'}</span>
              </button>
              <input
                ref={importJsonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportProjectJsonFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => importJsonInputRef.current?.click()}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-950/60 transition-colors whitespace-nowrap"
                title={
                  lang === 'bg'
                    ? 'Зареди запазен 3D проект (Proekt_3D.json)'
                    : 'Open saved 3D project (Proekt_3D.json)'
                }
              >
                <Upload className="h-3.5 w-3.5 text-[#E6B88A]" />
                <span>{lang === 'bg' ? 'Отвори .JSON' : 'Open .JSON'}</span>
              </button>
              <span className="h-4 w-px bg-[#2C354A]" />
              <button
                type="button"
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
                title={lang === 'bg' ? 'Назад (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Назад' : 'Undo'}</span>
              </button>
              <button
                type="button"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/10 disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
                title={lang === 'bg' ? 'Напред (Ctrl+Y)' : 'Redo (Ctrl+Y)'}
              >
                <Redo2 className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Напред' : 'Redo'}</span>
              </button>
              <span className="h-4 w-px bg-[#2C354A]" />
              <button
                type="button"
                disabled={!canDeleteSelectedColumn || !selectedColumn}
                onClick={() => selectedColumn && handleRemoveColumn(selectedColumn.id)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-950/80 disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
                title={lang === 'bg' ? 'Изтрий маркирания шкаф/елемент' : 'Delete selected module'}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Изтрий' : 'Delete'}</span>
              </button>
            </div>

            {/* Viewport Tools: Измерване | Размери (Дименсии) | Центрирай изгледа */}
            {!windowMinimized && (
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setStudioTab('view3d');
                    setMeasureMode((v) => {
                      const next = !v;
                      if (next) setPanMode(false);
                      return next;
                    });
                  }}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    measureMode
                      ? 'border-cyan-400 bg-cyan-950/70 text-cyan-200 font-semibold'
                      : 'border-[#2C354A] bg-[#141924] text-zinc-200 hover:border-zinc-500'
                  }`}
                  title={lang === 'bg' ? 'Измери разстояние от точка А до точка Б' : 'Measure A-B'}
                >
                  <Crosshair className="h-3.5 w-3.5 text-cyan-300" />
                  <span>{lang === 'bg' ? 'Измерване' : 'Measure'}</span>
                </button>

                {measureMode && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/45 bg-cyan-950/60 px-2 py-1 text-[11px] font-mono-tabular text-cyan-100 whitespace-nowrap">
                    <span>
                      {!measureReadout || !measureReadout.hasFirstPoint
                        ? lang === 'bg'
                          ? 'Клик т.А → т.Б'
                          : 'Click A → B'
                        : `${measureReadout.distanceMm} мм (${measureReadout.distanceCm.toFixed(1)} см)`}
                    </span>
                    {measureReadout?.hasFirstPoint && (
                      <button
                        type="button"
                        onClick={() => setClearMeasureTriggerSeq((s) => s + 1)}
                        className="rounded bg-cyan-800/80 px-1.5 py-0.2 text-[10px] hover:bg-cyan-700"
                      >
                        {lang === 'bg' ? 'Изчисти' : 'Clear'}
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setStudioTab('view3d');
                    setShowDimensions((v) => !v);
                  }}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    showDimensions
                      ? 'border-[#D49B62] bg-[#B47B44]/25 text-[#F7D7B2] font-semibold'
                      : 'border-[#2C354A] bg-[#141924] text-zinc-200 hover:border-zinc-500'
                  }`}
                  title={lang === 'bg' ? 'Покажи/скрий размерните линии в мм' : 'Toggle Dimensions'}
                >
                  <Ruler className="h-3.5 w-3.5 text-[#E6B88A]" />
                  <span>{lang === 'bg' ? 'Размери (Дименсии)' : 'Dimensions'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStudioTab('view3d');
                    setActiveCameraPreset(null);
                    setCenterTriggerSeq((s) => s + 1);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-[#2C354A] bg-[#141924] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-[#D49B62] transition-colors whitespace-nowrap"
                  title={lang === 'bg' ? 'Върни 3D модела в центъра' : 'Center 3D View'}
                >
                  <LocateFixed className="h-3.5 w-3.5 text-[#E6B88A]" />
                  <span>{lang === 'bg' ? 'Центрирай изгледа' : 'Center View'}</span>
                </button>

                {/* Segmented 3D Модел / 2D Чертеж Toggle */}
                <div className="flex items-center rounded-md border border-[#2C354A] bg-[#141924] p-0.5">
                  <button
                    type="button"
                    onClick={() => setStudioTab('view3d')}
                    className={`rounded px-2.5 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      studioTab === 'view3d'
                        ? 'bg-[#B47B44] text-white'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {lang === 'bg' ? '3D Модел' : '3D Model'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioTab('sketch2d')}
                    className={`rounded px-2.5 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      studioTab === 'sketch2d'
                        ? 'bg-[#B47B44] text-white'
                        : 'text-zinc-300 hover:text-white'
                    }`}
                  >
                    {lang === 'bg' ? '2D Чертеж' : '2D Sketch'}
                  </button>
                </div>

                {/* Quick Scene Helpers: Отвори вратите / Виж отвътре / Светлина */}
                <button
                  type="button"
                  onClick={() => {
                    setStudioTab('view3d');
                    setAllOpen((v) => !v);
                  }}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    allOpen
                      ? 'border-[#D49B62] bg-[#B47B44] text-white font-semibold'
                      : 'border-[#2C354A] bg-[#141924] text-zinc-200 hover:border-[#D49B62]'
                  }`}
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">
                    {allOpen
                      ? lang === 'bg'
                        ? 'Затвори вратите'
                        : 'Close Doors'
                      : lang === 'bg'
                        ? 'Отвори вратите'
                        : 'Open Doors'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStudioTab('view3d');
                    setSeeInside((v) => !v);
                  }}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    seeInside
                      ? 'border-[#D49B62] bg-[#B47B44] text-white'
                      : 'border-[#2C354A] bg-[#141924] text-zinc-200 hover:border-zinc-500'
                  }`}
                  title={t(lang, 'seeInsideBtn')}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden 2xl:inline">{t(lang, 'seeInsideBtn')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLightingMode((m) => (m === 'day' ? 'evening' : 'day'))}
                  className="inline-flex items-center gap-1 rounded-md border border-[#2C354A] bg-[#141924] px-2 py-1 text-[11px] text-zinc-200 hover:border-zinc-500 whitespace-nowrap"
                  title={lightingMode === 'day' ? t(lang, 'dayLight') : t(lang, 'warmLight')}
                >
                  {lightingMode === 'day' ? (
                    <Sun className="h-3.5 w-3.5 text-amber-300" />
                  ) : (
                    <Moon className="h-3.5 w-3.5 text-sky-300" />
                  )}
                </button>
              </div>
            )}

            {windowMinimized && (
              <span className="ml-1 text-xs font-medium text-zinc-300">
                {lang === 'bg' ? '3D Конфигуратор (минимизиран)' : '3D Configurator (minimized)'}
              </span>
            )}
          </div>

          {/* Right: Project Code, Production Days, Price, Installation Note, Consult & Save */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-zinc-400">
              <span className="font-mono-tabular font-semibold text-zinc-100">
                {activeProjectCode}
              </span>
              <span className="text-zinc-600">·</span>
              <span>
                {quote ? `${quote.productionDays} ${t(lang, 'daysUnit')}` : '...'}
              </span>
            </div>

            <div className="flex items-baseline gap-1.5 rounded-md border border-[#252D3F] bg-[#121722] px-2.5 py-0.5">
              <span className="font-mono-tabular text-base sm:text-lg font-bold text-[#E2AC76]">
                {quoteLoading && !quote
                  ? '...'
                  : `${(quote?.totalPriceEur ?? 0).toLocaleString('bg-BG')} €`}
              </span>
              {quote &&
                ((quote.meritItemsCount ?? 0) + (quote.partnerItemsCount ?? 0)) > 0 && (
                  <span className="text-[10px] font-medium text-[#F0C89B] border-l border-[#2C354A] pl-1.5 whitespace-nowrap">
                    +{(quote.meritItemsCount ?? 0) + (quote.partnerItemsCount ?? 0)}{' '}
                    {lang === 'bg' ? 'обков' : 'hw'}
                  </span>
                )}
              {quote && (quote.vitrineS02Count ?? 0) > 0 && (
                <span className="text-[10px] font-medium text-sky-300 border-l border-[#2C354A] pl-1.5 whitespace-nowrap">
                  {quote.vitrineS02Count} {lang === 'bg' ? 'витр.' : 'vitr.'}
                </span>
              )}
              <span className="hidden md:inline text-[10px] text-emerald-300/90 border-l border-[#2C354A] pl-2 whitespace-nowrap">
                {lang === 'bg' ? 'Монтаж: по договорка по телефон' : 'Install: by phone'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpenDemoGuide}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                demoVideoOpen
                  ? 'border-[#D49B62] bg-[#B47B44] text-white font-semibold'
                  : 'border-[#D49B62]/50 bg-[#141924] text-[#F3D1AA] hover:border-[#D49B62] hover:bg-[#B47B44]/20'
              }`}
              title={lang === 'bg' ? 'Пуснете гид на живо върху 3D сцената' : 'Run live 3D guide'}
            >
              <PlayCircle className="h-3.5 w-3.5 text-[#E6B88A]" />
              <span>{lang === 'bg' ? 'Демо видео' : 'Demo Video'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQcSent(false);
                setQcError(null);
                setQuickConsultOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-950/60 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:border-emerald-400 hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">
                {lang === 'bg' ? 'Консултация с майстор' : 'Master Consult'}
              </span>
            </button>

            <button
              type="button"
              onClick={openSaveModal}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#B47B44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#9E6835] transition-colors whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{lang === 'bg' ? 'Запази / Оферта' : 'Save / Quote'}</span>
            </button>

            {/* Window Caption Buttons */}
            <div className="flex items-center rounded-md border border-[#2C354A] bg-[#141924] overflow-hidden">
              <button
                type="button"
                onClick={handleWindowMinimize}
                title={windowMinimized ? 'Възстанови' : 'Минимизирай'}
                className="flex h-7 w-7 items-center justify-center text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleWindowResizeToggle}
                title={windowExpanded ? 'Компактен размер' : 'Уголеми прозореца'}
                className={`flex h-7 w-7 items-center justify-center transition-colors ${
                  windowExpanded && !isFullPage && !windowMinimized
                    ? 'bg-[#273147] text-[#E6B88A]'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isFullPage || windowExpanded ? (
                  <Copy className="h-3 w-3" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </button>
              <button
                type="button"
                onClick={handleToggleTrueFullScreen}
                title={isFullPage || nativeFullscreen ? 'Изход от цял екран' : 'Цял екран'}
                className={`flex h-7 w-7 items-center justify-center transition-colors ${
                  isFullPage || nativeFullscreen
                    ? 'bg-[#B47B44] text-white'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {isFullPage || nativeFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleWindowExit}
                title={lang === 'bg' ? 'Изход от студиото' : 'Exit Studio'}
                className="flex h-7 w-7 items-center justify-center text-zinc-300 hover:bg-red-600 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {importToast && (
        <div
          className={`px-4 py-1.5 text-xs font-medium flex items-center justify-between border-b ${
            importToast.type === 'ok'
              ? 'bg-emerald-950/90 border-emerald-700/60 text-emerald-100'
              : 'bg-rose-950/90 border-rose-700/60 text-rose-100'
          }`}
        >
          <span>{importToast.text}</span>
          <button
            type="button"
            onClick={() => setImportToast(null)}
            className="text-zinc-300 hover:text-white px-1.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Dropdown Category Folders (replaces permanent left sidebar) */}
      {!windowMinimized && (
        <StudioTopFolderMenu
          lang={lang}
          openFolder={openTopFolder}
          onChangeOpenFolder={setOpenTopFolder}
          config={config}
          decors={decors}
          hardwareTiers={hardwareTiers}
          meritItems={meritItems}
          partnerItems={partnerItems}
          partnerCategories={partnerCategories}
          selectedColumn={selectedColumn}
          quote={quote}
          defaultApplianceOwnership={defaultApplianceOwnership}
          onChangeApplianceOwnership={setDefaultApplianceOwnership}
          defaultDishwasherStyle={defaultDishwasherStyle}
          onChangeDishwasherStyle={setDefaultDishwasherStyle}
          onLoadRoomTemplate={handleLoadRoomTemplate}
          onAppendModuleToProject={handleAppendModuleToProject}
          onEmbedAppliance={handleEmbedAppliance}
          onAddApplianceModule={handleAddApplianceModule}
          onUpdateConfig={applyNormalized}
          onOpenQuickConsult={() => {
            setQcSent(false);
            setQcError(null);
            setQuickConsultOpen(true);
          }}
        />
      )}

      {/* Non-blocking Swap Mode Banner outside 3D canvas */}
      {!windowMinimized && swapSourceColId && (() => {
        const srcMainIdx = config.columns.findIndex((c) => c.id === swapSourceColId);
        const srcWingIdx = config.wingColumns.findIndex((c) => c.id === swapSourceColId);
        const srcLabel =
          srcMainIdx >= 0
            ? `#${srcMainIdx + 1}`
            : srcWingIdx >= 0
              ? `Г#${srcWingIdx + 1}`
              : '';
        return (
          <div className="border-b border-amber-500/40 bg-amber-950/85 px-3 py-1.5 text-xs text-amber-100 shrink-0">
            <div className="mx-auto max-w-[1680px] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span>
                  {lang === 'bg'
                    ? `Режим „Размени местата“: избран е Модул ${srcLabel}. Цъкнете върху друг шкаф (в 3D сцената, 2D чертежа или долната лента), за да размените позициите им.`
                    : `Swap mode active: Module ${srcLabel} selected. Click another cabinet (in 3D, 2D, or the bottom bay strip) to swap positions.`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSwapSourceColId(null)}
                className="rounded border border-amber-400/50 bg-amber-900/60 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-800 transition-colors"
              >
                {lang === 'bg' ? 'Отказ' : 'Cancel'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Full-Width 3D/2D Viewport + Side Live Demo Guide + On-Demand Right Cabinet Inspector */}
      {!windowMinimized && (
        <div
          style={
            !isFullPage && !nativeFullscreen && customHeightPx
              ? { height: `${customHeightPx}px` }
              : undefined
          }
          className={
            isFullPage || nativeFullscreen
              ? 'relative flex flex-col sm:flex-row flex-1 min-h-0 overflow-hidden'
              : customHeightPx
                ? 'relative flex flex-col sm:flex-row w-full overflow-hidden'
                : windowExpanded
                  ? 'relative flex flex-col sm:flex-row h-[80vh] min-h-[680px] w-full overflow-hidden'
                  : 'relative flex flex-col sm:flex-row h-[560px] sm:h-[640px] lg:h-[680px] w-full overflow-hidden'
          }
        >
          {/* LEFT LIVE DEMO GUIDE PANEL (outside 3D canvas, never covers 3D model) */}
          <StudioDemoVideoModal
            open={demoVideoOpen}
            lang={lang}
            stepIndex={demoStepIdx}
            playing={demoPlaying}
            onPrev={() => {
              setDemoPlaying(false);
              setDemoStepIdx((s) => Math.max(0, s - 1));
            }}
            onNext={() => {
              setDemoPlaying(false);
              setDemoStepIdx((s) => Math.min(LIVE_DEMO_STEPS.length - 1, s + 1));
            }}
            onTogglePlay={() => setDemoPlaying((p) => !p)}
            onRestart={() => {
              setDemoStepIdx(0);
              setDemoPlaying(true);
            }}
            onSelectStep={(idx) => {
              setDemoPlaying(false);
              setDemoStepIdx(idx);
            }}
            onClose={handleCloseDemoGuide}
          />

          {/* CENTER VIEWPORT (100% width when no inspector/guide open) */}
          <div className="relative flex-1 min-w-0 h-full overflow-hidden">
        {studioTab === 'templates' ? (
          <div className="h-full overflow-y-auto p-4 sm:p-6 bg-[#141821]">
            <div className="mx-auto max-w-[1360px] space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-white">
                    {lang === 'bg'
                      ? 'Каталог по стаи и категории модули'
                      : 'Room & Module Catalog'}
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-zinc-400">
                    {lang === 'bg'
                      ? 'Изберете стая или категория, коригирайте Ш/В/Д при нужда и заредете готов шаблон или добавете модула към текущия 3D проект.'
                      : 'Select a room category, adjust W/H/D if needed, and load a complete layout or append modules to your active 3D scene.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStudioTab('view3d')}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#D49B62]"
                >
                  {lang === 'bg' ? '← Обратно към 3D сцената' : '← Back to 3D Scene'}
                </button>
              </div>

              {/* Room / Category Folder Tabs */}
              <div className="flex flex-wrap gap-2 border-b border-[#252D3F] pb-3">
                {ROOM_CATALOG_GROUPS.map((grp) => {
                  const isActive = activeCatalogGroup === grp.id;
                  const isSubfolder = Boolean(grp.parentId);
                  return (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => setActiveCatalogGroup(grp.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? 'border-[#D49B62] bg-[#B47B44]/25 text-white font-semibold'
                          : isSubfolder
                            ? 'border-sky-500/35 bg-sky-950/30 text-sky-200 hover:border-sky-400'
                            : 'border-[#273045] bg-[#0F131C] text-zinc-300 hover:border-zinc-500 hover:text-white'
                      }`}
                    >
                      {isSubfolder && <FolderOpen className="h-3.5 w-3.5 text-sky-300 shrink-0" />}
                      <span>{lang === 'bg' ? grp.titleBg : grp.titleEn}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Folder Description + Sub-folder Prompt */}
              {(() => {
                const curGroup = ROOM_CATALOG_GROUPS.find((g) => g.id === activeCatalogGroup);
                if (!curGroup) return null;
                return (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#252D3F] bg-[#0E131C] px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {lang === 'bg' ? curGroup.titleBg : curGroup.titleEn}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {lang === 'bg' ? curGroup.subtitleBg : curGroup.subtitleEn}
                      </div>
                    </div>
                    {activeCatalogGroup === 'wardrobes' && (
                      <button
                        type="button"
                        onClick={() => setActiveCatalogGroup('wardrobes_interior')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-950/50 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-900/60"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>
                          {lang === 'bg'
                            ? 'Отвори папка „Вътрешно разпределение“ →'
                            : 'Open Interior Folder →'}
                        </span>
                      </button>
                    )}
                    {activeCatalogGroup === 'wardrobes_interior' && (
                      <button
                        type="button"
                        onClick={() => setActiveCatalogGroup('wardrobes')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#D49B62]"
                      >
                        <span>
                          {lang === 'bg'
                            ? '← Назад към Гардероби'
                            : '← Back to Wardrobes'}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Room Module & Template Cards with inline editable W/H/D */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ROOM_MODULE_LIBRARY.filter((tpl) => tpl.groupId === activeCatalogGroup).map((tpl) => {
                  const isActive = config.templateId === tpl.id;
                  const dims = catalogSizeOverrides[tpl.id] || {
                    w: tpl.config.widthCm,
                    h: tpl.config.heightCm,
                    d: tpl.config.depthCm,
                  };
                  const setDim = (key: 'w' | 'h' | 'd', val: number) => {
                    const clamped = Math.max(20, Math.min(480, Math.round(val || 60)));
                    setCatalogSizeOverrides((prev) => ({
                      ...prev,
                      [tpl.id]: { ...dims, [key]: clamped },
                    }));
                  };

                  return (
                    <div
                      key={tpl.id}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                        isActive
                          ? 'border-[#B47B44] bg-zinc-900'
                          : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-white leading-snug">
                            {lang === 'bg' ? tpl.titleBg : tpl.titleEn}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              tpl.canAddAsModule
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/35'
                                : 'bg-[#B47B44]/20 text-[#E2AC76] border border-[#B47B44]/40'
                            }`}
                          >
                            {tpl.canAddAsModule
                              ? lang === 'bg'
                                ? 'Модул'
                                : 'Module'
                              : lang === 'bg'
                                ? 'Композиция'
                                : 'Layout'}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-zinc-400">
                          {lang === 'bg' ? tpl.subtitleBg : tpl.subtitleEn}
                        </p>

                        {/* Editable Ш / В / Д Inputs right on the card */}
                        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/70 p-2">
                          <label className="block">
                            <span className="block text-[10px] text-zinc-400">
                              {lang === 'bg' ? 'Ш (см)' : 'W (cm)'}
                            </span>
                            <input
                              type="number"
                              min={25}
                              max={480}
                              step={5}
                              value={dims.w}
                              onChange={(e) => setDim('w', Number(e.target.value))}
                              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono-tabular text-xs text-white focus:border-[#B47B44] focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="block text-[10px] text-zinc-400">
                              {lang === 'bg' ? 'В (см)' : 'H (cm)'}
                            </span>
                            <input
                              type="number"
                              min={30}
                              max={275}
                              step={5}
                              value={dims.h}
                              onChange={(e) => setDim('h', Number(e.target.value))}
                              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono-tabular text-xs text-white focus:border-[#B47B44] focus:outline-none"
                            />
                          </label>
                          <label className="block">
                            <span className="block text-[10px] text-zinc-400">
                              {lang === 'bg' ? 'Д (см)' : 'D (cm)'}
                            </span>
                            <input
                              type="number"
                              min={20}
                              max={85}
                              step={2}
                              value={dims.d}
                              onChange={(e) => setDim('d', Number(e.target.value))}
                              className="mt-0.5 w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono-tabular text-xs text-white focus:border-[#B47B44] focus:outline-none"
                            />
                          </label>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadRoomTemplate(tpl)}
                          className="flex-1 rounded-lg bg-[#B47B44] px-3 py-2 text-xs font-semibold text-white hover:bg-[#9E6835] transition-colors whitespace-nowrap"
                        >
                          {lang === 'bg' ? 'Зареди шаблон' : 'Load Template'}
                        </button>
                        {tpl.canAddAsModule && (
                          <button
                            type="button"
                            onClick={() => handleAppendModuleToProject(tpl)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-500/45 bg-emerald-950/50 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/60 transition-colors whitespace-nowrap"
                            title={
                              lang === 'bg'
                                ? 'Добавя модула до текущите шкафове в 3D проекта'
                                : 'Append module alongside existing bays in project'
                            }
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>{lang === 'bg' ? 'Към проекта' : 'Add Bay'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <ProtectedViewport
            lang={lang}
            projectCode={activeProjectCode}
            userEmail={user?.email}
            isAdmin={isAdmin}
          >
            {studioTab === 'sketch2d' ? (
              <div className="relative h-full w-full">
                <Sketch2DEditor
                  lang={lang}
                  config={config}
                  decors={decors}
                  selectedColumnId={selectedColumn?.id ?? null}
                  onSelectColumn={handleSelectOrSwapColumn}
                  onUpdateSlotType={handleUpdateSlotType}
                  onSplitColumn={handleSplitColumn}
                  onSplitSlotVertically={handleSplitSlotVertically}
                  onExportDxf={
                    isAdmin
                      ? () => {
                          const dxf = generateFurnitureDxf(config, activeProjectCode);
                          const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${activeProjectCode || 'sk-mebeli'}-${AUTOCAD_3D_DXF_FILENAME}`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      : undefined
                  }
                />
              </div>
            ) : (
              <Configurator3D
                lang={lang}
                config={config}
                decors={decors}
                selectedColumnId={selectedColumn?.id ?? null}
                onSelectColumn={handleSelectOrSwapColumn}
                isolatedMode={isolatedMode}
                onToggleIsolate={() => setIsolatedMode((v) => !v)}
                allOpen={allOpen}
                onToggleAllOpen={() => setAllOpen((v) => !v)}
                seeInside={seeInside}
                lightingMode={lightingMode}
                cameraPresetTrigger={cameraPresetTrigger}
                onSelectCameraPreset={(p) => triggerCameraPreset(p)}
                isFullPage={isFullPage || nativeFullscreen}
                onToggleFullPage={handleToggleTrueFullScreen}
                showDimensions={showDimensions}
                onToggleDimensions={() => setShowDimensions((v) => !v)}
                measureMode={measureMode}
                onToggleMeasureMode={() => setMeasureMode((v) => !v)}
                centerTriggerSeq={centerTriggerSeq}
                clearMeasureTriggerSeq={clearMeasureTriggerSeq}
                panMode={panMode}
                panNudgeTrigger={panNudgeTrigger}
                swapModeActive={Boolean(swapSourceColId)}
                onMeasureReadoutChange={setMeasureReadout}
              />
            )}
          </ProtectedViewport>
        )}
          </div>

          {/* RIGHT INSPECTOR PANEL: Opens/updates when clicking any cabinet */}
          <StudioRightInspector
            lang={lang}
            open={rightInspectorOpen}
            onToggleOpen={() => setRightInspectorOpen((v) => !v)}
            config={config}
            selectedColumn={selectedColumn}
            selectedColIndex={selectedColIndex}
            selectedSlotIdx={selectedSlotIdx}
            onSelectSlotIdx={setSelectedSlotIdx}
            canDeleteSelectedColumn={canDeleteSelectedColumn}
            isolatedMode={isolatedMode}
            onToggleIsolate={() => setIsolatedMode((v) => !v)}
            onUpdateColumnWidth={handleUpdateColumnWidth}
            onUpdateColumnProps={handleUpdateColumnProps}
            onUpdateConfig={applyNormalized}
            onUpdateSlotType={handleUpdateSlotType}
            onToggleSlotVitrine={handleToggleSlotVitrine}
            onUpdateSlotProps={handleUpdateSlotProps}
            onArrangeDrawersPosition={handleArrangeDrawersPosition}
            onApplyTallColumnPreset={handleApplyTallColumnPreset}
            onSetTallTopCabinetMode={handleSetTallTopCabinetMode}
            onSetUpperBayType={handleSetUpperBayType}
            onSetShelvesCount={handleSetShelvesCount}
            onChangeShelfClearance={handleChangeShelfClearance}
            onSetDrawerCount={handleSetDrawerCount}
            onSetDrawerSlide={handleSetDrawerSlide}
            onUpdateDrawerDimensions={handleUpdateDrawerDimensions}
            onAddColumn={handleAddColumn}
            onSplitColumn={handleSplitColumn}
            onSplitSlotVertically={handleSplitSlotVertically}
            onRemoveColumn={handleRemoveColumn}
            canMoveLeft={canMoveSelectedLeft}
            canMoveRight={canMoveSelectedRight}
            canSwap={canSwapSelected}
            isSwapSource={Boolean(selectedColumn && swapSourceColId === selectedColumn.id)}
            onMoveColumn={handleMoveColumn}
            onToggleSwapMode={(colId) =>
              setSwapSourceColId((prev) => {
                const next = prev === colId ? null : colId;
                if (next) setIsolatedMode(false);
                return next;
              })
            }
            onCancelSwapMode={() => setSwapSourceColId(null)}
            getSlotShortLabel={getSlotShortLabel}
          />
        </div>
      )}

      {/* Bottom Camera Views, Pan Controls & CAD Bay Selector Strip (outside 3D scene) */}
      {!windowMinimized && (
        <div className="bg-[#0B0F17] border-t border-[#252D3F] shrink-0">
          {studioTab === 'view3d' && (
            <div className="border-b border-[#1B2232] bg-[#0E131E] px-3 py-1.5">
              <div className="mx-auto max-w-[1680px] flex flex-wrap items-center justify-between gap-2 text-xs">
                {/* Quick Camera Views */}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="hidden sm:inline text-[11px] font-medium text-zinc-400 mr-1">
                    {lang === 'bg' ? 'Изглед:' : 'View:'}
                  </span>
                  {(
                    [
                      { preset: 'iso', bg: 'Изометрия', en: 'Isometric' },
                      { preset: 'front', bg: 'Отпред', en: 'Front' },
                      { preset: 'back', bg: 'Отзад', en: 'Back' },
                      { preset: 'top', bg: 'Отгоре', en: 'Top' },
                      { preset: 'bottom', bg: 'Отдолу', en: 'Bottom' },
                    ] as const
                  ).map((item) => {
                    const isActive = activeCameraPreset === item.preset;
                    return (
                      <button
                        key={item.preset}
                        type="button"
                        onClick={() => triggerCameraPreset(item.preset)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'border-[#D49B62] bg-[#B47B44]/25 text-[#F7D7B2] font-semibold'
                            : 'border-[#252D3F] bg-[#141924] text-zinc-200 hover:border-[#D49B62]/60 hover:text-white'
                        }`}
                      >
                        {lang === 'bg' ? item.bg : item.en}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setStudioTab('view3d');
                      setActiveCameraPreset(null);
                      setCenterTriggerSeq((s) => s + 1);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[#252D3F] bg-[#141924] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-[#D49B62] hover:text-white transition-colors whitespace-nowrap"
                    title={lang === 'bg' ? 'Върни 3D модела в центъра' : 'Center View'}
                  >
                    <LocateFixed className="h-3.5 w-3.5 text-[#E6B88A]" />
                    <span>{lang === 'bg' ? 'Центрирай' : 'Center'}</span>
                  </button>
                </div>

                {/* Pan Left/Right Nudge & Pan Mode Toggle */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="hidden xl:inline text-[11px] text-zinc-400 mr-1">
                    {lang === 'bg'
                      ? 'Ляв бутон: въртене · Десен / 2 пръста: преместване'
                      : 'Left drag: orbit · Right / 2-finger: pan'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPanNudgeTrigger((prev) => ({ dx: -0.45, seq: (prev?.seq ?? 0) + 1 }))
                    }
                    className="inline-flex items-center justify-center rounded-md border border-[#252D3F] bg-[#141924] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-[#D49B62] hover:text-white transition-colors"
                    title={lang === 'bg' ? 'Премести камерата наляво' : 'Pan Left'}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPanMode((v) => {
                        const next = !v;
                        if (next) setMeasureMode(false);
                        return next;
                      });
                    }}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                      panMode
                        ? 'border-[#D49B62] bg-[#B47B44] text-white font-semibold'
                        : 'border-[#252D3F] bg-[#141924] text-zinc-200 hover:border-[#D49B62]/60 hover:text-white'
                    }`}
                    title={
                      lang === 'bg'
                        ? 'Режим преместване (влачете с ляв бутон/пръст наляво, надясно, нагоре, надолу)'
                        : 'Toggle Pan Mode (drag with left click / 1 finger to move)'
                    }
                  >
                    <Hand className="h-3.5 w-3.5" />
                    <span>{lang === 'bg' ? 'Преместване' : 'Pan'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPanNudgeTrigger((prev) => ({ dx: 0.45, seq: (prev?.seq ?? 0) + 1 }))
                    }
                    className="inline-flex items-center justify-center rounded-md border border-[#252D3F] bg-[#141924] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-[#D49B62] hover:text-white transition-colors"
                    title={lang === 'bg' ? 'Премести камерата надясно' : 'Pan Right'}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

        <div className="px-3 py-1.5">
        <div className="mx-auto max-w-[1680px] flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Left: Model / 2D / Templates View Switcher */}
          <div className="flex items-center gap-1 rounded bg-[#141924] p-0.5 border border-[#273045]">
            <button
              type="button"
              onClick={() => setStudioTab('view3d')}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                studioTab === 'view3d'
                  ? 'bg-[#2B3750] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {lang === 'bg' ? '3D Модел' : '3D Model'}
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('sketch2d')}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                studioTab === 'sketch2d'
                  ? 'bg-[#B47B44] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t(lang, 'studioMode2D')}
            </button>
            <button
              type="button"
              onClick={() => setStudioTab('templates')}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                studioTab === 'templates'
                  ? 'bg-[#B47B44] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t(lang, 'studioModeTemplates')}
            </button>
          </div>

          {/* Center: Clickable Cabinet Bays / Modules Strip */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => {
                setIsolatedMode(false);
                setStudioTab('view3d');
              }}
              className={`rounded px-2 py-1 text-[11px] transition-colors whitespace-nowrap ${
                !isolatedMode
                  ? 'bg-[#273147] text-[#E6B88A] font-semibold border border-[#B47B44]/50'
                  : 'bg-[#141924] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {lang === 'bg' ? 'Общ изглед' : 'Full View'}
            </button>

            {config.columns.map((col, idx) => {
              const active = selectedColumn?.id === col.id;
              const isSwapSrc = swapSourceColId === col.id;
              const isSwapTarget = Boolean(swapSourceColId && swapSourceColId !== col.id);
              const firstSlot = col.slots[0];
              const vitrineSlot = col.slots.find((sl) => isVitrineSlotType(sl.type));
              const drawerSlot = col.slots.find((sl) => isDrawerSlotType(sl.type));
              const displaySlot = vitrineSlot || drawerSlot || firstSlot;
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => handleSelectOrSwapColumn(col.id)}
                  className={`rounded px-2 py-1 text-[11px] font-mono-tabular transition-colors whitespace-nowrap border ${
                    isSwapSrc
                      ? 'border-amber-400 bg-[#B47B44] text-white font-semibold'
                      : isSwapTarget
                        ? 'border-amber-500/60 bg-amber-950/40 text-amber-100 hover:bg-[#B47B44]/40'
                        : active
                          ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                          : 'border-[#252D3F] bg-[#141924] text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  #{idx + 1} · {Math.round(col.widthCm * 10)}мм{' '}
                  {displaySlot ? `(${getSlotShortLabel(displaySlot, lang)})` : ''}
                </button>
              );
            })}

            {config.layoutShape === 'l_shape' &&
              config.wingColumns.map((col, idx) => {
                const active = selectedColumn?.id === col.id;
                const isSwapSrc = swapSourceColId === col.id;
                const isSwapTarget = Boolean(swapSourceColId && swapSourceColId !== col.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => handleSelectOrSwapColumn(col.id)}
                    className={`rounded px-2 py-1 text-[11px] font-mono-tabular transition-colors whitespace-nowrap border ${
                      isSwapSrc
                        ? 'border-amber-400 bg-[#B47B44] text-white font-semibold'
                        : isSwapTarget
                          ? 'border-amber-500/60 bg-amber-950/40 text-amber-100 hover:bg-[#B47B44]/40'
                          : active
                            ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                            : 'border-[#252D3F] bg-[#141924] text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    Г#{idx + 1} · {Math.round(col.widthCm * 10)}мм
                  </button>
                );
              })}

            {selectedColumn && totalRowModulesCount >= 2 && (
              <div className="flex items-center gap-1 pl-1.5 ml-1 border-l border-[#252D3F] shrink-0">
                <button
                  type="button"
                  disabled={!canMoveSelectedLeft}
                  onClick={() => handleMoveColumn(selectedColumn.id, 'left')}
                  className="inline-flex items-center gap-1 rounded border border-[#2C354A] bg-[#141924] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-[#D49B62] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
                  title={lang === 'bg' ? 'Премести маркирания шкаф наляво' : 'Move selected left'}
                >
                  <ArrowLeft className="h-3 w-3 text-[#E6B88A]" />
                  <span className="hidden md:inline">{lang === 'bg' ? 'Наляво' : 'Left'}</span>
                </button>
                <button
                  type="button"
                  disabled={!canMoveSelectedRight}
                  onClick={() => handleMoveColumn(selectedColumn.id, 'right')}
                  className="inline-flex items-center gap-1 rounded border border-[#2C354A] bg-[#141924] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-[#D49B62] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors whitespace-nowrap"
                  title={lang === 'bg' ? 'Премести маркирания шкаф надясно' : 'Move selected right'}
                >
                  <span className="hidden md:inline">{lang === 'bg' ? 'Надясно' : 'Right'}</span>
                  <ArrowRight className="h-3 w-3 text-[#E6B88A]" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSwapSourceColId((prev) => {
                      const next = prev === selectedColumn.id ? null : selectedColumn.id;
                      if (next) setIsolatedMode(false);
                      return next;
                    })
                  }
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    swapSourceColId
                      ? 'border-amber-400 bg-[#B47B44] text-white font-semibold'
                      : 'border-[#2C354A] bg-[#141924] text-amber-200 hover:border-[#D49B62]'
                  }`}
                  title={lang === 'bg' ? 'Размени местата с друг шкаф' : 'Swap with another cabinet'}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  <span>{lang === 'bg' ? 'Размени' : 'Swap'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: Quiet Technical Summary */}
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-zinc-400 font-mono-tabular">
            <span>
              {config.widthCm}×{config.heightCm}×
              {selectedColumn
                ? Number((getBayCarcassDepthMm(config, selectedColumn, false) / 10).toFixed(1))
                : config.depthCm}
              см
              {selectedColumn && columnHasVitrine(selectedColumn)
                ? lang === 'bg'
                  ? ' (проф.20мм)'
                  : ' (20mm)'
                : ''}
            </span>
            {config.category === 'kitchen' && (
              <>
                <span className="text-zinc-600">·</span>
                <span>
                  {lang === 'bg' ? 'Плот' : 'Top'} {config.countertopThicknessMm || 40}мм
                </span>
              </>
            )}
            <span className="text-zinc-600">·</span>
            <span>{counterDecor?.code || frontDecor?.code}</span>
          </div>
        </div>
        </div>
        </div>
      )}

      {/* Interactive Bottom Drag-to-Resize Handle (when in normal embedded window mode) */}
      {!windowMinimized && !isFullPage && !nativeFullscreen && (
        <div
          onPointerDown={handleStartHeightDrag}
          title={lang === 'bg' ? 'Плъзнете надолу/нагоре за оразмеряване на прозореца' : 'Drag to resize studio height'}
          className="h-2 w-full cursor-ns-resize bg-[#0B0F17] border-t border-[#1E2636] hover:bg-[#B47B44]/40 transition-colors flex items-center justify-center"
        >
          <span className="h-0.5 w-12 rounded-full bg-zinc-600" />
        </div>
      )}

      {/* Save Project & Complete 3-Part Quote Package Email Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-2xl font-semibold text-white">
                  {quotePackageResult
                    ? lang === 'bg'
                      ? 'Пакетът за оферта е подготвен'
                      : 'Quote Package Ready'
                    : t(lang, 'inquiryModalTitle')}
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  {t(lang, 'projectCodeLabel')}:{' '}
                  <span className="font-mono-tabular font-semibold text-[#D49B62]">
                    {quotePackageResult?.projectCode || activeProjectCode}
                  </span>{' '}
                  · {(quotePackageResult?.totalPriceEur ?? quote?.totalPriceEur ?? 0).toLocaleString('bg-BG')} €
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                ✕
              </button>
            </div>

            {quotePackageResult ? (
              <div className="mt-4 space-y-4">
                <div
                  className={`rounded-lg border px-4 py-3 text-xs leading-relaxed ${
                    quotePackageResult.deliveryMode === 'mailto'
                      ? 'border-amber-500/45 bg-amber-950/45 text-amber-100'
                      : 'border-emerald-500/45 bg-emerald-950/45 text-emerald-100'
                  }`}
                >
                  {quotePackageResult.deliveryMode === 'mailto' ? (
                    <div className="space-y-1.5">
                      <div className="font-semibold text-amber-300">
                        {lang === 'bg'
                          ? `Готово! Свалихме двата файла (${quotePackageResult.dxfFilename} и ${quotePackageResult.jsonFilename}) и отворихме писмото до ${quotePackageResult.recipientEmail}.`
                          : `Done! Downloaded both files and opened your email client to ${quotePackageResult.recipientEmail}.`}
                      </div>
                      <p className="text-amber-100/90">
                        {lang === 'bg'
                          ? `Моля, прикачете двата свалени файла (${quotePackageResult.dxfFilename} и ${quotePackageResult.jsonFilename}) към отворения имейл до ${quotePackageResult.recipientEmail} и натиснете „Изпрати“. Проектът и пълният списък с обкова (BOM) са записани и в системата на „СК МЕБЕЛИ“.`
                          : `Please attach both downloaded files (${quotePackageResult.dxfFilename} and ${quotePackageResult.jsonFilename}) to the opened email and click Send.`}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="font-semibold text-emerald-300">
                        {lang === 'bg'
                          ? `Запитването е изпратено успешно до ${quotePackageResult.recipientEmail}!`
                          : `Inquiry sent successfully to ${quotePackageResult.recipientEmail}!`}
                      </div>
                      <p>
                        {lang === 'bg'
                          ? `Към имейла са прикачени директно 3D чертежът (${quotePackageResult.dxfFilename}), 3D проектът (${quotePackageResult.jsonFilename}) и пълният списък с обкова и уредите (BOM).`
                          : 'Attached: AutoCAD 3D DXF, Proekt_3D.json, and complete BOM.'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-3.5 space-y-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {lang === 'bg'
                      ? 'Включени файлове и данни в пакета:'
                      : 'Included package files & specification:'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        triggerBrowserFileDownload(
                          quotePackageResult.dxfFilename,
                          quotePackageResult.dxfContent,
                          'application/dxf;charset=utf-8;',
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-100 hover:border-[#D49B62]"
                    >
                      <Download className="h-3.5 w-3.5 text-[#D49B62]" />
                      <span>{quotePackageResult.dxfFilename} (3D мм)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        triggerBrowserFileDownload(
                          quotePackageResult.jsonFilename,
                          quotePackageResult.projectJsonContent,
                          'application/json;charset=utf-8;',
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-100 hover:border-[#D49B62]"
                    >
                      <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{quotePackageResult.jsonFilename} (3D)</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {quotePackageResult.deliveryMode === 'mailto' && (
                      <button
                        type="button"
                        onClick={() =>
                          triggerMailtoClient(
                            quotePackageResult.recipientEmail,
                            quotePackageResult.subject,
                            quotePackageResult.mailtoBody,
                          )
                        }
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#B47B44] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#9E6835]"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>
                          {lang === 'bg'
                            ? `Отвори имейл до ${quotePackageResult.recipientEmail}`
                            : `Open email to ${quotePackageResult.recipientEmail}`}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(quotePackageResult.fullReportText);
                        setBomCopied(true);
                        window.setTimeout(() => setBomCopied(false), 2500);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-100 hover:border-zinc-500"
                    >
                      {bomCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {bomCopied
                          ? lang === 'bg'
                            ? 'Копирано!'
                            : 'Copied!'
                          : lang === 'bg'
                            ? 'Копирай пълния BOM'
                            : 'Copy Full BOM'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    {lang === 'bg' ? 'Затвори' : 'Close'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 text-xs leading-relaxed text-zinc-300">
                  {lang === 'bg'
                    ? 'При изпращане автоматично се генерират и изпращат към мебелния цех (mebelikolev71@gmail.com): AutoCAD 3D чертеж (.dxf в мм), файлът на 3D проекта (.json) и подробният списък с обкова и уредите.'
                    : t(lang, 'inquiryHint')}
                </p>

                {quote && (
                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-[11px] text-zinc-300 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">{lang === 'bg' ? 'Обслужвана зона:' : 'Service zone:'}</span>
                      <span>{lang === 'bg' ? quote.serviceZoneBg : quote.serviceZoneEn}</span>
                    </div>
                    {quote.measurementFeeEur > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{lang === 'bg' ? 'Оглед и взимане на размери:' : 'On-site measurement:'}</span>
                        <span className="font-mono-tabular text-[#D49B62]">{quote.measurementFeeEur} €</span>
                      </div>
                    )}
                  </div>
                )}

                {quote?.belowMinOrder && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2.5 text-xs text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>
                      {lang === 'bg'
                        ? `Минималната стойност за поръчка е ${quote.minOrderEur} €. Можете да запазите проекта като чернова или да добавите още модули.`
                        : `Minimum order value is ${quote.minOrderEur} €. You can still save as a draft or add more modules.`}
                    </span>
                  </div>
                )}

                {!user && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-xs">
                    <span className="text-zinc-300">
                      {lang === 'bg'
                        ? 'Искате проектът да се пази и във вашия профил?'
                        : 'Want to save drafts in your Google profile?'}
                    </span>
                    <button
                      type="button"
                      onClick={onSignInGoogle}
                      className="inline-flex items-center justify-center rounded-md border border-[#D49B62]/60 bg-[#B47B44]/20 px-3 py-1 text-[11px] font-semibold text-[#F7D7B2] hover:bg-[#B47B44]/35"
                    >
                      {t(lang, 'signInGoogle')}
                    </button>
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {!user && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">
                          {lang === 'bg' ? 'Вашето име *' : 'Your Name *'}
                        </label>
                        <input
                          type="text"
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          placeholder={lang === 'bg' ? 'Иван Петров' : 'Full name'}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#B47B44] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-400 mb-1">
                          {lang === 'bg' ? 'Вашият имейл' : 'Your Email'}
                        </label>
                        <input
                          type="email"
                          value={guestEmail}
                          onChange={(e) => setGuestEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#B47B44] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        {t(lang, 'projectTitleLabel')}
                      </label>
                      <input
                        type="text"
                        value={projectTitle}
                        onChange={(e) => setProjectTitle(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#B47B44] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">
                        {!user
                          ? lang === 'bg'
                            ? 'Телефон за връзка *'
                            : 'Phone Number *'
                          : t(lang, 'yourPhone')}
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="+359 88..."
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#B47B44] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">
                      {lang === 'bg'
                        ? 'Вашите въпроси или уточнения (текстов формат)'
                        : 'Questions or Custom Notes'}
                    </label>
                    <textarea
                      rows={3}
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      placeholder={t(lang, 'questionPlaceholder')}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#B47B44] focus:outline-none"
                    />
                  </div>

                  {saveError && (
                    <div className="rounded-md bg-red-950/60 border border-red-800 px-3 py-2 text-xs text-red-200">
                      {saveError}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <button
                      type="button"
                      disabled={saving || Boolean(quote?.belowMinOrder)}
                      onClick={() => handleSaveProject(true)}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#B47B44] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#9E6835] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="h-4 w-4" />
                      <span>
                        {saving
                          ? lang === 'bg'
                            ? 'Генериране на 3D пакет...'
                            : 'Preparing 3D package...'
                          : lang === 'bg'
                            ? 'Изпрати пакет (3D + DXF + BOM)'
                            : t(lang, 'submitInquiry')}
                      </span>
                    </button>
                    {user && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSaveProject(false)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
                      >
                        <Bookmark className="h-3.5 w-3.5" />
                        <span>{t(lang, 'saveDraftOnly')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick Master Consultation Modal (No Google Sign-In Required) */}
      {quickConsultOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                  <Phone className="h-5 w-5 text-emerald-400" />
                  <span>
                    {lang === 'bg'
                      ? 'Бърза заявка за консултация от майстор'
                      : 'Quick Master Consultation'}
                  </span>
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  {lang === 'bg'
                    ? 'Без регистрация. Автоматично прилагаме размерите, материалите и код '
                    : 'No login needed. Automatically attaches specs & code '}
                  <span className="font-mono-tabular font-semibold text-[#D49B62]">
                    {activeProjectCode}
                  </span>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickConsultOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-[11px] text-zinc-300 flex flex-wrap items-center justify-between gap-2">
              <span>
                {config.widthCm}×{config.heightCm}×{config.depthCm} см ·{' '}
                {getNeutralHardwareTierInfo(selectedHwTier, lang).badge} ·{' '}
                {(config.edgeBandingType || 'eva').toUpperCase()}
              </span>
              <span className="font-mono-tabular font-semibold text-[#E2AC76]">
                {(quote?.totalPriceEur ?? 0).toLocaleString('bg-BG')} €
              </span>
            </div>

            {qcSent ? (
              <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-5 text-center space-y-3">
                <Check className="h-8 w-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-semibold text-white">
                  {lang === 'bg'
                    ? 'Заявката е изпратена успешно!'
                    : 'Consultation request sent!'}
                </div>
                <p className="text-xs text-zinc-300">
                  {lang === 'bg'
                    ? 'Наш майстор от Пловдив ще разгледа чертежа Ви и ще Ви се обади за безплатна консултация.'
                    : 'Our master carpenter will review your project specs and call you back.'}
                </p>
                <button
                  type="button"
                  onClick={() => setQuickConsultOpen(false)}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  {lang === 'bg' ? 'Обратно към 3D студиото' : 'Back to Studio'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendQuickConsult} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    {lang === 'bg' ? 'Вашето име *' : 'Your Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={qcName}
                    onChange={(e) => setQcName(e.target.value)}
                    placeholder={lang === 'bg' ? 'Напр. Иван Петров' : 'John Doe'}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    {lang === 'bg' ? 'Телефон за връзка *' : 'Phone Number *'}
                  </label>
                  <input
                    type="tel"
                    required
                    value={qcPhone}
                    onChange={(e) => setQcPhone(e.target.value)}
                    placeholder="+359 88..."
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">
                    {lang === 'bg' ? 'Кратък въпрос или адрес в Пловдив' : 'Short question or note'}
                  </label>
                  <textarea
                    rows={3}
                    value={qcNote}
                    onChange={(e) => setQcNote(e.target.value)}
                    placeholder={
                      lang === 'bg'
                        ? 'Напр. Може ли оглед на място и точен разкрой?'
                        : 'Any question for the carpenter...'
                    }
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                {qcError && (
                  <div className="rounded-md bg-red-950/60 border border-red-800 px-3 py-2 text-xs text-red-200">
                    {qcError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={qcSending || !qcName.trim() || !qcPhone.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span>
                    {qcSending
                      ? lang === 'bg'
                        ? 'Изпращане...'
                        : 'Sending...'
                      : lang === 'bg'
                        ? 'Изпрати заявка за консултация'
                        : 'Send Consultation Request'}
                  </span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* New Project Confirmation Modal */}
      {newProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                  <FilePlus2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-white">
                    {lang === 'bg' ? 'Създаване на нов проект?' : 'Start a New Project?'}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    {lang === 'bg' ? 'Потвърждение за изчистване' : 'Reset confirmation'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewProjectModalOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-950/35 px-3.5 py-3 text-xs text-amber-100 leading-relaxed">
              {lang === 'bg'
                ? 'Текущият несъхранен проект, модулите и историята в 3D студиото ще бъдат изчистени и ще започнете начисто с нов проектен код.'
                : 'Your current unsaved project configuration and undo history will be cleared and a fresh project code will be created.'}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewProjectModalOpen(false)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500"
              >
                {lang === 'bg' ? 'Отказ' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmNewProject}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#B47B44] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9E6835]"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Изчисти и започни нов' : 'Clear & Start New'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
