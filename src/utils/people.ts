// People aggregation for the /collaborators page.
//
// Every person who appears as a co-author / collaborator anywhere on the site is
// gathered into a single per-person record: the works we did together, any of my
// experience roles/periods they're attached to, their profile links + institutional
// affiliations, and a DETERMINISTIC year label aggregated from all of the above.
//
// Sources of a person's "years" (all merged into one label + sort key):
//   • projects   — collaborators[], years = start..end (open end → current year)
//   • publications — authors[],      years = publication year
//   • blog posts — collaborators[],  years = post year
//   • roles/periods — a role (or org membership) with a `collaborators` list,
//                     years = the role/membership date range (the "attach a person
//                     to periods and roles" method; rendered as a separate section)
//   • manual `years` on their profile (collaborators.json) — free specs that let a
//                     profile-only person (no shared works) still carry a timeframe.
//
// Ordering: people WITH dates first, most-recent collaboration first (then most
// works, then name); people with a profile but NO dates sink to the bottom (A–Z).
// "Most recent" is keyed on each contribution's START — a date RANGE counts as its
// earlier endpoint. So someone with items in May 2025, Dec 2025 – Mar 2026, Jul
// 2023 and Feb 2026 is ordered on Feb 2026 (not the Mar 2026 range end), while
// their label still spans the lot as ’23–’26.
// Self (profile.self) is excluded from the list and flagged in each author line so
// the page can bold my name and accent-highlight the row's collaborator.
import { getCollection } from 'astro:content';
import { isRouteEnabled } from '@config/site';
import { slugify, fallbackName, isSelfSlug } from './collaborators';
import { KIND_CAT, fmtMonthYear, fmtFullDate, fmtPubDate, type WorkKind } from './works';
import { extraLinks, knownHostLabel, type Link } from './links';
import { markMap, type MarkMap } from './marks';
import registryData from '../data/collaborators.json';
import organizations from '../data/organizations.json';
import affiliations from '../data/affiliations.json';
import publications from '../data/publications.json';
import profile from '../data/profile.json';

const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
const CURRENT_YEAR = new Date().getFullYear();

interface RegistryEntry {
  'display-name'?: string | null;
  url?: string | null;
  urls?: Record<string, string> | null;
  affiliations?: (string | { name: string; url?: string | null })[] | null;
  years?: string[] | null;
  // Include this person on the /collaborators page. OPT-IN: defaults to false, so a
  // profile is listed only when this is explicitly `true`. Always write it out rather
  // than leaning on the default. Purely a listing switch — it does NOT affect how the
  // person renders anywhere else (work cards, author lines, friends all go through
  // resolvePeople, which ignores it).
  listed?: boolean | null;
  // Manual rank used to BREAK TIES in the ordering — LOWER shows first (0 before 2),
  // default 0. It does not override the primary "most recent first" sort; it only
  // settles people the sort would otherwise consider equal (same latest year, or the
  // dateless group where everything ties). Always write it out rather than leaning on
  // the default.
  priority?: number | null;
}
const registry = registryData as Record<string, RegistryEntry>;

// Who is "me" — excluded from the collaborators list and bolded in author lines.
// profile.self is the canonical owner slug; the display name/full name slugify in
// as aliases so an author written either way still resolves to self.
// (Defined in ./collaborators alongside slugify — the shared home for person-ref
// helpers, so resolvePeople can drop me from a project's "Collaborators" line too.)
export { isSelfSlug };

// ── Year helpers ────────────────────────────────────────────────────────────

// Abbreviated, deterministic year label: a SINGLE oldest–newest span — gaps are
// NOT listed out. "’19–present" / "’19–23" / "’22" (single year). The newest year
// renders as "present" when it's the current year; the others are a two-digit
// "’YY" (the range end drops the apostrophe: "’19–23").
export function formatYearRanges(years: number[]): string {
  if (!years.length) return '';
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  const start = (y: number) => (y === CURRENT_YEAR ? 'present' : `’${yy(y)}`);
  const end = (y: number) => (y === CURRENT_YEAR ? 'present' : yy(y));
  return lo === hi ? start(lo) : `${start(lo)}–${end(hi)}`;
}

