// Resolves people references — a project/blog `collaborators` list, a
// publication's `authors` list, or the homepage `friends` list (all synonymous) —
// into display records via the shared people registry src/data/collaborators.json.
//
// The registry is keyed by a NAME-SLUG; each entry carries a `display-name`, a
// primary `url` (the DEFAULT click — what makes the name a link), and an open
// `urls` map of extra labelled links (label → url):
//   { "isaac-song": { "display-name": "Isaac Song", "url": "…", "urls": { "GitHub": "…" } } }
//
// References are SLUGS (e.g. "isaac-song"). A written name ("Isaac Song") also
// resolves — every reference is slugified before lookup, so matching is
// case/spacing/punctuation-insensitive. A matched entry renders its `display-name`
// linked to `url`; an unmatched reference renders unlinked, its slug humanized
// back to a readable label ("buzz-jr" → "Buzz Jr").
import { isRouteEnabled } from '@config/site';
import collaborators from '../data/collaborators.json';
import profile from '../data/profile.json';

export interface CollaboratorInfo {
  'display-name'?: string | null;
  url?: string | null;
  urls?: Record<string, string> | null;
  // Optional PROFILE fields — surfaced on the /collaborators page (see people.ts):
  //   • affiliations — the person's institutional affiliations (a bare name, or a
  //     { name, url } for a linked one). Shown as muted text next to their name.
  //   • years — manual year/range specs ("2019", "2022–2024", "2024–present") that
  //     feed the aggregated year label + sort alongside their dated works/roles.
  //     Lets a profile-only person (no shared works) still carry a timeframe.
  //   • listed — include this person on the /collaborators page. OPT-IN: defaults to
  //     false, so a profile shows there only when explicitly `true` (always write it
  //     out rather than leaning on the default). Listing switch only — it does not
  //     change how the person renders anywhere else on the site.
  affiliations?: (string | { name: string; url?: string | null })[] | null;
  years?: string[] | null;
  //   • priority — manual rank that BREAKS TIES in the /collaborators ordering; LOWER
  //     shows first (0 before 2), default 0. Does not override the most-recent-first sort.
  listed?: boolean | null;
  priority?: number | null;
}
export interface Person {
  name: string;                  // display name (registry `display-name`, else humanized ref)
  url: string | null;            // primary/default link (null → render as plain text)
  urls: Record<string, string>;  // extra labelled links (may be empty)
  slug: string;                  // registry key — the stable identity to link/group on
  isSelf: boolean;               // this reference is me (rendered bold + unlinked)
  listed: boolean;               // has a /collaborators dropdown to deep-link into
}

const registry = collaborators as Record<string, CollaboratorInfo>;

const base = import.meta.env.BASE_URL.replace(/\/+$/, '');

// Deep link to a person's dropdown on /collaborators. The page reads this hash on
// load (and intercepts same-page clicks) to open that person, scroll to them and
// flash a highlight — see src/pages/collaborators.astro.
export const collaboratorHref = (slug: string): string => `${base}/collaborators#p-${slug}`;

// Normalize a name (or an already-slug) into a registry key: strip accents,
// lowercase, non-alphanumeric runs → single hyphens, trimmed. Idempotent on slugs
// ("isaac-song" → "isaac-song"), so a reference may be written as a slug or a name.
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Fallback label for a reference with no registry entry: an already-readable name
// (has spaces/caps/punctuation) is shown as-is; a bare slug is title-cased.
export function fallbackName(ref: string): string {
  if (/[^a-z0-9-]/.test(ref)) return ref;
  return ref.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// Who is "me". `profile.self` is the canonical owner slug; the display name and full
// name slugify in as aliases, so a self-reference written any of those ways resolves.
const selfSlugs = new Set(
  [(profile as any).self, (profile as any).name, (profile as any).fullName]
    .filter(Boolean)
    .map((s: string) => slugify(s)),
);
export const isSelfSlug = (slug: string): boolean => selfSlugs.has(slug);

// `excludeSelf` drops me from the result — that's what the "Collaborators" line on a
// project or blog post wants, since it credits the OTHER people. Author lists keep me
// in (publications, and the /collaborators page's author lines), so it defaults off.
export function resolvePeople(refs?: string[] | null, opts?: { excludeSelf?: boolean }): Person[] {
  const list = opts?.excludeSelf
    ? (refs ?? []).filter(r => !isSelfSlug(slugify(r)))
    : (refs ?? []);
  return list.map(resolvePerson);
}

// Like resolvePeople but for a single ref. `slug` is idempotent: a ref written as
// a name or as a slug resolves to the same entry — it's the stable identity the
// /collaborators page groups + self-matches on (a display name can't be a key).
export function resolvePerson(ref: string): Person {
  const slug = slugify(ref);
  const info = registry[slug];
  return {
    slug,
    name: (info && info['display-name']) || fallbackName(ref),
    url: (info && info.url) || null,
    urls: (info && info.urls) || {},
    isSelf: isSelfSlug(slug),
    // "Has a dropdown worth linking to" — which also means NOT when the whole
    // route is switched off, so no caller can emit a link into a 404.
    listed: info?.listed === true && isRouteEnabled('collaborators'),
  };
}

// The credit line for an item, ME INCLUDED. A work's `collaborators` list normally
// names only the other people, so I'm prepended; but if the list already names me,
// its order is honoured verbatim — that's how you get "Eck, me, Lanta". Publications
// need no prepending, their `authors` already include me.
//
// This is what a detail page's contributor line renders: I appear in place (bold,
// never a link — linking myself to my own site is noise), everyone else resolves
// normally. Contrast resolvePeople(refs, { excludeSelf: true }), which drops me.
export function resolveCredits(refs?: string[] | null): Person[] {
  const list = refs ?? [];
  const selfRef = (profile as any).self ?? (profile as any).name;
  const ordered = list.some(r => isSelfSlug(slugify(r))) ? list : [selfRef, ...list];
  return ordered.map(resolvePerson);
}
