import React, { useEffect, useMemo, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Cuboid,
  Facebook,
  Images,
  Instagram,
  LogIn,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  PlayCircle,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminStudio } from './components/AdminStudio';
import { GallerySlideshowModal } from './components/GallerySlideshowModal';
import { MyProjectsView } from './components/MyProjectsView';
import { generateProjectCode, StudioWorkspace } from './components/StudioWorkspace';
import {
  ADMIN_EMAIL,
  DEFAULT_BOARD_DECORS,
  DEFAULT_COMPLETED_TEMPLATES,
  DEFAULT_GALLERY_PROJECTS,
  DEFAULT_HARDWARE_TIERS,
  DEFAULT_PRICING_CONFIG,
  DEFAULT_SITE_SETTINGS,
  GALLERY_PRESETS,
  ROOM_MODULE_LIBRARY,
  STARTER_PRESETS,
} from './data/catalogDefaults';
import { DEFAULT_MERIT_ITEMS } from './data/meritCatalogDefaults';
import {
  DEFAULT_GALPLAS_ITEMS,
  DEFAULT_NASTEH_ITEMS,
  GALPLAS_CATEGORIES,
  NASTEH_CATEGORIES,
} from './data/partnerCatalogDefaults';
import { sanitizeClientText } from './lib/brandSanitizer';
import { createEmptyFurnitureConfig, enforceStructuralStandards } from './lib/carpentryEngine';
import { HERO_IMAGE_URL, resolveGalleryImageUrl } from './data/localImages';
import {
  auth,
  db,
  googleProvider,
  testFirestoreConnection,
} from './lib/firebase';
import { t } from './lib/i18n';
import {
  BoardDecor,
  CompletedTemplate,
  FurnitureCategory,
  FurnitureConfig,
  GalleryProject,
  HardwareTier,
  Language,
  MeritCatalogItem,
  PartnerCatalogItem,
  PartnerCategoryDef,
  PartnerSubsectionDef,
  SiteSettings,
  UserProject,
} from './types/furniture';

type ActiveSection = 'home' | 'my_projects' | 'admin';

function formatFirebaseAuthError(err: unknown) {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || 'auth/unknown')
      : 'auth/unknown';
  const rawMessage = err instanceof Error ? err.message : String(err);
  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      rawMessage,
      messageBg: `Домейнът „${host}“ не е добавен в разрешените домейни (Authorized domains) във Firebase Console → Authentication → Settings → Authorized domains.`,
      messageEn: `Domain "${host}" is not listed in Firebase Console → Authentication → Settings → Authorized domains.`,
    };
  }
  if (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment'
  ) {
    return {
      code,
      rawMessage,
      messageBg:
        'Браузърът блокира изскачащия прозорец за Google вход. Използвайте „Вход с пренасочване“ по-долу или разрешете изскачащите прозорци.',
      messageEn:
        'Your browser blocked the Google sign-in popup. Use "Sign in with Redirect" below or allow popups.',
    };
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      code,
      rawMessage,
      messageBg:
        'Прозорецът за вход с Google беше затворен преди завършване на входа. На публичен домейн това често се случва при блокирани изскачащи прозорци/бисквитки или неразрешен домейн. Опитайте „Вход с пренасочване“.',
      messageEn:
        'The Google sign-in window closed before completing authentication. Try "Sign in with Redirect" below or check Firebase Authorized domains.',
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      rawMessage,
      messageBg: 'Методът Google Sign-In не е активиран във Firebase Authentication.',
      messageEn: 'Google Sign-In provider is not enabled in Firebase Authentication.',
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      code,
      rawMessage,
      messageBg: 'Мрежова грешка при връзка с Google / Firebase Auth. Проверете интернет връзката.',
      messageEn: 'Network error while contacting Google / Firebase Auth.',
    };
  }
  return {
    code,
    rawMessage,
    messageBg: `Грешка при вход с Google (${code}). Проверете настройките на Firebase Authentication за домейн „${host}“.`,
    messageEn: `Google Sign-In failed (${code}). Check Firebase Authentication settings for "${host}".`,
  };
}

