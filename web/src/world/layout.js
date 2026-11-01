// Adanın yerleşimi: nüfustan deterministik olarak hesaplanır. Aynı nüfus her cihazda aynı adayı verir.
// Ölçek gerçektir: 1 birim = 1 metre.
//
// Dünya hücrelere bölünür (CELL_W x CELL_D). Ortada çarşı (merkez), doğusunda tepe ve fener, batısında
// tarlalar ve plaj sabittir. Mahalleler kuzeye ve yanlara, merkeze olan uzaklık sırasıyla eklenir; her
// yeni mahalle adanın kıyısını genişletir. Koordinatlar: x doğu, z güney, y yukarı.
//
// Gelişim: ada her zaman tam haliyle hesaplanır (her şeyin yeri sabittir), ama yalnızca açılmış parçalar
// kurulur. Her bina, yol, alan ve süs bir gelişim anahtarıyla etiketlenir (sim.js stageOf); düzey o
// anahtarın nüfusuna ulaşmamışsa ayıklanır. Boş adada yalnız vapur iskelesi, patikalar, çeşmeli meydan,
// tepe ve fener vardır; evler sakinler geldikçe, gerisi gelişim tablosuna göre açılır.
import { addressParts, cap, cat, isOpen, mahalleName, sokakName, stageOf, townLevel } from "../sim.js";
import { fbm, hash2 } from "./noise.js";
import { buildNetwork, H as LAYER, stations } from "./roads.js";

export const CELL_W = 560; // mahalle hücresi: 4 sokak sütunu + iki yanda 27 m'lik mahalle yerleri şeridi
export const CELL_D = 270;
export const FLAT_Y = 1.2;
export const FLOOR_H = 3.2;

const HUB = [0, 0];
const MEYDAN_R = 30;

// Yol kesitleri (toplam genişlik = taşıt yolu + iki kaldırım).
export const ROADS = {
  cadde: { width: 14, carriage: 8, surface: "asfalt" },
  sokak: { width: 13, carriage: 8, surface: "parke" }, // iki dar şerit + iki yanda kenar parkı
  koy: { width: 6.5, carriage: 6.5, surface: "asfalt" },
  yaya: { width: 14, carriage: 0, surface: "tas" },
  sahil: { width: 7, carriage: 0, surface: "tas" },
  patika: { width: 2.6, carriage: 0, surface: "toprak" },
  giris: { width: 6, carriage: 6, surface: "asfalt" }, // otopark, hastane ve garaj girişi
};

// Mahalle içi: orta caddenin iki yanında 4 sütun x 5 sıra sokak, her sokakta karşılıklı 5+5 apartman.
const ROW_Z0 = -100;
const ROW_PITCH = 50;
const SOKAK_COLS = [[-245, -130], [-125, -10], [10, 125], [130, 245]];
const LOT = 23; // parsel genişliği
const BINA_D = 12;

// İş yeri türlerinin bina biçimi (metre).
const STYLES = {
  belediye: { w: 30, d: 20, floors: 3, roof: "hip", wall: "#f3ece0", roofColor: "#b5563f", tower: true },
  muze: { w: 26, d: 18, floors: 2, roof: "hip", wall: "#efe6d6", roofColor: "#8c4b3a", columns: true },
  kutuphane: { w: 20, d: 14, floors: 2, roof: "gable", wall: "#dfe8f0", roofColor: "#a85a44" },
  saglik: { w: 26, d: 16, floors: 3, roof: "flat", wall: "#f7f6f2", roofColor: "#c9c4bb", sign: "#d8433d" },
  okul: { w: 40, d: 16, floors: 3, roof: "hip", wall: "#f2d9a6", roofColor: "#b5563f" },
  otel: { w: 26, d: 16, floors: 6, roof: "flat", wall: "#e9f1ee", roofColor: "#c9c4bb", balconies: true },
  plaza: { w: 22, d: 22, floors: 9, roof: "flat", wall: "#cfdbe6", roofColor: "#9aa6b2", glass: true },
  market: { w: 24, d: 18, floors: 1, roof: "flat", wall: "#f4efe6", roofColor: "#c9c4bb", shop: true, awning: "#3e8a86" },
  firin: { w: 10, d: 12, floors: 3, roof: "gable", wall: "#f3dcc4", roofColor: "#b5563f", shop: true, awning: "#a8543a" },
  kafe: { w: 10, d: 12, floors: 3, roof: "gable", wall: "#f6e3d8", roofColor: "#b5563f", shop: true, awning: "#2f4a6d" },
  atolye: { w: 16, d: 14, floors: 2, roof: "gable", wall: "#e6e1d6", roofColor: "#8c4b3a", shop: true, awning: "#6f7d4a" },
  kahvehane: { w: 11, d: 12, floors: 2, roof: "gable", wall: "#eadfcf", roofColor: "#a85a44", shop: true, awning: "#b8423c" },
  karakol: { w: 22, d: 14, floors: 3, roof: "flat", wall: "#eef1f4", roofColor: "#c9c4bb", band: "#1f3f73", plate: "#1f3f73", flag: true },
  adliye: { w: 28, d: 18, floors: 3, roof: "flat", wall: "#efe9df", roofColor: "#c9c4bb", columns: true, plate: "#5a4636", flag: true },
  muhtarlik: { w: 11, d: 6, floors: 1, roof: "hip", wall: "#f4efe6", roofColor: "#b5563f", plate: "#2f5d8a", flag: true },
};

// Şubelerin kendi cephe kimliği (tente ve duvar rengi): aynı türden işletmeler birbirinin kopyası olmasın.
const BRANCH = {
  "kafe:0": { awning: "#2f4a6d", wall: "#f6e3d8" }, // Yakamoz Kafe: lacivert, modern
  "kafe:1": { awning: "#7a3a2a", wall: "#efdcc4", signFont: "serif", signFg: "#f3d9a4" }, // Lodos Kahvesi: kahve kızılı, geleneksel
  "kafe:2": { awning: "#3e8a5a", wall: "#eef1e4", signFont: "serif" }, // İskele Çay Bahçesi: çay yeşili
  "kafe:3": { awning: "#2f7fb5", wall: "#f4f7fa" }, // Martı Kafe: denizci mavisi
  "kafe:4": { awning: "#d9a441", wall: "#f6ecd6" }, // Kumsal Kahvecisi: kum sarısı
  "kafe:5": { awning: "#e0607a", wall: "#eaf2f4" }, // Dalga Kafe: canlı mercan
  "firin:0": { awning: "#a8543a", wall: "#f3dcc4" }, // Driftwood Fırını
  "firin:1": { awning: "#c9573a", wall: "#f7e9cf" }, // Simitçi Martı: simit kırmızısı
  "firin:2": { awning: "#5a4a3a", wall: "#e2d6c4", signFont: "serif", signFg: "#f0d7a8" }, // Taş Fırın: taş ve is
  "market:0": { awning: "#3e8a86" }, // Ada Market
  "market:1": { awning: "#2f5d8a", wall: "#efe9dc", signFont: "serif" }, // Liman Bakkalı
  "market:2": { awning: "#5f8a37", wall: "#f1ead6" }, // Yokuş Manavı
  "market:3": { awning: "#8a2f3a", wall: "#f3ece2", signFont: "serif", signFg: "#f3e2b8" }, // Driftwood Şarküteri
  "atolye:0": { awning: "#b5653f" }, // Seramik Atölyesi
  "atolye:1": { awning: "#7a5a3e", wall: "#e8dcc8", signFont: "serif" }, // Marangozhane
  "atolye:2": { awning: "#7a6a9a", wall: "#eee8f0" }, // Resim Atölyesi
  "atolye:3": { awning: "#2f5d8a", wall: "#eef2f5" }, // Yelken Atölyesi
};

// Çarşı dükkânlarının zanaatları (iç düzeni isletme.js) ve tabeladaki ad: "Liman Berberi", "Lodos Terzisi"...
const DUKKANLAR = [
  ["berber", "Berberi"], ["terzi", "Terzisi"], ["kirtasiye", "Kırtasiyesi"], ["cicekci", "Çiçekçisi"],
  ["aktar", "Aktarı"], ["nalbur", "Nalburu"], ["kuyumcu", "Kuyumcusu"], ["kitapci", "Kitabevi"],
];
const CARSI_ON = ["Çarşı", "Liman", "Lodos", "Yakamoz", "Mercan", "Poyraz", "Dalga", "Kumsal", "Martı", "İskele", "Yokuş", "Meydan"];

// Merkezdeki iş yerleri; sırayla meydana en yakın boş cepheye yerleşir.
const CENTER_ORDER = [
  ["belediye", 0], ["kahvehane", 0], ["kafe", 0], ["muze", 0], ["firin", 0], ["kafe", 1], ["market", 0],
  ["karakol", 0], ["adliye", 0], // sonradan eklendi: buradan önce açılanların yeri değişmesin diye marketin arkasında
  ["kutuphane", 0], ["kafe", 2], ["plaza", 0], ["firin", 1], ["otel", 0], ["kafe", 3], ["market", 1],
  ["plaza", 1], ["atolye", 0], ["kafe", 4], ["market", 2], ["firin", 2], ["otel", 1], ["atolye", 1],
  ["kafe", 5], ["plaza", 2], ["market", 3], ["atolye", 2], ["atolye", 3],
];

// Konut cephe renkleri: Ege ve Marmara ada evleri.
const HOUSE_WALLS = ["#f4efe6", "#f3e3c8", "#e9d3c0", "#dfe7e4", "#f1d7cf", "#e8e0cf", "#f6f1e9", "#d9e2ea", "#efdcb8", "#e6d2d8"];
const HOUSE_ROOFS = ["#b5563f", "#a85a44", "#c06a4c", "#8c4b3a", "#9e5a48"];

const OUTDOOR_KINDS = new Set(["liman", "balikci_koyu", "tersane", "tarla", "plaj", "fener", "saha"]);

// Gelişim anahtarıyla etiketlenen listeler.
const TAGGED = ["buildings", "roads", "plazas", "features", "labels", "seats", "lamps", "piers", "parks"];
// Tek nesne olarak tutulan yerler ve açıldıkları anahtar.
const REFS = {
  carsiWalks: "carsi_yol", pitch: "saha", hospital: "saglik:0", port: "liman:0", tersane: "tersane:0",
  koy: "balikci_koyu:0", promenade: "sahil_yolu", fireStation: "itfaiye", depot: "garaj", beach: "plaj:0",
};

// Yol yüksekliği için yumuşatma çekirdeği (12 m çapında, ağırlıklı).
const KERNEL = (() => {
  const k = [[0, 0, 4]];
  for (const r of [3, 6]) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r; k.push([Math.cos(a) * r, Math.sin(a) * r, r === 3 ? 2 : 1]); }
  const sum = k.reduce((t, [, , w]) => t + w, 0);
  return k.map(([x, z, w]) => [x, z, w / sum]);
})();

/** Mahalle hücrelerinin sırası: merkeze yakından uzağa; güney kıyısı (liman tarafı) hiç kapanmaz. */
const MAHALLE_CELLS = (() => {
  const cells = [];
  for (let cz = -9; cz <= 0; cz++) {
    for (let cx = -7; cx <= 7; cx++) {
      if (cz === 0 && Math.abs(cx) <= 1) continue;
      cells.push([cx, cz]);
    }
  }
  const key = ([cx, cz]) => (cx * CELL_W) ** 2 + (cz * CELL_D * 1.6) ** 2;
  return cells.sort((a, b) => key(a) - key(b) || Math.atan2(a[0], -a[1]) - Math.atan2(b[0], -b[1]));
})();

export function perMahalle() {
  return cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle");
}

export function mahalleCount(population) {
  return Math.max(1, Math.ceil(population / perMahalle()));
}

/** Yolları 40 m'lik ızgarada tutar: bir noktanın hangi yolun üstünde olduğunu hızlıca bulur. */
export class RoadIndex {
  constructor(roads) {
    this.cells = new Map();
    roads.forEach((road) => {
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
        const pad = road.width / 2 + 1;
        for (let gx = Math.floor((Math.min(ax, bx) - pad) / 40); gx <= Math.floor((Math.max(ax, bx) + pad) / 40); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - pad) / 40); gz <= Math.floor((Math.max(az, bz) + pad) / 40); gz++) {
            const key = gx * 100003 + gz;
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push({ road, ax, az, bx, bz });
          }
        }
      }
    });
  }

  /** Noktanın üstünde olduğu yol (en geniş olanı) ve merkez çizgisine uzaklığı; yoksa null. */
  at(x, z, margin = 0) {
    const list = this.cells.get(Math.floor(x / 40) * 100003 + Math.floor(z / 40));
    let best = null;
    for (const s of list ?? []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
      if (d < s.road.width / 2 - margin && (!best || s.road.width > best.road.width)) best = { road: s.road, dist: d };
    }
    return best;
  }
}

function rectSdf(x, z, r) {
  const dx = Math.max(r.x0 - x, x - r.x1);
  const dz = Math.max(r.z0 - z, z - r.z1);
  return dx > 0 || dz > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) : Math.max(dx, dz);
}

