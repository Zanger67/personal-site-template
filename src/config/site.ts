// ─────────────────────────────────────────────────────────────────────────────
// Site visibility config — the single source of truth for what shows and what
// hides across the site. Flip a boolean here instead of commenting out code in
// components or pages.
//
// This file has the SAME SHAPE in both the template and personal-site repos;
// only the *values* differ. There is no PII here, so it is safe in either repo.
//
//   • A disabled route is removed from the nav AND its page 404s when visited
//     (see the `Astro.rewrite('/404')` guards in each page's frontmatter).
//   • A disabled home section / footer link simply isn't rendered.
//
// Hrefs are root-relative (no `base` prefix). Consumers prepend
// `import.meta.env.BASE_URL` so this file stays portable across both repos.
// ─────────────────────────────────────────────────────────────────────────────

/** A navigable destination — one entry per top-level page/route. */
export interface RouteConfig {
  /** Stable id. Pages gate themselves with `isRouteEnabled('<id>')`. */
  id: string;
  /** Text shown in the nav. */
  label: string;
  /** Root-relative path, NO base prefix (consumers prepend BASE_URL). */
  href: string;
  /** Which nav cluster the link lives in. 'none' → reachable but never linked. */
  nav: 'main' | 'misc' | 'none';
  /** Master switch. false → hidden from nav everywhere AND the page 404s. */
  enabled: boolean;
}

export const routes = [
  { id: 'home',         label: 'Home',         href: '/',             nav: 'main', enabled: true },
  { id: 'works',        label: 'Works',        href: '/works',        nav: 'main', enabled: true },
  { id: 'experience',   label: 'Experience',   href: '/experience',   nav: 'main', enabled: true },
  { id: 'contact',      label: 'Contact',      href: '/contact',      nav: 'main', enabled: true },
  // The three /works categories. Kept as routes so each can be independently
  // enabled/disabled (also gates the homepage sections, RSS feed, and blog
  // post pages) — but nav:'none' since they live as tabs under Works now.
  { id: 'projects',     label: 'Projects',     href: '/projects',     nav: 'none', enabled: true },
  { id: 'publications', label: 'Publications', href: '/publications', nav: 'none', enabled: true },
  { id: 'blog',         label: 'Blog',         href: '/blog',         nav: 'none', enabled: true },
  { id: 'map',          label: 'Map',          href: '/map',          nav: 'misc', enabled: true },
  { id: 'funFacts',     label: 'Fun Facts',    href: '/fun-facts',    nav: 'misc', enabled: true },
  { id: 'favourites',   label: 'Favourite Internet Corners', href: '/favourites', nav: 'misc', enabled: true },
] as const satisfies readonly RouteConfig[];

export type RouteId = (typeof routes)[number]['id'];

const routeMap = new Map<string, RouteConfig>(routes.map(r => [r.id, r]));

/** Is this route enabled? Disabled routes are hidden from nav and 404 when visited. */
export function isRouteEnabled(id: RouteId): boolean {
  return routeMap.get(id)?.enabled ?? false;
}

/** Enabled routes for a given nav cluster, in declared order. */
export function navRoutes(slot: 'main' | 'misc'): RouteConfig[] {
  return routes.filter(r => r.enabled && r.nav === slot);
}

/** A link in the site footer. */
export interface FooterLink {
  label: string;
  /** External links open in a new tab; internal ones get the base prefix. */
  href: string;
  external: boolean;
  enabled: boolean;
}

export const footerLinks = [
  { label: 'GitHub',   href: 'https://github.com',   external: true,  enabled: true },
  { label: 'LinkedIn', href: 'https://linkedin.com', external: true,  enabled: true },
  { label: 'Email',    href: '/contact',             external: false, enabled: true },
  { label: 'RSS',      href: '/rss.xml',             external: false, enabled: true },
] as const satisfies readonly FooterLink[];

/** Footer links that should render, in declared order. */
export const enabledFooterLinks: FooterLink[] = footerLinks.filter(l => l.enabled);

// Homepage blocks. A section renders only when its switch is true AND it has
// data to show (the page keeps its existing `length > 0` guards). Switching a
// flag off here force-hides the block regardless of data.
export const homeSections = {
  places: true,
  projects: true,
  publications: true,
  recentPosts: true,
  friends: true,      // the "Misc." research-friends block
  education: true,    // sidebar
  affiliations: true, // sidebar
  languages: true,    // sidebar
} as const;

export type HomeSectionId = keyof typeof homeSections;

/** Should this homepage block render? (Combine with the section's data guard.) */
export function showHomeSection(id: HomeSectionId): boolean {
  return homeSections[id];
}

// Homepage "Research Friends" (Misc.) block display options.
export const friends = {
  // Render only each friend's first name (the first word of their registry
  // display-name) instead of their full name. Flip off to show full names.
  firstNameOnly: true,
} as const;

/** Should the friends block show first names only? */
export function friendsFirstNameOnly(): boolean {
  return friends.firstNameOnly;
}

// Experience-page timeline behaviour.
export const timeline = {
  // Future-dated entries — whose start MONTH is later than the current month —
  // chart as a single-month "(incoming)" marker in their start month, instead
  // of a bar running to Present, and their title is tagged "(incoming)". Flip
  // this off to hide every such entry from the timeline until it actually begins.
  showIncoming: true,
} as const;

/** Should future-dated ("incoming") entries chart on the timeline? */
export function showIncomingEntries(): boolean {
  return timeline.showIncoming;
}
