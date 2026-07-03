// Shared link helpers for the "listed links" formats used across the site.
//
// Two parallel per-entity list fields carry extra links, both of shape
// `{ title?, url }[]`:
//   • `urls`     — general extra links (docs, PDF, mirrors, …)
//   • `features` — "featured in" / press coverage (a talk, a newsletter, a
//                  write-up someone else published about the item)
// They render identically (as labelled chips); they're kept separate so the
// data reads clearly and each can be styled/placed independently later. Both
// sit alongside an entity's primary link(s) — a project's `url` ("Live") and
// `repo` ("Repo"), a publication's paper `url` ("Read"), etc.
//
// A chip shows its `title` when set; otherwise it falls back to a label derived
// from the URL's host (see hostLabel).
export interface UrlEntry { title?: string | null; url?: string | null; }
export interface Link { label: string; url: string; }

// Known platforms → canonical, branded labels. A bare URL to one of these
// auto-labels the way `url`→"Live"/`repo`→"Repo" do — no explicit `title`
// needed (an explicit `title` still wins). Matched on the registrable domain,
// so subdomains resolve too (e.g. `anthony.substack.com` → "Substack"). To
// teach the whole site a new platform, add one row here.
const KNOWN_HOSTS: Record<string, string> = {
  'github.com': 'GitHub',
  'arxiv.org': 'arXiv',
  'lesswrong.com': 'LessWrong',
  'substack.com': 'Substack',
  'linkedin.com': 'LinkedIn',
  'youtube.com': 'YouTube',
  'medium.com': 'Medium',
  // X's old + new domains both label as "Twitter".
  'x.com': 'Twitter',
  'twitter.com': 'Twitter',
};

// Strip protocol + leading "www.", then either return a known-platform label
// (keyed by the registrable domain, e.g. "arxiv.org") or fall back to the
// registrable NAME — the label before the public suffix: "github.com" →
// "github", "arxiv.org" → "arxiv". (A bare host with no dot, e.g. "localhost",
// is returned whole; an unparseable value falls back to itself so a label
// always renders.)
export function hostLabel(raw: string): string {
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
      .hostname.replace(/^www\./, '');
    const parts = host.split('.').filter(Boolean);
    // Registrable domain = the last two labels ("foo.substack.com" → "substack.com").
    const base = parts.length >= 2 ? parts.slice(-2).join('.') : host;
    if (KNOWN_HOSTS[base]) return KNOWN_HOSTS[base];
    return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || raw);
  } catch {
    return raw;
  }
}

// Turn a `urls`/`features` list into link chips: drop empties, then label each
// by its `title` (trimmed) or the derived host label.
export function extraLinks(urls?: UrlEntry[] | null): Link[] {
  return (urls ?? [])
    .filter((u): u is { title?: string | null; url: string } => !!u && !!u.url)
    .map(u => ({ label: (u.title && u.title.trim()) || hostLabel(u.url), url: u.url }));
}
