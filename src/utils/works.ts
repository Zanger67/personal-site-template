// Shared "works" model — the single home for normalizing projects, publications
// and blog posts into one list, plus the colour/date helpers they all share.
//
// The same three sources are projected two ways:
//   • the CARD model (getWorkItems / WorkItem, at the bottom of this file) — the
//     full <WorkCard> shape, used by src/pages/works.astro for its tabs and by
//     the homepage for its featured "Works" section;
//   • the RELATED-ROW model (allWorks / PooledWork) — a lighter display shape for
//     the "Related" list at the bottom of the project/blog detail pages (mirrors
//     the timeline info-drawer's Related list, but as real links). It differs on
//     purpose: a paper with no link still needs a row href, a post's date drops
//     its reading time, and an author list stands in for the description.
//
// "Relatedness" mirrors the experience timeline's drawer: another item is related
// when it shares a `relationGroups` tag OR an `affiliation` with the current one
// (see inForeground() in experience.astro). Two kinds of related item surface:
//   • other WORKS — projects/papers/posts, rendered as clickable rows;
//   • linked ORG ROLES — a role at an org this work is affiliated with, or one
//     sharing a relation-group. A role has no page of its own, so its row links
//     into the experience page's info tab for that role — `/experience#sel=<ref>`,
//     a data-derived handle (see experienceRefs.ts) that opens and scrolls to the
//     entry in whichever view is default there. With /experience disabled the row
//     falls back to being non-clickable (href: null).
// The works pool is every enabled works category — a category disabled in
// src/config/site.ts drops out entirely, exactly as it does on the Works page.
import { getCollection } from 'astro:content';
import { isRouteEnabled } from '@config/site';
import { resolvePeople, collaboratorHref } from './collaborators';
import { peopleRefs, peopleMarks, marksFor, type Contributions, type PersonEntry } from './marks';
import { roleRef, experienceRefHref } from './experienceRefs';
import { getReadingTime } from './reading-time';
import { extraLinks, paperLink, type UrlEntry, type Link as WorkLink } from './links';
import type { Metrics } from './metrics';
import publications from '../data/publications.json';
import organizations from '../data/organizations.json';
import affiliations from '../data/affiliations.json';
import relationGroupLabels from '../data/relationGroupLabels.json';

export type WorkKind = 'Project' | 'Publication' | 'Blog';

// Kind → experience-timeline category colour, so a related row's dot is colour-keyed
// to the timeline (see CATEGORIES in experience.astro). Blog has no timeline
// category, so it borrows Misc by design. Shared with works.astro.
export const KIND_CAT: Record<WorkKind, string> = {
  Project: '#e0883c',     // timeline 'projects'
  Publication: '#a06fd6', // timeline 'research'
  Blog: '#3aa6ad',        // timeline 'misc'
};

// Every formatter here is UTC-ANCHORED. Content-collection dates (z.coerce.date)
// arrive as UTC-midnight Date objects, so formatting them in the build machine's
// local zone rolls them back a day — and, for the `YYYY-MM-01` values these items
// use, a whole MONTH — anywhere behind UTC: a July-only project reads "Jun 2024",
// a Feb-only one "Jan 2024 – Feb 2024". Pinning timeZone to UTC reads back exactly
// the parts that were authored, whatever zone the build runs in. (experience.astro
// solves the same pitfall the other way, rebuilding UTC parts into a local Date in
// parseDate, because its dates come from JSON strings too.)
export const fmtMonthYear = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtFullDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
// Publication dates are loose strings — "YYYY", "YYYY-MM", or "YYYY-MM-DD".
// Year-only passes through as-is; anything month-precise renders "Mon YYYY". Parts
// build a UTC Date to match the formatters above, so a "2025-06" value can neither
// roll back to May (zones behind UTC) nor forward to July (zones ahead).
export const fmtPubDate = (v: string): string => {
  const [y, m] = String(v).split('-');
  return m ? fmtMonthYear(new Date(Date.UTC(parseInt(y), parseInt(m) - 1))) : y;
};

// Join two already-formatted endpoints into a display range, COLLAPSING a range
// whose endpoints render identically to the single label: something that started
// and finished inside one month reads "Jul 2024", not "Jul 2024 – Jul 2024".
// Purely a display rule — the underlying dates are untouched, so sorting and the
// timeline bars still see the real span. Shared by every range on the site (see
// fmtMonthRange below, fmtRoleRange, people.ts fmtRange, experience.astro).
export const joinRange = (startLabel: string, endLabel: string): string =>
  startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;

