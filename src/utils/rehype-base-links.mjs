/**
 * rehype plugin: prefix the site `base` onto root-relative links/images inside
 * rendered markdown (content collections, blog/project/section prose).
 *
 * Astro base-prefixes links written in .astro files (via `import.meta.env.BASE_URL`)
 * but does NOT touch links authored inside markdown bodies. Under a non-root
 * `base` (e.g. a GitHub Pages project deploy) a markdown link like `/projects`
 * would 404. This walks the HTML AST and rewrites root-relative `href`/`src`
 * (`/foo` → `${base}/foo`), leaving external (`https://`), protocol-relative
 * (`//`), anchor (`#`), and already-prefixed links untouched.
 *
 * Takes `base` as an option (passed from astro.config, where it is defined) so it
 * works at config-eval time without relying on `import.meta.env`. No-op when base
 * is root ('' or '/').
 */
export default function rehypeBaseLinks({ base = '' } = {}) {
  const prefix = base.replace(/\/+$/, '');

  function walk(node) {
    if (node.type === 'element') {
      const attr = node.tagName === 'a' ? 'href' : node.tagName === 'img' ? 'src' : null;
      if (attr) {
        const val = node.properties?.[attr];
        if (
          typeof val === 'string' &&
          val.startsWith('/') &&
          !val.startsWith('//') &&
          val !== prefix &&
          !val.startsWith(prefix + '/')
        ) {
          node.properties[attr] = prefix + val;
        }
      }
    }
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }

  return (tree) => {
    if (prefix) walk(tree);
  };
}
