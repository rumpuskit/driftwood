// Dışarıdaki etkinlikler ve günün olayı. Plan (sim.js) yalnız "dışarı çıkış" saatlerini verir; nereye gidilip
// ne yapılacağı burada seçilir: saat, gün, mevsim, adada açık olan yerler ve kişinin sevdiği etkinlikler
// belirler. Açılmamış yerin etkinliği seçilmez; ada büyüdükçe liste uzar. Her şey günden ve kişiden türetilir:
// herkes aynı anda aynı şeyi görür.
//
// Günün olayı (dayTheme): her gün adaya bir hava verir (pazar keyfi, uçurtma günü, plajda sinema...); seçimde
// ilgili etkinliklerin ağırlığı artar ve üst panelde "Bugün" satırında görünür.
import * as THREE from "three";
import { roll, weekday } from "../sim.js";
import { moonPhase, sunTimes } from "./sky.js";
import { votedFilm, votedTheme } from "../tercih.js";

const frac = (n) => (n >>> 0) / 4294967296;

/**
 * Etkinlikler. mode: people.js'teki davranış; yer: kartta ve yolculukta görünen yer (people override);
 * ad: kartta "Şimdi" satırı; gerek(c): adada var mı; saat(seg, c): bu çıkışa uyar mı; w: temel ağırlık.
 * c: { w: dünya, pools, groupPools, dog, sun: {rise, set}, theme, workplace(kind) }
 */