// Date pair → display range for the month-granular items (projects). A missing
// end reads "– Present"; equal endpoints collapse via joinRange.
export const fmtMonthRange = (start: Date, end?: Date | null): string =>
  end ? joinRange(fmtMonthYear(start), fmtMonthYear(end)) : `${fmtMonthYear(start)} – Present`;

// Same helper the timeline drawer uses for its "Related (…)" header: map the
// current item's relation-group slugs through relationGroupLabels.json into a
// parenthetical suffix (e.g. ["game-day"] → " (Game Day)"). Empty → "".
const groupLabels = relationGroupLabels as Record<string, string>;
export function relatedGroupSuffix(groups?: string[] | null): string {
  const names = [...new Set((groups ?? []).map(g => groupLabels[g]).filter(Boolean))];
  return names.length ? ` (${names.join(', ')})` : '';
}

const base = import.meta.env.BASE_URL.replace(/\/+$/, '');

// The display shape a <RelatedItems> row needs. `kind` is a work kind for the
// clickable work rows, or 'Role' for the non-clickable org-role rows (href null).
export interface RelatedItem {
  kind: WorkKind | 'Role';
  title: string;
  href: string | null;
  external: boolean;
  dateLabel: string;
  description: string | null;
  color: string;
}

// A pooled work — RelatedItem plus the fields used to match relatedness / sort.
interface PooledWork extends RelatedItem {
  key: string;               // stable identity for self-exclusion: `${kind}:${id|title}`
  sortDate: number;          // start/publication date, newest first
  relationGroups: string[];
  affiliations: string[];
}

interface Publication {
  title: string;
  // Plain refs, or { ref: [level, …] } pairs carrying marks — peopleRefs() /
  // peopleMarks() read either (the related-row model only needs the names).
  authors: PersonEntry[];
  venue: string;
  date: string;
  // Authorship/contributor role (e.g. "Lead author") — folds into the subtitle.
  role?: string;
  // Orgs/labs this paper is affiliated with (partner labs, sponsoring orgs).
  affiliations?: string[];
  url?: string | null;
  urls?: UrlEntry[];
  features?: UrlEntry[];
  tags?: string[];
  metrics?: Metrics;
  main?: boolean;
  // Contributor-level marks for `authors`, as a standalone legend — the
  // alternative to writing them inline on the names (see src/utils/marks.ts).
  contributions?: Contributions;
  relationGroups?: string[];
}

// Normalize a project/blog `affiliations`/`relationGroups` string for comparison
// (case-insensitive, trimmed) so "Georgia Tech Athletic Association" matches
// regardless of incidental casing.
const norm = (s: string) => s.trim().toLowerCase();

// Build the pool of every enabled work, normalized for both display and matching.
async function allWorks(): Promise<PooledWork[]> {
  const projects: PooledWork[] = (isRouteEnabled('projects') ? await getCollection('projects') : [])
    .map(entry => ({
      kind: 'Project' as const,
      key: `Project:${entry.id}`,
      title: entry.data.title,
      href: `${base}/projects/${entry.id}`,
      external: false,
      dateLabel: fmtMonthRange(entry.data.startDate, entry.data.endDate),
      description: entry.data.description,
      color: KIND_CAT.Project,
      sortDate: entry.data.startDate.valueOf(),
      relationGroups: entry.data.relationGroups ?? [],
      affiliations: entry.data.affiliations ?? [],
    }));

  const pubs: PooledWork[] = (isRouteEnabled('publications') ? (publications as Publication[]) : [])
    .map(pub => ({
      kind: 'Publication' as const,
      key: `Publication:${pub.title}`,
      title: pub.title,
      // The paper's own link when it has one; otherwise point at the Works
      // Publications tab (papers have no standalone detail page).
      href: pub.url || `${base}/works#publications`,
      external: !!pub.url,
      dateLabel: fmtPubDate(String(pub.date)),
      // `authors` are people-registry refs (slugs) — resolve to display names,
      // mirroring the Works card's publication description.
      description: resolvePeople(peopleRefs(pub.authors)).map(a => a.name).join(', ') || null,
      color: KIND_CAT.Publication,
      sortDate: new Date(pub.date).valueOf(),
      relationGroups: pub.relationGroups ?? [],
      affiliations: pub.affiliations ?? [],
    }));

  const posts: PooledWork[] = (isRouteEnabled('blog') ? (await getCollection('blog')).filter(p => !p.data.draft) : [])
    .map(entry => ({
      kind: 'Blog' as const,
      key: `Blog:${entry.id}`,
      title: entry.data.title,
      href: `${base}/blog/${entry.id}`,
      external: false,
      dateLabel: fmtFullDate(entry.data.date),
      description: entry.data.description,
      color: KIND_CAT.Blog,
      sortDate: entry.data.date.valueOf(),
      relationGroups: [],                    // blog has no relationGroups field
      affiliations: entry.data.affiliations ?? [],
    }));

  return [...projects, ...pubs, ...posts];
}

