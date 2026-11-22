import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Box,
  ChevronDown,
  Droplets,
  Flame,
  Lightbulb,
  Minus,
  Package,
  Palette,
  Phone,
  Plus,
  Search,
  Shirt,
  Sofa,
  UtensilsCrossed,
  Wrench,
  X,
} from 'lucide-react';
import {
  ROOM_MODULE_LIBRARY,
  RoomModuleTemplate,
} from '../data/catalogDefaults';
import { MERIT_CATEGORIES } from '../data/meritCatalogDefaults';
import {
  getNeutralHardwareTierInfo,
  inferQualityClass,
  sanitizeClientText,
} from '../lib/brandSanitizer';
import { t } from '../lib/i18n';
import {
  ApplianceOwnership,
  BacksplashThicknessMm,
  BoardDecor,
  ColumnConfig,
  CountertopThicknessMm,
  DishwasherFrontStyle,
  FurnitureConfig,
  HandleStyle,
  HardwareTier,
  Language,
  MeritCatalogItem,
  PartnerCatalogItem,
  PartnerCategoryDef,
  PartnerVendorId,
  QualityClass,
  QuoteResponse,
  SlotType,
  UpperBayType,
  UpperProfileStyle,
} from '../types/furniture';

export type TopFolderId =
  | 'kitchen_base'
  | 'kitchen_upper_tall'
  | 'wardrobes'
  | 'hallway'
  | 'living_tv'
  | 'appliances'
  | 'materials';

type DecorTarget = 'front' | 'carcass' | 'countertop' | 'backsplash';
type DecorSurfaceFilter = 'ALL' | 'wood' | 'matte' | 'stone' | 'gloss' | 'mdf';

interface UnifiedClientCatalogItem {
  key: string;
  id: string;
  source: 'merit' | 'partner';
  partnerVendor?: PartnerVendorId;
  categoryId: string;
  cleanName: string;
  cleanSize: string;
  cleanFeature: string;
  qualityClass: QualityClass;
  unit: string;
  priceEur: number;
}

interface StudioTopFolderMenuProps {
  lang: Language;
  openFolder: TopFolderId | null;
  onChangeOpenFolder: (folder: TopFolderId | null) => void;
  config: FurnitureConfig;
  decors: BoardDecor[];
  hardwareTiers: HardwareTier[];
  meritItems?: MeritCatalogItem[];
  partnerItems?: PartnerCatalogItem[];
  partnerCategories?: PartnerCategoryDef[];
  selectedColumn: ColumnConfig | null;
  quote: QuoteResponse | null;
  defaultApplianceOwnership: ApplianceOwnership;
  onChangeApplianceOwnership: (own: ApplianceOwnership) => void;
  defaultDishwasherStyle: DishwasherFrontStyle;
  onChangeDishwasherStyle: (st: DishwasherFrontStyle) => void;
  onLoadRoomTemplate: (tpl: RoomModuleTemplate) => void;
  onAppendModuleToProject: (tpl: RoomModuleTemplate) => void;
  onEmbedAppliance: (
    slotType: SlotType,
    opts?: {
      tallKind?: 'fridge_top' | 'fridge_no_top' | 'oven_mw';
      upperType?: UpperBayType;
      dishwasherStyle?: DishwasherFrontStyle;
    },
  ) => void;
  onAddApplianceModule: (
    slotType: SlotType,
    opts?: {
      widthCm?: number;
      heightCm?: number;
      tallKind?: 'fridge_top' | 'fridge_no_top' | 'oven_mw';
      dishwasherStyle?: DishwasherFrontStyle;
    },
  ) => void;
  onUpdateConfig: (next: FurnitureConfig) => void;
  onOpenQuickConsult: () => void;
}

const QUALITY_CLASS_LABELS: Record<QualityClass, { bg: string; en: string }> = {
  high: { bg: 'Висок клас', en: 'High Class' },
  medium: { bg: 'Среден клас', en: 'Medium Class' },
  low: { bg: 'Нисък клас', en: 'Economy Class' },
};

