// Institutional affiliations of the people credited on an item — the numbered
// superscripts a paper prints on its author line ("Buzz¹,², W. R. Eck³").
//
// Structurally this is the SAME thing as a contributor-level mark (see marks.ts):
// a per-item map from a group to the people in it, superscripted on each name with
// a legend underneath. Two differences, and they're why it lives in its own module:
//   • the groups aren't a fixed site-wide table but a REGISTRY that grows
//     (src/data/institutions.json), exactly like the people registry;
//   • papers NUMBER them (1, 2, 3) rather than symbol them († ‡ §), and those
//     numbers are per-item — assigned by order of first appearance in the author
//     list — so they're derived here and never written into the data.
//
// An item writes its map keyed by INSTITUTION, the inverse of how it's read:
//
//   "authorAffiliations": {
//     "georgia-tech":    ["buzz", "w-r-eck"],
//     "yellow-jacket-labs": ["buzz"]
//   }
//
// One person may appear under several (a scholar listing a programme AND their home
// university) — they carry every number they're given, comma-joined by supSymbols.
// Keys and people are both forgiving references: an institution may be named by
// slug or by name, a person by slug or written name, all slugified before lookup.
//
// Both families produce plain MarkInfo, so nothing downstream needs to know which is
// which: a name's marks are simply [...affiliations, ...contributions], and the
// legend derivation, the serialization into the timeline dataset, CreditMarks and
// the drawer's static legend all work unchanged.
//
// A SINGLE-institution item numbers NOTHING. A paper whose authors all sit in one
// place doesn't print a "1" against every name, and the item's own `affiliations`
// chips already say where the work was done — so the numbering only appears once
// there's actually something to tell apart.
//
// ── Icons ───────────────────────────────────────────────────────────────────
// An institution may carry an `icon`, shown at the head of its legend row. The
// single `icon` field decides its own KIND, so there's no second field to keep in
// sync and no per-call-site guessing:
//
//   "icon": "🐝"                    → a glyph  (emoji, or a short text mark)
//   "icon": "/icons/gatech.svg"     → an image (a path under public/, or a URL)
//   "icon": null                    → no icon  (the default)
//
// The rule is the leading characters: a value starting with `/`, `./`, `data:` or
// `http(s)://` is a source to load, anything else is text to print. Both forms are
// resolved ONCE here (institutionIcon) into a { kind, value } that every renderer
// just branches on — the client-side drawer included, which has no imports.
//
// Deliberately NOT derived from `url` through a favicon service: that would put a
// third-party request on every page crediting a paper, which this site's cookieless,
// no-third-party analytics stance rules out. Icons are opt-in, per institution.
import { institutionLegendNames, showAuthorInstitutions } from '@config/site';
import { slugify, fallbackName } from './collaborators';
import { ORG_LEVEL, type MarkIcon, type MarkInfo, type MarkMap } from './marks';
import institutions from '../data/institutions.json';

export interface Institution {
  /** Full institution name — what a paper's affiliation block would print. */
  name: string;
  /** Compact form, for when the full name is unwieldy ("UIUC"). Printed in the
   *  legend only under `authorInstitutions.legendNames: 'short'`. */
  short?: string | null;
  /** Homepage. Stored so a legend row can be linked later; nothing links it today. */
  url?: string | null;
  /** Legend-row icon — see the icon section above. */
  icon?: string | null;
}

/** Site-wide institution slug → institution. The single source, like the people registry. */
export const INSTITUTIONS: Record<string, Institution> = institutions;

/** An item's map of institution → the credited people sitting in it. */
export type AuthorAffiliations = Record<string, string[] | null>;

export interface ResolvedInstitution {
  slug: string;
  /** Full name — for anything that wants it spelled out (aria, structured data). */
  name: string;
  /** What the legend prints — the full name by default, the short form (falling
   *  back to the full one) under `authorInstitutions.legendNames: 'short'`. */
  display: string;
  url: string | null;
  icon: MarkIcon | null;
}