// --- Org roles ------------------------------------------------------------
// The linked/associated roles that show up NON-clickably in the Related list —
// e.g. a project affiliated with "GT Athletics" surfaces that org's "Game Day
// Director" role. Two sources share organizations.json's org shape:
//   • organizations.json — clubs/societies (always the "clubs" category);
//   • affiliations.json  — work affiliations (category from `categories`, else work).
// This mirrors experience.astro's timeline model, but a Related LIST only needs
// dated named roles: the blanket `membership` window (carved on the timeline) and
// undated roles are omitted, since a dateless row has no place in a chronology.

// Timeline category → dot colour. Mirrors CATEGORIES in experience.astro (the
// source of truth); KIND_CAT above already reuses three of these for works.
const CAT_COLOR: Record<string, string> = {
  education: '#5b8def',
  work: 'var(--accent)',
  research: '#a06fd6',
  awards: '#d4a017',
  projects: '#e0883c',
  clubs: '#e06c84',
  misc: '#3aa6ad',
};

interface OrgRole {
  role: string;
  roleDetail?: string;
  start?: string | null;
  end?: string | null;
  description?: string | null;
  relationGroups?: string[];
  categories?: string[];
}
interface Org {
  organization: string;
  organizationShort?: string;
  relationGroups?: string[];
  categories?: string[];
  roles?: OrgRole[];
}

// Role dates are loose "YYYY-MM"/"YYYY" strings (like publications) — reuse
// fmtPubDate per endpoint, then join into a range. An open end reads "– Present".
const fmtRoleRange = (start?: string | null, end?: string | null): string => {
  if (!start && !end) return '';
  if (start && !end) return `${fmtPubDate(start)} – Present`;
  if (!start && end) return fmtPubDate(end);
  return joinRange(fmtPubDate(start!), fmtPubDate(end!));
};
// Loose date → ms, for sorting roles into the same chronology as works (which sort
// on a JS Date valueOf). Year-only lands on January; missing → epoch (sorts last).
const looseMs = (v?: string | null): number => {
  if (!v) return 0;
  const [y, m] = String(v).split('-');
  return new Date(parseInt(y), m ? parseInt(m) - 1 : 0).valueOf();
};

interface RoleRow {
  title: string;            // "Role · OrgShort"
  href: string | null;      // deep link into the experience info tab (null if off)
  entity: string;           // org name — matched against a work's affiliations
  relationGroups: string[]; // the role's own tags, else the org's
  dateLabel: string;
  description: string | null;
  color: string;
  sortDate: number;
}

const experienceEnabled = isRouteEnabled('experience');

// Every dated named role across clubs + work affiliations, as candidate rows.
function orgRoleRows(): RoleRow[] {
  const rows: RoleRow[] = [];
  const push = (org: Org, r: OrgRole, color: string) => {
    if (!r.start && !r.end) return;   // undated roles have no place on a dated list
    const short = org.organizationShort || org.organization;
    rows.push({
      title: `${r.roleDetail ?? r.role} · ${short}`,
      // Built from the RAW `role` (not the display `roleDetail`) + org + start —
      // exactly what experience.astro stamps on the same role's records.
      href: experienceEnabled ? experienceRefHref(base, roleRef(org.organization, r.role, r.start)) : null,
      entity: org.organization,
      relationGroups: r.relationGroups ?? org.relationGroups ?? [],
      dateLabel: fmtRoleRange(r.start, r.end),
      description: r.description ?? null,
      color,
      sortDate: looseMs(r.start ?? r.end),
    });
  };
  for (const org of organizations as Org[])
    for (const r of org.roles ?? []) push(org, r, CAT_COLOR.clubs);
  for (const org of affiliations as Org[])
    for (const r of org.roles ?? []) {
      const cat = (r.categories ?? org.categories ?? ['work'])[0];
      push(org, r, CAT_COLOR[cat] ?? CAT_COLOR.work);
    }
  return rows;
}