// Inclusive integer range lo..hi (order-insensitive).
const expandRange = (lo: number, hi: number): number[] => {
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
};

// First 4 digits of a loose date string ("2025", "2025-06", …) → year, or null.
const yearOf = (v?: string | null): number | null => {
  if (!v) return null;
  const y = parseInt(String(v).slice(0, 4), 10);
  return Number.isNaN(y) ? null : y;
};

// A loose start/end pair → the inclusive set of years it spans. An open end runs
// to the current year; a start-less range collapses to just the end year.
const rangeYears = (start?: string | null, end?: string | null): number[] => {
  const s = yearOf(start);
  if (s == null) {
    const e = yearOf(end);
    return e == null ? [] : [e];
  }
  return expandRange(s, yearOf(end) ?? CURRENT_YEAR);
};

// A manual profile spec ("2019", "2022-2024", "2024–present") → year set. Accepts
// hyphen/en/em dashes; "present"/"now"/"current" (or a missing end) → current year.
const expandYearSpec = (spec: string): number[] => {
  const parts = String(spec).trim().split(/\s*[–—-]\s*/);
  const s = parseInt(parts[0], 10);
  if (Number.isNaN(s)) return [];
  if (parts.length === 1) return [s];
  const raw = parts[1];
  const e = raw === '' || /present|now|current/i.test(raw) ? CURRENT_YEAR : parseInt(raw, 10);
  return Number.isNaN(e) ? [s] : expandRange(s, e);
};

// Loose "YYYY-MM"/"YYYY" → ms, for chronological sort (year-only → January).
const looseMs = (v?: string | null): number => {
  if (!v) return 0;
  const [y, m] = String(v).split('-');
  return new Date(parseInt(y, 10), m ? parseInt(m, 10) - 1 : 0).valueOf();
};

// A loose start/end pair → a display range. Open end reads "– Present".
const fmtRange = (start?: string | null, end?: string | null): string => {
  if (!start && !end) return '';
  if (start && !end) return `${fmtPubDate(start)} – Present`;
  if (!start && end) return fmtPubDate(end);
  return `${fmtPubDate(start!)} – ${fmtPubDate(end!)}`;
};

// ── Display shapes ──────────────────────────────────────────────────────────

export interface Author {
  slug: string;
  name: string;
  url: string | null;
  isSelf: boolean;
}
export interface PersonWork {
  kind: WorkKind;
  title: string;
  href: string | null;
  external: boolean;
  dateLabel: string;
  meta: string | null;        // role · venue (or role) — the italic subtitle
  color: string;
  sortDate: number;
  authors: Author[];          // full ordered line incl. self, for highlighting
  links: Link[];              // Live / Repo / … chips — same set as the Works page
  years: number[];
  marks: MarkMap;             // this item's contributor-level marks, by slug
}
export interface PersonRole {
  title: string;              // "Role · OrgShort" / "OrgShort · Member"
  dateLabel: string;
  color: string;
  sortDate: number;
  years: number[];
}
export interface CollaboratorEntry {
  slug: string;
  name: string;
  url: string | null;
  links: { label: string; url: string }[];              // the dropdown's link line
  affiliations: { name: string; url: string | null }[]; // institutional
  years: number[];
  yearLabel: string;
  hasDates: boolean;
  works: PersonWork[];
  roles: PersonRole[];
  count: number;
  lastYear: number;
  // Sort key: the person's MOST RECENT start (ms, month-granular). Every
  // contribution is scored by where it BEGAN — a range counts as its earlier
  // endpoint — so an item running Dec 2025 – Mar 2026 scores Dec 2025 and loses
  // to a Feb 2026 one. Ordering stays most-recent-first; only the display label
  // spans the full oldest–newest range. See the header note.
  recentStart: number;
  priority: number;           // manual tiebreak rank, LOWER first (default 0)
}

// Resolve a ref (slug or name) to an author record, tagging self.
const toAuthor = (ref: string): Author => {
  const slug = slugify(ref);
  const info = registry[slug];
  return {
    slug,
    name: (info && info['display-name']) || fallbackName(ref),
    url: (info && info.url) || null,
    isSelf: isSelfSlug(slug),
  };
};

