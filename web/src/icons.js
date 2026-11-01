// Arayüz simgeleri: tek elden çizilmiş çizgi simgeler (24×24 ızgara, 2 px çizgi, yuvarlak uç ve köşe). Renk
// yazı renginden gelir (currentColor), boyut yazı boyundan (1em); emoji kullanılmaz (her cihazda farklı çizilir,
// arayüzün diline uymaz).
const P = {
  sakinler: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.6" cy="9" r="2.5"/><path d="M15.6 14.1c2.6-.2 4.5 1.6 4.9 4.9"/>',
  is: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17"/>',
  ev: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  yurur: '<circle cx="13.5" cy="4.5" r="1.8"/><path d="M11 21l2-6.2-2.5-2.3 1.2-5.3 3 2.6 3 .9"/><path d="M10.2 11.6 7.5 13.6M13 14.8l2.2 6.2"/>',
  vinc: '<path d="M6 21V3.5"/><path d="M3 21h7"/><path d="M6 4h14.5"/><path d="M6 8.5 10.5 4"/><path d="M17.5 4v5"/><rect x="16" y="9" width="3" height="2.5" rx=".5"/>',
  sesAcik: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  sesKapali: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  harita: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  konum: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  kisi: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>',
  valiz: '<rect x="4" y="7.5" width="16" height="12" rx="2"/><path d="M9.5 7.5V5.5h5v2M8 7.5v12M16 7.5v12"/>',
  sandik: '<path d="M4 13h16v7H4z"/><path d="M8 13V5h8v8"/><path d="M10 9l1.5 1.5L14.5 7.2"/>',
  goz: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  kamera: '<rect x="3" y="7" width="12.5" height="10" rx="2"/><path d="M15.5 10.5 21 7.5v9l-5.5-3"/>',
  gunes: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  ampul: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.7.5 1 1.3 1 2.1h5c0-.8.3-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  cesme: '<path d="M4 17h16"/><path d="M6 17c0 2.2 2.5 3.5 6 3.5s6-1.3 6-3.5"/><path d="M12 17V8"/><path d="M12 8c-2.2 0-4 1.6-4.5 4.2M12 8c2.2 0 4 1.6 4.5 4.2"/><path d="M12 8c0-2.2 1.2-3.7 3.2-4.4"/>',
  vapur: '<path d="M3 15.5h18l-2.5 4.5h-13z"/><path d="M6 15.5V11h12v4.5"/><path d="M9 11V8h5v3"/><path d="M11.5 8V5"/>',
  dalga: '<path d="M3 9c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/><path d="M3 14.5c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/>',
  agac: '<path d="M12 21v-6"/><path d="M12 3c-3.5 0-6 2.6-6 5.8 0 1.6.7 3 1.8 4 .8 1.6 2.4 2.2 4.2 2.2s3.4-.6 4.2-2.2c1.1-1 1.8-2.4 1.8-4C18 5.6 15.5 3 12 3z"/>',
  semsiye: '<path d="M3.5 12a8.5 8.5 0 0 1 17 0z"/><path d="M12 12v8.5M12 3.5V2.5"/><path d="M8 20.5h8"/>',
  dag: '<path d="M2.5 19.5 9 8l4 6.5 2.5-4 6 9z"/>',
  fener: '<path d="M9.5 21 10.5 8h3l1 13z"/><path d="M8.5 21h7"/><path d="M9.5 8h5V5.5L12 3.5 9.5 5.5z"/><path d="M6 6.5 3.5 5.5M18 6.5l2.5-1"/>',
  basak: '<path d="M12 21V8"/><path d="M12 12c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 12c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4zM12 8c-2 0-3.3-1.3-3.3-3.3 2 0 3.3 1.3 3.3 3.3zM12 8c2 0 3.3-1.3 3.3-3.3-2 0-3.3 1.3-3.3 3.3z"/>',
  mahalle: '<path d="M3 20v-9l5-4 5 4v9"/><path d="M13 20v-6l4-3 4 3v6"/><path d="M2 20h20"/>',
  bina: '<rect x="5" y="3.5" width="14" height="17" rx="1"/><path d="M9 7.5h2M13 7.5h2M9 11h2M13 11h2M9 14.5h2M13 14.5h2M10.5 20.5v-3h3v3"/>',
  cami: '<path d="M5 21v-7a7 7 0 0 1 14 0v7"/><path d="M3 21h18"/><path d="M12 7V4"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>',
  ambar: '<path d="M3 8l9-4.5L21 8v12H3z"/><path d="M7 20v-7h10v7M7 16.5h10"/>',
  capa: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14"/><path d="M5 13a7 7 0 0 0 14 0"/><path d="M9 10h6"/>',
  balik: '<path d="M3 12c3-4.5 9-6 14-2l4-3v10l-4-3c-5 4-11 2.5-14-2z"/><circle cx="8" cy="11" r=".6"/>',
  ahir: '<path d="M3.5 21V10L12 4l8.5 6v11z"/><path d="M8.5 21v-6h7v6M8.5 15l7 6M15.5 15l-7 6"/>',
  kamyon: '<path d="M2.5 16V7h11v9"/><path d="M13.5 10h4l3 3.5V16h-7"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="16.5" cy="17" r="1.8"/>',
  fincan: '<path d="M5 9h11v5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14z"/><path d="M16 10.5h1.5a2.2 2.2 0 0 1 0 4.4H16"/><path d="M8 6.5c0-1 1-1 1-2M11.5 6.5c0-1 1-1 1-2"/>',
  kalkan: '<path d="M12 3 19 6v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  kamu: '<path d="M3 9.5 12 4l9 5.5z"/><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8"/><path d="M3 20.5h18"/>',
  terazi: '<path d="M12 4v16M7 20.5h10"/><path d="M5 7h14"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
  okul: '<path d="M2.5 9 12 5l9.5 4L12 13z"/><path d="M6.5 11v4.5c1.5 1.5 3.5 2 5.5 2s4-.5 5.5-2V11"/><path d="M21.5 9v5"/>',
  saglik: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>',
  ekmek: '<path d="M5 10.5a4 4 0 0 1 3-6.5h8a4 4 0 0 1 3 6.5V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9.5 9.5l1 2M13.5 9.5l1 2"/>',
  sepet: '<path d="M3 4.5h2.5l2 10.5h10.5l2-7H6.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  yatak: '<path d="M3 19V6M3 15h18v4"/><path d="M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11" r="1.8"/>',
  kitap: '<path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5v13"/>',
  paylas: '<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 13v6h14v-6"/>',
  zeplin: '<path d="M3 10.5c0-2.5 3.6-4.5 8.5-4.5S20 8 20 10.5 16.4 15 11.5 15 3 13 3 10.5z"/><path d="M20 10.5l1.5-2.5v5zM9 15l.8 2.5h3.4l.8-2.5"/>',
  araba: '<path d="M4 16.5V12l2-5h12l2 5v4.5"/><path d="M4 12h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  taksi: '<path d="M4 16.5V12l2-5h12l2 5v4.5"/><path d="M4 12h16M10 7V4.5h4V7"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  otobus: '<rect x="4" y="3.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8 17.5v2.5M16 17.5v2.5"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
  ambulans: '<path d="M2.5 16V7h12v9"/><path d="M14.5 10h3.5l3 3.5V16h-6.5"/><circle cx="6.5" cy="17" r="1.8"/><circle cx="17" cy="17" r="1.8"/><path d="M8.5 9v4M6.5 11h4"/>',
  ok: '<path d="M9 6l6 6-6 6"/>',
};

