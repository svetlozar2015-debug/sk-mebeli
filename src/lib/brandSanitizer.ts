import { HardwareTier, Language, QualityClass } from '../types/furniture';

/**
 * Strips supplier/store names, websites, and manufacturer/brand/series names
 * from strings before displaying them in client-facing UI views.
 * Admin panels and workshop exports bypass this sanitizer and see raw catalog data.
 */
export function sanitizeClientText(raw?: string | null): string {
  if (!raw) return '';

  let s = String(raw);

  // 1. Specific multi-word phrases & branded series replacements (order: longest first)
  const replacements: Array<[RegExp, string]> = [
    [/\(?\bmeritbg\.com\b\)?/gi, ''],
    [/\(?\bgalplas\.bg\b\)?/gi, ''],
    [/Мерит\s*Пловдив/gi, ''],
    [/Настех\s*ООД(\s*\(гр\.\s*Пловдив\))?/gi, ''],
    [/\bGAL\s*PLAS(\s*LTD)?\b/gi, ''],
    [/\bNasteh(\s*Ltd)?\b/gi, ''],
    [/Балкан\s*Юг/gi, ''],
    [/\bBalkan\s*Yug\b/gi, ''],
    [/Мерит/gi, ''],
    [/\bMerit\b/gi, ''],
    [/Салекс/gi, ''],
    [/\bSalex\b/gi, ''],
    [/Настех/gi, ''],

    // Specific branded feature/category phrases
    [/Механизми\s+PEKA/gi, 'Изтеглящи кухненски механизми'],
    [/\(вкл\.\s*AXILO\)/gi, ''],
    [/\bAXILO\s*78\s*система/gi, 'Система'],
    [/\bAXILO\s*78\b/gi, ''],
    [/\bAXILO\b/gi, ''],
    [/\bAVENTOS\s*HK-?top\b/gi, ''],
    [/\bAVENTOS\b/gi, ''],
    [/\bLe\s*Mans\s*II\b/gi, ''],
    [/\bLe\s*Mans\b/gi, ''],
    [/\bDispensa\b/gi, ''],
    [/\bPEKA\b/gi, ''],
    [/\bBlumotion\b/gi, ''],
    [/\bBlum\s*ONIX\b/gi, ''],
    [/\bBlum\s*Tandembox\b/gi, ''],
    [/\bBlum\s*Tandem\b/gi, ''],
    [/\bBlum\s*Legrabox\b/gi, ''],
    [/\bHettich\s*Germany\b/gi, ''],
    [/\bHettich\s*Sensys\b/gi, ''],
    [/\bInnoTech\s*Atira\b/gi, ''],
    [/\bInnoTech\b/gi, ''],
    [/\bSensys\b/gi, ''],
    [/\bHettich\b/gi, ''],
    [/\bBlum\b/gi, ''],
    [/\bTandembox\b/gi, ''],
    [/\bLegrabox\b/gi, ''],
    [/\bTandem\b/gi, ''],
    [/\bQuadro\b/gi, ''],
    [/\bTopLine\b/gi, ''],
    [/\bTip-?On\b/gi, ''],
    [/\bCLIP-?ON\b/gi, ''],
    [/\bONIX\b/gi, ''],
    [/\bGTV\b/gi, ''],
    [/\bSTARAX\b/gi, ''],
    [/\bDanko\b/gi, ''],
    [/\bH[äa]fele\b/gi, ''],
    [/\bHEXI\b/gi, ''],
    [/\bS02\b/gi, ''],

    // Board brands
    [/\bEgger\b/gi, ''],
    [/\bKronospan\b/gi, ''],
    [/\bKastamonu\b/gi, ''],
    [/\bCleaf\b/gi, ''],
    [/\bWodego\b/gi, ''],
  ];

  for (const [pattern, repl] of replacements) {
    s = s.replace(pattern, repl);
  }

  // 2. Tidy up leftover punctuation/delimiters
  s = s
    .replace(/\(\s*[,/&·\-–—]*\s*\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[,\s/&·\-–—+]+/g, '')
    .replace(/[,\s/&·\-–—+]+$/g, '')
    .replace(/,\s*,+/g, ',')
    .replace(/·\s*·+/g, '·')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Capitalize first letter if stripping left lowercase start (e.g. "система за..." -> "Система за...")
  if (s.length > 0 && /^[a-zа-я]/.test(s)) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }

  return s;
}