// The current work, identified so it can be excluded and matched against the pool.
export interface RelatedSelf {
  key: string;                 // `${kind}:${id|title}` — matches PooledWork.key
  relationGroups?: string[];
  affiliations?: string[];
}

// Items related to `self`: shares a relationGroups tag OR an affiliation. Returns
// clickable WORK rows plus non-clickable ORG-ROLE rows, merged newest-first with
// self excluded. Empty when there's nothing to relate to (so the caller can drop
// the whole section, like the drawer does).
export async function getRelatedWorks(self: RelatedSelf): Promise<RelatedItem[]> {
  const groups = new Set(self.relationGroups ?? []);
  const affils = new Set((self.affiliations ?? []).map(norm));
  if (!groups.size && !affils.size) return [];

  // Related WORKS — clickable rows to another project / paper / post.
  const workRows = (await allWorks())
    .filter(w => w.key !== self.key)
    .filter(w =>
      w.relationGroups.some(g => groups.has(g)) ||
      w.affiliations.some(a => affils.has(norm(a))))
    .map(w => ({
      kind: w.kind, title: w.title, href: w.href, external: w.external,
      dateLabel: w.dateLabel, description: w.description, color: w.color, sortDate: w.sortDate,
    }));

  // Related ORG ROLES — a role at an affiliated org, or one sharing a relation-
  // group. No detail page ⇒ non-clickable (href null). Deduped by display title.
  const seenRole = new Set<string>();
  const roleRows = orgRoleRows()
    .filter(r => affils.has(norm(r.entity)) || r.relationGroups.some(g => groups.has(g)))
    .filter(r => { if (seenRole.has(r.title)) return false; seenRole.add(r.title); return true; })
    .map(r => ({
      kind: 'Role' as const, title: r.title, href: r.href, external: false,
      dateLabel: r.dateLabel, description: r.description, color: r.color, sortDate: r.sortDate,
    }));

  return [...workRows, ...roleRows]
    .sort((a, b) => b.sortDate - a.sortDate || a.title.localeCompare(b.title))
    .map(({ sortDate, ...row }) => row);
}

// --- Card model -------------------------------------------------------------
// The full <WorkCard> shape. Both Works views build from getWorkItems(), so an
// item reads identically wherever it appears: the tabbed /works page renders
// every item (grouped per tab), the homepage renders only the `main`-flagged
// ones. A caller decides which fields it passes on — the homepage, for one,
// drops the author list and tags to keep its cards to title · venue · org.

// Every Works item — from any category — is normalized to this one shape.
export interface WorkItem {
  kind: WorkKind;
  main: boolean;
  /** START date (ms) — the sort key everywhere, including for ranges. */
  sortDate: number;
  /** END date (ms), or ONGOING for something still running. Sort tiebreaker. */
  endSort: number;
  title: string;
  href: string | null;
  external: boolean;
  dateLabel: string;
  description?: string;
  subtitle?: string | null;
  // Credited names (publications only) — pre-resolved into linkable chips so the
  // card can render each one individually instead of a flat joined string.
  authors?: {
    name: string;
    href: string | null;
    external: boolean;
    self: boolean;
    marks: { symbol: string; note: string | null }[];
  }[];
  affiliations: string[];
  tags: string[];
  metrics: Metrics;
  links: WorkLink[];
}

/** `endSort` for an item that hasn't ended. Finite, so ongoing-vs-ongoing is a tie. */
export const ONGOING = Number.MAX_SAFE_INTEGER;

// Ordering for the /works tabs (including the merged "Recent activity" feed):
//   1. `main`-flagged items first  2. then by start date, newest first.
export const byMainThenDate = (a: WorkItem, b: WorkItem): number =>
  (Number(b.main) - Number(a.main)) || (b.sortDate - a.sortDate);

// Ordering for the homepage's featured list, where the `main` flag is the filter
// rather than a rank: purely by START date, newest first. A range does NOT get
// pulled forward for still being open — of two things begun in June, one that ran
// June–August outranks one running June–Present, because ties break on the EARLIER
// end. Point events (papers, posts) end the day they land, so they precede any
// open range sharing their start. Equal on both, titles decide.
export const byStartDate = (a: WorkItem, b: WorkItem): number =>
  (b.sortDate - a.sortDate) || (a.endSort - b.endSort) || a.title.localeCompare(b.title);