// Credit line for a project / blog post. I lead by default — but if the item's own
// `collaborators` list already names me, its ORDER is honoured verbatim, which is how
// you credit people in a specific sequence ("W. R. Eck, A. T. Lanta, me" vs "A. T.
// Lanta, me, Buzz Jr").
// Publications already behave this way, since their `authors` list always includes me.
// The detail pages pass `excludeSelf` to resolvePeople so their "Collaborators" line
// still credits only the other people.
const creditLine = (refs: string[] | undefined | null, selfRef: string): string[] => {
  const list = refs ?? [];
  return list.some(r => isSelfSlug(slugify(r))) ? list : [selfRef, ...list];
};

// Timeline category → dot colour (mirrors CATEGORIES in experience.astro / works.ts).
const CAT_COLOR: Record<string, string> = {
  education: '#5b8def',
  work: 'var(--accent)',
  research: '#a06fd6',
  awards: '#d4a017',
  projects: '#e0883c',
  clubs: '#e06c84',
  misc: '#3aa6ad',
};

// Keep the first link per URL — mirrors dedupeLinks in works.astro so an explicit
// Live/Repo link isn't repeated by a `urls` entry pointing at the same place.
const dedupeLinks = (links: Link[]): Link[] => {
  const seen = new Set<string>();
  return links.filter(l => (seen.has(l.url) ? false : (seen.add(l.url), true)));
};

// ── Works ───────────────────────────────────────────────────────────────────

async function collectWorks(): Promise<PersonWork[]> {
  const out: PersonWork[] = [];
  const selfRef = (profile as any).self ?? (profile as any).name;

  if (isRouteEnabled('projects')) {
    for (const e of await getCollection('projects')) {
      const d = e.data;
      out.push({
        kind: 'Project',
        title: d.title,
        href: `${base}/projects/${e.id}`,
        external: false,
        dateLabel: d.endDate
          ? `${fmtMonthYear(d.startDate)} – ${fmtMonthYear(d.endDate)}`
          : `${fmtMonthYear(d.startDate)} – Present`,
        meta: null,             // no role ("Data Lead"/…) on the collaborators list
        color: KIND_CAT.Project,
        sortDate: d.startDate.valueOf(),
        authors: creditLine(d.collaborators, selfRef).map(toAuthor),
        links: dedupeLinks([
          ...(d.url ? [{ label: 'Live', url: d.url }] : []),
          ...(d.repo ? [{ label: 'Repo', url: d.repo }] : []),
          ...(d.template ? [{ label: 'Template', url: d.template }] : []),
          ...(d.sample ? [{ label: 'Sample', url: d.sample }] : []),
          ...extraLinks(d.urls),
          ...extraLinks(d.features),
        ]),
        years: expandRange(d.startDate.getFullYear(), d.endDate ? d.endDate.getFullYear() : CURRENT_YEAR),
        marks: markMap((d as any).contributions),
      });
    }
  }

  if (isRouteEnabled('publications')) {
    for (const pub of publications as any[]) {
      const yr = yearOf(String(pub.date));
      out.push({
        kind: 'Publication',
        title: pub.title,
        href: pub.url || `${base}/works#publications`,
        external: !!pub.url,
        dateLabel: fmtPubDate(String(pub.date)),
        meta: pub.venue ?? null,   // venue only — no authorship role ("Lead author"/…)
        color: KIND_CAT.Publication,
        sortDate: new Date(pub.date).valueOf(),
        authors: (pub.authors ?? []).map(toAuthor),   // authors already include self
        links: dedupeLinks([...extraLinks(pub.urls), ...extraLinks(pub.features)]),
        years: yr == null ? [] : [yr],
        marks: markMap(pub.contributions),
      });
    }
  }

  if (isRouteEnabled('blog')) {
    for (const e of (await getCollection('blog')).filter(p => !p.data.draft)) {
      const d = e.data;
      out.push({
        kind: 'Blog',
        title: d.title,
        href: `${base}/blog/${e.id}`,
        external: false,
        dateLabel: fmtFullDate(d.date),
        meta: null,             // no role on the collaborators list
        color: KIND_CAT.Blog,
        sortDate: d.date.valueOf(),
        authors: creditLine(d.collaborators, selfRef).map(toAuthor),
        links: dedupeLinks([...extraLinks(d.urls), ...extraLinks(d.features)]),
        years: [d.date.getFullYear()],
        marks: markMap((d as any).contributions),
      });
    }
  }

  return out;
}

