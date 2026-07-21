// Contributor-level marks — the conventional footnote symbols (* † ‡ § ‖ ¶) used
// to annotate a contributor / author line.
//
// An item (project, blog post, publication) carries its OWN legend in a
// `contributions` map — SYMBOL → { note, people }:
//
//   "contributions": {
//     "*": { "note": "Equal contribution",    "people": ["buzz", "w-r-eck"] },
//     "†": { "note": "Corresponding author",  "people": ["buzz"] }
//   }
//
// The symbol renders as a superscript beside each listed person's name; `note` is
// the legend text surfaced on hover. `people` entries are ordinary person
// references — a registry slug or a written name, both slugified before matching,
// exactly like `collaborators` / `authors` themselves.
//
// Deliberately kept OUT of the `collaborators` / `authors` arrays: those stay
// plain string lists, so every existing resolver (resolvePeople, the credit-order
// rule, structured data) is untouched and an item with no marks costs nothing.
import { slugify } from './collaborators';

/** The conventional marks, in the order convention assigns them. */
export const MARK_SYMBOLS = ['*', '†', '‡', '§', '‖', '¶'] as const;

export interface Contribution {
  /** Legend text for this symbol ("Equal contribution") — shown on hover. */
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
// so someone carrying two marks always reads "*†", never "†*".
export function markMap(contributions?: Contributions | null): MarkMap {
  const rank = (s: string) => {
    const i = (MARK_SYMBOLS as readonly string[]).indexOf(s);
    return i === -1 ? MARK_SYMBOLS.length : i;
  };
  const out: MarkMap = {};
  for (const [symbol, c] of Object.entries(contributions ?? {}).sort(([a], [b]) => rank(a) - rank(b))) {
    for (const ref of c?.people ?? []) {
      const slug = slugify(ref);
      if (!slug) continue;
      if (!out[slug]) out[slug] = [];
      out[slug].push({ symbol, note: c?.note ?? null });
    }
  }
  return out;
}

/** The marks one person carries on an item — empty when they carry none. */
export const marksFor = (map: MarkMap | null | undefined, slug: string): MarkInfo[] =>
  (map && map[slug]) || [];

/** Plain-text form ("*†") — for contexts that can't render superscripts (the
 *  experience drawer builds its author line as an inline-markdown string). */
export const marksText = (marks: MarkInfo[]): string => marks.map(m => m.symbol).join('');