export class World {
  constructor(population) {
    this.population = population;
    this.level = townLevel(); // gelişim düzeyi: en yüksek nüfus (main.js sim.setTown ile verir)
    this.mahalleler = mahalleCount(population);
    this.cells = [
      { cx: 0, cz: 0, type: "merkez" },
      { cx: 1, cz: 0, type: "tepe" },
      { cx: -1, cz: 0, type: "kir" },
    ];
    for (let m = 0; m < this.mahalleler; m++) {
      const [cx, cz] = MAHALLE_CELLS[m];
      this.cells.push({ cx, cz, type: "mahalle", mahalle: m });
    }
    this.cellByKey = new Map(this.cells.map((c) => [`${c.cx},${c.cz}`, c]));
    this.rects = this.cells.map(({ cx, cz }) => ({
      x0: (cx - 0.5) * CELL_W, x1: (cx + 0.5) * CELL_W, z0: (cz - 0.5) * CELL_D, z1: (cz + 0.5) * CELL_D,
    }));
    this.bounds = this.rects.reduce(
      (b, r) => ({ x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1), z0: Math.min(b.z0, r.z0), z1: Math.max(b.z1, r.z1) }),
      { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity },
    );
    this.hill = { x: CELL_W + 40, z: 10, r: 85, h: 34 };

    this.buildings = [];   // {kind, x, z, rot, w, d, floors, roofType, wall, roof, ...}
    this.roads = [];       // {points, type, width, carriage, surface}
    this.plazas = [];      // {x, z, r} veya {x0, z0, x1, z1, kind}
    this.features = [];    // çeşme, iskele, vapur, fener, bank, ...
    this.labels = [];      // {text, x, z, h}
    this.workplaces = {};  // kind -> [{name, door, path, anchor, spread, outdoor}]
    this.places = {};      // place -> {anchors, spread, path}
    this.blocked = new Set(); // ağaç dikilmeyecek 4x4'lük kareler
    this.seats = [];       // oturulabilecek yerler {x, z, heading, top, place}
    this.piers = [];       // iskeleler {x0, x1, z0, z1, top}
    this.lamps = [];       // yollar dışındaki sokak lambaları {x, z, dir}
    this.buildingBySlot0 = new Map();
    this.parks = [];       // küçük mahalle parkları (ağaç dikilebilir)

    this._roadHCache = new Map();
    this._groundCache = new Map();
    this.cols = new Map(); // x -> [[z0, z1]...]
    this.rows = new Map(); // z -> [[x0, x1]...]: hücre sınırlarındaki doğu-batı caddeleri, birleştirilerek çizilir
    this._key = null;      // şu an kurulan parçanın gelişim anahtarı
    this._blockOps = [];   // ağaç yasağı işlemleri (açılan parçalarınki sonradan uygulanır)
    this._staged = false;