export const ETKINLIK = {
  meydan_sohbet: { ad: "Meydanda", mode: "group:meydan", yer: "meydan", w: 7, sosyal: true },
  meydan_bank: { ad: "Meydanda bankta oturuyor", mode: "seat:meydan", yer: "meydan", w: 4, sosyal: true },
  kafe: { ad: "Kafede oturuyor", mode: "seat:kafe", yer: "meydan", w: 6, sosyal: true, gerek: (c) => c.pools["seat:kafe"]?.length, saat: (s) => s.bas >= 480 && s.bas < 1380 },
  carsi: { ad: "Çarşıda vitrinlere bakıyor", mode: "shop", yer: "meydan", w: 5, gerek: (c) => !!c.w.carsiWalks, saat: (s) => s.bas >= 570 && s.bas < 1260 },
  kahvehane: { ad: "Kahvehanede", mode: "inside:kahvehane", yer: "kahvehane", w: 5, sosyal: true, gerek: (c) => !!c.w.places.kahvehane, saat: (s) => s.bas >= 420 },
  kahvehane_bahce: { ad: "Kahvehanenin önünde çay içiyor", mode: "seat:kahvehane", yer: "kahvehane", w: 3, sosyal: true, gerek: (c) => c.pools["seat:kahvehane"]?.length, saat: (s) => s.bas >= 420 },
  park: { ad: "Parkta", mode: "group:park", yer: "park", w: 5, sosyal: true, gerek: (c) => !!c.w.places.park, saat: (s) => s.bas >= 390 && s.bas < 1320 },
  park_bank: { ad: "Parkta bankta oturuyor", mode: "seat:park", yer: "park", w: 3, gerek: (c) => c.pools["seat:park"]?.length, saat: (s) => s.bas >= 390 && s.bas < 1320 },
  sahil_yolu: { ad: "Sahil yolunda yürüyüşte", mode: "stroll", yer: "sahil_yolu", w: 5, gerek: (c) => !!c.w.places.sahil_yolu, saat: (s, c) => s.bas >= c.sun.rise - 30 && s.bas < 1350 },
  pazar: { ad: "Pazarda alışverişte", mode: "stroll", yer: "pazar", w: 4, gerek: (c) => !!c.w.places.pazar, saat: (s) => s.bas >= 480 && s.bas < 1170 },
  piknik: { ad: "Piknikte", mode: "group:piknik", yer: "tepe", w: 3, sosyal: true, gerek: (c) => c.groupPools.piknik?.length, saat: (s, c) => s.bas >= 600 && s.son <= c.sun.set + 30 && s.son - s.bas >= 60 },
  tepe_yuruyus: { ad: "Tepeye yürüyüşte", mode: "hike", yer: "tepe", w: 3, saat: (s, c) => s.bas >= c.sun.rise + 20 && s.bas <= c.sun.set - 50 },
  plaj_yuruyus: { ad: "Kumsalda yürüyüşte", mode: "beachwalk", yer: "plaj", w: 4, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set + 70 },
  kosu: { ad: "Koşuya çıktı", mode: "jog:plaj", yer: "plaj", w: 1.5, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set + 40 },
  gun_batimi: { ad: "Gün batımını izliyor", mode: "sunset", yer: "fener", w: 9, gerek: (c) => c.pools.sunset?.length, saat: (s, c) => s.bas <= c.sun.set + 5 && s.son >= c.sun.set - 25 && s.bas >= c.sun.set - 120 },
  vapur: { ad: "İskelede vapuru izliyor", mode: "pier", yer: "iskele_vapur", w: 3, gerek: (c) => c.pools.pier?.length, saat: (s) => s.bas >= 360 && s.bas < 1380 },
  tas: { ad: "Kıyıda taş sektiriyor", mode: "skip", yer: "plaj", w: 2, gerek: (c) => c.pools.skip?.length, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set },
  kiyi_balik: { ad: "Kıyıdan balık tutuyor", mode: "fish", yer: "kiyi", w: 2, gerek: (c) => c.pools.fish?.length, saat: (s) => s.bas >= 330 && s.bas < 1320 },
  fotograf: { ad: "Manzara fotoğrafı çekiyor", mode: "view", yer: "fener", w: 1.5, gerek: (c) => c.pools.view?.length, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set },
  kapi_onu: { ad: "Kapı önünde", mode: "kapi", yer: "kapi", w: 5, sosyal: true, saat: (s) => s.bas >= 960 && s.bas < 1380 },
  yildiz: { ad: "Tepede yıldızları izliyor", mode: "stars", yer: "tepe", w: 1.5, gerek: (c) => c.pools.stars?.length, saat: (s, c) => s.bas >= c.sun.set + 75 && s.son - s.bas >= 45 },
  market: { ad: "Markette alışverişte", mode: "inside:market", yer: "market", w: 3, gerek: (c) => !!c.workplace("market"), saat: (s) => s.bas >= 480 && s.bas < 1320 && s.son - s.bas <= 80 },
  firin: { ad: "Fırında simit alıyor", mode: "inside:firin", yer: "firin", w: 2, gerek: (c) => !!c.workplace("firin"), saat: (s) => s.bas >= 420 && s.bas < 1200 && s.son - s.bas <= 70 },
  cami: { ad: "Camide", mode: "inside:cami", yer: "cami", w: 1.2, gerek: (c) => !!c.workplace("cami"), saat: (s) => s.son - s.bas <= 90 },
  ucurtma: { ad: "Uçurtma uçuruyor", mode: "kite", yer: "tepe", w: 0.4, gerek: (c) => c.pools.kite?.length, saat: (s, c) => s.bas >= c.sun.rise + 30 && s.bas <= c.sun.set - 30 },
  kopek: { ad: "Köpeğini gezdiriyor", mode: "stroll", yer: "plaj", w: 0, kopek: 9, saat: (s, c) => s.bas >= c.sun.rise - 30 && s.bas < 1380 },
  sinema: { ad: "Plajda açık hava sinemasında", mode: "seat:sinema", yer: "plaj", w: 0, gerek: (c) => c.pools["seat:sinema"]?.length, saat: (s, c) => c.theme?.id === "sinema" && s.bas < c.theme.son - 30 && s.son > c.theme.bas + 20 },
  temizlik: { ad: "Sahil temizliğinde", mode: "cleanup", yer: "plaj", w: 0, saat: (s, c) => c.theme?.id === "temizlik" && s.bas < c.theme.son && s.son > c.theme.bas },
};
const IDS = Object.keys(ETKINLIK);
// Herkesin sevdiği üç etkinlik (yeri adada açıldıkça devreye girer): seçimde üç kat ağırlık.
const SEVILEN = IDS.filter((id) => ETKINLIK[id].w > 0 && !id.startsWith("meydan"));

