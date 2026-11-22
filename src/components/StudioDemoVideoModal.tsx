import React, { useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  PlayCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { Language } from '../types/furniture';

export interface LiveDemoStep {
  id: string;
  sectionBg: string;
  sectionEn: string;
  durationMs: number;
  titleBg: string;
  titleEn: string;
  descriptionBg: string;
  descriptionEn: string;
  hintBg: string;
  hintEn: string;
}

export const LIVE_DEMO_STEPS: LiveDemoStep[] = [
  {
    id: 'kitchen_open',
    sectionBg: 'Кухня',
    sectionEn: 'Kitchen',
    durationMs: 7500,
    titleBg: '1. Кухня — избор от папките горе',
    titleEn: '1. Kitchen — Pick from Top Folders',
    descriptionBg:
      'Започваме от празна стая и отваряме папка „Кухня — Долни“. Оттук с един клик избирате готов шкаф или цяла кухня.',
    descriptionEn:
      'We start from an empty room and open the "Kitchen — Base" folder. From here you pick any cabinet or full layout with one click.',
    hintBg: 'Погледнете отвореното меню горе — всички стаи са подредени по папки.',
    hintEn: 'Look at the open top menu — all rooms are neatly grouped into folders.',
  },
  {
    id: 'kitchen_place_resize',
    sectionBg: 'Кухня',
    sectionEn: 'Kitchen',
    durationMs: 9500,
    titleBg: '2. Кухня — долни шкафове и размери',
    titleEn: '2. Kitchen — Base Cabinets & Sizes',
    descriptionBg:
      'Слагаме три долни шкафа: с врата, с чекмеджета и за мивка. После отваряме настройките вдясно и увеличаваме средния шкаф от 600 на 800 мм.',
    descriptionEn:
      'We place three base cabinets: door, drawers, and sink. Then we open the right settings and widen the middle cabinet from 600 to 800 mm.',
    hintBg: 'Гледайте как плотът и размерите около шкафовете се нагласят сами.',
    hintEn: 'Watch how the worktop and overall dimensions adjust automatically.',
  },
  {
    id: 'kitchen_drawers_swap',
    sectionBg: 'Кухня',
    sectionEn: 'Kitchen',
    durationMs: 10000,
    titleBg: '3. Кухня — чекмеджета и размяна на места',
    titleEn: '3. Kitchen — Drawers & Swapping Places',
    descriptionBg:
      'Превключваме чекмеджетата да са отгоре или отдолу над вратата. След това разменяме местата на мивката и чекмеджетата в редицата, без да трием нищо.',
    descriptionEn:
      'We switch drawers above or below the door. Then we swap the sink and drawer cabinets in the row without deleting anything.',
    hintBg: 'Мивката и плотът се местят автоматично заедно с избрания шкаф.',
    hintEn: 'The sink and worktop automatically move together with the cabinet.',
  },
  {
    id: 'kitchen_upper_tall',
    sectionBg: 'Кухня',
    sectionEn: 'Kitchen',
    durationMs: 9500,
    titleBg: '4. Кухня — горни шкафове и високи колони',
    titleEn: '4. Kitchen — Upper Cabinets & Tall Columns',
    descriptionBg:
      'Отваряме „Кухня — Горни и колони“. Можете да добавите горен ред с витрина, аспиратор и клапа, както и високи колони за хладилник и фурна.',
    descriptionEn:
      'Opening "Kitchen — Upper & Columns". Add an upper row with glass doors, hood, and flap-up doors, plus tall fridge and oven columns.',
    hintBg: 'Високите колони застават точно до долния ред шкафове.',
    hintEn: 'Tall columns align neatly right next to the lower cabinets.',
  },
  {
    id: 'wardrobe_hinged_interior',
    sectionBg: 'Гардероби',
    sectionEn: 'Wardrobes',
    durationMs: 10000,
    titleBg: '5. Гардероби — размери и вътрешно подреждане',
    titleEn: '5. Wardrobes — Sizes & Interior Layout',
    descriptionBg:
      'Отваряме папка „Гардероби“ и слагаме трикрилен гардероб. Отдясно променяме ширината и височината му, а вратите се отварят, за да видите рафтовете, лоста и чекмеджетата вътре.',
    descriptionEn:
      'Opening the "Wardrobes" folder and loading a 3-door wardrobe. We resize it on the right and open the doors to view shelves, hanging rail, and drawers inside.',
    hintBg: 'Можете свободно да сменяте броя рафтове, лостове и вътрешни чекмеджета.',
    hintEn: 'You can freely adjust shelves, hanging rails, and interior drawers.',
  },
  {
    id: 'wardrobe_sliding',
    sectionBg: 'Гардероби',
    sectionEn: 'Wardrobes',
    durationMs: 9500,
    titleBg: '6. Гардероби — плъзгащи врати и релси',
    titleEn: '6. Wardrobes — Sliding Doors & Tracks',
    descriptionBg:
      'Избираме гардероб с 3 плъзгащи врати. Програмата сама добавя горна и долна релса и кант-дръжки, а вратите се плъзгат плавно настрани.',
    descriptionEn:
      'Selecting a 3-door sliding wardrobe. The studio automatically adds top/bottom tracks and handle profiles, and the doors glide smoothly sideways.',
    hintBg: 'Наблюдавайте как вратите се плъзгат без да заемат място напред.',
    hintEn: 'Notice how sliding doors open sideways without taking floor space.',
  },
  {
    id: 'hallway_demo',
    sectionBg: 'Антре',
    sectionEn: 'Hallway',
    durationMs: 9500,
    titleBg: '7. Антре — шкаф за обувки, пейка и огледало',
    titleEn: '7. Hallway — Shoe Cabinet, Bench & Mirror',
    descriptionBg:
      'Отваряме папка „Антре“ и слагаме готов комплект с огледален шкаф, пейка за сядане и шкаф за обувки. Отдясно спокойно нагласяте ширината и височината на всеки шкаф.',
    descriptionEn:
      'Opening the "Hallway" folder and loading a set with mirror cabinet, bench, and shoe rack. On the right you adjust each cabinet’s width and height.',
    hintBg: 'Можете да добавяте и отделна закачалка или висок шкаф за антре.',
    hintEn: 'You can also add a separate coat panel or tall hallway closet.',
  },
  {
    id: 'living_tv_demo',
    sectionBg: 'ТВ модули',
    sectionEn: 'TV & Living',
    durationMs: 9500,
    titleBg: '8. ТВ модули и дневна — добавяне и размери',
    titleEn: '8. TV & Living Modules — Place & Resize',
    descriptionBg:
      'Отваряме „ТВ модули и дневна“ и избираме ТВ секция с чекмеджета, ниша и витрини. Вдясно променяте ширината на средната част, за да пасне точно на вашия телевизор.',
    descriptionEn:
      'Opening "TV & Living" and selecting a TV unit with drawers, niche, and glass vitrines. On the right you adjust the center width to fit your TV.',
    hintBg: 'Има избор от ниски шкафове, окачени на стената и цели секции.',
    hintEn: 'Choose from low consoles, floating wall units, or full media walls.',
  },
  {
    id: 'appliances_demo',
    sectionBg: 'Уреди',
    sectionEn: 'Appliances',
    durationMs: 8500,
    titleBg: '9. Уреди — лесно вграждане в шкафовете',
    titleEn: '9. Appliances — Easy Built-In Placement',
    descriptionBg:
      'Отваряме папка „Уреди“. С един клик вграждате фурна, котлони, миялна, аспиратор или хладилник директно в избрания шкаф или като отделен шкаф до него.',
    descriptionEn:
      'Opening the "Appliances" folder. With one click you embed an oven, hob, dishwasher, hood, or fridge into a bay or add a new appliance cabinet.',
    hintBg: 'Всеки уред влиза на точното си място и се мести заедно с шкафа.',
    hintEn: 'Each appliance snaps into its exact niche and moves with the cabinet.',
  },
  {
    id: 'materials_hardware_price',
    sectionBg: 'Материали и обков',
    sectionEn: 'Materials & Hardware',
    durationMs: 10000,
    titleBg: '10. Материали, цветове, обков и цена',
    titleEn: '10. Materials, Colors, Hardware & Price',
    descriptionBg:
      'Отваряме „Материали и обков“. Сменяме цветовете на вратите и плота и избираме ниво на пантите и водачите (Икономичен, Стандартен или Премиум). Цената горе се смята веднага.',
    descriptionEn:
      'Opening "Materials & Hardware". We change door and worktop colors and pick the hinge/runner tier (Economy, Standard, or Premium). The top price updates instantly.',
    hintBg: 'Вижте как се сменят цветовете в 3D и как се променя крайната цена горе.',
    hintEn: 'Watch the 3D colors change and the live total price update at the top.',
  },
  {
    id: 'views_doors_dimensions',
    sectionBg: 'Изгледи и размери',
    sectionEn: 'Views & Dimensions',
    durationMs: 10000,
    titleBg: '11. 3D изгледи, отваряне на врати и размери',
    titleEn: '11. 3D Views, Opening Doors & Dimensions',
    descriptionBg:
      'Отваряме всички врати и чекмеджета и включваме размерните линии за ширина, височина и дълбочина. С бутоните долу въртите изгледа Отпред, Отзад, Отгоре и в Изометрия.',
    descriptionEn:
      'Opening all doors and drawers with full dimension lines turned on. Use the bottom bar to switch Front, Back, Top, and Isometric views smoothly.',
    hintBg: 'С мишката въртите свободно с левия бутон и местите с десния бутон или стрелките.',
    hintEn: 'Left-drag to orbit freely and right-drag or use the arrows below to move.',
  },
  {
    id: 'save_account_new',
    sectionBg: 'Запазване',
    sectionEn: 'Save Project',
    durationMs: 9000,
    titleBg: '12. „Нов проект“ и запазване в акаунта',
    titleEn: '12. "New Project" & Save to Account',
    descriptionBg:
      'Когато сте готови, натиснете „Запази / Оферта“ горе вдясно, за да запазите проекта в акаунта си и да получите оферта. С „Нов проект“ изчиствате всичко и започвате отначало.',
    descriptionEn:
      'When ready, click "Save / Quote" in the top right to save the project in your account and request a quote. Use "New Project" to clear the room and start fresh.',
    hintBg: 'Натиснете „Затвори“, за да се върнете спокойно към вашата работа.',
    hintEn: 'Click "Close" to return smoothly to your own project.',
  },
];

interface StudioDemoVideoModalProps {
  open: boolean;
  lang: Language;
  stepIndex: number;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onRestart: () => void;
  onSelectStep: (idx: number) => void;
  onClose: () => void;
}

export const StudioDemoVideoModal: React.FC<StudioDemoVideoModalProps> = ({
  open,
  lang,
  stepIndex,
  playing,
  onPrev,
  onNext,
  onTogglePlay,
  onRestart,
  onSelectStep,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const step = LIVE_DEMO_STEPS[stepIndex] || LIVE_DEMO_STEPS[0];
  const isFirst = stepIndex <= 0;
  const isLast = stepIndex >= LIVE_DEMO_STEPS.length - 1;

  return (
    <aside
      data-demo-guide="true"
      className="w-full sm:w-[310px] shrink-0 border-b sm:border-b-0 sm:border-r border-[#252D3F] bg-[#0E131E] text-zinc-100 flex flex-col justify-between z-20 max-h-[280px] sm:max-h-none overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[#252D3F] bg-[#0B0F17] px-3 py-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <PlayCircle className="h-4 w-4 text-[#D49B62] shrink-0" />
          <span className="text-xs font-semibold text-white truncate">
            {lang === 'bg' ? 'Демо на живо' : 'Live Demo'}
          </span>
          <span className="font-mono-tabular rounded bg-[#182032] px-1.5 py-0.5 text-[10px] text-[#E6B88A]">
            {stepIndex + 1}/{LIVE_DEMO_STEPS.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded border border-[#2C354A] bg-[#141A26] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-zinc-500 hover:text-white transition-colors shrink-0"
          title={lang === 'bg' ? 'Затвори' : 'Close'}
        >
          <X className="h-3.5 w-3.5" />
          <span>{lang === 'bg' ? 'Затвори' : 'Close'}</span>
        </button>
      </div>

      {/* Step Content */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {/* Progress Dots + Current Section Label */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span className="font-medium text-[#E6B88A]">
              {lang === 'bg' ? step.sectionBg : step.sectionEn}
            </span>
            <span>
              {playing
                ? lang === 'bg'
                  ? 'Бавно темпо · върви автоматично'
                  : 'Slow pace · auto-playing'
                : lang === 'bg'
                  ? 'На пауза'
                  : 'Paused'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {LIVE_DEMO_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStep(idx)}
                title={lang === 'bg' ? s.titleBg : s.titleEn}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  idx === stepIndex
                    ? 'bg-[#D49B62]'
                    : idx < stepIndex
                      ? 'bg-[#B47B44]/60'
                      : 'bg-[#252D3F] hover:bg-zinc-600'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white leading-snug">
            {lang === 'bg' ? step.titleBg : step.titleEn}
          </h3>
          <p className="text-xs leading-relaxed text-zinc-200">
            {lang === 'bg' ? step.descriptionBg : step.descriptionEn}
          </p>
          <div className="rounded-md border border-[#273045] bg-[#141A26] px-2.5 py-1.5 text-[11px] leading-snug text-[#E6B88A]">
            {lang === 'bg' ? step.hintBg : step.hintEn}
          </div>
        </div>

        {/* Playback Controls */}
        <div className="space-y-1.5 pt-1">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={isFirst}
              onClick={onPrev}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[#2C354A] bg-[#141A26] px-2 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#D49B62] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
              <span>{lang === 'bg' ? 'Предишна' : 'Previous'}</span>
            </button>

            <button
              type="button"
              onClick={isLast && !playing ? onRestart : onTogglePlay}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-[#B47B44] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#9E6835] transition-colors"
            >
              {playing ? (
                <>
                  <Pause className="h-3.5 w-3.5 shrink-0" />
                  <span>{lang === 'bg' ? 'Пауза' : 'Pause'}</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 shrink-0" />
                  <span>{lang === 'bg' ? 'Продължи' : 'Resume'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLast}
              onClick={onNext}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[#2C354A] bg-[#141A26] px-2 py-1.5 text-xs font-medium text-zinc-200 hover:border-[#D49B62] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
            >
              <span>{lang === 'bg' ? 'Следваща' : 'Next'}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>

          {stepIndex > 0 && (
            <button
              type="button"
              onClick={onRestart}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#252D3F] bg-transparent px-2 py-1 text-[11px] text-zinc-400 hover:border-[#D49B62]/50 hover:text-zinc-200 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{lang === 'bg' ? 'Пусни демото отначало' : 'Restart Demo'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Reassuring Footer */}
      <div className="border-t border-[#252D3F] bg-[#0B0F17] px-3 py-2 text-[10px] leading-snug text-zinc-400 shrink-0">
        {lang === 'bg'
          ? 'Това е преглед на живо. Когато затворите гида, вашият проект се връща без промяна.'
          : 'Live walkthrough. When you close it, your project returns unchanged.'}
      </div>
    </aside>
  );
};
