import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { MERIT_CATEGORIES } from '../data/meritCatalogDefaults';
import { Language, MeritCatalogItem } from '../types/furniture';

interface AdminMeritCatalogProps {
  lang: Language;
  items: MeritCatalogItem[];
  onSaveItems: (nextItems: MeritCatalogItem[], flashMsg: string) => Promise<void>;
}

interface MeritDraft {
  name: string;
  sizeLabel: string;
  featureLabel: string;
  brandLevel: string;
  unit: string;
  priceEur: number;
  active: boolean;
}

const EMPTY_DRAFT: MeritDraft = {
  name: '',
  sizeLabel: '',
  featureLabel: '',
  brandLevel: 'GTV / Стандартен',
  unit: 'бр.',
  priceEur: 0,
  active: true,
};

const QUICK_SIZES = ['250 мм', '300 мм', '350 мм', '400 мм', '450 мм', '500 мм', '550 мм', '15 см', '20 см', '270 см'];
const QUICK_BRANDS = ['Blum', 'Hettich', 'GTV', 'STARAX', 'Danko', 'Стандартен', 'Бюджетен'];
const QUICK_FEATURES = [
  'Плавно прибиране',
  'Push-open',
  'Пълно изтегляне',
  'Покрит кант',
  'Полупокрит кант',
  'Открит кант',
  '110°',
  '165°',
  'Долен монтаж',
];
const UNITS = ['бр.', 'чифт/компл.', 'компл.', 'л.м.', 'опаковка'];