/**
 * Infers a client-facing QualityClass (high | medium | low) when an item
 * doesn't explicitly carry one (e.g. Merit items mapped only by brandLevel).
 */
export function inferQualityClass(
  explicitClass?: QualityClass,
  brandLevel?: string,
): QualityClass {
  if (explicitClass === 'high' || explicitClass === 'medium' || explicitClass === 'low') {
    return explicitClass;
  }
  const b = (brandLevel || '').toLowerCase();
  if (
    b.includes('премиум') ||
    b.includes('висок') ||
    b.includes('high') ||
    b.includes('blum') ||
    b.includes('hettich') ||
    b.includes('peka') ||
    b.includes('hafele') ||
    b.includes('häfele')
  ) {
    return 'high';
  }
  if (
    b.includes('бюдж') ||
    b.includes('иконом') ||
    b.includes('нисък') ||
    b.includes('low') ||
    b.includes('economy')
  ) {
    return 'low';
  }
  return 'medium';
}

/**
 * Neutralizes a HardwareTier (Level 1 / 2 / 3) for client display so no supplier
 * or manufacturer names leak even if stored in Firestore.
 */
export function getNeutralHardwareTierInfo(
  hw: HardwareTier | undefined,
  lang: Language,
): { badge: string; title: string; description: string } {
  const isBg = lang === 'bg';
  if (!hw) {
    return {
      badge: isBg ? 'Ниво 2' : 'Lvl 2',
      title: isBg ? 'Стандартен клас' : 'Standard Class',
      description: '',
    };
  }

  if (hw.id === 'hw_economy' || hw.tier === 'economy') {
    return {
      badge: isBg ? 'Ниво 1' : 'Lvl 1',
      title: isBg ? 'Ниво 1: Икономичен / Нисък клас' : 'Level 1: Economy Class',
      description: isBg
        ? 'Стандартни ролкови водачи, обикновени панти без плавно прибиране, газови амортисьори и базова плъзгаща система.'
        : 'Standard roller drawer runners, regular concealed hinges without damping, gas lift struts.',
    };
  }

  if (hw.id === 'hw_gtv' || hw.tier === 'standard') {
    return {
      badge: isBg ? 'Ниво 2' : 'Lvl 2',
      title: isBg ? 'Ниво 2: Стандартен / Среден клас' : 'Level 2: Standard / Medium Class',
      description: isBg
        ? 'Скрити водачи с долно водене, панти с плавно прибиране (Soft-Close) и стандартни плъзгащи механизми.'
        : 'Soft-close hinges, concealed undermount runners, telescopic slides & balanced sliding systems.',
    };
  }

  if (hw.id === 'hw_blum' || hw.tier === 'luxury') {
    return {
      badge: isBg ? 'Ниво 3' : 'Lvl 3',
      title: isBg ? 'Ниво 3: Висок клас (Премиум)' : 'Level 3: High Class (Premium)',
      description: isBg
        ? 'Висок клас панти с плавно затваряне, скрити водачи с висока товароносимост, метални чекмеджета с двойни страници, повдигачи и висок клас плъзгащи системи.'
        : 'High-class soft-close hinges, heavy-duty concealed runners, double-walled metal drawer systems, flap lifts & premium sliding systems.',
    };
  }

  const rawTitle = sanitizeClientText(isBg ? hw.nameBg : hw.nameEn);
  const rawDesc = sanitizeClientText(isBg ? hw.descriptionBg : hw.descriptionEn);
  return {
    badge: isBg ? 'Висок клас' : 'High Class',
    title: rawTitle || (isBg ? 'Висок клас механизми' : 'High Class Hardware'),
    description:
      rawDesc ||
      (isBg
        ? 'Висок клас панти с плавно затваряне и метални чекмеджета с повишена товароносимост.'
        : 'High-precision damped hinges and heavy-duty double-walled drawer systems.'),
  };
}