    this._layoutCenter();
    this._layoutCoast();
    this._layoutNature();
    for (const cell of this.cells) if (cell.type === "mahalle") this._layoutMahalle(cell);
    this._emitRows();
    this._applyStage();
    this.network = buildNetwork(this.roads);
    if (!this.vehicles) for (const n of this.network.nodes) n.signal = false; // araç yokken trafik ışığı da yok
    this.roadIndex = new RoadIndex(this.roads);
    this._gradeRoads();
    for (const seat of this.seats) seat.top = this.groundY(seat.x, seat.z) + seat.h;
    this.obstacles = new Set();
    this._markObstacles();
    if (import.meta.env?.DEV || globalThis.location?.search.includes("denetle")) this._validate();
  }

  get flatY() {
    return FLAT_Y;
  }

  // --- gelişim ---

  /** Anahtar açık mı? (anahtarsız parçalar hep açıktır) */
  has(key) {
    return key == null || isOpen(key);
  }

  /** fn içinde eklenen her şeyi anahtarla etiketler (iç içe çağrıda içteki anahtar kalır). */
  _tag(key, fn) {
    const prev = this._key;
    this._key = key;
    const snap = TAGGED.map((n) => this[n].length);
    fn();
    TAGGED.forEach((n, i) => {
      const list = this[n];
      for (let j = snap[i]; j < list.length; j++) if (list[j]._k === undefined) list[j]._k = key;
    });
    this._key = prev;
  }

  _place(name, place) {
    place._k = this._key;
    this.places[name] = place;
    return place;
  }

  /**
   * Açılmamış parçaları ayıklar ve bir sonraki gelişim adımını (yer, ad, eksik nüfus) hazırlar.
   * Ayıklanan binalar "sites" olur: harita sıradaki yapının yerini gösterir.
   */
  _applyStage() {
    const all = this.buildings;
    const before = Object.fromEntries(TAGGED.map((n) => [n, this[n]]));
    for (const n of TAGGED) this[n] = this[n].filter((x) => this.has(x._k));
    for (const [name, pl] of Object.entries(this.places)) {
      if (!this.has(pl._k)) { delete this.places[name]; continue; }
      if (pl.anchorKeys) {
        pl.anchors = pl.anchors.filter((_, i) => this.has(pl.anchorKeys[i]));
        if (!pl.anchors.length) delete this.places[name];
      }
    }
    for (const list of Object.values(this.workplaces)) list.forEach((w, i) => { if (w && !this.has(w._k)) list[i] = null; });
    for (const [name, key] of Object.entries(REFS)) if (!this.has(key)) this[name] = null;
    if (!this.has("meydan_duzen")) this.flowerBeds = [];
    this.schools = (this.schools ?? []).filter((s) => this.has(s._k));
    this.parkingLots = this.has("cevre_yolu") ? this.parkingLots : [];
    this.vehicles = this.has("cevre_yolu"); // özel araç, taksi, otobüs, hizmet araçları
    this._staged = true;
    for (const [op, x0, z0, x1, z1, pad, key] of this._blockOps) if (this.has(key)) (op ? this.block : this.unblock).call(this, x0, z0, x1, z1, pad);
    this._blockOps = null;

    // Sıradaki adım: kilitli anahtarlar içinde en küçük eşik.
    let next = Infinity;
    const keys = new Set();
    for (const b of all) if (b._k != null && !this.has(b._k)) keys.add(b._k);
    for (const st of cat().gelisim) for (const k of st.acar) if (!this.has(k)) keys.add(k);
    for (const k of keys) next = Math.min(next, stageOf(k));
    this.sites = [];
    this.nextStage = null;
    if (next < Infinity) {
      this._before = before;
      const open = [...keys].filter((k) => stageOf(k) === next);
      this.sites = all.filter((b) => open.includes(b._k));
      const entry = cat().gelisim.find((st) => st.nufus === next);
      this.nextStage = { nufus: next, keys: open, name: entry?.ad ?? stageName(open[0]), at: this._stageSpot(open) };
      this._before = null;
      const at = this.nextStage.at;
      if (at) this.labels.push({ text: `${this.nextStage.name} · ${next}. sakinde`, x: at[0], z: at[1], h: 22, site: true });
    }
  }

  /** Bir gelişim adımının haritadaki yeri (binası varsa binası, yoksa ilk parçası). */
  _stageSpot(keys) {
    const b = this.sites[0];
    if (b) return [b.x, b.z];
    for (const n of ["plazas", "features", "roads", "seats"]) {
      const it = this._before[n].find((x) => keys.includes(x._k));
      if (!it) continue;
      if (it.points) return it.points[Math.floor(it.points.length / 2)];
      if (it.x0 != null) return [(it.x0 + it.x1) / 2, (it.z0 + it.z1) / 2];
      return [it.x, it.z];
    }
    return keys.includes("carsi_yol") ? [0, -80] : null;
  }

  // --- tesviye: eğimli arazide yollar yumuşak bir eğimi izler, altlarındaki arazi yola göre kazılır/doldurulur ---

  /** Yol yüksekliği: arazinin 12 m'lik pencerede yumuşatılmış hali; düz kasabada FLAT_Y. */
  roadH(x, z) {
    const key = Math.round(x * 2) * 100003 + Math.round(z * 2);
    let h = this._roadHCache.get(key);
    if (h === undefined) {
      h = 0;
      for (const [dx, dz, w] of KERNEL) h += w * Math.max(FLAT_Y, this.rawHeight(x + dx, z + dz));
      this._roadHCache.set(key, h);
    }
    return h;
  }

  surfaceY(x, z) {
    return this.roadH(x, z);
  }

  _gradeRoads() {
    this.grade = new Map();
    for (const e of this.network.edges) {
      const hw = e.road.width / 2;
      for (const st of stations(e.pts, 0, 0, 2)) {
        const h = this.roadH(st.p[0], st.p[1]);
        const reach = hw + 4;
        for (let o = -reach; o <= reach; o += 1) {
          const x = st.p[0] + st.n[0] * o, z = st.p[1] + st.n[1] * o;
          const key = Math.floor(x / 2) * 100003 + Math.floor(z / 2);
          const d = Math.abs(o);
          const cur = this.grade.get(key);
          if (!cur || d < cur.d) this.grade.set(key, { h, d, hw });
        }
      }
    }
  }

  // --- engeller: binalar, ağaç gövdeleri, çeşme, bank, masa, lamba... (0,5 m'lik ızgara) ---

  _obKey(x, z) {
    return Math.floor(x * 2) * 100003 + Math.floor(z * 2);
  }

  addObstacleCircle(x, z, r) {
    for (let gx = Math.floor((x - r) * 2); gx <= Math.floor((x + r) * 2); gx++) {
      for (let gz = Math.floor((z - r) * 2); gz <= Math.floor((z + r) * 2); gz++) {
        const cx = gx / 2 + 0.25, cz = gz / 2 + 0.25;
        if (Math.hypot(cx - x, cz - z) <= r + 0.25) this.obstacles.add(gx * 100003 + gz);
      }
    }
  }

  addObstacleRect(x, z, w, d, rot = 0) {
    const c = Math.cos(rot), sn = Math.sin(rot), ext = (Math.abs(w * c) + Math.abs(d * sn) + Math.abs(w * sn) + Math.abs(d * c)) / 2 + 0.5;
    for (let gx = Math.floor((x - ext) * 2); gx <= Math.floor((x + ext) * 2); gx++) {
      for (let gz = Math.floor((z - ext) * 2); gz <= Math.floor((z + ext) * 2); gz++) {
        const dx = gx / 2 + 0.25 - x, dz = gz / 2 + 0.25 - z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.abs(lx) <= w / 2 + 0.25 && Math.abs(lz) <= d / 2 + 0.25) this.obstacles.add(gx * 100003 + gz);
      }
    }
  }

  /** Bir insan (x, z)'de durabilir mi? Engelsiz, karada ya da iskelede. */
  isWalkable(x, z) {
    if (this.obstacles.has(this._obKey(x, z))) return false;
    if (this.piers.some((p) => x > p.x0 + 0.3 && x < p.x1 - 0.3 && z > p.z0 && z < p.z1)) return true;
    return this.height(x, z) > 0.25;
  }

  /** Nokta bir taşıt yolunun (şeritler ve kenar parkı) üstünde mi? Yaya geçitleri de dahil. */
  inCarriage(x, z) {
    const C = 20;
    if (!this._carGrid) {
      this._carGrid = new Map();
      for (const r of this.roads) {
        if (!(r.carriage > 0)) continue;
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1], b = r.points[i], h = r.carriage / 2;
          const seg = [a, b, h];
          for (let gx = Math.floor((Math.min(a[0], b[0]) - h) / C); gx <= Math.floor((Math.max(a[0], b[0]) + h) / C); gx++) {
            for (let gz = Math.floor((Math.min(a[1], b[1]) - h) / C); gz <= Math.floor((Math.max(a[1], b[1]) + h) / C); gz++) {
              const k = gx * 100003 + gz;
              if (!this._carGrid.has(k)) this._carGrid.set(k, []);
              this._carGrid.get(k).push(seg);
            }
          }
        }
      }
    }
    for (const [a, b, h] of this._carGrid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? []) {
      const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1;
      const q = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
      if (Math.hypot(a[0] + ex * q - x, a[1] + ez * q - z) < h) return true;
    }
    return false;
  }

  /** (x, z)'ye en yakın yürünebilir nokta (spiral arama). */
  nearestWalkable(x, z, max = 6) {
    if (this.isWalkable(x, z)) return [x, z];
    for (let r = 0.5; r <= max; r += 0.5) {
      const n = Math.max(8, Math.round(r * 8));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.isWalkable(px, pz)) return [px, pz];
      }
    }
    return [x, z];
  }

  _markObstacles() {
    for (const b of this.buildings) this.addObstacleRect(b.x, b.z, b.w + 0.3, b.d + 0.3, b.rot);
    for (const f of this.features) {
      switch (f.type) {
        case "cesme":
          this.addObstacleCircle(f.x, f.z, 8.3);
          for (const [bx, bz] of this.flowerBeds ?? []) this.addObstacleCircle(bx, bz, 1.8);
          break;
        case "gol": this.addObstacleCircle(f.x, f.z, f.r + 0.9); break;
        case "havuz": this.addObstacleRect(f.x, f.z, f.w + 1, f.d + 1); break;
        case "tezgah": this.addObstacleRect(f.x, f.z, 3.4, 2.2); break;
        case "bank": this.addObstacleRect(f.x, f.z, 1.9, 0.6, f.rot); break;
        case "masa1": this.addObstacleCircle(f.x, f.z, 0.45); break;
        case "sandalye": this.addObstacleCircle(f.x, f.z, 0.25); break;
        case "semsiye": this.addObstacleCircle(f.x, f.z, 0.2); break;
        case "sezlong": this.addObstacleRect(f.x, f.z, 0.8, 2, f.rot); break;
        case "cankurtaran": this.addObstacleRect(f.x, f.z, 2.2, 2.2); break;
        case "fener": this.addObstacleCircle(f.x, f.z, 4.6); break;
        case "gonder": this.addObstacleCircle(f.x, f.z, 0.6); break;
        case "minare": this.addObstacleCircle(f.x, f.z, 1.8); break;
        case "sadirvan": this.addObstacleCircle(f.x, f.z, 2.9); break;
        case "oyun": for (const o of playgroundItems(f)) this.addObstacleRect(o.x, o.z, o.w, o.d, o.rot); break;
        case "pota": this.addObstacleCircle(f.x, f.z, 0.5); break;
        case "vinc": this.addObstacleRect(f.x, f.z, 1.8, 1.8); break;
        case "okul_bahce": {
          // Bahçe duvarı (güneyde 4 m'lik kapı açıklığı); bayrak direği.
          const { x0, x1, z0, z1, gateX } = f;
          this.addObstacleRect(x0, (z0 + z1) / 2, 0.4, z1 - z0);
          this.addObstacleRect(x1, (z0 + z1) / 2, 0.4, z1 - z0);
          this.addObstacleRect((x0 + gateX - 2) / 2, z1, gateX - 2 - x0, 0.4);
          this.addObstacleRect((gateX + 2 + x1) / 2, z1, x1 - gateX - 2, 0.4);
          this.addObstacleCircle(x0 + 2, z0 + 1.5, 0.3);
          break;
        }
        case "hastane_on":
          for (const dz of [-5.5, 5.5]) this.addObstacleCircle(f.x + 6.5, f.z + dz, 0.35);
          for (const [dx, dz] of [[2, -11], [2, 11], [16, -12.5], [16, 12.5]]) this.addObstacleCircle(f.x + dx, f.z + dz, 0.8);
          break;
      }
    }
  }

  /** Kuzey-güney yönündeki sınır caddeleri (aynı hatta olanlar birleştirilir). */
  addCol(x, z0, z1) {
    if (!this.cols.has(x)) this.cols.set(x, []);
    this.cols.get(x).push([Math.min(z0, z1), Math.max(z0, z1), this._key]);
  }

  /** Aynı hat üzerindeki cadde parçalarını birleştirir (üst üste binen yollar olmasın). */
  addRow(z, x0, x1) {
    if (!this.rows.has(z)) this.rows.set(z, []);
    this.rows.get(z).push([Math.min(x0, x1), Math.max(x0, x1), this._key]);
  }

  _emitRows() {
    // Açılmamış parçalar çizilmez.
    for (const map of [this.cols, this.rows]) {
      for (const [k, list] of map) {
        const open = list.filter((q) => this.has(q[2]));
        if (open.length) map.set(k, open); else map.delete(k);
      }
    }
    for (const [x, list] of this.cols) {
      list.sort((a, b) => a[0] - b[0]);
      let [a, b] = list[0];
      for (const [c, d] of list.slice(1)) {
        if (c <= b + 1) b = Math.max(b, d);
        else { this.addRoad([[x, a], [x, b]], "cadde"); [a, b] = [c, d]; }
      }
      this.addRoad([[x, a], [x, b]], "cadde");
    }
    for (const [z, list] of this.rows) {
      list.sort((a, b) => a[0] - b[0]);
      let [a, b] = list[0];
      for (const [c, d] of list.slice(1)) {
        if (c <= b + 1) b = Math.max(b, d);
        else { this.addRoad([[a, z], [b, z]], "cadde"); [a, b] = [c, d]; }
      }
      this.addRoad([[a, z], [b, z]], "cadde");
    }
  }

  /** Geliştirme kontrolü: bir bina bir yolun ya da yaya alanının üstüne biniyor mu? */
  _validate() {
    for (const b of this.buildings) {
      const c = Math.cos(b.rot), sn = Math.sin(b.rot);
      for (const [fx, fz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0], [0, 0.5], [0, -0.5], [0.5, 0], [-0.5, 0]]) {
        const lx = fx * b.w, lz = fz * b.d;
        const x = b.x + lx * c + lz * sn, z = b.z - lx * sn + lz * c;
        const hit = this.roadIndex.at(x, z, 0.3);
        if (hit) {
          console.warn(`Bina yolda: ${b.kind} (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) -> ${hit.road.type}`);
          break;
        }
      }
    }
  }

  // --- arazi ---

  sdf(x, z) {
    let d = Infinity;
    for (const r of this.rects) d = Math.min(d, rectSdf(x, z, r));
    return d;
  }

  margin(x, z) {
    return 60 + 80 * fbm(x / 320, z / 320, 7);
  }

  /** Arazi: yolların altı ve yanı tesviye edilmiş. */
  height(x, z) {
    const raw = this.rawHeight(x, z);
    const g = this.grade?.get(Math.floor(x / 2) * 100003 + Math.floor(z / 2));
    if (!g) return raw;
    if (g.d <= g.hw) return g.h - 0.12; // yolun altı: yüzeyin hemen altında
    const t = Math.min(1, (g.d - g.hw) / 4);
    return g.h + (raw - g.h) * t * t * (3 - 2 * t);
  }

  /** Doğal arazi (tesviyesiz). */
  rawHeight(x, z) {
    const d = this.sdf(x, z);
    const m = this.margin(x, z);
    let land = FLAT_Y;
    if (d > 0) land += Math.max(0, fbm(x / 90, z / 90, 3)) * 10 * Math.min(1, d / 40);
    const hx = x - this.hill.x, hz = z - this.hill.z;
    const fade = Math.min(1, Math.max(0, (x - CELL_W / 2 - 20) / 60));
    land += Math.exp(-(hx * hx + hz * hz) / (2 * this.hill.r * this.hill.r)) * fade * (this.hill.h + 5 * fbm(x / 50, z / 50, 11));
    if (d < m - 30) return land;
    if (d < m) {
      const t = (d - (m - 30)) / 30;
      return land * (1 - t * t * (3 - 2 * t)) - 0.3 * t;
    }
    return Math.max(-12, -0.3 - (d - m) * 0.12);
  }

  /** Yürünen yüzeyin yüksekliği: iskele, meydan, yol katmanı (asfalt, kaldırım, yaya yolu) ya da arazi. */
  groundY(x, z) {
    const key = Math.round(x * 4) * 400009 + Math.round(z * 4);
    let y = this._groundCache.get(key);
    if (y !== undefined) return y;
    y = this._groundY(x, z);
    if (this.roadIndex) this._groundCache.set(key, y);
    return y;
  }

  _groundY(x, z) {
    for (const p of this.piers) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.top;
    for (const p of this.plazas) if (p.r && Math.hypot(x - p.x, z - p.z) < p.r) return FLAT_Y + 0.2;
    const hit = this.roadIndex?.at(x, z);
    if (hit) {
      const r = hit.road;
      const base = this.roadH(x, z);
      if (r.carriage > 0) return base + (hit.dist < r.carriage / 2 ? LAYER.carriage : LAYER.walk);
      return base + (r.type === "patika" ? LAYER.trail : LAYER.ped);
    }
    return this.height(x, z);
  }

  addBench(x, z, rot, place) {
    this.features.push({ type: "bank", x, z, rot });
    for (const o of [-0.45, 0.45]) {
      this.seats.push({ x: x + Math.cos(rot) * o, z: z - Math.sin(rot) * o, heading: rot, h: 0.49, place });
    }
  }

  addTables(x, z, n, axis, toward, place) {
    // Kaldırımdaki masalar: `toward` yönüne (yola) doğru 1,6 m açıkta, yan yana.
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 2.6;
      const [tx, tz] = axis === "x" ? [x + along, z + toward * 1.6] : [x + toward * 1.6, z + along];
      this.features.push({ type: "masa1", x: tx, z: tz });
      for (const side of [-1, 1]) {
        const cx = axis === "x" ? tx + side * 0.7 : tx, cz = axis === "x" ? tz : tz + side * 0.7;
        const heading = Math.atan2(tx - cx, tz - cz);
        this.features.push({ type: "sandalye", x: cx, z: cz, rot: heading });
        this.seats.push({ x: cx, z: cz, heading, h: 0.475, place, table: [tx, tz] });
      }
    }
  }

  isLand(x, z) {
    return this.height(x, z) > 0.15;
  }

  /** (x0, z0)'dan (dx, dz) yönünde ilerleyip kıyıyı bulur; kıyıdan `back` metre içerideki nokta. */
  coastPoint(x0, z0, dx, dz, back = 0) {
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    for (let s = 0; s < 2000; s += 1) {
      if (this.height(x0 + dx * s, z0 + dz * s) <= 0) return [x0 + dx * (s - back), z0 + dz * (s - back)];
    }
    return [x0, z0];
  }

  block(x0, z0, x1, z1, pad = 2) {
    if (!this._staged) { this._blockOps.push([1, x0, z0, x1, z1, pad, this._key]); return; }
    for (let x = Math.floor((x0 - pad) / 4); x <= Math.floor((x1 + pad) / 4); x++) {
      for (let z = Math.floor((z0 - pad) / 4); z <= Math.floor((z1 + pad) / 4); z++) this.blocked.add(x * 100003 + z);
    }
  }

  unblock(x0, z0, x1, z1) {
    if (!this._staged) { this._blockOps.push([0, x0, z0, x1, z1, 0, this._key]); return; }
    for (let gx = Math.floor(x0 / 4); gx <= Math.floor(x1 / 4); gx++) {
      for (let gz = Math.floor(z0 / 4); gz <= Math.floor(z1 / 4); gz++) this.blocked.delete(gx * 100003 + gz);
    }
  }

  isBlocked(x, z) {
    return this.blocked.has(Math.floor(x / 4) * 100003 + Math.floor(z / 4));
  }

  addRoad(points, type) {
    const spec = ROADS[type];
    this.roads.push({ points, type, ...spec });
    const hw = spec.width / 2 + 1;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      this.block(Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, 0);
    }
  }

  addBuilding(b) {
    this.buildings.push(b);
    const c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
    const hx = (b.w * c + b.d * s) / 2, hz = (b.w * s + b.d * c) / 2;
    this.block(b.x - hx, b.z - hz, b.x + hx, b.z + hz, 2);
    return b;
  }

  // --- merkez (çarşı) ---

  _layoutCenter() {
    const R = MEYDAN_R;
    const halfW = CELL_W / 2, halfD = CELL_D / 2;
    this.plazas.push({ x: 0, z: 0, r: R + 2, kind: "meydan" });
    this.block(-R - 3, -R - 3, R + 3, R + 3, 0);
    // Çeşme ve bayrak direği adanın en eski yapılarıdır (boş adada da vardır).
    this.features.push({ type: "cesme", x: 0, z: 0 });
    this.features.push({ type: "gonder", x: 0, z: -25.5 });
    this._tag("meydan_duzen", () => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        this.addBench(Math.cos(a) * 15, Math.sin(a) * 15, Math.atan2(-Math.cos(a), -Math.sin(a)), "meydan");
        this.features.push({ type: "agac", x: Math.cos(a) * 22, z: Math.sin(a) * 22 });
        this.flowerBeds = (this.flowerBeds ?? []).concat([[Math.cos(i / 8 * Math.PI * 2) * 18.5, Math.sin(i / 8 * Math.PI * 2) * 18.5]]);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.lamps.push({ x: Math.cos(a) * (R - 1), z: Math.sin(a) * (R - 1), dir: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      }
    });
    this._place("meydan", { anchors: [[0, 0]], spread: R - 6, path: [HUB] });

    // Çarşı yayalaştırılmıştır: meydana yalnızca yaya caddeleri açılır, araçlar çevre yolundan dolaşır.
    // Taş döşenene kadar (gelişim "carsi_yol") bunlar toprak patikadır; binaların yeri değişmez.
    const av = ROADS.yaya.width;
    const ped = this.has("carsi_yol") ? "yaya" : "patika";
    this.addRoad([[0, -R], [0, -halfD]], ped);
    this.addRoad([[R, 0], [halfW, 0]], ped);
    this.addRoad([[-R, 0], [-halfW, 0]], ped);
    this._tag("cevre_yolu", () => {
      this.addRow(-halfD, -halfW, halfW);
      this._layoutRing();
    });

    // Cepheler: caddelerin iki yanı. Her bina, meydana en yakın boş cepheye yerleşir.
    const fronts = [];
    for (const [axis, sign, end] of [["x", 1, halfW - 12], ["x", -1, halfW - 12], ["z", -1, halfD - 10], ["z", 1, this.avenueZ(0) - 12]]) {
      const street = { x: { 1: "Gündoğusu Caddesi", "-1": "Günbatısı Caddesi" }, z: { "-1": "Çınar Caddesi", 1: "Liman Caddesi" } }[axis][sign];
      for (const side of [-1, 1]) fronts.push({ axis, sign, side, cursor: R + 12, end, street, no: side < 0 ? 1 : 2 });
    }
    CENTER_ORDER.forEach(([kind, index]) => this._tag(`${kind}:${index}`, () => {
      const style = { ...STYLES[kind], ...BRANCH[`${kind}:${index}`] };
      const front = fronts.filter((f) => f.cursor + style.w <= f.end).sort((a, b) => a.cursor - b.cursor)[0];
      const t = front.cursor + style.w / 2;
      front.cursor += style.w + 3;
      const off = av / 2 + 1.5 + style.d / 2;
      let x, z, rot, door, street;
      // Kapı noktası cephenin hemen içinde: insanlar kapıdan girip kaybolur, kapıdan çıkıp görünür.
      const inDoor = av / 2 + 1.5 + 0.35;
      if (front.axis === "x") {
        x = front.sign * t; z = front.side * off;
        rot = front.side < 0 ? 0 : Math.PI;
        door = [x, front.side * inDoor];
        street = [x, 0];
      } else {
        z = front.sign * t; x = front.side * off;
        rot = front.side < 0 ? Math.PI / 2 : -Math.PI / 2;
        door = [front.side * inDoor, z];
        street = [0, z];
      }
      const b = this.addBuilding({
        kind, x, z, rot, w: style.w, d: style.d, floors: style.floors, roofType: style.roof,
        address: `${front.street} No ${(front.no += 2) - 2}, Çarşı`,
        wall: style.wall, roof: style.roofColor, style, workplace: true,
      });
      const path = [street, HUB];
      if (kind === "kahvehane") {
        this._place("kahvehane", { anchors: [door], spread: 3, path, building: b });
        this._addWorkplace("kahvehane", index, { door, path, anchor: door, spread: 2, building: b }); // çaycı
        const outside = front.axis === "x" ? [door[0], front.side * (av / 2 + 1)] : [front.side * (av / 2 + 1), door[1]];
        this.addTables(outside[0], outside[1], 3, front.axis, -front.side, "kahvehane");
      } else {
        this._addWorkplace(kind, index, { door, path, anchor: door, spread: 2, building: b });
        const outside = front.axis === "x" ? [door[0], front.side * (av / 2 + 1)] : [front.side * (av / 2 + 1), door[1]];
        if (kind === "kafe" || kind === "firin") this.addTables(outside[0], outside[1], kind === "kafe" ? 3 : 2, front.axis, -front.side, "kafe");
      }
    }));

    // Cephelerin kalanı: altı dükkân, üstü konut çarşı binaları. Meydana yakın olandan uzağa doğru açılır.
    const fillers = [];
    let filler = 0;
    for (const front of fronts) {
      while (true) {
        const key = 9000 + filler;
        const w = 10 + Math.floor(hash2(key, 1, 9) * 3) * 2;
        if (front.cursor + w > front.end) break;
        const t = front.cursor + w / 2;
        front.cursor += w + 1.5;
        filler++;
        const d = 12, off = av / 2 + 1.5 + d / 2;
        const [x, z, rot] = front.axis === "x"
          ? [front.sign * t, front.side * off, front.side < 0 ? 0 : Math.PI]
          : [front.side * off, front.sign * t, front.side < 0 ? Math.PI / 2 : -Math.PI / 2];
        const awning = ["#2f4a6d", "#b8423c", "#3e8a86", "#d9a441", "#6f7d4a", "#8a5a7a"][Math.floor(hash2(key, 2, 9) * 6)];
        fillers.push([t, this.addBuilding({
          kind: "carsi", x, z, rot, w, d, floors: 2 + Math.floor(hash2(key, 3, 9) * 3), roofType: hash2(key, 4, 9) < 0.6 ? "hip" : "flat",
          address: `${front.street} No ${(front.no += 2) - 2}, Çarşı`,
          wall: HOUSE_WALLS[Math.floor(hash2(key, 5, 9) * HOUSE_WALLS.length)], roof: HOUSE_ROOFS[Math.floor(hash2(key, 6, 9) * HOUSE_ROOFS.length)],
          style: { shop: true, awning }, workplace: true,
        })]);
      }
    }
    // Çarşı dükkânları sırayla birer zanaat alır (berber, terzi, kırtasiye...); tabelada sokağın adıyla.
    fillers.sort((a, b) => a[0] - b[0] || a[1].x - b[1].x || a[1].z - b[1].z).forEach(([, b], i) => {
      b._k = `carsi:${i}`;
      const [dukkan, ek] = DUKKANLAR[i % DUKKANLAR.length];
      b.dukkan = dukkan;
      b.isim = `${CARSI_ON[Math.floor(i / DUKKANLAR.length) % CARSI_ON.length]} ${ek}`;
    });
    this.carsiWalks = [
      [[-halfW + 15, -4.9], [-R - 4, -4.9]], [[R + 4, -4.9], [halfW - 15, -4.9]],
      [[-halfW + 15, 4.9], [-R - 4, 4.9]], [[R + 4, 4.9], [halfW - 15, 4.9]],
      [[-4.9, -halfD + 10], [-4.9, -R - 4]], [[4.9, -halfD + 10], [4.9, -R - 4]],
    ];

    this._tag("park", () => this._layoutCenterPark());
    this._tag("saha", () => this._layoutPitch());
    this._tag("otel:0", () => {
      this.features.push({ type: "havuz", x: 140, z: 85, w: 25, d: 12 });
      this.block(140 - 12.5 - 10, 85 - 6 - 10, 140 + 12.5 + 10, 85 + 6 + 10, 0); // havuz, güvertesi ve ağaç taçları için pay
    });
    this._tag("cevre_yolu", () => this._layoutParking());
    this._tag("saglik:0", () => this._layoutHospital());
    this._tag("pazar", () => this._layoutMarket());
    this._tag("carsi_yol", () => this.labels.push({ text: "Çarşı", x: 0, z: 0, h: 45 }));
  }

  _layoutCenterPark() {
    const halfW = CELL_W / 2, halfD = CELL_D / 2;
    // Park (kuzeybatı): çimen, havuz, yürüyüş yolları, banklar.
    const park = { x0: -halfW + 20, z0: -halfD + 12, x1: -45, z1: -42 };
    this.plazas.push({ ...park, kind: "park" });
    const pcx = (park.x0 + park.x1) / 2, pcz = (park.z0 + park.z1) / 2;
    this.features.push({ type: "gol", x: pcx, z: pcz, r: 14 });
    this.block(pcx - 16, pcz - 16, pcx + 16, pcz + 16, 0);
    this.addRoad([[park.x1 + 30, pcz], [pcx + 18, pcz]], "patika");
    this.addRoad([[pcx, park.z0 + 4], [pcx, pcz - 18]], "patika");
    for (let i = 0; i < 6; i++) this.addBench(pcx - 50 + i * 20, pcz + 24, Math.PI, "park");
    for (let i = 0; i < 4; i++) this.addBench(pcx - 30 + i * 20, pcz - 24, 0, "park");
    this._place("park", {
      anchors: [[pcx + 30, pcz + 20], [pcx - 40, pcz - 20], [pcx - 60, pcz + 15], [pcx + 50, pcz - 25]], spread: 10,
      path: [[park.x1 + 30, pcz], [0, pcz], HUB],
    });
  }

  /** Kuzeydoğu: futbol sahası (güneydoğuda otel bahçesi ve havuz, güneybatıda pazar yeri). */
  _layoutPitch() {
    this.plazas.push({ x0: 90, z0: -120, x1: 200, z1: -48, kind: "saha" });
    // Futbol: tribünler (iki uzun kenar), kaleler, ışık direkleri; seyirci oturakları.
    this.pitch = { x0: 90, z0: -120, x1: 200, z1: -48, cx: 145, cz: -84 };
    for (const side of [-1, 1]) {
      const edge = side < 0 ? -120 : -48;
      this.features.push({ type: "tribun", x0: 100, x1: 190, z: edge, side });
      for (let r = 0; r < 4; r++) {
        for (let x = 101; x < 190; x += 0.62) {
          if ((x - 100) % 15 < 1.3) continue; // merdivenli koridorlar
          const z = edge + side * (1.2 + r * 0.8);
          this.seats.push({ x, z, heading: side < 0 ? 0 : Math.PI, h: 0.45 + r * 0.4, place: "tribun", absolute: true });
        }
      }
    }
    // Kaleler kale çizgisinde (saha dokusunda çizgiler kenardan 4,3 m içeride).
    for (const gx of [90 + 4.3, 200 - 4.3]) this.features.push({ type: "kale", x: gx, z: -84, dir: gx < 145 ? 1 : -1 });
    for (const [mx, mz] of [[87, -125], [203, -125], [87, -43], [203, -43]]) {
      this.features.push({ type: "projektor", x: mx, z: mz });
      this.lamps.push({ x: mx, z: mz, dir: Math.atan2(145 - mx, -84 - mz), r: 48, flood: true, stadium: true });
    }
    this.addRoad([[145, -CELL_D / 2], [145, -124.5]], "patika");
    this._place("saha", { anchors: [[145, -84]], spread: 20, path: [[145, -CELL_D / 2]] });
    // Driftwood Gulls: futbolcular gündüz sahada antrenman yapar.
    this._addWorkplace("saha", 0, { door: [145, -124.5], path: [[145, -CELL_D / 2]], anchor: [145, -84], spread: 20 });
    this.block(88, -127, 202, -41, 0); // saha, tribünler ve arka duvarları (ağaç dikilmez)
  }

  _layoutParking() {
    const halfW = CELL_W / 2;
    // Otoparklar: çevre yolunun iç kenarında, çarşının iki yanında; girişleri çevre yolundan.
    this.parkingLots = [];
    for (const side of [-1, 1]) {
      const lot = side < 0 ? { x0: -halfW + 14, x1: -halfW + 56, z0: 34, z1: 112 } : { x0: halfW - 56, x1: halfW - 14, z0: 34, z1: 112 };
      // Giriş, çevre yoluna bakan kenarda; kısa bir bağlantı yoluyla çevre yoluna çıkar.
      const mid = (lot.z0 + lot.z1) / 2;
      const edgeX = side < 0 ? lot.x0 : lot.x1;
      lot.gateSide = side;
      lot.gateX = edgeX - side * 2;
      lot.gate = [lot.gateX, mid];
      this.addRoad([[edgeX, mid], [side * halfW, mid]], "giris");
      this.parkingLots.push(lot);
      this.plazas.push({ ...lot, kind: "otopark" });
      this.block(lot.x0, lot.z0, lot.x1, lot.z1, 1);
    }
  }

  _layoutHospital() {
    const halfW = CELL_W / 2;
    // Hastane: kuzeydoğu köşede, çevre yoluna bakar; önünde ambulans alanı ve giriş yolu.
    {
      const hx = halfW - 30, hz = -95;
      const b = this.addBuilding({ kind: "saglik", x: hx - 10, z: hz, rot: Math.PI / 2, w: 38, d: 20, floors: 4, roofType: "flat", wall: "#f4f6f8", roof: "#c9c4bb", workplace: true, style: STYLES.saglik, address: "Şifa Caddesi No 1, Çarşı" });
      this.plazas.push({ x0: hx, z0: hz - 14, x1: halfW - 8, z1: hz + 14, kind: "avlu" });
      this.addRoad([[hx + 4, hz], [halfW, hz]], "giris");
      const door = [hx + 0.35, hz];
      this._addWorkplace("saglik", 0, { door, path: [door, [halfW, hz], [halfW, 0], HUB], anchor: door, spread: 2, building: b });
      this.hospital = { building: b, bay: [hx + 5, hz], door };
      this.features.push({ type: "tabela_h", x: hx + 4, z: hz - 9 });
      this.features.push({ type: "hastane_on", x: hx, z: hz, roofY: 4 * FLOOR_H, bx: hx - 10 });
    }
  }

  _layoutMarket() {
    const market = { x0: -190, z0: 50, x1: -90, z1: 100 };
    this.plazas.push({ ...market, kind: "pazar" });
    this.block(market.x0, market.z0, market.x1, market.z1, 0);
    // Semt pazarı: iki koridor boyunca karşılıklı tezgâh sıraları (pazarcı arkada, müşteri koridorda);
    // her altı tezgâhta bir ara geçit.
    const aisles = [market.z0 + 13, market.z0 + 37];
    let n = 0;
    for (const az of aisles) {
      for (const dir of [1, -1]) {
        let k = 0;
        for (let x = market.x0 + 12; x <= market.x1 - 12; x += 3.6, k++) {
          if (k % 6 === 5) continue;
          this.features.push({ type: "tezgah", x, z: az - dir * 2.4, dir, c: n++ % 10 });
        }
      }
    }
    const aisleAnchors = aisles.flatMap((az) => [-30, 0, 30].map((dx) => [(market.x0 + market.x1) / 2 + dx, az]));
    this._place("pazar", { anchors: aisleAnchors, spread: 6, path: [[market.x1, 0], HUB], aisles: aisles.map((az) => [market.x0 + 10, market.x1 - 10, az]) });
  }

  /** Sahil bulvarının z'si: kıyıdan 36 m içeride; geniş pencerede iki kez yumuşatılmış, eğimi sınırlı. */
  avenueZ(x) {
    if (!this._avProfile) {
      const xs = [];
      for (let x = -CELL_W; x <= CELL_W; x += 10) xs.push(x);
      let zs = xs.map((x) => this.coastPoint(x, 60, 0, 1)[1] - 36);
      for (let pass = 0; pass < 3; pass++) {
        zs = zs.map((_, i) => {
          let sum = 0, n = 0;
          for (let k = -5; k <= 5; k++) { const j = i + k; if (j >= 0 && j < zs.length) { sum += zs[j]; n++; } }
          return sum / n;
        });
      }
      for (let i = 1; i < zs.length; i++) zs[i] = Math.max(zs[i - 1] - 3, Math.min(zs[i - 1] + 3, zs[i]));
      // Kıyıya hiçbir yerde 26 m'den fazla yaklaşmasın.
      zs = zs.map((z, i) => Math.min(z, this.coastPoint(xs[i], 60, 0, 1)[1] - 26));
      this._avProfile = { x0: xs[0], zs };
    }
    const { x0, zs } = this._avProfile;
    const f = (x - x0) / 10, i = Math.max(0, Math.min(zs.length - 2, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
    return zs[i] + (zs[i + 1] - zs[i]) * u;
  }

  /** Sahil bulvarı boyunca x0'dan x1'e giden noktalar. */
  avenuePath(x0, x1) {
    const pts = [];
    const step = x1 > x0 ? 10 : -10;
    for (let x = Math.round(x0 / 10) * 10; step > 0 ? x <= x1 : x >= x1; x += step) pts.push([x, this.avenueZ(x)]);
    return pts;
  }

  /** Çevre yolu: kuzeyde hücre sınırı, doğu ve batıda hücre kenarları, güneyde kıyıyı izleyen sahil bulvarı. */
  _layoutRing() {
    const halfW = CELL_W / 2, halfD = CELL_D / 2, r = 26;
    const zW = this.avenueZ(-halfW + r), zE = this.avenueZ(halfW - r);
    const pts = [[-halfW, -halfD], [-halfW, zW - r]];
    // Batı köşesi: batıdan güneye dönen çeyrek yay.
    for (let k = 1; k < 8; k++) { const a = Math.PI - (k / 8) * (Math.PI / 2); pts.push([-halfW + r + Math.cos(a) * r, zW - r + Math.sin(a) * r]); }
    pts.push([-halfW + r, zW]);
    for (let x = -halfW + r + 12; x <= halfW - r - 12; x += 12) pts.push([x, this.avenueZ(x)]);
    pts.push([halfW - r, zE]);
    // Doğu köşesi: güneyden doğuya, sonra yukarı.
    for (let k = 1; k < 8; k++) { const a = Math.PI / 2 - (k / 8) * (Math.PI / 2); pts.push([halfW - r + Math.cos(a) * r, zE - r + Math.sin(a) * r]); }
    pts.push([halfW, zE - r], [halfW, -halfD]);
    this.addRoad(pts, "cadde");
  }

  _addWorkplace(kind, index, entry) {
    const names = cat().isyerleri[kind];
    const name = names[index % names.length];
    (this.workplaces[kind] ??= [])[index] = { name, outdoor: OUTDOOR_KINDS.has(kind), ...entry, _k: this._key };
    // Bina hangi şube olduğunu bilir: tabela adı ve iç konsepti (workinterior.js) buna göre.
    if (entry.building) { entry.building.sube = index; entry.building.isim = name; }
  }

  /**
   * Yük limanı: vapur iskelesinin doğusunda beton rıhtım. Kıyı şeridini ve denize uzanan önlüğü kaplayan
   * tek parça platform; yanaşmış konteyner gemisi, rıhtım vinci, istif sahası, ambar, tır ve forklift.
   * Çitle çevrili, kapısı bulvara açılır. Liman işçilerinin görev yerleri (posts) burada tanımlanır;
   * araçların ve vincin hareketi port.js'teki zaman işlevlerinden gelir.
   */
  _layoutPort(toHub) {
    const x0 = 40, x1 = 150, z0 = 176, z1 = 246, top = FLAT_Y + 0.3;
    const gateX = 95;
    const P = {
      x0, x1, z0, z1, top, gateX,
      ship: { x: 95, z: z1 + 7.1, len: 84, beam: 13, depth: 6.6 },
      crane: { x: 95, legX: [86, 104], landZ: 226, seaZ: 242 },
      transfer: [95, 234],
      stack: { x0: 108, x1: 147, z0: 201, z1: 223 },
      warehouse: { x: 61, z: 186, w: 38, d: 15 },
      truck: { x: 52, z: 207, heading: 0 },
      booth: [gateX + 6.5, z0 + 3.2],
      benches: [[86, 196.5, Math.PI], [90, 196.5, Math.PI]],
      masts: [[x0 + 3, z1 - 6], [x1 - 3, z1 - 6], [x1 - 3, z0 + 6], [x0 + 46, z0 + 26]],
    };
    // Gece rıhtımı aydınlatan direkler (ışık haritası için beyaz, geniş).
    for (const [mx, mz] of P.masts) this.lamps.push({ x: mx, z: mz, dir: Math.atan2(95 - mx, 215 - mz), r: 40, flood: true });
    this.port = P;
    this.piers.push({ x0, x1, z0, z1, top });
    this.block(x0, z0 - 2, x1, z1, 2);
    // Ambar: rıhtımın kara tarafında, kapıları denize (güneye) bakar.
    const wh = P.warehouse;
    this.addBuilding({ kind: "ambar", x: wh.x, z: wh.z, rot: 0, w: wh.w, d: wh.d, floors: 2, roofType: "gable", wall: "#c9d2dc", roof: "#6f7f92", industrial: true, style: { door: "#d9822b", sign: "#1f3b5a" }, address: "Liman Ambarı, Yük Limanı" });
    // Kapı: bulvardan kısa bir giriş yolu; işçiler de buradan girer.
    this.addRoad([[gateX, this.avenueZ(gateX)], [gateX, z0 + 1]], "giris");
    const door = [gateX - 4.5, z0 + 1.5];
    // Görev yerleri: her işçi vardiyasında bunlardan birine düşer; kalanlar ambarın içinde çalışır.
    const posts = [];
    const post = (type, x, z, heading = 0, extra = {}) => posts.push({ post: type, x, z, heading, ...extra });
    post("vinc", P.crane.x, P.crane.landZ);
    post("isaretci", 101.5, 236.5, Math.PI * 1.2);
    post("istif", 0, 0, 0, { k: 0 });
    post("forklift", 0, 0, 0, { k: 0 });
    for (let k = 0; k < 4; k++) post("bagci", 64 + k * 17, 0, 0, { k });
    for (const bx of [52, 136, 70]) post("palamar", bx, z1 - 2.2, 0);
    for (let k = 0; k < 3; k++) post("kontrol", 0, 0, 0, { k });
    post("bekci", P.booth[0], P.booth[1], Math.PI);
    for (let k = 0; k < 3; k++) post("ambar", 0, 0, 0, { k });
    post("sofor", P.truck.x + 2.2, P.truck.z + 7.5, -Math.PI / 2);
    for (const [bx, bz, h] of P.benches) for (const dx of [-0.5, 0.5]) post("mola", bx + dx, bz, h);
    P.posts = posts;
    // Görev yeri olmayanlar ambarın personel kapısından içeri girer.
    const innerDoor = [wh.x + wh.w / 2 - 1.6, wh.z + wh.d / 2 + 0.6];
    this._addWorkplace("liman", 0, { door, innerDoor, path: [door, [gateX, this.avenueZ(gateX)], ...toHub(gateX)], anchor: [95, 215], spread: 20 });
    this.labels.push({ text: "Yük Limanı", x: 98, z: 215, h: 24 });
  }

  // --- güney kıyısı: liman, iskele, tersane, balıkçı koyu, sahil yolu ---

  _layoutCoast() {
    const coast = (x) => this.coastPoint(x, 60, 0, 1);

    // Sahil yolu: bulvarla deniz arasında, kıyıyı izleyen taş gezinti yolu.
    const promenade = [];
    // Doğuda yük limanının çitine kadar (x = 30).
    for (let x = -170; x <= 30; x += 10) promenade.push([x, coast(x)[1] - 8]);
    this._tag("sahil_yolu", () => this.addRoad(promenade, "sahil"));
    const promAt = (x) => promenade[Math.max(0, Math.min(promenade.length - 1, Math.round((x + 170) / 10)))];
    const avZ0 = this.avenueZ(0);
    const toHub = (x) => [...this.avenuePath(x, 0), [0, avZ0], HUB];

    // Liman: meydandan inen yaya caddesi bulvarı geçip 80 m'lik iskeleye ulaşır; vapur yanaşmış.
    const [, lz] = coast(0);
    const ped = this.has("carsi_yol") ? "yaya" : "patika";
    this.addRoad([[0, MEYDAN_R], [0, avZ0]], ped);
    this.addRoad([[0, avZ0], [0, lz - 3]], ped);
    this.features.push({ type: "iskele", x: 0, z: lz - 4, len: 80, w: 10 });
    this.ferryPier = { x0: -5, x1: 5, z0: lz - 4, z1: lz + 76, top: 1.53 };
    this.piers.push(this.ferryPier);
    this.features.push({ type: "vapur", x: 13, z: lz + 40 });
    this.addBuilding({ kind: "liman", x: -24, z: lz - 21, rot: 0, w: 16, d: 9, floors: 2, roofType: "hip", wall: "#f6f1e9", roof: "#8c4b3a", address: "Vapur İskelesi, Liman" });
    // Anakarada çalışan ve okuyanlar: vapur iskelesinin ucunda vapura biner (gün boyu adada görünmez).
    const ferryDoor = [3.5, lz + 36];
    this._addWorkplace("anakara", 0, { door: ferryDoor, path: [ferryDoor, [0, lz - 6], [0, avZ0], HUB], anchor: ferryDoor, spread: 2, queue: { x0: -4, x1: 4, z: lz + 34.5 } });
    // Zeplin pilotları: zeplin üssü anakarada; onlar da vapurla gidip gelir (zeplin 150. sakinde açılır).
    this._tag("zeplin:0", () => this._addWorkplace("zeplin", 0, { door: ferryDoor, path: [ferryDoor, [0, lz - 6], [0, avZ0], HUB], anchor: ferryDoor, spread: 2, queue: { x0: -4, x1: 4, z: lz + 34.5 } }));
    // Evden çalışanlar ve emekliler: iş yerleri evleridir (adreste mahalle görünür).
    this._addWorkplace("ev", 0, { door: null, path: [HUB], anchor: HUB, spread: 0, home: true });
    this.labels.push({ text: "Vapur İskelesi", x: 0, z: lz + 20, h: 22 });
    this._tag("liman:0", () => this._layoutPort(toHub));
    this._tag("balik_iskelesi", () => this._layoutFishingPier(promenade, promAt, avZ0));
    this._tag("tersane:0", () => this._layoutShipyard(toHub));
    this._tag("balikci_koyu:0", () => this._layoutCove(toHub));

    const mid = promAt(0);
    this._tag("sahil_yolu", () => this._place("sahil_yolu", { anchors: promenade.filter((_, i) => i % 4 === 0), spread: 1.5, path: [mid, [0, avZ0], HUB] }));
    this.promenade = promenade;
  }

  _layoutFishingPier(promenade, promAt, avZ0) {
    const coast = (x) => this.coastPoint(x, 60, 0, 1);
    // Balık tutma iskelesi. Sahil yolu döşenene kadar iskeleye, onun güzergâhında bir patikadan gidilir.
    const [ix, iz] = coast(-90);
    if (!this.has("sahil_yolu")) this.addRoad(promenade.filter(([x]) => x >= ix - 6 && x <= 0), "patika");
    this.features.push({ type: "iskele", x: ix, z: iz - 3, len: 36, w: 3 });
    this.piers.push({ x0: ix - 1.5, x1: ix + 1.5, z0: iz - 3, z1: iz + 33, top: 1.53 });
    const pi = promAt(ix);
    const promTo0 = (from) => promenade.filter(([x]) => (from < 0 ? x >= from && x <= 0 : x <= from && x >= 0)).sort((a, b) => Math.abs(a[0]) - Math.abs(b[0])).reverse();
    const fishing = [];
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      fishing.push({ x: ix + side * 1.05, z: iz + 12 + k * 3.4, heading: side * Math.PI / 2 });
    }
    this._place("iskele", { anchors: fishing.map((f) => [f.x, f.z]), spots: fishing, spread: 0, path: [[ix, iz - 3], pi, ...promTo0(ix), [0, avZ0], HUB] });
  }

  _layoutShipyard(toHub) {
    const coast = (x) => this.coastPoint(x, 60, 0, 1);
    // Tersane: gezinti yolunun bittiği doğu kıyısında, deniz tarafında.
    const [tx, tz] = coast(198);
    this.addBuilding({ kind: "tersane", x: tx, z: tz - 13, rot: 0, w: 30, d: 18, floors: 3, roofType: "gable", wall: "#c9d2dc", roof: "#6f7f92", workplace: true, industrial: true, style: { door: "#2f5d8a", sign: "#2f5d8a" }, address: "Tersane Yolu No 1, Doğu Kıyısı" });
    // Kızak: atölyenin önünden denize inen beton rampa; düz kısmında beşik üstünde yapımdaki tekne,
    // çevresinde iki katlı iskele, üstünde portal vinç. Yanında suda bağlı bitmiş bir tekne.
    const top = FLAT_Y + 0.25;
    const S = {
      x: tx, x0: tx - 6, x1: tx + 6, z0: tz - 3.5, zFlat: tz + 16, z1: tz + 40, top,
      boat: { x: tx, z: tz + 6.5, len: 16 },
      timber: [tx - 11, tz - 1],
    };
    this.tersane = S;
    this.piers.push({ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.zFlat, top });
    this.block(S.x0 - 6, S.z0, S.x1 + 6, S.z1, 1);
    this.features.push({ type: "tekne", x: tx + 15, z: tz + 22, rot: 0.1, len: 12 });
    const posts = [];
    const post = (type, x, z, heading, extra = {}) => posts.push({ post: type, x, z, heading, ...extra });
    const half = S.boat.len / 2;
    for (const side of [-1, 1]) {
      post("iskele2", S.x + side * 3.6, S.boat.z - 3.5, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 2 });
      post("iskele2", S.x + side * 3.6, S.boat.z + 3, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 2 });
      post("iskele1", S.x + side * 3.6, S.boat.z, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 1 });
      post("boya", S.x + side * 2.2, S.boat.z + side * 4.5, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    post("kaynak", S.x + 0.9, S.boat.z - half + 2.5, -Math.PI / 2);
    post("kaynak", S.x - 0.9, S.boat.z + half - 3, Math.PI / 2);
    post("tasima", 0, 0, 0, { k: 0 });
    post("tasima", 0, 0, 0, { k: 1 });
    post("vinc", S.x1 + 0.8, S.boat.z - 6, -Math.PI / 2);
    post("kontrol", S.x - 2.5, S.boat.z + half + 1.8, Math.PI);
    S.posts = posts;
    const tDoor = [tx, tz - 23];
    this._addWorkplace("tersane", 0, { door: tDoor, innerDoor: [tx + 15 - 1.6, tz - 13 + 9 + 0.6], path: [tDoor, [tx, this.avenueZ(tx)], ...toHub(tx)], anchor: [tx, S.boat.z], spread: 5 });
  }

  _layoutCove(toHub) {
    const coast = (x) => this.coastPoint(x, 60, 0, 1);
    // Balıkçı koyu: gezinti yolunun batısında kulübeler ve tekneler.
    const [bx, bz] = coast(-218);
    for (let i = 0; i < 3; i++) {
      this.addBuilding({ kind: "kulube", x: bx - 14 + i * 12, z: bz - 9, rot: 0, w: 8, d: 6, floors: 1, roofType: "gable", wall: ["#e9edf0", "#dbe7ee", "#f3e3c8"][i], roof: "#7a8a9a", address: `Balıkçı Koyu No ${i + 1}` });
    }
    // Ahşap balıkçı iskelesi; tekneler iki yanına palamarlı, sandal şamandırada. Kumsalda ağ serenleri,
    // ters çevrilmiş sandal, balık kasaları, çay masası. Balıkçıların görev yerleri (fazlası denizde).
    const jx = bx + 2, jz = bz - 2, jlen = 24;
    this.features.push({ type: "iskele", x: jx, z: jz, len: jlen, w: 2.6 });
    this.piers.push({ x0: jx - 1.3, x1: jx + 1.3, z0: jz, z1: jz + jlen, top: 1.53 });
    this.features.push({ type: "tekne", x: jx + 3.0, z: jz + 10, rot: 0, len: 8 });
    this.features.push({ type: "tekne", x: jx - 3.0, z: jz + 17, rot: 0, len: 8 });
    this.features.push({ type: "tekne", x: bx - 12, z: bz + 10, rot: 0.5, len: 5.5 });
    const K = {
      jetty: { x: jx, z0: jz, z1: jz + jlen },
      racks: [[bx - 14, bz - 0.5], [bx + 13, bz - 0.5]],
      upturned: [bx - 25, bz - 1.5, 0.3],
      crates: [jx, jz - 1.8],
      table: [bx - 3.5, bz - 1.4],
      buoys: [[bx - 12, bz + 13], [bx + 9, bz + 20], [bx - 2, bz + 26]],
      // Kulübeler (verandaları deniz tarafında), kulübeleri iskeleye bağlayan tahta yol, balık tezgâhı,
      // kıyıya çekilmiş sandallar, sepet yığınları, halat kangalları, dalgakıran taşları ve giriş tabelası.
      huts: [0, 1, 2].map((i) => [bx - 14 + i * 12, bz - 9]),
      boardwalk: [[bx - 20, bz - 3.8], [bx, bz - 3.8]],
      stall: [jx + 4.5, jz - 0.8],
      beached: [[bx + 9, bz - 0.5, 0.35, "#d8433d"], [bx + 12.5, bz + 0.2, -0.25, "#2f7fb5"]],
      traps: [[bx - 19.6, bz - 5.0], [bx - 8.6, bz - 5.0], [bx + 3.0, bz - 5.0]],
      ropes: [[jx - 0.7, jz + 4], [jx + 0.7, jz + 12], [jx - 0.7, jz + 20]],
      rocks: [jx + 9, jz + 14],
      sign: [bx, bz - 15.5],
    };
    for (const lx of [bx - 22, bx - 8, bx + 4]) this.lamps.push({ x: lx, z: bz - 2.6, dir: Math.PI });
    const kposts = [];
    const kpost = (type, x, z, heading, extra = {}) => kposts.push({ post: type, x, z, heading, ...extra });
    for (const [rx, rz] of K.racks) for (const dx of [-1.4, 1.4]) kpost("ag", rx + dx, rz + 1.3, Math.PI);
    kpost("kasa", 0, 0, 0, { k: 0 });
    kpost("kasa", 0, 0, 0, { k: 1 });
    kpost("iskele", jx + 0.6, jz + 9, Math.PI / 2);
    kpost("iskele", jx - 0.6, jz + 16.5, -Math.PI / 2);
    kpost("boya", K.upturned[0] + 2.2, K.upturned[1], -Math.PI / 2);
    kpost("cay", K.table[0] - 0.75, K.table[1], Math.PI / 2);
    kpost("cay", K.table[0] + 0.75, K.table[1], -Math.PI / 2);
    K.posts = kposts;
    this.koy = K;
    const bDoor = [bx, bz - 15];
    // Çevre yolu gelene kadar koya meydanın batı yolundan inen bir patika.
    if (!this.has("cevre_yolu")) this.addRoad([bDoor, [bx, 0]], "patika");
    cat().isyerleri.balikci_koyu.forEach((_, i) => this._addWorkplace("balikci_koyu", i, {
      door: bDoor, innerDoor: [jx, jz + jlen - 1], path: [bDoor, [bx, this.avenueZ(bx)], ...toHub(bx)], anchor: [bx, bz + 1], spread: 7,
    }));
  }

  // --- doğa: tepe ve fener (doğu), tarlalar ve plaj (batı) ---

  _layoutNature() {
    const halfW = CELL_W / 2;
    const { x: hx, z: hz } = this.hill;
    const top = [hx, hz];
    const trail = [[halfW, 0], [hx - 90, 0], [hx - 50, hz - 15], [hx - 20, hz - 5], top];
    this.addRoad(trail, "patika");
    this.addBench(hx + 3, hz + 4, 0, "tepe");
    this.addBench(hx - 4, hz + 5, 0.3, "tepe");
    this._place("tepe", { anchors: [top], spread: 7, path: [...trail].reverse().concat([HUB]) });
    this.labels.push({ text: "Tepe", x: hx, z: hz, h: 30 });

    const [fx, fz] = this.coastPoint(hx, hz, 0.75, 0.66, 8);
    this.features.push({ type: "fener", x: fx, z: fz });
    this.block(fx - 5, fz - 5, fx + 5, fz + 5, 0);
    const fenerTrail = [[fx - 5, fz - 5], [hx + 20, hz + 60], [hx - 90, 0]];
    this.addRoad(fenerTrail, "patika");
    const fenerPath = [...fenerTrail, [halfW, 0], HUB];
    this._addWorkplace("fener", 0, { door: [fx, fz], path: fenerPath, anchor: [fx - 4, fz - 4], spread: 2 });
    // Seyir noktaları: fenerin çevresinde, karada, denize (tepeden uzağa) bakan yerler.
    const views = [];
    for (const rr of [8.5, 11.5, 14.5, 17.5]) {
      const n = Math.round((2 * Math.PI * rr) / 2.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rr;
        const vx = fx + Math.cos(a) * rr, vz = fz + Math.sin(a) * rr;
        if (this.rawHeight(vx, vz) < 0.8) continue;
        // Denize bakan yarı: tepeden uzağa.
        if ((vx - fx) * (fx - hx) + (vz - fz) * (fz - hz) < -2) continue;
        views.push({ x: vx, z: vz, heading: Math.atan2(vx - hx, vz - hz) });
      }
    }
    this._place("fener", { anchors: views.map((v) => [v.x, v.z]), spots: views, spread: 0, path: fenerPath });
    this.fener = { x: fx, z: fz, door: [fx - Math.cos(Math.atan2(fz - hz, fx - hx)) * 4.8, fz - Math.sin(Math.atan2(fz - hz, fx - hx)) * 4.8] };
    // Bekçi evi: fenerin kara tarafında, kapısı fenere bakar.
    {
      const a = Math.atan2(fz - hz, fx - hx);
      const ex = fx - Math.cos(a) * 14 + Math.sin(a) * 6, ez = fz - Math.sin(a) * 14 - Math.cos(a) * 6;
      this.addBuilding({ kind: "kulube", x: ex, z: ez, rot: Math.atan2(fx - ex, fz - ez), w: 8, d: 6, floors: 1, roofType: "gable", wall: "#f2efe8", roof: "#b8412f", address: "Fener Bekçisi Evi, Fener" });
    }
    this.labels.push({ text: "Fener", x: fx, z: fz, h: 34 });

    // Batı: köy yolu, iki çiftlik ve plaj.
    const kx = -CELL_W;
    // İtfaiye istasyonu ve belediye garajı (çöp kamyonu): köy yolunun kuzeyinde, çevre yolunun hemen batısında.
    const sx = -halfW - 56, gx = -halfW - 26;
    this._tag("itfaiye", () => {
      const fs = this.addBuilding({ kind: "itfaiye", x: sx, z: -20, rot: 0, w: 24, d: 14, floors: 2, roofType: "flat", wall: "#e9e2d6", roof: "#c9c4bb", style: { garage: "#b8231f", tower: false }, address: "İtfaiye Yolu No 1" });
      this.plazas.push({ x0: sx - 12, z0: -13, x1: sx + 12, z1: -3.5, kind: "avlu" });
      this.addRoad([[sx, -9.5], [sx, 0]], "giris");
      this.fireStation = { building: fs, bay: [sx, -8] };
    });
    this._tag("garaj", () => {
      const dp = this.addBuilding({ kind: "garaj", x: gx, z: -20, rot: 0, w: 18, d: 14, floors: 1, roofType: "gable", wall: "#d9dde2", roof: "#6f7f92", style: { garage: "#4f8a3e" }, address: "Garaj Sokağı No 2" });
      this.plazas.push({ x0: gx - 9, z0: -13, x1: gx + 9, z1: -3.5, kind: "avlu" });
      this.addRoad([[gx, -9.5], [gx, 0]], "giris");
      this.depot = { building: dp, bay: [gx, -8] };
    });
    // Köy yolu ilk zeytinlikle açılır; itfaiye ve garaj da ona bağlanır (açılış sırası bunu gözetir).
    this._tag("tarla:0", () => this.addRoad([[-halfW, 0], [kx - 120, 0]], "koy"));
    cat().isyerleri.tarla.forEach((name, i) => this._tag(`tarla:${i}`, () => {
      const x0 = kx - 200 + i * 190, z0 = -125;
      for (let f = 0; f < 4; f++) {
        const fx0 = x0 + (f % 2) * 88, fz0 = z0 + Math.floor(f / 2) * 54;
        // Ekin: çiftliğin adına göre (Zeytinlik: zeytin, Bağ Evi: bağ) iki tarla, ayrıca buğday ve sebze. Zemin
        // rengi (crop) ekine göre: buğday sarı, sebze yeşil, zeytin ve bağ sürülmüş toprak. Çizim: fields.js.
        const ekin = [i === 0 ? "zeytin" : "bag", i === 0 ? "zeytin" : "bag", "bugday", "sebze"][f];
        this.plazas.push({ x0: fx0, z0: fz0, x1: fx0 + 82, z1: fz0 + 48, kind: "tarla", ekin, crop: { bugday: 0, sebze: 1 }[ekin] ?? 2 });
        this.block(fx0, fz0, fx0 + 82, fz0 + 48, 0);
      }
      const barn = this.addBuilding({ kind: "ahir", x: x0 + 85, z: -14, rot: 0, w: 18, d: 12, floors: 2, roofType: "gable", wall: "#b5563f", roof: "#6d6a66", workplace: true, industrial: true, style: { door: "#7a3a2a" }, address: `${name}, Köy Yolu` });
      const door = [barn.x, -7.5];
      this._addWorkplace("tarla", i, { door, path: [door, [barn.x, 0], [-halfW, 0], HUB], anchor: [x0 + 85, z0 + 51], spread: 40 });
    }));

    const [px, pz] = this.coastPoint(kx - 30, 10, -0.2, 1, 14);
    const beach = [];
    for (let i = -4; i <= 4; i++) beach.push(this.coastPoint(kx - 30 + i * 16, 10, -0.2, 1, 12));
    const toBeach = [[kx - 30, 0], [px, pz - 14]];
    const beachPath = [[px, pz - 14], [kx - 30, 0], [-halfW, 0], HUB];
    // Kumsal baştan vardır; şemsiyeler, şezlonglar ve cankurtaran kulesi gelişimle gelir. Köy yolu
    // açılana kadar kumsala meydandan giden patikadan inilir.
    this.addRoad(this.has("tarla:0") ? toBeach : [[-halfW, 0], [kx - 30, 0], [px, pz - 14]], "patika");
    this._place("plaj", { anchors: beach.map(([x, z]) => [x, z + 4]), spread: 5, path: beachPath });
    this._tag("plaj:0", () => {
      this._layoutBeach(kx, px, pz);
      this._addWorkplace("plaj", 0, { door: [px, pz], path: beachPath, anchor: [px, pz + 2], spread: 3 });
      this.features.push({ type: "cankurtaran", x: px, z: pz - 2 });
    });
    this.labels.push({ text: "Plaj", x: px, z: pz, h: 18 });
  }

  /**
   * Plaj düzeni (kıyı çizgisine göre; "geri" = su kenarından karaya metre): su kenarından 9 ve 15 m geride iki
   * sıra şemsiye kümesi (şemsiye + denize bakan iki şezlong; şezlonglar sakinlerin uzandığı yerler), kumsala inen
   * üç tahta yol (cankurtaran kulesinin önü ve yollar boş), yol başlarında duşlar, ortada soyunma kabinleri ve
   * çöp kutuları, batıda plaj büfesi (masalarıyla), doğu ucunda plaj voleybolu, açıkta şamandıralı yüzme alanı.
   * Çizim: beach.js.
   */
  _layoutBeach(kx, px, pz) {
    const n = Math.hypot(0.2, 1), dx = -0.2 / n, dz = 1 / n; // denize doğru
    const at = (x, back) => this.coastPoint(x, 10, -0.2, 1, back);
    const face = Math.atan2(dx, dz); // şezlonglar denize bakar
    const walks = [kx - 66, px, kx + 6];
    const B = { face, clusters: [], walks: [], showers: [], cabins: [], buoys: [], volley: null, bins: [] };
    for (let x = kx - 96; x <= kx + 34; x += 6.2) {
      for (const [back, off] of [[9, 0], [15, 3.1]]) {
        const xx = x + off;
        if (walks.some((w) => Math.abs(w - xx) < 4.2) || Math.abs(xx - px) < 7) continue;
        const [cx, cz] = at(xx, back);
        const c = { x: cx, z: cz, c: Math.round((xx - kx) / 6.2 + back) };
        B.clusters.push(c);
        // İki şezlong: kümenin iki yanında, denize bakar; insan uzanınca ayakları deniz tarafında.
        for (const side of [-1, 1]) {
          const sx = cx + side * 1.0 * dz, sz = cz - side * 1.0 * dx;
          this.seats.push({ x: sx, z: sz, heading: face, h: 0.38, place: "plaj", sunbed: true });
        }
      }
    }
    for (const wx of walks) {
      const a = at(wx, 31), b = at(wx, 5);
      B.walks.push({ a, b });
      B.showers.push(at(wx + 2.6, 20));
      B.bins.push(at(wx - 2.4, 21));
    }
    // Soyunma kabinleri: orta yolun iki yanında ikişer.
    for (const o of [-6.5, -4.5, 4.5, 6.5]) B.cabins.push(at(px + o, 25));
    // Büfe: batı yolunun başında, gerçek bina (içi açılır); önünde üç masa ve şemsiyesi.
    const [bx, bz] = at(walks[0] - 9, 27);
    this.addBuilding({ kind: "bufe", x: bx, z: bz, rot: face, w: 6, d: 4.5, floors: 1, roofType: "flat", wall: "#f6e3d8", roof: "#c9c4bb", style: { shop: true, awning: "#2f7fb5" }, address: "Plaj Büfesi, Driftwood Plajı" });
    for (let t = 0; t < 3; t++) {
      const [tx, tz] = at(walks[0] - 13 + t * 4, 21.5);
      this.features.push({ type: "masa1", x: tx, z: tz });
      this.features.push({ type: "semsiye", x: tx, z: tz, c: t, town: true });
      for (const sd of [-0.7, 0.7]) {
        const hx = tx + sd * dz, hz = tz - sd * dx;
        const heading = Math.atan2(tx - hx, tz - hz);
        this.features.push({ type: "sandalye", x: hx, z: hz, rot: heading });
        this.seats.push({ x: hx, z: hz, heading, h: 0.475, place: "plaj", table: [tx, tz] });
      }
    }
    // Voleybol: doğu ucunda, file kıyıya dik.
    const [vx, vz] = at(kx + 46, 16);
    B.volley = { x: vx, z: vz, rot: face };
    // Yüzme alanı: 30 m açıkta, kıyıya paralel şamandıralı ip.
    for (let x = kx - 100; x <= kx + 38; x += 3.5) B.buoys.push(at(x, -30));
    this.beach = B;
    this.block(kx - 100, Math.min(...B.clusters.map((c) => c.z)) - 4, kx + 52, Math.max(...B.clusters.map((c) => c.z)) + 4, 0);
  }

  // --- mahalleler ---

  cellCenter(cell) {
    return [cell.cx * CELL_W, cell.cz * CELL_D];
  }

  _entryZ(cell) {
    return cell.cz * CELL_D + (cell.cz === 0 ? -CELL_D / 2 : CELL_D / 2);
  }

  /** Mahallenin karakteri (tohumdan): sokak kavisi, ön bahçe derinliği, cumba sıklığı. */
  mahalleStyle(m) {
    this._styles ??= new Map();
    if (!this._styles.has(m)) {
      const h = (salt) => hash2(m, salt, 77);
      const curves = [0, 0, 2.5, 4, -3.5, 4.5];
      this._styles.set(m, {
        amp: curves[Math.floor(h(1) * curves.length)],
        period: 280 + Math.floor(h(2) * 3) * 90,
        phase: h(3) * Math.PI * 2,
        yard: 2.5 + h(4) * 1.5,
        cumba: 0.15 + h(5) * 0.5,
      });
    }
    return this._styles.get(m);
  }

  /**
   * Sokak sırası r'nin x'teki z'si (mahallenin kavis çizgisi) ve eğimi. Kavis mahalle sınırına doğru
   * sönümlenir: komşu mahallelerin aynı sıradaki sokakları sınır caddesinde aynı noktada buluşur
   * (birkaç metre arayla iki ayrı kavşak, çift ışık ve üst üste yüzey olmaz).
   */
  rowZ(cell, r, x) {
    const st = this.mahalleStyle(cell.mahalle);
    const [ox, oz] = this.cellCenter(cell);
    const k = (2 * Math.PI) / st.period;
    const u = Math.PI * ((x - ox) / CELL_W + 0.5);
    const env = Math.sin(Math.max(0, Math.min(Math.PI, u))), denv = (Math.PI / CELL_W) * Math.cos(u);
    const s = Math.sin(k * (x - ox) + st.phase), ds = k * Math.cos(k * (x - ox) + st.phase);
    return {
      z: oz + ROW_Z0 + r * ROW_PITCH + st.amp * s * env,
      slope: st.amp * (ds * env + s * denv),
    };
  }

  /**
   * Mahallenin sokak yerleri (sıra r, sütun c), mahalle girişine yakından uzağa: ilk sakinler merkeze en
   * yakın sokağa yerleşir, mahalle oradan dışa doğru büyür. Sokak numarası (adres) bu sıradır.
   */
  _sokakOrder(cell) {
    this._orders ??= new Map();
    const key = `${cell.cx},${cell.cz}`;
    if (!this._orders.has(key)) {
      const entryZ = this._entryZ(cell);
      const list = [];
      for (let r = 0; r < cap("sokak_per_mahalle") / SOKAK_COLS.length; r++) {
        for (let c = 0; c < SOKAK_COLS.length; c++) {
          const side = Math.abs(SOKAK_COLS[c][0] + SOKAK_COLS[c][1]) / 2;
          list.push({ r, c, d: Math.hypot(side, cell.cz * CELL_D + ROW_Z0 + r * ROW_PITCH - entryZ) });
        }
      }
      list.sort((a, b) => a.d - b.d || a.c - b.c);
      this._orders.set(key, list);
    }
    return this._orders.get(key);
  }

  _layoutMahalle(cell) {
    const [ox, oz] = this.cellCenter(cell);
    const halfD = CELL_D / 2, halfW = CELL_W / 2;
    const entryZ = this._entryZ(cell);
    const style = this.mahalleStyle(cell.mahalle);
    const cars = this.has("cevre_yolu");
    // Çevre caddeleri: mahallenin dört kenarı; sokaklar bunlara bağlanır, komşu mahalleler paylaşır.
    // Mahalle girişinden merkeze: hücre sınırındaki doğu-batı caddesi, oradan x = 0 hattındaki mahalle
    // caddeleriyle çevre yoluna (bu hücreler her zaman daha önce kurulur). Hepsi araçlarla birlikte gelir.
    this._tag("cevre_yolu", () => {
      if (ox !== 0) this.addRow(entryZ, ox, 0);
      this.addRow(oz - halfD, ox - halfW, ox + halfW);
      this.addRow(oz + halfD, ox - halfW, ox + halfW);
      this.addCol(ox - halfW, oz - halfD, oz + halfD);
      this.addCol(ox + halfW, oz - halfD, oz + halfD);
    });

    const perBina = cap("daire_per_bina");
    const binaPerSokak = cap("bina_per_sokak");
    const first = cell.mahalle * perMahalle();
    const order = this._sokakOrder(cell);
    const built = new Map(); // sokak sırası -> kurulu binaların x'leri
    for (let s = 0; s < cap("sokak_per_mahalle"); s++) {
      for (let b = 0; b < binaPerSokak; b++) {
        const slot0 = first + (s * binaPerSokak + b) * perBina;
        if (slot0 >= this.population) continue;
        const home = this.homeOf(slot0);
        const r = order[s].r;
        if (!built.has(r)) built.set(r, []);
        built.get(r).push(home.bx);
        const key = cell.mahalle * 1000 + s * 10 + b;
        const floors = 3 + Math.floor(hash2(key, 1, 5) * 3);
        const perFloor = Math.ceil(perBina / floors);
        this.addBuilding({
          kind: "konut", x: home.bx, z: home.bz, rot: home.rot,
          w: perFloor * 4.6 + 2.4, d: BINA_D, floors, perFloor, yard: style.yard, pathSeed: key,
          roofType: hash2(key, 2, 5) < 0.75 ? "hip" : "flat",
          wall: HOUSE_WALLS[Math.floor(hash2(key, 3, 5) * HOUSE_WALLS.length)],
          roof: HOUSE_ROOFS[Math.floor(hash2(key, 4, 5) * HOUSE_ROOFS.length)],
          balconies: hash2(key, 6, 5) < 0.7,
          cumba: hash2(key, 7, 5) < style.cumba,
          slot0, daireler: perBina,
          address: `${sokakName(home.parts.mahalle, home.parts.sokak)} No ${home.parts.bina + 1}, ${mahalleName(home.parts.mahalle)}`,
        });
        this.buildingBySlot0.set(slot0, this.buildings[this.buildings.length - 1]);
      }
    }

    // Sokaklar: evi olan ya da açılmış bir mahalle yerine (cami, çay bahçesi...) giden sıralar. Araçlar
    // gelene kadar sokak evlerin önüne (ya da o yere) kadar uzanır; sonra iki uçta çevre caddelerine
    // bağlanır. Mahalle caddesi de en uzak sokağa kadar gider.
    const reach = new Map(); // sokak sırası -> şeride uzanacağı yanlar
    for (const a of this._amenityPlan(cell)) {
      // Muhtarlık çay bahçesi şeridindedir: çay bahçesi açılmadan da yolu ona kadar uzanır.
      if (!this.has(a.key) && !(a.kind === "cay" && a.side > 0 && this.has(`muhtarlik:${cell.mahalle}`))) continue;
      if (!reach.has(a.row)) reach.set(a.row, new Set());
      reach.get(a.row).add(a.side);
    }
    let far = null;
    for (const r of new Set([...built.keys(), ...reach.keys()])) {
      if (far == null || Math.abs(this.rowZ(cell, r, ox).z - entryZ) > Math.abs(this.rowZ(cell, far, ox).z - entryZ)) far = r;
      const xs = built.get(r) ?? [ox];
      const xa = cars || reach.get(r)?.has(-1) ? ox - halfW : Math.min(ox, Math.min(...xs) - LOT / 2 - 3);
      const xb = cars || reach.get(r)?.has(1) ? ox + halfW : Math.max(ox, Math.max(...xs) + LOT / 2 + 3);
      const pts = [[xa, this.rowZ(cell, r, xa).z]];
      for (let x = ox - halfW; x <= ox + halfW + 0.1; x += 20) if (x > xa + 0.5 && x < xb - 0.5) pts.push([x, this.rowZ(cell, r, x).z]);
      pts.push([xb, this.rowZ(cell, r, xb).z]);
      this.addRoad(pts, "sokak");
    }
    if (cars) this.addRoad([[ox, oz - halfD], [ox, oz + halfD]], "cadde");
    else if (far != null) this.addRoad([[ox, entryZ], [ox, this.rowZ(cell, far, ox).z]], "cadde");
    this._layoutAmenities(cell);
    if (built.size) this.labels.push({ text: mahalleName(cell.mahalle), x: ox, z: oz, h: 45 });
  }

  /**
   * Mahallenin iki yanındaki şeritlerde, sokak araları: cami (avlu ve şadırvanla), çay bahçesi,
   * çocuk parkı, basketbol sahası, küçük park. Akşam dışarı çıkan sakinlerin yarısı buraya gelir.
   */
  /**
   * Mahalle yerlerinin şeritlerdeki dizilişi: her şeritte girişe en yakın sokak arasından uzağa, önce
   * açılanlar girişe yakın. Cami hep batı şeridinde (komşu mahallenin camisiyle sınır caddesinin iki
   * yanında karşı karşıya gelmesin); okul (okul sayısı kadar mahallede) doğuda. row: yerin girişe
   * yakın kenarındaki sokak (araçlar gelmeden önce o sokak şeride kadar uzatılır).
   */
  _amenityPlan(cell) {
    const m = cell.mahalle;
    const south = this._entryZ(cell) > cell.cz * CELL_D;
    const sides = { "-1": ["cami", "cay", "oyun", "park"], "1": [m < cat().isyerleri.okul.length ? "okul" : "park", "cay", "oyun", "basket"] };
    const out = [];
    for (const side of [-1, 1]) {
      sides[side].forEach((kind, i) => {
        const r = south ? 3 - i : i; // sokak arası: r ile r + 1
        out.push({ side, kind, r, row: south ? r + 1 : r, key: `${kind === "park" ? "mpark" : kind}:${m}` });
      });
    }
    return out;
  }

  _layoutAmenities(cell) {
    const [ox, oz] = this.cellCenter(cell);
    const halfW = CELL_W / 2;
    const m = cell.mahalle;
    const style = this.mahalleStyle(m);
    const place = "mahalle:" + m;
    const anchors = [], anchorKeys = [];
    const stripX = (side) => ox + side * (halfW - 7 - 13.5);
    // Sokak araları: r ile r+1 arası (r = 0..3).
    const gap = (r, x) => {
      const a = this.rowZ(cell, r, x).z + ROADS.sokak.width / 2 + 1, b = this.rowZ(cell, r + 1, x).z - ROADS.sokak.width / 2 - 1;
      return { z: (a + b) / 2, h: b - a };
    };
    for (const { side, kind, r, row, key } of this._amenityPlan(cell)) {
      const x = stripX(side);
      this._tag(key, () => {
        const g = gap(r, x);
        const cz = g.z;
        this.block(x - 13, cz - g.h / 2, x + 13, cz + g.h / 2, 0);
        switch (kind) {
          case "cami": {
            // Cami: arka tarafa çekilir; önde son cemaat yeri ve avlu (şadırvan). Minare ön köşeye bitişik.
            const rot = side < 0 ? Math.PI / 2 : -Math.PI / 2, bxm = x + side * 3, bzm = cz + 2;
            const cw = 14, cd = 14;
            this.addBuilding({ kind: "cami", x: bxm, z: bzm, rot, w: cw, d: cd, floors: 2, icKat: 1, roofType: "dome", wall: "#ece4d6", roof: "#7d8e9c", workplace: true, style: { dome: true }, address: `${mahalleName(m).replace(" Mahallesi", "")} Camii, ${mahalleName(m)}` });
            const toWorld = (lx, lz) => [bxm + lx * Math.cos(rot) + lz * Math.sin(rot), bzm - lx * Math.sin(rot) + lz * Math.cos(rot)];
            const [mx, mz] = toWorld(-cw / 2 - 1.15, cd / 2 - 1.2);
            this.features.push({ type: "minare", x: mx, z: mz });
            const [sx2, sz2] = toWorld(cw / 2 + 4.5, cd / 2 + 1.5); // avluda, son cemaat yerinin yanında
            this.features.push({ type: "sadirvan", x: sx2, z: sz2 });
            this.plazas.push({ x0: x - 12.5, z0: cz - g.h / 2 + 0.5, x1: x + 12.5, z1: cz + g.h / 2 - 0.5, kind: "avlu" });
            break;
          }
          case "okul": {
            // Bina şeridin kuzeyinde, cephesi güneydeki bahçeye bakar; bahçe duvarlı, kapısı güneydeki sokağa.
            const bz = cz - g.h / 2 + 6.5;
            const b = this.addBuilding({ kind: "okul", x, z: bz, rot: 0, w: 24, d: 11, floors: 3, roofType: "hip", wall: "#f2d9a6", roof: "#b5563f", workplace: true, style: STYLES.okul, address: `${cat().isyerleri.okul[m]}, ${mahalleName(m)}` });
            const yard = { x0: x - 12.5, x1: x + 12.5, z0: bz + 5.5 + 0.5, z1: cz + g.h / 2 - 0.5 };
            this.plazas.push({ ...yard, kind: "avlu" });
            this.features.push({ type: "okul_bahce", x, ...yard, gateX: x });
            const door = [x, bz + 5.5 - 0.35];
            const gate = [x, yard.z1 + 1];
            this._addWorkplace("okul", m, { door, path: [door, gate, HUB], anchor: door, spread: 2, building: b });
            (this.schools ??= []).push({ ...yard, x, building: b, _k: this._key });
            break;
          }
          case "cay": {
            this.plazas.push({ x0: x - 12, z0: cz - g.h / 2 + 1, x1: x + 12, z1: cz + g.h / 2 - 1, kind: "avlu" });
            this.addBuilding({ kind: "bufe", x: x + side * 8, z: cz - g.h / 2 + 5, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2, w: 6, d: 4.5, floors: 1, roofType: "flat", wall: "#f6e3d8", roof: "#c9c4bb", style: { shop: true, awning: "#3e8a86" }, address: `Çay Bahçesi Büfesi, ${mahalleName(m)}` });
            for (let t = 0; t < 6; t++) {
              const tx = x - 6 + (t % 2) * 9 - side * 2, tz = cz - 6 + Math.floor(t / 2) * 7;
              this.features.push({ type: "masa1", x: tx, z: tz });
              this.features.push({ type: "semsiye", x: tx, z: tz, c: (m + t) % 4, town: true });
              for (const dz of [-0.7, 0.7]) {
                const heading = Math.atan2(0, -dz);
                this.features.push({ type: "sandalye", x: tx, z: tz + dz, rot: heading });
                this.seats.push({ x: tx, z: tz + dz, heading, h: 0.475, place, table: [tx, tz] });
              }
            }
            anchors.push([x, cz]);
            anchorKeys.push(this._key);
            break;
          }
          case "oyun": {
            const seedP = m * 7 + r * 3 + (side > 0 ? 1 : 0);
            this.plazas.push({ x0: x - 11, z0: cz - g.h / 2 + 2, x1: x + 11, z1: cz + g.h / 2 - 2, kind: "oyun", color: ["#4f8a57", "#b8523f", "#4f78a8", "#7a8f3f", "#3e8a86"][seedP % 5] });
            this.features.push({ type: "oyun", x, z: cz, seed: seedP, w: 20, d: g.h - 6 });
            // Banklar velilerin; oyun parkı yetişkin buluşma noktası değil (çocuklar oynar).
            for (const dz of [-1, 1]) this.addBench(x + side * -10, cz + dz * 6, side < 0 ? Math.PI / 2 : -Math.PI / 2, place);
            break;
          }
          case "basket": {
            this.plazas.push({ x0: x - 8, z0: cz - 14, x1: x + 8, z1: cz + 14, kind: "basket" });
            this.features.push({ type: "pota", x, z: cz - 13 });
            this.features.push({ type: "pota", x, z: cz + 13, rot: Math.PI });
            break;
          }
          default: {
            // Küçük park: ağaçlar (blok kaldırılır) ve banklar.
            this.unblock(x - 13, cz - g.h / 2, x + 13, cz + g.h / 2);
            this.parks.push({ x0: x - 12, z0: cz - g.h / 2, x1: x + 12, z1: cz + g.h / 2 });
            this.addBench(x, cz, 0, place);
            anchors.push([x, cz + 3]);
            anchorKeys.push(this._key);
          }
        }
      });
      // Muhtarlık: doğudaki çay bahçesi şeridinde, mahalle girişine yakın sokağa bakan tek katlı ofis
      // (o uçta büfe varsa büfeden uzak yanda).
      if (kind === "cay" && side > 0) this._tag(`muhtarlik:${m}`, () => {
        const g = gap(r, x), st = STYLES.muhtarlik;
        const near = row === r ? -1 : 1; // yakın sokak şeridin kuzeyinde (-1) ya da güneyinde (+1)
        const bx = near < 0 ? x - 4 : x, bz = g.z + near * (g.h / 2 - st.d / 2 - 1);
        this.block(bx - st.w / 2 - 1, bz - st.d / 2 - 1, bx + st.w / 2 + 2.5, bz + st.d / 2 + 1, 0);
        const names = cat().isyerleri.muhtarlik;
        const b = this.addBuilding({
          kind: "muhtarlik", x: bx, z: bz, rot: near < 0 ? Math.PI : 0, w: st.w, d: st.d, floors: st.floors, roofType: st.roof,
          wall: st.wall, roof: st.roofColor, workplace: true, style: st, address: `Çay Bahçesi yanı, ${mahalleName(m)}`,
        });
        const door = [bx, bz + near * (st.d / 2 - 0.35)];
        this._addWorkplace("muhtarlik", m % names.length, { door, path: [door, [bx, g.z + near * (g.h / 2 + 1)], HUB], anchor: door, spread: 1.5, building: b });
      });
    }
    const pathPoint = [stripX(-1), this.rowZ(cell, 2, stripX(-1)).z];
    this._place(place, { anchors, anchorKeys, spread: 4, path: [pathPoint], mahalle: m });
  }

  /** Bir sakinin evi: bina konumu ve yönü, kapı ve meydana giden yol. */
  homeOf(slot) {
    const p = addressParts(slot);
    const cell = this.cells.find((c) => c.mahalle === p.mahalle) ?? (() => {
      const [cx, cz] = MAHALLE_CELLS[p.mahalle % MAHALLE_CELLS.length];
      return { cx, cz, mahalle: p.mahalle };
    })();
    const style = this.mahalleStyle(p.mahalle);
    const [ox, oz] = this.cellCenter(cell);
    const { r, c } = this._sokakOrder(cell)[p.sokak];
    // Sokakta binalar mahalle caddesine yakından uzağa, karşılıklı sırayla dizilir: tek numaralar
    // kuzeyde, çiftler güneyde.
    const pos = Math.floor(p.bina / 2), north = p.bina % 2 === 0;
    const [c0, c1] = SOKAK_COLS[c];
    const bx0 = c1 <= 0 ? ox + c1 - LOT / 2 - pos * LOT : ox + c0 + LOT / 2 + pos * LOT;
    const { z: streetZ, slope } = this.rowZ(cell, r, bx0);
    // Sokağın kuzey normali (eğimli sokakta binalar sokağa dik durur).
    const n = Math.hypot(1, slope);
    const nx = slope / n, nz = -1 / n;
    const sgn = north ? 1 : -1;
    const facade = ROADS.sokak.width / 2 + style.yard;
    const bx = bx0 + sgn * nx * (facade + BINA_D / 2), bz = streetZ + sgn * nz * (facade + BINA_D / 2);
    const rot = north ? -Math.atan(slope) : Math.PI - Math.atan(slope);
    const door = [bx0 + sgn * nx * (facade + 0.35), streetZ + sgn * nz * (facade + 0.35)];
    const entryZ = this._entryZ(cell);
    // Sokak boyunca (kavisi izleyerek) mahalle caddesine, oradan meydana.
    const along = [];
    const step = bx0 < ox ? 20 : -20;
    for (let x = bx0; step > 0 ? x < ox : x > ox; x += step) along.push([x, this.rowZ(cell, r, x).z]);
    const path = [...along, [ox, this.rowZ(cell, r, ox).z], [ox, entryZ], [0, entryZ], [0, -CELL_D / 2], HUB];
    return { bx, bz, rot, door, path, north, parts: p, building: this.buildingBySlot0.get(slot - p.daire) };
  }

  workplaceOf(wp) {
    const list = this.workplaces[wp.kind];
    return list[wp.index] ?? list.find(Boolean);
  }

  placeOf(name) {
    return this.places[name] ?? this.places.meydan;
  }
}