/** Which kind of icon a raw `icon` value names — see the icon section above. */
export function institutionIcon(icon?: string | null): MarkIcon | null {
  const v = (icon ?? '').trim();
  if (!v) return null;
  return /^(\.?\/|data:|https?:\/\/)/.test(v) ? { kind: 'image', value: v } : { kind: 'glyph', value: v };
}

/** Resolve one institution reference. An unregistered one still renders — its slug
 *  humanized, exactly as an unregistered person does — rather than vanishing. */
export function institutionInfo(ref: string): ResolvedInstitution {
  const slug = slugify(ref);
  const info = INSTITUTIONS[slug];
  const name = info?.name || fallbackName(ref);
  return {
    slug,
    name,
    // One choke point for the name form, so every legend that exists — aside,
    // below, popup, drawer — says the same thing about the same institution.
    display: institutionLegendNames() === 'short'
      ? (info?.short || '').trim() || name
      : name,
    url: info?.url || null,
    icon: institutionIcon(info?.icon),
  };
}

export interface AffiliationMarks {
  /** person slug → the institution marks they carry (usually one). */
  marks: MarkMap;
  /** The item's institution legend, in numbering order. */
  legend: MarkInfo[];
}

const EMPTY: AffiliationMarks = { marks: {}, legend: [] };

/**
 * Number an item's institutions and hand each credited person their marks.
 *
 * `refs` is the author list IN ORDER (what peopleMarks/splitPeople already hands
 * back), which is what makes the numbering deterministic: institutions are numbered
 * by first appearance, so reordering the authors renumbers them and nobody ever
 * writes a number down. A person in two institutions takes them in the order the
 * item's map declares.
 */
export function affiliationMarks(
  refs?: string[] | null,
  affiliations?: AuthorAffiliations | null,
): AffiliationMarks {
  // One choke point for the master switch: with no marks to hand out, every
  // consumer — names, legends, the drawer, the card's key — falls silent on its
  // own, and the item's data is left untouched for when it's switched back on.
  if (!showAuthorInstitutions()) return EMPTY;
  const entries = Object.entries(affiliations ?? {});
  if (!entries.length || !refs?.length) return EMPTY;

  // institution slug → the people in it, and the map's own key order for the
  // people who belong to more than one.
  const order: string[] = [];
  const members = new Map<string, Set<string>>();
  for (const [ref, people] of entries) {
    const slug = slugify(ref);
    if (!slug) continue;
    let set = members.get(slug);
    if (!set) { set = new Set(); members.set(slug, set); order.push(slug); }
    for (const person of people ?? []) {
      const p = slugify(person);
      if (p) set.add(p);
    }
  }

  // Mark each institution, in order of first appearance in the author list. One
  // named in the map but carrying nobody on this item is never marked — a legend
  // row nobody holds explains nothing (the same rule legendOf follows for
  // contributor marks).
  const marked = new Map<string, MarkInfo>();
  let n = 0;
  for (const ref of refs) {
    const person = slugify(ref);
    if (!person) continue;
    for (const slug of order) {
      if (marked.has(slug) || !members.get(slug)?.has(person)) continue;
      const info = institutionInfo(slug);
      // A glyph icon IS the mark — that's what an institution's emoji is for.
      // Anything without one falls back to a NUMBER, the way a paper does it, and
      // the counter only advances for those so they still read 1, 2, 3… An image
      // icon can't sit in a text superscript, so it takes a number too and stays
      // in the legend row instead.
      const glyph = info.icon?.kind === 'glyph' ? info.icon.value : null;
      marked.set(slug, {
        level: `${ORG_LEVEL}${slug}`,
        symbol: glyph ?? String(++n),
        note: info.display,
        // A glyph is already the symbol; printing it in the row too would double it.
        icon: glyph ? null : info.icon,
      });
    }
  }
  // Nothing to tell apart — one institution (or none) marks nothing. See above.
  if (marked.size < 2) return EMPTY;

  const marks: MarkMap = {};
  for (const [slug, mark] of marked) {
    for (const person of members.get(slug) ?? []) {
      (marks[person] ??= []).push(mark);
    }
  }
  return { marks, legend: [...marked.values()] };
}
