/** 인라인 SVG 아이콘. 원본: paths · icon() */

const paths = {
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  gift:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M3 6h18v4H3zm9 0v15"/><path d="M12 6C5 7 5 0 9 3l3 3c7 1 7-6 3-3z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  trophy:'<path d="M8 3h8v7a4 4 0 0 1-8 0zm4 11v6m-4 1h8M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
  crown:'<path d="m3 7 5 5 4-8 4 8 5-5-2 12H5z"/>',
  bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  rocket:'<path d="M10 14C6 8 13 3 21 3c0 8-5 15-11 11Zm0 0-3 3m-3 3 2-6m-2 6 6-2"/><circle cx="16" cy="8" r="1"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM21 2v4m-2-2h4"/>',
  edit:'<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  desktop:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>'
};

function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.gift)+'</svg>';}

export { icon, paths }
