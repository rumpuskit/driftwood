// Doğrulanmış sakinlerin tercihleri (Worker /tercihler.json) ve anket sonuçları: adayı herkes için aynı
// biçimde giydirir. Ev içi renkleri (interior.js), pencere perdesi (main.js pencere rengi) ve çiçekleri
// (buildFlowers), evcil adı (story.js), günün etkinliği ve buluşma (people.js) buradan okur.
// Seçenek listeleri Worker'daki (sayac/src/kayit.js SECENEK) ile aynı olmalı.
import * as THREE from "three";

export const SECENEK = {
  duvar: ["#f4efe6", "#f6d9d0", "#dfe9d8", "#d8e4f0", "#efe2c4", "#e6dcef", "#f3e0c9", "#d9e8e6"],
  koltuk: ["#7a8fb8", "#c96f62", "#6f9a72", "#d9a441", "#8a6fb0", "#4f5560"],
  perde: ["#ffffff", "#f2c9cf", "#cfe3f2", "#f5e3a8", "#c9e4c5", "#e0d2f0"],
  cicek: ["yok", "sardunya", "lavanta", "papatya", "begonvil", "kaktus"],
  evcil_ad: ["Pamuk", "Boncuk", "Duman", "Tarçın", "Zeytin", "Fıstık", "Karamel", "Paşa", "Minnoş", "Bulut", "Şeker", "Limon",
    "Mavi", "Kömür", "Badem", "Cimcime", "Lokum", "Prens", "Prenses", "Tekir", "Sarman", "Haydut", "Kont", "Bıdık", "Çakıl",
    "Kurabiye", "Mısır", "Poyraz", "Lodos", "Yakamoz", "Mercan", "Simit", "Kahve", "Tontiş", "Gece", "Ponçik", "Ayva", "Nane"],
  etkinlik: ["piknik", "tepe_yuruyus", "plaj_yuruyus", "kosu", "gun_batimi", "vapur", "kiyi_balik", "kapi_onu", "yildiz",
    "kahvehane", "kafe", "carsi", "ucurtma", "fotograf", "tas", "meydan_sohbet"],
};
export const CICEK_AD = { yok: "Yok", sardunya: "Sardunya", lavanta: "Lavanta", papatya: "Papatya", begonvil: "Begonvil", kaktus: "Kaktüs" };
const CICEK_RENK = { sardunya: ["#d8343f", "#e85a64"], lavanta: ["#8e6fc9", "#a98bd9"], papatya: ["#ffffff", "#f6d24a"], begonvil: ["#d6328f", "#e85aa8"], kaktus: ["#4f8a4a", "#6aa35e"] };
export const TEMA_SECENEK = ["ucurtma", "gunbatimi", "balik", "temizlik", "yildiz", "tavla", "komsuluk"];
export const TEMA_AD = { ucurtma: "Uçurtma günü", gunbatimi: "Gün batımı", balik: "Balık bereketi", temizlik: "Sahil temizliği", yildiz: "Yıldız gecesi", tavla: "Tavla turnuvası", komsuluk: "Komşuluk günü" };
export const FILM_SECENEK = ["komedi", "macera", "korku", "animasyon"];
export const FILM_AD = { komedi: "Komedi", macera: "Macera", korku: "Korku", animasyon: "Animasyon" };

let byHandle = {}, bySlot = new Map(), themeVotes = {}, filmVotes = {};

/** Tercihler yüklenince (ya da kişi kendi tercihini değiştirince) çağrılır. */
export function setPrefs(data, residents) {
  byHandle = data ?? {};
  bySlot = new Map(residents.filter((r) => r.handle && byHandle[r.handle]).map((r) => [r.slot, byHandle[r.handle]]));
}
export const prefFor = (slot) => bySlot.get(slot) ?? null;
export const prefOf = (handle) => (handle ? byHandle[handle] ?? null : null);

/** Gün numarası (Türkiye takvimi, sim.dayOf) → "YYYY-AA-GG". */
export const dateKey = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
/** ISO hafta: "YYYY-Www" (film anketi). */
export function weekKey(day) {
  const d = new Date(day * 86400000);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd + 3);
  const y = d.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

/** Anket sonuçları: { "tema:YYYY-AA-GG": {sonuc}, "film:YYYY-Www": {sonuc} }. */
export function setVotes(res) {
  for (const [id, v] of Object.entries(res ?? {})) {
    if (id.startsWith("tema:")) themeVotes[id.slice(5)] = v.sonuc ?? {};
    if (id.startsWith("film:")) filmVotes[id.slice(5)] = v.sonuc ?? {};
  }
}
/** Oylamada kazanan (eşitlikte listedeki sıra); oy yoksa null. */
function winner(counts, order) {
  let best = null, n = 0;
  for (const id of order) if ((counts?.[id] ?? 0) > n) { n = counts[id]; best = id; }
  return best;
}
export const votedTheme = (day) => winner(themeVotes[dateKey(day)], TEMA_SECENEK);
export const votedFilm = (day) => winner(filmVotes[weekKey(day)], FILM_SECENEK);

/** Pencere perdesi: gündüz camın rengini perdeye doğru, gece ışığı biraz perde tonunda. */
const tmp = new THREE.Color();
export function curtain(slot, base, night, lit) {
  const p = prefFor(slot)?.perde;
  if (!p) return base;
  tmp.set(p);
  return base.lerp(tmp, lit ? 0.3 * night : 0.55 * (1 - night) + 0.15 * night);
}

/**
 * Pencere çiçeklikleri: çiçek seçen dairelerin pencerelerinin altına saksı ve çiçekler. windows: city.js
 * windowInfo ([{slot, x, y, z, nx, nz, w}]). Yeniden kurulabilir (tercih değişince).
 */
export function buildFlowers(windows) {
  const group = new THREE.Group();
  const list = windows.filter((w) => w.slot != null && prefFor(w.slot)?.cicek && prefFor(w.slot).cicek !== "yok");
  if (!list.length) return group;
  const box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.2, 0.26), new THREE.MeshStandardMaterial({ color: "#9a6a44", roughness: 0.8 }), list.length);
  const per = 5;
  const bloom = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.085, 0), new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), list.length * per);
  const leaf = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 0.18), new THREE.MeshStandardMaterial({ color: "#4f8a4a", roughness: 0.8 }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((w, i) => {
    const rot = Math.atan2(w.nx, w.nz);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const bx = w.x + w.nx * 0.22, bz = w.z + w.nz * 0.22, by = w.y - 0.2;
    m.compose(p.set(bx, by, bz), q, s.set(w.w + 0.1, 1, 1)); box.setMatrixAt(i, m);
    m.compose(p.set(bx, by + 0.14, bz), q, s.set(w.w, 1, 1)); leaf.setMatrixAt(i, m);
    const cols = CICEK_RENK[prefFor(w.slot).cicek] ?? ["#d8343f", "#e85a64"];
    for (let k = 0; k < per; k++) {
      const t = (k + 0.5) / per - 0.5;
      const ox = Math.cos(rot) * t * w.w, oz = -Math.sin(rot) * t * w.w;
      m.compose(p.set(bx + ox, by + 0.22 + (k % 2) * 0.05, bz + oz), q, s.set(1, 1, 1));
      bloom.setMatrixAt(i * per + k, m);
      bloom.setColorAt(i * per + k, c.set(cols[k % 2]));
    }
  });
  for (const mesh of [box, leaf, bloom]) { mesh.castShadow = false; group.add(mesh); }
  return group;
}
