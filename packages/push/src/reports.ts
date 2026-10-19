import type { Locale } from "@repo/mail/verification";

import { line } from "./alerts";
import type { Push } from "./index";

// The push a notice of reports sends: decision 068. A title that names the break and how many
// reports, a line with the newest one's author, size and note, the break's reports to open, and
// the first photo for a browser that shows a picture.

/** How big the waves looked, in the words a session says it with. */
export type ReportSize =
  | "ankle"
  | "knee"
  | "waist"
  | "chest"
  | "shoulder"
  | "head"
  | "overhead"
  | "double_overhead"
  | "triple_overhead";

export type ReportPushContent = {
  locale: Locale;
  noticeId: string;
  breakId: string;
  breakName: string;
  // How many reports the notice holds that are still shown.
  count: number;
  // The newest of them.
  author: string | null;
  waveSize: ReportSize | null;
  note: string | null;
  // The address of its first photo's thumbnail, signed for as long as the push is kept. Null
  // when it has none ready.
  image: string | null;
  // The web app's address, with the part that names the language: where its pages are.
  page: string;
};

const TITLE_CHARACTERS = 80;
const LINE_CHARACTERS = 120;
const NAME_CHARACTERS = 40;
const NOTE_CHARACTERS = 70;

const WORDS: Record<
  Locale,
  {
    one: (name: string) => string;
    many: (count: number, name: string) => string;
    quote: (note: string) => string;
    sizes: Record<ReportSize, string>;
  }
> = {
  en: {
    one: (name) => `New report at ${name}`,
    many: (count, name) => `${count} reports at ${name}`,
    quote: (note) => `“${note}”`,
    sizes: {
      ankle: "Ankle",
      knee: "Knee",
      waist: "Waist",
      chest: "Chest",
      shoulder: "Shoulder",
      head: "Head",
      overhead: "Overhead",
      double_overhead: "Double overhead",
      triple_overhead: "Triple overhead",
    },
  },
  fr: {
    one: (name) => `Nouveau report à ${name}`,
    many: (count, name) => `${count} reports à ${name}`,
    quote: (note) => `« ${note} »`,
    sizes: {
      ankle: "Cheville",
      knee: "Genou",
      waist: "Taille",
      chest: "Poitrine",
      shoulder: "Épaules",
      head: "Tête",
      overhead: "Overhead",
      double_overhead: "Double overhead",
      triple_overhead: "Triple overhead",
    },
  },
  es: {
    one: (name) => `Nuevo reporte en ${name}`,
    many: (count, name) => `${count} reportes en ${name}`,
    quote: (note) => `«${note}»`,
    sizes: {
      ankle: "Tobillo",
      knee: "Rodilla",
      waist: "Cintura",
      chest: "Pecho",
      shoulder: "Hombros",
      head: "Cabeza",
      overhead: "Por encima de la cabeza",
      double_overhead: "Doble de la cabeza",
      triple_overhead: "Triple de la cabeza",
    },
  },
  pt: {
    one: (name) => `Novo report em ${name}`,
    many: (count, name) => `${count} reports em ${name}`,
    quote: (note) => `«${note}»`,
    sizes: {
      ankle: "Tornozelo",
      knee: "Joelho",
      waist: "Cintura",
      chest: "Peito",
      shoulder: "Ombro",
      head: "Cabeça",
      overhead: "Overhead",
      double_overhead: "Double overhead",
      triple_overhead: "Triple overhead",
    },
  },
};

/** The push of a notice: what a browser shows, the page it opens, and the picture beside it. */
export function reportPush(content: ReportPushContent): Push {
  const words = WORDS[content.locale];
  const name = line(content.breakName, NAME_CHARACTERS);
  const title = content.count > 1 ? words.many(content.count, name) : words.one(name);
  const parts = [
    content.author ? line(content.author, 24) : null,
    content.waveSize ? words.sizes[content.waveSize] : null,
    content.note ? words.quote(line(content.note, NOTE_CHARACTERS)) : null,
  ].filter((part): part is string => part !== null);
  const query = new URLSearchParams({
    break: content.breakId,
    tab: "reports",
    notice: content.noticeId,
  });
  return {
    title: line(title, TITLE_CHARACTERS),
    body: line(parts.join(" · "), LINE_CHARACTERS),
    url: `${content.page}/app?${query.toString()}`,
    // A newer notice at the break takes the older one's place on the screen.
    tag: `report-${content.breakId}`,
    ...(content.image ? { image: content.image } : {}),
    // The language of the line Apple shows when the app cannot open it: decision 072.
    locale: content.locale,
  };
}