export function favorites(seed) {
  const out = [];
  for (let n = 0; out.length < 3 && n < 20; n++) {
    const id = SEVILEN[roll(seed, "sevilen", n) % SEVILEN.length];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Günün olayı. id, ad (üst panel), yer (kamera için yer anahtarı), isteğe bağlı saat aralığı (bas, son) ve
 * etkinlik ağırlık çarpanları. Takvime bağlı olanlar önce (cuma, cumartesi, pazar), diğer günler sırayla döner.
 */
export function dayTheme(day, world) {
  const wd = weekday(day);
  const sun = sunTimes(day);
  const has = (kind) => world.workplaces[kind]?.some(Boolean);
  if (wd === 4 && has("cami")) return { id: "cuma", ad: "Cuma namazı", yer: "cami", bas: 750, son: 830, boost: { cami: 45 } };
  if (wd === 5) return { id: "sinema", ad: "Plajda açık hava sineması", yer: "plaj", bas: 1230, son: 1365, boost: { sinema: 1 } };
  if (wd === 6) return { id: "pazar", ad: "Pazar keyfi: piknik ve yürüyüş", yer: "tepe", boost: { piknik: 6, tepe_yuruyus: 2.5, plaj_yuruyus: 2, kosu: 2, firin: 2 } };
  const moon = moonPhase(day, 1320);
  const list = [
    { id: "ucurtma", ad: "Rüzgârlı gün: tepede uçurtma", yer: "tepe", boost: { ucurtma: 30, plaj_yuruyus: 1.5 } },
    { id: "gunbatimi", ad: `Açık hava: gün batımı ${fmtMin(sun.set)}`, yer: "fener", boost: { gun_batimi: 3, fotograf: 4, tepe_yuruyus: 1.5 } },
    { id: "balik", ad: "Balık bereketi: herkes kıyıda", yer: "iskele", boost: { kiyi_balik: 8, vapur: 2 } },
    { id: "temizlik", ad: "Sahil temizliği", yer: "plaj", bas: 600, son: 720, boost: { temizlik: 1 } },
    ...(moon < 0.12 || moon > 0.88 ? [{ id: "yildiz", ad: "Aysız gece: tepede yıldızlar", yer: "tepe", boost: { yildiz: 12 } }] : []),
    ...(world.places.kahvehane ? [{ id: "tavla", ad: "Kahvehanede tavla turnuvası", yer: "kahvehane", boost: { kahvehane: 3, kahvehane_bahce: 4 } }] : []),
    { id: "komsuluk", ad: "Komşuluk günü: kapı önleri dolu", yer: "meydan", boost: { kapi_onu: 3, piknik: 1.5 } },
  ];
  // Sitedeki ankette bir gün önceden oylanan olay (oy varsa) sıranın yerine geçer.
  const voted = votedTheme(day);
  const pick = list.find((t) => t.id === voted);
  if (pick) return { ...pick, oylama: true };
  return list[roll(day, "gunun_olayi") % list.length];
}

const fmtMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

/**
 * Bir çıkış için etkinlik seçer. seg: plan parçası; k: sırası; hobby: hobi çıkışıysa true (yalnız bazı günler
 * değişir); c: bağlam. Uygun etkinlik yoksa null (eski davranış: meydan).
 */
export function chooseActivity(seed, day, k, seg, c, fav) {
  const opts = [];
  let total = 0;
  for (const id of IDS) {
    const e = ETKINLIK[id];
    if (e.gerek && !e.gerek(c)) continue;
    if (e.saat && !e.saat(seg, c)) continue;
    let w = e.w;
    if (e.kopek) w = c.dog ? e.kopek : 0;
    if (fav.includes(id)) w *= 3;
    w *= c.theme?.boost?.[id] ?? 1;
    if (id === "sinema" || id === "temizlik") w = c.theme?.boost?.[id] ? 40 : 0; // olay saatindeki herkesin çoğu katılır
    if (w <= 0) continue;
    opts.push([id, w]);
    total += w;
  }
  if (!total) return null;
  let x = frac(roll(seed, "etkinlik", day * 16 + k)) * total;
  for (const [id, w] of opts) { if (x < w) return id; x -= w; }
  return opts[opts.length - 1][0];
}

/**
 * Plajda açık hava sineması: perde (gece ışıklı, oynayan film) ve sandalye sıraları. Kumsalda engelsiz bir
 * yer bulunamazsa kurulmaz. seats: oturma yerleri (people.js "seat:sinema" havuzu).
 */
// Film türü (haftalık ankette kazanan; yoksa komedi): perdedeki gökyüzü, ışık ve silüetler.
const FILMS = {
  komedi: { skies: [["#87c3e8", "#f6f4ef"], ["#f2c230", "#fff3c4"]], walk: 18 },
  macera: { skies: [["#1b2a4a", "#f2a65a"], ["#0f2a2a", "#2f9c9a"]], walk: 34 },
  korku: { skies: [["#0b0b14", "#3a1022"], ["#120f1f", "#2b1d3a"]], walk: 8 },
  animasyon: { skies: [["#7ad1c4", "#f6b2d6"], ["#b5a6ef", "#fde2a8"]], walk: 22 },
};

export function buildCinema(world) {
  const beach = world.places.plaj?.anchors ?? [];
  const sand = (x, z) => world.isWalkable(x, z) && world.height(x, z) > 0.25;
  let spot = null;
  for (const [bx, bz] of [...beach].sort((a, b) => Math.abs(a[0] - beach[beach.length >> 1][0]) - Math.abs(b[0] - beach[beach.length >> 1][0]))) {
    // Perde denize yakın (kıyıya bakarak), sıralar onun kara tarafında.
    let ok = sand(bx, bz + 3);
    for (let r = 0; r < 4 && ok; r++) for (let cI = -3; cI <= 3 && ok; cI++) ok = sand(bx + cI * 1.1, bz - 3 - r * 1.3);
    if (ok) { spot = [bx, bz]; break; }
  }
  if (!spot) return null;
  const [sx, sz] = spot;
  const group = new THREE.Group();
  group.visible = false;
  const gy = (x, z) => world.groundY(x, z);
  // Perde: iki direk, çerçeve, film tuvali (gece parlar).
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const frame = new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.7 });
  const y0 = gy(sx, sz + 3);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), screenMat);
  screen.position.set(sx, y0 + 3.0, sz + 3);
  screen.rotation.y = Math.PI; // kara tarafına (-z) bakar
  const back = new THREE.Mesh(new THREE.BoxGeometry(6.7, 3.5, 0.08), frame);
  back.position.set(sx, y0 + 3.0, sz + 3.05);
  group.add(screen, back);
  for (const dx of [-3.35, 3.35]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 4.8, 8), frame);
    post.position.set(sx + dx, y0 + 2.4, sz + 3.08);
    group.add(post);
  }
  // Sandalyeler: 4 sıra × 7 (katlanır plaj sandalyesi).
  const chairGeo = new THREE.BoxGeometry(0.46, 0.06, 0.44).translate(0, 0.42, 0);
  const backGeo = new THREE.BoxGeometry(0.46, 0.5, 0.05).translate(0, 0.7, -0.22);
  const legGeo = new THREE.BoxGeometry(0.42, 0.42, 0.04).translate(0, 0.21, 0);
  const seats = [];
  const n = 28;
  const meshes = [chairGeo, backGeo, legGeo].map((g, j) => new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: j === 2 ? "#3a3d44" : "#ffffff", roughness: 0.6 }), n));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  const colors = ["#e9667f", "#2f9c9a", "#f2c230", "#f6f4ef"].map((h) => new THREE.Color(h));
  let idx = 0;
  for (let r = 0; r < 4; r++) for (let cI = -3; cI <= 3; cI++) {
    const x = sx + cI * 1.1 + (r % 2 ? 0.3 : 0), z = sz - 3 - r * 1.3;
    const y = gy(x, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0); // perdeye (+z) bakar
    m4.compose(pos.set(x, y, z), q, one);
    for (const mesh of meshes) mesh.setMatrixAt(idx, m4);
    meshes[0].setColorAt(idx, colors[(idx * 7) % 4]);
    meshes[1].setColorAt(idx, colors[(idx * 7) % 4]);
    seats.push({ x, z, heading: 0, top: y + 0.45, place: "sinema" });
    idx++;
  }
  for (const mesh of meshes) { mesh.castShadow = true; group.add(mesh); }
  let last = -1, genre = "komedi";
  const draw = (t) => {
    // Basit "film": gökyüzü, ufuk, sahnede yürüyen iki silüet; sahneler 20 sn'de bir değişir.
    const g = cv.getContext("2d");
    const film = FILMS[genre] ?? FILMS.komedi;
    const skies = film.skies[Math.floor(t / 20) % film.skies.length];
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, skies[0]); gr.addColorStop(1, skies[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, 92, 256, 36);
    g.fillStyle = "#111";
    for (const [k, sp] of [[0, film.walk], [1, -film.walk * 0.7]]) {
      const x = ((t * sp + k * 120) % 300 + 300) % 300 - 22;
      g.fillRect(x, 62, 10, 30); g.beginPath(); g.arc(x + 5, 56, 7, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(0, (t * 40) % 128, 256, 2);
    tex.needsUpdate = true;
  };
  return {
    group, seats, spot,
    update(theme, minute, real, day) {
      genre = votedFilm(day) ?? "komedi";
      const on = theme?.id === "sinema" && minute >= theme.bas - 60 && minute <= theme.son + 30;
      group.visible = on;
      screen.visible = on && minute >= theme.bas - 10 && minute <= theme.son;
      if (screen.visible && Math.floor(real * 8) !== last) { last = Math.floor(real * 8); draw(real); }
    },
  };
}
