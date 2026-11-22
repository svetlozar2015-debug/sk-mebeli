import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  Layers,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { DEFAULT_PRICING_CONFIG } from '../data/catalogDefaults';
import {
  Language,
  PartnerCatalogItem,
  PartnerCategoryDef,
  PartnerSubsectionDef,
  PartnerVendorId,
  QualityClass,
  VitrineS02Pricing,
} from '../types/furniture';

interface AdminPartnerCatalogProps {
  lang: Language;
  vendor: PartnerVendorId;
  categories: PartnerCategoryDef[];
  customSubsections?: PartnerSubsectionDef[];
  items: PartnerCatalogItem[];
  onSaveCatalog: (
    nextItems: PartnerCatalogItem[],
    flashMsg: string,
    nextCustomSubsections?: PartnerSubsectionDef[],
  ) => Promise<void>;
  vitrineS02?: VitrineS02Pricing;
  onSaveVitrineS02?: (next: VitrineS02Pricing) => Promise<void>;
}

interface PartnerDraft {
  name: string;
  sizeLabel: string;
  featureLabel: string;
  brandLevel: string;
  qualityClass: QualityClass;
  unit: string;
  priceEur: number;
  active: boolean;
}

const EMPTY_DRAFT: PartnerDraft = {
  name: '',
  sizeLabel: '',
  featureLabel: '',
  brandLevel: 'GTV / Стандартен',
  qualityClass: 'medium',
  unit: 'бр.',
  priceEur: 0,
  active: true,
};

const QUICK_SIZES = [
  '250 мм',
  '300 мм',
  '350 мм',
  '400 мм',
  '450 мм',
  '500 мм',
  '550 мм',
  '15 см',
  '20 см',
  '270 см',
];

const QUICK_BRANDS = [
  'Blum',
  'Hettich',
  'PEKA',
  'GTV',
  'STARAX',
  'Häfele',
  'Стандартен',
  'Бюджетен',
];

const QUICK_FEATURES = [
  'Плавно прибиране',
  'Push-open',
  'Пълно изтегляне',
  'Покрит кант',
  'Полупокрит кант',
  'Открит кант',
  'AXILO 78',
  'PEKA',
  '110°',
  'Долен монтаж',
];

const UNITS = ['бр.', 'компл.', 'комплект', 'чифт/компл.', 'л.м.', 'м²', 'опаковка'];