// ── Roles / periods ─────────────────────────────────────────────────────────
// A role (or an org's membership window) may carry a `collaborators` list — the
// "attach a person to periods and roles" method. Each becomes a PersonRole on the
// listed people, shown in a separate dropdown section and merged into their years.
//
// An entry is either a bare slug/name — which inherits MY role's title + dates — or
// an object `{ slug, role?, start?, end? }` carrying THAT PERSON's own title and
// involvement window. Reach for the object form whenever their span differs from
// mine (a professor who taught one term of a course I TA'd for two years; a PI who
// joined partway through). It drives both their row's label AND their year total,
// so a role of mine that is wider than their involvement no longer inflates their
// dates — the bare-slug form has no way to narrow them.

// A collaborator reference on a role or an org.
type CollabRef =
  | string
  | { slug?: string; name?: string; role?: string; start?: string | null; end?: string | null };

interface Role { role?: string; roleDetail?: string; start?: string | null; end?: string | null; categories?: string[]; collaborators?: CollabRef[] }
interface OrgLike {
  organization: string;
  organizationShort?: string;
  categories?: string[];
  collaborators?: CollabRef[];
  membership?: { start?: string | null; end?: string | null };
  roles?: Role[];
}

const refSlug = (c: CollabRef): string =>
  slugify(typeof c === 'string' ? c : (c.slug ?? c.name ?? ''));

// One person's row. An object entry overrides the title (via `role`) and — if it
// specifies EITHER endpoint — the whole range. A half-given range reads as open
// (missing end → null → "Present") rather than silently falling back to my dates,
// so `{ start: "2026-01" }` means "from Jan 2026 onwards", not "…until my role ended".
const mkPersonRole = (
  c: CollabRef,
  fallbackTitle: string,
  short: string,
  color: string,
  fbStart?: string | null,
  fbEnd?: string | null,
): PersonRole => {
  const o = typeof c === 'string' ? {} : c;
  const ownRange = o.start !== undefined || o.end !== undefined;
  const start = ownRange ? (o.start ?? null) : fbStart;
  const end = ownRange ? (o.end ?? null) : fbEnd;
  return {
    title: o.role ? `${o.role} · ${short}` : fallbackTitle,
    dateLabel: fmtRange(start, end),
    color,
    sortDate: looseMs(start ?? end),
    years: rangeYears(start, end),
  };
};

function collectRoles(): { slug: string; role: PersonRole }[] {
  const rows: { slug: string; role: PersonRole }[] = [];
  const emit = (people: CollabRef[] | undefined, mk: (c: CollabRef) => PersonRole) => {
    for (const c of people ?? []) {
      const slug = refSlug(c);
      if (slug && !isSelfSlug(slug)) rows.push({ slug, role: mk(c) });
    }
  };
  const walk = (orgs: OrgLike[], defaultColor: string) => {
    for (const org of orgs) {
      const short = org.organizationShort || org.organization;
      for (const r of org.roles ?? []) {
        if (!(r.collaborators?.length)) continue;
        const color = CAT_COLOR[(r.categories ?? org.categories ?? [])[0]] ?? defaultColor;
        emit(r.collaborators, c =>
          mkPersonRole(c, `${r.roleDetail ?? r.role} · ${short}`, short, color, r.start, r.end));
      }
      if (org.collaborators?.length) {
        const color = CAT_COLOR[(org.categories ?? [])[0]] ?? defaultColor;
        emit(org.collaborators, c =>
          mkPersonRole(c, `${short} · Member`, short, color, org.membership?.start, org.membership?.end));
      }
    }
  };
  walk(organizations as OrgLike[], CAT_COLOR.clubs);
  walk(affiliations as OrgLike[], CAT_COLOR.work);
  return rows;
}

// ── Assembly ────────────────────────────────────────────────────────────────

