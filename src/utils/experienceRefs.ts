// Stable handles on an experience entry, so a page OUTSIDE /experience can
// deep-link straight to that entry's info tab: `/experience#sel=<ref>`.
//
// Why not the ids already in the hash? Both experience views number their
// entries with their own throwaway counters — the timeline's `Item.id` and the
// list view's `ListDetail.id` — assigned in build order and NOT shared between
// the two. Neither survives a data change or a view switch, so neither can be
// written down by another page. A ref is derived from the DATA instead
// (organisation + role + start month), so it's the same string in both views and
// across builds.
//
// experience.astro stamps the ref onto both views' records and resolves an
// incoming `#sel=<ref>` against whichever view is showing (see parseHash /
// selectByRef); src/utils/works.ts builds the identical ref for the role rows in
// a work's "Related" list, which is what turns them into links.

// Lowercase, ASCII-ish, hyphen-joined. Keeps refs URL-safe and free of the two
// characters the hash grammar reserves — "&" (token separator) and "." (the
// separator between a ref's own parts).
export function refSlug(s: string): string {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip combining accents left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// A ref for one org role — the timeline bar / list row for "<role> at <org>,
// starting <start>". The start month disambiguates a title held twice (e.g. the
// same TA role across two separate stints); an undated role gets "x".
export function roleRef(org: string, role: string, start?: string | null): string {
  return ['r', refSlug(org), refSlug(role), start ? refSlug(start) : 'x'].join('.');
}

// The deep link itself. `base` is the site's BASE_URL, already stripped of any
// trailing slash by the caller.
export function experienceRefHref(base: string, ref: string): string {
  return `${base}/experience#sel=${ref}`;
}