/** SVG simgesi (HTML metni). name: P'deki ad; bilinmeyen ad boş döner. */
export function svg(name, cls = "") {
  const d = P[name];
  return d ? `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>` : "";
}

/** Bina türü → simge (kart başlığı). */
export const BINA_SIMGE = {
  cami: "cami", liman: "vapur", ambar: "ambar", tersane: "capa", kulube: "balik", ahir: "ahir", itfaiye: "kamyon",
  garaj: "kamyon", bufe: "fincan", karakol: "kalkan", muhtarlik: "kamu", adliye: "terazi", okul: "okul", saglik: "saglik",
  belediye: "kamu", kahvehane: "fincan", kafe: "fincan", firin: "ekmek", market: "sepet", otel: "yatak", kutuphane: "kitap",
  muze: "kamu", plaza: "bina", atolye: "bina", carsi: "sepet",
};
/** Araç türü → simge. */
export const ARAC_SIMGE = { zeplin: "zeplin", car: "araba", taxi: "taksi", bus: "otobus", ambulans: "ambulans", itfaiye: "kamyon", cop: "kamyon" };
/** Haritadaki yerler → simge. */
export const YER_SIMGE = {
  "Town Green": "cesme", "Ferry Landing": "vapur", "Harbor Walk": "dalga", "Kettle Pond Park": "agac", "Ocean Beach": "semsiye",
  "Bluff Head": "dag", "Gull Point Light": "fener", "Cranberry Bog": "basak", "Apple Orchard": "basak", "Driftwood Blimp": "zeplin",
};