// The link line shown in a person's dropdown: their primary `url` as "Website"
// (if any), then every labelled `urls` entry — deduped by URL.
function buildLinks(info?: RegistryEntry): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  const push = (label: string, url?: string | null) => {
    if (url && !seen.has(url)) { seen.add(url); links.push({ label, url }); }
  };
  // "Website" is only the FALLBACK label — a primary `url` pointing at a known
  // platform is labelled with that platform instead (a LinkedIn reads "LinkedIn").
  push(info?.url ? (knownHostLabel(info.url) ?? 'Website') : 'Website', info?.url);
  for (const [label, url] of Object.entries(info?.urls ?? {})) push(label, url);
  return links;
}

function normAffils(info?: RegistryEntry): { name: string; url: string | null }[] {
  return (info?.affiliations ?? []).map(a =>
    typeof a === 'string' ? { name: a, url: null } : { name: a.name, url: a.url ?? null });
}

export async function getCollaborators(): Promise<CollaboratorEntry[]> {
  // `years` drives the DISPLAY label (the full oldest–newest span); `starts`
  // drives the ORDER (each contribution scored by where it began — see below).
  interface Acc { works: PersonWork[]; roles: PersonRole[]; years: number[]; starts: number[] }
  const acc = new Map<string, Acc>();
  const ensure = (slug: string): Acc => {
    let a = acc.get(slug);
    if (!a) { a = { works: [], roles: [], years: [], starts: [] }; acc.set(slug, a); }
    return a;
  };

  // Works — bucket each into every non-self author's record. `sortDate` is already
  // the item's START (a project's startDate; a publication/post's single date).
  for (const w of await collectWorks()) {
    for (const a of w.authors) {
      if (a.isSelf) continue;
      const rec = ensure(a.slug);
      rec.works.push(w);
      rec.years.push(...w.years);
      rec.starts.push(w.sortDate);
    }
  }

  // Roles/periods — `sortDate` is likewise the role's start.
  for (const { slug, role } of collectRoles()) {
    const rec = ensure(slug);
    rec.roles.push(role);
    rec.years.push(...role.years);
    rec.starts.push(role.sortDate);
  }

  // Seed every registry profile (minus self) so profile-only people appear too,
  // and fold in their manual `years` (a spec's start = its earliest year).
  for (const slug of Object.keys(registry)) {
    if (isSelfSlug(slug)) continue;
    const rec = ensure(slug);
    for (const spec of registry[slug].years ?? []) {
      const ys = expandYearSpec(spec);
      if (!ys.length) continue;
      rec.years.push(...ys);
      rec.starts.push(looseMs(String(Math.min(...ys))));
    }
  }

  // Opt-in gate: only profiles explicitly flagged `listed: true` are shown. An
  // unflagged profile — or a name a work references with no registry entry at all —
  // is still aggregated above, just not listed here.
  const entries: CollaboratorEntry[] = [...acc.entries()]
    .filter(([slug]) => registry[slug]?.listed === true)
    .map(([slug, a]) => {
    const info = registry[slug];
    const years = [...new Set(a.years)].sort((x, y) => x - y);
    return {
      slug,
      name: (info && info['display-name']) || fallbackName(slug),
      url: (info && info.url) || null,
      links: buildLinks(info),
      affiliations: normAffils(info),
      years,
      yearLabel: formatYearRanges(years),
      hasDates: years.length > 0,
      works: a.works.sort((x, y) => y.sortDate - x.sortDate),
      roles: a.roles.sort((x, y) => y.sortDate - x.sortDate),
      count: a.works.length + a.roles.length,
      lastYear: years.length ? years[years.length - 1] : 0,
      recentStart: a.starts.length ? Math.max(...a.starts) : 0,
      priority: info?.priority ?? 0,
    };
  });

  // Dated people first (most-recent START, then priority, then most works, then
  // name); dateless last (priority, then A–Z). `priority` is LOWER-first and only
  // settles otherwise-equal people — it never lifts someone above a more recent
  // collaboration.
  return entries.sort((a, b) => {
    if (a.hasDates !== b.hasDates) return a.hasDates ? -1 : 1;
    if (a.hasDates) {
      return (b.recentStart - a.recentStart)
        || (a.priority - b.priority)
        || (b.count - a.count)
        || a.name.localeCompare(b.name);
    }
    return (a.priority - b.priority) || a.name.localeCompare(b.name);
  });
}
