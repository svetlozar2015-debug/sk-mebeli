import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  ImagePlus,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { ADMIN_EMAIL, DEFAULT_PRICING_CONFIG, STARTER_PRESETS } from '../data/catalogDefaults';
import { DEFAULT_MERIT_ITEMS } from '../data/meritCatalogDefaults';
import {
  DEFAULT_GALPLAS_ITEMS,
  DEFAULT_NASTEH_ITEMS,
  GALPLAS_CATEGORIES,
  NASTEH_CATEGORIES,
} from '../data/partnerCatalogDefaults';
import { resolveGalleryImageUrl } from '../data/localImages';
import {
  columnHasVitrine,
  getBayCarcassDepthMm,
  getBayFrontThicknessMm,
  resolveDrawerSlideLengthMm,
  upperBayHasVitrine,
} from '../lib/carpentryEngine';
import { AUTOCAD_3D_DXF_FILENAME, generateFurnitureDxf } from '../lib/dxfExport';
import {
  buildProject3DJson,
  buildProjectBomEmailReport,
  parseProject3DJson,
  PROJECT_3D_JSON_FILENAME,
  triggerBrowserFileDownload,
} from '../lib/projectPackage';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { t } from '../lib/i18n';
import {
  BoardDecor,
  DecorCategory,
  DecorPriceGroup,
  FurnitureCategory,
  FurnitureConfig,
  GalleryProject,
  HardwareTier,
  HardwareTierLevel,
  HardwareUnitPricing,
  Language,
  Manufacturer,
  MaterialType,
  MeritCatalogItem,
  PartnerCatalogItem,
  PartnerSubsectionDef,
  PricingConfig,
  ProjectMessage,
  ProjectStatus,
  QuoteResponse,
  SiteSettings,
  UserProject,
  VitrineS02Pricing,
} from '../types/furniture';
import { AdminMeritCatalog } from './AdminMeritCatalog';
import { AdminPartnerCatalog } from './AdminPartnerCatalog';

interface AdminStudioProps {
  lang: Language;
  user: User | null;
  adminToken?: string | null;
  siteSettings: SiteSettings;
  decors: BoardDecor[];
  hardwareTiers: HardwareTier[];
  meritItems?: MeritCatalogItem[];
  galplasItems?: PartnerCatalogItem[];
  nastehItems?: PartnerCatalogItem[];
  nastehCustomSubsections?: PartnerSubsectionDef[];
  gallery: GalleryProject[];
  onInspectIn3D: (project: UserProject) => void;
  onCatalogUpdated?: () => void;
}

type AdminTab =
  | 'overview'
  | 'inquiries'
  | 'boards'
  | 'hardware'
  | 'merit'
  | 'galplas'
  | 'nasteh'
  | 'margin'
  | 'gallery'
  | 'company';

function mergeHwPrices(
  rawHw?: Record<string, HardwareUnitPricing>,
): Record<string, HardwareUnitPricing> {
  const merged: Record<string, HardwareUnitPricing> = {};
  for (const [k, defRates] of Object.entries(DEFAULT_PRICING_CONFIG.hardwarePrices)) {
    merged[k] = { ...defRates, ...(rawHw?.[k] || {}) };
  }
  for (const [k, customRates] of Object.entries(rawHw || {})) {
    if (!merged[k]) merged[k] = customRates;
  }
  return merged;
}

interface ContactInquiryEntry {
  id: string;
  name: string;
  contact: string;
  message: string;
  createdAt: string;
}

