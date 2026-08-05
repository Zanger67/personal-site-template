// Contributor-level marks — the conventional footnote symbols († ‡ § †† ‡‡ §§ * ¶)
// used to annotate a contributor / author line.
//
// An item names the LEVEL it is assigning — a slug like `equal-first` / `advisor` —
// and the symbol is looked up automatically, so no item ever writes one:
//
//   "contributions": {
//     "equal-first":   { "note": null, "people": ["buzz", "w-r-eck"] },
//     "corresponding": { "note": null, "people": ["buzz"] }
//   }
//
// What a level MEANS, and which symbol it draws, is standardised SITE-WIDE in
// src/data/contributionMarks.json (`equal-first` is always "†", wherever it
// appears), so an item only says WHO carries which level. That file's key ORDER
// is the rank order too: a name's symbols and the legend's rows both follow it.
// Adding a classification = adding an entry there, not inventing one per item.
//
// That standard wording adapts to the item: an equal-contribution tier only says
// "equal" when it actually has more than one holder, so a level carrying one name
// reads "First author" rather than "Equal first author" (see StandardMark.solo).
//
// `note` is an optional per-item OVERRIDE of the standard wording — normally null,
// so the wording stays consistent across the site. `people` entries are ordinary
// person references — a registry slug or a written name, both slugified before
// matching, exactly like `collaborators` / `authors` themselves.
//
// The symbol renders as a superscript beside each listed person's name; hovering
// the name (or its symbols) opens the item's whole legend with that person's own
// rows highlighted — see src/components/CreditMarks.astro.
//
// A people list may ALSO carry its marks inline, by writing an entry as a
// { ref: [level, …] } pair instead of a bare string (see splitPeople below) —
// the compact form for an author line, where a name and its marks read better
// together than in a separate legend. The two forms compose: inline pairs are
// lifted into the same `contributions` shape and merged with the item's own.
//
// Either way marks stay OUT of the resolvers' path: splitPeople hands every
// downstream consumer (resolvePeople, the credit-order rule, structured data) the
// same plain string list it always got, and an item with no marks costs nothing.
import { slugify } from './collaborators';
import standardMarks from '../data/contributionMarks.json';

export interface StandardMark {
  /** The footnote symbol this level draws. */
  symbol: string;
  /** The site-wide wording shown in the legend. */
  note: string;
  /** The wording when only ONE person on the item carries this level — "equal"
   *  is a claim about sharing, so a tier of one reads "First author", not "Equal
   *  first author". Omitted by a level whose wording never varies (a role mark
   *  like corresponding / advisor is the same however many people hold it). */
  solo?: string;
}

/** Site-wide level slug → { symbol, meaning }. The single source for both. */
export const STANDARD_MARKS: Record<string, StandardMark> = standardMarks;

// Written in rank order: the equal-contribution TIERS first (†, ‡, §, then doubled
// for the fourth tier on), the two role marks — corresponding author, then advisor
// — always trailing them.
export const MARK_LEVELS: string[] = Object.keys(STANDARD_MARKS);

/** The symbols those levels draw, in the same order. */
export const MARK_SYMBOLS: string[] = MARK_LEVELS.map(l => STANDARD_MARKS[l].symbol);

// A raw symbol still resolves back to its level, so hand-written or older data
// keyed "†"/"*" keeps working and lands on the same standard wording.
const levelBySymbol = new Map(MARK_LEVELS.map(l => [STANDARD_MARKS[l].symbol, l]));

/** The level a `contributions` key names — its slug, or the symbol it draws. */
export function markLevel(key: string): string | null {
  const k = key.trim();
  if (STANDARD_MARKS[k]) return k;
  const bySymbol = levelBySymbol.get(k);
  if (bySymbol) return bySymbol;
  const slug = slugify(k);
  return slug && STANDARD_MARKS[slug] ? slug : null;
}

// ── A second mark family: institutional affiliations ────────────────────────
// Author affiliations are the same idea as contributor levels — a per-item map
// from a group to the people in it, superscripted on each name with a legend
// underneath — so they render as ordinary MarkInfo and reuse everything here.
// They're built in src/utils/institutions.ts, which owns their numbering, and
// namespaced `org:<slug>` so the two families can never collide on a level.
// A name carries its contributor symbols first, then its institution numbers
// ("Buzz*¹,²") — set apart by a gap, since they answer different questions.
export const ORG_LEVEL = 'org:';
/** Is this an institution level rather than a contributor level? */
export const isOrgLevel = (level: string): boolean => level.startsWith(ORG_LEVEL);

/** The two families a mark can belong to. They render identically but are
 *  EXPLAINED separately — each surface places their legends independently
 *  (`creditLegends` in src/config/site.ts), because a standard symbol can be
 *  read without a key and an institution's emoji cannot. */
export type MarkFamily = 'contributions' | 'institutions';