export const StudioTopFolderMenu: React.FC<StudioTopFolderMenuProps> = ({
  lang,
  openFolder,
  onChangeOpenFolder,
  config,
  decors,
  hardwareTiers,
  meritItems = [],
  partnerItems = [],
  partnerCategories = [],
  selectedColumn,
  quote,
  defaultApplianceOwnership,
  onChangeApplianceOwnership,
  defaultDishwasherStyle,
  onChangeDishwasherStyle,
  onLoadRoomTemplate,
  onAppendModuleToProject,
  onEmbedAppliance,
  onAddApplianceModule,
  onUpdateConfig,
  onOpenQuickConsult,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [wardrobeSubTab, setWardrobeSubTab] = useState<'wardrobes' | 'wardrobes_interior'>('wardrobes');
  const [decorTarget, setDecorTarget] = useState<DecorTarget>('front');
  const [decorSurfaceFilter, setDecorSurfaceFilter] = useState<DecorSurfaceFilter>('ALL');
  const [decorSearch, setDecorSearch] = useState('');
  const [partnerQualityFilter, setPartnerQualityFilter] = useState<QualityClass | 'ALL'>('ALL');
  const [partnerCategoryFilter, setPartnerCategoryFilter] = useState<string>('ALL');
  const [partnerSearch, setPartnerSearch] = useState('');

  // Auto-close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!openFolder) return;
    const handlePointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-demo-guide="true"]')) {
        return;
      }
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onChangeOpenFolder(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onChangeOpenFolder(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openFolder, onChangeOpenFolder]);

  const folders: Array<{
    id: TopFolderId;
    labelBg: string;
    labelEn: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'kitchen_base',
      labelBg: 'Кухня — Долни',
      labelEn: 'Kitchen — Base',
      Icon: UtensilsCrossed,
    },
    {
      id: 'kitchen_upper_tall',
      labelBg: 'Кухня — Горни и колони',
      labelEn: 'Kitchen — Upper & Columns',
      Icon: Box,
    },
    {
      id: 'wardrobes',
      labelBg: 'Гардероби',
      labelEn: 'Wardrobes',
      Icon: Shirt,
    },
    {
      id: 'hallway',
      labelBg: 'Антре',
      labelEn: 'Hallway',
      Icon: Archive,
    },
    {
      id: 'living_tv',
      labelBg: 'ТВ модули',
      labelEn: 'TV Units',
      Icon: Sofa,
    },
    {
      id: 'appliances',
      labelBg: 'Уреди',
      labelEn: 'Appliances',
      Icon: Flame,
    },
    {
      id: 'materials',
      labelBg: 'Материали и обков',
      labelEn: 'Materials & Hardware',
      Icon: Palette,
    },
  ];

  const filteredDecors = useMemo(() => {
    return decors.filter((d) => {
      if (!d.active) return false;
      if (decorSurfaceFilter !== 'ALL') {
        if (decorSurfaceFilter === 'mdf') {
          if (d.materialType !== 'MDF' && d.manufacturer !== 'MDF') return false;
        } else if (d.category !== decorSurfaceFilter) {
          return false;
        }
      }
      if (decorSearch.trim()) {
        const q = decorSearch.toLowerCase();
        return (
          d.code.toLowerCase().includes(q) ||
          d.nameBg.toLowerCase().includes(q) ||
          d.nameEn.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [decors, decorSurfaceFilter, decorSearch]);

  const activeDecorId =
    decorTarget === 'carcass'
      ? config.carcassDecorId
      : decorTarget === 'countertop'
        ? config.countertopDecorId
        : decorTarget === 'backsplash'
          ? config.backsplashDecorId || config.countertopDecorId
          : config.frontDecorId;

  const handleSelectDecor = (decorId: string) => {
    if (decorTarget === 'carcass') {
      onUpdateConfig({ ...config, carcassDecorId: decorId });
    } else if (decorTarget === 'countertop') {
      onUpdateConfig({ ...config, countertopDecorId: decorId });
    } else if (decorTarget === 'backsplash') {
      onUpdateConfig({ ...config, backsplashDecorId: decorId });
    } else {
      onUpdateConfig({ ...config, frontDecorId: decorId });
    }
  };

  const activeTemplateGroup =
    openFolder === 'wardrobes' ? wardrobeSubTab : openFolder;

  const visibleModules =
    !openFolder || openFolder === 'appliances' || openFolder === 'materials'
      ? []
      : ROOM_MODULE_LIBRARY.filter((tpl) => tpl.groupId === activeTemplateGroup);

  // Client-facing unified catalog:
  // - Automatically hides 0 EUR and inactive items
  // - Never exposes supplier/store names, websites, or hardware brand labels
  const unifiedCatalogItems = useMemo<UnifiedClientCatalogItem[]>(() => {
    const fromMerit: UnifiedClientCatalogItem[] = meritItems
      .filter((it) => it.active !== false && Number(it.priceEur || 0) > 0)
      .map((it) => ({
        key: `merit:${it.id}`,
        id: it.id,
        source: 'merit',
        categoryId: it.categoryId,
        cleanName: sanitizeClientText(it.name) || it.name,
        cleanSize: sanitizeClientText(it.sizeLabel),
        cleanFeature: sanitizeClientText(it.featureLabel),
        qualityClass: inferQualityClass(undefined, it.brandLevel),
        unit: it.unit,
        priceEur: Number(it.priceEur || 0),
      }));

    const fromPartner: UnifiedClientCatalogItem[] = partnerItems
      .filter((it) => it.active !== false && Number(it.priceEur || 0) > 0)
      .map((it) => ({
        key: `${it.vendor}:${it.id}`,
        id: it.id,
        source: 'partner',
        partnerVendor: it.vendor,
        categoryId: it.categoryId,
        cleanName: sanitizeClientText(it.name) || it.name,
        cleanSize: sanitizeClientText(it.sizeLabel),
        cleanFeature: sanitizeClientText(it.featureLabel),
        qualityClass: inferQualityClass(it.qualityClass, it.brandLevel),
        unit: it.unit,
        priceEur: Number(it.priceEur || 0),
      }));

    return [...fromMerit, ...fromPartner];
  }, [meritItems, partnerItems]);

  const meritItemMap = useMemo(
    () =>
      new Map(
        unifiedCatalogItems.filter((it) => it.source === 'merit').map((it) => [it.id, it]),
      ),
    [unifiedCatalogItems],
  );

  const partnerItemMap = useMemo(
    () =>
      new Map(
        unifiedCatalogItems.filter((it) => it.source === 'partner').map((it) => [it.id, it]),
      ),
    [unifiedCatalogItems],
  );

  const unifiedNeutralCategories = useMemo(() => {
    const rawCats = [
      ...MERIT_CATEGORIES.map((c) => ({ id: c.id, nameBg: c.nameBg, nameEn: c.nameEn })),
      ...partnerCategories.map((c) => ({ id: c.id, nameBg: c.nameBg, nameEn: c.nameEn })),
    ];
    const seen = new Set<string>();
    return rawCats
      .filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return unifiedCatalogItems.some((it) => it.categoryId === c.id);
      })
      .map((c) => ({
        id: c.id,
        nameBg: sanitizeClientText(c.nameBg) || c.nameBg,
        nameEn: sanitizeClientText(c.nameEn) || c.nameEn,
      }));
  }, [partnerCategories, unifiedCatalogItems]);

  const filteredUnifiedItems = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    return unifiedCatalogItems.filter((it) => {
      if (partnerQualityFilter !== 'ALL' && it.qualityClass !== partnerQualityFilter) return false;
      if (partnerCategoryFilter !== 'ALL' && it.categoryId !== partnerCategoryFilter) return false;
      if (q) {
        return (
          it.cleanName.toLowerCase().includes(q) ||
          it.cleanSize.toLowerCase().includes(q) ||
          it.cleanFeature.toLowerCase().includes(q) ||
          QUALITY_CLASS_LABELS[it.qualityClass][lang].toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [unifiedCatalogItems, partnerQualityFilter, partnerCategoryFilter, partnerSearch, lang]);

  const selectedMeritEntries = config.selectedMeritItems || [];
  const selectedPartnerEntries = config.selectedPartnerItems || [];

  const handleAddCatalogItem = (item: UnifiedClientCatalogItem) => {
    if (item.source === 'merit') {
      const prev = config.selectedMeritItems || [];
      const existing = prev.find((e) => e.itemId === item.id);
      const next = existing
        ? prev.map((e) => (e.itemId === item.id ? { ...e, quantity: e.quantity + 1 } : e))
        : [...prev, { itemId: item.id, quantity: 1 }];
      onUpdateConfig({ ...config, selectedMeritItems: next });
      return;
    }
    const vendor = item.partnerVendor || 'galplas';
    const prev = config.selectedPartnerItems || [];
    const existing = prev.find((e) => e.itemId === item.id);
    const next = existing
      ? prev.map((e) => (e.itemId === item.id ? { ...e, quantity: e.quantity + 1 } : e))
      : [...prev, { itemId: item.id, vendor, quantity: 1 }];
    onUpdateConfig({ ...config, selectedPartnerItems: next });
  };

  const handleUpdateCatalogQty = (
    source: 'merit' | 'partner',
    itemId: string,
    delta: number,
  ) => {
    if (source === 'merit') {
      const prev = config.selectedMeritItems || [];
      const next = prev
        .map((e) => (e.itemId === itemId ? { ...e, quantity: e.quantity + delta } : e))
        .filter((e) => e.quantity > 0);
      onUpdateConfig({ ...config, selectedMeritItems: next });
      return;
    }
    const prev = config.selectedPartnerItems || [];
    const next = prev
      .map((e) => (e.itemId === itemId ? { ...e, quantity: e.quantity + delta } : e))
      .filter((e) => e.quantity > 0);
    onUpdateConfig({ ...config, selectedPartnerItems: next });
  };

  const totalExtraSelectedCount =
    selectedMeritEntries.reduce((s, e) => s + e.quantity, 0) +
    selectedPartnerEntries.reduce((s, e) => s + e.quantity, 0);

  const totalExtraHardwareEur =
    (quote?.meritItemsTotalEur ?? 0) + (quote?.partnerItemsTotalEur ?? 0);

  const activeFolderMeta = folders.find((f) => f.id === openFolder);

  return (
    <div ref={wrapperRef} className="relative bg-[#0E131D] border-b border-[#252D3F] px-3 py-1.5 z-30">
      {/* 7 Top Folder Buttons */}
      <div className="mx-auto max-w-[1720px] flex items-center gap-1.5 overflow-x-auto">
        {folders.map(({ id, labelBg, labelEn, Icon }) => {
          const isOpen = openFolder === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChangeOpenFolder(isOpen ? null : id)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isOpen
                  ? 'border-[#D49B62] bg-[#B47B44]/25 text-white font-semibold shadow-sm'
                  : 'border-[#252D3F] bg-[#141A26] text-zinc-200 hover:border-[#B47B44]/60 hover:text-white'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${isOpen ? 'text-[#E6B88A]' : 'text-zinc-400'}`} />
              <span>{lang === 'bg' ? labelBg : labelEn}</span>
              <ChevronDown
                className={`h-3 w-3 shrink-0 transition-transform ${
                  isOpen ? 'rotate-180 text-[#E6B88A]' : 'text-zinc-500'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Compact Dropdown Popover Under Top Bar */}
      {openFolder && (
        <div
          className={`absolute top-full mt-1.5 z-40 rounded-xl border border-[#2C354A] bg-[#101520]/98 shadow-2xl backdrop-blur-md flex flex-col max-h-[72vh] ${
            openFolder === 'materials' || openFolder === 'appliances'
              ? 'left-3 right-3 sm:left-auto sm:right-6 sm:w-[440px]'
              : 'left-3 right-3 sm:right-auto sm:w-[520px] md:w-[600px]'
          }`}
        >
          {/* Dropdown Header */}
          <div className="flex items-center justify-between gap-2 border-b border-[#252D3F] bg-[#0B0F17] px-3.5 py-2 rounded-t-xl shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              {activeFolderMeta && <activeFolderMeta.Icon className="h-4 w-4 text-[#D49B62]" />}
              <span>{activeFolderMeta ? (lang === 'bg' ? activeFolderMeta.labelBg : activeFolderMeta.labelEn) : ''}</span>
            </div>
            <button
              type="button"
              onClick={() => onChangeOpenFolder(null)}
              title={lang === 'bg' ? 'Затвори' : 'Close'}
              className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Dropdown Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Wardrobe Interior Sub-folder Switcher */}
            {openFolder === 'wardrobes' && (
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-[#252D3F] bg-[#0B0F17] p-1">
                <button
                  type="button"
                  onClick={() => setWardrobeSubTab('wardrobes')}
                  className={`rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                    wardrobeSubTab === 'wardrobes'
                      ? 'bg-[#B47B44] text-white font-semibold'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {lang === 'bg' ? 'Гардероби' : 'Wardrobes'}
                </button>
                <button
                  type="button"
                  onClick={() => setWardrobeSubTab('wardrobes_interior')}
                  className={`rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                    wardrobeSubTab === 'wardrobes_interior'
                      ? 'bg-sky-700 text-white font-semibold'
                      : 'text-sky-200 hover:bg-sky-950/60'
                  }`}
                >
                  {lang === 'bg' ? 'Вътрешно разпределение' : 'Interior Modules'}
                </button>
              </div>
            )}

            {/* Template / Module Cards (2 columns on desktop inside popover, auto-closes on click) */}
            {visibleModules.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {visibleModules.map((tpl) => {
                  const isActive = config.templateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      className={`flex flex-col justify-between rounded-xl border p-2.5 transition-colors ${
                        isActive
                          ? 'border-[#D49B62] bg-[#192030]'
                          : 'border-[#252D3F] bg-[#141A26] hover:border-zinc-600'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-white leading-snug">
                            {lang === 'bg' ? tpl.titleBg : tpl.titleEn}
                          </span>
                          <span className="shrink-0 rounded bg-[#0B0F17] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[#E6B88A] border border-[#2A3347]">
                            {tpl.config.widthCm * 10}×{tpl.config.heightCm * 10}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-400 leading-snug">
                          {lang === 'bg' ? tpl.subtitleBg : tpl.subtitleEn}
                        </p>
                      </div>
                      <div className="mt-2.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadRoomTemplate(tpl);
                            onChangeOpenFolder(null);
                          }}
                          className="flex-1 rounded-md bg-[#B47B44] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#9E6835] transition-colors"
                        >
                          {lang === 'bg' ? 'Зареди' : 'Load'}
                        </button>
                        {tpl.canAddAsModule && (
                          <button
                            type="button"
                            onClick={() => {
                              onAppendModuleToProject(tpl);
                              onChangeOpenFolder(null);
                            }}
                            className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-500/45 bg-emerald-950/50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900/70 transition-colors"
                            title={
                              lang === 'bg'
                                ? 'Добавя модула до текущите шкафове'
                                : 'Append module to project'
                            }
                          >
                            <Plus className="h-3 w-3" />
                            <span>{lang === 'bg' ? 'Добави' : 'Add'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* FOLDER: APPLIANCES */}
            {openFolder === 'appliances' && (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-[#252D3F] bg-[#0D121C] p-2.5 space-y-2">
                  <label className="flex items-center justify-between gap-2 text-xs text-zinc-200 cursor-pointer">
                    <span className="font-medium">
                      {lang === 'bg' ? 'Уредът е от клиента (само ниша)' : 'Client-Supplied Appliance'}
                    </span>
                    <input
                      type="checkbox"
                      checked={defaultApplianceOwnership === 'client'}
                      onChange={(e) =>
                        onChangeApplianceOwnership(e.target.checked ? 'client' : 'included')
                      }
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#20283A] text-[11px]">
                    <span className="text-zinc-400">
                      {lang === 'bg' ? 'Съдомиялна:' : 'Dishwasher:'}
                    </span>
                    <div className="flex gap-1">
                      {(['full_door', 'integrated_panel'] as DishwasherFrontStyle[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => onChangeDishwasherStyle(st)}
                          className={`rounded border px-2 py-0.5 text-[10px] ${
                            defaultDishwasherStyle === st
                              ? 'border-[#D49B62] bg-[#B47B44]/25 text-white font-semibold'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                          }`}
                        >
                          {st === 'full_door'
                            ? lang === 'bg'
                              ? 'Цяла врата'
                              : 'Full Door'
                            : lang === 'bg'
                              ? 'Панел'
                              : 'Panel'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {(
                    [
                      {
                        key: 'oven_hob',
                        labelBg: 'Фурна + Котлон (600 мм)',
                        labelEn: 'Oven & Hob (600 mm)',
                        slotType: 'oven_hob' as SlotType,
                      },
                      {
                        key: 'oven_only',
                        labelBg: 'Фурна за вграждане (600 мм)',
                        labelEn: 'Built-in Oven (600 mm)',
                        slotType: 'oven_only' as SlotType,
                      },
                      {
                        key: 'microwave',
                        labelBg: 'Микровълнова за вграждане',
                        labelEn: 'Built-in Microwave',
                        slotType: 'microwave' as SlotType,
                      },
                      {
                        key: 'hob_only',
                        labelBg: 'Котлони (върху шкаф)',
                        labelEn: 'Cooktop / Hob',
                        slotType: 'hob_only' as SlotType,
                      },
                      {
                        key: 'dishwasher',
                        labelBg: 'Съдомиялна (450 / 600 мм)',
                        labelEn: 'Dishwasher (450/600 mm)',
                        slotType: 'dishwasher' as SlotType,
                        dishwasherStyle: defaultDishwasherStyle,
                      },
                      {
                        key: 'washing_machine',
                        labelBg: 'Пералня под плот (650 мм)',
                        labelEn: 'Washing Machine (650 mm)',
                        slotType: 'washing_machine' as SlotType,
                        widthCm: 65,
                      },
                      {
                        key: 'dryer',
                        labelBg: 'Сушилня (600 мм)',
                        labelEn: 'Tumble Dryer (600 mm)',
                        slotType: 'dryer' as SlotType,
                      },
                      {
                        key: 'fridge_top',
                        labelBg: 'Хладилник С надстройка (2200 мм)',
                        labelEn: 'Fridge + Over-Cab (2200 mm)',
                        slotType: 'fridge_builtin' as SlotType,
                        tallKind: 'fridge_top' as const,
                      },
                      {
                        key: 'fridge_no_top',
                        labelBg: 'Хладилник БЕЗ надстройка (1850 мм)',
                        labelEn: 'Fridge Only (1850 mm)',
                        slotType: 'fridge_builtin' as SlotType,
                        tallKind: 'fridge_no_top' as const,
                      },
                      {
                        key: 'oven_mw',
                        labelBg: 'Колона Фурна + Микровълнова (2150 мм)',
                        labelEn: 'Oven + MW Column (2150 mm)',
                        slotType: 'oven_only' as SlotType,
                        tallKind: 'oven_mw' as const,
                      },
                      {
                        key: 'ext_builtin',
                        labelBg: 'Аспиратор вграден (горен шкаф)',
                        labelEn: 'Built-in Upper Extractor',
                        slotType: 'extractor_hood' as SlotType,
                        upperType: 'extractor_builtin' as UpperBayType,
                      },
                      {
                        key: 'ext_chimney',
                        labelBg: 'Аспиратор коминен (декоративен)',
                        labelEn: 'Chimney Extractor Hood',
                        slotType: 'extractor_hood' as SlotType,
                        upperType: 'extractor_chimney' as UpperBayType,
                      },
                    ] as Array<{
                      key: string;
                      labelBg: string;
                      labelEn: string;
                      slotType: SlotType;
                      widthCm?: number;
                      tallKind?: 'fridge_top' | 'fridge_no_top' | 'oven_mw';
                      upperType?: UpperBayType;
                      dishwasherStyle?: DishwasherFrontStyle;
                    }>
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#252D3F] bg-[#141A26] px-2.5 py-2"
                    >
                      <span className="text-[11px] font-medium text-zinc-200 leading-tight">
                        {lang === 'bg' ? item.labelBg : item.labelEn}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={!selectedColumn}
                          onClick={() => {
                            onEmbedAppliance(item.slotType, {
                              tallKind: item.tallKind,
                              upperType: item.upperType,
                              dishwasherStyle: item.dishwasherStyle,
                            });
                            onChangeOpenFolder(null);
                          }}
                          className="rounded border border-[#B47B44]/60 bg-[#B47B44]/20 px-2 py-1 text-[10px] font-semibold text-[#F0C89B] hover:bg-[#B47B44] hover:text-white disabled:opacity-40"
                        >
                          {lang === 'bg' ? 'Вгради' : 'Embed'}
                        </button>
                        {!item.upperType && (
                          <button
                            type="button"
                            onClick={() => {
                              onAddApplianceModule(item.slotType, {
                                widthCm: item.widthCm,
                                tallKind: item.tallKind,
                                dishwasherStyle: item.dishwasherStyle,
                              });
                              onChangeOpenFolder(null);
                            }}
                            className="rounded border border-emerald-500/45 bg-emerald-950/50 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-800 hover:text-white"
                          >
                            {lang === 'bg' ? '+ Модул' : '+ Bay'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FOLDER: MATERIALS, HARDWARE (3 ADMIN LEVELS), HANDLES & EDGE */}
            {openFolder === 'materials' && (
              <div className="space-y-3.5">
                {/* Colors & Decors */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {lang === 'bg' ? 'Цветове ПДЧ / МДФ / Плот' : 'Board & Worktop Decors'}
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#0B0F17] p-1 border border-[#252D3F]">
                    <button
                      type="button"
                      onClick={() => setDecorTarget('front')}
                      className={`rounded py-1 text-[11px] font-medium ${
                        decorTarget === 'front' ? 'bg-[#B47B44] text-white' : 'text-zinc-400'
                      }`}
                    >
                      {t(lang, 'applyToFronts')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecorTarget('carcass')}
                      className={`rounded py-1 text-[11px] font-medium ${
                        decorTarget === 'carcass' ? 'bg-[#B47B44] text-white' : 'text-zinc-400'
                      }`}
                    >
                      {t(lang, 'applyToCarcass')}
                    </button>
                    {config.category === 'kitchen' && (
                      <button
                        type="button"
                        onClick={() => setDecorTarget('countertop')}
                        className={`rounded py-1 text-[11px] font-medium ${
                          decorTarget === 'countertop' ? 'bg-[#B47B44] text-white' : 'text-zinc-400'
                        }`}
                      >
                        {lang === 'bg'
                          ? `Плот ${config.countertopThicknessMm || 40} мм`
                          : `Top ${config.countertopThicknessMm || 40} mm`}
                      </button>
                    )}
                    {config.category === 'kitchen' && config.includeBacksplash && (
                      <button
                        type="button"
                        onClick={() => setDecorTarget('backsplash')}
                        className={`rounded py-1 text-[11px] font-medium ${
                          decorTarget === 'backsplash' ? 'bg-[#B47B44] text-white' : 'text-zinc-400'
                        }`}
                      >
                        {t(lang, 'applyToBacksplash')}
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['ALL', lang === 'bg' ? 'Всички' : 'All'],
                        ['wood', lang === 'bg' ? 'Дървесни' : 'Wood'],
                        ['matte', lang === 'bg' ? 'Мат / Уни' : 'Matte'],
                        ['stone', lang === 'bg' ? 'Камък' : 'Stone'],
                        ['gloss', lang === 'bg' ? 'Гланц' : 'Gloss'],
                        ['mdf', lang === 'bg' ? 'МДФ' : 'MDF'],
                      ] as [DecorSurfaceFilter, string][]
                    ).map(([surfaceKey, surfaceLabel]) => (
                      <button
                        key={surfaceKey}
                        type="button"
                        onClick={() => setDecorSurfaceFilter(surfaceKey)}
                        className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                          decorSurfaceFilter === surfaceKey
                            ? 'bg-zinc-100 text-zinc-950 font-semibold'
                            : 'bg-[#171E2C] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {surfaceLabel}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      type="text"
                      value={decorSearch}
                      onChange={(e) => setDecorSearch(e.target.value)}
                      placeholder={t(lang, 'searchDecorPlaceholder')}
                      className="w-full rounded-md border border-[#252D3F] bg-[#0B0F17] pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-[#B47B44] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 max-h-[180px] overflow-y-auto pr-0.5">
                    {filteredDecors.map((d) => {
                      const selected = d.id === activeDecorId;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleSelectDecor(d.id)}
                          title={`${d.code} — ${lang === 'bg' ? d.nameBg : d.nameEn}`}
                          className={`flex flex-col items-start rounded-md border p-1 text-left transition-colors ${
                            selected
                              ? 'border-[#D49B62] bg-zinc-800'
                              : 'border-[#252D3F] bg-[#141A26] hover:border-zinc-600'
                          }`}
                        >
                          <div
                            className="h-6 w-full rounded border border-white/10"
                            style={{
                              background: d.grainHex
                                ? `linear-gradient(135deg, ${d.colorHex} 0%, ${d.grainHex} 100%)`
                                : d.colorHex,
                            }}
                          />
                          <span className="mt-1 w-full truncate font-mono-tabular text-[9px] font-medium text-zinc-200">
                            {d.code}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Kitchen Countertop, Upper Row & Backsplash */}
                {config.category === 'kitchen' && (
                  <div className="border-t border-[#252D3F] pt-3 space-y-2">
                    <label className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer">
                      <span>{t(lang, 'upperCabinetsToggle')}</span>
                      <input
                        type="checkbox"
                        checked={config.includeUpperCabinets}
                        onChange={(e) =>
                          onUpdateConfig({ ...config, includeUpperCabinets: e.target.checked })
                        }
                        className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
                      />
                    </label>

                    <div className="grid grid-cols-3 gap-1">
                      {([20, 30, 40] as CountertopThicknessMm[]).map((mm) => (
                        <button
                          key={mm}
                          type="button"
                          onClick={() => onUpdateConfig({ ...config, countertopThicknessMm: mm })}
                          className={`rounded border py-1 font-mono-tabular text-[11px] ${
                            (config.countertopThicknessMm || 40) === mm
                              ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                              : 'border-[#252D3F] bg-[#141A26] text-zinc-300'
                          }`}
                        >
                          {lang === 'bg' ? `Плот ${mm}мм` : `Top ${mm}mm`}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer">
                      <span>{t(lang, 'backsplashToggle')}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(config.includeBacksplash)}
                        onChange={(e) =>
                          onUpdateConfig({
                            ...config,
                            includeBacksplash: e.target.checked,
                            backsplashThicknessMm: config.backsplashThicknessMm || 10,
                            backsplashHeightMm: config.backsplashHeightMm || 600,
                          })
                        }
                        className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
                      />
                    </label>

                    {config.includeBacksplash && (
                      <div className="grid grid-cols-4 gap-1">
                        {([8, 10, 12, 15] as BacksplashThicknessMm[]).map((mm) => (
                          <button
                            key={mm}
                            type="button"
                            onClick={() => onUpdateConfig({ ...config, backsplashThicknessMm: mm })}
                            className={`rounded border py-1 font-mono-tabular text-[10px] ${
                              (config.backsplashThicknessMm || 10) === mm
                                ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                                : 'border-[#252D3F] bg-[#141A26] text-zinc-300'
                            }`}
                          >
                            {mm} мм
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3 Neutral Hardware Tiers (Zero brands / suppliers in client view) */}
                <div className="border-t border-[#252D3F] pt-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                    <Wrench className="h-3.5 w-3.5 text-[#D49B62]" />
                    <span>{lang === 'bg' ? 'Клас обков (3 нива)' : 'Hardware Class'}</span>
                  </div>
                  <div className="space-y-1.5">
                    {hardwareTiers
                      .filter((h) => h.active)
                      .map((hw) => {
                        const active = hw.id === config.hardwareTierId;
                        const neutral = getNeutralHardwareTierInfo(hw, lang);
                        return (
                          <button
                            key={hw.id}
                            type="button"
                            onClick={() => onUpdateConfig({ ...config, hardwareTierId: hw.id })}
                            className={`w-full rounded-lg border p-2 text-left transition-colors ${
                              active
                                ? 'border-[#D49B62] bg-[#B47B44]/20'
                                : 'border-[#252D3F] bg-[#141A26] hover:border-zinc-600'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 text-xs">
                              <span className="font-semibold text-white flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    active ? 'bg-[#B47B44] text-white' : 'bg-zinc-800 text-zinc-300'
                                  }`}
                                >
                                  {neutral.badge}
                                </span>
                                <span className="truncate">{neutral.title}</span>
                              </span>
                              <span className="font-mono-tabular text-[10px] text-zinc-400 shrink-0">
                                {hw.warrantyYears}г
                              </span>
                            </div>
                            <p className="mt-1 text-[10px] text-zinc-400 line-clamp-2">
                              {neutral.description}
                            </p>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Unified Supplier- & Brand-Anonymous Hardware, Mechanisms & Vitrines (By Quality Class, >0 EUR only) */}
                <div className="border-t border-[#252D3F] pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                      <Package className="h-3.5 w-3.5 text-[#D49B62]" />
                      <span>
                        {lang === 'bg'
                          ? 'Обков, механизми и витрини (по клас)'
                          : 'Hardware, Mechanisms & Vitrines'}
                      </span>
                    </div>
                    {totalExtraSelectedCount > 0 && (
                      <span className="rounded bg-[#B47B44]/25 border border-[#D49B62]/40 px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold text-[#F0C89B]">
                        {totalExtraSelectedCount} {lang === 'bg' ? 'избр.' : 'sel.'}
                      </span>
                    )}
                  </div>

                  {/* Black profile handle for glass vitrines & summary */}
                  <div className="rounded-lg border border-[#252D3F] bg-[#0D121C] p-2 space-y-1.5">
                    <label className="flex items-center justify-between gap-2 text-[11px] text-zinc-200 cursor-pointer">
                      <span>
                        {lang === 'bg'
                          ? 'Профил дръжка черна за стъклени витрини'
                          : 'Black profile handle for glass vitrines'}
                      </span>
                      <input
                        type="checkbox"
                        checked={config.vitrineHexiHandle !== false}
                        onChange={(e) =>
                          onUpdateConfig({ ...config, vitrineHexiHandle: e.target.checked })
                        }
                        className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
                      />
                    </label>
                    {quote && (quote.vitrineS02Count ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-[10px] text-[#E6B88A] border-t border-[#20283A] pt-1 font-mono-tabular">
                        <span>
                          {lang === 'bg'
                            ? `${quote.vitrineS02Count} бр. витрини (алу. профил 20 мм + стъкло)`
                            : `${quote.vitrineS02Count}× aluminum profile 20mm glass vitrines`}
                        </span>
                        <span className="font-semibold">
                          +{(quote.vitrineS02TotalEur ?? 0).toFixed(2)} €
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Selected Extra Hardware & Mechanisms */}
                  {(selectedMeritEntries.length > 0 || selectedPartnerEntries.length > 0) && (
                    <div className="space-y-1 rounded-lg border border-[#D49B62]/35 bg-[#121722] p-2">
                      {selectedMeritEntries.map((entry) => {
                        const it = meritItemMap.get(entry.itemId);
                        if (!it) return null;
                        return (
                          <div
                            key={`sel_merit_${entry.itemId}`}
                            className="flex items-center justify-between gap-2 text-[11px] text-zinc-200 border-b border-[#252D3F]/60 last:border-b-0 pb-1 last:pb-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-white">{it.cleanName}</div>
                              <div className="truncate text-[10px] text-zinc-400">
                                {[
                                  it.cleanSize,
                                  QUALITY_CLASS_LABELS[it.qualityClass][lang],
                                  `${it.priceEur.toFixed(2)} €/${it.unit}`,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleUpdateCatalogQty('merit', entry.itemId, -1)}
                                className="flex h-5 w-5 items-center justify-center rounded border border-[#2C354A] bg-[#0B0F17] text-zinc-300 hover:text-white"
                              >
                                <Minus className="h-2.5 w-2.5" />
                              </button>
                              <span className="w-5 text-center font-mono-tabular text-[11px] font-semibold text-white">
                                {entry.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateCatalogQty('merit', entry.itemId, 1)}
                                className="flex h-5 w-5 items-center justify-center rounded border border-[#2C354A] bg-[#0B0F17] text-zinc-300 hover:text-white"
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateCatalogQty('merit', entry.itemId, -entry.quantity)
                                }
                                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-red-400"
                                title={lang === 'bg' ? 'Премахни' : 'Remove'}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {selectedPartnerEntries.map((entry) => {
                        const it = partnerItemMap.get(entry.itemId);
                        if (!it) return null;
                        return (
                          <div
                            key={`sel_partner_${entry.itemId}`}
                            className="flex items-center justify-between gap-2 text-[11px] text-zinc-200 border-b border-[#252D3F]/60 last:border-b-0 pb-1 last:pb-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-white">{it.cleanName}</div>
                              <div className="truncate text-[10px] text-zinc-400">
                                {[
                                  it.cleanSize,
                                  QUALITY_CLASS_LABELS[it.qualityClass][lang],
                                  `${it.priceEur.toFixed(2)} €/${it.unit}`,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleUpdateCatalogQty('partner', entry.itemId, -1)}
                                className="flex h-5 w-5 items-center justify-center rounded border border-[#2C354A] bg-[#0B0F17] text-zinc-300 hover:text-white"
                              >
                                <Minus className="h-2.5 w-2.5" />
                              </button>
                              <span className="w-5 text-center font-mono-tabular text-[11px] font-semibold text-white">
                                {entry.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateCatalogQty('partner', entry.itemId, 1)}
                                className="flex h-5 w-5 items-center justify-center rounded border border-[#2C354A] bg-[#0B0F17] text-zinc-300 hover:text-white"
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateCatalogQty('partner', entry.itemId, -entry.quantity)
                                }
                                className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-red-400"
                                title={lang === 'bg' ? 'Премахни' : 'Remove'}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {totalExtraHardwareEur > 0 && (
                        <div className="pt-1 text-right font-mono-tabular text-[10px] font-semibold text-[#E6B88A]">
                          {lang === 'bg'
                            ? `Допълнителен обков и механизми: +${totalExtraHardwareEur.toFixed(2)} € (включени в цената)`
                            : `Extra hardware & mechanisms: +${totalExtraHardwareEur.toFixed(2)} €`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quality Class Filter Pills */}
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        ['ALL', lang === 'bg' ? 'Всички' : 'All'],
                        ['high', lang === 'bg' ? 'Висок' : 'High'],
                        ['medium', lang === 'bg' ? 'Среден' : 'Medium'],
                        ['low', lang === 'bg' ? 'Нисък' : 'Low'],
                      ] as const
                    ).map(([qVal, qLabel]) => (
                      <button
                        key={qVal}
                        type="button"
                        onClick={() => setPartnerQualityFilter(qVal)}
                        className={`rounded border py-1 text-[10px] font-medium transition-colors ${
                          partnerQualityFilter === qVal
                            ? 'border-[#D49B62] bg-[#B47B44]/25 text-white font-semibold'
                            : 'border-[#252D3F] bg-[#141A26] text-zinc-300 hover:text-white'
                        }`}
                      >
                        {qLabel}
                      </button>
                    ))}
                  </div>

                  {/* Neutral Category Filter + Search */}
                  <select
                    value={partnerCategoryFilter}
                    onChange={(e) => setPartnerCategoryFilter(e.target.value)}
                    className="w-full rounded-md border border-[#252D3F] bg-[#0B0F17] px-2 py-1.5 text-[11px] text-zinc-200 focus:border-[#B47B44] focus:outline-none"
                  >
                    <option value="ALL">
                      {lang === 'bg'
                        ? `Всички раздели обков (${unifiedCatalogItems.length} поз.)`
                        : `All Hardware Categories (${unifiedCatalogItems.length})`}
                    </option>
                    {unifiedNeutralCategories.map((cat) => {
                      const cnt = unifiedCatalogItems.filter(
                        (it) => it.categoryId === cat.id,
                      ).length;
                      if (cnt === 0) return null;
                      return (
                        <option key={cat.id} value={cat.id}>
                          {lang === 'bg' ? cat.nameBg : cat.nameEn} ({cnt})
                        </option>
                      );
                    })}
                  </select>

                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      type="text"
                      value={partnerSearch}
                      onChange={(e) => setPartnerSearch(e.target.value)}
                      placeholder={
                        lang === 'bg'
                          ? 'Търси панта, водач, мивка, механизъм...'
                          : 'Search hinge, slide, sink, mechanism...'
                      }
                      className="w-full rounded-md border border-[#252D3F] bg-[#0B0F17] pl-8 pr-2.5 py-1.5 text-[11px] text-white placeholder:text-zinc-500 focus:border-[#B47B44] focus:outline-none"
                    />
                  </div>

                  <div className="max-h-[195px] space-y-1.5 overflow-y-auto pr-0.5">
                    {filteredUnifiedItems.length === 0 ? (
                      <div className="rounded border border-dashed border-[#252D3F] bg-[#0B0F17]/60 px-2.5 py-3 text-center text-[11px] text-zinc-400">
                        {lang === 'bg'
                          ? 'Няма налични позиции за избрания клас или търсене.'
                          : 'No active items in this filter.'}
                      </div>
                    ) : (
                      filteredUnifiedItems.map((it) => (
                        <div
                          key={it.key}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#252D3F] bg-[#141A26] px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-semibold text-zinc-100">
                              {it.cleanName}
                            </div>
                            <div className="truncate text-[10px] text-zinc-400">
                              {[
                                QUALITY_CLASS_LABELS[it.qualityClass][lang],
                                it.cleanSize,
                                it.cleanFeature,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            <div className="font-mono-tabular text-[10px] font-semibold text-[#E6B88A]">
                              {it.priceEur.toFixed(2)} € / {it.unit}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddCatalogItem(it)}
                            className="shrink-0 inline-flex items-center gap-1 rounded border border-[#B47B44]/60 bg-[#B47B44]/20 px-2 py-1 text-[10px] font-semibold text-[#F0C89B] hover:bg-[#B47B44] hover:text-white"
                          >
                            <Plus className="h-3 w-3" />
                            <span>{lang === 'bg' ? 'Добави' : 'Add'}</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Handles, Gola L+C & Upper LED */}
                <div className="border-t border-[#252D3F] pt-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {t(lang, 'handleTitle')}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        ['standard_bar', lang === 'bg' ? 'Метална дръжка' : 'Bar Handle'],
                        ['profile_j', lang === 'bg' ? 'Скрит J-профил' : 'J-Profile'],
                        ['gola_profile', t(lang, 'golaProfileName')],
                        ['push_to_open', 'Push-to-Open'],
                        ['knob', lang === 'bg' ? 'Копче / Топка' : 'Knob'],
                      ] as [HandleStyle, string][]
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => onUpdateConfig({ ...config, handleStyle: val })}
                        className={`rounded border px-2 py-1.5 text-[11px] transition-colors ${
                          val === 'gola_profile' ? 'col-span-2' : ''
                        } ${
                          config.handleStyle === val
                            ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                            : 'border-[#252D3F] bg-[#141A26] text-zinc-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {config.category === 'kitchen' && config.includeUpperCabinets && (
                    <div className="pt-1 space-y-1">
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                        <Lightbulb className="h-3 w-3 text-amber-300" />
                        <span>{t(lang, 'upperProfileTitle')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {(
                          [
                            ['none', lang === 'bg' ? 'Без LED' : 'None'],
                            ['recessed_bottom', lang === 'bg' ? 'Вкопан' : 'Recessed'],
                            ['led_single', lang === 'bg' ? 'Единичен LED' : '1× LED'],
                            ['led_double', lang === 'bg' ? 'Двоен LED' : '2× LED'],
                          ] as [UpperProfileStyle, string][]
                        ).map(([uVal, uLabel]) => (
                          <button
                            key={uVal}
                            type="button"
                            onClick={() => onUpdateConfig({ ...config, upperProfileStyle: uVal })}
                            className={`rounded border px-2 py-1 text-[10px] ${
                              (config.upperProfileStyle || 'none') === uVal
                                ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                                : 'border-[#252D3F] bg-[#141A26] text-zinc-300'
                            }`}
                          >
                            {uLabel}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Edge Banding (EVA vs PUR) */}
                <div className="border-t border-[#252D3F] pt-3 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {lang === 'bg' ? 'Кантиране' : 'Edge Banding'}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateConfig({ ...config, edgeBandingType: 'eva' })}
                      className={`rounded border px-2 py-1.5 text-left text-[11px] ${
                        (config.edgeBandingType || 'eva') === 'eva'
                          ? 'border-[#D49B62] bg-[#B47B44]/20 text-white font-semibold'
                          : 'border-[#252D3F] bg-[#141A26] text-zinc-300'
                      }`}
                    >
                      ABS + EVA
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateConfig({ ...config, edgeBandingType: 'pur' })}
                      className={`rounded border px-2 py-1.5 text-left text-[11px] flex items-center gap-1 ${
                        config.edgeBandingType === 'pur'
                          ? 'border-sky-500 bg-sky-950/60 text-white font-semibold'
                          : 'border-[#252D3F] bg-[#141A26] text-zinc-300'
                      }`}
                    >
                      <Droplets className="h-3 w-3 text-sky-400 shrink-0" />
                      <span>PUR Водоуст.</span>
                    </button>
                  </div>
                </div>

                {/* Delivery Floor / Distance */}
                <div className="border-t border-[#252D3F] pt-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {lang === 'bg' ? 'Логистика и транспорт' : 'Delivery & Floor'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-zinc-400">
                        {lang === 'bg' ? 'Етаж (0 = партер)' : 'Floor'}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={config.deliveryFloor ?? 0}
                        onChange={(e) =>
                          onUpdateConfig({
                            ...config,
                            deliveryFloor: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                          })
                        }
                        className="mt-0.5 w-full rounded border border-[#252D3F] bg-[#0B0F17] px-2 py-1 font-mono-tabular text-xs text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-zinc-400">
                        {lang === 'bg' ? 'Извън Пловдив (км)' : 'Outside km'}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={400}
                        value={config.outsideCityKm ?? 0}
                        onChange={(e) =>
                          onUpdateConfig({
                            ...config,
                            outsideCityKm: Math.max(0, Math.min(400, Number(e.target.value) || 0)),
                          })
                        }
                        className="mt-0.5 w-full rounded border border-[#252D3F] bg-[#0B0F17] px-2 py-1 font-mono-tabular text-xs text-white"
                      />
                    </label>
                  </div>
                  <label className="flex items-center justify-between text-[11px] text-zinc-200 cursor-pointer">
                    <span>{lang === 'bg' ? 'Има товарен/пътн. асансьор' : 'Has elevator'}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(config.hasElevator)}
                      onChange={(e) =>
                        onUpdateConfig({ ...config, hasElevator: e.target.checked })
                      }
                      className="rounded border-zinc-700 bg-zinc-900 accent-[#B47B44]"
                    />
                  </label>
                  {quote && quote.logisticsFeeEur > 0 && (
                    <div className="text-[10px] text-[#E6B88A]">
                      {lang === 'bg'
                        ? `Транспорт и качване: +${quote.logisticsFeeEur} €`
                        : `Logistics: +${quote.logisticsFeeEur} €`}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onChangeOpenFolder(null);
                      onOpenQuickConsult();
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-900/60"
                  >
                    <Phone className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{lang === 'bg' ? 'Консултация с майстор' : 'Master Consultation'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
