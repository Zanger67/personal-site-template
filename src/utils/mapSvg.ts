// Builds the interactive North America map as an SVG-markup string, injected
// client-side by NorthAmericaMap.astro after the heavy path data is lazily
// imported. Kept as a pure function that takes the data as arguments and only
// `import type`s from map-paths, so this module carries no runtime dependency
// on the ~160KB path bundle — that stays a separately code-split chunk fetched
// on scroll-into-view. The markup mirrors the (previously server-rendered)
// component structure exactly, including the data-* attributes the tooltip /
// hover interactivity relies on. Styling lives in the component's scoped CSS
// (`.map-container :global(...)`), driven by the inherited --map-* vars.

import type { MapRegion, LakeRegion } from '../data/map-paths';

interface City {
  id: string;
  x: number;
  y: number;
  label: string;
  type: string;
  labelAnchor: 'start' | 'middle' | 'end';
  labelOffset: { dx: number; dy: number };
}

export interface MapPaths {
  regions: MapRegion[];
  alaskaInset: MapRegion;
  alaskaSimple: MapRegion;
  hawaiiInset: MapRegion;
  greatLakes: LakeRegion[];
  dcAreaHiRes: MapRegion[];
}

export interface MapConfig {
  visited: string[];
  activeCities: string[];
  cities: City[];
}

const esc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function buildMapSvg(paths: MapPaths, config: MapConfig): string {
  const { regions, alaskaInset, alaskaSimple, hawaiiInset, greatLakes, dcAreaHiRes } = paths;
  const visited = new Set(config.visited);
  const activeSet = new Set(config.activeCities);
  const continental = [...regions.filter((r) => r.id !== 'US-HI' && r.id !== 'US-AK'), alaskaSimple];
  const activeCities = config.cities.filter((c) => activeSet.has(c.id));

  const region = (r: MapRegion): string =>
    `<path id="${esc(r.id)}" d="${r.d}"${r.fillRule ? ` fill-rule="${r.fillRule}"` : ''}` +
    ` class="region${visited.has(r.id) ? ' visited' : ''}"` +
    ` data-abbr="${esc(r.abbr)}" data-name="${esc(r.name)}" data-region="${esc(r.id)}"/>`;

  const lake = (l: LakeRegion): string =>
    `<path d="${l.d}"${l.fillRule ? ` fill-rule="${l.fillRule}"` : ''} class="lake"/>`;

  const city = (c: City): string => {
    const marker =
      c.type === 'current'
        ? `<polygon points="${c.x},${c.y - 3.5} ${c.x + 1.2},${c.y - 1.2} ${c.x + 3.5},${c.y - 1.2} ${c.x + 1.7},${c.y + 0.5} ${c.x + 2.3},${c.y + 3.5} ${c.x},${c.y + 1.5} ${c.x - 2.3},${c.y + 3.5} ${c.x - 1.7},${c.y + 0.5} ${c.x - 3.5},${c.y - 1.2} ${c.x - 1.2},${c.y - 1.2}" class="city-star"/>`
        : c.type === 'hometown'
          ? `<rect x="${c.x - 2.5}" y="${c.y - 2.5}" width="5" height="5" class="city-square"/>`
          : `<circle cx="${c.x}" cy="${c.y}" r="2.5" class="city-dot"/>`;
    const lx = c.x + c.labelOffset.dx + (c.labelAnchor === 'start' ? 3 : -3);
    const ly = c.y + c.labelOffset.dy;
    return (
      `<g class="city-marker">` +
      `<line x1="${c.x}" y1="${c.y}" x2="${c.x + c.labelOffset.dx}" y2="${c.y + c.labelOffset.dy}" class="city-line"/>` +
      marker +
      `<text x="${lx}" y="${ly}" text-anchor="${c.labelAnchor}" class="city-label">${esc(c.label)}</text>` +
      `</g>`
    );
  };

  return (
    `<svg viewBox="372 222 561 351" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of visited places in North America">` +
    `<g class="regions">${continental.map(region).join('')}</g>` +
    `<g class="lakes">${greatLakes.map(lake).join('')}</g>` +
    // Alaska inset — bottom-left
    `<g class="inset-group">` +
    `<rect x="383" y="497" width="88" height="66" class="inset-border" rx="2"/>` +
    `<text x="387" y="507" class="inset-label">AK</text>` +
    `<g transform="translate(383, 497) scale(0.73)">${region(alaskaInset)}</g>` +
    `</g>` +
    // Hawaii inset — next to Alaska
    `<g class="inset-group">` +
    `<rect x="475" y="521" width="65" height="42" class="inset-border" rx="2"/>` +
    `<text x="479" y="531" class="inset-label">HI</text>` +
    `<g class="hi-inset-regions" transform="translate(361, 460) scale(2.8)">${region(hawaiiInset)}</g>` +
    `</g>` +
    // DC area inset — bottom-right
    `<g class="inset-group">` +
    `<defs><clipPath id="dc-clip"><rect x="858" y="502" width="72" height="60"/></clipPath></defs>` +
    `<rect x="858" y="502" width="72" height="60" class="inset-border" rx="2"/>` +
    `<g clip-path="url(#dc-clip)"><g class="dc-inset-regions" transform="translate(-15911, -8730) scale(21)">${dcAreaHiRes.map(region).join('')}</g></g>` +
    `<text x="862" y="512" class="inset-label">DC</text>` +
    `<line x1="800" y1="441" x2="858" y2="510" class="dc-leader"/>` +
    `<line x1="800" y1="441" x2="858" y2="540" class="dc-leader"/>` +
    `</g>` +
    `<g class="cities">${activeCities.map(city).join('')}</g>` +
    `</svg>`
  );
}