export default function App() {
  const [lang, setLang] = useState<Language>('bg');
  const [activeView, setActiveView] = useState<ActiveSection>('home');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Public Catalog State (instant defaults + live Firestore sync)
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [decors, setDecors] = useState<BoardDecor[]>(DEFAULT_BOARD_DECORS);
  const [hardwareTiers, setHardwareTiers] = useState<HardwareTier[]>(DEFAULT_HARDWARE_TIERS);
  const [meritItems, setMeritItems] = useState<MeritCatalogItem[]>(DEFAULT_MERIT_ITEMS);
  const [galplasItems, setGalplasItems] = useState<PartnerCatalogItem[]>(DEFAULT_GALPLAS_ITEMS);
  const [nastehItems, setNastehItems] = useState<PartnerCatalogItem[]>(DEFAULT_NASTEH_ITEMS);
  const [nastehCustomSubsections, setNastehCustomSubsections] = useState<PartnerSubsectionDef[]>([]);
  const [pricingVersion, setPricingVersion] = useState(0);
  const [gallery, setGallery] = useState<GalleryProject[]>(DEFAULT_GALLERY_PROJECTS);
  const [completedTemplates, setCompletedTemplates] = useState<CompletedTemplate[]>(
    DEFAULT_COMPLETED_TEMPLATES,
  );

  // Gallery filter
  const [galleryCategory, setGalleryCategory] = useState<'all' | FurnitureCategory>('all');

  // Active 3D Studio Configuration
  const [studioConfig, setStudioConfig] = useState<FurnitureConfig>(
    structuredClone(STARTER_PRESETS[0].config),
  );
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectCode, setActiveProjectCode] = useState<string>(() =>
    generateProjectCode(),
  );
  const [studioFullPage, setStudioFullPage] = useState(false);
  const [externalLoadSeq, setExternalLoadSeq] = useState(0);
  const [demoLaunchSeq, setDemoLaunchSeq] = useState(0);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [gallerySlideOpen, setGallerySlideOpen] = useState(false);
  const [gallerySlideStartIdx, setGallerySlideStartIdx] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const serverHasGalleryOverrideRef = React.useRef(false);
  const serverHasSiteSettingsOverrideRef = React.useRef(false);
  const serverHasMeritOverrideRef = React.useRef(false);
  const serverHasGalplasOverrideRef = React.useRef(false);
  const serverHasNastehOverrideRef = React.useRef(false);

  const [isAdminDoc, setIsAdminDoc] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authErrorInfo, setAuthErrorInfo] = useState<{
    code: string;
    messageBg: string;
    messageEn: string;
    rawMessage: string;
  } | null>(null);

  // Quick Contact Form State (Footer)
  const [contactName, setContactName] = useState('');
  const [contactPhoneOrEmail, setContactPhoneOrEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactSentOk, setContactSentOk] = useState(false);

  const isAdmin = Boolean(
    user &&
      user.emailVerified &&
      ((user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase() || isAdminDoc),
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 4500);
  };

  const mergeSiteSettings = (incoming?: Partial<SiteSettings> | null): SiteSettings => {
    if (!incoming) return DEFAULT_SITE_SETTINGS;
    const isLegacyName =
      !incoming.companyNameBg ||
      incoming.companyNameBg.includes('Ателие Форма') ||
      incoming.companyNameBg.includes('Atelier Forma');
    const isLegacyPhone =
      !incoming.phone || incoming.phone.trim() === '+359 888 000 000';
    const isLegacyEmail =
      !incoming.email || incoming.email.trim().toLowerCase() === 'svetlozar2015@gmail.com';
    const isLegacyLogo =
      !incoming.logoUrl || incoming.logoUrl === '/assets/aistudio/image_b672d4cf.png';
    return {
      ...DEFAULT_SITE_SETTINGS,
      ...incoming,
      companyNameBg: isLegacyName ? DEFAULT_SITE_SETTINGS.companyNameBg : incoming.companyNameBg!,
      companyNameEn:
        isLegacyName || !incoming.companyNameEn
          ? DEFAULT_SITE_SETTINGS.companyNameEn
          : incoming.companyNameEn,
      logoUrl: isLegacyLogo ? DEFAULT_SITE_SETTINGS.logoUrl : incoming.logoUrl!,
      phone: isLegacyPhone ? DEFAULT_SITE_SETTINGS.phone : incoming.phone!,
      email: isLegacyEmail ? DEFAULT_SITE_SETTINGS.email : incoming.email!,
      cityBg:
        !incoming.cityBg || incoming.cityBg.includes('Производство и монтаж')
          ? DEFAULT_SITE_SETTINGS.cityBg
          : incoming.cityBg,
      cityEn:
        !incoming.cityEn || incoming.cityEn.includes('Custom MFC')
          ? DEFAULT_SITE_SETTINGS.cityEn
          : incoming.cityEn,
      aboutTitleBg:
        !incoming.aboutTitleBg || incoming.aboutTitleBg.includes('Прецизна мебелна')
          ? DEFAULT_SITE_SETTINGS.aboutTitleBg
          : incoming.aboutTitleBg,
      aboutTitleEn:
        !incoming.aboutTitleEn || incoming.aboutTitleEn.includes('Precision MFC')
          ? DEFAULT_SITE_SETTINGS.aboutTitleEn
          : incoming.aboutTitleEn,
      aboutBodyBg:
        !incoming.aboutBodyBg || incoming.aboutBodyBg.includes('Работим изцяло с сертифицирани')
          ? DEFAULT_SITE_SETTINGS.aboutBodyBg
          : incoming.aboutBodyBg,
      aboutBodyEn:
        !incoming.aboutBodyEn || incoming.aboutBodyEn.includes('We craft exclusively')
          ? DEFAULT_SITE_SETTINGS.aboutBodyEn
          : incoming.aboutBodyEn,
      gallerySlideIntervalSec:
        typeof incoming.gallerySlideIntervalSec === 'number'
          ? Math.min(12, Math.max(3, Math.round(incoming.gallerySlideIntervalSec)))
          : DEFAULT_SITE_SETTINGS.gallerySlideIntervalSec,
    };
  };

  const normalizeGalleryList = (incoming: GalleryProject[]): GalleryProject[] => {
    const defaultsById = new Map(DEFAULT_GALLERY_PROJECTS.map((d) => [d.id, d]));
    return incoming
      .filter(
        (item) =>
          !(
            item.id === 'gal_6' &&
            item.imageUrl === '/src/assets/images/gallery_hallway_dresser_1794768611436.jpg'
          ),
      )
      .map((item, idx) => {
        const def = defaultsById.get(item.id);
        const mapped =
          def && item.imageUrl === def.imageUrl
            ? {
                ...item,
                titleBg: def.titleBg,
                titleEn: def.titleEn,
                category: def.category,
                dimensionsLabel: def.dimensionsLabel,
                materialsLabel: def.materialsLabel,
                presetId: def.presetId,
              }
            : item;
        return { mapped, idx };
      })
      .sort((a, b) => {
        const ao = typeof a.mapped.sortOrder === 'number' ? a.mapped.sortOrder : a.idx + 1000;
        const bo = typeof b.mapped.sortOrder === 'number' ? b.mapped.sortOrder : b.idx + 1000;
        return ao !== bo ? ao - bo : a.idx - b.idx;
      })
      .map((entry) => entry.mapped);
  };

  const loadServerCatalog = async () => {
    try {
      const resp = await fetch('/api/catalog');
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        siteSettings?: SiteSettings | null;
        decors?: BoardDecor[] | null;
        hardwareTiers?: HardwareTier[] | null;
        meritItems?: MeritCatalogItem[] | null;
        meritServerOverride?: boolean;
        galplasItems?: PartnerCatalogItem[] | null;
        galplasServerOverride?: boolean;
        nastehItems?: PartnerCatalogItem[] | null;
        nastehCustomSubsections?: PartnerSubsectionDef[] | null;
        nastehServerOverride?: boolean;
        gallery?: GalleryProject[] | null;
      };
      if (data.siteSettings) {
        serverHasSiteSettingsOverrideRef.current = true;
        setSiteSettings(mergeSiteSettings(data.siteSettings));
      }
      if (Array.isArray(data.decors) && data.decors.length > 0) {
        setDecors(data.decors);
      }
      if (Array.isArray(data.hardwareTiers) && data.hardwareTiers.length > 0) {
        setHardwareTiers(data.hardwareTiers);
      }
      if (data.meritServerOverride) {
        serverHasMeritOverrideRef.current = true;
      }
      if (Array.isArray(data.meritItems)) {
        setMeritItems(data.meritItems);
      }
      if (data.galplasServerOverride) {
        serverHasGalplasOverrideRef.current = true;
      }
      if (Array.isArray(data.galplasItems)) {
        setGalplasItems(data.galplasItems);
      }
      if (data.nastehServerOverride) {
        serverHasNastehOverrideRef.current = true;
      }
      if (Array.isArray(data.nastehItems)) {
        setNastehItems(data.nastehItems);
      }
      if (Array.isArray(data.nastehCustomSubsections)) {
        setNastehCustomSubsections(data.nastehCustomSubsections);
      }
      if (Array.isArray(data.gallery)) {
        serverHasGalleryOverrideRef.current = true;
        setGallery(normalizeGalleryList(data.gallery));
      }
      setPricingVersion((v) => v + 1);
    } catch (err) {
      console.warn('Could not load server catalog:', err);
    }
  };

  // 1. Validate Firestore connection, server catalog & Auth state
  useEffect(() => {
    testFirestoreConnection();
    loadServerCatalog();

    try {
      window.sessionStorage.removeItem('af_admin_token');
    } catch {
      // ignore storage access errors
    }

    getRedirectResult(auth)
      .then((cred) => {
        if (cred?.user) {
          setAuthModalOpen(false);
          setAuthErrorInfo(null);
          if ((cred.user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            showToast('Успешен админ вход!');
          }
        }
      })
      .catch((err) => {
        console.error('Google Redirect Sign-In error:', err);
        setAuthErrorInfo(formatFirebaseAuthError(err));
        setAuthModalOpen(true);
      });

    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (currentUser) {
        setAuthModalOpen(false);
        setAuthErrorInfo(null);
      }
    });
    return () => unsub();
  }, []);

  // 1b. Check Firestore admins/{uid} collection for secondary verified administrators
  useEffect(() => {
    let cancelled = false;
    if (!authReady || !user || !user.emailVerified) {
      setIsAdminDoc(false);
      return;
    }
    if ((user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      setIsAdminDoc(true);
      return;
    }
    getDoc(doc(db, 'admins', user.uid))
      .then((snap) => {
        if (!cancelled) {
          setIsAdminDoc(snap.exists());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdminDoc(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  // 2. Seed initial Firestore catalogs once when Firebase Admin logs in for the first time
  useEffect(() => {
    if (!authReady || !isAdmin) return;
    (async () => {
      try {
        const decorsSnap = await getDocs(collection(db, 'board_decors'));
        if (decorsSnap.empty) {
          await Promise.all([
            ...DEFAULT_BOARD_DECORS.map((d) =>
              setDoc(doc(db, 'board_decors', d.id), {
                manufacturer: d.manufacturer,
                code: d.code,
                nameBg: d.nameBg,
                nameEn: d.nameEn,
                category: d.category,
                materialType: d.materialType,
                priceGroup: d.priceGroup ?? 1,
                colorHex: d.colorHex,
                grainHex: d.grainHex || d.colorHex,
                roughness: d.roughness,
                thicknessMm: d.thicknessMm,
                isBaseDefault: Boolean(d.isBaseDefault),
                active: d.active,
              }),
            ),
            ...DEFAULT_HARDWARE_TIERS.map((h) =>
              setDoc(doc(db, 'hardware_tiers', h.id), {
                brand: h.brand,
                tier: h.tier,
                nameBg: h.nameBg,
                nameEn: h.nameEn,
                descriptionBg: h.descriptionBg,
                descriptionEn: h.descriptionEn,
                warrantyYears: h.warrantyYears,
                loadCapacityKg: h.loadCapacityKg,
                softClose: h.softClose,
                isBaseDefault: Boolean(h.isBaseDefault),
                active: h.active,
              }),
            ),
            ...DEFAULT_GALLERY_PROJECTS.map((g, idx) =>
              setDoc(doc(db, 'gallery_projects', g.id), {
                titleBg: g.titleBg,
                titleEn: g.titleEn,
                category: g.category,
                dimensionsLabel: g.dimensionsLabel,
                materialsLabel: g.materialsLabel,
                imageUrl: g.imageUrl,
                presetId: g.presetId,
                sortOrder: idx + 1,
                createdAt: serverTimestamp(),
              }),
            ),
            ...DEFAULT_COMPLETED_TEMPLATES.map((tpl) =>
              setDoc(doc(db, 'completed_templates', tpl.id), {
                titleBg: tpl.titleBg,
                titleEn: tpl.titleEn,
                category: tpl.category,
                dimensionsLabel: tpl.dimensionsLabel,
                summaryBg: tpl.summaryBg,
                summaryEn: tpl.summaryEn,
                config: tpl.config,
                sourceProjectCode: tpl.sourceProjectCode || '',
                createdAt: serverTimestamp(),
              }),
            ),
            setDoc(doc(db, 'site_settings', 'company_profile'), {
              ...DEFAULT_SITE_SETTINGS,
              updatedAt: serverTimestamp(),
            }),
            setDoc(doc(db, 'pricing_config', 'main'), {
              ...DEFAULT_PRICING_CONFIG,
              updatedAt: serverTimestamp(),
            }),
          ]);
        }
        const meritSnap = await getDocs(collection(db, 'merit_items'));
        if (meritSnap.empty) {
          await Promise.all(
            DEFAULT_MERIT_ITEMS.map((m) => {
              const { id: _id, ...payload } = m;
              return setDoc(doc(db, 'merit_items', m.id), payload);
            }),
          );
        }
        const galplasSnap = await getDocs(collection(db, 'galplas_items'));
        if (galplasSnap.empty) {
          await Promise.all(
            DEFAULT_GALPLAS_ITEMS.map((g) => {
              const { id: _id, ...payload } = g;
              return setDoc(doc(db, 'galplas_items', g.id), payload);
            }),
          );
        }
        const nastehSnap = await getDocs(collection(db, 'nasteh_items'));
        if (nastehSnap.empty) {
          await Promise.all(
            DEFAULT_NASTEH_ITEMS.map((n) => {
              const { id: _id, ...payload } = n;
              return setDoc(doc(db, 'nasteh_items', n.id), payload);
            }),
          );
        }
      } catch (err) {
        console.warn('Initial Firestore seed check:', err);
      }
    })();
  }, [authReady, isAdmin]);

  // 3. Live subscribe to public Firestore catalogs
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'site_settings', 'company_profile'),
        (snap) => {
          if (serverHasSiteSettingsOverrideRef.current) return;
          if (snap.exists()) {
            setSiteSettings(mergeSiteSettings(snap.data() as SiteSettings));
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'board_decors'),
        (snap) => {
          if (!snap.empty) {
            setDecors(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BoardDecor, 'id'>) })),
            );
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'hardware_tiers'),
        (snap) => {
          if (!snap.empty) {
            setHardwareTiers(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HardwareTier, 'id'>) })),
            );
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'gallery_projects'),
        (snap) => {
          if (serverHasGalleryOverrideRef.current) return;
          if (!snap.empty) {
            setGallery(
              normalizeGalleryList(
                snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GalleryProject, 'id'>) })),
              ),
            );
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'completed_templates'),
        (snap) => {
          if (!snap.empty) {
            setCompletedTemplates(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<CompletedTemplate, 'id'>),
              })),
            );
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'merit_items'),
        (snap) => {
          if (serverHasMeritOverrideRef.current) return;
          if (!snap.empty) {
            setMeritItems(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<MeritCatalogItem, 'id'>),
              })),
            );
            setPricingVersion((v) => v + 1);
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'galplas_items'),
        (snap) => {
          if (serverHasGalplasOverrideRef.current) return;
          if (!snap.empty) {
            setGalplasItems(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<PartnerCatalogItem, 'id'>),
              })),
            );
            setPricingVersion((v) => v + 1);
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'nasteh_items'),
        (snap) => {
          if (serverHasNastehOverrideRef.current) return;
          if (!snap.empty) {
            setNastehItems(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<PartnerCatalogItem, 'id'>),
              })),
            );
            setPricingVersion((v) => v + 1);
          }
        },
        () => {},
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'nasteh_subsections'),
        (snap) => {
          if (serverHasNastehOverrideRef.current) return;
          if (!snap.empty) {
            setNastehCustomSubsections(
              snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<PartnerSubsectionDef, 'id'>),
                isCustom: true,
              })),
            );
          }
        },
        () => {},
      ),
    );

    return () => unsubs.forEach((u) => u());
  }, []);

  const handleSignInGoogle = async () => {
    setAuthBusy(true);
    setAuthErrorInfo(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setAuthModalOpen(false);
      setAuthErrorInfo(null);
      if ((cred.user?.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        showToast(
          lang === 'bg'
            ? 'Успешен админ вход! Отваряне на Администраторското студио...'
            : 'Admin signed in! Opening Admin Studio...',
        );
      }
    } catch (err) {
      console.error('Google Sign-In error:', err);
      setAuthErrorInfo(formatFirebaseAuthError(err));
      setAuthModalOpen(true);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignInGoogleRedirect = async () => {
    setAuthBusy(true);
    setAuthErrorInfo(null);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error('Google Redirect Sign-In start error:', err);
      setAuthErrorInfo(formatFirebaseAuthError(err));
      setAuthModalOpen(true);
      setAuthBusy(false);
    }
  };

  const handleOpenAdminDirect = () => {
    setMobileMenuOpen(false);
    if (!isAdmin) {
      showToast(
        lang === 'bg'
          ? 'Достъпът до админ панела е разрешен само за администратор.'
          : 'Admin panel access is restricted to administrators.',
      );
      if (!user) {
        void handleSignInGoogle();
      }
      return;
    }
    setActiveView('admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSignOut = async () => {
    try {
      window.sessionStorage.removeItem('af_admin_token');
    } catch {
      // ignore storage access errors
    }
    setIsAdminDoc(false);
    if (user) {
      await signOut(auth);
    }
    if (activeView === 'admin') setActiveView('home');
  };

  const handleResetNewProject = () => {
    setStudioConfig(createEmptyFurnitureConfig());
    setActiveProjectId(null);
    setActiveProjectCode(generateProjectCode());
  };

  const scrollToSection = (id: string) => {
    setActiveView('home');
    setMobileMenuOpen(false);
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
  };

  const handleSubmitQuickContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactPhoneOrEmail.trim() || !contactMessage.trim()) return;
    setContactSending(true);
    try {
      const resp = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName.trim(),
          contact: contactPhoneOrEmail.trim(),
          message: contactMessage.trim(),
        }),
      });
      if (resp.ok) {
        setContactName('');
        setContactPhoneOrEmail('');
        setContactMessage('');
        setContactSentOk(true);
        showToast(
          lang === 'bg'
            ? 'Съобщението е изпратено успешно! Ще се свържем с вас скоро.'
            : 'Message sent! We will contact you shortly.',
        );
        window.setTimeout(() => setContactSentOk(false), 6000);
      } else {
        showToast(lang === 'bg' ? 'Моля попълнете всички полета.' : 'Please fill all fields.');
      }
    } catch {
      showToast(lang === 'bg' ? 'Грешка при изпращане. Опитайте по телефона.' : 'Failed to send.');
    } finally {
      setContactSending(false);
    }
  };

  const handleLaunchLiveDemoFromSite = () => {
    setMobileMenuOpen(false);
    setAboutModalOpen(false);
    setActiveView('home');
    setStudioFullPage(true);
    setDemoLaunchSeq((s) => s + 1);
  };

  const handleOpenStudioFromSite = () => {
    setMobileMenuOpen(false);
    setAboutModalOpen(false);
    setActiveView('home');
    setStudioFullPage(true);
  };

  const openSlideshowGallery = (startIndex = 0) => {
    setMobileMenuOpen(false);
    setAboutModalOpen(false);
    setActiveView('home');
    setGallerySlideStartIdx(startIndex);
    setGallerySlideOpen(true);
  };

  const loadPresetIntoStudio = (presetId: string, categoryHint?: FurnitureCategory) => {
    const aliasMap: Record<string, string> = {
      preset_l_kitchen: 'gal_kitchen_lshape_oak_graphite',
      preset_tv_unit: 'gal_living_tv_walnut',
      preset_hallway: 'gal_hallway_hickory_white',
    };
    const resolvedId = aliasMap[presetId] || presetId;

    let rawConfig: FurnitureConfig | undefined =
      GALLERY_PRESETS.find((p) => p.id === resolvedId)?.config ||
      STARTER_PRESETS.find((p) => p.id === resolvedId)?.config ||
      ROOM_MODULE_LIBRARY.find((m) => m.id === resolvedId)?.config;

    if (!rawConfig && categoryHint) {
      const byCategoryMap: Record<FurnitureCategory, string> = {
        kitchen: 'preset_kitchen_straight',
        wardrobe: 'preset_wardrobe',
        dresser: 'preset_dresser',
        living: 'preset_tv_console',
        hallway: 'gal_hallway_hickory_white',
        office: 'preset_dresser',
      };
      const fallbackId = byCategoryMap[categoryHint];
      rawConfig =
        GALLERY_PRESETS.find((p) => p.id === fallbackId)?.config ||
        STARTER_PRESETS.find((p) => p.id === fallbackId)?.config ||
        ROOM_MODULE_LIBRARY.find((m) => m.id === fallbackId)?.config;
    }

    const baseConfig = structuredClone(rawConfig || STARTER_PRESETS[0].config);
    const tierLevel =
      hardwareTiers.find((h) => h.id === baseConfig.hardwareTierId)?.tier || 'economy';
    const { config: normalized } = enforceStructuralStandards(baseConfig, tierLevel);

    setStudioConfig(normalized);
    setActiveProjectId(null);
    setActiveProjectCode(generateProjectCode());
    setActiveView('home');
    setStudioFullPage(true);
    setExternalLoadSeq((s) => s + 1);
  };

  const loadCompletedTemplateIntoStudio = (tpl: CompletedTemplate) => {
    const baseConfig = structuredClone(tpl.config);
    const tierLevel =
      hardwareTiers.find((h) => h.id === baseConfig.hardwareTierId)?.tier || 'economy';
    const { config: normalized } = enforceStructuralStandards(baseConfig, tierLevel);
    setStudioConfig(normalized);
    setActiveProjectId(null);
    setActiveProjectCode(generateProjectCode());
    setActiveView('home');
    setStudioFullPage(true);
    setExternalLoadSeq((s) => s + 1);
  };

  const loadUserProjectIntoStudio = (proj: UserProject) => {
    const baseConfig = structuredClone(proj.config);
    const tierLevel =
      hardwareTiers.find((h) => h.id === baseConfig.hardwareTierId)?.tier || 'economy';
    const { config: normalized } = enforceStructuralStandards(baseConfig, tierLevel);
    setStudioConfig(normalized);
    setActiveProjectId(proj.id);
    setActiveProjectCode(proj.projectCode);
    setActiveView('home');
    setStudioFullPage(true);
    setExternalLoadSeq((s) => s + 1);
  };

  const filteredGallery = useMemo(() => {
    if (galleryCategory === 'all') return gallery;
    return gallery.filter((g) => g.category === galleryCategory);
  }, [gallery, galleryCategory]);

  const companyName = lang === 'bg' ? siteSettings.companyNameBg : siteSettings.companyNameEn;

  const visibleDecors = useMemo(
    () => (isAdmin ? decors : decors.filter((d) => d.active !== false)),
    [decors, isAdmin],
  );

  const allPartnerItems = useMemo<PartnerCatalogItem[]>(
    () => [...galplasItems, ...nastehItems],
    [galplasItems, nastehItems],
  );

  const allPartnerCategories = useMemo<PartnerCategoryDef[]>(() => {
    const mergedNasteh = NASTEH_CATEGORIES.map((cat) => {
      const extras = nastehCustomSubsections.filter((s) => s.categoryId === cat.id);
      if (extras.length === 0) return cat;
      const seen = new Set(cat.subsections.map((s) => s.id));
      return {
        ...cat,
        subsections: [...cat.subsections, ...extras.filter((e) => !seen.has(e.id))],
      };
    });
    return [...GALPLAS_CATEGORIES, ...mergedNasteh];
  }, [nastehCustomSubsections]);

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#F6F5F2] text-[#18181B]">
      {/* Sticky Dark & Gold Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-[#C59B57]/25 bg-[#0B0C10]/96 backdrop-blur-md shadow-lg px-4 sm:px-6 py-2.5 text-zinc-100">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 sm:gap-6">
          {/* Zone 1: Clean Uncropped SK Emblem + СК МЕБЕЛИ + Светлозар Колев */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveView('home');
              setAboutModalOpen(false);
              setMobileMenuOpen(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-white/5 transition-colors shrink-0"
          >
            <div className="h-10 w-14 sm:h-11 sm:w-16 rounded-lg overflow-hidden bg-[#141518] border border-[#C59B57]/50 p-1 flex items-center justify-center shrink-0 shadow-sm">
              <img
                src={siteSettings.logoUrl || '/assets/sk-emblem.png'}
                alt={companyName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="leading-tight">
              <div className="font-display text-sm sm:text-base font-bold tracking-wide text-[#E5C17B] whitespace-nowrap">
                {companyName}
              </div>
              <div className="text-[10px] font-medium tracking-[0.12em] uppercase text-zinc-400 whitespace-nowrap">
                {lang === 'bg' ? 'Светлозар Колев' : 'Svetlozar Kolev'}
              </div>
            </div>
          </a>

          {/* Zone 2: Clean Single-Line Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-2.5 text-xs xl:text-sm font-medium text-zinc-300">
            <button
              type="button"
              onClick={handleOpenStudioFromSite}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C59B57] px-3.5 py-2 text-xs font-bold text-[#0B0C10] hover:bg-[#D8B06E] transition-colors whitespace-nowrap shrink-0 shadow-sm"
            >
              <Cuboid className="h-3.5 w-3.5 shrink-0" />
              <span>{lang === 'bg' ? '3D Конфигуратор' : '3D Configurator'}</span>
            </button>

            <button
              type="button"
              onClick={handleLaunchLiveDemoFromSite}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#C59B57]/60 bg-[#151821] px-3 py-2 text-xs font-semibold text-[#E5C17B] hover:border-[#E5C17B] hover:bg-[#1E222E] transition-colors whitespace-nowrap shrink-0"
            >
              <PlayCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{lang === 'bg' ? 'Демо видео' : 'Demo Video'}</span>
            </button>

            <button
              type="button"
              onClick={() => openSlideshowGallery(0)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:text-[#E5C17B] transition-colors whitespace-nowrap shrink-0"
            >
              <Images className="h-3.5 w-3.5 text-[#C59B57]" />
              <span>{t(lang, 'navGallery')}</span>
            </button>

            <button
              type="button"
              onClick={() => setAboutModalOpen(true)}
              className="rounded-lg px-2.5 py-1.5 hover:text-[#E5C17B] transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'bg' ? 'За нас' : 'About Us'}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('my_projects')}
              className={`rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeView === 'my_projects'
                  ? 'text-[#E5C17B] font-semibold'
                  : 'hover:text-[#E5C17B]'
              }`}
            >
              {t(lang, 'navMyProjects')}
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenAdminDirect}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'admin'
                    ? 'text-[#E5C17B] font-semibold'
                    : 'text-zinc-400 hover:text-[#E5C17B]'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Админ' : 'Admin'}</span>
              </button>
            )}
          </nav>

          {/* Zone 3: Language Switch, Auth & Mobile Hamburger Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLang((l) => (l === 'bg' ? 'en' : 'bg'))}
              className="text-xs font-mono-tabular font-semibold text-zinc-400 hover:text-[#E5C17B] px-2 py-1.5 whitespace-nowrap shrink-0"
            >
              {lang === 'bg' ? 'BG / EN' : 'EN / BG'}
            </button>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="hidden sm:inline-flex rounded-lg border border-zinc-700 bg-[#151821] px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-[#C59B57] hover:text-[#E5C17B] transition-colors whitespace-nowrap shrink-0"
              >
                {t(lang, 'signOut')}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignInGoogle}
                className="hidden sm:inline-flex rounded-lg border border-[#C59B57]/50 bg-[#151821] px-3.5 py-2 text-xs font-semibold text-[#E5C17B] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-colors whitespace-nowrap shrink-0"
              >
                {t(lang, 'signInGoogle')}
              </button>
            )}

            {/* Mobile Hamburger Menu Button */}
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="inline-flex lg:hidden items-center justify-center rounded-lg border border-zinc-700 bg-[#151821] p-2 text-zinc-200 hover:border-[#C59B57] hover:text-[#E5C17B] transition-colors"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 border-t border-zinc-800 pt-3 pb-2 space-y-1.5">
            <div className="grid grid-cols-2 gap-2 pb-1">
              <button
                type="button"
                onClick={handleOpenStudioFromSite}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-[#C59B57] px-3 py-2.5 text-xs font-bold text-[#0B0C10]"
              >
                <Cuboid className="h-4 w-4 shrink-0" />
                <span>{lang === 'bg' ? '3D Конфигуратор' : '3D Configurator'}</span>
              </button>
              <button
                type="button"
                onClick={handleLaunchLiveDemoFromSite}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[#C59B57]/60 bg-[#151821] px-3 py-2.5 text-xs font-semibold text-[#E5C17B]"
              >
                <PlayCircle className="h-4 w-4 shrink-0" />
                <span>{lang === 'bg' ? 'Демо видео' : 'Demo Video'}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => openSlideshowGallery(0)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-[#E5C17B]"
            >
              <Images className="h-4 w-4 text-[#C59B57]" />
              <span>{t(lang, 'navGallery')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setAboutModalOpen(true);
              }}
              className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-[#E5C17B]"
            >
              {lang === 'bg' ? 'За нас' : 'About Us'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('my_projects');
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-[#E5C17B]"
            >
              {t(lang, 'navMyProjects')}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('contact-footer')}
              className="block w-full text-left rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-[#E5C17B]"
            >
              {lang === 'bg' ? 'Контакти' : 'Contacts'}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenAdminDirect}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-white/5 hover:text-[#E5C17B]"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>{t(lang, 'navAdmin')}</span>
              </button>
            )}
            <div className="pt-2 border-t border-zinc-800 sm:hidden">
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-[#151821] px-4 py-2.5 text-xs font-semibold text-zinc-200"
                >
                  {t(lang, 'signOut')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignInGoogle();
                  }}
                  className="w-full rounded-lg bg-[#C59B57] px-4 py-2.5 text-xs font-bold text-[#0B0C10]"
                >
                  {t(lang, 'signInGoogle')}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Clean „За нас“ Modal Window */}
      {aboutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={() => setAboutModalOpen(false)}
        >
          <div
            className="relative w-full max-w-xl rounded-2xl border border-[#C59B57]/40 bg-[#111318] p-6 sm:p-8 text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setAboutModalOpen(false)}
              aria-label={lang === 'bg' ? 'Затвори' : 'Close'}
              className="absolute right-4 top-4 rounded-lg border border-zinc-700 bg-[#181B22] p-1.5 text-zinc-300 hover:border-[#C59B57] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3.5 border-b border-zinc-800 pb-5">
              <div className="h-12 w-[68px] sm:h-14 sm:w-20 rounded-lg overflow-hidden bg-[#141518] border border-[#C59B57]/50 p-1.5 flex items-center justify-center shrink-0">
                <img
                  src={siteSettings.logoUrl || '/assets/sk-emblem.png'}
                  alt={companyName}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#E5C17B]">
                  {companyName}
                </h2>
                <p className="text-xs sm:text-sm text-zinc-300">
                  {lang === 'bg'
                    ? 'Светлозар Колев · гр. Пловдив'
                    : 'Svetlozar Kolev · Plovdiv, Bulgaria'}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#C59B57] mb-2.5">
                  {lang === 'bg' ? 'Нашите услуги' : 'Our Services'}
                </h3>
                <ul className="space-y-2 text-sm text-zinc-200">
                  {(lang === 'bg'
                    ? [
                        'Кухни по индивидуален проект',
                        'Дневни, спални и детски стаи',
                        'Ергономично офис обзавеждане',
                        'Цялостно интериорно изпълнение',
                      ]
                    : [
                        'Custom kitchens built to order',
                        'Living rooms, bedrooms & kids’ rooms',
                        'Ergonomic office furniture',
                        'Complete interior execution',
                      ]
                  ).map((srvItem) => (
                    <li key={srvItem} className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 text-[#C59B57] shrink-0" />
                      <span>{srvItem}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-[#0B0C10] p-4 space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 text-zinc-300">
                    <Phone className="h-4 w-4 text-[#C59B57] shrink-0" />
                    <span>{lang === 'bg' ? 'Телефон:' : 'Phone:'}</span>
                  </div>
                  <a
                    href={`tel:${siteSettings.phone.replace(/\s+/g, '')}`}
                    className="font-mono-tabular text-base font-bold text-[#E5C17B] hover:text-white whitespace-nowrap"
                  >
                    {siteSettings.phone}
                  </a>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 text-zinc-300">
                    <MapPin className="h-4 w-4 text-[#C59B57] shrink-0" />
                    <span>{lang === 'bg' ? 'Град:' : 'City:'}</span>
                  </div>
                  <span className="text-zinc-200">
                    {lang === 'bg' ? 'гр. Пловдив' : 'Plovdiv, Bulgaria'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 text-zinc-300">
                    <Mail className="h-4 w-4 text-[#C59B57] shrink-0" />
                    <span>{lang === 'bg' ? 'Имейл:' : 'Email:'}</span>
                  </div>
                  <a
                    href={`mailto:${siteSettings.email}`}
                    className="text-zinc-200 hover:text-[#E5C17B]"
                  >
                    {siteSettings.email}
                  </a>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleOpenStudioFromSite}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C59B57] px-4 py-2.5 text-xs font-bold text-[#0B0C10] hover:bg-[#D8B06E] transition-colors"
                >
                  <Cuboid className="h-4 w-4" />
                  <span>{lang === 'bg' ? 'Отвори 3D Конфигуратор' : 'Open 3D Configurator'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLaunchLiveDemoFromSite}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#C59B57]/60 bg-[#181B22] px-4 py-2.5 text-xs font-semibold text-[#E5C17B] hover:bg-[#222631] transition-colors"
                >
                  <PlayCircle className="h-4 w-4" />
                  <span>{lang === 'bg' ? 'Демо видео' : 'Demo Video'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <GallerySlideshowModal
        open={gallerySlideOpen}
        lang={lang}
        items={gallery}
        initialIndex={gallerySlideStartIdx}
        slideIntervalSec={siteSettings.gallerySlideIntervalSec ?? 5}
        companyName={companyName}
        onClose={() => setGallerySlideOpen(false)}
        onLoadIn3D={(presetId, category) => loadPresetIntoStudio(presetId, category)}
      />

      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={() => {
            if (!authBusy) setAuthModalOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-[#C59B57]/45 bg-[#111318] p-6 text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={authBusy}
              onClick={() => setAuthModalOpen(false)}
              aria-label={lang === 'bg' ? 'Затвори' : 'Close'}
              className="absolute right-4 top-4 rounded-lg border border-zinc-700 bg-[#181B22] p-1.5 text-zinc-300 hover:border-[#C59B57] hover:text-white transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 pr-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-[#E5C17B]">
                  {lang === 'bg' ? 'Вход с Google' : 'Google Sign-In'}
                </h2>
                <p className="text-xs text-zinc-400">
                  {typeof window !== 'undefined' ? window.location.hostname : ''}
                </p>
              </div>
            </div>

            {authErrorInfo && (
              <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 p-3.5 text-left space-y-1.5">
                <p className="text-xs font-semibold text-red-200 leading-relaxed">
                  {lang === 'bg' ? authErrorInfo.messageBg : authErrorInfo.messageEn}
                </p>
                <p className="text-[11px] font-mono text-red-300/90 break-all">
                  {authErrorInfo.code}
                  {authErrorInfo.rawMessage ? ` · ${authErrorInfo.rawMessage}` : ''}
                </p>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignInGoogle}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C59B57] px-4 py-2.5 text-xs font-bold text-[#0B0C10] hover:bg-[#D8B06E] transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${authBusy ? 'animate-spin' : ''}`} />
                <span>
                  {authBusy
                    ? lang === 'bg'
                      ? 'Свързване с Google...'
                      : 'Connecting to Google...'
                    : lang === 'bg'
                      ? 'Опитай отново (Popup)'
                      : 'Retry (Popup)'}
                </span>
              </button>

              <button
                type="button"
                disabled={authBusy}
                onClick={handleSignInGoogleRedirect}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#C59B57]/60 bg-[#181B22] px-4 py-2.5 text-xs font-semibold text-[#E5C17B] hover:bg-[#222631] transition-colors disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                <span>
                  {lang === 'bg'
                    ? 'Вход с пренасочване (ако прозорецът се затваря)'
                    : 'Sign in with Redirect (if popup closes)'}
                </span>
              </button>

              <button
                type="button"
                disabled={authBusy}
                onClick={() => setAuthModalOpen(false)}
                className="w-full rounded-xl border border-zinc-700 bg-transparent px-4 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-50"
              >
                {lang === 'bg' ? 'Затвори' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg bg-[#18181B] px-4 py-3 text-xs font-medium text-white shadow-xl border border-zinc-700">
          {toastMessage}
        </div>
      )}

      {/* Main Content Switch */}
      <main className="flex-1">
        {activeView === 'my_projects' && (
          <MyProjectsView
            lang={lang}
            user={user}
            onSignInGoogle={handleSignInGoogle}
            onLoadProjectInStudio={loadUserProjectIntoStudio}
          />
        )}

        {activeView === 'admin' &&
          (isAdmin ? (
            <AdminStudio
              lang={lang}
              user={user}
              isAdmin={isAdmin}
              siteSettings={siteSettings}
              decors={decors}
              hardwareTiers={hardwareTiers}
              meritItems={meritItems}
              galplasItems={galplasItems}
              nastehItems={nastehItems}
              nastehCustomSubsections={nastehCustomSubsections}
              gallery={gallery}
              onInspectIn3D={loadUserProjectIntoStudio}
              onCatalogUpdated={loadServerCatalog}
            />
          ) : (
            <section className="mx-auto max-w-xl px-6 py-20 text-center">
              <div className="rounded-2xl border border-zinc-800 bg-[#141518] p-8 text-zinc-100 shadow-2xl">
                <h2 className="font-display text-2xl font-semibold text-[#E5C17B]">
                  {lang === 'bg' ? 'Само за администратор' : 'Administrator Only'}
                </h2>
                <p className="mt-3 text-sm text-zinc-300">
                  {user
                    ? lang === 'bg'
                      ? 'Влезлият профил няма администраторски права.'
                      : 'The signed-in account does not have administrator permissions.'
                    : lang === 'bg'
                      ? 'Влезте с потвърдения администраторски Google профил, за да отворите админ панела.'
                      : 'Sign in with a verified administrator Google account to access the admin panel.'}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {!user && (
                    <button
                      type="button"
                      onClick={handleSignInGoogle}
                      className="rounded-lg bg-[#C59B57] px-4 py-2.5 text-xs font-bold text-[#0B0C10] hover:bg-[#D8B06E] transition-colors"
                    >
                      {t(lang, 'signInGoogle')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveView('home')}
                    className="rounded-lg border border-zinc-700 bg-[#1B1E26] px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:border-[#C59B57] transition-colors"
                  >
                    {lang === 'bg' ? 'Към началото' : 'Back to Home'}
                  </button>
                </div>
              </div>
            </section>
          ))}

        {activeView === 'home' && (
          <>
            {/* 1. Hero Section with Dark Architectural Look & Gold Accents */}
            <section className="relative overflow-hidden bg-[#0D0E12]">
              <img
                src={HERO_IMAGE_URL}
                alt={companyName}
                referrerPolicy="no-referrer"
                className="absolute inset-0 h-full w-full object-cover opacity-50"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-r from-[#0B0C10]/96 via-[#0B0C10]/80 to-[#0B0C10]/45"
              />
              <div className="relative mx-auto max-w-[1440px] px-5 sm:px-8 py-16 sm:py-24 lg:py-28">
                <div className="max-w-2xl">
                  <span className="inline-block rounded-lg border border-[#C59B57]/45 bg-[#C59B57]/15 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[#E5C17B]">
                    {lang === 'bg'
                      ? 'СК МЕБЕЛИ · Светлозар Колев · гр. Пловдив'
                      : 'SK MEBELI · Svetlozar Kolev · Plovdiv'}
                  </span>
                  <h1 className="mt-5 font-display text-3xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.1] tracking-tight text-white [text-wrap:balance]">
                    {t(lang, 'heroTitle')}
                  </h1>
                  <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-zinc-200">
                    {t(lang, 'heroSubtitle')}
                  </p>
                  <div className="mt-9 flex flex-wrap items-center gap-3.5">
                    <button
                      type="button"
                      onClick={handleOpenStudioFromSite}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#C59B57] px-6 py-4 text-sm font-bold text-[#0B0C10] shadow-lg shadow-[#C59B57]/25 hover:bg-[#D8B06E] hover:-translate-y-0.5 transition-all"
                    >
                      <Cuboid className="h-4 w-4" />
                      <span>{lang === 'bg' ? '3D Конфигуратор' : '3D Configurator'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLaunchLiveDemoFromSite}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#C59B57]/70 bg-[#141720]/90 backdrop-blur-sm px-6 py-4 text-sm font-semibold text-[#E5C17B] hover:bg-[#C59B57] hover:text-[#0B0C10] hover:-translate-y-0.5 transition-all"
                    >
                      <PlayCircle className="h-4 w-4" />
                      <span>{lang === 'bg' ? 'Демо видео' : 'Demo Video'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openSlideshowGallery(0)}
                      className="group inline-flex items-center gap-2 rounded-xl border border-[#C59B57]/60 bg-[#141720]/85 backdrop-blur-sm px-5 py-4 text-sm font-semibold text-white hover:border-[#E5C17B] hover:bg-[#C59B57] hover:text-[#0B0C10] hover:-translate-y-0.5 transition-all"
                    >
                      <Images className="h-4 w-4 text-[#E5C17B] group-hover:text-[#0B0C10] transition-colors" />
                      <span>{t(lang, 'navGallery')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAboutModalOpen(true)}
                      className="rounded-xl border border-white/25 bg-white/10 backdrop-blur-sm px-5 py-4 text-sm font-semibold text-white hover:bg-white hover:text-[#0B0C10] transition-all"
                    >
                      {lang === 'bg' ? 'За нас' : 'About Us'}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Features / Why Us Section (3 Columns) */}
            <section className="mx-auto max-w-[1440px] px-5 sm:px-8 py-16 sm:py-20">
              <div className="mb-10 text-center max-w-2xl mx-auto">
                <p className="text-xs font-semibold tracking-wider uppercase text-[#B47B44]">
                  {lang === 'bg' ? 'Защо да изберете нас' : 'Why Choose Us'}
                </p>
                <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold text-[#18181B]">
                  {lang === 'bg'
                    ? 'Прецизна мебелна изработка без компромиси'
                    : 'Precision Bespoke Craftsmanship'}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                <div className="rounded-2xl border border-zinc-200/80 bg-white p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#B47B44]/12 text-[#B47B44]">
                    <Award className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-zinc-900">
                    {lang === 'bg' ? 'Сертифицирано качество' : 'Certified Materials'}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">
                    {lang === 'bg'
                      ? 'Работим само със сертифицирани ПДЧ и МДФ плоскости с ABS кант и механизми до висок клас с плавно затваряне.'
                      : 'We craft exclusively with certified MFC & MDF boards, ABS edge-banding and high-class soft-close hardware.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-200/80 bg-white p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#B47B44]/12 text-[#B47B44]">
                    <Clock className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-zinc-900">
                    {lang === 'bg' ? 'Бързина и точен срок' : 'Fast & Reliable Lead Times'}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">
                    {lang === 'bg'
                      ? 'Ясно фиксиран срок за изработка и монтаж, съобразен с вашия проект — без скрити такси и излишно чакане.'
                      : 'Clear production schedules and professional delivery & installation tailored to your exact project.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-zinc-200/80 bg-white p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#B47B44]/12 text-[#B47B44]">
                    <Cuboid className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-zinc-900">
                    {lang === 'bg' ? '3D проектиране и опит' : 'Interactive 3D Precision'}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">
                    {lang === 'bg'
                      ? 'Проектирайте до милиметър в нашия 3D конфигуратор — виждате реални декори, Gola профили, уреди и цена веднага.'
                      : 'Design down to the millimeter in our live 3D configurator with real decors, handleless profiles, appliances & instant pricing.'}
                  </p>
                </div>
              </div>
            </section>

            {/* 3. Services / Products Cards */}
            <section id="services" className="border-t border-zinc-200 bg-white py-16 sm:py-20 px-5 sm:px-8">
              <div className="mx-auto max-w-[1440px]">
                <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
                  <div>
                    <p className="text-xs font-semibold tracking-wider uppercase text-[#B47B44]">
                      {lang === 'bg' ? 'Какво изработваме' : 'Our Craft'}
                    </p>
                    <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#18181B]">
                      {lang === 'bg' ? 'Мебели по индивидуален проект' : 'Bespoke Furniture Services'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStudioFullPage(true)}
                    className="rounded-xl bg-[#18181B] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#B47B44] hover:-translate-y-0.5 transition-all shadow-sm"
                  >
                    {lang === 'bg' ? 'Създай свой проект в 3D →' : 'Start 3D Design →'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                  {[
                    {
                      presetId: 'gal_kitchen_lshape_oak_graphite',
                      category: 'kitchen' as FurnitureCategory,
                      img: '/src/assets/images/gallery_kitchen_lshape_1794768611388.jpg',
                      titleBg: 'Кухни по индивидуален проект',
                      titleEn: 'Custom Kitchens',
                      descBg: 'Прави и Г-образни кухни с Gola L/C профили, LED осветление, термо плот и вградени уреди.',
                      descEn: 'Straight & L-shape kitchens with handleless Gola L/C profiles, integrated LED & built-in appliances.',
                    },
                    {
                      presetId: 'gal_wardrobe_cashmere_led',
                      category: 'wardrobe' as FurnitureCategory,
                      img: '/src/assets/images/gallery_wardrobe_cashmere_1794768610442.jpg',
                      titleBg: 'Дневни, спални и детски стаи',
                      titleEn: 'Bedrooms, Wardrobes & Kids’ Rooms',
                      descBg: 'Гардероби с плъзгащи врати или на панти до тавана, спални, скринове и детски композиции.',
                      descEn: 'Floor-to-ceiling hinged & sliding wardrobes, bedrooms, dressers and bespoke kids’ rooms.',
                    },
                    {
                      presetId: 'gal_living_tv_walnut',
                      category: 'living' as FurnitureCategory,
                      img: '/src/assets/images/gallery_living_tv_unit_1794768611139.jpg',
                      titleBg: 'Офис и цялостно обзавеждане',
                      titleEn: 'TV, Office & Full Interiors',
                      descBg: 'Ергономично офис обзавеждане, ТВ модули, антрета и цялостно интериорно изпълнение.',
                      descEn: 'Ergonomic office furniture, TV consoles, hallways and complete interior furnishing.',
                    },
                  ].map((srv) => (
                    <div
                      key={srv.presetId}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-[#F6F5F2]/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
                    >
                      <div className="aspect-[16/10] w-full overflow-hidden bg-zinc-200">
                        <img
                          src={resolveGalleryImageUrl(srv.img)}
                          alt={lang === 'bg' ? srv.titleBg : srv.titleEn}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </div>
                      <div className="flex flex-1 flex-col justify-between p-6">
                        <div>
                          <h3 className="font-display text-xl font-bold text-zinc-900">
                            {lang === 'bg' ? srv.titleBg : srv.titleEn}
                          </h3>
                          <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">
                            {lang === 'bg' ? srv.descBg : srv.descEn}
                          </p>
                        </div>
                        <div className="mt-6">
                          <button
                            type="button"
                            onClick={() => loadPresetIntoStudio(srv.presetId, srv.category)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#0D0E12] px-4 py-2 text-xs font-semibold text-[#E5C17B] shadow-xs hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all"
                          >
                            <span>{t(lang, 'loadInStudio')} →</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 4. Portfolio Galleries by Category */}
            <section id="gallery" className="border-t border-zinc-200 bg-[#F6F5F2] py-16 sm:py-20 px-5 sm:px-8">
              <div className="mx-auto max-w-[1440px]">
                <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
                  <div>
                    <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#18181B]">
                      {t(lang, 'galleryTitle')}
                    </h2>
                    <p className="mt-2.5 max-w-2xl text-sm sm:text-base text-zinc-600">
                      {t(lang, 'gallerySubtitle')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openSlideshowGallery(0)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0D0E12] px-4 py-2 text-xs font-semibold text-[#E5C17B] shadow-xs hover:bg-[#C59B57] hover:text-[#0B0C10] transition-colors whitespace-nowrap"
                    >
                      <Images className="h-3.5 w-3.5" />
                      <span>{lang === 'bg' ? 'Отвори слайд-галерия' : 'Open Slideshow'}</span>
                    </button>

                    {/* Interactive Category Filter Buttons */}
                    <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1.5 border border-zinc-200 shadow-xs">
                      {(
                        [
                          ['all', t(lang, 'catAll')],
                          ['kitchen', t(lang, 'catKitchen')],
                          ['wardrobe', t(lang, 'catWardrobe')],
                          ...(gallery.some((g) => g.category === 'dresser')
                            ? ([['dresser', t(lang, 'catDresser')]] as ['all' | FurnitureCategory, string][])
                            : []),
                          ['living', t(lang, 'catLiving')],
                          ['hallway', t(lang, 'catHallway')],
                        ] as ['all' | FurnitureCategory, string][]
                      ).map(([cat, label]) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setGalleryCategory(cat)}
                          className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                            galleryCategory === cat
                              ? 'bg-[#18181B] text-white shadow-sm'
                              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {filteredGallery.map((item) => {
                    const slideIdx = gallery.findIndex((g) => g.id === item.id);
                    return (
                    <article
                      key={item.id}
                      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
                    >
                      <button
                        type="button"
                        onClick={() => openSlideshowGallery(slideIdx >= 0 ? slideIdx : 0)}
                        className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-200 text-left cursor-pointer"
                      >
                        <img
                          src={resolveGalleryImageUrl(item.imageUrl)}
                          alt={lang === 'bg' ? item.titleBg : item.titleEn}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <div className="pointer-events-none absolute bottom-2.5 right-2.5 text-[10px] font-mono-tabular text-white/85 bg-black/50 backdrop-blur-xs px-2.5 py-0.5 rounded-md">
                          {companyName}
                        </div>
                      </button>

                      <div className="flex flex-1 flex-col justify-between p-6">
                        <div>
                          <div className="text-xs text-zinc-500">
                            <span>{item.dimensionsLabel}</span>
                            {sanitizeClientText(item.materialsLabel) && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>{sanitizeClientText(item.materialsLabel)}</span>
                              </>
                            )}
                          </div>
                          <h3 className="mt-1.5 font-display text-lg font-bold text-zinc-900">
                            {lang === 'bg' ? item.titleBg : item.titleEn}
                          </h3>
                        </div>

                        <div className="mt-4 pt-3.5 border-t border-zinc-100">
                          <button
                            type="button"
                            onClick={() => loadPresetIntoStudio(item.presetId, item.category)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D0E12] px-3.5 py-2 text-xs font-semibold text-[#E5C17B] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-colors"
                          >
                            <span>{t(lang, 'loadInStudio')} →</span>
                          </button>
                        </div>
                      </div>
                    </article>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* 5. Completed 100% Ready Projects Section */}
            <section id="completed-projects" className="border-t border-zinc-200 bg-white py-16 sm:py-20 px-5 sm:px-8">
              <div className="mx-auto max-w-[1440px]">
                <div className="mb-10">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#B47B44]">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{lang === 'bg' ? 'Завършени конфигурации' : 'Verified Configurations'}</span>
                  </div>
                  <h2 className="mt-1.5 font-display text-3xl sm:text-4xl font-bold text-[#18181B]">
                    {t(lang, 'completedTitle')}
                  </h2>
                  <p className="mt-2.5 max-w-2xl text-sm sm:text-base text-zinc-600">
                    {t(lang, 'completedSubtitle')}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
                  {completedTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-[#F6F5F2]/60 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                    >
                      <div>
                        <div className="text-xs font-mono-tabular text-zinc-500">
                          {tpl.dimensionsLabel}
                          {tpl.sourceProjectCode ? ` · ${tpl.sourceProjectCode}` : ''}
                        </div>
                        <h3 className="mt-2 font-display text-lg font-bold text-zinc-900">
                          {lang === 'bg' ? tpl.titleBg : tpl.titleEn}
                        </h3>
                        <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">
                          {lang === 'bg' ? tpl.summaryBg : tpl.summaryEn}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => loadCompletedTemplateIntoStudio(tpl)}
                        className="mt-6 w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-900 shadow-xs hover:border-[#C59B57] hover:bg-[#0D0E12] hover:text-[#E5C17B] transition-all"
                      >
                        {t(lang, 'loadInStudio')} · {t(lang, 'customizeNow')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 6. Interactive 2D/3D Configurator & Pricing Studio */}
            <StudioWorkspace
              lang={lang}
              config={studioConfig}
              activeProjectId={activeProjectId}
              activeProjectCode={activeProjectCode}
              onChangeConfig={setStudioConfig}
              decors={visibleDecors}
              hardwareTiers={hardwareTiers}
              meritItems={meritItems}
              partnerItems={allPartnerItems}
              partnerCategories={allPartnerCategories}
              pricingVersion={pricingVersion}
              user={user}
              isAdmin={isAdmin}
              isFullPage={studioFullPage}
              onToggleFullPage={() => setStudioFullPage((v) => !v)}
              onResetNewProject={handleResetNewProject}
              externalLoadSeq={externalLoadSeq}
              demoLaunchSeq={demoLaunchSeq}
              onSignInGoogle={handleSignInGoogle}
              onSavedToProfile={(projId, code, sentInquiry) => {
                setActiveProjectId(projId);
                setActiveProjectCode(code);
                showToast(
                  sentInquiry
                    ? lang === 'bg'
                      ? `Запитването (${code}) е изпратено! Можете да следите разговора в „Моите проекти“.`
                      : `Inquiry (${code}) sent! Track replies in My Projects.`
                    : lang === 'bg'
                      ? `Проектът (${code}) е запазен в профила ви.`
                      : `Project (${code}) saved to your profile.`,
                );
              }}
            />

            {/* 7. About Us Section */}
            <section id="about" className="border-t border-zinc-200 bg-[#F6F5F2] py-16 sm:py-20 px-5 sm:px-8">
              <div className="mx-auto max-w-[1280px] grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
                <div className="lg:col-span-7">
                  <p className="text-xs font-semibold tracking-wider uppercase text-[#B47B44]">
                    {t(lang, 'aboutSectionKicker')}
                  </p>
                  <h2 className="mt-2 font-display text-3xl sm:text-4xl font-bold text-[#18181B] [text-wrap:balance]">
                    {lang === 'bg' ? siteSettings.aboutTitleBg : siteSettings.aboutTitleEn}
                  </h2>
                  <p className="mt-4 text-sm sm:text-base leading-relaxed text-zinc-600 whitespace-pre-line">
                    {sanitizeClientText(
                      lang === 'bg' ? siteSettings.aboutBodyBg : siteSettings.aboutBodyEn,
                    )}
                  </p>
                  <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm font-medium text-zinc-800">
                    {(lang === 'bg'
                      ? [
                          'Кухни по индивидуален проект',
                          'Дневни, спални и детски стаи',
                          'Ергономично офис обзавеждане',
                          'Цялостно интериорно изпълнение',
                        ]
                      : [
                          'Custom kitchens',
                          'Living, bedrooms & kids’ rooms',
                          'Ergonomic office furniture',
                          'Complete interior execution',
                        ]
                    ).map((srvItem) => (
                      <li key={srvItem} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-[#B47B44] shrink-0" />
                        <span>{srvItem}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="lg:col-span-5 rounded-2xl border border-[#C59B57]/35 bg-[#111318] p-7 text-zinc-100 shadow-xl space-y-5">
                  <div className="flex items-center gap-3.5 border-b border-zinc-800 pb-4">
                    <div className="h-12 w-[68px] sm:h-14 sm:w-20 rounded-lg overflow-hidden bg-[#141518] border border-[#C59B57]/50 p-1.5 flex items-center justify-center shrink-0">
                      <img
                        src={siteSettings.logoUrl || '/assets/sk-emblem.png'}
                        alt={companyName}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div>
                      <div className="font-display text-xl font-bold text-[#E5C17B]">
                        {companyName}
                      </div>
                      <div className="text-xs text-zinc-400">
                        {lang === 'bg' ? 'Светлозар Колев' : 'Svetlozar Kolev'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3.5 text-sm text-zinc-200">
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-[#C59B57] shrink-0" />
                      <a
                        href={`tel:${siteSettings.phone.replace(/\s+/g, '')}`}
                        className="font-mono-tabular text-base font-bold text-[#E5C17B] hover:text-white whitespace-nowrap"
                      >
                        {siteSettings.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-[#C59B57] shrink-0" />
                      <a
                        href={`mailto:${siteSettings.email}`}
                        className="text-zinc-200 hover:text-[#E5C17B]"
                      >
                        {siteSettings.email}
                      </a>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-[#C59B57] shrink-0 mt-0.5" />
                      <span>{lang === 'bg' ? siteSettings.cityBg : siteSettings.cityEn}</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-[#C59B57] shrink-0 mt-0.5" />
                      <span>
                        {lang === 'bg'
                          ? siteSettings.workingHoursBg || 'Пон - Пет: 09:00 - 18:00 · Съб: 10:00 - 14:00'
                          : siteSettings.workingHoursEn || 'Mon - Fri: 09:00 - 18:00 · Sat: 10:00 - 14:00'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Dark & Gold Footer with Single-Line Phone, Brand, Plovdiv & Quick Studio/Demo CTAs */}
      <footer id="contact-footer" className="bg-[#0B0C10] border-t border-[#C59B57]/25 text-zinc-300 px-5 sm:px-8 pt-14 pb-10">
        <div className="mx-auto max-w-[1440px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-zinc-800">
          {/* Brand, Quick Buttons & Socials */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-16 rounded-lg overflow-hidden bg-[#141518] border border-[#C59B57]/50 p-1 flex items-center justify-center shrink-0">
                <img
                  src={siteSettings.logoUrl || '/assets/sk-emblem.png'}
                  alt={companyName}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="font-display text-lg font-bold text-[#E5C17B]">
                  {lang === 'bg' ? 'СК МЕБЕЛИ — Светлозар Колев' : 'SK MEBELI — Svetlozar Kolev'}
                </div>
                <div className="text-xs text-zinc-400">
                  {lang === 'bg' ? 'гр. Пловдив' : 'Plovdiv, Bulgaria'}
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-zinc-400">
              {lang === 'bg'
                ? 'Кухни по индивидуален проект, дневни, спални и детски стаи, ергономично офис обзавеждане и цялостно интериорно изпълнение.'
                : 'Custom kitchens, living rooms, bedrooms & kids’ rooms, ergonomic office furniture and complete interiors.'}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleOpenStudioFromSite}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C59B57] px-3.5 py-2 text-xs font-bold text-[#0B0C10] hover:bg-[#D8B06E] transition-colors whitespace-nowrap"
              >
                <Cuboid className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? '3D Конфигуратор' : '3D Configurator'}</span>
              </button>
              <button
                type="button"
                onClick={handleLaunchLiveDemoFromSite}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C59B57]/60 bg-[#151821] px-3.5 py-2 text-xs font-semibold text-[#E5C17B] hover:border-[#E5C17B] hover:bg-[#1E222E] transition-colors whitespace-nowrap"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>{lang === 'bg' ? 'Демо видео' : 'Demo Video'}</span>
              </button>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <a
                href={`tel:${siteSettings.phone.replace(/\s+/g, '')}`}
                aria-label="Phone"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-[#C59B57] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all"
              >
                <Phone className="h-4 w-4" />
              </a>
              <a
                href={`mailto:${siteSettings.email}`}
                aria-label="Email"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-[#C59B57] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all"
              >
                <Mail className="h-4 w-4" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-[#C59B57] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-[#C59B57] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href={`viber://chat?number=${encodeURIComponent(siteSettings.phone.replace(/\s+/g, ''))}`}
                aria-label="Viber"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-[#C59B57] hover:bg-[#C59B57] hover:text-[#0B0C10] transition-all"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Contacts & Working Hours */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="font-display text-base font-bold text-white">
              {lang === 'bg' ? 'Контакти и работно време' : 'Contacts & Hours'}
            </h3>
            <ul className="space-y-3 text-sm text-zinc-400">
              <li className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-[#C59B57] shrink-0" />
                <a
                  href={`tel:${siteSettings.phone.replace(/\s+/g, '')}`}
                  className="font-mono-tabular text-base font-bold text-[#E5C17B] hover:text-white whitespace-nowrap transition-colors"
                >
                  {siteSettings.phone}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-[#C59B57] shrink-0" />
                <a
                  href={`mailto:${siteSettings.email}`}
                  className="text-zinc-200 hover:text-[#E5C17B] transition-colors"
                >
                  {siteSettings.email}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-[#C59B57] shrink-0 mt-0.5" />
                <span>{lang === 'bg' ? 'гр. Пловдив · СК МЕБЕЛИ — Светлозар Колев' : 'Plovdiv · SK MEBELI — Svetlozar Kolev'}</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-[#C59B57] shrink-0 mt-0.5" />
                <span>
                  {lang === 'bg'
                    ? siteSettings.workingHoursBg || 'Пон - Пет: 09:00 - 18:00 · Съб: 10:00 - 14:00'
                    : siteSettings.workingHoursEn || 'Mon - Fri: 09:00 - 18:00 · Sat: 10:00 - 14:00'}
                </span>
              </li>
            </ul>
          </div>

          {/* Quick Contact Message Form */}
          <div className="lg:col-span-4">
            <h3 className="font-display text-base font-bold text-white mb-3">
              {lang === 'bg' ? 'Бързо запитване / Съобщение' : 'Quick Message'}
            </h3>
            <form onSubmit={handleSubmitQuickContact} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder={lang === 'bg' ? 'Вашето име' : 'Your Name'}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:border-[#B47B44] focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={contactPhoneOrEmail}
                  onChange={(e) => setContactPhoneOrEmail(e.target.value)}
                  placeholder={lang === 'bg' ? 'Телефон или имейл' : 'Phone or Email'}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:border-[#B47B44] focus:outline-none"
                />
              </div>
              <textarea
                rows={3}
                required
                value={contactMessage}
                onChange={(e) => setContactMessage(e.target.value)}
                placeholder={
                  lang === 'bg'
                    ? 'Опишете накратко каква мебел желаете или оставете въпрос...'
                    : 'Describe your project or question...'
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:border-[#B47B44] focus:outline-none"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={contactSending}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B47B44] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#C68B52] hover:-translate-y-0.5 transition-all disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>
                    {contactSending
                      ? lang === 'bg'
                        ? 'Изпращане...'
                        : 'Sending...'
                      : lang === 'bg'
                        ? 'Изпрати съобщение'
                        : 'Send Message'}
                  </span>
                </button>
                {contactSentOk && (
                  <span className="text-xs font-medium text-emerald-400">
                    {lang === 'bg' ? '✓ Получено!' : '✓ Received!'}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-[1440px] pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <span>
            © {new Date().getFullYear()} {companyName}. {lang === 'bg' ? 'Всички права запазени.' : 'All rights reserved.'}
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={handleOpenAdminDirect}
              className="text-zinc-400 hover:text-[#E5B887] font-medium transition-colors"
            >
              {t(lang, 'navAdmin')}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
