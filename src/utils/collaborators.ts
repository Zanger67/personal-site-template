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
import collaborators from '../data/collaborators.json';

export interface CollaboratorInfo {
  'display-name'?: string | null;
  url?: string | null;
  urls?: Record<string, string> | null;
}
export interface Person {
  name: string;                  // display name (registry `display-name`, else humanized ref)
  url: string | null;            // primary/default link (null → render as plain text)
  urls: Record<string, string>;  // extra labelled links (may be empty)
}

const registry = collaborators as Record<string, CollaboratorInfo>;

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
function fallbackName(ref: string): string {
  if (/[^a-z0-9-]/.test(ref)) return ref;
  return ref.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export function resolvePeople(refs?: string[] | null): Person[] {
  return (refs ?? []).map(ref => {
    const info = registry[slugify(ref)];
    return {
      name: (info && info['display-name']) || fallbackName(ref),
      url: (info && info.url) || null,
      urls: (info && info.urls) || {},
    };
  });
}