export const AdminMeritCatalog: React.FC<AdminMeritCatalogProps> = ({
  lang,
  items,
  onSaveItems,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(MERIT_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>({});
  const [addingSubKey, setAddingSubKey] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState<MeritDraft>(EMPTY_DRAFT);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MeritDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const countByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of MERIT_CATEGORIES) map[cat.id] = 0;
    for (const it of items) {
      map[it.categoryId] = (map[it.categoryId] || 0) + 1;
    }
    return map;
  }, [items]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleCategories = useMemo(() => {
    if (normalizedQuery) {
      return MERIT_CATEGORIES.filter((cat) => {
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
    if (selectedCategoryId === 'ALL') return MERIT_CATEGORIES;
    return MERIT_CATEGORIES.filter((c) => c.id === selectedCategoryId);
  }, [selectedCategoryId, normalizedQuery, items]);

  const openAddForm = (categoryId: string, subsectionId: string, preset?: Partial<MeritDraft>) => {
    const key = `${categoryId}::${subsectionId}`;
    setCollapsedSubs((prev) => ({ ...prev, [key]: false }));
    setEditingItemId(null);
    setAddingSubKey(key);
    setAddDraft({
      ...EMPTY_DRAFT,
      ...preset,
    });
  };

  const handleConfirmAdd = async (categoryId: string, subsectionId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!addDraft.name.trim() || saving) return;
    setSaving(true);
    try {
      const id = `merit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newItem: MeritCatalogItem = {
        id,
        categoryId,
        subsectionId,
        name: addDraft.name.trim(),
        sizeLabel: addDraft.sizeLabel.trim(),
        featureLabel: addDraft.featureLabel.trim(),
        brandLevel: addDraft.brandLevel.trim() || 'Стандартен',
        unit: addDraft.unit.trim() || 'бр.',
        priceEur: Math.max(0, Number(addDraft.priceEur) || 0),
        active: addDraft.active,
        updatedAt: new Date().toISOString(),
      };
      await onSaveItems(
        [...items, newItem],
        lang === 'bg'
          ? `Артикулът „${newItem.name}“ е добавен и цените в проекта са обновени!`
          : `Item "${newItem.name}" added and project prices updated!`,
      );
      setAddingSubKey(null);
      setAddDraft(EMPTY_DRAFT);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (item: MeritCatalogItem) => {
    setAddingSubKey(null);
    setEditingItemId(item.id);
    setEditDraft({
      name: item.name,
      sizeLabel: item.sizeLabel,
      featureLabel: item.featureLabel,
      brandLevel: item.brandLevel,
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
              unit: editDraft.unit.trim() || 'бр.',
              priceEur: Math.max(0, Number(editDraft.priceEur) || 0),
              active: editDraft.active,
              updatedAt: new Date().toISOString(),
            }
          : it,
      );
      await onSaveItems(
        next,
        lang === 'bg'
          ? 'Артикулът и цената му са обновени — 3D проектите се преизчисляват автоматично!'
          : 'Merit item updated and 3D quotes recalculated!',
      );
      setEditingItemId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = (item: MeritCatalogItem) => {
    openAddForm(item.categoryId, item.subsectionId, {
      name: item.name,
      sizeLabel: item.sizeLabel,
      featureLabel: item.featureLabel,
      brandLevel: item.brandLevel,
      unit: item.unit,
      priceEur: item.priceEur,
      active: item.active !== false,
    });
  };

  const handleDelete = async (item: MeritCatalogItem) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = items.filter((it) => it.id !== item.id);
      if (editingItemId === item.id) setEditingItemId(null);
      await onSaveItems(
        next,
        lang === 'bg'
          ? `Артикулът „${item.name}“ е изтрит.`
          : `Deleted "${item.name}".`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: MeritCatalogItem) => {
    if (saving) return;
    setSaving(true);
    try {
      const next = items.map((it) =>
        it.id === item.id ? { ...it, active: it.active === false, updatedAt: new Date().toISOString() } : it,
      );
      await onSaveItems(
        next,
        lang === 'bg'
          ? `Артикулът „${item.name}“ е ${item.active === false ? 'активиран' : 'скрит'}.`
          : `Item visibility updated.`,
      );
    } finally {
      setSaving(false);
    }
  };

  const renderDraftForm = (
    draft: MeritDraft,
    setDraft: React.Dispatch<React.SetStateAction<MeritDraft>>,
    onSubmit: (e: React.FormEvent) => void,
    onCancel: () => void,
    submitLabel: string,
  ) => (
    <form
      onSubmit={onSubmit}
      className="mt-2 rounded-xl border-2 border-[#B47B44]/50 bg-[#FDFBF7] p-4 space-y-3 shadow-xs"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="block sm:col-span-2 lg:col-span-2">
          <span className="text-[11px] font-semibold text-zinc-700">
            {lang === 'bg' ? 'Наименование / Модел *' : 'Item Name / Model *'}
          </span>
          <input
            type="text"
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="напр. Скрит водач долен монтаж 3D реглаж"
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
            placeholder="напр. 450 мм / 15 см / 270 см"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-mono-tabular text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          />
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
            placeholder="напр. плавно прибиране, пълно изтегляне, 30 кг, 110°"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-semibold text-zinc-700">
            {lang === 'bg' ? 'Марка / Ниво' : 'Brand / Tier'}
          </span>
          <input
            type="text"
            value={draft.brandLevel}
            onChange={(e) => setDraft({ ...draft, brandLevel: e.target.value })}
            placeholder="Blum, Hettich, GTV, STARAX..."
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-zinc-700">
              {lang === 'bg' ? 'Единица' : 'Unit'}
            </span>
            <select
              value={UNITS.includes(draft.unit) ? draft.unit : 'custom'}
              onChange={(e) => {
                if (e.target.value !== 'custom') {
                  setDraft({ ...draft, unit: e.target.value });
                }
              }}
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
              ? 'Активен за избор и офериране в 3D конфигуратора'
              : 'Active for selection & quoting in 3D configurator'}
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

  return (
    <div className="space-y-5">
      {/* Top Merit Catalog Header & Search */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B47B44]/15 text-[#B47B44] shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900">
              {lang === 'bg'
                ? 'Пълен каталог обков и механизми — Мерит (meritbg.com)'
                : 'Complete Hardware & Mechanisms Catalog — Merit (meritbg.com)'}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {lang === 'bg'
                ? `19 основни раздела · 66 подраздела · ${items.length} въведени артикула. Промяната на цена или размер преизчислява автоматично активните 3D проекти.`
                : `19 categories · 66 subsections · ${items.length} saved items. Price updates automatically recalculate 3D project quotes.`}
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
                  ? 'Търси раздел, модел, размер, марка...'
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

      {/* Main Split Layout: 19 Categories Tree + Subsections & Items */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Sidebar: All 19 Categories */}
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
            <span>{lang === 'bg' ? 'Всички 19 раздела (66 подраздела)' : 'All 19 Categories'}</span>
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
            {MERIT_CATEGORIES.map((cat, idx) => {
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

        {/* Right Panel: Selected Category (or Search Matches) Subsections & Articles */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {visibleCategories.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-xs text-zinc-500">
              {lang === 'bg'
                ? 'Няма намерени раздели или артикули по това търсене.'
                : 'No matching Merit categories or items found.'}
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
                      meritbg.com · {cat.subsections.length}{' '}
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
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 font-mono-tabular text-xs font-semibold text-zinc-700">
                    {countByCategory[cat.id] || 0}{' '}
                    {lang === 'bg' ? 'артикула' : 'items'}
                  </span>
                </div>

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
                        {/* Subsection Header + "+ Добави артикул" Button */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
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

                        {/* Items List under Subsection */}
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

                                  return (
                                    <div
                                      key={item.id}
                                      className={`rounded-lg border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                                        item.active === false
                                          ? 'border-zinc-200 bg-zinc-100/70 opacity-65'
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
                                          {item.brandLevel && (
                                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                                              {item.brandLevel}
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
