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
// "Relatedness" mirrors the experience timeline's drawer: another work is related
// when it shares a `relationGroups` tag OR an `affiliation` with the current one
// (see inForeground() in experience.astro). The candidate pool is every enabled
// works category — a category disabled in src/config/site.ts drops out entirely,
// exactly as it does on the Works page.
import { getCollection } from 'astro:content';
import { isRouteEnabled } from '@config/site';
import { resolvePeople } from './collaborators';
import publications from '../data/publications.json';
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

// The display shape a <RelatedItems> row needs.
export interface RelatedItem {
  kind: WorkKind;
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

// The current work, identified so it can be excluded and matched against the pool.
export interface RelatedSelf {
  key: string;                 // `${kind}:${id|title}` — matches PooledWork.key
  relationGroups?: string[];
  affiliations?: string[];
}

// Works related to `self`: shares a relationGroups tag OR an affiliation. Sorted
// newest-first, self excluded. Returns [] when there's nothing to relate to (so
// the caller can drop the whole section, like the drawer does).
export async function getRelatedWorks(self: RelatedSelf): Promise<RelatedItem[]> {
  const groups = new Set(self.relationGroups ?? []);
  const affils = new Set((self.affiliations ?? []).map(norm));
  if (!groups.size && !affils.size) return [];

  return (await allWorks())
    .filter(w => w.key !== self.key)
    .filter(w =>
      w.relationGroups.some(g => groups.has(g)) ||
      w.affiliations.some(a => affils.has(norm(a))))
    .sort((a, b) => b.sortDate - a.sortDate || a.title.localeCompare(b.title))
    .map(({ kind, title, href, external, dateLabel, description, color }) =>
      ({ kind, title, href, external, dateLabel, description, color }));
}