const QUALITY_LABELS: Record<QualityClass, { bg: string; en: string; badgeClass: string }> = {
  high: {
    bg: 'Висок клас',
    en: 'High Class',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  medium: {
    bg: 'Среден клас',
    en: 'Medium Class',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
  },
  low: {
    bg: 'Нисък клас',
    en: 'Economy Class',
    badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-300',
  },
};

export const AdminPartnerCatalog: React.FC<AdminPartnerCatalogProps> = ({
  lang,
  vendor,
  categories,
  customSubsections = [],
  items,
  onSaveCatalog,
  vitrineS02,
  onSaveVitrineS02,
}) => {
  const mergedCategories = useMemo<PartnerCategoryDef[]>(() => {
    return categories.map((cat) => {
      const extras = customSubsections.filter((s) => s.categoryId === cat.id);
      if (extras.length === 0) return cat;
      const seen = new Set(cat.subsections.map((s) => s.id));
      const uniqueExtras = extras.filter((e) => !seen.has(e.id));
      return {
        ...cat,
        subsections: [...cat.subsections, ...uniqueExtras],
      };
    });
  }, [categories, customSubsections]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id || 'ALL',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>({});
  const [addingSubKey, setAddingSubKey] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<PartnerDraft>(EMPTY_DRAFT);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<PartnerDraft>(EMPTY_DRAFT);
  const [addingCustomSubCatId, setAddingCustomSubCatId] = useState<string | null>(null);
  const [newSubNameBg, setNewSubNameBg] = useState('');
  const [saving, setSaving] = useState(false);

  // S02 Vitrine editable state (Admin-only for Nasteh)
  const [s02Draft, setS02Draft] = useState<VitrineS02Pricing>(
    vitrineS02 || DEFAULT_PRICING_CONFIG.vitrineS02!,
  );
  const [s02Saving, setS02Saving] = useState(false);
  const [s02Expanded, setS02Expanded] = useState(true);

  useEffect(() => {
    if (vitrineS02) {
      setS02Draft({
        ...DEFAULT_PRICING_CONFIG.vitrineS02!,
        ...vitrineS02,
      });
    }
  }, [vitrineS02]);

  const totalSubsectionsCount = useMemo(
    () => mergedCategories.reduce((s, c) => s + c.subsections.length, 0),
    [mergedCategories],
  );

  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of mergedCategories) map[cat.id] = 0;
    for (const it of items) {
      map[it.categoryId] = (map[it.categoryId] || 0) + 1;
    }
    return map;
  }, [mergedCategories, items]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleCategories = useMemo(() => {
    if (normalizedQuery) {
      return mergedCategories.filter((cat) => {
        if (cat.nameBg.toLowerCase().includes(normalizedQuery)) return true;
        return cat.subsections.some((sub) => {
          if (sub.nameBg.toLowerCase().includes(normalizedQuery)) return true;
          return items.some(
            (it) =>
              it.categoryId === cat.id &&
              it.subsectionId === sub.id &&
              (it.name.toLowerCase().includes(normalizedQuery) ||
                it.sizeLabel.toLowerCase().includes(normalizedQuery) ||
                it.featureLabel.toLowerCase().includes(normalizedQuery) ||
                it.brandLevel.toLowerCase().includes(normalizedQuery)),
          );
        });
      });
    }
    if (selectedCategoryId === 'ALL') return mergedCategories;
    return mergedCategories.filter((c) => c.id === selectedCategoryId);
  }, [selectedCategoryId, normalizedQuery, mergedCategories, items]);

  const openAddForm = (
    categoryId: string,
    subsectionId: string,
    preset?: Partial<PartnerDraft>,
  ) => {
    const key = `${categoryId}::${subsectionId}`;
    setCollapsedSubs((prev) => ({ ...prev, [key]: false }));
    setEditingItemId(null);
    setAddingSubKey(key);
    setAddDraft({
      ...EMPTY_DRAFT,
      brandLevel: vendor === 'galplas' ? 'GAL PLAS / Стандартен' : 'Настех / Стандартен',
      ...preset,
    });
  };

  const handleConfirmAdd = async (
    categoryId: string,
    subsectionId: string,
    e: React.FormEvent,
  ) => {
    e.preventDefault();
    if (!addDraft.name.trim() || saving) return;
    setSaving(true);
    try {
      const id = `${vendor}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newItem: PartnerCatalogItem = {
        id,
        vendor,
        categoryId,
        subsectionId,
        name: addDraft.name.trim(),
        sizeLabel: addDraft.sizeLabel.trim(),
        featureLabel: addDraft.featureLabel.trim(),
        brandLevel: addDraft.brandLevel.trim() || 'Стандартен',
        qualityClass: addDraft.qualityClass,
        unit: addDraft.unit.trim() || 'бр.',
        priceEur: Math.max(0, Number(addDraft.priceEur) || 0),
        active: addDraft.active,
        updatedAt: new Date().toISOString(),
      };
      await onSaveCatalog(
        [...items, newItem],
        lang === 'bg'
          ? `Артикулът „${newItem.name}“ е добавен и проектите се преизчисляват!`
          : `Item "${newItem.name}" added!`,
        customSubsections,
      );
      setAddingSubKey(null);
      setAddDraft(EMPTY_DRAFT);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (item: PartnerCatalogItem) => {
    setAddingSubKey(null);
    setEditingItemId(item.id);
    setEditDraft({
      name: item.name,
      sizeLabel: item.sizeLabel,
      featureLabel: item.featureLabel,
      brandLevel: item.brandLevel,
      qualityClass: item.qualityClass || 'medium',
      unit: item.unit,
      priceEur: item.priceEur,
      active: item.active !== false,
    });
  };

  const handleConfirmEdit = async (itemId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft.name.trim() || saving) return;
    setSaving(true);
    try {
      const next = items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              name: editDraft.name.trim(),
              sizeLabel: editDraft.sizeLabel.trim(),
              featureLabel: editDraft.featureLabel.trim(),
              brandLevel: editDraft.brandLevel.trim() || 'Стандартен',
              qualityClass: editDraft.qualityClass,
              unit: editDraft.unit.trim() || 'бр.',
              priceEur: Math.max(0, Number(editDraft.priceEur) || 0),
              active: editDraft.active,
              updatedAt: new Date().toISOString(),
            }
          : it,
      );
      await onSaveCatalog(
        next,
        lang === 'bg'
          ? 'Артикулът и цената му са обновени — 3D проектите се преизчисляват!'
          : 'Item updated and 3D quotes recalculated!',
        customSubsections,
      );
      setEditingItemId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = (item: PartnerCatalogItem) => {
    openAddForm(item.categoryId, item.subsectionId, {
      name: item.name,
      sizeLabel: item.sizeLabel,
      featureLabel: item.featureLabel,
      brandLevel: item.brandLevel,
      qualityClass: item.qualityClass || 'medium',
      unit: item.unit,
      priceEur: item.priceEur,
      active: item.active !== false,
    });
  };

  const handleDelete = async (item: PartnerCatalogItem) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = items.filter((it) => it.id !== item.id);
      if (editingItemId === item.id) setEditingItemId(null);
      await onSaveCatalog(
        next,
        lang === 'bg'
          ? `Артикулът „${item.name}“ е изтрит.`
          : `Deleted "${item.name}".`,
        customSubsections,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: PartnerCatalogItem) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = items.map((it) =>
        it.id === item.id
          ? { ...it, active: it.active === false, updatedAt: new Date().toISOString() }
          : it,
      );
      await onSaveCatalog(
        next,
        lang === 'bg'
          ? `Артикулът „${item.name}“ е ${item.active === false ? 'активиран' : 'скрит'}.`
          : 'Item visibility updated.',
        customSubsections,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomSubsection = async (categoryId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubNameBg.trim() || saving) return;
    setSaving(true);
    try {
      const subId = `nas_sub_${Date.now().toString(36)}`;
      const newSub: PartnerSubsectionDef = {
        id: subId,
        categoryId,
        nameBg: newSubNameBg.trim(),
        nameEn: newSubNameBg.trim(),
        isCustom: true,
      };
      const nextSubs = [...customSubsections, newSub];
      await onSaveCatalog(
        items,
        lang === 'bg'
          ? `Подраздел „${newSub.nameBg}“ е добавен!`
          : `Subsection "${newSub.nameBg}" added!`,
        nextSubs,
      );
      setNewSubNameBg('');
      setAddingCustomSubCatId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomSubsection = async (sub: PartnerSubsectionDef) => {
    if (!sub.isCustom || saving) return;
    setSaving(true);
    try {
      const nextSubs = customSubsections.filter((s) => s.id !== sub.id);
      const nextItems = items.filter((it) => it.subsectionId !== sub.id);
      await onSaveCatalog(
        nextItems,
        lang === 'bg'
          ? `Потребителският подраздел „${sub.nameBg}“ е премахнат.`
          : `Custom subsection "${sub.nameBg}" removed.`,
        nextSubs,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveS02 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveVitrineS02 || s02Saving) return;
    setS02Saving(true);
    try {
      await onSaveVitrineS02({
        frameUpTo350x1100Eur: Math.max(0, Number(s02Draft.frameUpTo350x1100Eur) || 0),
        frameUpTo500x1300Eur: Math.max(0, Number(s02Draft.frameUpTo500x1300Eur) || 0),
        frameUpTo500x2300Eur: Math.max(0, Number(s02Draft.frameUpTo500x2300Eur) || 0),
        glassDarkGrey4mmPerSqmEur: Math.max(0, Number(s02Draft.glassDarkGrey4mmPerSqmEur) || 0),
        glassEdgeProcessingPerMeterEur: Math.max(
          0,
          Number(s02Draft.glassEdgeProcessingPerMeterEur) || 0,
        ),
        hexiHandleProfileEur: Math.max(0, Number(s02Draft.hexiHandleProfileEur) || 0),
        blumOnixHingeSetEur: Math.max(0, Number(s02Draft.blumOnixHingeSetEur) || 0),
        qualityClass: s02Draft.qualityClass || 'high',
      });
    } finally {
      setS02Saving(false);
    }
  };

  const renderDraftForm = (
    draft: PartnerDraft,
    setDraft: React.Dispatch<React.SetStateAction<PartnerDraft>>,
    onSubmit: (e: React.FormEvent) => void,
    onCancel: () => void,
    submitLabel: string,
  ) => (
    <form
      onSubmit={onSubmit}
      className="mt-2 rounded-xl border-2 border-[#B47B44]/50 bg-[#FDFBF7] p-4 space-y-3 shadow-xs"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-[11px] font-semibold text-zinc-700">
            {lang === 'bg' ? 'Наименование / Модел *' : 'Item Name / Model *'}
          </span>
          <input
            type="text"
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="напр. Механизъм PEKA / Водач / Панта..."
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-zinc-700">
            {lang === 'bg' ? 'Размер / Дължина' : 'Size / Length'}
          </span>
          <input
            type="text"
            value={draft.sizeLabel}
            onChange={(e) => setDraft({ ...draft, sizeLabel: e.target.value })}
            placeholder="450 мм / 15 см / 270 см"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-mono-tabular text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-zinc-700">
            {lang === 'bg' ? 'Клас качество' : 'Quality Class'}
          </span>
          <select
            value={draft.qualityClass}
            onChange={(e) => setDraft({ ...draft, qualityClass: e.target.value as QualityClass })}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          >
            <option value="high">{lang === 'bg' ? 'Висок клас' : 'High Class'}</option>
            <option value="medium">{lang === 'bg' ? 'Среден клас' : 'Medium Class'}</option>
            <option value="low">{lang === 'bg' ? 'Нисък клас' : 'Economy Class'}</option>
          </select>
        </label>
      </div>

      {/* Quick Size Chips */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-medium text-zinc-500 mr-1">
          {lang === 'bg' ? 'Бърз размер:' : 'Quick size:'}
        </span>
        {QUICK_SIZES.map((sz) => (
          <button
            key={sz}
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, sizeLabel: sz }))}
            className={`rounded border px-1.5 py-0.5 font-mono-tabular text-[10px] transition-colors ${
              draft.sizeLabel === sz
                ? 'border-[#B47B44] bg-[#B47B44] text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:border-[#B47B44]'
            }`}
          >
            {sz}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-[11px] font-semibold text-zinc-700">
            {lang === 'bg' ? 'Функция / Вариант / Характеристика' : 'Function / Variant / Spec'}
          </span>
          <input
            type="text"
            value={draft.featureLabel}
            onChange={(e) => setDraft({ ...draft, featureLabel: e.target.value })}
            placeholder="плавно прибиране, пълно изтегляне, AXILO 78, PEKA..."
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-zinc-700">
            {lang === 'bg' ? 'Марка / Серия' : 'Brand / Series'}
          </span>
          <input
            type="text"
            value={draft.brandLevel}
            onChange={(e) => setDraft({ ...draft, brandLevel: e.target.value })}
            placeholder="Blum, PEKA, Hettich, GTV..."
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-zinc-700">
              {lang === 'bg' ? 'Единица' : 'Unit'}
            </span>
            <select
              value={UNITS.includes(draft.unit) ? draft.unit : UNITS[0]}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-zinc-700">
              {lang === 'bg' ? 'Цена (EUR) *' : 'Price (EUR) *'}
            </span>
            <input
              type="number"
              required
              min={0}
              step={0.01}
              value={draft.priceEur}
              onChange={(e) =>
                setDraft({ ...draft, priceEur: Math.max(0, Number(e.target.value) || 0) })
              }
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono-tabular text-xs font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
            />
          </label>
        </div>
      </div>

      {/* Quick Features + Quick Brands */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium text-zinc-500">
          {lang === 'bg' ? 'Функции:' : 'Specs:'}
        </span>
        {QUICK_FEATURES.map((feat) => (
          <button
            key={feat}
            type="button"
            onClick={() =>
              setDraft((prev) => ({
                ...prev,
                featureLabel: prev.featureLabel
                  ? prev.featureLabel.toLowerCase().includes(feat.toLowerCase())
                    ? prev.featureLabel
                    : `${prev.featureLabel}, ${feat}`
                  : feat,
              }))
            }
            className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700 hover:border-[#B47B44]"
          >
            + {feat}
          </button>
        ))}
        <span className="text-[10px] font-medium text-zinc-500 ml-2">
          {lang === 'bg' ? 'Марка:' : 'Brand:'}
        </span>
        {QUICK_BRANDS.map((br) => (
          <button
            key={br}
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, brandLevel: br }))}
            className={`rounded border px-1.5 py-0.5 text-[10px] ${
              draft.brandLevel === br
                ? 'border-[#18181B] bg-[#18181B] text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:border-[#B47B44]'
            }`}
          >
            {br}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-200/80">
        <label className="inline-flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            className="rounded border-zinc-300 accent-[#B47B44]"
          />
          <span>
            {lang === 'bg'
              ? 'Активен за клиента (артикули с цена 0 € автоматично се скриват)'
              : 'Visible to client (0 € items auto-hide)'}
          </span>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            <X className="h-3.5 w-3.5" />
            <span>{lang === 'bg' ? 'Отказ' : 'Cancel'}</span>
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#B47B44] disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  );

  const vendorTitle =
    vendor === 'galplas'
      ? lang === 'bg'
        ? 'Пълен каталог — GAL PLAS LTD (galplas.bg)'
        : 'Complete Catalog — GAL PLAS LTD (galplas.bg)'
      : lang === 'bg'
        ? 'Пълен каталог обков и механизми — Настех ООД (гр. Пловдив)'
        : 'Complete Catalog — Nasteh Ltd (Plovdiv)';

  return (
    <div className="space-y-5">
      {/* Top Partner Header & Search */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B47B44]/15 text-[#B47B44] shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900">{vendorTitle}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {lang === 'bg'
                ? `${mergedCategories.length} раздела · ${totalSubsectionsCount} подраздела · ${items.length} артикула. При клиента името на доставчика остава скрито, а позиции с цена 0.00 € не се показват.`
                : `${mergedCategories.length} categories · ${totalSubsectionsCount} subsections · ${items.length} items. Supplier name is hidden on the storefront and 0 € items auto-hide.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'bg'
                  ? 'Търси раздел, модел, размер, PEKA, AXILO...'
                  : 'Search category, model, size, brand...'
              }
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-8 pr-8 py-2 text-xs text-zinc-900 focus:border-[#B47B44] focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Admin-Only Automatic Glass Vitrine (S02) Calculator Card (Nasteh tab) */}
      {vendor === 'nasteh' && onSaveVitrineS02 && (
        <div className="rounded-xl border-2 border-[#B47B44]/40 bg-gradient-to-br from-amber-50/50 via-white to-white overflow-hidden shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/70 bg-amber-50/70 px-5 py-3.5">
            <button
              type="button"
              onClick={() => setS02Expanded((v) => !v)}
              className="flex items-center gap-2.5 text-left"
            >
              {s02Expanded ? (
                <ChevronDown className="h-4 w-4 text-[#B47B44]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#B47B44]" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-[#18181B] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#E5C17B]">
                    <Sparkles className="h-3 w-3" />
                    {lang === 'bg' ? 'Автоматичен 3D калкулатор S02' : 'Automatic S02 Calculator'}
                  </span>
                  <span className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                    {QUALITY_LABELS[s02Draft.qualityClass || 'high'].bg}
                  </span>
                </div>
                <h4 className="mt-1 text-sm sm:text-base font-bold text-zinc-900">
                  {lang === 'bg'
                    ? 'Стъклени алуминиеви витрини (профил S02 черен мат) — единични цени в EUR с ДДС'
                    : 'Glass Aluminium Vitrines (Profile S02 Black Matte) — Unit EUR w/ VAT'}
                </h4>
              </div>
            </button>

            <span className="text-[11px] font-medium text-zinc-600">
              {lang === 'bg'
                ? 'Видимо САМО в Админ панела · Изчислява автоматично всяка стъклена витрина в 3D'
                : 'Admin Only · Auto-calculates every glass vitrine in 3D'}
            </span>
          </div>

          {s02Expanded && (
            <form onSubmit={handleSaveS02} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Алуминиева вратичка S02 черен мат (≤ 350×1100 мм)
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={s02Draft.frameUpTo350x1100Eur}
                      onChange={(e) =>
                        setS02Draft({
                          ...s02Draft,
                          frameUpTo350x1100Eur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded border border-zinc-300 px-2.5 py-1.5 font-mono-tabular font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">€/бр.</span>
                  </div>
                </label>

                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Алуминиева вратичка S02 черен мат (≤ 500×1300 мм)
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={s02Draft.frameUpTo500x1300Eur}
                      onChange={(e) =>
                        setS02Draft({
                          ...s02Draft,
                          frameUpTo500x1300Eur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded border border-zinc-300 px-2.5 py-1.5 font-mono-tabular font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">€/бр.</span>
                  </div>
                </label>

                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Алуминиева вратичка S02 черен мат (≤ 500×2300 мм)
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={s02Draft.frameUpTo500x2300Eur}
                      onChange={(e) =>
                        setS02Draft({
                          ...s02Draft,
                          frameUpTo500x2300Eur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded border border-zinc-300 px-2.5 py-1.5 font-mono-tabular font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">€/бр.</span>
                  </div>
                </label>

                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Стъкло Тъмносиво 4 мм (с +5% фира в 3D)
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={s02Draft.glassDarkGrey4mmPerSqmEur}
                      onChange={(e) =>
                        setS02Draft({
                          ...s02Draft,
                          glassDarkGrey4mmPerSqmEur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded border border-zinc-300 px-2.5 py-1.5 font-mono-tabular font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">€/м²</span>
                  </div>
                </label>

                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Обработка на стъкло (периметър 2×(Ш+В))
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={s02Draft.glassEdgeProcessingPerMeterEur}
                      onChange={(e) =>
                        setS02Draft({
                          ...s02Draft,
                          glassEdgeProcessingPerMeterEur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded border border-zinc-300 px-2.5 py-1.5 font-mono-tabular font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">€/л.м.</span>
                  </div>
                </label>

                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Профил дръжка HEXI черна
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={s02Draft.hexiHandleProfileEur}
                      onChange={(e) =>
                        setS02Draft({
                          ...s02Draft,
                          hexiHandleProfileEur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded border border-zinc-300 px-2.5 py-1.5 font-mono-tabular font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">€/бр.</span>
                  </div>
                </label>

                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Панта Blum ONIX 110° Blumotion (пълен к-т: 71B3550 + 173H7100 + капачки + винт)
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={s02Draft.blumOnixHingeSetEur}
                      onChange={(e) =>
                        setS02Draft({
                          ...s02Draft,
                          blumOnixHingeSetEur: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full rounded border border-zinc-300 px-2.5 py-1.5 font-mono-tabular font-bold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <span className="text-[11px] text-zinc-500 whitespace-nowrap">€/бр.</span>
                  </div>
                </label>

                <label className="block rounded-lg border border-zinc-200 bg-white p-3">
                  <span className="text-[11px] font-semibold text-zinc-700 block">
                    Клас качество на витрините S02
                  </span>
                  <select
                    value={s02Draft.qualityClass || 'high'}
                    onChange={(e) =>
                      setS02Draft({
                        ...s02Draft,
                        qualityClass: e.target.value as QualityClass,
                      })
                    }
                    className="mt-1.5 w-full rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                  >
                    <option value="high">Висок клас</option>
                    <option value="medium">Среден клас</option>
                    <option value="low">Нисък клас</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-white px-4 py-3 text-[11px] text-zinc-700">
                <div className="space-y-0.5 max-w-3xl">
                  <div>
                    <b>Автоматична формула за всяка стъклена витрина в 3D:</b> Рамка според височината
                    (≤1100 / ≤1300 / &gt;1300 мм) + Стъкло (Ш×В×1.05×€/м²) + Обработка (2×(Ш+В)×€/л.м.) +
                    Дръжка HEXI + Панти Blum ONIX (≤1000 мм: 2 бр., ≤1600 мм: 3 бр., &gt;1600 мм: 4 бр.).
                  </div>
                  <div className="text-zinc-500">
                    При задаване на 0.00 € за компонент той не добавя стойност. Всички отворени 3D проекти се преизчисляват веднага след запис.
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={s02Saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-4 py-2 text-xs font-semibold text-[#E5C17B] hover:bg-[#B47B44] hover:text-white transition-colors disabled:opacity-50 shrink-0"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {s02Saving
                      ? lang === 'bg'
                        ? 'Запис...'
                        : 'Saving...'
                      : lang === 'bg'
                        ? 'Запази цените S02'
                        : 'Save S02 Prices'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Main Split Layout: Categories Tree + Subsections & Items */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3 rounded-xl border border-zinc-200 bg-white p-3 space-y-1">
          <button
            type="button"
            onClick={() => {
              setSelectedCategoryId('ALL');
              setSearchQuery('');
            }}
            className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
              selectedCategoryId === 'ALL' && !normalizedQuery
                ? 'bg-[#18181B] text-white'
                : 'text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <span>
              {lang === 'bg'
                ? `Всички ${mergedCategories.length} раздела`
                : `All ${mergedCategories.length} Categories`}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono-tabular text-[10px] ${
                selectedCategoryId === 'ALL' && !normalizedQuery
                  ? 'bg-[#B47B44] text-white'
                  : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              {items.length}
            </span>
          </button>

          <div className="pt-1 border-t border-zinc-100 space-y-1 max-h-[68vh] overflow-y-auto pr-0.5">
            {mergedCategories.map((cat, idx) => {
              const active = selectedCategoryId === cat.id && !normalizedQuery;
              const cnt = countByCategory[cat.id] || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setSearchQuery('');
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    active
                      ? 'bg-[#18181B] text-white font-semibold'
                      : 'text-zinc-700 hover:bg-zinc-100 font-medium'
                  }`}
                >
                  <span className="truncate">
                    <span className="font-mono-tabular opacity-60 mr-1.5">{idx + 1}.</span>
                    {lang === 'bg' ? cat.nameBg : cat.nameEn}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono-tabular text-[10px] ${
                      active
                        ? 'bg-[#B47B44] text-white'
                        : cnt > 0
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {cnt}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {visibleCategories.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-xs text-zinc-500">
              {lang === 'bg'
                ? 'Няма намерени раздели или артикули по това търсене.'
                : 'No matching categories or items found.'}
            </div>
          ) : (
            visibleCategories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-xs"
              >
                <div className="border-b border-zinc-200 bg-zinc-50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B47B44]">
                      {vendor === 'galplas' ? 'GAL PLAS LTD (galplas.bg)' : 'Настех ООД (Пловдив)'} ·{' '}
                      {cat.subsections.length}{' '}
                      {cat.subsections.length === 1
                        ? lang === 'bg'
                          ? 'подраздел'
                          : 'subsection'
                        : lang === 'bg'
                          ? 'подраздела'
                          : 'subsections'}
                    </div>
                    <h4 className="text-base font-bold text-zinc-900">
                      {lang === 'bg' ? cat.nameBg : cat.nameEn}
                    </h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {vendor === 'nasteh' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingCustomSubCatId(
                            addingCustomSubCatId === cat.id ? null : cat.id,
                          );
                          setNewSubNameBg('');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#B47B44]/50 bg-amber-50 px-3 py-1 text-xs font-semibold text-[#8C5A2B] hover:bg-[#B47B44] hover:text-white transition-colors"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        <span>{lang === 'bg' ? '+ Нов подраздел' : '+ New Subsection'}</span>
                      </button>
                    )}
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 font-mono-tabular text-xs font-semibold text-zinc-700">
                      {countByCategory[cat.id] || 0} {lang === 'bg' ? 'артикула' : 'items'}
                    </span>
                  </div>
                </div>

                {/* Add custom subsection form (Nasteh) */}
                {vendor === 'nasteh' && addingCustomSubCatId === cat.id && (
                  <form
                    onSubmit={(e) => handleAddCustomSubsection(cat.id, e)}
                    className="border-b border-amber-200 bg-amber-50/40 px-5 py-3 flex flex-wrap items-center gap-2"
                  >
                    <Layers className="h-4 w-4 text-[#B47B44] shrink-0" />
                    <input
                      type="text"
                      required
                      value={newSubNameBg}
                      onChange={(e) => setNewSubNameBg(e.target.value)}
                      placeholder={
                        lang === 'bg'
                          ? 'Име на новия подраздел в категорията...'
                          : 'New subsection name...'
                      }
                      className="flex-1 min-w-[200px] rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-[#18181B] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#B47B44]"
                    >
                      {lang === 'bg' ? 'Създай подраздел' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingCustomSubCatId(null)}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100"
                    >
                      {lang === 'bg' ? 'Отказ' : 'Cancel'}
                    </button>
                  </form>
                )}

                <div className="divide-y divide-zinc-200">
                  {cat.subsections.map((sub) => {
                    const subKey = `${cat.id}::${sub.id}`;
                    const subItems = items.filter(
                      (it) => it.categoryId === cat.id && it.subsectionId === sub.id,
                    );
                    const filteredSubItems = normalizedQuery
                      ? subItems.filter(
                          (it) =>
                            sub.nameBg.toLowerCase().includes(normalizedQuery) ||
                            cat.nameBg.toLowerCase().includes(normalizedQuery) ||
                            it.name.toLowerCase().includes(normalizedQuery) ||
                            it.sizeLabel.toLowerCase().includes(normalizedQuery) ||
                            it.featureLabel.toLowerCase().includes(normalizedQuery) ||
                            it.brandLevel.toLowerCase().includes(normalizedQuery),
                        )
                      : subItems;

                    if (
                      normalizedQuery &&
                      filteredSubItems.length === 0 &&
                      !sub.nameBg.toLowerCase().includes(normalizedQuery) &&
                      !cat.nameBg.toLowerCase().includes(normalizedQuery)
                    ) {
                      return null;
                    }

                    const isCollapsed = Boolean(collapsedSubs[subKey]);
                    const isAddingHere = addingSubKey === subKey;

                    return (
                      <div key={sub.id} className="p-4 sm:px-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedSubs((prev) => ({ ...prev, [subKey]: !isCollapsed }))
                              }
                              className="flex items-center gap-2 text-left group"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-800" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-[#B47B44]" />
                              )}
                              <span className="text-sm font-semibold text-zinc-900 group-hover:text-[#B47B44] transition-colors">
                                {lang === 'bg' ? sub.nameBg : sub.nameEn}
                              </span>
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-zinc-600">
                                {filteredSubItems.length}
                              </span>
                            </button>
                            {sub.isCustom && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomSubsection(sub)}
                                title={lang === 'bg' ? 'Изтрий подраздела' : 'Delete subsection'}
                                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => openAddForm(cat.id, sub.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#B47B44] transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>{lang === 'bg' ? '+ Добави артикул' : '+ Add Item'}</span>
                          </button>
                        </div>

                        {isAddingHere &&
                          renderDraftForm(
                            addDraft,
                            setAddDraft,
                            (e) => handleConfirmAdd(cat.id, sub.id, e),
                            () => setAddingSubKey(null),
                            lang === 'bg' ? 'Запази артикула' : 'Save Item',
                          )}

                        {!isCollapsed && (
                          <>
                            {filteredSubItems.length === 0 ? (
                              !isAddingHere && (
                                <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/70 px-3.5 py-2.5 text-xs text-zinc-500 flex flex-wrap items-center justify-between gap-2">
                                  <span>
                                    {lang === 'bg'
                                      ? 'Все още няма добавени артикули в този подраздел.'
                                      : 'No items added in this subsection yet.'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openAddForm(cat.id, sub.id)}
                                    className="text-xs font-semibold text-[#B47B44] hover:underline"
                                  >
                                    {lang === 'bg'
                                      ? '+ Добави първия артикул тук'
                                      : '+ Add first item here'}
                                  </button>
                                </div>
                              )
                            ) : (
                              <div className="space-y-2">
                                {filteredSubItems.map((item) => {
                                  const isEditing = editingItemId === item.id;
                                  if (isEditing) {
                                    return (
                                      <div key={item.id}>
                                        {renderDraftForm(
                                          editDraft,
                                          setEditDraft,
                                          (e) => handleConfirmEdit(item.id, e),
                                          () => setEditingItemId(null),
                                          lang === 'bg' ? 'Запази промените' : 'Save Changes',
                                        )}
                                      </div>
                                    );
                                  }

                                  const qMeta =
                                    QUALITY_LABELS[item.qualityClass || 'medium'] ||
                                    QUALITY_LABELS.medium;
                                  const isZeroPrice = Number(item.priceEur || 0) <= 0;

                                  return (
                                    <div
                                      key={item.id}
                                      className={`rounded-lg border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                                        item.active === false || isZeroPrice
                                          ? 'border-zinc-200 bg-zinc-100/70 opacity-75'
                                          : 'border-zinc-200 bg-white hover:border-[#B47B44]/50'
                                      }`}
                                    >
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-xs sm:text-sm font-semibold text-zinc-900">
                                            {item.name}
                                          </span>
                                          {item.sizeLabel && (
                                            <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 font-mono-tabular text-[11px] font-semibold text-amber-900">
                                              {item.sizeLabel}
                                            </span>
                                          )}
                                          <span
                                            className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${qMeta.badgeClass}`}
                                          >
                                            {lang === 'bg' ? qMeta.bg : qMeta.en}
                                          </span>
                                          {item.brandLevel && (
                                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                                              {item.brandLevel}
                                            </span>
                                          )}
                                          {isZeroPrice && (
                                            <span className="rounded bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                              {lang === 'bg'
                                                ? 'Скрит за клиента (0 €)'
                                                : 'Hidden from client (0 €)'}
                                            </span>
                                          )}
                                        </div>
                                        {item.featureLabel && (
                                          <div className="text-xs text-zinc-600">
                                            {item.featureLabel}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <div className="text-right mr-1">
                                          <div className="font-mono-tabular text-sm font-bold text-zinc-900">
                                            {Number(item.priceEur || 0).toFixed(2)} €
                                          </div>
                                          <div className="text-[10px] text-zinc-500">
                                            / {item.unit || 'бр.'}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => handleToggleActive(item)}
                                          title={item.active === false ? 'Активирай' : 'Скрий'}
                                          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium ${
                                            item.active === false
                                              ? 'border-zinc-300 bg-white text-zinc-600'
                                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                          }`}
                                        >
                                          {item.active === false ? (
                                            <EyeOff className="h-3 w-3" />
                                          ) : (
                                            <Eye className="h-3 w-3" />
                                          )}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleStartEdit(item)}
                                          className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:border-[#B47B44] hover:text-[#B47B44] transition-colors"
                                        >
                                          <Pencil className="h-3 w-3" />
                                          <span>{lang === 'bg' ? 'Редактирай' : 'Edit'}</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleDuplicate(item)}
                                          className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 transition-colors"
                                        >
                                          <Copy className="h-3 w-3" />
                                          <span>{lang === 'bg' ? 'Дублирай' : 'Duplicate'}</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleDelete(item)}
                                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-600 hover:text-white transition-colors"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          <span>{lang === 'bg' ? 'Изтрий' : 'Delete'}</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
