// Gimmicks: which one a protocol line is, and the Tera look (crystal body filter per type, jewel crown).
// gimmickOf and TERA_COLORS are pure (tested in Node); teraFilterId / crownSVG touch the DOM.

export const TERA_COLORS = {
  Normal: '#e8e2d0', Fire: '#ff7a3d', Water: '#4f9dff', Electric: '#ffd84a', Grass: '#5fd66a', Ice: '#8ce8ff',
  Fighting: '#ff8a3d', Poison: '#b56ae0', Ground: '#d9a55e', Flying: '#a9cbff', Psychic: '#ff6aa8', Bug: '#b8d23a',
  Rock: '#c9b98a', Ghost: '#9a78e0', Dragon: '#7d73ff', Dark: '#8a7690', Steel: '#9cc4d8', Fairy: '#ff8fe0', Stellar: '#9ff0e4',
};

/** null, or {kind: 'tera'|'mega'|'primal'|'ultra'|'dynamax'|'undynamax'|'zmove', teraType?} */
export function gimmickOf(line) {
  const l = line || '';
  let m = /^\|-terastallize\|[^|]*\|([^|]+)/.exec(l);
  if (m) return {kind: 'tera', teraType: m[1]};
  if (/^\|-mega\|/.test(l)) return {kind: 'mega'};
  if (/^\|-primal\|/.test(l)) return {kind: 'primal'};
  if (/^\|-burst\|/.test(l)) return {kind: 'ultra'};
  if (/^\|-start\|[^|]*\|Dynamax(\||$)/.test(l)) return {kind: 'dynamax'};
  if (/^\|-end\|[^|]*\|Dynamax(\||$)/.test(l)) return {kind: 'undynamax'};
  if (/^\|-zpower\|/.test(l)) return {kind: 'zmove'};
  return null;
}

const FACETS = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cg fill='white'%3E" +
  "%3Cpolygon points='0,0 34,0 14,26' fill-opacity='.55'/%3E%3Cpolygon points='34,0 70,0 50,22' fill-opacity='.2'/%3E%3Cpolygon points='70,0 100,0 100,30' fill-opacity='.45'/%3E" +
  "%3Cpolygon points='14,26 50,22 30,55' fill-opacity='.35'/%3E%3Cpolygon points='50,22 100,30 72,58' fill-opacity='.12'/%3E%3Cpolygon points='0,40 30,55 0,80' fill-opacity='.4'/%3E" +
  "%3Cpolygon points='30,55 72,58 48,86' fill-opacity='.5'/%3E%3Cpolygon points='72,58 100,60 100,95' fill-opacity='.25'/%3E%3Cpolygon points='0,80 48,86 20,100' fill-opacity='.2'/%3E" +
  "%3Cpolygon points='48,86 100,95 80,100' fill-opacity='.45'/%3E%3C/g%3E%3C/svg%3E";
const BAND = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' preserveAspectRatio='none'%3E%3ClinearGradient id='g'%3E" +
  "%3Cstop offset='0' stop-color='white' stop-opacity='0'/%3E%3Cstop offset='.5' stop-color='white' stop-opacity='.9'/%3E%3Cstop offset='1' stop-color='white' stop-opacity='0'/%3E" +
  "%3C/linearGradient%3E%3Crect width='10' height='10' fill='url(%23g)'/%3E%3C/svg%3E";

/** The id of an SVG filter that turns a sprite into Tera crystal of this type (built once per document). */
export function teraFilterId(type, doc = document) {
  const t = TERA_COLORS[type] ? type : 'Stellar';
  const id = `stg-tera-${t}`;
  if (doc.getElementById(id)) return id;
  let defs = doc.getElementById('stg-tera-defs');
  if (!defs) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = '<defs id="stg-tera-defs"></defs>';
    doc.body.appendChild(svg);
    defs = doc.getElementById('stg-tera-defs');
  }
  const f = doc.createElementNS('http://www.w3.org/2000/svg', 'filter');
  f.setAttribute('id', id);
  for (const [k, v] of [['x', '-15%'], ['y', '-15%'], ['width', '130%'], ['height', '130%'], ['primitiveUnits', 'objectBoundingBox'], ['color-interpolation-filters', 'sRGB']]) f.setAttribute(k, v);
  f.innerHTML = `
    <feColorMatrix in="SourceGraphic" type="matrix" values=".45 .35 .2 0 .18  .35 .45 .2 0 .12  .35 .35 .3 0 .22  0 0 0 1 0" result="base"/>
    <feFlood flood-color="${TERA_COLORS[t]}" result="tc"/>
    <feComposite in="tc" in2="SourceAlpha" operator="in" result="tcA"/>
    <feBlend in="tcA" in2="base" mode="multiply" result="tinted"/>
    <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${FACETS}" result="fac"/>
    <feComposite in="fac" in2="SourceAlpha" operator="in" result="facA"/>
    <feBlend in="facA" in2="tinted" mode="screen" result="cr"/>
    <feImage y="0" width=".35" height="1" preserveAspectRatio="none" href="${BAND}" result="band">
      <animate attributeName="x" values="-.5;1.2;1.2" keyTimes="0;.6;1" dur="2.4s" repeatCount="indefinite"/>
    </feImage>
    <feComposite in="band" in2="SourceAlpha" operator="in" result="bandA"/>
    <feBlend in="bandA" in2="cr" mode="screen" result="shiny"/>
    <feMorphology in="SourceAlpha" operator="dilate" radius=".012" result="fat"/>
    <feFlood flood-color="#ffffff" flood-opacity=".8" result="rimc"/>
    <feComposite in="rimc" in2="fat" operator="in" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation=".02" result="glow"/>
    <feMerge><feMergeNode in="glow"/><feMergeNode in="shiny"/></feMerge>`;
  defs.appendChild(f);
  return id;
}

/** The jewel crown: one faceted shape, tinted to the Tera type (Stellar = rainbow). */
export function crownSVG(type) {
  const c = TERA_COLORS[type] || TERA_COLORS.Stellar;
  const fill = type === 'Stellar' ? 'url(#stg-rainbow)' : c;
  return `<svg viewBox="0 0 60 44" width="58" height="42">
    <defs><linearGradient id="stg-rainbow" x1="0" x2="1"><stop offset="0" stop-color="#ff7a7a"/><stop offset=".25" stop-color="#ffd84a"/>
      <stop offset=".5" stop-color="#7dffb0"/><stop offset=".75" stop-color="#7ab8ff"/><stop offset="1" stop-color="#e07aff"/></linearGradient></defs>
    <polygon points="30,0 40,16 30,40 20,16" fill="${fill}"/><polygon points="30,0 40,16 30,20" fill="#fff" fill-opacity=".55"/>
    <polygon points="12,8 22,20 16,40 6,22" fill="${fill}" fill-opacity=".85"/><polygon points="12,8 22,20 14,22" fill="#fff" fill-opacity=".45"/>
    <polygon points="48,8 54,22 44,40 38,20" fill="${fill}" fill-opacity=".85"/><polygon points="48,8 46,21 38,20" fill="#fff" fill-opacity=".45"/>
    <polygon points="20,16 30,40 16,40" fill="#000" fill-opacity=".18"/><polygon points="40,16 44,40 30,40" fill="#000" fill-opacity=".1"/>
    <circle cx="30" cy="9" r="1.6" fill="#fff"/><circle cx="12" cy="14" r="1.2" fill="#fff"/></svg>`;
}
