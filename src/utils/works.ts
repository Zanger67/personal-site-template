// Shared "works" model — the single home for normalizing projects, publications
// and blog posts into one list, plus the colour/date helpers they all share.
//
// Two consumers today:
//   • src/pages/works.astro    — the tabbed Works listing (imports the colour map
//                                 + date formatters from here).
//   • getRelatedWorks(...)      — the "Related" section shown at the bottom of the
//                                 project/blog detail pages (mirrors the timeline
//                                 info-drawer's Related list, but as real links).
//
// "Relatedness" mirrors the experience timeline's drawer: another item is related
// when it shares a `relationGroups` tag OR an `affiliation` with the current one
// (see inForeground() in experience.astro). Two kinds of related item surface:
//   • other WORKS — projects/papers/posts, rendered as clickable rows;
//   • linked ORG ROLES — a role at an org this work is affiliated with, or one
//     sharing a relation-group. These have no detail page, so they render as
//     NON-clickable rows (href: null), matching how the timeline drawer lights up
//     an affiliated org's roles alongside a selected work.
// The works pool is every enabled works category — a category disabled in
// src/config/site.ts drops out entirely, exactly as it does on the Works page.
import { getCollection } from 'astro:content';
import { isRouteEnabled } from '@config/site';
import { resolvePeople } from './collaborators';
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

export const fmtMonthYear = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
export const fmtFullDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// Publication dates are loose strings — "YYYY", "YYYY-MM", or "YYYY-MM-DD".
// Year-only passes through as-is; anything month-precise renders "Mon YYYY". Parts
// build a LOCAL Date so a "2025-06" value can't roll back to May in timezones
// behind UTC (the pitfall parseDate warns about in experience.astro).
export const fmtPubDate = (v: string): string => {
  const [y, m] = String(v).split('-');
  return m ? fmtMonthYear(new Date(parseInt(y), parseInt(m) - 1)) : y;
};

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
  authors: string[];
  venue: string;
  date: string;
  role?: string;
  affiliations?: string[];
  url?: string | null;
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
      dateLabel: entry.data.endDate
        ? `${fmtMonthYear(entry.data.startDate)} – ${fmtMonthYear(entry.data.endDate)}`
        : `${fmtMonthYear(entry.data.startDate)} – Present`,
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
      description: resolvePeople(pub.authors).map(a => a.name).join(', ') || null,
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
  return `${fmtPubDate(start!)} – ${fmtPubDate(end!)}`;
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
  entity: string;           // org name — matched against a work's affiliations
  relationGroups: string[]; // the role's own tags, else the org's
  dateLabel: string;
  description: string | null;
  color: string;
  sortDate: number;
}

// Every dated named role across clubs + work affiliations, as candidate rows.
function orgRoleRows(): RoleRow[] {
  const rows: RoleRow[] = [];
  const push = (org: Org, r: OrgRole, color: string) => {
    if (!r.start && !r.end) return;   // undated roles have no place on a dated list
    const short = org.organizationShort || org.organization;
    rows.push({
      title: `${r.roleDetail ?? r.role} · ${short}`,
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
      kind: 'Role' as const, title: r.title, href: null, external: false,
      dateLabel: r.dateLabel, description: r.description, color: r.color, sortDate: r.sortDate,
    }));

  return [...workRows, ...roleRows]
    .sort((a, b) => b.sortDate - a.sortDate || a.title.localeCompare(b.title))
    .map(({ sortDate, ...row }) => row);
}