// De-dupe chips by URL (keep the first) so an explicit Live/Repo link isn't
// repeated by a `urls` entry pointing at the same place.
function dedupeLinks(links: WorkLink[]): WorkLink[] {
  const seen = new Set<string>();
  return links.filter(l => (seen.has(l.url) ? false : (seen.add(l.url), true)));
}

// Every enabled work, normalized. A category whose route is disabled contributes
// nothing (that's what empties — and so hides — its Works tab). Source order is
// projects → publications → posts; callers sort.
export async function getWorkItems(): Promise<WorkItem[]> {
  const projects: WorkItem[] = (isRouteEnabled('projects') ? await getCollection('projects') : [])
    .map(entry => ({
      kind: 'Project' as const,
      main: entry.data.main,
      sortDate: entry.data.startDate.valueOf(),
      endSort: entry.data.endDate?.valueOf() ?? ONGOING,
      title: entry.data.title,
      href: `${base}/projects/${entry.id}`,
      external: false,
      dateLabel: fmtMonthRange(entry.data.startDate, entry.data.endDate),
      description: entry.data.description,
      subtitle: entry.data.role,
      affiliations: entry.data.affiliations,
      tags: entry.data.tags,
      metrics: entry.data.metrics,
      links: dedupeLinks([
        ...(entry.data.url ? [{ label: 'Live', url: entry.data.url }] : []),
        ...(entry.data.repo ? [{ label: 'Repo', url: entry.data.repo }] : []),
        ...(entry.data.template ? [{ label: 'Template', url: entry.data.template }] : []),
        ...(entry.data.sample ? [{ label: 'Sample', url: entry.data.sample }] : []),
        ...extraLinks(entry.data.urls),
        ...extraLinks(entry.data.features),
      ]),
    }));

  const pubs: WorkItem[] = (isRouteEnabled('publications') ? (publications as Publication[]) : [])
    .map(pub => ({
      kind: 'Publication' as const,
      main: pub.main === true,
      sortDate: new Date(pub.date).valueOf(),
      // A paper is a point event — it "ends" when it lands.
      endSort: new Date(pub.date).valueOf(),
      title: pub.title,
      // The paper link is the title's href; the extra `urls`/`features` become chips.
      href: pub.url || null,
      external: true,
      dateLabel: fmtPubDate(String(pub.date)),
      // `authors` are people-registry refs (slugs). Each resolves to a display name
      // that links to their /collaborators dropdown when they have one (falling back
      // to their own site), carrying any contributor-level marks this paper defines.
      authors: (() => {
        const { refs, marks } = peopleMarks(pub.authors, pub.contributions);
        return resolvePeople(refs).map(a => ({
          name: a.name,
          href: a.isSelf ? null : a.listed ? collaboratorHref(a.slug) : a.url,
          external: !a.isSelf && !a.listed && !!a.url,
          self: a.isSelf,
          marks: marksFor(marks, a.slug),
        }));
      })(),
      // Authorship role leads the venue when present ("Lead author · Venue").
      subtitle: pub.role ? `${pub.role} · ${pub.venue}` : pub.venue,
      affiliations: pub.affiliations ?? [],
      tags: pub.tags ?? [],
      metrics: pub.metrics ?? {},
      // The paper link is the title's href AND earns its own leading chip, so the
      // card's link row offers it explicitly rather than hiding it in the title
      // (paperLink brands it by host — "OpenReview"/"arXiv" — else "Read"; a
      // `urls` entry pointing at the same URL de-dupes away).
      links: dedupeLinks([
        ...paperLink(pub.url),
        ...extraLinks(pub.urls),
        ...extraLinks(pub.features),
      ]),
    }));

  const posts: WorkItem[] = (isRouteEnabled('blog') ? (await getCollection('blog')).filter(p => !p.data.draft) : [])
    .map(entry => ({
      kind: 'Blog' as const,
      main: entry.data.main,
      sortDate: entry.data.date.valueOf(),
      endSort: entry.data.date.valueOf(),   // point event, like a paper
      title: entry.data.title,
      href: `${base}/blog/${entry.id}`,
      external: false,
      dateLabel: `${fmtFullDate(entry.data.date)} · ${getReadingTime(entry.body!)}`,
      description: entry.data.description,
      subtitle: entry.data.role,
      affiliations: entry.data.affiliations,
      tags: entry.data.tags ?? [],
      metrics: entry.data.metrics,
      links: dedupeLinks([...extraLinks(entry.data.urls), ...extraLinks(entry.data.features)]),
    }));

  return [...projects, ...pubs, ...posts];
}