/** Which family a level belongs to — the split every legend placement keys on. */
export const markFamily = (level: string): MarkFamily =>
  isOrgLevel(level) ? 'institutions' : 'contributions';

/** Two adjacent numeric marks need separating — "¹²" reads as twelve, not 1 and 2.
 *  (Only the institution family numbers its marks, so this never fires on symbols.) */
export const isNumericSymbol = (symbol: string): boolean => /^\d+$/.test(symbol);

/** The superscripts for one name, comma-joining any run of numbers: ["1", ",2", "†"]. */
export const supSymbols = (marks: MarkInfo[]): string[] =>
  marks.map((m, i) =>
    (i > 0 && isNumericSymbol(m.symbol) && isNumericSymbol(marks[i - 1].symbol) ? ',' : '') + m.symbol);

/** Where a key sits in contributionMarks.json — unrecognised keys sort last, and
 *  institution levels sort after even those: a name reads "†¹" (what, then where),
 *  so its legend has to list the contributor meanings before the institutions.
 *  Within the family the sort stays stable, which keeps them in numbering order. */
const rank = (key: string) => {
  if (isOrgLevel(key)) return MARK_LEVELS.length + 1;
  const i = MARK_LEVELS.indexOf(markLevel(key) ?? '');
  return i === -1 ? MARK_LEVELS.length : i;
};

export interface Contribution {
  /** Per-item override of the standard wording — normally null. */
  note?: string | null;
  /** The people carrying this mark (registry slugs or written names). */
  people?: string[] | null;
}
export type Contributions = Record<string, Contribution>;

/** A mark's optional icon, already resolved to what it should render as, so every
 *  renderer (card tooltip, drawer legend) just branches on `kind` — see
 *  src/utils/institutions.ts, which is the only thing that sets one today. */
export interface MarkIcon {
  kind: 'glyph' | 'image';
  value: string;
}

export interface MarkInfo {
  /** The level slug this mark assigns (`advisor`, `equal-first`, `org:mats`, …). */
  level: string;
  symbol: string;
  note: string | null;
  /** Legend-row icon, when the level has one (institutions may; contributions don't). */
  icon?: MarkIcon | null;
}

/** slug → every mark that person carries on ONE item (usually just one). */
export type MarkMap = Record<string, MarkInfo[]>;

/** One `contributions` key (+ its optional per-item note) as a renderable mark.
 *  `holders` is how many people carry this level ON THIS ITEM — a level worded
 *  as shared ("Equal first author") falls back to its `solo` wording when only
 *  one person turns out to hold it. */
export function resolveMark(key: string, note?: string | null, holders = 0): MarkInfo {
  const level = markLevel(key);
  const std = level ? STANDARD_MARKS[level] : null;
  const standard = std ? (holders === 1 && std.solo ? std.solo : std.note) : null;
  return {
    level: level ?? key,
    // An unrecognised key still renders — it's taken as a literal symbol, which
    // makes a typo'd level visible, and only the item's own `note` explains it.
    symbol: std ? std.symbol : key,
    note: (note ?? null) || standard,
  };
}

// Invert an item's `contributions` legend into a per-person lookup. Levels are
// ordered by contributionMarks.json rather than by however the keys happened to be
// written, so someone carrying two marks always reads "†*", never "*†".
export function markMap(contributions?: Contributions | null): MarkMap {
  const entries = Object.entries(contributions ?? {}).sort(([a], [b]) => rank(a) - rank(b));
  // How many DISTINCT people hold each level, tallied before anything resolves:
  // it decides whether the level reads as shared ("Equal first author") or solo
  // ("First author"). Counted per level, not per key, so two keys naming the same
  // level (its slug and its symbol) are one tier, and a person named twice is one
  // holder — the same de-duping the render pass below does.
  const holders: Record<string, Set<string>> = {};
  for (const [key, c] of entries) {
    const level = markLevel(key) ?? key;
    const set = holders[level] ?? (holders[level] = new Set());
    for (const ref of c?.people ?? []) {
      const slug = slugify(ref);
      if (slug) set.add(slug);
    }
  }
  const out: MarkMap = {};
  for (const [key, c] of entries) {
    const mark = resolveMark(key, c?.note, holders[markLevel(key) ?? key]?.size ?? 0);
    for (const ref of c?.people ?? []) {
      const slug = slugify(ref);
      if (!slug) continue;
      const marks = out[slug] ?? (out[slug] = []);
      // One level can reach the same person twice — an inline pair repeating what
      // the item's own `contributions` already said, or a legend keyed by symbol
      // AND by slug. Nobody should render "††" for a single level.
      if (marks.some(m => m.level === mark.level)) continue;
      marks.push(mark);
    }
  }
  return out;
}

/** The marks one person carries on an item — empty when they carry none. */
export const marksFor = (map: MarkMap | null | undefined, slug: string): MarkInfo[] =>
  (map && map[slug]) || [];

