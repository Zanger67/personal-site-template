// Contributor-level marks — the conventional footnote symbols († ‡ § †† ‡‡ §§ * ¶)
// used to annotate a contributor / author line.
//
// What each symbol MEANS is standardised SITE-WIDE in src/data/contributionMarks.json
// (`†` is always the first equal-contribution tier, wherever it appears), so an item
// only says WHO carries which symbol:
//
//   "contributions": {
//     "†": { "note": null, "people": ["buzz", "w-r-eck"] },
//     "*": { "note": null, "people": ["buzz"] }
//   }
//
// `note` is an optional per-item OVERRIDE of the standard meaning — normally null,
// so the wording stays consistent across the site. `people` entries are ordinary
// person references — a registry slug or a written name, both slugified before
// matching, exactly like `collaborators` / `authors` themselves.
//
// The symbol renders as a superscript beside each listed person's name; hovering
// the name (or its symbols) opens the item's whole legend with that person's own
// rows highlighted — see src/components/CreditMarks.astro.
//
// Deliberately kept OUT of the `collaborators` / `authors` arrays: those stay
// plain string lists, so every existing resolver (resolvePeople, the credit-order
// rule, structured data) is untouched and an item with no marks costs nothing.
import { slugify } from './collaborators';
import standardMarks from '../data/contributionMarks.json';

// Equal-contribution TIERS first (†, ‡, §, then doubled for the fourth tier on),
// so a name's symbols and the legend both read in rank order; the two role marks
// — corresponding author, then advisor — always trail them.
export const MARK_SYMBOLS = ['†', '‡', '§', '††', '‡‡', '§§', '*', '¶'] as const;

/** Site-wide symbol → meaning table. The single source for what a mark says. */
export const STANDARD_MARKS: Record<string, string> = standardMarks;

/** Where a symbol sits in MARK_SYMBOLS — unknown symbols sort last. */
const rank = (s: string) => {
  const i = (MARK_SYMBOLS as readonly string[]).indexOf(s);
  return i === -1 ? MARK_SYMBOLS.length : i;
};

/** A symbol's wording: the item's own override first, else the site standard. */
export const markMeaning = (symbol: string, note?: string | null): string | null =>
  (note ?? null) || STANDARD_MARKS[symbol] || null;

export interface Contribution {
  /** Per-item override of the standard wording — normally null. */
  note?: string | null;
  /** The people carrying this mark (registry slugs or written names). */
  people?: string[] | null;
}
export type Contributions = Record<string, Contribution>;

export interface MarkInfo {
  symbol: string;
  note: string | null;
}

/** slug → every mark that person carries on ONE item (usually just one). */
export type MarkMap = Record<string, MarkInfo[]>;

// Invert an item's `contributions` legend into a per-person lookup. Symbols are
// ordered by MARK_SYMBOLS rather than by however the keys happened to be written,
// so someone carrying two marks always reads "†*", never "*†".
export function markMap(contributions?: Contributions | null): MarkMap {
  const out: MarkMap = {};
  for (const [symbol, c] of Object.entries(contributions ?? {}).sort(([a], [b]) => rank(a) - rank(b))) {
    for (const ref of c?.people ?? []) {
      const slug = slugify(ref);
      if (!slug) continue;
      if (!out[slug]) out[slug] = [];
      out[slug].push({ symbol, note: markMeaning(symbol, c?.note) });
    }
  }
  return out;
}

/** The marks one person carries on an item — empty when they carry none. */
export const marksFor = (map: MarkMap | null | undefined, slug: string): MarkInfo[] =>
  (map && map[slug]) || [];

// An item's whole legend, built from the marks its people actually carry — a
// symbol nobody carries has nothing to explain, so this needs no extra plumbing:
// anywhere a credit line can render marks, it can also derive the legend.
export function legendOf(lists: (MarkInfo[] | null | undefined)[]): MarkInfo[] {
  const seen = new Map<string, MarkInfo>();
  for (const marks of lists) {
    for (const m of marks ?? []) if (!seen.has(m.symbol)) seen.set(m.symbol, m);
  }
  return [...seen.values()].sort((a, b) => rank(a.symbol) - rank(b.symbol));
}

/** Same, straight off a MarkMap. */
export const legendFromMap = (map: MarkMap | null | undefined): MarkInfo[] =>
  legendOf(Object.values(map ?? {}));

/** Plain-text form ("†*") — for contexts that can't render superscripts (the
 *  experience drawer builds its author line as an inline-markdown string). */
export const marksText = (marks: MarkInfo[]): string => marks.map(m => m.symbol).join('');
