// Generic per-item "metrics" — an open label→value dict surfaced as small stat
// chips on Works cards, detail pages (ProjectPost/BlogPost), and the experience
// drawer. The KEY is the display label; the VALUE is deliberately loose so the
// SAME field can hold a simple count today and a linkable list later, without a
// schema migration:
//
//   "Repo Stars": 1200                              → plain number
//   "Status": "Active"                              → plain string
//   "Homepage": { value: "couchmun.com", url: "…" } → one linked value
//   "Used by": ["MIT", "Harvard"]                   → list of plain values
//   "Used by": [{ label: "MIT", url: "…" }]         → list of linked values (e.g.
//                                                     "groups that use" this project)
//
// Nothing here is site-specific: add a metric to any item's `metrics` and it
// renders. The rendering lives in two mirrors — <Metrics> (server, Astro) and
// renderMetrics() (the experience drawer's client JS) — both consuming the
// normalized shape below. The content-collection Zod schema for this dict lives
// in content.config.ts (kept in lockstep with the union here).

/** A value part that may link out. `label` (list form) or `value` (object form)
 *  carries the text; both are accepted so the two shapes normalize the same way. */
export interface MetricLink {
  label?: string | number;
  value?: string | number;
  url?: string | null;
}
export type MetricScalar = string | number;
export type MetricValue =
  | MetricScalar
  | MetricLink
  | Array<MetricScalar | MetricLink>;
export type Metrics = Record<string, MetricValue>;

/** One value part, flattened for rendering: display text + optional link. */
export interface MetricPart {
  text: string;
  url: string | null;
}
/** One metric, normalized: its display label and one-or-more value parts (a
 *  scalar → a single part; a list → many, joined with commas at render time). */
export interface NormalizedMetric {
  label: string;
  parts: MetricPart[];
}

function toPart(v: MetricScalar | MetricLink | null | undefined): MetricPart {
  if (v !== null && typeof v === 'object') {
    const text = v.label ?? v.value;
    return { text: text == null ? '' : String(text), url: v.url ?? null };
  }
  return { text: v == null ? '' : String(v), url: null };
}

/** Turn a raw `metrics` dict into an ordered list of renderable metrics. Blank
 *  parts are dropped, and a metric with no surviving parts is omitted entirely —
 *  so an empty `{}` (the fully-explicit "unset" placeholder) renders nothing. */
export function normalizeMetrics(metrics?: Metrics | null): NormalizedMetric[] {
  if (!metrics) return [];
  const out: NormalizedMetric[] = [];
  for (const [label, raw] of Object.entries(metrics)) {
    if (raw === null || raw === undefined) continue;
    const parts = (Array.isArray(raw) ? raw.map(toPart) : [toPart(raw)])
      .filter(p => p.text.trim() !== '' || p.url);
    if (parts.length) out.push({ label, parts });
  }
  return out;
}
