// A deliberately tiny, dependency-free INLINE markdown to HTML renderer for short
// authored strings (currently the experience-timeline drawer descriptions). It
// supports a small subset: **bold**, *italic*, `code`, ~~strike~~, [links](url),
// and hard line breaks, and escapes everything else, so raw HTML in the source
// renders literally instead of injecting. This is an authoring convenience for
// the site owner's own content, NOT a sanitizer for untrusted input; it just
// avoids obvious footguns (script tags, javascript: URLs).
//
// Rendered client-side in experience.astro's bundled <script>. Isomorphic (pure
// string in, string out, no DOM/Node APIs), so it can move to build time later.

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Only http(s)/mailto and same-document/relative targets are allowed through as
// links; anything else (javascript:, data:, etc.) is rejected so the reference
// degrades to plain label text.
const safeUrl = (url: string): string | null => {
  const u = url.trim();
  return /^(https?:|mailto:|\/|#|\.)/i.test(u) ? u : null;
};

// Bold, then italic, then strikethrough, applied to already-escaped text. Bold
// runs before italic so `**x**` isn't consumed by the single-`*` rule. The
// underscore italic requires non-word boundaries so `some_snake_case` stays
// literal.
const applyEmphasis = (s: string): string =>
  s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

export interface InlineMarkdownOpts {
  // When false, [label](url) renders as just the (formatted) label. Used for the
  // drawer's related-item hints, which sit inside <button>s where a nested <a>
  // would be invalid interactive HTML.
  links?: boolean;
}

export function inlineMarkdown(src: string | null | undefined, opts: InlineMarkdownOpts = {}): string {
  if (!src) return '';
  const { links = true } = opts;
  // Protected fragments (code spans, finished links) are pulled out as
  // placeholders so later emphasis passes can't mangle their contents, notably
  // `_`/`*` inside a URL. The delimiter is NUL, which authored prose never
  // contains, so a placeholder can't collide with real text like "3 of 5".
  const tokens: string[] = [];
  const stash = (html: string): string => `\u0000${tokens.push(html) - 1}\u0000`;

  // 1. Inline code first: its contents are literal (no nested markdown).
  let s = src.replace(/`([^`]+)`/g, (_m, c) => stash(`<code>${escapeHtml(c)}</code>`));
  // 2. Escape the remaining prose so authored HTML can't inject.
  s = escapeHtml(s);
  // 3. Links: format the label, validate the URL, then protect the whole anchor.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, rawUrl) => {
    const lab = applyEmphasis(label);
    if (!links) return lab;
    const url = safeUrl(rawUrl.replace(/&amp;/g, '&'));
    if (!url) return lab;
    // Only genuinely off-site targets open a new tab; a relative/same-document
    // link (e.g. a drawer author pointing at /collaborators) navigates in place.
    const away = /^(https?:|mailto:)/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return stash(`<a href="${escapeHtml(url)}"${away}>${lab}</a>`);
  });
  // 4. Emphasis over the rest, then hard line breaks.
  s = applyEmphasis(s).replace(/\r?\n/g, '<br>');
  // 5. Restore protected fragments.
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => tokens[Number(i)]);
}