async function compressImageFileToDataUrl(file: File, maxDim = 1100): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const webpUrl = canvas.toDataURL('image/webp', 0.82);
        if (webpUrl.startsWith('data:image/webp')) {
          resolve(webpUrl);
        } else {
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        }
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const AdminStudio: React.FC<AdminStudioProps> = ({
  lang,
  user,
  adminToken,
  siteSettings,
  decors,
  hardwareTiers,
  meritItems = DEFAULT_MERIT_ITEMS,
  galplasItems = DEFAULT_GALPLAS_ITEMS,
  nastehItems = DEFAULT_NASTEH_ITEMS,
  nastehCustomSubsections = [],
  gallery,
  onInspectIn3D,
  onCatalogUpdated,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [contactMessages, setContactMessages] = useState<ContactInquiryEntry[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const isFirebaseAdmin = Boolean(user && user.email === ADMIN_EMAIL && user.emailVerified);

  const getAdminAuthHeader = async (): Promise<string | null> => {
    if (adminToken) return `Bearer ${adminToken}`;
    if (user) {
      const tok = await user.getIdToken();
      return `Bearer ${tok}`;
    }
    return null;
  };

  // Inquiries, Client CRM & Projects Search (handles 400-500+ projects smoothly!)
  const [firestoreProjects, setFirestoreProjects] = useState<UserProject[]>([]);
  const [crmProjects, setCrmProjects] = useState<UserProject[]>([]);
  const [crmViewMode, setCrmViewMode] = useState<'projects' | 'clients'>('projects');
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const [searchCode, setSearchCode] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UserProject['status']>('ALL');
  const [selectedProjId, setSelectedProjId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<QuoteResponse | null>(null);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [adminReply, setAdminReply] = useState('');
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [sendingOffer, setSendingOffer] = useState(false);
  const [bomReportCopied, setBomReportCopied] = useState(false);
  const [bomPanelExpanded, setBomPanelExpanded] = useState(true);
  const adminJsonImportRef = React.useRef<HTMLInputElement | null>(null);

  // Board catalog filter & new decor form
  const [boardBrandFilter, setBoardBrandFilter] = useState<Manufacturer | 'ALL'>('ALL');
  const [newDecor, setNewDecor] = useState({
    manufacturer: 'Egger' as Manufacturer,
    code: '',
    nameBg: '',
    nameEn: '',
    category: 'wood' as DecorCategory,
    materialType: 'MFC' as MaterialType,
    priceGroup: 2 as DecorPriceGroup,
    colorHex: '#B68A58',
    grainHex: '#6F4B27',
    thicknessMm: 18,
    pricePerSqm: 32,
  });

  // New hardware manufacturer / series form
  const [newHw, setNewHw] = useState({
    brand: '',
    tier: 'premium' as HardwareTierLevel,
    nameBg: '',
    nameEn: '',
    descriptionBg: '',
    warrantyYears: 10,
    loadCapacityKg: 45,
    softClose: true,
    hingeEur: 6.5,
    drawerSlideEur: 28.0,
    liftEur: 36.0,
    hangerEur: 5.0,
    handleEur: 7.0,
    legEur: 2.5,
  });

  // Gallery upload, drag-and-drop, slideshow ordering & inline edit state
  const [gallerySectionFilter, setGallerySectionFilter] = useState<'all' | FurnitureCategory>('all');
  const [galleryDragOver, setGalleryDragOver] = useState(false);
  const [cardDragOverId, setCardDragOverId] = useState<string | null>(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [gallerySavingOrder, setGallerySavingOrder] = useState(false);
  const [orderInputs, setOrderInputs] = useState<Record<string, string>>({});
  const [editingGalleryId, setEditingGalleryId] = useState<string | null>(null);
  const [editGalleryDraft, setEditGalleryDraft] = useState<{
    titleBg: string;
    titleEn: string;
    category: FurnitureCategory;
    dimensionsLabel: string;
    materialsLabel: string;
    imageUrl: string;
  } | null>(null);
  const [galForm, setGalForm] = useState({
    titleBg: '',
    titleEn: '',
    category: 'kitchen' as FurnitureCategory,
    dimensionsLabel: '240 × 220 × 58 см',
    materialsLabel: 'Egger + Blum',
    imageUrl: '',
    presetId: STARTER_PRESETS[0].id,
  });

  const orderedGallery = useMemo(
    () =>
      [...gallery].sort((a, b) => {
        const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        return ao - bo;
      }),
    [gallery],
  );

  useEffect(() => {
    const nextInputs: Record<string, string> = {};
    orderedGallery.forEach((item, idx) => {
      nextInputs[item.id] = String(idx + 1);
    });
    setOrderInputs(nextInputs);
  }, [orderedGallery]);

  // Gallery slideshow speed control (3-12 seconds per photo)
  const [slideIntervalSec, setSlideIntervalSec] = useState<number>(() => {
    const raw = siteSettings.gallerySlideIntervalSec;
    return typeof raw === 'number' ? Math.min(12, Math.max(3, Math.round(raw))) : 5;
  });
  const [savingSlideSpeed, setSavingSlideSpeed] = useState(false);

  // Company profile form
  const [companyForm, setCompanyForm] = useState<SiteSettings>(siteSettings);
  useEffect(() => {
    setCompanyForm(siteSettings);
    const raw = siteSettings.gallerySlideIntervalSec;
    setSlideIntervalSec(
      typeof raw === 'number' ? Math.min(12, Math.max(3, Math.round(raw))) : 5,
    );
  }, [siteSettings]);

  // Load private pricing from server + Firestore (when Google Admin authed)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authHdr = await getAdminAuthHeader();
        if (!authHdr) return;
        const resp = await fetch('/api/admin/pricing', {
          headers: { Authorization: authHdr },
        });
        if (resp.ok && !cancelled) {
          const raw = (await resp.json()) as PricingConfig;
          setPricing({
            ...DEFAULT_PRICING_CONFIG,
            ...raw,
            boardGroupMultipliers: {
              group1: raw.boardGroupMultipliers?.group1 ?? 1.0,
              group2: raw.boardGroupMultipliers?.group2 ?? 1.12,
              group3: raw.boardGroupMultipliers?.group3 ?? 1.35,
            },
            boardPricesPerSqm: {
              ...DEFAULT_PRICING_CONFIG.boardPricesPerSqm,
              ...(raw.boardPricesPerSqm || {}),
            },
            hardwarePrices: mergeHwPrices(raw.hardwarePrices),
          });
        }
      } catch (err) {
        console.warn('Could not load pricing from server:', err);
      }
    })();

    if (!isFirebaseAdmin) {
      return () => {
        cancelled = true;
      };
    }

    const unsub = onSnapshot(
      doc(db, 'pricing_config', 'main'),
      async (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as PricingConfig;
          const data: PricingConfig = {
            ...DEFAULT_PRICING_CONFIG,
            ...raw,
            boardGroupMultipliers: {
              group1: raw.boardGroupMultipliers?.group1 ?? 1.0,
              group2: raw.boardGroupMultipliers?.group2 ?? 1.12,
              group3: raw.boardGroupMultipliers?.group3 ?? 1.35,
            },
            boardPricesPerSqm: {
              ...DEFAULT_PRICING_CONFIG.boardPricesPerSqm,
              ...(raw.boardPricesPerSqm || {}),
            },
            hardwarePrices: mergeHwPrices(raw.hardwarePrices),
          };
          setPricing(data);
          try {
            const authHdr = await getAdminAuthHeader();
            if (authHdr) {
              await fetch('/api/admin/pricing', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: authHdr,
                },
                body: JSON.stringify({ pricing: data }),
              });
            }
          } catch (syncErr) {
            console.warn('Could not sync pricing to server:', syncErr);
          }
        }
      },
      (err) => console.warn('Firestore pricing listener warning:', err),
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user, adminToken, isFirebaseAdmin]);

  // Load server-side CRM projects (available both in 1-click Admin mode & Firebase Admin mode)
  const loadCrmProjects = async () => {
    try {
      const authHdr = await getAdminAuthHeader();
      if (!authHdr) return;
      const resp = await fetch('/api/admin/crm-projects', {
        headers: { Authorization: authHdr },
      });
      if (resp.ok) {
        const data = (await resp.json()) as { projects?: UserProject[] };
        setCrmProjects(data.projects || []);
      }
    } catch (err) {
      console.warn('Could not load CRM projects:', err);
    }
  };

  useEffect(() => {
    loadCrmProjects();
  }, [user, adminToken]);

  // Load all client projects (Firestore Admin)
  useEffect(() => {
    if (!isFirebaseAdmin) {
      setFirestoreProjects([]);
      return;
    }
    const q = query(collection(db, 'user_projects'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: UserProject[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            projectCode: data.projectCode,
            ownerId: data.ownerId,
            ownerEmail: data.ownerEmail,
            ownerName: data.ownerName,
            customerPhone: data.customerPhone,
            title: data.title,
            config: data.config as FurnitureConfig,
            calculatedPriceEur: data.calculatedPriceEur,
            status: data.status,
            initialQuestion: data.initialQuestion,
            adminNote: data.adminNote,
            publishedToTemplates: data.publishedToTemplates,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString('bg-BG') : '',
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toLocaleString('bg-BG') : '',
          };
        });
        setFirestoreProjects(rows);
      },
      (err) => console.warn('Firestore user_projects listener warning:', err),
    );
    return () => unsub();
  }, [isFirebaseAdmin]);

  // Merge Firestore + Server CRM mirror seamlessly
  const allProjects = useMemo(() => {
    const map = new Map<string, UserProject>();
    for (const p of crmProjects) {
      map.set(p.projectCode || p.id, p);
    }
    for (const fp of firestoreProjects) {
      const key = fp.projectCode || fp.id;
      const existing = map.get(key);
      map.set(key, {
        ...existing,
        ...fp,
        crmMessages: existing?.crmMessages || fp.crmMessages || [],
        adminNote: existing?.adminNote || fp.adminNote || '',
        bomReportText: existing?.bomReportText || fp.bomReportText,
        emailDeliveryMode: existing?.emailDeliveryMode || fp.emailDeliveryMode,
        emailSentAt: existing?.emailSentAt || fp.emailSentAt,
      });
    }
    return Array.from(map.values());
  }, [crmProjects, firestoreProjects]);

  useEffect(() => {
    if (!selectedProjId && allProjects.length > 0) {
      setSelectedProjId(allProjects[0].id);
    }
  }, [allProjects, selectedProjId]);

  const filteredProjects = useMemo(() => {
    return allProjects.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (searchCode.trim()) {
        const s = searchCode.trim().toLowerCase();
        return (
          p.projectCode.toLowerCase().includes(s) ||
          (p.ownerName || '').toLowerCase().includes(s) ||
          p.ownerEmail.toLowerCase().includes(s) ||
          (p.customerPhone || '').toLowerCase().includes(s) ||
          p.title.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [allProjects, searchCode, statusFilter]);

  const crmClients = useMemo(() => {
    const groups = new Map<
      string,
      {
        clientKey: string;
        ownerName: string;
        ownerEmail: string;
        customerPhone: string;
        projects: UserProject[];
        draftsCount: number;
        inquiriesCount: number;
        approvedCount: number;
        totalValueEur: number;
        lastUpdated: string;
      }
    >();

    for (const p of filteredProjects) {
      const key = (p.ownerEmail || p.customerPhone || p.ownerName || p.id).toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.projects.push(p);
        if (p.status === 'draft') existing.draftsCount += 1;
        else if (
          p.status === 'approved' ||
          p.status === 'in_production' ||
          p.status === 'ready_for_install'
        )
          existing.approvedCount += 1;
        else existing.inquiriesCount += 1;
        existing.totalValueEur += p.calculatedPriceEur || 0;
        if (!existing.customerPhone && p.customerPhone) existing.customerPhone = p.customerPhone;
        if (!existing.ownerName && p.ownerName) existing.ownerName = p.ownerName;
      } else {
        groups.set(key, {
          clientKey: key,
          ownerName: p.ownerName || p.ownerEmail || 'Клиент',
          ownerEmail: p.ownerEmail || '',
          customerPhone: p.customerPhone || '',
          projects: [p],
          draftsCount: p.status === 'draft' ? 1 : 0,
          inquiriesCount: p.status === 'inquiry_sent' || p.status === 'under_review' ? 1 : 0,
          approvedCount:
            p.status === 'approved' ||
            p.status === 'in_production' ||
            p.status === 'ready_for_install'
              ? 1
              : 0,
          totalValueEur: p.calculatedPriceEur || 0,
          lastUpdated: p.updatedAt || p.createdAt || '',
        });
      }
    }
    return Array.from(groups.values());
  }, [filteredProjects]);

  const activeProj =
    filteredProjects.find((p) => p.id === selectedProjId) || filteredProjects[0] || null;

  const activeProjectBomReport = useMemo(() => {
    if (!activeProj) return null;
    return buildProjectBomEmailReport({
      projectCode: activeProj.projectCode,
      title: activeProj.title,
      clientName: activeProj.ownerName,
      clientEmail: activeProj.ownerEmail,
      clientPhone: activeProj.customerPhone,
      questionText: activeProj.initialQuestion,
      totalPriceEur: selectedQuote?.totalPriceEur ?? activeProj.calculatedPriceEur ?? 0,
      config: activeProj.config,
      decors,
      hardwareTiers,
      meritItems,
      partnerItems: [...galplasItems, ...nastehItems],
    });
  }, [
    activeProj,
    selectedQuote?.totalPriceEur,
    decors,
    hardwareTiers,
    meritItems,
    galplasItems,
    nastehItems,
  ]);

  const loadContactMessages = async () => {
    setContactsLoading(true);
    try {
      const authHdr = await getAdminAuthHeader();
      if (!authHdr) return;
      const resp = await fetch('/api/admin/contacts', {
        headers: { Authorization: authHdr },
      });
      if (resp.ok) {
        const data = (await resp.json()) as { contacts?: ContactInquiryEntry[] };
        setContactMessages(data.contacts || []);
      }
    } catch (err) {
      console.warn('Could not load contact inquiries:', err);
    } finally {
      setContactsLoading(false);
    }
  };

  useEffect(() => {
    loadContactMessages();
  }, [user, adminToken]);

  const kpiStats = useMemo(() => {
    const total = allProjects.length;
    const activeInquiries = allProjects.filter(
      (p) => p.status === 'inquiry_sent' || p.status === 'under_review',
    ).length;
    const approved = allProjects.filter(
      (p) =>
        p.status === 'approved' ||
        p.status === 'in_production' ||
        p.status === 'ready_for_install',
    ).length;
    const avgEur =
      total > 0
        ? Math.round(allProjects.reduce((acc, p) => acc + (p.calculatedPriceEur || 0), 0) / total)
        : 0;
    const activeDecors = decors.filter((d) => d.active !== false).length;
    return { total, activeInquiries, approved, avgEur, activeDecors };
  }, [allProjects, decors]);

  // Fetch secret Admin cost/profit breakdown for selected client project
  useEffect(() => {
    if (!activeProj) {
      setSelectedQuote(null);
      setMessages([]);
      return;
    }
    setAdminNoteDraft(activeProj.adminNote || '');
    let cancelled = false;
    (async () => {
      try {
        const authHdr = await getAdminAuthHeader();
        if (!authHdr) return;
        const resp = await fetch('/api/quote/calculate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHdr,
          },
          body: JSON.stringify({ config: activeProj.config }),
        });
        if (resp.ok && !cancelled) {
          setSelectedQuote((await resp.json()) as QuoteResponse);
        }
      } catch (err) {
        console.error(err);
      }
    })();

    if (!isFirebaseAdmin) {
      setMessages([]);
      return () => {
        cancelled = true;
      };
    }

    const qMsg = query(
      collection(db, 'user_projects', activeProj.id, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsubMsg = onSnapshot(
      qMsg,
      (snap) => {
        setMessages(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              projectOwnerId: data.projectOwnerId,
              senderId: data.senderId,
              senderRole: data.senderRole,
              senderName: data.senderName,
              text: data.text,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString('bg-BG') : '',
            };
          }),
        );
      },
      (err) => console.warn('Admin project messages listener warning:', err),
    );

    return () => {
      cancelled = true;
      unsubMsg();
    };
  }, [activeProj?.id, user, isFirebaseAdmin]);

  const flashBanner = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => setStatusBanner(null), 4000);
  };

  const getStatusLabel = (s: ProjectStatus) => {
    switch (s) {
      case 'draft':
        return lang === 'bg' ? 'Чернова (още чертае)' : 'Draft';
      case 'inquiry_sent':
        return lang === 'bg' ? 'Изпратено за запитване' : 'Inquiry Sent';
      case 'under_review':
        return lang === 'bg' ? 'В обсъждане' : 'In Review';
      case 'approved':
        return lang === 'bg' ? 'Одобрено / Чака замерване' : 'Approved / Awaiting Measure';
      case 'in_production':
        return lang === 'bg' ? 'В производство (в цеха)' : 'In Production';
      case 'ready_for_install':
        return lang === 'bg' ? 'Готово за монтаж / Доставено' : 'Ready for Install / Delivered';
      default:
        return s;
    }
  };

  const handleDownloadCutListCsv = (proj: UserProject, quote: QuoteResponse | null) => {
    const carcassDecor = decors.find((d) => d.id === proj.config.carcassDecorId);
    const frontDecor = decors.find((d) => d.id === proj.config.frontDecorId);
    const hwTier = hardwareTiers.find((h) => h.id === proj.config.hardwareTierId);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines: string[] = [];
    lines.push(['ПРОЕКТ КОД', proj.projectCode, 'ЗАГЛАВИЕ', proj.title].map(esc).join(','));
    lines.push(
      [
        'КАТЕГОРИЯ',
        proj.config.category,
        'ФОРМА',
        proj.config.layoutShape,
        'ОБЩИ РАЗМЕРИ (Ш x В x Д см)',
        `${proj.config.widthCm} x ${proj.config.heightCm} x ${proj.config.depthCm}`,
        'ЦОКЪЛ (см)',
        proj.config.plinthCm,
      ]
        .map(esc)
        .join(','),
    );
    lines.push(
      [
        'КОРПУС ДЕКОР',
        carcassDecor ? `${carcassDecor.manufacturer} ${carcassDecor.code} (${carcassDecor.nameBg})` : proj.config.carcassDecorId,
        'ЛИЦЕ ДЕКОР',
        frontDecor ? `${frontDecor.manufacturer} ${frontDecor.code} (${frontDecor.nameBg})` : proj.config.frontDecorId,
        'ОБКОВ',
        hwTier ? `${hwTier.brand} - ${hwTier.nameBg}` : proj.config.hardwareTierId,
        'ДРЪЖКИ / ПРОФИЛ',
        proj.config.handleStyle,
      ]
        .map(esc)
        .join(','),
    );
    lines.push('');
    lines.push(
      [
        'Редица',
        'Модул №',
        'Ширина (мм)',
        'Височина (мм)',
        'Дълбочина корпус (мм)',
        'Лице / Профил (мм)',
        'Горен шкаф',
        'Секция / Тип врати/чекмеджета/уред',
        'Рафтове',
        'Чекмеджета',
        'Водачи',
      ]
        .map(esc)
        .join(','),
    );

    const pushRowBays = (rowLabel: string, cols: FurnitureConfig['columns']) => {
      cols.forEach((col, idx) => {
        const bayHeightMm = Math.round((col.heightCm || proj.config.heightCm) * 10);
        const colPlinthMm = col.isSuspended ? 0 : Math.round((proj.config.plinthCm || 0) * 10);
        const carcassHeightMm = Math.max(0, bayHeightMm - colPlinthMm);
        const bayDepthMm = getBayCarcassDepthMm(proj.config, col, false);
        const frontThicknessMm = getBayFrontThicknessMm(col, false);
        const hasLowerVitrine = columnHasVitrine(col);
        const upperDepthMm = getBayCarcassDepthMm(proj.config, col, true);
        const upperFrontMm = getBayFrontThicknessMm(col, true);
        const upperDesc = proj.config.includeUpperCabinets
          ? `${col.upperType || 'doors'} (${upperDepthMm}мм корпус / ${upperFrontMm}мм${upperBayHasVitrine(col) ? ' S02' : ''})`
          : 'none';
        const colSlots = col.slots || [];
        const rSum = colSlots.reduce((s, sl) => s + Math.max(0.1, sl.heightRatio), 0) || 1;
        colSlots.forEach((slot) => {
          const slotH = Math.round(carcassHeightMm * (Math.max(0.1, slot.heightRatio) / rSum));
          const drawerMatch = slot.type.startsWith('drawers_')
            ? slot.drawerCount ?? Number(slot.type.split('_')[1] || 0)
            : 0;
          const slideLenMm = drawerMatch > 0 ? resolveDrawerSlideLengthMm(bayDepthMm) : 0;
          lines.push(
            [
              rowLabel,
              idx + 1,
              Math.round(col.widthCm * 10),
              slotH,
              bayDepthMm,
              hasLowerVitrine ? `${frontThicknessMm} мм (Витрина S02, -2 мм корпус)` : `${frontThicknessMm} мм`,
              upperDesc,
              slot.type,
              slot.internalShelves ?? 0,
              drawerMatch,
              drawerMatch > 0 ? `${slot.drawerSlideType || 'standard'} (${slideLenMm} мм)` : slot.drawerSlideType || 'standard',
            ]
              .map(esc)
              .join(','),
          );
        });
      });
    };

    pushRowBays('Основна стена', proj.config.columns || []);
    if (proj.config.layoutShape === 'l_shape' && (proj.config.wingColumns || []).length > 0) {
      pushRowBays('Перпендикулярно крило', proj.config.wingColumns || []);
    }

    if (quote?.adminBreakdown?.bom) {
      const b = quote.adminBreakdown.bom;
      lines.push('');
      lines.push(['РАЗХОДНА НОРМА (BOM) И КАЛКУЛАЦИЯ', 'СТОЙНОСТ'].map(esc).join(','));
      lines.push(['Плочи корпус (м²)', b.carcassAreaSqm.toFixed(2)].map(esc).join(','));
      lines.push(['Плочи лице (м²)', b.frontAreaSqm.toFixed(2)].map(esc).join(','));
      lines.push(['HDF гръб 4мм (м²)', b.hdfBackAreaSqm.toFixed(2)].map(esc).join(','));
      lines.push(['Брой стандартни плочи (2.8x2.07м)', b.sheetsEstimated].map(esc).join(','));
      lines.push(['ABS кант (л.м.)', b.edgeBandingMeters].map(esc).join(','));
      lines.push(['Панти (бр.)', b.hingesCount].map(esc).join(','));
      lines.push(['Водачи чекмеджета (чифта)', b.drawerSlidePairs].map(esc).join(','));
      if (b.drawerSlidePairsByLength && Object.keys(b.drawerSlidePairsByLength).length > 0) {
        const byLenSummary = Object.entries(b.drawerSlidePairsByLength)
          .sort(([a], [bLen]) => Number(a) - Number(bLen))
          .map(([len, qty]) => `${len}мм × ${qty} чифта`)
          .join('; ');
        lines.push(['Водачи по дължина', byLenSummary].map(esc).join(','));
      }
      lines.push(['Клапи / Лифт механизми (бр.)', b.liftMechanismsCount].map(esc).join(','));
      lines.push(['Окачвачи (бр.)', b.wallHangersCount].map(esc).join(','));
      lines.push(['Дръжки (бр.)', b.handlesCount].map(esc).join(','));
      lines.push(['Крачета (бр.)', b.legsCount].map(esc).join(','));
      lines.push(['Gola L-профил (л.м.)', b.golaLMeters ?? 0].map(esc).join(','));
      lines.push(['Gola C-профил (л.м.)', b.golaCMeters ?? 0].map(esc).join(','));
      lines.push(['Горен LED / вкопан профил (л.м.)', b.upperProfileMeters ?? 0].map(esc).join(','));
      lines.push(['Работен плот (л.м.)', b.countertopMeters].map(esc).join(','));
      lines.push(['Термо гръб (м²)', b.backsplashAreaSqm ?? 0].map(esc).join(','));
      lines.push(['Стъклени витрини + алу. рамка S02 20мм (м²)', b.glassFrontAreaSqm ?? 0].map(esc).join(','));
      if ((b.vitrineDoors || []).length > 0) {
        const vitrineSummary = b.vitrineDoors!
          .map((vd) => `${vd.widthMm}x${vd.heightMm}мм`)
          .join('; ');
        lines.push([`Витрини S02 20мм (${b.vitrineDoors!.length} бр.)`, vitrineSummary].map(esc).join(','));
      }
      lines.push(['Карго кошници (бр.)', b.cargoBasketsCount ?? 0].map(esc).join(','));
      lines.push(['Ъглов механизъм Бъбрек/Magic Corner (бр.)', b.cornerMechanismsCount ?? 0].map(esc).join(','));
      lines.push(['Релси плъзгащи врати (л.м.)', b.slidingTrackMeters ?? 0].map(esc).join(','));
      lines.push(['Релси пръти по 3м (бр.)', b.slidingRailBars3m ?? 0].map(esc).join(','));
      lines.push(['Фира/остатък релси (м)', b.slidingRailWasteMeters ?? 0].map(esc).join(','));
      lines.push(['Кант-дръжки пръти по 3м (бр.)', b.slidingHandleBars3m ?? 0].map(esc).join(','));
      lines.push(['Фира/остатък кант-дръжки (м)', b.slidingHandleWasteMeters ?? 0].map(esc).join(','));
      lines.push(['Лост за дрехи (л.м.)', b.clothesRailsMeters ?? 0].map(esc).join(','));
      lines.push(['Цокъл PVC/Алу (л.м.)', b.plinthMeters ?? 0].map(esc).join(','));
      lines.push(['Водобранна лайсна (л.м.)', b.waterSealMeters ?? 0].map(esc).join(','));
      lines.push(['Изрязване отвори уреди/мивка (бр.)', b.cutoutsCount ?? 0].map(esc).join(','));
      lines.push(['Фрезоване сглобка плот 90° (бр.)', b.cornerMillingCount ?? 0].map(esc).join(','));
      lines.push(['Транспорт, логистика и качване (€)', quote.logisticsFeeEur ?? 0].map(esc).join(','));
      lines.push(['Себестойност материали + обков (€)', quote.adminBreakdown.rawCostEur].map(esc).join(','));
      lines.push([`Надценка изработка (${quote.adminBreakdown.craftsmanshipPercent}%) (€)`, quote.adminBreakdown.craftsmanshipProfitEur].map(esc).join(','));
      lines.push([`Общ процент върху крайната сума (${quote.adminBreakdown.globalMarginPercent ?? 0}%) (€)`, quote.adminBreakdown.globalMarginEur ?? 0].map(esc).join(','));
      lines.push(['КРАЙНА КЛИЕНТСКА ЦЕНА (€)', quote.totalPriceEur].map(esc).join(','));
    }

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.projectCode}-razkroi-bom.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAutoCadDxf = (proj: UserProject) => {
    const dxfContent = generateFurnitureDxf(proj.config, proj.projectCode);
    triggerBrowserFileDownload(
      `${proj.projectCode}-${AUTOCAD_3D_DXF_FILENAME}`,
      dxfContent,
      'application/dxf;charset=utf-8;',
    );
  };

  const handleDownloadProjectJson = (proj: UserProject) => {
    const hwTier = hardwareTiers.find((h) => h.id === proj.config.hardwareTierId);
    const jsonContent = buildProject3DJson({
      config: proj.config,
      projectCode: proj.projectCode,
      title: proj.title,
      totalPriceEur: selectedQuote?.totalPriceEur ?? proj.calculatedPriceEur ?? 0,
      hardwareTier: hwTier,
      clientName: proj.ownerName,
      clientEmail: proj.ownerEmail,
      clientPhone: proj.customerPhone,
      notes: proj.initialQuestion,
    });
    triggerBrowserFileDownload(
      `${proj.projectCode}-${PROJECT_3D_JSON_FILENAME}`,
      jsonContent,
      'application/json;charset=utf-8;',
    );
  };

  const handleDownloadFullPackage = (proj: UserProject) => {
    handleDownloadAutoCadDxf(proj);
    window.setTimeout(() => handleDownloadProjectJson(proj), 220);
    const bomText = proj.bomReportText || activeProjectBomReport?.fullReportText || '';
    if (bomText) {
      window.setTimeout(() => {
        triggerBrowserFileDownload(
          `${proj.projectCode}-BOM-Obkov.txt`,
          bomText,
          'text/plain;charset=utf-8;',
        );
      }, 440);
    }
  };

  const handleImportAdminProjectJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const parsed = parseProject3DJson(String(reader.result || ''));
      if (!parsed) {
        flashBanner(
          lang === 'bg'
            ? 'Невалиден 3D JSON файл на проект.'
            : 'Invalid 3D project JSON file.',
        );
        return;
      }
      const nowIso = new Date().toISOString();
      const importedCode = parsed.projectCode || `IMP-${Math.floor(1000 + Math.random() * 8999)}`;
      const importedId = `import_${Date.now().toString(36)}`;
      const importedProj: UserProject = {
        id: importedId,
        projectCode: importedCode,
        ownerId: 'admin-import',
        ownerEmail: parsed.clientEmail || '',
        ownerName: parsed.clientName || 'Импортиран проект',
        customerPhone: parsed.clientPhone || '',
        title: parsed.title || importedCode,
        config: parsed.config,
        calculatedPriceEur: parsed.calculatedPriceEur || 0,
        status: 'under_review',
        initialQuestion: parsed.notes || '',
        adminNote: 'Зареден от Proekt_3D.json файл',
        publishedToTemplates: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      try {
        const resp = await fetch('/api/projects/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: importedProj }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { project?: UserProject };
          const saved = data.project || importedProj;
          await loadCrmProjects();
          setSelectedProjId(saved.id);
          setCrmViewMode('projects');
          flashBanner(
            lang === 'bg'
              ? `Зареден 3D проект ${saved.projectCode} от ${file.name}`
              : `Loaded 3D project ${saved.projectCode} from ${file.name}`,
          );
          return;
        }
      } catch (err) {
        console.warn('Could not persist imported JSON project to CRM:', err);
      }
      onInspectIn3D(importedProj);
    };
    reader.readAsText(file, 'utf-8');
  };

  const saveDecorsServer = async (nextDecors: BoardDecor[]) => {
    const authHdr = await getAdminAuthHeader();
    if (!authHdr) return;
    await fetch('/api/admin/decors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHdr },
      body: JSON.stringify({ decors: nextDecors }),
    });
    onCatalogUpdated?.();
  };

  const saveGalleryServer = async (nextGallery: GalleryProject[]) => {
    const authHdr = await getAdminAuthHeader();
    if (!authHdr) return;
    await fetch('/api/admin/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHdr },
      body: JSON.stringify({ gallery: nextGallery }),
    });
    onCatalogUpdated?.();
  };

  const handleToggleDecorActive = async (decor: BoardDecor) => {
    const nextActive = decor.active === false;
    try {
      const nextList = decors.map((d) => (d.id === decor.id ? { ...d, active: nextActive } : d));
      await saveDecorsServer(nextList);
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'board_decors', decor.id), { active: nextActive }).catch(() => {});
      }
      flashBanner(
        lang === 'bg'
          ? `Декор ${decor.code} е ${nextActive ? 'активиран' : 'скрит от каталога'}.`
          : `Decor ${decor.code} ${nextActive ? 'shown' : 'hidden'}.`,
      );
    } catch (err) {
      console.error(err);
    }
  };

  const saveHardwareTiersServer = async (nextTiers: HardwareTier[]) => {
    const authHdr = await getAdminAuthHeader();
    if (!authHdr) return;
    await fetch('/api/admin/hardware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHdr },
      body: JSON.stringify({ hardwareTiers: nextTiers }),
    });
    onCatalogUpdated?.();
  };

  const saveMeritServerAndFirestore = async (
    nextItems: MeritCatalogItem[],
    flashMsg: string,
  ) => {
    const authHdr = await getAdminAuthHeader();
    if (authHdr) {
      const resp = await fetch('/api/admin/merit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHdr },
        body: JSON.stringify({ meritItems: nextItems }),
      });
      if (!resp.ok) {
        throw new Error('Failed to persist Merit catalog on server');
      }
    }

    if (isFirebaseAdmin) {
      const prevMap = new Map(meritItems.map((it) => [it.id, it]));
      const nextIds = new Set(nextItems.map((it) => it.id));
      const ops: Array<Promise<unknown>> = [];

      for (const it of nextItems) {
        const prev = prevMap.get(it.id);
        const changed =
          !prev ||
          prev.categoryId !== it.categoryId ||
          prev.subsectionId !== it.subsectionId ||
          prev.name !== it.name ||
          prev.sizeLabel !== it.sizeLabel ||
          prev.featureLabel !== it.featureLabel ||
          prev.brandLevel !== it.brandLevel ||
          prev.unit !== it.unit ||
          prev.priceEur !== it.priceEur ||
          (prev.active !== false) !== (it.active !== false);
        if (changed) {
          const { id: _omit, ...payload } = it;
          ops.push(
            setDoc(doc(db, 'merit_items', it.id), {
              ...payload,
              active: it.active !== false,
            }).catch((err) => console.warn('Firestore merit setDoc warning:', err)),
          );
        }
      }

      for (const prev of meritItems) {
        if (!nextIds.has(prev.id)) {
          ops.push(
            deleteDoc(doc(db, 'merit_items', prev.id)).catch((err) =>
              console.warn('Firestore merit deleteDoc warning:', err),
            ),
          );
        }
      }

      if (ops.length > 0) {
        await Promise.all(ops);
      }
    }

    onCatalogUpdated?.();
    flashBanner(flashMsg);
  };

  const saveGalplasServerAndFirestore = async (
    nextItems: PartnerCatalogItem[],
    flashMsg: string,
  ) => {
    const authHdr = await getAdminAuthHeader();
    if (authHdr) {
      const resp = await fetch('/api/admin/galplas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHdr },
        body: JSON.stringify({ items: nextItems }),
      });
      if (!resp.ok) {
        throw new Error('Failed to persist GAL PLAS catalog on server');
      }
    }

    if (isFirebaseAdmin) {
      const prevMap = new Map(galplasItems.map((it) => [it.id, it]));
      const nextIds = new Set(nextItems.map((it) => it.id));
      const ops: Array<Promise<unknown>> = [];

      for (const it of nextItems) {
        const prev = prevMap.get(it.id);
        const changed =
          !prev ||
          prev.categoryId !== it.categoryId ||
          prev.subsectionId !== it.subsectionId ||
          prev.name !== it.name ||
          prev.sizeLabel !== it.sizeLabel ||
          prev.featureLabel !== it.featureLabel ||
          prev.brandLevel !== it.brandLevel ||
          prev.qualityClass !== it.qualityClass ||
          prev.unit !== it.unit ||
          prev.priceEur !== it.priceEur ||
          (prev.active !== false) !== (it.active !== false);
        if (changed) {
          ops.push(
            setDoc(doc(db, 'galplas_items', it.id), {
              vendor: 'galplas',
              categoryId: it.categoryId,
              subsectionId: it.subsectionId,
              name: it.name,
              sizeLabel: it.sizeLabel || '',
              featureLabel: it.featureLabel || '',
              brandLevel: it.brandLevel || '',
              qualityClass: it.qualityClass || 'medium',
              unit: it.unit || 'бр.',
              priceEur: Number(it.priceEur) || 0,
              active: it.active !== false,
            }).catch((err) => console.warn('Firestore galplas setDoc warning:', err)),
          );
        }
      }

      for (const prev of galplasItems) {
        if (!nextIds.has(prev.id)) {
          ops.push(
            deleteDoc(doc(db, 'galplas_items', prev.id)).catch((err) =>
              console.warn('Firestore galplas deleteDoc warning:', err),
            ),
          );
        }
      }

      if (ops.length > 0) {
        await Promise.all(ops);
      }
    }

    onCatalogUpdated?.();
    flashBanner(flashMsg);
  };

  const saveNastehServerAndFirestore = async (
    nextItems: PartnerCatalogItem[],
    flashMsg: string,
    nextCustomSubsections: PartnerSubsectionDef[] = nastehCustomSubsections,
  ) => {
    const authHdr = await getAdminAuthHeader();
    if (authHdr) {
      const resp = await fetch('/api/admin/nasteh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHdr },
        body: JSON.stringify({ items: nextItems, customSubsections: nextCustomSubsections }),
      });
      if (!resp.ok) {
        throw new Error('Failed to persist Nasteh catalog on server');
      }
    }

    if (isFirebaseAdmin) {
      const prevMap = new Map(nastehItems.map((it) => [it.id, it]));
      const nextIds = new Set(nextItems.map((it) => it.id));
      const ops: Array<Promise<unknown>> = [];

      for (const it of nextItems) {
        const prev = prevMap.get(it.id);
        const changed =
          !prev ||
          prev.categoryId !== it.categoryId ||
          prev.subsectionId !== it.subsectionId ||
          prev.name !== it.name ||
          prev.sizeLabel !== it.sizeLabel ||
          prev.featureLabel !== it.featureLabel ||
          prev.brandLevel !== it.brandLevel ||
          prev.qualityClass !== it.qualityClass ||
          prev.unit !== it.unit ||
          prev.priceEur !== it.priceEur ||
          (prev.active !== false) !== (it.active !== false);
        if (changed) {
          ops.push(
            setDoc(doc(db, 'nasteh_items', it.id), {
              vendor: 'nasteh',
              categoryId: it.categoryId,
              subsectionId: it.subsectionId,
              name: it.name,
              sizeLabel: it.sizeLabel || '',
              featureLabel: it.featureLabel || '',
              brandLevel: it.brandLevel || '',
              qualityClass: it.qualityClass || 'medium',
              unit: it.unit || 'бр.',
              priceEur: Number(it.priceEur) || 0,
              active: it.active !== false,
            }).catch((err) => console.warn('Firestore nasteh setDoc warning:', err)),
          );
        }
      }

      for (const prev of nastehItems) {
        if (!nextIds.has(prev.id)) {
          ops.push(
            deleteDoc(doc(db, 'nasteh_items', prev.id)).catch((err) =>
              console.warn('Firestore nasteh deleteDoc warning:', err),
            ),
          );
        }
      }

      const prevSubIds = new Set(nastehCustomSubsections.map((s) => s.id));
      const nextSubIds = new Set(nextCustomSubsections.map((s) => s.id));
      for (const sub of nextCustomSubsections) {
        if (!prevSubIds.has(sub.id)) {
          ops.push(
            setDoc(doc(db, 'nasteh_subsections', sub.id), {
              vendor: 'nasteh',
              categoryId: sub.categoryId,
              nameBg: sub.nameBg,
              nameEn: sub.nameEn || sub.nameBg,
              isCustom: true,
            }).catch((err) => console.warn('Firestore nasteh subsection setDoc warning:', err)),
          );
        }
      }
      for (const prevSub of nastehCustomSubsections) {
        if (!nextSubIds.has(prevSub.id)) {
          ops.push(
            deleteDoc(doc(db, 'nasteh_subsections', prevSub.id)).catch((err) =>
              console.warn('Firestore nasteh subsection deleteDoc warning:', err),
            ),
          );
        }
      }

      if (ops.length > 0) {
        await Promise.all(ops);
      }
    }

    onCatalogUpdated?.();
    flashBanner(flashMsg);
  };

  const saveVitrineS02Pricing = async (nextS02: VitrineS02Pricing) => {
    const nextPricing: PricingConfig = {
      ...pricing,
      vitrineS02: nextS02,
    };
    setPricing(nextPricing);
    await savePricingBoth(nextPricing);
    onCatalogUpdated?.();
    flashBanner(
      lang === 'bg'
        ? 'Цените за витрина S02 са запазени и отворените 3D проекти се преизчисляват автоматично!'
        : 'Vitrine S02 unit prices saved and open 3D projects recalculated!',
    );
  };

  const handleUpdateDecorPriceGroup = async (decor: BoardDecor, nextGroup: DecorPriceGroup) => {
    try {
      const nextList = decors.map((d) =>
        d.id === decor.id ? { ...d, priceGroup: nextGroup } : d,
      );
      await saveDecorsServer(nextList);
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'board_decors', decor.id), { priceGroup: nextGroup }).catch(
          () => {},
        );
      }
      flashBanner(
        lang === 'bg'
          ? `Декор ${decor.code} е преместен в Група ${nextGroup}.`
          : `Decor ${decor.code} assigned to Group ${nextGroup}.`,
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateDecorThickness = async (decor: BoardDecor, thicknessMm: number) => {
    const safeVal = Math.max(4, Math.min(50, Math.round(thicknessMm) || 18));
    if (safeVal === decor.thicknessMm) return;
    try {
      const nextList = decors.map((d) =>
        d.id === decor.id ? { ...d, thicknessMm: safeVal } : d,
      );
      await saveDecorsServer(nextList);
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'board_decors', decor.id), { thicknessMm: safeVal }).catch(() => {});
      }
      flashBanner(lang === 'bg' ? `Дебелината на ${decor.code} е обновена (${safeVal} мм).` : 'Thickness updated.');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddHardwareTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHw.brand.trim() || !newHw.nameBg.trim()) return;
    const id = `hw_${newHw.brand
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36).slice(-3)}`;

    const createdTier: HardwareTier = {
      id,
      brand: newHw.brand.trim(),
      tier: newHw.tier,
      nameBg: newHw.nameBg.trim(),
      nameEn: (newHw.nameEn || newHw.nameBg).trim(),
      descriptionBg:
        newHw.descriptionBg.trim() || `${newHw.brand.trim()} (${newHw.warrantyYears} г. гаранция)`,
      descriptionEn:
        newHw.descriptionBg.trim() || `${newHw.brand.trim()} (${newHw.warrantyYears}y warranty)`,
      warrantyYears: Math.max(1, Math.min(30, Number(newHw.warrantyYears) || 5)),
      loadCapacityKg: Math.max(5, Math.min(100, Number(newHw.loadCapacityKg) || 40)),
      softClose: newHw.softClose,
      isBaseDefault: false,
      active: true,
    };

    try {
      const nextTiers = [...hardwareTiers, createdTier];
      await saveHardwareTiersServer(nextTiers);
      if (isFirebaseAdmin) {
        const { id: _id, ...payload } = createdTier;
        await setDoc(doc(db, 'hardware_tiers', id), payload).catch(() => {});
      }
      const nextPricing: PricingConfig = {
        ...pricing,
        hardwarePrices: {
          ...pricing.hardwarePrices,
          [id]: {
            hingeEur: Number(newHw.hingeEur) || 4,
            drawerSlideEur: Number(newHw.drawerSlideEur) || 15,
            liftEur: Number(newHw.liftEur) || 20,
            hangerEur: Number(newHw.hangerEur) || 4,
            handleEur: Number(newHw.handleEur) || 6,
            legEur: Number(newHw.legEur) || 2,
          },
        },
      };
      setPricing(nextPricing);
      await savePricingBoth(nextPricing);
      setNewHw({
        ...newHw,
        brand: '',
        nameBg: '',
        nameEn: '',
        descriptionBg: '',
      });
      flashBanner(
        lang === 'bg'
          ? `Новият обков ${createdTier.brand} е добавен и активен в 3D студиото!`
          : `Custom hardware ${createdTier.brand} added!`,
      );
    } catch (err) {
      console.error('Add hardware tier error:', err);
    }
  };

  const handleToggleHardwareActive = async (hw: HardwareTier) => {
    const nextActive = hw.active === false;
    try {
      const nextTiers = hardwareTiers.map((h) =>
        h.id === hw.id ? { ...h, active: nextActive } : h,
      );
      await saveHardwareTiersServer(nextTiers);
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'hardware_tiers', hw.id), { active: nextActive }).catch(() => {});
      }
      flashBanner(
        lang === 'bg'
          ? `Обковът ${hw.brand} е ${nextActive ? 'активиран' : 'скрит от 3D студиото'}.`
          : `Hardware ${hw.brand} ${nextActive ? 'shown' : 'hidden'}.`,
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteHardwareTier = async (hw: HardwareTier) => {
    if (hw.isBaseDefault) return;
    try {
      const nextTiers = hardwareTiers.filter((h) => h.id !== hw.id);
      await saveHardwareTiersServer(nextTiers);
      if (isFirebaseAdmin) {
        await deleteDoc(doc(db, 'hardware_tiers', hw.id)).catch(() => {});
      }
      flashBanner(lang === 'bg' ? `Обковът ${hw.brand} е премахнат.` : `Removed ${hw.brand}.`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleExportBoardsCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['id', 'manufacturer', 'code', 'nameBg', 'materialType', 'thicknessMm', 'active', 'pricePerSqm'].join(','),
      ...decors.map((d) =>
        [
          d.id,
          d.manufacturer,
          d.code,
          d.nameBg,
          d.materialType,
          d.thicknessMm,
          d.active !== false ? '1' : '0',
          pricing.boardPricesPerSqm[d.id] ?? 24,
        ]
          .map(esc)
          .join(','),
      ),
    ];
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-forma-boards-prices.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBoardsCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) return;
      const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
      const parseLine = (line: string) =>
        line.split(sep).map((cell) => cell.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
      const idIdx = headers.indexOf('id');
      const codeIdx = headers.indexOf('code');
      const priceIdx = headers.findIndex((h) => h.includes('price'));
      if (priceIdx === -1 || (idIdx === -1 && codeIdx === -1)) {
        flashBanner(
          lang === 'bg'
            ? 'Невалиден CSV формат. Нужни са колони id (или code) и pricePerSqm.'
            : 'Invalid CSV columns.',
        );
        return;
      }

      const updatedPrices = { ...pricing.boardPricesPerSqm };
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const price = Number((cols[priceIdx] || '').replace(',', '.'));
        if (!Number.isFinite(price) || price <= 0) continue;
        const targetId = idIdx >= 0 ? cols[idIdx] : '';
        const targetCode = codeIdx >= 0 ? cols[codeIdx] : '';
        const matched = decors.find(
          (d) => (targetId && d.id === targetId) || (targetCode && d.code.toLowerCase() === targetCode.toLowerCase()),
        );
        if (matched) {
          updatedPrices[matched.id] = price;
          count++;
        }
      }
      if (count > 0) {
        const nextPricing = { ...pricing, boardPricesPerSqm: updatedPrices };
        setPricing(nextPricing);
        await savePricingBoth(nextPricing);
        flashBanner(
          lang === 'bg'
            ? `Импортирани и запазени цени за ${count} декора от CSV!`
            : `Imported prices for ${count} decors!`,
        );
      } else {
        flashBanner(lang === 'bg' ? 'Няма съвпадащи декори в CSV файла.' : 'No matching decors found.');
      }
    } catch (err) {
      console.error('CSV import error:', err);
      flashBanner(lang === 'bg' ? 'Грешка при четене на CSV файла.' : 'Failed to parse CSV.');
    }
  };

  const savePricingBoth = async (nextPricing: PricingConfig) => {
    setPricingSaving(true);
    try {
      const authHdr = await getAdminAuthHeader();
      if (authHdr) {
        const resp = await fetch('/api/admin/pricing', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHdr,
          },
          body: JSON.stringify({ pricing: nextPricing }),
        });
        if (!resp.ok) throw new Error('Failed to save pricing to server');
      }
      if (isFirebaseAdmin) {
        await setDoc(doc(db, 'pricing_config', 'main'), {
          ...nextPricing,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      flashBanner(
        lang === 'bg'
          ? 'Скритите цени и процентът за изработка са запазени и активирани.'
          : 'Private pricing matrix & craftsmanship % saved.',
      );
    } catch (err) {
      console.error('Save pricing error:', err);
      flashBanner(lang === 'bg' ? 'Грешка при запазване на цените.' : 'Error saving pricing.');
    } finally {
      setPricingSaving(false);
    }
  };

  const handleAddBoardDecor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDecor.code.trim() || !newDecor.nameBg.trim()) return;
    const id = `${newDecor.manufacturer.toLowerCase()}_${newDecor.code
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString(36).slice(-3)}`;

    const createdDecor: BoardDecor = {
      id,
      manufacturer: newDecor.manufacturer,
      code: newDecor.code.trim(),
      nameBg: newDecor.nameBg.trim(),
      nameEn: (newDecor.nameEn || newDecor.nameBg).trim(),
      category: newDecor.category,
      materialType: newDecor.materialType,
      priceGroup: newDecor.priceGroup,
      colorHex: newDecor.colorHex,
      grainHex: newDecor.grainHex,
      roughness: newDecor.category === 'gloss' ? 0.08 : 0.65,
      thicknessMm: Number(newDecor.thicknessMm) || 18,
      isBaseDefault: false,
      active: true,
    };

    try {
      await saveDecorsServer([...decors, createdDecor]);
      if (isFirebaseAdmin) {
        const { id: _ignoreId, ...firestorePayload } = createdDecor;
        await setDoc(doc(db, 'board_decors', id), firestorePayload).catch(() => {});
      }

      const nextPricing: PricingConfig = {
        ...pricing,
        boardPricesPerSqm: {
          ...pricing.boardPricesPerSqm,
          [id]: Number(newDecor.pricePerSqm) || 25,
        },
      };
      setPricing(nextPricing);
      await savePricingBoth(nextPricing);
      setNewDecor({ ...newDecor, code: '', nameBg: '', nameEn: '' });
    } catch (err) {
      console.error('Add decor error:', err);
    }
  };

  const handleChangeProjectStatus = async (proj: UserProject, nextStatus: ProjectStatus) => {
    try {
      const authHdr = await getAdminAuthHeader();
      if (authHdr) {
        const resp = await fetch('/api/admin/crm-offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHdr },
          body: JSON.stringify({
            projectId: proj.id,
            projectCode: proj.projectCode,
            nextStatus,
            adminNote: adminNoteDraft.trim() || proj.adminNote || '',
            projectSnapshot: proj,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { project?: UserProject };
          if (data.project) {
            setCrmProjects((prev) => {
              const exists = prev.some((x) => x.id === data.project!.id);
              return exists
                ? prev.map((x) => (x.id === data.project!.id ? data.project! : x))
                : [data.project!, ...prev];
            });
          }
        }
      }
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'user_projects', proj.id), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      flashBanner(
        lang === 'bg'
          ? `Статусът на ${proj.projectCode} е обновен на „${getStatusLabel(nextStatus)}“.`
          : `Status of ${proj.projectCode} updated to ${getStatusLabel(nextStatus)}.`,
      );
    } catch (err) {
      console.error('Change project status error:', err);
    }
  };

  const handleApproveAndRelease = async (proj: UserProject) => {
    const noteText = adminNoteDraft.trim() || 'Одобрено след консултация.';
    try {
      const authHdr = await getAdminAuthHeader();
      if (authHdr) {
        const resp = await fetch('/api/admin/crm-offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHdr },
          body: JSON.stringify({
            projectId: proj.id,
            projectCode: proj.projectCode,
            nextStatus: 'approved',
            adminNote: noteText,
            projectSnapshot: proj,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { project?: UserProject };
          if (data.project) {
            setCrmProjects((prev) => {
              const exists = prev.some((x) => x.id === data.project!.id);
              return exists
                ? prev.map((x) => (x.id === data.project!.id ? data.project! : x))
                : [data.project!, ...prev];
            });
          }
        }
      }
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'user_projects', proj.id), {
          status: 'approved',
          adminNote: noteText,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      flashBanner(
        lang === 'bg'
          ? `Проект ${proj.projectCode} е одобрен и отключен за клиента!`
          : `Project ${proj.projectCode} approved and released!`,
      );
    } catch (err) {
      console.error('Approve project error:', err);
    }
  };

  const handlePublishAsTemplate = async (proj: UserProject) => {
    try {
      const tplId = `tpl_${proj.projectCode.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      await setDoc(doc(db, 'completed_templates', tplId), {
        titleBg: proj.title,
        titleEn: proj.title,
        category: proj.config.category,
        dimensionsLabel: `${proj.config.widthCm} × ${proj.config.heightCm} × ${proj.config.depthCm} см`,
        summaryBg: `Готов 100% проект (${proj.projectCode}). Променете размери, цветове или обков по ваш вкус.`,
        summaryEn: `Completed 100% layout (${proj.projectCode}). Customize dimensions, board decor or hardware.`,
        config: proj.config,
        sourceProjectCode: proj.projectCode,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'user_projects', proj.id), {
        publishedToTemplates: true,
        updatedAt: serverTimestamp(),
      });
      flashBanner(
        lang === 'bg'
          ? `Проект ${proj.projectCode} е публикуван в раздел „Готови проекти“ (без лични данни)!`
          : `Project ${proj.projectCode} published to Ready Projects!`,
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'completed_templates');
    }
  };

  const handleSendAdminReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProj || !adminReply.trim()) return;
    setSendingOffer(true);
    try {
      const authHdr = await getAdminAuthHeader();
      if (authHdr) {
        const resp = await fetch('/api/admin/crm-offer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHdr },
          body: JSON.stringify({
            projectId: activeProj.id,
            projectCode: activeProj.projectCode,
            offerText: adminReply.trim(),
            nextStatus: activeProj.status === 'inquiry_sent' ? 'under_review' : undefined,
            projectSnapshot: activeProj,
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as { project?: UserProject };
          if (data.project) {
            setCrmProjects((prev) => {
              const exists = prev.some((x) => x.id === data.project!.id);
              return exists
                ? prev.map((x) => (x.id === data.project!.id ? data.project! : x))
                : [data.project!, ...prev];
            });
          }
        }
      }

      if (isFirebaseAdmin && user) {
        await addDoc(collection(db, 'user_projects', activeProj.id, 'messages'), {
          projectOwnerId: activeProj.ownerId,
          senderId: user.uid,
          senderRole: 'admin',
          senderName: siteSettings.companyNameBg || 'Atelier Forma',
          text: adminReply.trim(),
          createdAt: serverTimestamp(),
        }).catch(() => {});
        if (activeProj.status === 'inquiry_sent') {
          await updateDoc(doc(db, 'user_projects', activeProj.id), {
            status: 'under_review',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
      setAdminReply('');
      flashBanner(
        lang === 'bg'
          ? 'Съобщението / специалната оферта е изпратена до клиента!'
          : 'Offer / reply sent to client!',
      );
    } catch (err) {
      console.error('Send CRM reply error:', err);
    } finally {
      setSendingOffer(false);
    }
  };

  const processGalleryFiles = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const targetCategory: FurnitureCategory =
      gallerySectionFilter !== 'all' ? gallerySectionFilter : galForm.category;

    if (imageFiles.length === 1) {
      const file = imageFiles[0];
      const dataUrl = await compressImageFileToDataUrl(file, 960);
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
      setGalForm((prev) => ({
        ...prev,
        category: targetCategory,
        imageUrl: dataUrl,
        titleBg: prev.titleBg || cleanName || 'Нов обект',
        titleEn: prev.titleEn || cleanName || 'New Project',
      }));
      flashBanner(
        lang === 'bg'
          ? 'Снимката е заредена! Проверете заглавието/раздела и натиснете „Публикувай снимката“.'
          : 'Photo loaded! Review title/category and click Publish Photo.',
      );
      return;
    }

    // Multiple images dropped at once: auto-compress and publish directly into target category
    setGalleryUploading(true);
    try {
      const addedItems: GalleryProject[] = [];
      for (const file of imageFiles) {
        const dataUrl = await compressImageFileToDataUrl(file, 960);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Мебел по поръчка';
        const id = `gal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
        const item: GalleryProject = {
          id,
          titleBg: cleanName,
          titleEn: cleanName,
          category: targetCategory,
          dimensionsLabel: galForm.dimensionsLabel.trim() || 'По индивидуален размер',
          materialsLabel: galForm.materialsLabel.trim() || 'Egger + Blum',
          imageUrl: dataUrl,
          presetId: galForm.presetId,
        };
        addedItems.push(item);
      }
      const nextOrdered = [...addedItems, ...orderedGallery].map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }));
      await saveGalleryServer(nextOrdered);
      if (isFirebaseAdmin) {
        await Promise.all(
          nextOrdered.map((item) => {
            const { id: itemId, createdAt: _createdAt, ...payload } = item;
            const isAdded = addedItems.some((a) => a.id === itemId);
            if (isAdded) {
              return setDoc(doc(db, 'gallery_projects', itemId), {
                ...payload,
                createdAt: serverTimestamp(),
              }).catch(() => {});
            }
            return updateDoc(doc(db, 'gallery_projects', itemId), {
              sortOrder: item.sortOrder,
            }).catch(() => {});
          }),
        );
      }
      flashBanner(
        lang === 'bg'
          ? `Успешно качени ${imageFiles.length} снимки в избрания раздел!`
          : `Successfully uploaded ${imageFiles.length} photos!`,
      );
    } catch (err) {
      console.error('Multi gallery upload error:', err);
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleUploadGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processGalleryFiles(e.target.files);
      e.target.value = '';
    }
  };

  const persistGalleryOrder = async (nextList: GalleryProject[], successMsgBg: string, successMsgEn: string) => {
    setGallerySavingOrder(true);
    try {
      const normalized = nextList.map((item, idx) => ({
        ...item,
        sortOrder: idx + 1,
      }));
      await saveGalleryServer(normalized);
      if (isFirebaseAdmin) {
        await Promise.all(
          normalized.map((item) =>
            updateDoc(doc(db, 'gallery_projects', item.id), {
              sortOrder: item.sortOrder,
            }).catch(async () => {
              const { id: _id, createdAt: _createdAt, ...payload } = item;
              await setDoc(doc(db, 'gallery_projects', item.id), {
                ...payload,
                createdAt: serverTimestamp(),
              }).catch(() => {});
            }),
          ),
        );
      }
      flashBanner(lang === 'bg' ? successMsgBg : successMsgEn);
    } catch (err) {
      console.error('Persist gallery order error:', err);
    } finally {
      setGallerySavingOrder(false);
    }
  };

  const handleMoveGalleryItem = async (itemId: string, delta: -1 | 1) => {
    const currentIdx = orderedGallery.findIndex((g) => g.id === itemId);
    const targetIdx = currentIdx + delta;
    if (currentIdx < 0 || targetIdx < 0 || targetIdx >= orderedGallery.length) return;
    const nextList = [...orderedGallery];
    const [moved] = nextList.splice(currentIdx, 1);
    nextList.splice(targetIdx, 0, moved);
    await persistGalleryOrder(
      nextList,
      'Подредбата в слайд-галерията е обновена!',
      'Slideshow order updated!',
    );
  };

  const handleSaveNumberedOrder = async () => {
    const scored = orderedGallery.map((item, idx) => {
      const parsed = Number.parseInt(orderInputs[item.id] ?? '', 10);
      const rank = Number.isFinite(parsed) && parsed > 0 ? parsed : idx + 1;
      return { item, idx, rank };
    });
    scored.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.idx - b.idx));
    await persistGalleryOrder(
      scored.map((s) => s.item),
      'Поредните номера в слайд-галерията са запазени!',
      'Numbered slideshow order saved!',
    );
  };

  const handleDeleteGalleryItem = async (itemId: string) => {
    try {
      const remaining = orderedGallery
        .filter((g) => g.id !== itemId)
        .map((item, idx) => ({ ...item, sortOrder: idx + 1 }));
      await saveGalleryServer(remaining);
      if (isFirebaseAdmin) {
        await deleteDoc(doc(db, 'gallery_projects', itemId)).catch(() => {});
        await Promise.all(
          remaining.map((item) =>
            updateDoc(doc(db, 'gallery_projects', item.id), {
              sortOrder: item.sortOrder,
            }).catch(() => {}),
          ),
        );
      }
      if (editingGalleryId === itemId) {
        setEditingGalleryId(null);
        setEditGalleryDraft(null);
      }
      flashBanner(lang === 'bg' ? 'Снимката е изтрита от галерията.' : 'Photo deleted from gallery.');
    } catch (err) {
      console.error('Delete gallery error:', err);
    }
  };

  const handleReplaceCardPhoto = async (itemId: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 960);
      await saveGalleryServer(
        orderedGallery.map((g, idx) =>
          g.id === itemId ? { ...g, imageUrl: dataUrl, sortOrder: g.sortOrder ?? idx + 1 } : g,
        ),
      );
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'gallery_projects', itemId), {
          imageUrl: dataUrl,
        }).catch(() => {});
      }
      flashBanner(lang === 'bg' ? 'Снимката е сменена успешно!' : 'Photo replaced successfully!');
    } catch (err) {
      console.error('Replace card photo error:', err);
    }
  };

  const handleSaveGalleryEdit = async (itemId: string) => {
    if (!editGalleryDraft || !editGalleryDraft.titleBg.trim()) return;
    try {
      const updatedFields = {
        titleBg: editGalleryDraft.titleBg.trim(),
        titleEn: (editGalleryDraft.titleEn || editGalleryDraft.titleBg).trim(),
        category: editGalleryDraft.category,
        dimensionsLabel: editGalleryDraft.dimensionsLabel.trim(),
        materialsLabel: editGalleryDraft.materialsLabel.trim(),
        imageUrl: editGalleryDraft.imageUrl,
      };
      await saveGalleryServer(
        orderedGallery.map((g, idx) =>
          g.id === itemId ? { ...g, ...updatedFields, sortOrder: g.sortOrder ?? idx + 1 } : g,
        ),
      );
      if (isFirebaseAdmin) {
        await updateDoc(doc(db, 'gallery_projects', itemId), updatedFields).catch(() => {});
      }
      setEditingGalleryId(null);
      setEditGalleryDraft(null);
      flashBanner(lang === 'bg' ? 'Промените по снимката са запазени!' : 'Gallery item updated!');
    } catch (err) {
      console.error('Save gallery edit error:', err);
    }
  };

  const handleUploadLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFileToDataUrl(file, 400);
    setCompanyForm((prev) => ({ ...prev, logoUrl: dataUrl }));
  };

  const handleAddGalleryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!galForm.titleBg.trim() || !galForm.imageUrl.trim()) return;
    const id = `gal_${Date.now().toString(36)}`;
    const newItem: GalleryProject = {
      id,
      titleBg: galForm.titleBg.trim(),
      titleEn: (galForm.titleEn || galForm.titleBg).trim(),
      category: galForm.category,
      dimensionsLabel: galForm.dimensionsLabel.trim(),
      materialsLabel: galForm.materialsLabel.trim(),
      imageUrl: galForm.imageUrl.trim(),
      presetId: galForm.presetId,
      sortOrder: 1,
    };
    const nextList = [newItem, ...orderedGallery].map((item, idx) => ({
      ...item,
      sortOrder: idx + 1,
    }));
    try {
      await saveGalleryServer(nextList);
      if (isFirebaseAdmin) {
        const { id: _id, createdAt: _createdAt, ...payload } = newItem;
        await setDoc(doc(db, 'gallery_projects', id), {
          ...payload,
          sortOrder: 1,
          createdAt: serverTimestamp(),
        }).catch(() => {});
        await Promise.all(
          nextList
            .filter((g) => g.id !== id)
            .map((g) =>
              updateDoc(doc(db, 'gallery_projects', g.id), {
                sortOrder: g.sortOrder,
              }).catch(() => {}),
            ),
        );
      }
      setGalForm({ ...galForm, titleBg: '', titleEn: '', imageUrl: '' });
      flashBanner(lang === 'bg' ? 'Снимката е добавена в галерията!' : 'Photo added to gallery!');
    } catch (err) {
      console.error('Add gallery item error:', err);
    }
  };

  const handleSaveSlideSpeed = async () => {
    const clamped = Math.min(12, Math.max(3, Math.round(slideIntervalSec || 5)));
    setSlideIntervalSec(clamped);
    setSavingSlideSpeed(true);
    try {
      const nextSettings: SiteSettings = {
        ...siteSettings,
        gallerySlideIntervalSec: clamped,
      };
      const authHdr = await getAdminAuthHeader();
      if (authHdr) {
        await fetch('/api/admin/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHdr },
          body: JSON.stringify({ siteSettings: nextSettings }),
        });
        onCatalogUpdated?.();
      }
      if (isFirebaseAdmin) {
        await setDoc(doc(db, 'site_settings', 'company_profile'), {
          ...nextSettings,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      flashBanner(
        lang === 'bg'
          ? `Скоростта на слайд-галерията (${clamped} сек. на снимка) е запазена!`
          : `Gallery slideshow interval (${clamped}s per photo) saved!`,
      );
    } catch (err) {
      console.error('Save gallery slide speed error:', err);
    } finally {
      setSavingSlideSpeed(false);
    }
  };

  const handleSaveCompanyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: SiteSettings = {
        ...companyForm,
        gallerySlideIntervalSec: companyForm.gallerySlideIntervalSec ?? slideIntervalSec,
      };
      const authHdr = await getAdminAuthHeader();
      if (authHdr) {
        await fetch('/api/admin/company', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHdr },
          body: JSON.stringify({ siteSettings: payload }),
        });
        onCatalogUpdated?.();
      }
      if (isFirebaseAdmin) {
        await setDoc(doc(db, 'site_settings', 'company_profile'), {
          ...payload,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      flashBanner(lang === 'bg' ? 'Фирменият профил и логото са обновени!' : 'Company profile saved!');
    } catch (err) {
      console.error('Save company profile error:', err);
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="font-display text-3xl font-semibold text-zinc-900">
            {t(lang, 'adminTitle')}
          </h2>
          <p className="text-xs text-zinc-500">
            {user?.email || ADMIN_EMAIL} · {lang === 'bg' ? 'Пълен контрол над скрити цени, проекти и галерия' : 'Private pricing, projects & gallery control'}
          </p>
        </div>

        {/* Admin Tabs */}
        <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-200/70 p-1">
          {(
            [
              ['overview', lang === 'bg' ? 'Преглед' : 'Overview'],
              ['inquiries', lang === 'bg' ? 'Клиенти & Проекти (CRM)' : 'Clients & CRM'],
              ['boards', lang === 'bg' ? 'Плоскости и €/м²' : 'Boards & €/m²'],
              ['hardware', lang === 'bg' ? 'Обков и цени' : 'Hardware & Prices'],
              ['merit', lang === 'bg' ? 'Мерит (meritbg.com)' : 'Merit Catalog'],
              ['galplas', lang === 'bg' ? 'GAL PLAS (galplas.bg)' : 'GAL PLAS LTD'],
              ['nasteh', lang === 'bg' ? 'Настех (Пловдив)' : 'Nasteh Ltd'],
              ['margin', lang === 'bg' ? 'Транспорт и % Общо' : 'Transport & Total %'],
              ['gallery', lang === 'bg' ? 'Снимки Галерия' : 'Gallery Photos'],
              ['company', lang === 'bg' ? 'Лого и Фирма' : 'Logo & Info'],
            ] as [AdminTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === id ? 'bg-[#18181B] text-white' : 'text-zinc-700 hover:text-zinc-950'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {statusBanner && (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
          {statusBanner}
        </div>
      )}

      {/* TAB 0: Admin Dashboard Overview KPIs & Contact Messages */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-500">
                {lang === 'bg' ? 'Общо проекти' : 'Total Projects'}
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-zinc-900">
                {kpiStats.total}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-amber-800">
                {lang === 'bg' ? 'Активни запитвания' : 'Active Inquiries'}
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-amber-900">
                {kpiStats.activeInquiries}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
              <div className="text-[11px] font-medium text-emerald-800">
                {lang === 'bg' ? 'Одобрени проекти' : 'Approved'}
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-emerald-900">
                {kpiStats.approved}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-500">
                {lang === 'bg' ? 'Средна оферта' : 'Avg. Quote'}
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-[#B47B44]">
                {kpiStats.avgEur} €
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-500">
                {lang === 'bg' ? 'Снимки в галерия' : 'Gallery Photos'}
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-zinc-900">
                {gallery.length}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="text-[11px] font-medium text-zinc-500">
                {lang === 'bg' ? 'Активни декори' : 'Active Decors'}
              </div>
              <div className="mt-1 font-mono-tabular text-2xl font-bold text-zinc-900">
                {kpiStats.activeDecors} / {decors.length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Recent Client Projects */}
            <div className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#B47B44]" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {lang === 'bg' ? 'Последни клиентски проекти и запитвания' : 'Recent Client Projects'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('inquiries')}
                  className="text-xs font-semibold text-[#B47B44] hover:text-[#9E6835]"
                >
                  {lang === 'bg' ? 'Виж всички →' : 'View all →'}
                </button>
              </div>
              <div className="divide-y divide-zinc-100">
                {allProjects.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-mono-tabular font-bold text-[#B47B44] mr-2">
                        {p.projectCode}
                      </span>
                      <span className="font-semibold text-zinc-900">{p.title}</span>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {p.ownerName || p.ownerEmail} {p.customerPhone ? `· ${p.customerPhone}` : ''} · {getStatusLabel(p.status)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-tabular font-semibold text-zinc-900">
                        {p.calculatedPriceEur.toLocaleString('bg-BG')} €
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjId(p.id);
                          setTab('inquiries');
                        }}
                        className="rounded-md border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold text-zinc-800 hover:border-[#B47B44]"
                      >
                        {lang === 'bg' ? 'Отвори' : 'Open'}
                      </button>
                    </div>
                  </div>
                ))}
                {allProjects.length === 0 && (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    {lang === 'bg' ? 'Все още няма запазени клиентски проекти.' : 'No client projects yet.'}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Quick Contact Form Messages */}
            <div className="lg:col-span-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#B47B44]" />
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {lang === 'bg' ? 'Съобщения от контактната форма' : 'Contact Form Messages'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={loadContactMessages}
                  disabled={contactsLoading}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${contactsLoading ? 'animate-spin' : ''}`} />
                  <span>{lang === 'bg' ? 'Обнови' : 'Refresh'}</span>
                </button>
              </div>
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {contactMessages.map((m) => (
                  <div key={m.id} className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900">{m.name}</span>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(m.createdAt).toLocaleString('bg-BG')}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono-tabular text-[11px] font-medium text-[#B47B44]">
                      {m.contact}
                    </div>
                    <p className="mt-1.5 text-zinc-700 leading-relaxed whitespace-pre-line">
                      {m.message}
                    </p>
                  </div>
                ))}
                {contactMessages.length === 0 && (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    {lang === 'bg'
                      ? 'Няма получени бързи съобщения от долната форма.'
                      : 'No quick contact messages yet.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Client CRM History, Abandoned Drafts, Orders & Remarketing */}
      {tab === 'inquiries' && (
        <div className="space-y-4">
          {/* Sub-switch: All Projects vs Grouped by Client History (CRM) */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCrmViewMode('projects')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  crmViewMode === 'projects'
                    ? 'bg-[#18181B] text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                <Search className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? `Всички проекти (${allProjects.length})` : `All Projects (${allProjects.length})`}</span>
              </button>
              <button
                type="button"
                onClick={() => setCrmViewMode('clients')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  crmViewMode === 'clients'
                    ? 'bg-[#18181B] text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? `Клиенти и История (${crmClients.length})` : `Clients CRM (${crmClients.length})`}</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={adminJsonImportRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportAdminProjectJson(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => adminJsonImportRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#B47B44]/60 bg-[#B47B44]/10 px-3 py-1.5 text-xs font-semibold text-[#8C5A2B] hover:bg-[#B47B44]/20"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Отвори Proekt_3D.json' : 'Open Proekt_3D.json'}</span>
              </button>
              <button
                type="button"
                onClick={loadCrmProjects}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-[#B47B44]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Обнови CRM' : 'Refresh CRM'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value)}
                    placeholder={
                      lang === 'bg'
                        ? 'Търсене: код AF-XXXX, име, имейл или телефон...'
                        : 'Search code AF-XXXX, name, email or phone...'
                    }
                    className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 py-2 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'ALL' | UserProject['status'])}
                  className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-800"
                >
                  <option value="ALL">{lang === 'bg' ? 'Всички статуси' : 'All Statuses'}</option>
                  <option value="inquiry_sent">{lang === 'bg' ? 'Изпратено за запитване' : 'Inquiry Sent'}</option>
                  <option value="under_review">{lang === 'bg' ? 'В обсъждане' : 'In Review'}</option>
                  <option value="approved">{lang === 'bg' ? 'Одобрено / Чака замерване' : 'Approved / Awaiting Measure'}</option>
                  <option value="in_production">{lang === 'bg' ? 'В производство (в цеха)' : 'In Production'}</option>
                  <option value="ready_for_install">{lang === 'bg' ? 'Готово за монтаж / Доставено' : 'Ready for Install'}</option>
                  <option value="draft">{lang === 'bg' ? 'Чернови (още чертае)' : 'Drafts'}</option>
                </select>
              </div>

              {crmViewMode === 'clients' ? (
                <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
                  {crmClients.map((client) => {
                    const isExpanded = selectedClientKey === client.clientKey;
                    const phoneDigits = client.customerPhone.replace(/[^+\d]/g, '');
                    return (
                      <div
                        key={client.clientKey}
                        className={`rounded-xl border p-3.5 transition-colors ${
                          isExpanded
                            ? 'border-[#B47B44] bg-white shadow-sm'
                            : 'border-zinc-200 bg-white/80 hover:bg-white'
                        }`}
                      >
                        <div
                          onClick={() => {
                            setSelectedClientKey(isExpanded ? null : client.clientKey);
                            if (client.projects[0]) setSelectedProjId(client.projects[0].id);
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-sm text-zinc-900">{client.ownerName}</div>
                              <div className="text-[11px] text-zinc-500">
                                {client.ownerEmail || 'без имейл'}{' '}
                                {client.customerPhone ? `· ${client.customerPhone}` : ''}
                              </div>
                            </div>
                            <span className="font-mono-tabular text-xs font-bold text-[#B47B44]">
                              {client.totalValueEur.toLocaleString('bg-BG')} €
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                              {client.projects.length} {lang === 'bg' ? 'проекта' : 'projects'}
                            </span>
                            {client.draftsCount > 0 && (
                              <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                                {client.draftsCount} {lang === 'bg' ? 'чернови' : 'drafts'}
                              </span>
                            )}
                            {client.inquiriesCount > 0 && (
                              <span className="rounded bg-sky-100 px-2 py-0.5 font-medium text-sky-800">
                                {client.inquiriesCount} {lang === 'bg' ? 'запитвания' : 'inquiries'}
                              </span>
                            )}
                            {client.approvedCount > 0 && (
                              <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                                {client.approvedCount} {lang === 'bg' ? 'одобрени' : 'approved'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick direct remarketing links */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-2">
                          {client.ownerEmail && (
                            <a
                              href={`mailto:${client.ownerEmail}?subject=${encodeURIComponent(
                                `Специална оферта от Atelier Forma`,
                              )}`}
                              className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:border-[#B47B44]"
                            >
                              <Mail className="h-3 w-3 text-[#B47B44]" />
                              <span>Имейл</span>
                            </a>
                          )}
                          {phoneDigits && (
                            <>
                              <a
                                href={`viber://chat?number=${encodeURIComponent(phoneDigits)}`}
                                className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-800 hover:bg-violet-100"
                              >
                                <MessageCircle className="h-3 w-3" />
                                <span>Viber</span>
                              </a>
                              <a
                                href={`tel:${phoneDigits}`}
                                className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100"
                              >
                                <Phone className="h-3 w-3" />
                                <span>Обади се</span>
                              </a>
                            </>
                          )}
                        </div>

                        {/* Client Project History List */}
                        {isExpanded && (
                          <div className="mt-2.5 space-y-1.5 border-t border-zinc-100 pt-2">
                            {client.projects.map((cp) => (
                              <button
                                key={cp.id}
                                type="button"
                                onClick={() => setSelectedProjId(cp.id)}
                                className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                                  activeProj?.id === cp.id
                                    ? 'border-[#B47B44] bg-[#B47B44]/10'
                                    : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100'
                                }`}
                              >
                                <div>
                                  <span className="font-mono-tabular font-bold text-[#B47B44]">
                                    {cp.projectCode}
                                  </span>{' '}
                                  <span className="font-medium text-zinc-900">{cp.title}</span>
                                  <div className="text-[10px] text-zinc-500">
                                    {cp.status === 'draft'
                                      ? 'Чернова'
                                      : cp.status === 'approved'
                                        ? 'Одобрен'
                                        : 'Запитване'}{' '}
                                    · {cp.config.widthCm}×{cp.config.heightCm} см
                                  </div>
                                </div>
                                <span className="font-mono-tabular font-semibold text-zinc-900">
                                  {cp.calculatedPriceEur} €
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {crmClients.length === 0 && (
                    <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-xs text-zinc-500">
                      {lang === 'bg' ? 'Няма клиенти по това търсене.' : 'No matching clients.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                  {filteredProjects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjId(p.id)}
                      className={`rounded-xl border p-3.5 cursor-pointer transition-colors ${
                        activeProj?.id === p.id
                          ? 'border-[#B47B44] bg-white shadow-sm'
                          : 'border-zinc-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono-tabular font-bold text-[#B47B44]">
                          {p.projectCode}
                        </span>
                        <span className="font-mono-tabular font-semibold text-zinc-900">
                          {p.calculatedPriceEur.toLocaleString('bg-BG')} €
                        </span>
                      </div>
                      <div className="mt-1 font-semibold text-sm text-zinc-900">{p.title}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {p.ownerName || p.ownerEmail} {p.customerPhone ? `· ${p.customerPhone}` : ''}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400">
                        {getStatusLabel(p.status)} · {p.updatedAt}
                      </div>
                    </div>
                  ))}
                  {filteredProjects.length === 0 && (
                    <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-xs text-zinc-500">
                      {lang === 'bg' ? 'Няма намерени проекти по това търсене.' : 'No matching projects.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {activeProj && (
              <div className="lg:col-span-7 rounded-xl border border-zinc-200 bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono-tabular text-xs font-bold text-[#B47B44]">
                        {activeProj.projectCode}
                      </span>
                      <select
                        value={activeProj.status}
                        onChange={(e) =>
                          handleChangeProjectStatus(activeProj, e.target.value as ProjectStatus)
                        }
                        aria-label={lang === 'bg' ? 'Статус на поръчката' : 'Order status'}
                        className="rounded-md border border-[#B47B44]/40 bg-[#B47B44]/10 px-2.5 py-1 text-[11px] font-semibold text-[#8C5A2B] focus:border-[#B47B44] focus:outline-none"
                      >
                        <option value="draft">{lang === 'bg' ? 'Чернова (Клиентът още чертае)' : 'Draft'}</option>
                        <option value="inquiry_sent">{lang === 'bg' ? 'Изпратено за запитване' : 'Inquiry Sent'}</option>
                        <option value="under_review">{lang === 'bg' ? 'В обсъждане' : 'In Review'}</option>
                        <option value="approved">{lang === 'bg' ? 'Одобрено / Чака замерване на място' : 'Approved / Awaiting Measure'}</option>
                        <option value="in_production">{lang === 'bg' ? 'В производство (в цеха)' : 'In Production'}</option>
                        <option value="ready_for_install">{lang === 'bg' ? 'Готово за монтаж / Доставено' : 'Ready for Install / Delivered'}</option>
                      </select>
                    </div>
                    <h3 className="text-xl font-semibold text-zinc-900">{activeProj.title}</h3>
                    <p className="text-xs text-zinc-500">
                      {activeProj.ownerName} ({activeProj.ownerEmail || 'без имейл'}) ·{' '}
                      {activeProj.customerPhone || 'без телефон'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeProj.ownerEmail && (
                        <a
                          href={`mailto:${activeProj.ownerEmail}?subject=${encodeURIComponent(
                            `Atelier Forma · Проект ${activeProj.projectCode}`,
                          )}`}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-[#B47B44]"
                        >
                          <Mail className="h-3 w-3 text-[#B47B44]" />
                          <span>Имейл</span>
                        </a>
                      )}
                      {activeProj.customerPhone && (
                        <>
                          <a
                            href={`viber://chat?number=${encodeURIComponent(
                              activeProj.customerPhone.replace(/[^+\d]/g, ''),
                            )}`}
                            className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-800 hover:bg-violet-100"
                          >
                            <MessageCircle className="h-3 w-3" />
                            <span>Viber чат</span>
                          </a>
                          <a
                            href={`tel:${activeProj.customerPhone.replace(/[^+\d]/g, '')}`}
                            className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100"
                          >
                            <Phone className="h-3 w-3" />
                            <span>Обади се</span>
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onInspectIn3D(activeProj)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-[#B47B44]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{lang === 'bg' ? 'Отвори в 3D' : 'Open in 3D'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCutListCsv(activeProj, selectedQuote)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-[#B47B44]"
                    >
                      <Download className="h-3.5 w-3.5 text-[#B47B44]" />
                      <span>{lang === 'bg' ? 'Свали Разкрой и Обков (CSV)' : 'Cut-List & BOM CSV'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadAutoCadDxf(activeProj)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-[#B47B44]"
                    >
                      <Download className="h-3.5 w-3.5 text-zinc-900" />
                      <span>{lang === 'bg' ? 'AutoCAD 3D (.DXF)' : 'AutoCAD 3D (.DXF)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadProjectJson(activeProj)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-[#B47B44]"
                    >
                      <FileCode2 className="h-3.5 w-3.5 text-emerald-700" />
                      <span>{lang === 'bg' ? '3D Проект (.JSON)' : '3D Project (.JSON)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadFullPackage(activeProj)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#B47B44] transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 text-[#E6B88A]" />
                      <span>{lang === 'bg' ? 'Пълен пакет (.DXF + .JSON + BOM)' : 'Full Package'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePublishAsTemplate(activeProj)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-[#B47B44]"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[#B47B44]" />
                      <span>
                        {activeProj.publishedToTemplates
                          ? lang === 'bg'
                            ? 'Обнови в Готови'
                            : 'Update Template'
                          : lang === 'bg'
                            ? 'Публикувай като Готов проект'
                            : 'Publish to Ready Projects'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* ADMIN-ONLY Cost & BOM Breakdown */}
                {selectedQuote?.adminBreakdown && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs">
                    <div className="font-semibold text-zinc-900 mb-2">
                      {lang === 'bg'
                        ? 'Вътрешна производствена справка (видима САМО за вас)'
                        : 'Internal Cost & BOM Breakdown (Admin Only)'}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tabular">
                      <div>
                        <div className="text-zinc-500">Плочи (с {pricing.wastePercent ?? 15}% фира)</div>
                        <div className="font-semibold text-zinc-900">
                          {selectedQuote.adminBreakdown.bom.sheetsEstimated} бр. (
                          {(
                            selectedQuote.adminBreakdown.bom.carcassAreaSqm +
                            selectedQuote.adminBreakdown.bom.frontAreaSqm
                          ).toFixed(1)}{' '}
                          м²)
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Кант / Обков / Спец. механизми</div>
                        <div className="font-semibold text-zinc-900">
                          {selectedQuote.adminBreakdown.bom.edgeBandingMeters}м ·{' '}
                          {selectedQuote.adminBreakdown.bom.hingesCount}п ·{' '}
                          {selectedQuote.adminBreakdown.bom.drawerSlidePairs}ч
                          {(selectedQuote.adminBreakdown.bom.cargoBasketsCount || 0) > 0 &&
                            ` · Карго:${selectedQuote.adminBreakdown.bom.cargoBasketsCount}`}
                          {(selectedQuote.adminBreakdown.bom.cornerMechanismsCount || 0) > 0 &&
                            ` · Бъбрек:${selectedQuote.adminBreakdown.bom.cornerMechanismsCount}`}
                          {(selectedQuote.adminBreakdown.bom.slidingDoorsCount || 0) > 0 &&
                            ` · Плъзг:${selectedQuote.adminBreakdown.bom.slidingDoorsCount}вр / ${selectedQuote.adminBreakdown.bom.slidingRailBars3m}×3м релси (фира ${selectedQuote.adminBreakdown.bom.slidingRailWasteMeters}м) / ${selectedQuote.adminBreakdown.bom.slidingHandleBars3m}×3м дръжки (фира ${selectedQuote.adminBreakdown.bom.slidingHandleWasteMeters}м)`}
                          {(selectedQuote.adminBreakdown.bom.glassFrontAreaSqm || 0) > 0 &&
                            ` · Витрини:${selectedQuote.adminBreakdown.bom.glassFrontAreaSqm}м²`}
                          {((selectedQuote.adminBreakdown.bom.cutoutsCount || 0) > 0 ||
                            (selectedQuote.adminBreakdown.bom.cornerMillingCount || 0) > 0) &&
                            ` · CNC:${selectedQuote.adminBreakdown.bom.cutoutsCount || 0}отв/${selectedQuote.adminBreakdown.bom.cornerMillingCount || 0}фрез`}
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">Себестойност + Транспорт</div>
                        <div className="font-semibold text-zinc-900">
                          {selectedQuote.adminBreakdown.rawCostEur} € +{' '}
                          {selectedQuote.adminBreakdown.transportAndLogisticsEur ?? selectedQuote.logisticsFeeEur} €
                        </div>
                      </div>
                      <div>
                        <div className="text-zinc-500">
                          Изработка ({selectedQuote.adminBreakdown.craftsmanshipPercent}%) · Общо ({selectedQuote.adminBreakdown.globalMarginPercent ?? 0}%)
                        </div>
                        <div className="font-semibold text-emerald-700">
                          +{selectedQuote.adminBreakdown.craftsmanshipProfitEur} €
                          {(selectedQuote.adminBreakdown.globalMarginEur ?? 0) > 0
                            ? ` + ${selectedQuote.adminBreakdown.globalMarginEur} €`
                            : ''}{' '}
                          → {selectedQuote.totalPriceEur} €
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Full BOM & Real Suppliers Package Report (Always stored & downloadable in Admin) */}
                {(activeProj.bomReportText || activeProjectBomReport?.fullReportText) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 text-xs space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-900">
                          {lang === 'bg'
                            ? 'Пълен списък с обкова, уредите и доставчиците (BOM за имейл и цех)'
                            : 'Complete BOM & Real Suppliers Package Report'}
                        </span>
                        {activeProj.emailDeliveryMode && (
                          <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-[#E6B88A]">
                            {activeProj.emailDeliveryMode.toUpperCase()}
                            {activeProj.emailSentAt
                              ? ` · ${new Date(activeProj.emailSentAt).toLocaleString('bg-BG')}`
                              : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const txt =
                              activeProj.bomReportText || activeProjectBomReport?.fullReportText || '';
                            navigator.clipboard?.writeText(txt);
                            setBomReportCopied(true);
                            window.setTimeout(() => setBomReportCopied(false), 2500);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:border-[#B47B44]"
                        >
                          {bomReportCopied ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          <span>{bomReportCopied ? 'Копирано' : 'Копирай BOM'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const txt =
                              activeProj.bomReportText || activeProjectBomReport?.fullReportText || '';
                            triggerBrowserFileDownload(
                              `${activeProj.projectCode}-BOM-Obkov.txt`,
                              txt,
                              'text/plain;charset=utf-8;',
                            );
                          }}
                          className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:border-[#B47B44]"
                        >
                          <Download className="h-3 w-3" />
                          <span>Свали BOM (.txt)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setBomPanelExpanded((v) => !v)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:border-[#B47B44]"
                        >
                          <span>{bomPanelExpanded ? 'Скрий' : 'Покажи'}</span>
                        </button>
                      </div>
                    </div>
                    {bomPanelExpanded && (
                      <pre className="max-h-64 overflow-auto rounded-md border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-800 whitespace-pre-wrap">
                        {activeProj.bomReportText || activeProjectBomReport?.fullReportText}
                      </pre>
                    )}
                  </div>
                )}

                {/* Consultation Thread + Server Remarketing Offers */}
                <div>
                  <div className="text-xs font-semibold text-zinc-700 mb-2">
                    {lang === 'bg' ? 'Кореспонденция, оферти и ремаркетинг' : 'Client Discussion & Offers'}
                  </div>
                  <div className="space-y-2 max-h-52 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/70 p-3">
                    {(() => {
                      const combined = [
                        ...messages.map((m) => ({
                          id: m.id,
                          senderRole: m.senderRole,
                          senderName: m.senderName,
                          text: m.text,
                          createdAt: m.createdAt,
                        })),
                        ...(activeProj.crmMessages || []).filter(
                          (cm) => !messages.some((m) => m.text === cm.text),
                        ),
                      ];
                      if (combined.length === 0 && activeProj.initialQuestion) {
                        return (
                          <div className="rounded-lg bg-white border border-zinc-200 p-2.5 text-xs">
                            {activeProj.initialQuestion}
                          </div>
                        );
                      }
                      if (combined.length === 0) {
                        return (
                          <p className="text-center text-xs text-zinc-400 py-3">
                            {lang === 'bg'
                              ? 'Изпратете специална оферта или напомняне до клиента по-долу.'
                              : 'Send a special offer or reminder below.'}
                          </p>
                        );
                      }
                      return combined.map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-lg p-2.5 text-xs ${
                            m.senderRole === 'admin'
                              ? 'bg-[#B47B44]/15 text-zinc-900 ml-8'
                              : 'bg-white border border-zinc-200 text-zinc-800 mr-8'
                          }`}
                        >
                          <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5">
                            <span className="font-semibold">{m.senderName}</span>
                            <span>{m.createdAt}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* Quick Remarketing Templates */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setAdminReply(
                          `Специална оферта за проект ${activeProj.projectCode}: -5% отстъпка при потвърждение до края на седмицата!`,
                        )
                      }
                      className="rounded-md border border-[#B47B44]/30 bg-[#B47B44]/10 px-2 py-1 text-[10px] font-medium text-[#8C5A2B] hover:bg-[#B47B44]/20"
                    >
                      + Шаблон: -5% Оферта
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAdminReply(
                          `Здравейте! Виждаме запазения ви проект ${activeProj.projectCode}. Имате ли нужда от безплатна консултация за размерите или материалите?`,
                        )
                      }
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:border-[#B47B44]"
                    >
                      + Напомняне за чернова
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAdminReply(
                          `Предлагаме Ви професионално взимане на размери на място за проект ${activeProj.projectCode}. Свържете се с нас за удобен ден!`,
                        )
                      }
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:border-[#B47B44]"
                    >
                      + Покана за оглед/размери
                    </button>
                  </div>

                  <form onSubmit={handleSendAdminReply} className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={adminReply}
                      onChange={(e) => setAdminReply(e.target.value)}
                      placeholder={
                        lang === 'bg'
                          ? 'Специална оферта, отговор или напомняне...'
                          : 'Special offer or reply...'
                      }
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-900 focus:border-[#B47B44] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingOffer || !adminReply.trim()}
                      className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#B47B44] disabled:opacity-50 whitespace-nowrap"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{lang === 'bg' ? 'Изпрати оферта' : 'Send Offer'}</span>
                    </button>
                  </form>
                </div>

                {/* Approve & Unlock Final Release */}
                <div className="border-t border-zinc-100 pt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                  <div className="flex-1">
                    <label className="block text-[11px] text-zinc-500 mb-1">
                      {lang === 'bg'
                        ? 'Финална бележка при одобрение (видима за клиента след отключване)'
                        : 'Approval note for client'}
                    </label>
                    <input
                      type="text"
                      value={adminNoteDraft}
                      onChange={(e) => setAdminNoteDraft(e.target.value)}
                      placeholder={
                        lang === 'bg'
                          ? 'Напр. Уточнени размери, монтаж след 15 дни...'
                          : 'Confirmed dimensions and installation date...'
                      }
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApproveAndRelease(activeProj)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>
                      {lang === 'bg' ? '✓ Одобри и изпрати проекта' : '✓ Approve & Release'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Hidden Board Prices by Plovdiv Manufacturers */}
      {tab === 'boards' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap gap-1">
                {(['ALL', 'Egger', 'Kronospan', 'Kastamonu', 'MDF'] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBoardBrandFilter(b)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      boardBrandFilter === b
                        ? 'bg-[#18181B] text-white'
                        : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {b === 'ALL' ? 'Всички' : b}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportBoardsCsv}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:border-[#B47B44]"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Експорт CSV</span>
                </button>
                <label className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:border-[#B47B44] cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Импорт CSV</span>
                  <input type="file" accept=".csv,text/csv" onChange={handleImportBoardsCsv} className="hidden" />
                </label>
                <button
                  type="button"
                  disabled={pricingSaving}
                  onClick={() => savePricingBoth(pricing)}
                  className="rounded-lg bg-[#B47B44] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9E6835]"
                >
                  {lang === 'bg' ? 'Запази цените на плочите' : 'Save Board Prices'}
                </button>
              </div>
            </div>

            {/* Material Price Group Multipliers (Tiering) */}
            <div className="mb-4 rounded-lg border border-[#B47B44]/25 bg-amber-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900">
                    {lang === 'bg'
                      ? 'Ценови групи на материалите (коефициент върху базовата цена €/м²)'
                      : 'Material Price Group Multipliers'}
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    {lang === 'bg'
                      ? 'Автоматично оскъпяване според класа на избрания декор (напр. 1.00 = стандарт, 1.35 = +35% луксозен).'
                      : 'Automatic multiplier applied to carcass/front board cost by decor group.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pricingSaving}
                  onClick={() => savePricingBoth(pricing)}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#B47B44]"
                >
                  {lang === 'bg' ? 'Запази коефициентите' : 'Save Multipliers'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <label className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2.5 py-1.5">
                  <span className="text-[11px] text-zinc-700">
                    <b>Група 1</b> (Бяло / Едноцв.)
                  </span>
                  <input
                    type="number"
                    min={0.5}
                    max={3}
                    step={0.01}
                    value={pricing.boardGroupMultipliers?.group1 ?? 1.0}
                    onChange={(e) =>
                      setPricing((prev) => ({
                        ...prev,
                        boardGroupMultipliers: {
                          group1: Math.max(0.5, Number(e.target.value) || 1),
                          group2: prev.boardGroupMultipliers?.group2 ?? 1.12,
                          group3: prev.boardGroupMultipliers?.group3 ?? 1.35,
                        },
                      }))
                    }
                    className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-right font-mono-tabular text-xs font-semibold"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2.5 py-1.5">
                  <span className="text-[11px] text-zinc-700">
                    <b>Група 2</b> (Дървесни / Мат)
                  </span>
                  <input
                    type="number"
                    min={0.5}
                    max={3}
                    step={0.01}
                    value={pricing.boardGroupMultipliers?.group2 ?? 1.12}
                    onChange={(e) =>
                      setPricing((prev) => ({
                        ...prev,
                        boardGroupMultipliers: {
                          group1: prev.boardGroupMultipliers?.group1 ?? 1.0,
                          group2: Math.max(0.5, Number(e.target.value) || 1.12),
                          group3: prev.boardGroupMultipliers?.group3 ?? 1.35,
                        },
                      }))
                    }
                    className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-right font-mono-tabular text-xs font-semibold"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2.5 py-1.5">
                  <span className="text-[11px] text-zinc-700">
                    <b>Група 3</b> (Акрил / Гланц / Супермат)
                  </span>
                  <input
                    type="number"
                    min={0.5}
                    max={3}
                    step={0.01}
                    value={pricing.boardGroupMultipliers?.group3 ?? 1.35}
                    onChange={(e) =>
                      setPricing((prev) => ({
                        ...prev,
                        boardGroupMultipliers: {
                          group1: prev.boardGroupMultipliers?.group1 ?? 1.0,
                          group2: prev.boardGroupMultipliers?.group2 ?? 1.12,
                          group3: Math.max(0.5, Number(e.target.value) || 1.35),
                        },
                      }))
                    }
                    className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-right font-mono-tabular text-xs font-semibold"
                  />
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500">
                    <th className="py-2">Марка / Код</th>
                    <th className="py-2">Декор</th>
                    <th className="py-2">Тип</th>
                    <th className="py-2">Група</th>
                    <th className="py-2">Дебелина (мм)</th>
                    <th className="py-2">Каталог</th>
                    <th className="py-2 text-right">Скрита цена (€/м²)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {decors
                    .filter((d) => boardBrandFilter === 'ALL' || d.manufacturer === boardBrandFilter)
                    .map((d) => {
                      const isActive = d.active !== false;
                      const currentGroup: DecorPriceGroup =
                        d.priceGroup ||
                        (d.category === 'gloss' || d.materialType === 'MDF'
                          ? 3
                          : d.category === 'wood'
                            ? 2
                            : 1);
                      return (
                        <tr key={d.id} className={isActive ? '' : 'opacity-50 bg-zinc-50'}>
                          <td className="py-2.5 font-mono-tabular font-semibold text-zinc-900">
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-4 w-4 rounded border border-zinc-300 inline-block shrink-0"
                                style={{ backgroundColor: d.colorHex }}
                              />
                              {d.manufacturer} {d.code}
                            </span>
                          </td>
                          <td className="py-2.5 text-zinc-700">{d.nameBg}</td>
                          <td className="py-2.5 text-zinc-500">{d.materialType}</td>
                          <td className="py-2.5">
                            <select
                              value={currentGroup}
                              onChange={(e) =>
                                handleUpdateDecorPriceGroup(
                                  d,
                                  Number(e.target.value) as DecorPriceGroup,
                                )
                              }
                              className={`rounded border px-1.5 py-1 text-[11px] font-semibold ${
                                currentGroup === 3
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : currentGroup === 2
                                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                                    : 'border-zinc-300 bg-zinc-50 text-zinc-700'
                              }`}
                            >
                              <option value={1}>Група 1</option>
                              <option value={2}>Група 2</option>
                              <option value={3}>Група 3</option>
                            </select>
                          </td>
                          <td className="py-2.5 font-mono-tabular">
                            <input
                              type="number"
                              min={4}
                              max={50}
                              defaultValue={d.thicknessMm}
                              onBlur={(e) => handleUpdateDecorThickness(d, Number(e.target.value))}
                              className="w-16 rounded border border-zinc-300 px-2 py-1 text-center font-mono-tabular text-xs"
                            />
                          </td>
                          <td className="py-2.5">
                            <button
                              type="button"
                              onClick={() => handleToggleDecorActive(d)}
                              title={isActive ? 'Скрий от клиенти' : 'Покажи за клиенти'}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                isActive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-zinc-100 text-zinc-600 border border-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              {isActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                              <span>{isActive ? 'Видим' : 'Скрит'}</span>
                            </button>
                          </td>
                          <td className="py-2.5 text-right">
                            <input
                              type="number"
                              min={1}
                              step={0.5}
                              value={pricing.boardPricesPerSqm[d.id] ?? 24}
                              onChange={(e) =>
                                setPricing((prev) => ({
                                  ...prev,
                                  boardPricesPerSqm: {
                                    ...prev.boardPricesPerSqm,
                                    [d.id]: Number(e.target.value) || 0,
                                  },
                                }))
                              }
                              className="w-24 rounded border border-zinc-300 px-2 py-1 text-right font-mono-tabular text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add new decor from warehouse */}
          <form
            onSubmit={handleAddBoardDecor}
            className="lg:col-span-4 rounded-xl border border-zinc-200 bg-white p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-semibold text-zinc-900">
              {lang === 'bg' ? '+ Добави нов декор от склад' : '+ Add New Warehouse Decor'}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newDecor.manufacturer}
                onChange={(e) =>
                  setNewDecor({ ...newDecor, manufacturer: e.target.value as Manufacturer })
                }
                className="rounded border border-zinc-300 px-2 py-1.5 text-xs"
              >
                <option value="Egger">Egger</option>
                <option value="Kronospan">Kronospan</option>
                <option value="Kastamonu">Kastamonu</option>
                <option value="MDF">MDF</option>
              </select>
              <input
                type="text"
                required
                placeholder="Код (напр. H3157)"
                value={newDecor.code}
                onChange={(e) => setNewDecor({ ...newDecor, code: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-xs font-mono-tabular"
              />
            </div>
            <input
              type="text"
              required
              placeholder="Име на български"
              value={newDecor.nameBg}
              onChange={(e) => setNewDecor({ ...newDecor, nameBg: e.target.value })}
              className="w-full rounded border border-zinc-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              placeholder="English name"
              value={newDecor.nameEn}
              onChange={(e) => setNewDecor({ ...newDecor, nameEn: e.target.value })}
              className="w-full rounded border border-zinc-300 px-2.5 py-1.5 text-xs"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newDecor.category}
                onChange={(e) =>
                  setNewDecor({ ...newDecor, category: e.target.value as DecorCategory })
                }
                className="rounded border border-zinc-300 px-2 py-1.5 text-xs"
              >
                <option value="wood">Дървесен фладер</option>
                <option value="matte">Мат</option>
                <option value="gloss">Гланц</option>
                <option value="stone">Камък / Бетон</option>
              </select>
              <select
                value={newDecor.materialType}
                onChange={(e) =>
                  setNewDecor({ ...newDecor, materialType: e.target.value as MaterialType })
                }
                className="rounded border border-zinc-300 px-2 py-1.5 text-xs"
              >
                <option value="MFC">ПДЧ (ЛПДЧ)</option>
                <option value="MDF">МДФ</option>
              </select>
              <select
                value={newDecor.priceGroup}
                onChange={(e) =>
                  setNewDecor({
                    ...newDecor,
                    priceGroup: Number(e.target.value) as DecorPriceGroup,
                  })
                }
                className="rounded border border-zinc-300 px-2 py-1.5 text-xs font-medium"
              >
                <option value={1}>Група 1 (Стандарт)</option>
                <option value={2}>Група 2 (Дървесен)</option>
                <option value={3}>Група 3 (Гланц/МДФ)</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <label>
                <span className="text-[11px] text-zinc-500">Основен цвят</span>
                <input
                  type="color"
                  value={newDecor.colorHex}
                  onChange={(e) => setNewDecor({ ...newDecor, colorHex: e.target.value })}
                  className="mt-1 h-8 w-full rounded border border-zinc-300"
                />
              </label>
              <label>
                <span className="text-[11px] text-zinc-500">Жилка / Фладер</span>
                <input
                  type="color"
                  value={newDecor.grainHex}
                  onChange={(e) => setNewDecor({ ...newDecor, grainHex: e.target.value })}
                  className="mt-1 h-8 w-full rounded border border-zinc-300"
                />
              </label>
              <label>
                <span className="text-[11px] text-zinc-500">Цена €/м²</span>
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={newDecor.pricePerSqm}
                  onChange={(e) =>
                    setNewDecor({ ...newDecor, pricePerSqm: Number(e.target.value) || 20 })
                  }
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 font-mono-tabular"
                />
              </label>
            </div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18181B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B47B44]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{lang === 'bg' ? 'Добави декор в каталога' : 'Add Decor'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: Hardware, Mechanisms, Milling, Logistics + Craftsmanship % */}
      {tab === 'hardware' && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B47B44]/35 bg-amber-50/70 px-4 py-3">
            <div>
              <div className="text-xs font-bold text-zinc-900">
                {lang === 'bg'
                  ? 'Фирма „Мерит“ (meritbg.com) — Пълен каталог с 19 категории и 66 подраздела'
                  : 'Merit (meritbg.com) Full Catalog — 19 Categories & 66 Subsections'}
              </div>
              <div className="text-[11px] text-zinc-600 mt-0.5">
                {lang === 'bg'
                  ? 'Добавяйте и редактирайте конкретни артикули с размери, функции и цени в EUR под всеки подраздел — с автоматично преизчисляване на проектите.'
                  : 'Add and manage concrete items with sizes, specs and EUR prices under every subsection.'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTab('merit')}
              className="rounded-lg bg-[#18181B] px-3.5 py-2 text-xs font-semibold text-[#E5C17B] hover:bg-[#B47B44] hover:text-white transition-colors"
            >
              {lang === 'bg' ? 'Отвори каталог „Мерит“ →' : 'Open Merit Catalog →'}
            </button>
          </div>

          {/* Sub-card 1: Expensive Mechanisms & Internal Equipment */}
          <div className="space-y-3 border-b border-zinc-200 pb-6">
            <h3 className="text-sm font-semibold text-zinc-900">
              {lang === 'bg'
                ? '1. Скъпи механизми и вътрешно оборудване'
                : '1. Special Mechanisms & Internal Equipment'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">
                  Бутилково / Карго кошница (€/бр.)
                </span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={pricing.cargoBasketEur ?? 85}
                  onChange={(e) =>
                    setPricing({ ...pricing, cargoBasketEur: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">
                  Ъглов механизъм „Бъбрек“ / Magic Corner (€/бр.)
                </span>
                <input
                  type="number"
                  step={5}
                  min={0}
                  value={pricing.cornerMechanismEur ?? 220}
                  onChange={(e) =>
                    setPricing({ ...pricing, cornerMechanismEur: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">
                  Плъзгащи врати (алу. релси + кант-дръжки + четки €/л.м.)
                </span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={pricing.slidingTrackEurPerMeter ?? 68}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      slidingTrackEurPerMeter: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">
                  Лост за дрехи + държачи (€/л.м.)
                </span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={pricing.clothesRailEurPerMeter ?? 14}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      clothesRailEurPerMeter: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
            </div>
          </div>

          {/* Sub-card 2: Kitchen Details, Glass Vitrines & CNC Milling */}
          <div className="space-y-3 border-b border-zinc-200 pb-6">
            <h3 className="text-sm font-semibold text-zinc-900">
              {lang === 'bg'
                ? '2. Кухненски детайли, стъклени витрини и CNC фрезоване'
                : '2. Kitchen Trim, Glass Vitrines & CNC Milling'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Цокъл PVC/Алу (€/л.м.)</span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={pricing.plinthEurPerMeter ?? 12}
                  onChange={(e) =>
                    setPricing({ ...pricing, plinthEurPerMeter: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Водобранна лайсна (€/л.м.)</span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={pricing.waterSealEurPerMeter ?? 9}
                  onChange={(e) =>
                    setPricing({ ...pricing, waterSealEurPerMeter: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Изрязване отвор (€/бр.)</span>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={pricing.cutoutEurPerHole ?? 18}
                  onChange={(e) =>
                    setPricing({ ...pricing, cutoutEurPerHole: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Фрезоване плот 90° (€/бр.)</span>
                <input
                  type="number"
                  step={2}
                  min={0}
                  value={pricing.cornerMillingEur ?? 45}
                  onChange={(e) =>
                    setPricing({ ...pricing, cornerMillingEur: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Стъкл. витрина + алу. (€/м²)</span>
                <input
                  type="number"
                  step={2}
                  min={0}
                  value={pricing.glassFrameEurPerSqm ?? 95}
                  onChange={(e) =>
                    setPricing({ ...pricing, glassFrameEurPerSqm: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">ABS Кант (€/л.м.)</span>
                <input
                  type="number"
                  step={0.1}
                  value={pricing.edgeBandingEurPerMeter}
                  onChange={(e) =>
                    setPricing({ ...pricing, edgeBandingEurPerMeter: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">HDF Гръб 4мм (€/м²)</span>
                <input
                  type="number"
                  step={0.5}
                  value={pricing.hdfBackEurPerSqm}
                  onChange={(e) =>
                    setPricing({ ...pricing, hdfBackEurPerSqm: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Плот 40мм (€/л.м.)</span>
                <input
                  type="number"
                  step={1}
                  value={pricing.countertopEurPerMeter}
                  onChange={(e) =>
                    setPricing({ ...pricing, countertopEurPerMeter: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Термо гръб (€/м²)</span>
                <input
                  type="number"
                  step={1}
                  value={pricing.backsplashEurPerSqm ?? 44}
                  onChange={(e) =>
                    setPricing({ ...pricing, backsplashEurPerSqm: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Долен L/C (€/л.м.)</span>
                <input
                  type="number"
                  step={0.5}
                  value={pricing.golaProfileEurPerMeter ?? 18}
                  onChange={(e) =>
                    setPricing({ ...pricing, golaProfileEurPerMeter: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Горен LED (€/л.м.)</span>
                <input
                  type="number"
                  step={0.5}
                  value={pricing.upperLedProfileEurPerMeter ?? 22}
                  onChange={(e) =>
                    setPricing({ ...pricing, upperLedProfileEurPerMeter: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">
                  Вгр. дръжки / фрез. улей (€/л.м.)
                </span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={pricing.handleMillingEurPerMeter ?? 14}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      handleMillingEurPerMeter: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">
                  Водоуст. PUR кант (€/л.м.)
                </span>
                <input
                  type="number"
                  step={0.2}
                  min={0}
                  value={pricing.purEdgeBandingEurPerMeter ?? 3.2}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      purEdgeBandingEurPerMeter: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
            </div>
          </div>

          {/* Sub-card 3: Logistics, On-Site Measurement, Min Order Safeguard & Markup */}
          <div className="space-y-3 border-b border-zinc-200 pb-6">
            <h3 className="text-sm font-semibold text-zinc-900">
              {lang === 'bg'
                ? '3. Логистика, замерване, защита от малки поръчки и надценка'
                : '3. Logistics, Measurement, Min Order Safeguard & Craftsmanship %'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <label className="block">
                <span className="text-xs font-semibold text-zinc-900">
                  Надценка изработка (%)
                </span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={pricing.craftsmanshipPercent}
                  onChange={(e) =>
                    setPricing({ ...pricing, craftsmanshipPercent: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-base font-bold text-[#B47B44]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Мин. поръчка (€)</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={pricing.minOrderEur ?? 180}
                  onChange={(e) =>
                    setPricing({ ...pricing, minOrderEur: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm font-semibold text-zinc-900"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Качване без асансьор (€/етаж)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={pricing.floorCarryEurPerFloor ?? 8}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      floorCarryEurPerFloor: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Такса оглед / размери (€)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={pricing.measurementFeeEur ?? 25}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      measurementFeeEur: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Транспорт (€ фикс)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={pricing.transportEur ?? 0}
                  onChange={(e) =>
                    setPricing({ ...pricing, transportEur: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Извън града (€/км)</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={pricing.outsideCityEurPerKm ?? 0.8}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      outsideCityEurPerKm: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Фира разкрой (%)</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={pricing.wastePercent ?? 15}
                  onChange={(e) =>
                    setPricing({ ...pricing, wastePercent: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Монтаж (% надценка)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pricing.installationPercent ?? 0}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      installationPercent: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Срок Кухни (дни)</span>
                <input
                  type="number"
                  min={1}
                  value={pricing.productionDaysKitchen ?? 25}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      productionDaysKitchen: Math.max(1, Number(e.target.value) || 25),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Срок Гардероби (дни)</span>
                <input
                  type="number"
                  min={1}
                  value={pricing.productionDaysWardrobe ?? 18}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      productionDaysWardrobe: Math.max(1, Number(e.target.value) || 18),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Срок Други (дни)</span>
                <input
                  type="number"
                  min={1}
                  value={pricing.productionDaysOther ?? 12}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      productionDaysOther: Math.max(1, Number(e.target.value) || 12),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="text-xs font-medium text-zinc-700">Зона на обслужване (BG)</span>
                <input
                  type="text"
                  value={pricing.serviceZoneBg ?? 'Пловдив и област до 50 км'}
                  onChange={(e) => setPricing({ ...pricing, serviceZoneBg: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="text-xs font-medium text-zinc-700">Service Zone (EN)</span>
                <input
                  type="text"
                  value={pricing.serviceZoneEn ?? 'Plovdiv & region up to 50 km'}
                  onChange={(e) => setPricing({ ...pricing, serviceZoneEn: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </label>
            </div>
          </div>

          {/* Sub-card 3: Complete 3-Level Hardware Purchasing Table */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  {lang === 'bg'
                    ? '3. Пълна таблица с реални покупни цени за обков (€) — 3 ценови нива'
                    : '3. Full Hardware Purchasing Price Table (€) — 3 Tiers'}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {lang === 'bg'
                    ? 'Въведете реалните доставни цени (€) за панти, водачи, повдигачи и 3-метрови плъзгащи профили. Клиентът избира Ниво 1, 2 или 3 в 3D Студиото.'
                    : 'Enter purchasing costs (€) for Economy, Standard Balance, and Premium levels.'}
                </p>
              </div>
              <button
                type="button"
                disabled={pricingSaving}
                onClick={() => savePricingBoth(pricing)}
                className="rounded-lg bg-[#B47B44] px-5 py-2 text-xs font-semibold text-white hover:bg-[#9E6835]"
              >
                {lang === 'bg' ? 'Запази цените на обкова' : 'Save Hardware Prices'}
              </button>
            </div>

            {/* 3 Clear Side-by-Side Tier Columns */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {(
                [
                  {
                    id: 'hw_economy',
                    badge: 'Ниво 1',
                    titleBg: 'Икономичен / Бюджетен клас',
                    subtitleBg: 'Ролкови водачи, обикновени панти без демпфер, газови амортисьори',
                    accent: 'border-zinc-300 bg-zinc-50/70',
                    badgeClass: 'bg-zinc-800 text-white',
                  },
                  {
                    id: 'hw_gtv',
                    badge: 'Ниво 2',
                    titleBg: 'Стандартен клас (Баланс)',
                    subtitleBg: 'Мерит Пловдив, Настех, Балкан Юг, Gal Plas — Soft-Close, скрити с долно водене',
                    accent: 'border-sky-300 bg-sky-50/40',
                    badgeClass: 'bg-sky-700 text-white',
                  },
                  {
                    id: 'hw_blum',
                    badge: 'Ниво 3',
                    titleBg: 'Премиум клас (Blum & Hettich)',
                    subtitleBg: 'Blumotion / Sensys, Tandem / Quadro, Tandembox / InnoTech, Aventos, TopLine',
                    accent: 'border-[#B47B44]/60 bg-amber-50/40',
                    badgeClass: 'bg-[#B47B44] text-white',
                  },
                ] as const
              ).map((colMeta) => {
                const rates: HardwareUnitPricing = {
                  ...DEFAULT_PRICING_CONFIG.hardwarePrices[colMeta.id],
                  ...(pricing.hardwarePrices[colMeta.id] || {}),
                };
                const tierObj = hardwareTiers.find((h) => h.id === colMeta.id);
                const isHwActive = tierObj ? tierObj.active !== false : true;
                const updateField = (field: keyof HardwareUnitPricing, val: number) => {
                  setPricing((prev) => ({
                    ...prev,
                    hardwarePrices: {
                      ...prev.hardwarePrices,
                      [colMeta.id]: { ...rates, [field]: Math.max(0, val) },
                    },
                  }));
                };

                return (
                  <div
                    key={colMeta.id}
                    className={`rounded-xl border-2 p-4 space-y-4 ${colMeta.accent} ${
                      isHwActive ? '' : 'opacity-65'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-zinc-200/80 pb-3">
                      <div>
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colMeta.badgeClass}`}
                        >
                          {colMeta.badge}
                        </span>
                        <h4 className="mt-1 text-sm font-bold text-zinc-900">{colMeta.titleBg}</h4>
                        <p className="text-[11px] text-zinc-600 leading-snug mt-0.5">
                          {colMeta.subtitleBg}
                        </p>
                      </div>
                      {tierObj && (
                        <button
                          type="button"
                          onClick={() => handleToggleHardwareActive(tierObj)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium border shrink-0 ${
                            isHwActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600 border-zinc-300'
                          }`}
                        >
                          {isHwActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          <span>{isHwActive ? 'Активен' : 'Скрит'}</span>
                        </button>
                      )}
                    </div>

                    {/* Group A: Hinges */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                        Панти (цена за 1 бр. €)
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate" title="Обикновена панта">
                            Обикновена
                          </span>
                          <input
                            type="number"
                            step={0.1}
                            min={0}
                            value={rates.hingeEur}
                            onChange={(e) => updateField('hingeEur', Number(e.target.value) || 0)}
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate" title="Панта с плавно прибиране">
                            Плавно приб.
                          </span>
                          <input
                            type="number"
                            step={0.1}
                            min={0}
                            value={rates.hingeSoftCloseEur ?? rates.hingeEur}
                            onChange={(e) =>
                              updateField('hingeSoftCloseEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate" title="Ъглова панта">
                            Ъглова
                          </span>
                          <input
                            type="number"
                            step={0.1}
                            min={0}
                            value={rates.hingeCornerEur ?? rates.hingeEur * 1.4}
                            onChange={(e) =>
                              updateField('hingeCornerEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Group B: Drawer Slides */}
                    <div className="space-y-1.5 border-t border-zinc-200/70 pt-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                        Водачи за чекмеджета (€ / чифт)
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate">
                            Ролков (обикновен)
                          </span>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={rates.drawerSlideEur}
                            onChange={(e) =>
                              updateField('drawerSlideEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate">
                            Телескопичен (плавен)
                          </span>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={rates.slideTelescopicEur ?? rates.drawerSlideEur}
                            onChange={(e) =>
                              updateField('slideTelescopicEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate">
                            Скрит (долно водене)
                          </span>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={rates.slideHiddenEur ?? rates.drawerSlideEur}
                            onChange={(e) =>
                              updateField('slideHiddenEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate">
                            Метална страница (бокс)
                          </span>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={rates.slideMetalBoxEur ?? rates.drawerSlideEur}
                            onChange={(e) =>
                              updateField('slideMetalBoxEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Group C: Lifts */}
                    <div className="space-y-1.5 border-t border-zinc-200/70 pt-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                        Повдигащи механизми (€ / комплект)
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate">
                            Газов амортисьор
                          </span>
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={rates.liftEur}
                            onChange={(e) => updateField('liftEur', Number(e.target.value) || 0)}
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600 block truncate">
                            Двоен / Aventos клапа
                          </span>
                          <input
                            type="number"
                            step={1}
                            min={0}
                            value={rates.liftDoubleAventosEur ?? rates.liftEur}
                            onChange={(e) =>
                              updateField('liftDoubleAventosEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Group D: Wardrobe Sliding Systems (3m sticks + door kit) */}
                    <div className="space-y-1.5 border-t border-zinc-200/70 pt-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                        Плъзгащи системи за гардероби
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <label className="block">
                          <span
                            className="text-[10px] text-zinc-600 block truncate"
                            title="Горна + долна релса (3-метрова пръчка €)"
                          >
                            Релси (3м прът)
                          </span>
                          <input
                            type="number"
                            step={1}
                            min={0}
                            value={rates.slidingRail3mEur ?? 64}
                            onChange={(e) =>
                              updateField('slidingRail3mEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span
                            className="text-[10px] text-zinc-600 block truncate"
                            title="Механизъм за плъзгане — комплект за 1 врата €"
                          >
                            Мех. 1 врата (€)
                          </span>
                          <input
                            type="number"
                            step={1}
                            min={0}
                            value={rates.slidingMechPerDoorEur ?? 44}
                            onChange={(e) =>
                              updateField('slidingMechPerDoorEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span
                            className="text-[10px] text-zinc-600 block truncate"
                            title="Кант-дръжка (3-метрова пръчка €)"
                          >
                            Кант-дръжка (3м)
                          </span>
                          <input
                            type="number"
                            step={1}
                            min={0}
                            value={rates.slidingHandleBar3mEur ?? 34}
                            onChange={(e) =>
                              updateField('slidingHandleBar3mEur', Number(e.target.value) || 0)
                            }
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Group E: Hanger, Handle, Leg */}
                    <div className="space-y-1.5 border-t border-zinc-200/70 pt-2.5">
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <label className="block">
                          <span className="text-[10px] text-zinc-600">Окачвач (€)</span>
                          <input
                            type="number"
                            step={0.2}
                            min={0}
                            value={rates.hangerEur}
                            onChange={(e) => updateField('hangerEur', Number(e.target.value) || 0)}
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600">Дръжка (€)</span>
                          <input
                            type="number"
                            step={0.2}
                            min={0}
                            value={rates.handleEur}
                            onChange={(e) => updateField('handleEur', Number(e.target.value) || 0)}
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] text-zinc-600">Краче (€)</span>
                          <input
                            type="number"
                            step={0.2}
                            min={0}
                            value={rates.legEur}
                            onChange={(e) => updateField('legEur', Number(e.target.value) || 0)}
                            className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono-tabular text-xs"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Extra / Custom Hardware Series Added by Admin */}
            {hardwareTiers.filter(
              (hw) => hw.id !== 'hw_economy' && hw.id !== 'hw_gtv' && hw.id !== 'hw_blum',
            ).length > 0 && (
              <div className="pt-4 border-t border-zinc-200 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  {lang === 'bg'
                    ? 'Допълнителни серии и добавени производители'
                    : 'Additional & Custom Hardware Series'}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {hardwareTiers
                    .filter(
                      (hw) => hw.id !== 'hw_economy' && hw.id !== 'hw_gtv' && hw.id !== 'hw_blum',
                    )
                    .map((hw) => {
                      const isHwActive = hw.active !== false;
                      const rates = pricing.hardwarePrices[hw.id] || {
                        hingeEur: 3,
                        drawerSlideEur: 8,
                        liftEur: 12,
                        hangerEur: 2,
                        handleEur: 3,
                        legEur: 1.5,
                      };
                      const updateRate = (field: keyof typeof rates, val: number) => {
                        setPricing((prev) => ({
                          ...prev,
                          hardwarePrices: {
                            ...prev.hardwarePrices,
                            [hw.id]: { ...rates, [field]: val },
                          },
                        }));
                      };
                      return (
                        <div
                          key={hw.id}
                          className={`rounded-lg border p-4 space-y-3 ${
                            isHwActive
                              ? 'border-zinc-200 bg-white'
                              : 'border-zinc-200 bg-zinc-50 opacity-65'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-sm text-zinc-900">
                                {hw.nameBg} ({hw.brand})
                              </div>
                              <div className="text-[11px] text-zinc-500">
                                {hw.warrantyYears} г. · {hw.loadCapacityKg} кг
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleToggleHardwareActive(hw)}
                                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium border ${
                                  isHwActive
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-zinc-100 text-zinc-600 border-zinc-300'
                                }`}
                              >
                                {isHwActive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                <span>{isHwActive ? 'Видим' : 'Скрит'}</span>
                              </button>
                              {!hw.isBaseDefault && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteHardwareTier(hw)}
                                  className="inline-flex items-center rounded border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <label>
                              <span className="text-zinc-500">Панта (€)</span>
                              <input
                                type="number"
                                step={0.5}
                                value={rates.hingeEur}
                                onChange={(e) => updateRate('hingeEur', Number(e.target.value) || 0)}
                                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 font-mono-tabular"
                              />
                            </label>
                            <label>
                              <span className="text-zinc-500">Водач (€)</span>
                              <input
                                type="number"
                                step={0.5}
                                value={rates.drawerSlideEur}
                                onChange={(e) =>
                                  updateRate('drawerSlideEur', Number(e.target.value) || 0)
                                }
                                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 font-mono-tabular"
                              />
                            </label>
                            <label>
                              <span className="text-zinc-500">Лифт (€)</span>
                              <input
                                type="number"
                                step={1}
                                value={rates.liftEur}
                                onChange={(e) => updateRate('liftEur', Number(e.target.value) || 0)}
                                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 font-mono-tabular"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={pricingSaving}
            onClick={() => savePricingBoth(pricing)}
            className="rounded-lg bg-[#B47B44] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#9E6835]"
          >
            {lang === 'bg' ? 'Запази цените на обкова и механизмите' : 'Save Hardware Prices'}
          </button>

          {/* Add Custom Hardware Brand / Series */}
          <form
            onSubmit={handleAddHardwareTier}
            className="mt-4 rounded-xl border border-dashed border-[#B47B44]/50 bg-amber-50/30 p-5 space-y-4"
          >
            <div>
              <h4 className="text-sm font-semibold text-zinc-900">
                {lang === 'bg'
                  ? '+ Добави нов производител / серия обков (Häfele, Grass, Salice, Samet и др.)'
                  : '+ Add New Hardware Manufacturer / Series'}
              </h4>
              <p className="text-xs text-zinc-500 mt-0.5">
                {lang === 'bg'
                  ? 'Новият производител се добавя директно в 3D студиото и участва в калкулацията на офертите.'
                  : 'Appears immediately in the 3D Studio hardware selector and pricing engine.'}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <label className="block">
                <span className="text-zinc-700 font-medium">Производител (Марка) *</span>
                <input
                  type="text"
                  required
                  placeholder="Напр. Grass / Häfele"
                  value={newHw.brand}
                  onChange={(e) => setNewHw({ ...newHw, brand: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5"
                />
              </label>
              <label className="block">
                <span className="text-zinc-700 font-medium">Име на серията (BG) *</span>
                <input
                  type="text"
                  required
                  placeholder="Напр. Grass Scala (Premium)"
                  value={newHw.nameBg}
                  onChange={(e) => setNewHw({ ...newHw, nameBg: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5"
                />
              </label>
              <label className="block">
                <span className="text-zinc-700 font-medium">Клас обков</span>
                <select
                  value={newHw.tier}
                  onChange={(e) =>
                    setNewHw({ ...newHw, tier: e.target.value as HardwareTierLevel })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5"
                >
                  <option value="economy">Economy (Ниво 1)</option>
                  <option value="standard">Standard (Ниво 2)</option>
                  <option value="premium">Premium (Ниво 3)</option>
                  <option value="luxury">Luxury (Ниво 3+)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-zinc-700 font-medium">Name (EN)</span>
                <input
                  type="text"
                  placeholder="Grass Scala Soft-Close"
                  value={newHw.nameEn}
                  onChange={(e) => setNewHw({ ...newHw, nameEn: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-zinc-700 font-medium">Кратко описание за клиента</span>
                <input
                  type="text"
                  placeholder="Тънкостенни метални чекмеджета с плавно прибиране..."
                  value={newHw.descriptionBg}
                  onChange={(e) => setNewHw({ ...newHw, descriptionBg: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5"
                />
              </label>
              <label className="block">
                <span className="text-zinc-700 font-medium">Гаранция (год.)</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={newHw.warrantyYears}
                  onChange={(e) =>
                    setNewHw({ ...newHw, warrantyYears: Number(e.target.value) || 5 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono-tabular"
                />
              </label>
              <label className="block">
                <span className="text-zinc-700 font-medium">Товароносимост (кг)</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={newHw.loadCapacityKg}
                  onChange={(e) =>
                    setNewHw({ ...newHw, loadCapacityKg: Number(e.target.value) || 40 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono-tabular"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs items-end">
              <label>
                <span className="text-zinc-600">Панта (€)</span>
                <input
                  type="number"
                  step={0.5}
                  value={newHw.hingeEur}
                  onChange={(e) => setNewHw({ ...newHw, hingeEur: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono-tabular"
                />
              </label>
              <label>
                <span className="text-zinc-600">Водач (€)</span>
                <input
                  type="number"
                  step={0.5}
                  value={newHw.drawerSlideEur}
                  onChange={(e) =>
                    setNewHw({ ...newHw, drawerSlideEur: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono-tabular"
                />
              </label>
              <label>
                <span className="text-zinc-600">Клапа/Лифт (€)</span>
                <input
                  type="number"
                  step={1}
                  value={newHw.liftEur}
                  onChange={(e) => setNewHw({ ...newHw, liftEur: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono-tabular"
                />
              </label>
              <label>
                <span className="text-zinc-600">Окачвач (€)</span>
                <input
                  type="number"
                  step={0.5}
                  value={newHw.hangerEur}
                  onChange={(e) => setNewHw({ ...newHw, hangerEur: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono-tabular"
                />
              </label>
              <label>
                <span className="text-zinc-600">Дръжка (€)</span>
                <input
                  type="number"
                  step={0.5}
                  value={newHw.handleEur}
                  onChange={(e) => setNewHw({ ...newHw, handleEur: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono-tabular"
                />
              </label>
              <label>
                <span className="text-zinc-600">Краче (€)</span>
                <input
                  type="number"
                  step={0.2}
                  value={newHw.legEur}
                  onChange={(e) => setNewHw({ ...newHw, legEur: Number(e.target.value) || 0 })}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono-tabular"
                />
              </label>
              <label className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newHw.softClose}
                  onChange={(e) => setNewHw({ ...newHw, softClose: e.target.checked })}
                />
                <span className="text-[11px] font-medium text-zinc-700">Soft-Close</span>
              </label>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B47B44]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{lang === 'bg' ? 'Добави производителя в каталога' : 'Add Hardware Brand'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3A: Merit (meritbg.com) Complete 19-Category / 66-Subsection Catalog */}
      {tab === 'merit' && (
        <AdminMeritCatalog
          lang={lang}
          items={meritItems}
          onSaveItems={saveMeritServerAndFirestore}
        />
      )}

      {/* TAB 3A-2: GAL PLAS LTD (galplas.bg) Complete Catalog */}
      {tab === 'galplas' && (
        <AdminPartnerCatalog
          lang={lang}
          vendor="galplas"
          categories={GALPLAS_CATEGORIES}
          items={galplasItems}
          onSaveCatalog={(nextItems, msg) => saveGalplasServerAndFirestore(nextItems, msg)}
        />
      )}

      {/* TAB 3A-3: Nasteh Ltd (Plovdiv) Catalog + Custom Subsections + S02 Glass Vitrine Calculator */}
      {tab === 'nasteh' && (
        <AdminPartnerCatalog
          lang={lang}
          vendor="nasteh"
          categories={NASTEH_CATEGORIES}
          customSubsections={nastehCustomSubsections}
          items={nastehItems}
          vitrineS02={pricing.vitrineS02 || DEFAULT_PRICING_CONFIG.vitrineS02}
          onSaveVitrineS02={saveVitrineS02Pricing}
          onSaveCatalog={(nextItems, msg, nextSubs) =>
            saveNastehServerAndFirestore(nextItems, msg, nextSubs)
          }
        />
      )}

      {/* TAB 3B: Dedicated Transport, Logistics & Global Total Margin % Menu */}
      {tab === 'margin' && (
        <div className="space-y-6">
          {/* Master Global Percentage Card */}
          <div className="rounded-xl border-2 border-[#B47B44]/40 bg-gradient-to-br from-amber-50/60 via-white to-white p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <span className="inline-block rounded bg-[#B47B44] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  {lang === 'bg' ? 'Общ процент върху всичко' : 'Master Total Margin %'}
                </span>
                <h3 className="mt-2 text-lg font-bold text-zinc-900">
                  {lang === 'bg'
                    ? 'Обща надценка (%) върху крайната цена на избраното от клиента'
                    : 'Global Margin (%) on Entire Client Configuration'}
                </h3>
                <p className="mt-1 text-xs text-zinc-600 leading-relaxed">
                  {lang === 'bg'
                    ? 'Когато заложите реалните покупни цени на плочите, обкова, механизмите и транспорта, оттук с едно поле задавате общ процент (%) върху крайната сума на целия проект (важи за всяка поръчка в 3D Студиото).'
                    : 'Applies one master percentage across all selected boards, hardware, craftsmanship, and transport.'}
                </p>
              </div>
              <button
                type="button"
                disabled={pricingSaving}
                onClick={() => savePricingBoth(pricing)}
                className="rounded-lg bg-[#18181B] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#B47B44]"
              >
                {lang === 'bg' ? 'Запази транспорт и % Общо' : 'Save Transport & Margin'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              <div className="lg:col-span-5 rounded-xl border border-[#B47B44]/30 bg-white p-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-800">
                    {lang === 'bg'
                      ? 'Общ % върху крайната цена (всичко избрано + транспорт):'
                      : 'Global % Over Total Configuration:'}
                  </span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={300}
                      step={1}
                      value={pricing.globalMarginPercent ?? 0}
                      onChange={(e) =>
                        setPricing({
                          ...pricing,
                          globalMarginPercent: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-32 rounded-lg border-2 border-[#B47B44] px-3 py-2 font-mono-tabular text-2xl font-bold text-[#B47B44]"
                    />
                    <span className="text-lg font-bold text-zinc-500">%</span>
                  </div>
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {[0, 10, 15, 20, 25, 30, 40, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setPricing({ ...pricing, globalMarginPercent: pct })}
                      className={`rounded-md px-2.5 py-1 font-mono-tabular text-xs font-semibold border transition-colors ${
                        (pricing.globalMarginPercent ?? 0) === pct
                          ? 'border-[#18181B] bg-[#18181B] text-white'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-[#B47B44]'
                      }`}
                    >
                      +{pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Transparent Formula Card */}
              <div className="lg:col-span-7 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-xs space-y-2">
                <div className="font-semibold text-zinc-900">
                  {lang === 'bg'
                    ? 'Формула на крайната клиентска оферта (пример с 1 000 € реални разходи):'
                    : 'Live Formula Example (1,000 € base cost):'}
                </div>
                {(() => {
                  const sampleMatHw = 1000;
                  const sampleCraft = Math.round(sampleMatHw * (pricing.craftsmanshipPercent / 100));
                  const sampleInstall = Math.round(sampleMatHw * ((pricing.installationPercent ?? 0) / 100));
                  const sampleTransp = Math.round(pricing.transportEur ?? 0);
                  const sub = sampleMatHw + sampleCraft + sampleInstall + sampleTransp;
                  const gPct = pricing.globalMarginPercent ?? 0;
                  const gAdd = Math.round(sub * (gPct / 100));
                  const finalSample = Math.round((sub + gAdd) / 5) * 5;
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 font-mono-tabular">
                      <div className="rounded bg-white border border-zinc-200 p-2">
                        <div className="text-[10px] text-zinc-500">Плочи + Обков</div>
                        <div className="font-bold text-zinc-900">{sampleMatHw} €</div>
                      </div>
                      <div className="rounded bg-white border border-zinc-200 p-2">
                        <div className="text-[10px] text-zinc-500">
                          Изработка ({pricing.craftsmanshipPercent}%)
                        </div>
                        <div className="font-bold text-zinc-900">+{sampleCraft} €</div>
                      </div>
                      <div className="rounded bg-white border border-zinc-200 p-2">
                        <div className="text-[10px] text-zinc-500">Транспорт фикс</div>
                        <div className="font-bold text-zinc-900">+{sampleTransp} €</div>
                      </div>
                      <div className="rounded bg-white border border-[#B47B44]/40 p-2">
                        <div className="text-[10px] text-[#8C5A2B]">Общ % (+{gPct}%)</div>
                        <div className="font-bold text-[#B47B44]">+{gAdd} €</div>
                      </div>
                      <div className="rounded bg-emerald-700 text-white p-2">
                        <div className="text-[10px] text-emerald-100">Крайна цена</div>
                        <div className="font-bold">{finalSample} €</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Transport, Logistics, Craftsmanship & Lead Time Controls */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-5">
            <h3 className="text-sm font-semibold text-zinc-900">
              {lang === 'bg'
                ? 'Транспорт, монтаж, изработка и срокове'
                : 'Transport, Installation, Craftsmanship & Lead Times'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <label className="block">
                <span className="text-xs font-semibold text-zinc-900">Транспорт в града (€ фикс)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={pricing.transportEur ?? 0}
                  onChange={(e) =>
                    setPricing({ ...pricing, transportEur: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border-2 border-zinc-300 px-3 py-2 font-mono-tabular text-base font-bold text-zinc-900"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Извън града (€/км)</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={pricing.outsideCityEurPerKm ?? 0.9}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      outsideCityEurPerKm: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Качване без асансьор (€/етаж)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={pricing.floorCarryEurPerFloor ?? 15}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      floorCarryEurPerFloor: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Такса оглед / размери (€)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={pricing.measurementFeeEur ?? 0}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      measurementFeeEur: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-zinc-900">Надценка изработка (%)</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={pricing.craftsmanshipPercent}
                  onChange={(e) =>
                    setPricing({ ...pricing, craftsmanshipPercent: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-base font-bold text-[#B47B44]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Монтаж (% надценка)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pricing.installationPercent ?? 0}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      installationPercent: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Фира разкрой плочи (%)</span>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={pricing.wastePercent ?? 15}
                  onChange={(e) =>
                    setPricing({ ...pricing, wastePercent: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Мин. поръчка (€)</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={pricing.minOrderEur ?? 450}
                  onChange={(e) =>
                    setPricing({ ...pricing, minOrderEur: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Срок Кухни (дни)</span>
                <input
                  type="number"
                  min={1}
                  value={pricing.productionDaysKitchen ?? 18}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      productionDaysKitchen: Math.max(1, Number(e.target.value) || 18),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Срок Гардероби (дни)</span>
                <input
                  type="number"
                  min={1}
                  value={pricing.productionDaysWardrobe ?? 14}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      productionDaysWardrobe: Math.max(1, Number(e.target.value) || 14),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-700">Срок Други (дни)</span>
                <input
                  type="number"
                  min={1}
                  value={pricing.productionDaysOther ?? 10}
                  onChange={(e) =>
                    setPricing({
                      ...pricing,
                      productionDaysOther: Math.max(1, Number(e.target.value) || 10),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono-tabular text-sm"
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="text-xs font-medium text-zinc-700">Зона на обслужване (BG)</span>
                <input
                  type="text"
                  value={pricing.serviceZoneBg ?? 'Пловдив и област до 50 км'}
                  onChange={(e) => setPricing({ ...pricing, serviceZoneBg: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="text-xs font-medium text-zinc-700">Service Zone (EN)</span>
                <input
                  type="text"
                  value={pricing.serviceZoneEn ?? 'Plovdiv & region up to 50 km'}
                  onChange={(e) => setPricing({ ...pricing, serviceZoneEn: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={pricingSaving}
              onClick={() => savePricingBoth(pricing)}
              className="rounded-lg bg-[#B47B44] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#9E6835]"
            >
              {lang === 'bg' ? 'Запази настройките за транспорт и %' : 'Save Transport & Margin Settings'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: Drag & Drop Gallery Photo Manager by Section */}
      {tab === 'gallery' && (
        <div className="space-y-5">
          {/* Category Section Tabs (Всички / Кухни / Гардероби / ...) */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', lang === 'bg' ? 'Всички раздели' : 'All Sections'],
                  ['kitchen', lang === 'bg' ? 'Кухни' : 'Kitchens'],
                  ['wardrobe', lang === 'bg' ? 'Гардероби' : 'Wardrobes'],
                  ['dresser', lang === 'bg' ? 'Скринове' : 'Dressers'],
                  ['living', lang === 'bg' ? 'Хол и ТВ' : 'Living & TV'],
                  ['hallway', lang === 'bg' ? 'Антре' : 'Hallway'],
                  ['office', lang === 'bg' ? 'Офис' : 'Office'],
                ] as ['all' | FurnitureCategory, string][]
              ).map(([catId, catLabel]) => {
                const count =
                  catId === 'all'
                    ? gallery.length
                    : gallery.filter((g) => g.category === catId).length;
                const active = gallerySectionFilter === catId;
                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => {
                      setGallerySectionFilter(catId);
                      if (catId !== 'all') {
                        setGalForm((prev) => ({ ...prev, category: catId }));
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#18181B] text-white'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                    }`}
                  >
                    <span>{catLabel}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono-tabular text-[10px] ${
                        active ? 'bg-[#B47B44] text-white' : 'bg-white text-zinc-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] text-zinc-500">
                {lang === 'bg'
                  ? 'Подредете слайд-галерията чрез № или стрелките ↑ / ↓ на всяка снимка.'
                  : 'Reorder slideshow via № or ↑ / ↓ on each photo.'}
              </div>
              {orderedGallery.length > 1 && (
                <button
                  type="button"
                  disabled={gallerySavingOrder}
                  onClick={handleSaveNumberedOrder}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#B47B44] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#9C6635] disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {gallerySavingOrder
                      ? lang === 'bg'
                        ? 'Запис...'
                        : 'Saving...'
                      : lang === 'bg'
                        ? 'Запази подредбата'
                        : 'Save Order'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Slideshow Speed / Interval Control (3-12 seconds per photo) */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-[220px]">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B47B44]/12 text-[#B47B44] shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900">
                  {lang === 'bg'
                    ? 'Скорост на смяна в слайд-галерията'
                    : 'Slideshow Transition Speed'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {lang === 'bg'
                    ? 'Време за показване на всяка снимка (3–12 сек.)'
                    : 'Display interval per photo (3–12 sec)'}
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2.5 min-w-[210px]">
                <input
                  type="range"
                  min={3}
                  max={12}
                  step={1}
                  value={slideIntervalSec}
                  onChange={(e) => setSlideIntervalSec(Number(e.target.value))}
                  aria-label={
                    lang === 'bg' ? 'Интервал в секунди' : 'Slide interval in seconds'
                  }
                  className="w-36 sm:w-44 accent-[#B47B44] cursor-pointer"
                />
                <span className="min-w-[66px] rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-center font-mono-tabular text-xs font-bold text-zinc-900">
                  {slideIntervalSec} {lang === 'bg' ? 'сек.' : 'sec'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                {[3, 5, 7, 10, 12].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setSlideIntervalSec(sec)}
                    className={`rounded-md px-2 py-1 font-mono-tabular text-[11px] font-semibold transition-colors ${
                      slideIntervalSec === sec
                        ? 'bg-[#18181B] text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {sec}{lang === 'bg' ? 'с' : 's'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={savingSlideSpeed}
                onClick={handleSaveSlideSpeed}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#18181B] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#B47B44] disabled:opacity-50 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                <span>
                  {savingSlideSpeed
                    ? lang === 'bg'
                      ? 'Запис...'
                      : 'Saving...'
                    : lang === 'bg'
                      ? 'Запази скоростта'
                      : 'Save Speed'}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleAddGalleryItem}
              className="lg:col-span-5 rounded-xl border border-zinc-200 bg-white p-5 space-y-3 h-fit"
            >
              <h3 className="text-base font-semibold text-zinc-900">
                {lang === 'bg'
                  ? 'Дърпане и пускане на нови снимки'
                  : 'Drag & Drop New Gallery Photos'}
              </h3>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setGalleryDragOver(true);
                }}
                onDragLeave={() => setGalleryDragOver(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setGalleryDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    await processGalleryFiles(e.dataTransfer.files);
                  }
                }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                  galleryDragOver
                    ? 'border-[#B47B44] bg-[#B47B44]/10 scale-[1.01]'
                    : 'border-zinc-300 bg-zinc-50 hover:border-[#B47B44]'
                }`}
              >
                <Upload className="h-6 w-6 text-[#B47B44] mb-1.5" />
                <span className="text-xs font-semibold text-zinc-800">
                  {galleryUploading
                    ? lang === 'bg'
                      ? 'Обработване и качване...'
                      : 'Uploading...'
                    : lang === 'bg'
                      ? 'Плъзнете и пуснете снимки тук (или кликнете за избор)'
                      : 'Drag & drop photos here (or click to browse)'}
                </span>
                <span className="mt-1 text-[11px] text-zinc-500">
                  {lang === 'bg'
                    ? 'Поддържа и многократно пускане (няколко снимки наведнъж в избрания раздел)'
                    : 'Supports dropping single or multiple files at once'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadGalleryFile}
                  className="hidden"
                />
              </label>
              {galForm.imageUrl && (
                <div className="relative">
                  <img
                    src={galForm.imageUrl}
                    alt="Preview"
                    className="h-36 w-full rounded-lg object-cover border border-zinc-200"
                  />
                  <button
                    type="button"
                    onClick={() => setGalForm((prev) => ({ ...prev, imageUrl: '' }))}
                    className="absolute top-2 right-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <label className="block text-[11px] font-medium text-zinc-600">
                {lang === 'bg' ? 'Раздел в галерията' : 'Gallery Section'}
                <select
                  value={galForm.category}
                  onChange={(e) =>
                    setGalForm({ ...galForm, category: e.target.value as FurnitureCategory })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-900"
                >
                  <option value="kitchen">Кухни</option>
                  <option value="wardrobe">Гардероби</option>
                  <option value="dresser">Скринове</option>
                  <option value="living">Хол и ТВ</option>
                  <option value="hallway">Антре</option>
                  <option value="office">Офис</option>
                </select>
              </label>
              <input
                type="text"
                required
                placeholder="Заглавие (БГ)"
                value={galForm.titleBg}
                onChange={(e) => setGalForm({ ...galForm, titleBg: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                placeholder="Title (EN)"
                value={galForm.titleEn}
                onChange={(e) => setGalForm({ ...galForm, titleEn: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Размери (240×220 см)"
                  value={galForm.dimensionsLabel}
                  onChange={(e) => setGalForm({ ...galForm, dimensionsLabel: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  placeholder="Материали (Egger + Blum)"
                  value={galForm.materialsLabel}
                  onChange={(e) => setGalForm({ ...galForm, materialsLabel: e.target.value })}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={!galForm.imageUrl || galleryUploading}
                className="w-full rounded-lg bg-[#18181B] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#B47B44] disabled:opacity-40"
              >
                {lang === 'bg' ? 'Публикувай снимката в раздела' : 'Publish Photo to Section'}
              </button>
            </form>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 h-fit">
              {orderedGallery
                .filter(
                  (item) =>
                    gallerySectionFilter === 'all' || item.category === gallerySectionFilter,
                )
                .map((item) => {
                  const globalIndex = orderedGallery.findIndex((g) => g.id === item.id);
                  const isEditing = editingGalleryId === item.id && editGalleryDraft;
                  const isDropping = cardDragOverId === item.id;
                  return (
                    <div
                      key={item.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setCardDragOverId(item.id);
                      }}
                      onDragLeave={() => setCardDragOverId(null)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setCardDragOverId(null);
                        const f = e.dataTransfer.files?.[0];
                        if (f) {
                          await handleReplaceCardPhoto(item.id, f);
                        }
                      }}
                      className={`rounded-xl border bg-white overflow-hidden transition-all ${
                        isDropping
                          ? 'border-2 border-[#B47B44] ring-2 ring-[#B47B44]/30 scale-[1.01]'
                          : 'border-zinc-200'
                      }`}
                    >
                      <div className="relative group">
                        <img
                          src={resolveGalleryImageUrl(
                            isEditing ? editGalleryDraft.imageUrl : item.imageUrl,
                          )}
                          alt={item.titleBg}
                          className="h-44 w-full object-cover"
                        />
                        <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/75 px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-[#E5C17B] shadow">
                          № {globalIndex + 1}
                        </div>
                        <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-end justify-start p-2">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity rounded bg-black/75 px-2 py-1 text-[10px] font-medium text-white">
                            {lang === 'bg'
                              ? 'Пуснете нова снимка тук за смяна'
                              : 'Drop new photo here to replace'}
                          </span>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="p-3 space-y-2 bg-zinc-50">
                          <select
                            value={editGalleryDraft.category}
                            onChange={(e) =>
                              setEditGalleryDraft({
                                ...editGalleryDraft,
                                category: e.target.value as FurnitureCategory,
                              })
                            }
                            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="kitchen">Кухни</option>
                            <option value="wardrobe">Гардероби</option>
                            <option value="dresser">Скринове</option>
                            <option value="living">Хол и ТВ</option>
                            <option value="hallway">Антре</option>
                            <option value="office">Офис</option>
                          </select>
                          <input
                            type="text"
                            value={editGalleryDraft.titleBg}
                            onChange={(e) =>
                              setEditGalleryDraft({
                                ...editGalleryDraft,
                                titleBg: e.target.value,
                              })
                            }
                            placeholder="Заглавие (БГ)"
                            className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              value={editGalleryDraft.dimensionsLabel}
                              onChange={(e) =>
                                setEditGalleryDraft({
                                  ...editGalleryDraft,
                                  dimensionsLabel: e.target.value,
                                })
                              }
                              placeholder="Размери"
                              className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                            />
                            <input
                              type="text"
                              value={editGalleryDraft.materialsLabel}
                              onChange={(e) =>
                                setEditGalleryDraft({
                                  ...editGalleryDraft,
                                  materialsLabel: e.target.value,
                                })
                              }
                              placeholder="Материали"
                              className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <label className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 cursor-pointer hover:border-[#B47B44]">
                              <ImagePlus className="h-3.5 w-3.5 text-[#B47B44]" />
                              <span>{lang === 'bg' ? 'Нова снимка' : 'Swap Photo'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    const dataUrl = await compressImageFileToDataUrl(f, 960);
                                    setEditGalleryDraft({
                                      ...editGalleryDraft,
                                      imageUrl: dataUrl,
                                    });
                                  }
                                }}
                              />
                            </label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveGalleryEdit(item.id)}
                                className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
                              >
                                <Check className="h-3 w-3" />
                                <span>{lang === 'bg' ? 'Запази' : 'Save'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGalleryId(null);
                                  setEditGalleryDraft(null);
                                }}
                                className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:text-zinc-900"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] text-[#B47B44] font-semibold uppercase">
                                {item.category}
                              </div>
                              <div className="text-sm font-semibold text-zinc-900 truncate">
                                {item.titleBg}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {item.dimensionsLabel} · {item.materialsLabel}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <label
                                title={lang === 'bg' ? 'Смени снимка' : 'Replace photo'}
                                className="cursor-pointer rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-[#B47B44]"
                              >
                                <ImagePlus className="h-4 w-4" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const f = e.target.files?.[0];
                                    if (f) await handleReplaceCardPhoto(item.id, f);
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                title={lang === 'bg' ? 'Редактирай' : 'Edit'}
                                onClick={() => {
                                  setEditingGalleryId(item.id);
                                  setEditGalleryDraft({
                                    titleBg: item.titleBg,
                                    titleEn: item.titleEn,
                                    category: item.category,
                                    dimensionsLabel: item.dimensionsLabel,
                                    materialsLabel: item.materialsLabel,
                                    imageUrl: item.imageUrl,
                                  });
                                }}
                                className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {/* Slideshow Order Controls & Delete Action */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] font-medium text-zinc-500">
                                {lang === 'bg' ? 'Ред №' : 'Pos #'}
                              </span>
                              <input
                                type="number"
                                min={1}
                                max={orderedGallery.length}
                                value={orderInputs[item.id] ?? String(globalIndex + 1)}
                                onChange={(e) =>
                                  setOrderInputs((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveNumberedOrder();
                                  }
                                }}
                                aria-label={lang === 'bg' ? 'Пореден номер' : 'Order number'}
                                className="w-12 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-1 text-center font-mono-tabular text-xs font-semibold text-zinc-900 focus:border-[#B47B44] focus:bg-white focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={gallerySavingOrder || globalIndex <= 0}
                                onClick={() => handleMoveGalleryItem(item.id, -1)}
                                title={lang === 'bg' ? 'Премести нагоре' : 'Move up'}
                                className="rounded border border-zinc-200 bg-zinc-50 p-1 text-zinc-700 hover:border-[#B47B44] hover:text-[#B47B44] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={
                                  gallerySavingOrder || globalIndex >= orderedGallery.length - 1
                                }
                                onClick={() => handleMoveGalleryItem(item.id, 1)}
                                title={lang === 'bg' ? 'Премести надолу' : 'Move down'}
                                className="rounded border border-zinc-200 bg-zinc-50 p-1 text-zinc-700 hover:border-[#B47B44] hover:text-[#B47B44] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteGalleryItem(item.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-600 hover:text-white transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>{lang === 'bg' ? 'Изтрий' : 'Delete'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Company Logo, Name, Phone, Email & About Us */}
      {tab === 'company' && (
        <form
          onSubmit={handleSaveCompanyProfile}
          className="max-w-3xl rounded-xl border border-zinc-200 bg-white p-6 space-y-4"
        >
          <h3 className="text-lg font-semibold text-zinc-900">
            {lang === 'bg' ? 'Лого, Контакти и „За нас“ на началната страница' : 'Logo, Contacts & About Us'}
          </h3>

          <div className="flex flex-wrap items-center gap-4">
            {companyForm.logoUrl ? (
              <img
                src={companyForm.logoUrl}
                alt="Logo"
                className="h-16 w-auto max-w-[180px] object-contain rounded border border-zinc-200 p-1 bg-zinc-50"
              />
            ) : (
              <div className="h-16 w-32 rounded border border-dashed border-zinc-300 flex items-center justify-center text-xs text-zinc-400">
                Без лого
              </div>
            )}
            <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-800 cursor-pointer hover:border-[#B47B44]">
              <Upload className="h-4 w-4 text-[#B47B44]" />
              <span>{lang === 'bg' ? 'Качи вашето готово лого' : 'Upload Company Logo'}</span>
              <input type="file" accept="image/*" onChange={handleUploadLogoFile} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="text-zinc-500">Име на фирмата (БГ)</span>
              <input
                type="text"
                value={companyForm.companyNameBg}
                onChange={(e) => setCompanyForm({ ...companyForm, companyNameBg: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Company Name (EN)</span>
              <input
                type="text"
                value={companyForm.companyNameEn}
                onChange={(e) => setCompanyForm({ ...companyForm, companyNameEn: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Телефон</span>
              <input
                type="text"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono-tabular"
              />
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Имейл</span>
              <input
                type="email"
                value={companyForm.email}
                onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Работно време (БГ)</span>
              <input
                type="text"
                value={companyForm.workingHoursBg || ''}
                onChange={(e) => setCompanyForm({ ...companyForm, workingHoursBg: e.target.value })}
                placeholder="Пон - Пет: 09:00 - 18:00 · Съб: 10:00 - 14:00"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Working Hours (EN)</span>
              <input
                type="text"
                value={companyForm.workingHoursEn || ''}
                onChange={(e) => setCompanyForm({ ...companyForm, workingHoursEn: e.target.value })}
                placeholder="Mon - Fri: 09:00 - 18:00 · Sat: 10:00 - 14:00"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block text-xs">
            <span className="text-zinc-500">За нас — Заглавие (БГ)</span>
            <input
              type="text"
              value={companyForm.aboutTitleBg}
              onChange={(e) => setCompanyForm({ ...companyForm, aboutTitleBg: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">За нас — Текст / Кои сме ние (БГ)</span>
            <textarea
              rows={4}
              value={companyForm.aboutBodyBg}
              onChange={(e) => setCompanyForm({ ...companyForm, aboutBodyBg: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-500">About Us — Description (EN)</span>
            <textarea
              rows={3}
              value={companyForm.aboutBodyEn}
              onChange={(e) => setCompanyForm({ ...companyForm, aboutBodyEn: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-[#B47B44] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#9E6835]"
          >
            {lang === 'bg' ? 'Запази фирмения профил' : 'Save Company Profile'}
          </button>
        </form>
      )}
    </section>
  );
};
