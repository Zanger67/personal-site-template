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
// Self (profile.self) is excluded from the list and flagged in each author line so
// the page can bold my name and accent-highlight the row's collaborator.
import { getCollection } from 'astro:content';
import { isRouteEnabled } from '@config/site';
import { slugify, fallbackName } from './collaborators';
import { KIND_CAT, fmtMonthYear, fmtFullDate, fmtPubDate, type WorkKind } from './works';
import { extraLinks, type Link } from './links';
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
}
const registry = registryData as Record<string, RegistryEntry>;

// Who is "me" — excluded from the collaborators list and bolded in author lines.
// profile.self is the canonical owner slug; the display name/full name slugify in
// as aliases so an author written either way still resolves to self.
const selfSlugs = new Set(
  [(profile as any).self, (profile as any).name, (profile as any).fullName]
    .filter(Boolean)
    .map((s: string) => slugify(s)),
);
export const isSelfSlug = (slug: string): boolean => selfSlugs.has(slug);

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
      const collab = (d.collaborators ?? []).filter(r => !isSelfSlug(slugify(r)));
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
        authors: [selfRef, ...collab].map(toAuthor),
        links: dedupeLinks([
          ...(d.url ? [{ label: 'Live', url: d.url }] : []),
          ...(d.repo ? [{ label: 'Repo', url: d.repo }] : []),
          ...(d.template ? [{ label: 'Template', url: d.template }] : []),
          ...(d.sample ? [{ label: 'Sample', url: d.sample }] : []),
          ...extraLinks(d.urls),
          ...extraLinks(d.features),
        ]),
        years: expandRange(d.startDate.getFullYear(), d.endDate ? d.endDate.getFullYear() : CURRENT_YEAR),
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
      });
    }
  }

  if (isRouteEnabled('blog')) {
    for (const e of (await getCollection('blog')).filter(p => !p.data.draft)) {
      const d = e.data;
      const collab = (d.collaborators ?? []).filter(r => !isSelfSlug(slugify(r)));
      out.push({
        kind: 'Blog',
        title: d.title,
        href: `${base}/blog/${e.id}`,
        external: false,
        dateLabel: fmtFullDate(d.date),
        meta: null,             // no role on the collaborators list
        color: KIND_CAT.Blog,
        sortDate: d.date.valueOf(),
        authors: [selfRef, ...collab].map(toAuthor),
        links: dedupeLinks([...extraLinks(d.urls), ...extraLinks(d.features)]),
        years: [d.date.getFullYear()],
      });
    }
  }

  return out;
}

// ── Roles / periods ─────────────────────────────────────────────────────────
// A role (or an org's membership window) may carry a `collaborators` list — the
// "attach a person to periods and roles" method. Each becomes a PersonRole on the
// listed people, shown in a separate dropdown section and merged into their years.

interface Role { role?: string; roleDetail?: string; start?: string | null; end?: string | null; categories?: string[]; collaborators?: string[] }
interface OrgLike {
  organization: string;
  organizationShort?: string;
  categories?: string[];
  collaborators?: string[];
  membership?: { start?: string | null; end?: string | null };
  roles?: Role[];
}

function collectRoles(): { slug: string; role: PersonRole }[] {
  const rows: { slug: string; role: PersonRole }[] = [];
  const emit = (people: string[] | undefined, role: PersonRole) => {
    for (const ref of people ?? []) {
      const slug = slugify(ref);
      if (!isSelfSlug(slug)) rows.push({ slug, role });
    }
  };
  const walk = (orgs: OrgLike[], defaultColor: string) => {
    for (const org of orgs) {
      const short = org.organizationShort || org.organization;
      for (const r of org.roles ?? []) {
        if (!(r.collaborators?.length)) continue;
        const color = CAT_COLOR[(r.categories ?? org.categories ?? [])[0]] ?? defaultColor;
        emit(r.collaborators, {
          title: `${r.roleDetail ?? r.role} · ${short}`,
          dateLabel: fmtRange(r.start, r.end),
          color,
          sortDate: looseMs(r.start ?? r.end),
          years: rangeYears(r.start, r.end),
        });
      }
      if (org.collaborators?.length) {
        const color = CAT_COLOR[(org.categories ?? [])[0]] ?? defaultColor;
        emit(org.collaborators, {
          title: `${short} · Member`,
          dateLabel: fmtRange(org.membership?.start, org.membership?.end),
          color,
          sortDate: looseMs(org.membership?.start),
          years: rangeYears(org.membership?.start, org.membership?.end),
        });
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
  push('Website', info?.url);
  for (const [label, url] of Object.entries(info?.urls ?? {})) push(label, url);
  return links;
}

function normAffils(info?: RegistryEntry): { name: string; url: string | null }[] {
  return (info?.affiliations ?? []).map(a =>
    typeof a === 'string' ? { name: a, url: null } : { name: a.name, url: a.url ?? null });
}

export async function getCollaborators(): Promise<CollaboratorEntry[]> {
  interface Acc { works: PersonWork[]; roles: PersonRole[]; years: number[] }
  const acc = new Map<string, Acc>();
  const ensure = (slug: string): Acc => {
    let a = acc.get(slug);
    if (!a) { a = { works: [], roles: [], years: [] }; acc.set(slug, a); }
    return a;
  };

  // Works — bucket each into every non-self author's record.
  for (const w of await collectWorks()) {
    for (const a of w.authors) {
      if (a.isSelf) continue;
      const rec = ensure(a.slug);
      rec.works.push(w);
      rec.years.push(...w.years);
    }
  }

  // Roles/periods.
  for (const { slug, role } of collectRoles()) {
    const rec = ensure(slug);
    rec.roles.push(role);
    rec.years.push(...role.years);
  }

  // Seed every registry profile (minus self) so profile-only people appear too,
  // and fold in their manual `years`.
  for (const slug of Object.keys(registry)) {
    if (isSelfSlug(slug)) continue;
    const rec = ensure(slug);
    for (const spec of registry[slug].years ?? []) rec.years.push(...expandYearSpec(spec));
  }

  const entries: CollaboratorEntry[] = [...acc.entries()].map(([slug, a]) => {
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
    };
  });

  // Dated people first (most-recent, then most works, then name); dateless last (A–Z).
  return entries.sort((a, b) => {
    if (a.hasDates !== b.hasDates) return a.hasDates ? -1 : 1;
    if (a.hasDates) return (b.lastYear - a.lastYear) || (b.count - a.count) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}