/** Tabloda adı olmayan gelişim adımlarının adı (çarşı dükkânları, sonraki mahallelerin yerleri). */
function stageName(key) {
  const [kind, n] = key.split(":");
  const m = Number(n);
  switch (kind) {
    case "carsi": return "Çarşıda yeni dükkân";
    case "cami": return `${mahalleName(m).replace(" Mahallesi", "")} Camii`;
    case "cay": return `${mahalleName(m)} çay bahçesi`;
    case "mpark": return `${mahalleName(m)} parkları`;
    case "oyun": return `${mahalleName(m)} çocuk parkları`;
    case "basket": return `${mahalleName(m)} basketbol sahası`;
    default: return cat().isyerleri[kind]?.[m] ?? key;
  }
}

/** Oyun parkındaki aletler: tohuma göre seçilir ve yerleştirilir (her park farklı). */
export function playgroundItems(f) {
  const h = (n) => ((Math.imul((f.seed + 1) * 2654435761 + n * 40503, 2246822519) >>> 0) % 10000) / 10000;
  const pool = ["kule", "salincak", "tahterevalli", "yayli", "kum", "kubbe", "atlikarinca", "tirmanma"];
  // Karıştır; alanın büyüklüğüne göre (iki sütun × 7 m'lik sıralar) en çok 8 alet yerleştir.
  const order = pool.map((k, i) => [h(i + 1), k]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const SIZES = { kule: [5, 4], salincak: [4.5, 2.6], tahterevalli: [3.6, 1.2], yayli: [3, 1.4], kum: [3.4, 3.4], kubbe: [3.6, 3.6], atlikarinca: [3.2, 3.2], tirmanma: [4.4, 1.6] };
  const depth = f.d ?? 12, width = f.w ?? 18;
  const rows = Math.max(2, Math.floor((depth - 2) / 7));
  const colX = width >= 16 ? [-width / 4 - 0.5, width / 4 + 0.5] : [-3, 3];
  const cells = [];
  for (let r = 0; r < rows; r++) for (const cx of colX) cells.push([cx, -((rows - 1) * 7) / 2 + r * 7]);
  const n = Math.min(order.length, cells.length);
  const flip = h(21) < 0.5 ? -1 : 1;
  return order.slice(0, n).map((kind, i) => {
    const [cx, cz] = cells[i];
    const [w, d] = SIZES[kind];
    const rot = Math.floor(h(30 + i) * 4) * (Math.PI / 2) + (h(40 + i) - 0.5) * 0.3;
    return { kind, x: f.x + cx * flip + (h(50 + i) - 0.5) * 1.2, z: f.z + cz + (h(60 + i) - 0.5) * 0.8, w, d, rot, c: Math.floor(h(70 + i) * 5) };
  });
}

/**
 * Apartman katının planı: ortada merdiven ve asansör çekirdeği (2,4 m), iki yanında daireler.
 * Katta ikiden fazla daire varsa arkada ortak koridor bulunur. Hem dış cephe hem iç mekân bunu kullanır.
 */
export function unitLayout(b) {
  const core = 2.4;
  const n = b.perFloor;
  const L = Math.ceil(n / 2);
  const u = (b.w - core) / n;
  const units = [];
  for (let c = 0; c < n; c++) {
    const x0 = c < L ? -b.w / 2 + c * u : core / 2 + (c - L) * u;
    units.push({ col: c, x0, x1: x0 + u, cx: x0 + u / 2, side: c < L ? -1 : 1, adjacent: c === L - 1 || c === L });
  }
  return { core: [-core / 2, core / 2], units, corridor: n > 2, corridorDepth: 1.5 };
}