// An item's whole legend, built from the marks its people actually carry — a
// level nobody carries has nothing to explain, so this needs no extra plumbing:
// anywhere a credit line can render marks, it can also derive the legend.
export function legendOf(lists: (MarkInfo[] | null | undefined)[]): MarkInfo[] {
  const seen = new Map<string, MarkInfo>();
  for (const marks of lists) {
    for (const m of marks ?? []) if (!seen.has(m.level)) seen.set(m.level, m);
  }
  return [...seen.values()].sort((a, b) => rank(a.level) - rank(b.level));
}

/** Same, straight off a MarkMap. */
export const legendFromMap = (map: MarkMap | null | undefined): MarkInfo[] =>
  legendOf(Object.values(map ?? {}));

/** Union of several per-person mark maps. The two families are built separately —
 *  contributor levels here, institutions in src/utils/institutions.ts — but a name
 *  renders ONE list of superscripts, so a surface showing both hands them over as
 *  a single map (the alternative, threading two maps to every call site, is what
 *  works.ts does because its card places the families' legends independently).
 *  Rank-ordered per person, so contributor symbols precede institution numbers,
 *  and a level reaching someone twice is kept once. */
export function mergeMarkMaps(...maps: (MarkMap | null | undefined)[]): MarkMap {
  const out: MarkMap = {};
  for (const map of maps) {
    for (const [slug, marks] of Object.entries(map ?? {})) {
      const cur = out[slug] ?? (out[slug] = []);
      for (const m of marks ?? []) if (!cur.some(x => x.level === m.level)) cur.push(m);
    }
  }
  // Stable sort, so institutions keep their numbering order within the family.
  for (const marks of Object.values(out)) marks.sort((a, b) => rank(a.level) - rank(b.level));
  return out;
}

// ── People lists that carry their marks inline ──────────────────────────────
// An entry in a people list (a publication's `authors`) is EITHER a plain
// reference or a one-pair object mapping that reference to the levels it carries:
//
//   "authors": ["buzz", { "w-r-eck": ["equal-first", "corresponding"] }, "a-t-lanta"]
//
// Equivalent to naming the same people under the item's `contributions` map, and
// the two may be mixed freely — this is a way of WRITING the legend, not a second
// mechanism. The value is a list because one person can hold several levels; a
// bare string is accepted as the one-level shorthand. Levels are the usual keys
// (slug or symbol), so an unknown one still renders verbatim, exactly as in a map.

/** One entry of a people list: a reference, or a { reference: levels } pair. */
export type PersonEntry = string | Record<string, string | string[] | null>;

export interface SplitPeople {
  /** The plain references, in list order — what resolvePeople() consumes. */
  refs: string[];
  /** The legend the inline pairs declare, in the `contributions` shape. */
  contributions: Contributions;
}

/** Split a people list into its plain references + the marks written inline. */
export function splitPeople(entries?: PersonEntry[] | null): SplitPeople {
  const refs: string[] = [];
  const contributions: Contributions = {};
  for (const entry of entries ?? []) {
    if (typeof entry === 'string') { refs.push(entry); continue; }
    if (!entry || typeof entry !== 'object') continue;
    // Normally one pair per entry; several are read in key order, so
    // { "buzz": [...], "w-r-eck": [...] } credits Buzz then Eck, in place.
    for (const [ref, levels] of Object.entries(entry)) {
      if (!ref.trim()) continue;
      refs.push(ref);
      for (const level of Array.isArray(levels) ? levels : [levels]) {
        const key = typeof level === 'string' ? level.trim() : '';
        if (!key) continue;
        const c = contributions[key] ?? (contributions[key] = { note: null, people: [] });
        c.people!.push(ref);
      }
    }
  }
  return { refs, contributions };
}

/** Just the references — for the call sites that render names but no marks. */
export const peopleRefs = (entries?: PersonEntry[] | null): string[] => splitPeople(entries).refs;

/** Union of several legends (an item's own `contributions` + its inline pairs).
 *  A level named twice keeps the first note and concatenates its people; markMap
 *  de-dupes from there, so overlap between the two forms is harmless. */
export function mergeContributions(...maps: (Contributions | null | undefined)[]): Contributions {
  const out: Contributions = {};
  for (const map of maps) {
    for (const [key, c] of Object.entries(map ?? {})) {
      const cur = out[key] ?? (out[key] = { note: null, people: [] });
      if (cur.note == null && c?.note != null) cur.note = c.note;
      cur.people = [...(cur.people ?? []), ...(c?.people ?? [])];
    }
  }
  return out;
}

/** A people list resolved against BOTH mark sources: its plain references, plus
 *  the per-person marks from the inline pairs and the item's `contributions`. */
export function peopleMarks(
  entries?: PersonEntry[] | null,
  contributions?: Contributions | null,
): { refs: string[]; marks: MarkMap } {
  const split = splitPeople(entries);
  return { refs: split.refs, marks: markMap(mergeContributions(contributions, split.contributions)) };
}
