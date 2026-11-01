// Adanın yerleşimi: nüfustan deterministik olarak hesaplanır. Aynı nüfus her cihazda aynı adayı verir.
// Ölçek gerçektir: 1 birim = 1 metre. Koordinatlar: x doğu, z güney, y yukarı; (0,0) Town Green'in ortası.
//
// Adanın biçimi (kıyı, arazi), ana yollar ve mahalle bölgeleri island.js'tedir ve nüfustan bağımsızdır. Burada
// kasaba (Town Green, Main Street, Water Street, rıhtımlar), kıyı ve doğa yerleri (fener, plaj, boardwalk, bataklık,
// Bluff Head) ve dolan mahallelerin sokakları ve evleri kurulur.
//
// Gelişim: ada her zaman tam haliyle hesaplanır (her şeyin yeri sabittir), ama yalnızca açılmış parçalar
// kurulur. Her bina, yol, alan ve süs bir gelişim anahtarıyla etiketlenir (sim.js stageOf); düzey o
// anahtarın nüfusuna ulaşmamışsa ayıklanır. Boş adada feribot iskelesi, kum yollar, Town Green ve bayrak direği,
// fener, plaj ve kumullar vardır; evler sakinler geldikçe, gerisi gelişim tablosuna göre açılır.
import { addressParts, cap, cat, houseOf, isOpen, mahalleName, sokakName, stageOf, streetAddress, townLevel, housingOf } from "../sim.js";
import { fbm, hash2 } from "./noise.js";
import { buildNetwork, H as LAYER, stations } from "./roads.js";
import * as I from "./island.js";

// Eski hücre ölçüleri (yalnız geriye uyum; yeni kod kullanmaz).
export const CELL_W = 560;
export const CELL_D = 270;
export const FLAT_Y = I.FLAT_Y;
export const FLOOR_H = 3.2;

const HUB = I.HUB;
const GREEN = { x0: -75, x1: 75, z0: -45, z1: 45 }; // Town Green (çim); çevresinde sokaklar
const GREEN_ST = 90; // Green'in doğu/batı sokaklarının x'i
const CHURCH_Z = -58; // Church Street
const MAIN_HALF = 9; // Main Street: 8 m taşıt yolu + iki yanda 5 m tuğla kaldırım

// Yol kesitleri (toplam genişlik = taşıt yolu + iki kaldırım).
export const ROADS = {
  cadde: { width: 14, carriage: 8, surface: "asfalt" },
  sokak: { width: 13, carriage: 8, surface: "asfalt" }, // iki şerit + iki yanda kenar parkı
  koy: { width: 6.5, carriage: 6.5, surface: "asfalt" },
  yaya: { width: 6, carriage: 0, surface: "tas" }, // tuğla yaya yolu (Green patikaları)
  sahil: { width: 7, carriage: 0, surface: "tas" }, // Harbor Walk, boardwalk
  patika: { width: 2.6, carriage: 0, surface: "toprak" }, // patika; geniş verilirse asfaltlanmamış kum yol
  giris: { width: 6, carriage: 6, surface: "asfalt" }, // otopark, hastane ve garaj girişi
};

// İş yeri türlerinin bina biçimi (metre). Tuğla, beyaz ahşap, gri sedir shingle; çatılar koyu.
const STYLES = {
  belediye: { w: 30, d: 20, floors: 2, roof: "hip", wall: "#a34a3a", roofColor: "#4d5560", tower: true },
  muze: { w: 26, d: 16, floors: 2, roof: "gable", wall: "#f1ece0", roofColor: "#4d5560", columns: true },
  kutuphane: { w: 22, d: 14, floors: 2, roof: "gable", wall: "#9b4a3a", roofColor: "#3f4247" },
  saglik: { w: 26, d: 16, floors: 3, roof: "flat", wall: "#eef0f2", roofColor: "#c9c4bb", sign: "#2f5d8a" },
  okul: { w: 40, d: 16, floors: 2, roof: "flat", wall: "#a34a3a", roofColor: "#6f665c" },
  otel: { w: 30, d: 16, floors: 3, roof: "gable", wall: "#f4f1ea", roofColor: "#4d5560", balconies: true },
  plaza: { w: 22, d: 18, floors: 4, roof: "flat", wall: "#b0533f", roofColor: "#6f665c" },
  market: { w: 18, d: 14, floors: 2, roof: "gable", wall: "#8f8a80", roofColor: "#3f4247", shop: true, awning: "#2f4256" },
  firin: { w: 10, d: 12, floors: 2, roof: "flat", wall: "#e9d8a0", roofColor: "#6f665c", shop: true, awning: "#8e2f2a" },
  kafe: { w: 10, d: 12, floors: 2, roof: "flat", wall: "#f4f1ea", roofColor: "#6f665c", shop: true, awning: "#2f4256" },
  atolye: { w: 16, d: 14, floors: 1, roof: "gable", wall: "#8f8a80", roofColor: "#3f4247", shop: true, awning: "#6f7d4a" },
  kahvehane: { w: 18, d: 11, floors: 1, roof: "flat", wall: "#c9ced3", roofColor: "#9aa3ab", shop: true, awning: "#c43a3a", diner: true },
  karakol: { w: 22, d: 14, floors: 2, roof: "flat", wall: "#a34a3a", roofColor: "#6f665c", band: "#1f3f73", plate: "#1f3f73", flag: true },
  adliye: { w: 28, d: 18, floors: 2, roof: "flat", wall: "#f1ece0", roofColor: "#c9c4bb", columns: true, plate: "#5a4636", flag: true },
  muhtarlik: { w: 14, d: 9, floors: 1, roof: "gable", wall: "#f4f1ea", roofColor: "#4d5560", plate: "#2f5d8a", flag: true },
};

// Şubelerin kendi cephe kimliği (tente ve duvar rengi): aynı türden işletmeler birbirinin kopyası olmasın.
const BRANCH = {
  "kafe:0": { awning: "#2f4256", wall: "#f4f1ea" }, // Driftwood Coffee Co.: lacivert
  "kafe:1": { awning: "#6f4a32", wall: "#e9d8b8", signFont: "serif", signFg: "#f3d9a4" }, // The Salty Bean: kahve
  "kafe:2": { awning: "#3e7a5a", wall: "#eef1e4", signFont: "serif" }, // Harborside Café: yeşil
  "kafe:3": { awning: "#b8433c", wall: "#f4f1ea" }, // Lighthouse Coffee: fener kırmızısı
  "kafe:4": { awning: "#c9a441", wall: "#f3ead2" }, // Dune Grass Café: kum sarısı
  "kafe:5": { awning: "#2f7fb5", wall: "#e6eef4" }, // Low Tide Espresso: deniz mavisi
  "firin:0": { awning: "#8e2f2a", wall: "#e9d8a0" }, // Driftwood Bakery
  "firin:1": { awning: "#e07a9a", wall: "#f7e9ef" }, // Gull's Donut Shop: pembe
  "firin:2": { awning: "#5a4a3a", wall: "#a34a3a", signFont: "serif", signFg: "#f0d7a8" }, // Brick Oven Bakery
  "market:0": { awning: "#2f4256", wall: "#8f8a80" }, // General Store
  "market:1": { awning: "#3e7a3a", wall: "#f1ead6" }, // Corner Market
  "market:2": { awning: "#b8433c", wall: "#8e2f2a", signFont: "serif" }, // Farm Stand: ahır kırmızısı
  "market:3": { awning: "#1f3f2a", wall: "#f3ece2", signFont: "serif", signFg: "#f3e2b8" }, // Harbor Deli
  "atolye:0": { awning: "#b5653f" }, // Pottery Studio
  "atolye:1": { awning: "#7a5a3e", wall: "#e8dcc8", signFont: "serif" }, // Woodshop
  "atolye:2": { awning: "#7a6a9a", wall: "#eee8f0" }, // Art Studio
  "atolye:3": { awning: "#2f4256", wall: "#eef2f5" }, // Sail Loft
};

// Main Street dükkânlarının zanaatları (iç düzeni isletme.js) ve tabeladaki ad: "Harbor Barbershop"...
const DUKKANLAR = [
  ["berber", "Barbershop"], ["terzi", "Tailor"], ["kirtasiye", "Five & Dime"], ["cicekci", "Florist"],
  ["aktar", "Candy & Fudge"], ["nalbur", "Hardware"], ["kuyumcu", "Jeweler"], ["kitapci", "Bookshop"],
];
const CARSI_ON = ["Main Street", "Harbor", "Driftwood", "Bayside", "Gull", "Lantern", "Anchor", "Compass", "Tidewater", "Beacon", "Dune", "Island"];

// Main Street'teki iş yerleri: [tür, şube, tercih edilen x, yan (1: koy tarafı, -1: iç taraf)]. Her biri tercih
// ettiği yere en yakın boş cepheye yerleşir (Diner feribot iskelesinin karşısında, kafe Green'in karşısında).
const CENTER_ORDER = [
  ["kahvehane", 0, 165, 1], ["market", 0, -170, 1], ["firin", 0, -40, 1], ["karakol", 0, 300, -1], ["kafe", 0, 50, 1],
  ["adliye", 0, -190, -1], ["muze", 0, 330, 1], ["kafe", 1, -270, -1], ["kutuphane", 0, -250, 1], ["plaza", 0, -340, -1],
  ["kafe", 2, 120, 1], ["firin", 1, 240, -1], ["otel", 0, 420, 1], ["market", 1, -120, -1], ["atolye", 0, -380, 1],
  ["kafe", 3, 280, 1], ["plaza", 1, 380, -1], ["market", 2, -330, 1], ["firin", 2, 160, -1], ["otel", 1, -400, -1],
  ["atolye", 1, -250, -1], ["kafe", 4, -110, 1], ["plaza", 2, 410, -1], ["market", 3, 120, -1], ["atolye", 2, 200, -1],
  ["kafe", 5, -300, 1], ["atolye", 3, 360, 1],
];

// Konut cephe renkleri: New England ahşap kaplama (beyaz, gri sedir, lacivert, ahır kırmızısı, sarı, adaçayı).
const HOUSE_WALLS = ["#f4f1ea", "#f1ece0", "#8f8a80", "#9a9488", "#2f4256", "#8e2f2a", "#e9d8a0", "#a6b59a", "#7d8e9e", "#d9d2c2", "#c8b48a", "#f4f1ea"];
const HOUSE_ROOFS = ["#3f4247", "#4d5560", "#6f665c", "#55504a", "#3a3f46"];

const OUTDOOR_KINDS = new Set(["liman", "balikci_koyu", "tersane", "tarla", "plaj", "fener", "saha", "lunapark"]);

// Gelişim anahtarıyla etiketlenen listeler.
const TAGGED = ["buildings", "roads", "plazas", "features", "labels", "seats", "lamps", "piers", "parks"];
// Tek nesne olarak tutulan yerler ve açıldıkları anahtar.
const REFS = {
  carsiWalks: "carsi_yol", pitch: "saha", hospital: "saglik:0", port: "liman:0", tersane: "tersane:0",
  koy: "balikci_koyu:0", promenade: "sahil_yolu", fireStation: "itfaiye", depot: "garaj", beach: "plaj:0", lunapark: "lunapark:0",
};

// Yol yüksekliği için yumuşatma çekirdeği (12 m çapında, ağırlıklı).
const KERNEL = (() => {
  const k = [[0, 0, 4]];
  for (const r of [3, 6]) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r; k.push([Math.cos(a) * r, Math.sin(a) * r, r === 3 ? 2 : 1]); }
  const sum = k.reduce((t, [, , w]) => t + w, 0);
  return k.map(([x, z, w]) => [x, z, w / sum]);
})();

export function perMahalle() {
  return cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle");
}

export function mahalleCount(population) {
  return Math.max(1, Math.ceil(population / perMahalle()));
}

/** Ada başına 50 mahalle bölgesi (island.js; nüfustan bağımsız, hep aynı). */
export function islandZones() {
  return I.zones(cap("mahalle_per_ada"), (m) => housingOf(m).tip);
}

// Konut tiplerinin yapı ölçüleri: Cape Cod kulübesi (tek katlı, çatı arası), iki aileli ev (2 kat, katta bir daire),
// four-square (2 kat, katta iki daire), garden apartment (3 kat, katta üç daire; sonuncusunda iki).
const HOUSE_DIMS = {
  cottage: { w: 8.5, d: 9, floors: 1, perFloor: 1 },
  twofamily: { w: 9, d: 13, floors: 2, perFloor: 1 },
  fourplex: { w: 13, d: 13, floors: 2, perFloor: 2 },
  apartments: { w: 28, d: 13, floors: 3, perFloor: 3 },
};

/** Main Street boyunca x'teki eksen noktası, teğeti ve koy tarafına bakan normali. */
function mainAt(x) {
  const z = I.mainZ(x), s = (I.mainZ(x + 1) - I.mainZ(x - 1)) / 2, L = Math.hypot(1, s);
  return { p: [x, z], t: [1 / L, s / L], n: [-s / L, 1 / L], slope: s };
}

function curveX(fn, x0, x1, step = 20) {
  const pts = [];
  for (let x = x0; x < x1 - 0.1; x += step) pts.push([x, fn(x)]);
  pts.push([x1, fn(x1)]);
  return pts;
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

export class World {
  constructor(population) {
    this.population = population;
    this.level = townLevel(); // gelişim düzeyi: en yüksek nüfus (main.js sim.setTown ile verir)
    this.zones = islandZones();
    this.mahalleler = Math.min(mahalleCount(population), this.zones.length);
    // Eski hücre modeli yok: yer türü zoneAt() ile sorulur.
    this.cells = [];
    this.cellByKey = new Map();
    this.bounds = { x0: -3350, x1: 3350, z0: -1800, z1: 1100 };
    this.hill = { x: 1680, z: 120, r: 260, h: 30 };
    // Düzlenen alanlar (binalar FLAT_Y'de durur): kasaba, bütün mahalle bölgeleri, bataklık ve tarlalar, saha.
    const R = I.RESERVES, box = (b) => ({ poly: [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z1], [b.x1, b.z0]] });
    I.setFlatAreas([
      box({ x0: -780, x1: 760, z0: -160, z1: 420 }), box(R.bog), box(R.field), box(R.services),
      { poly: [[580, -40], [580, 140], [760, 140], [760, -40]] }, // hastane ve pazar tarafı
      ...this.zones.map((z) => ({ poly: [[-z.hw, -12], [-z.hw, I.ZONE.depth], [z.hw, I.ZONE.depth], [z.hw, -12]].map(([u, v]) => I.zoneToWorld(z, u, v)) })),
    ]);

    this.buildings = [];   // {kind, x, z, rot, w, d, floors, roofType, wall, roof, ...}
    this.roads = [];       // {points, type, width, carriage, surface}
    this.plazas = [];      // {x, z, r} veya {x0, z0, x1, z1, kind}
    this.features = [];    // bandstand, iskele, vapur, fener, bank, ...
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
    this.cols = new Map();
    this.rows = new Map();
    this._key = null;      // şu an kurulan parçanın gelişim anahtarı
    this._blockOps = [];   // ağaç yasağı işlemleri (açılan parçalarınki sonradan uygulanır)
    this._staged = false;

    this._layoutTown();
    this._layoutWaterfront();
    this._layoutNature();
    for (let m = 0; m < this.mahalleler; m++) this._layoutMahalle(this.zones[m]);
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

  /** Bir noktanın yer türü: merkez (kasaba), mahalle, tepe (Bluff Head), kumul, kir. */
  zoneAt(x, z) {
    for (let m = 0; m < this.mahalleler; m++) {
      const zn = this.zones[m];
      if (Math.hypot(x - zn.cx, z - zn.cz) > zn.r) continue;
      const [u, v] = I.worldToZone(zn, x, z);
      if (Math.abs(u) <= zn.hw && v >= 0 && v <= I.ZONE.depth) return "mahalle";
    }
    const r = I.inReserve(x, z);
    if (r === "town" || r === "services" || r === "field") return "merkez";
    if (r === "bluff") return "tepe";
    if (r === "dunes") return "kumul";
    if (r === "bog") return "tarla";
    return "kir";
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
      if (at) this.labels.push({ text: `${this.nextStage.name} · at ${next} residents`, x: at[0], z: at[1], h: 22, site: true });
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
    return keys.includes("carsi_yol") ? [-200, I.mainZ(-200)] : null;
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
        case "bandstand": this.addObstacleCircle(f.x, f.z, 6.2); break;
        case "dikilitas": this.addObstacleRect(f.x, f.z, 1.6, 1.6); break;
        case "kilise_kule": this.addObstacleRect(f.x, f.z, 5, 5, f.rot); break;
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

  /** Kıyıya işaretli uzaklık: karada −, denizde +. (Eski hücre modelindeki anlamıyla: margin 0 kıyı çizgisi.) */
  sdf(x, z) {
    return -I.land(x, z);
  }

  margin() {
    return 0;
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

  /** Doğal arazi (tesviyesiz): island.js. */
  rawHeight(x, z) {
    return I.terrainHeight(x, z);
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

  addRoad(points, type, extra = {}) {
    const spec = { ...ROADS[type], ...extra };
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

  // --- kasaba: Town Green, Main Street, Water Street ---

  /** Main Street, Water Street ve ara sokaklar: araçlar gelene kadar (cevre_yolu) kum/toprak yol, sonra asfalt. */
  _townRoad(points, type, extra = {}) {
    if (this.has("cevre_yolu")) this.addRoad(points, type, extra);
    else this.addRoad(points, "patika", { width: type === "sokak" && extra.width ? 7 : 5 });
  }

  _layoutTown() {
    const g = GREEN;
    // Town Green: çim, köşegen tuğla patikalar, ortada beyaz çardak (bandstand) ve bayrak direği. Boş adada da var.
    this.block(g.x0, g.z0, g.x1, g.z1, 0);
    this.plazas.push({ x: 0, z: 0, r: 11, kind: "meydan" }); // çardağın çevresindeki tuğla daire
    this.features.push({ type: "bandstand", x: 0, z: 0 });
    this.features.push({ type: "gonder", x: 0, z: g.z1 - 6, abd: true });
    const corners = [[g.x0 + 2, g.z0 + 2], [g.x1 - 2, g.z0 + 2], [g.x0 + 2, g.z1 - 2], [g.x1 - 2, g.z1 - 2]];
    const walk = this.has("carsi_yol") ? "yaya" : "patika";
    for (const [cx, cz] of corners) {
      const d = Math.hypot(cx, cz);
      this.addRoad([[cx, cz], [cx * (11 / d), cz * (11 / d)]], walk, walk === "patika" ? { width: 2.2 } : { width: 3.6 });
    }
    // Green'in güney kenarından Main Street'e ve çardağa giden orta patika (bayrak direğinin yanından).
    this.addRoad([[0, 11], [0, g.z1]], walk, walk === "patika" ? { width: 2.2 } : { width: 3.6 });
    this._tag("meydan_duzen", () => {
      // Banklar patikaların iki yanında, çardağa bakar; akçaağaçlar Green'in kenarlarında.
      for (const [cx, cz] of corners) {
        const d = Math.hypot(cx, cz), ux = cx / d, uz = cz / d;
        for (const t of [24, 40]) for (const sd of [-1, 1]) {
          const bx = ux * t - uz * sd * 3.2, bz = uz * t + ux * sd * 3.2;
          this.addBench(bx, bz, Math.atan2(uz * sd, -ux * sd), "meydan");
        }
      }
      for (let x = g.x0 + 8; x <= g.x1 - 8; x += 16) for (const z of [g.z0 + 4, g.z1 - 4]) {
        if (Math.abs(x) > 6) this.features.push({ type: "agac", x, z, tur: "akcaagac" });
      }
      for (const z of [-20, 20]) for (const x of [g.x0 + 4, g.x1 - 4]) this.features.push({ type: "agac", x, z, tur: "akcaagac" });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        this.lamps.push({ x: Math.cos(a) * 13, z: Math.sin(a) * 13, dir: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      }
      this.features.push({ type: "dikilitas", x: 0, z: g.z0 + 9 });
    });
    this._place("meydan", { anchors: [[0, 0], [-30, -20], [30, 20], [-30, 22], [30, -22]], spread: 9, path: [HUB] });
    this.labels.push({ text: "Town Green", x: 0, z: 0, h: 34 });

    // Green'in çevresindeki sokaklar ve Main Street. Main Street iki ucunda Lighthouse ve Bluff Road'a bağlanır.
    const [mx0, mx1] = I.MAIN_X;
    this._townRoad(curveX(I.mainZ, mx0, mx1), "sokak", { width: MAIN_HALF * 2, main: true });
    this._townRoad([[-GREEN_ST, CHURCH_Z], [GREEN_ST, CHURCH_Z]], "sokak");
    for (const sx of [-GREEN_ST, GREEN_ST]) this._townRoad([[sx, CHURCH_Z], [sx, I.mainZ(sx)]], "sokak");
    // Koy tarafındaki ara sokaklar: Main Street'ten Water Street'e (rıhtımlara iner).
    this.crossX = [-330, -110, 210, 400];
    for (const x of this.crossX) this._townRoad([[x, I.mainZ(x)], [x, I.waterZ(x)]], "sokak");
    this._townRoad(curveX(I.waterZ, -760, 560), "sokak");
    this.labels.push({ text: "Main Street", x: -240, z: I.mainZ(-240), h: 26 });

    // Kilise (beyaz, sivri kuleli; 50. sakinde): Green'in kuzeyinde, Church Street'e bakar.
    this._tag("cami:0", () => this._church(0, -84, 0, "Driftwood Church", null));
    // Town Hall (saat kuleli tuğla) Green'in doğusunda; kütüphane batısında Main Street'te (CENTER_ORDER).
    this._tag("belediye:0", () => {
      const st = STYLES.belediye;
      const b = this.addBuilding({ kind: "belediye", x: GREEN_ST + 9 + st.d / 2, z: -2, rot: -Math.PI / 2, w: st.w, d: st.d, floors: st.floors, roofType: st.roof, wall: st.wall, roof: st.roofColor, style: st, workplace: true, address: "1 Green Street East" });
      const door = [GREEN_ST + 9 + 0.35, -2];
      this._addWorkplace("belediye", 0, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
      this.features.push({ type: "gonder", x: GREEN_ST + 7, z: -18, abd: true });
    });

    this._mainStreet();
    this._tag("carsi_yol", () => {
      // Tuğla kaldırımlar: insanların vitrinlere bakarak yürüdüğü şeritler (Main Street'in iki yanı).
      const walks = [];
      for (const side of [-1, 1]) {
        const pts = [];
        for (let x = mx0 + 15; x <= mx1 - 15; x += 10) { const a = mainAt(x); pts.push([x + a.n[0] * side * 6.5, a.p[1] + a.n[1] * side * 6.5]); }
        walks.push(pts);
      }
      this.carsiWalks = walks;
    });
    this._tag("cevre_yolu", () => this._layoutParking());
    this._tag("saglik:0", () => this._layoutHospital());
    this._tag("pazar", () => this._layoutMarket());
    this._tag("saha", () => this._layoutPitch());
    this._tag("park", () => this._layoutPondPark());
  }

  /** Beyaz ahşap New England kilisesi: kule ön cephede; önünde küçük avlu. (x, z) bina merkezi, rot cephe yönü. */
  _church(x, z, rot, name, m) {
    const w = 14, d = 24;
    const b = this.addBuilding({ kind: "cami", x, z, rot, w, d, floors: 2, icKat: 1, roofType: "gable", wall: "#f7f5ef", roof: "#3f4247", workplace: true, style: { church: true }, address: name });
    const f = [Math.sin(rot), Math.cos(rot)];
    this.features.push({ type: "kilise_kule", x: x + f[0] * (d / 2 + 2.2), z: z + f[1] * (d / 2 + 2.2), rot });
    if (m != null) b.mahalle = m;
    return b;
  }

  /** Main Street cepheleri: iş yerleri tercih ettikleri yere en yakın boş cepheye, kalanı dükkân ve üstü daireler. */
  _mainStreet() {
    const [mx0, mx1] = I.MAIN_X;
    const used = { "-1": [[-GREEN_ST - 8, GREEN_ST + 8]], 1: [] };
    for (const x of this.crossX) used[1].push([x - 10, x + 10]);
    for (const x of [-GREEN_ST, GREEN_ST]) used[-1].push([x - 10, x + 10]);
    used[-1].push([425, 455], [-250, -220]); // hastane ve otopark girişleri
    const free = (side, a, b) => a > mx0 + 6 && b < mx1 - 6 && used[side].every(([p, q]) => b < p || a > q);
    const frontage = (side, want, w) => {
      for (let k = 0; k < 400; k++) {
        for (const sg of k ? [1, -1] : [1]) {
          const x = want + sg * k * 2;
          if (free(side, x - w / 2 - 1.2, x + w / 2 + 1.2)) { used[side].push([x - w / 2 - 1.2, x + w / 2 + 1.2]); return x; }
        }
      }
      return null;
    };
    const place = (x, side, w, d) => {
      const a = mainAt(x);
      const off = MAIN_HALF + 0.8;
      const f = [-a.n[0] * side, -a.n[1] * side]; // cephe yönü: sokağa
      return {
        x: x + a.n[0] * side * (off + d / 2), z: a.p[1] + a.n[1] * side * (off + d / 2), rot: Math.atan2(f[0], f[1]),
        door: [x + a.n[0] * side * (off + 0.35), a.p[1] + a.n[1] * side * (off + 0.35)],
        out: [x + a.n[0] * side * (MAIN_HALF - 1.2), a.p[1] + a.n[1] * side * (MAIN_HALF - 1.2)], f, t: a.t,
      };
    };
    let no = { "-1": 2, 1: 1 };
    CENTER_ORDER.forEach(([kind, index, want, side]) => this._tag(`${kind}:${index}`, () => {
      const style = { ...STYLES[kind], ...BRANCH[`${kind}:${index}`] };
      const x = frontage(side, want, style.w);
      if (x == null) return;
      const q = place(x, side, style.w, style.d);
      const b = this.addBuilding({
        kind, x: q.x, z: q.z, rot: q.rot, w: style.w, d: style.d, floors: style.floors, roofType: style.roof,
        address: `${10 + Math.round((x - mx0) / 4) * 2 + (side > 0 ? 1 : 0)} Main Street`,
        wall: style.wall, roof: style.roofColor, style, workplace: true,
      });
      const door = q.door;
      if (kind === "kahvehane") {
        this._place("kahvehane", { anchors: [door], spread: 3, path: [door, HUB], building: b });
        this._addWorkplace("kahvehane", index, { door, path: [door, HUB], anchor: door, spread: 2, building: b }); // aşçı
        this._sidewalkTables(q, 3, "kahvehane");
      } else {
        this._addWorkplace(kind, index, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
        if (kind === "kafe" || kind === "firin") this._sidewalkTables(q, kind === "kafe" ? 3 : 2, "kafe");
      }
      if (kind === "otel" && index === 0) {
        // Harbor Inn: arka bahçede havuz (koy tarafı).
        const px = q.x - q.f[0] * 24, pz = q.z - q.f[1] * 24;
        this.features.push({ type: "havuz", x: px, z: pz, w: 22, d: 10 });
        this.block(px - 16, pz - 10, px + 16, pz + 10, 0);
      }
    }));
    // Cephelerin kalanı: altı dükkân, üstü daire 2-3 katlı tuğla ve ahşap bloklar; Green'e yakından uzağa açılır.
    const fillers = [];
    let k = 0;
    for (const side of [-1, 1]) {
      for (let x = mx0 + 12; x < mx1 - 12; x += 2) {
        const key = 9000 + k;
        const w = 9 + Math.floor(hash2(key, 1, 9) * 3) * 2;
        if (!free(side, x - 0.6, x + w + 0.6)) continue;
        used[side].push([x - 0.6, x + w + 0.6]);
        k++;
        const d = 14, q = place(x + w / 2, side, w, d);
        const brick = hash2(key, 5, 9) < 0.55;
        const wall = brick ? ["#a34a3a", "#9b4a3a", "#b0533f", "#8a3e32"][Math.floor(hash2(key, 6, 9) * 4)] : HOUSE_WALLS[Math.floor(hash2(key, 7, 9) * HOUSE_WALLS.length)];
        const awning = ["#2f4256", "#8e2f2a", "#3e7a5a", "#c9a441", "#6f7d4a", "#5a4a6a", "#2f7fb5"][Math.floor(hash2(key, 2, 9) * 7)];
        fillers.push([Math.abs(x + w / 2), this.addBuilding({
          kind: "carsi", x: q.x, z: q.z, rot: q.rot, w, d, floors: 2 + Math.floor(hash2(key, 3, 9) * 2), roofType: "flat",
          address: `${10 + Math.round((x + w / 2 - mx0) / 4) * 2 + (side > 0 ? 1 : 0)} Main Street`,
          wall, roof: "#6f665c", style: { shop: true, awning, brick, cornice: true }, workplace: true,
        })]);
        x += w;
      }
    }
    fillers.sort((a, b) => a[0] - b[0] || a[1].x - b[1].x).forEach(([, b], i) => {
      b._k = `carsi:${i}`;
      const [dukkan, ek] = DUKKANLAR[i % DUKKANLAR.length];
      b.dukkan = dukkan;
      b.isim = `${CARSI_ON[Math.floor(i / DUKKANLAR.length) % CARSI_ON.length]} ${ek}`;
    });
  }

  /** Kaldırımdaki masalar (kafe, diner): kapının önünde, cepheye paralel. */
  _sidewalkTables(q, n, place) {
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 2.6 + 3.2;
      const tx = q.out[0] + q.t[0] * along + q.f[0] * -1.2, tz = q.out[1] + q.t[1] * along + q.f[1] * -1.2;
      this.features.push({ type: "masa1", x: tx, z: tz });
      for (const sd of [-1, 1]) {
        const cx = tx + q.t[0] * sd * 0.7, cz = tz + q.t[1] * sd * 0.7;
        const heading = Math.atan2(tx - cx, tz - cz);
        this.features.push({ type: "sandalye", x: cx, z: cz, rot: heading });
        this.seats.push({ x: cx, z: cz, heading, h: 0.475, place, table: [tx, tz] });
      }
    }
  }

  _layoutParking() {
    // Otoparklar: Main Street'in arkasında (Green'in batısı) ve feribot iskelesinin yanında; girişleri sokaktan.
    this.parkingLots = [];
    const lots = [
      { x0: -290, x1: -180, z0: -130, z1: -66, gate: [-235, -66], to: [-235, I.mainZ(-235)] },
      { x0: 245, x1: 330, z0: I.mainZ(290) + 30, z1: I.waterZ(290) - 9, gateX: 245, side: "x" },
    ];
    const a = lots[0];
    a.gateSide = 1; a.gateX = a.gate[0];
    this.addRoad([a.to, a.gate], "giris");
    const b = lots[1];
    const mid = (b.z0 + b.z1) / 2;
    b.gateSide = -1; b.gate = [b.x0, mid];
    this.addRoad([[210, mid], [b.x0, mid]], "giris");
    for (const lot of lots) {
      this.parkingLots.push(lot);
      this.plazas.push({ x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1, kind: "otopark" });
      this.block(lot.x0, lot.z0, lot.x1, lot.z1, 1);
    }
  }

  _layoutHospital() {
    // Medical Center: Main Street'in doğu ucunun kuzeyinde; önünde ambulans alanı, Main Street'ten giriş yolu.
    const hx = 440, hz = -30;
    const b = this.addBuilding({ kind: "saglik", x: hx, z: hz - 16, rot: 0, w: 38, d: 20, floors: 3, roofType: "flat", wall: "#eef0f2", roof: "#c9c4bb", workplace: true, style: STYLES.saglik, address: "2 Hospital Drive" });
    this.plazas.push({ x0: hx - 14, z0: hz - 5, x1: hx + 14, z1: hz + 12, kind: "avlu" });
    this.addRoad([[hx, I.mainZ(hx)], [hx, hz + 4]], "giris");
    const door = [hx, hz - 5.65];
    this._addWorkplace("saglik", 0, { door, path: [door, [hx, I.mainZ(hx)], HUB], anchor: door, spread: 2, building: b });
    this.hospital = { building: b, bay: [hx, hz + 2], door };
    this.features.push({ type: "tabela_h", x: hx + 9, z: hz + 4 });
  }

  _layoutMarket() {
    // Farmers Market: Green'in kuzeydoğusunda, Pond Road'un yanında açık alan; iki koridor tezgâh.
    const market = { x0: 130, z0: -150, x1: 230, z1: -100 };
    this.plazas.push({ ...market, kind: "pazar" });
    this.block(market.x0, market.z0, market.x1, market.z1, 0);
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
    this.addRoad([[market.x0 - 4, (market.z0 + market.z1) / 2], [GREEN_ST, (market.z0 + market.z1) / 2]], "patika");
    this._place("pazar", { anchors: aisleAnchors, spread: 6, path: [[market.x0, -125], HUB], aisles: aisles.map((az) => [market.x0 + 10, market.x1 - 10, az]) });
  }

  /** Gulls Field (Driftwood High): Amerikan futbolu sahası, tribünler, ışıklar ("Friday night lights"). */
  _layoutPitch() {
    const cx = -330, cz = -265, x0 = cx - 55, x1 = cx + 55, z0 = cz - 26, z1 = cz + 26;
    this.plazas.push({ x0, z0, x1, z1, kind: "saha" });
    this.pitch = { x0, z0, x1, z1, cx, cz, football: true };
    for (const side of [-1, 1]) {
      const edge = side < 0 ? z0 : z1;
      this.features.push({ type: "tribun", x0: x0 + 10, x1: x1 - 10, z: edge, side });
      for (let r = 0; r < 4; r++) {
        for (let x = x0 + 11; x < x1 - 10; x += 0.62) {
          if ((x - x0 - 10) % 15 < 1.3) continue;
          const z = edge + side * (1.2 + r * 0.8);
          this.seats.push({ x, z, heading: side < 0 ? 0 : Math.PI, h: 0.45 + r * 0.4, place: "tribun", absolute: true });
        }
      }
    }
    for (const gx of [x0 + 2, x1 - 2]) this.features.push({ type: "kale", x: gx, z: cz, dir: gx < cx ? 1 : -1, football: true });
    for (const [mx, mz] of [[x0 - 3, z0 - 5], [x1 + 3, z0 - 5], [x0 - 3, z1 + 5], [x1 + 3, z1 + 5]]) {
      this.features.push({ type: "projektor", x: mx, z: mz });
      this.lamps.push({ x: mx, z: mz, dir: Math.atan2(cx - mx, cz - mz), r: 48, flood: true, stadium: true });
    }
    // Lise binası sahanın kuzeyinde (dekor: öğrenciler anakarada okur).
    this.addBuilding({ kind: "okul", x: cx, z: z0 - 30, rot: 0, w: 46, d: 16, floors: 2, roofType: "flat", wall: "#a34a3a", roof: "#6f665c", style: STYLES.okul, address: "Driftwood High School" });
    const gate = [x1 + 8, cz];
    this.addRoad([[-112, cz], gate], "patika", { width: 3 });
    this._place("saha", { anchors: [[cx, cz]], spread: 20, path: [gate, [-112, cz], HUB] });
    this._addWorkplace("saha", 0, { door: gate, path: [gate, HUB], anchor: [cx, cz], spread: 20 });
    this.block(x0 - 6, z0 - 40, x1 + 6, z1 + 8, 0);
    this.labels.push({ text: "Gulls Field", x: cx, z: cz, h: 24 });
  }

  _layoutPondPark() {
    // Kettle Pond parkı: göl, çevresinde yürüyüş yolu ve banklar.
    const { x: px, z: pz } = I.RESERVES.pond;
    this.features.push({ type: "gol", x: px, z: pz, r: 52 });
    this.plazas.push({ x0: px - 110, z0: pz - 110, x1: px + 110, z1: pz + 110, kind: "park" });
    this.block(px - 56, pz - 56, px + 56, pz + 56, 0);
    const ring = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([px + Math.cos(a) * 64, pz + Math.sin(a) * 64]); }
    this.addRoad(ring, "patika", { width: 2.4 });
    this.addRoad([[px - 64, pz], [520, pz + 10]], "patika", { width: 2.4 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      this.addBench(px + Math.cos(a) * 68, pz + Math.sin(a) * 68, Math.atan2(-Math.cos(a), -Math.sin(a)), "park");
    }
    this._place("park", { anchors: [0, 2, 4, 6].map((i) => { const a = (i / 8) * Math.PI * 2 + 0.2; return [px + Math.cos(a) * 70, pz + Math.sin(a) * 70]; }), spread: 6, path: [[520, pz + 10], HUB] });
    this.labels.push({ text: "Kettle Pond", x: px, z: pz, h: 22 });
  }

  /** Eski "sahil bulvarı" profili (otobüs hatları ve kamera için): Main Street'in z'si. */
  avenueZ(x) {
    return I.mainZ(Math.max(I.MAIN_X[0], Math.min(I.MAIN_X[1], x)));
  }

  avenuePath(x0, x1) {
    const pts = [];
    const step = x1 > x0 ? 10 : -10;
    for (let x = Math.round(x0 / 10) * 10; step > 0 ? x <= x1 : x >= x1; x += step) pts.push([x, this.avenueZ(x)]);
    return pts;
  }

  _addWorkplace(kind, index, entry) {
    const names = cat().isyerleri[kind];
    const name = names[index % names.length];
    (this.workplaces[kind] ??= [])[index] = { name, outdoor: OUTDOOR_KINDS.has(kind), ...entry, _k: this._key };
    // Bina hangi şube olduğunu bilir: tabela adı ve iç konsepti (workinterior.js) buna göre.
    if (entry.building) { entry.building.sube = index; entry.building.isim = name; }
  }

  // --- koy kıyısı: feribot, rıhtımlar, Harbor Walk, marina, tersane, yük terminali ---

  _layoutWaterfront() {
    const coast = (x) => this.coastPoint(x, I.mainZ(x), 0, 1);
    const toHub = (x) => [[x, I.waterZ(x)], [x, I.mainZ(x)], HUB];

    // Harbor Walk: Water Street ile su arasında, kıyıyı izleyen tuğla gezinti yolu.
    const promenade = [];
    for (let x = -270; x <= 170; x += 10) promenade.push([x, coast(x)[1] - 8]);
    this._tag("sahil_yolu", () => {
      this.addRoad(promenade, "sahil");
      this._place("sahil_yolu", { anchors: promenade.filter((_, i) => i % 4 === 0), spread: 1.5, path: [promenade[22], HUB] });
      this.promenade = promenade;
    });

    // Ferry Landing: Ferry Street'in ucunda 130 m'lik iskele; feribot yanaşmış. Boş adada da var.
    const fx = 210, [, lz] = coast(fx);
    this.features.push({ type: "iskele", x: fx, z: lz - 4, len: 130, w: 10 });
    this.ferryPier = { x0: fx - 5, x1: fx + 5, z0: lz - 4, z1: lz + 126, top: 1.53 };
    this.piers.push(this.ferryPier);
    this.features.push({ type: "vapur", x: fx + 13, z: lz + 64 });
    if (!this.has("cevre_yolu")) this.addRoad([[fx, I.mainZ(fx)], [fx, lz - 3]], "patika", { width: 5 });
    else this.addRoad([[fx, I.waterZ(fx)], [fx, lz - 3]], "yaya", { width: 8 });
    this.addBuilding({ kind: "liman", x: fx - 22, z: lz - 12, rot: 0, w: 18, d: 9, floors: 1, roofType: "gable", wall: "#8f8a80", roof: "#3f4247", address: "Ferry Landing" });
    const ferryDoor = [fx + 3.5, lz + 60];
    const q = { x0: fx - 4, x1: fx + 4, z: lz + 58.5 };
    // Anakarada çalışan ve okuyanlar: iskelenin ucunda feribota biner (gün boyu adada görünmez).
    this._addWorkplace("anakara", 0, { door: ferryDoor, path: [ferryDoor, [fx, lz - 6], HUB], anchor: ferryDoor, spread: 2, queue: q });
    // Blimp pilotları: üs anakarada; onlar da feribotla gidip gelir (blimp 150. sakinde).
    this._tag("zeplin:0", () => this._addWorkplace("zeplin", 0, { door: ferryDoor, path: [ferryDoor, [fx, lz - 6], HUB], anchor: ferryDoor, spread: 2, queue: q }));
    // Evden çalışanlar ve emekliler: iş yerleri evleridir.
    this._addWorkplace("ev", 0, { door: null, path: [HUB], anchor: HUB, spread: 0, home: true });
    this.labels.push({ text: "Ferry Landing", x: fx, z: lz + 30, h: 22 });

    this._tag("liman:0", () => this._layoutPort());
    this._tag("balik_iskelesi", () => this._layoutFishingPier(coast));
    this._tag("tersane:0", () => this._layoutShipyard());
    this._tag("balikci_koyu:0", () => this._layoutCove(toHub, coast));
    // Marina: yüzer iskeleler ve yelkenliler (dekor; boş adada da birkaç tekne).
    for (let i = 0; i < 5; i++) {
      const x = -520 - i * 46, [, mz] = coast(x);
      this.features.push({ type: "iskele", x, z: mz - 2, len: 48, w: 2.4 });
      this.piers.push({ x0: x - 1.2, x1: x + 1.2, z0: mz - 2, z1: mz + 46, top: 1.45 });
      for (let k = 0; k < 3; k++) if (hash2(i, k, 61) < 0.75) this.features.push({ type: "tekne", x: x + (k % 2 ? 5 : -5), z: mz + 14 + k * 11, rot: 0, len: 8 + hash2(i, k, 62) * 3, yelken: true });
    }
    this.labels.push({ text: "Harbor Bay", x: 120, z: 520, h: 40 });
    // Rıhtım duvarı: kasaba önünde kıyı boyunca granit (island.js quay); iskeleler ve dolgular dahil.
    const wall = [];
    for (let x = -1000; x <= 800; x += 5) {
      const [cx, cz] = this.coastPoint(x, Math.min(I.mainZ(Math.max(-700, Math.min(700, x))), I.shoreZ(x) - 60), 0, 1, 0);
      if (I.quay(cx, cz - 2) > 0.5) wall.push([cx, cz]);
      else if (wall.length && wall.at(-1) !== null) wall.push(null);
    }
    this.features.push({ type: "rihtim", pts: wall });
  }

  _layoutFishingPier(coast) {
    // Town Dock: balık tutma iskelesi (hobi). Harbor Walk döşenene kadar oraya patikadan gidilir.
    const [ix, iz] = coast(-110);
    this.features.push({ type: "iskele", x: ix, z: iz - 3, len: 40, w: 3 });
    this.piers.push({ x0: ix - 1.5, x1: ix + 1.5, z0: iz - 3, z1: iz + 37, top: 1.53 });
    const fishing = [];
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      fishing.push({ x: ix + side * 1.05, z: iz + 14 + k * 3.6, heading: side * Math.PI / 2 });
    }
    this._place("iskele", { anchors: fishing.map((f) => [f.x, f.z]), spots: fishing, spread: 0, path: [[ix, iz - 3], HUB] });
  }

  /**
   * Freight terminal: dolgu üstünde beton rıhtım (island.js PADS), yanaşmış yük gemisi, rıhtım vinci, istif sahası,
   * ambar, tır ve forklift. Çitle çevrili, kapısı Water Street'in doğu ucuna açılır. Mercanada'daki yerleşimin
   * aynısı, (dx, dz) kadar kaydırılmış: port.js göreli çalışır.
   */
  _layoutPort() {
    const dx = 560, dz = 22;
    const x0 = 40 + dx, x1 = 150 + dx, z0 = 176 + dz, z1 = 246 + dz, top = FLAT_Y + 0.3;
    const gateX = 95 + dx;
    const P = {
      x0, x1, z0, z1, top, gateX,
      ship: { x: 95 + dx, z: z1 + 7.1, len: 84, beam: 13, depth: 6.6 },
      crane: { x: 95 + dx, legX: [86 + dx, 104 + dx], landZ: 226 + dz, seaZ: 242 + dz },
      transfer: [95 + dx, 234 + dz],
      stack: { x0: 108 + dx, x1: 147 + dx, z0: 201 + dz, z1: 223 + dz },
      warehouse: { x: 61 + dx, z: 186 + dz, w: 38, d: 15 },
      truck: { x: 52 + dx, z: 207 + dz, heading: 0 },
      booth: [gateX + 6.5, z0 + 3.2],
      benches: [[86 + dx, 196.5 + dz, Math.PI], [90 + dx, 196.5 + dz, Math.PI]],
      masts: [[x0 + 3, z1 - 6], [x1 - 3, z1 - 6], [x1 - 3, z0 + 6], [x0 + 46, z0 + 26]],
    };
    for (const [mx, mz] of P.masts) this.lamps.push({ x: mx, z: mz, dir: Math.atan2(95 + dx - mx, 215 + dz - mz), r: 40, flood: true });
    this.port = P;
    this.piers.push({ x0, x1, z0, z1, top });
    this.block(x0, z0 - 2, x1, z1, 2);
    const wh = P.warehouse;
    this.addBuilding({ kind: "ambar", x: wh.x, z: wh.z, rot: 0, w: wh.w, d: wh.d, floors: 2, roofType: "gable", wall: "#c9d2dc", roof: "#6f7f92", industrial: true, style: { door: "#d9822b", sign: "#1f3b5a" }, address: "Freight Terminal Warehouse" });
    const wz = I.waterZ(560);
    this.addRoad([[560, wz], [gateX, wz], [gateX, z0 + 1]], "giris");
    const door = [gateX - 4.5, z0 + 1.5];
    const posts = [];
    const post = (type, x, z, heading = 0, extra = {}) => posts.push({ post: type, x, z, heading, ...extra });
    post("vinc", P.crane.x, P.crane.landZ);
    post("isaretci", 101.5 + dx, 236.5 + dz, Math.PI * 1.2);
    post("istif", 0, 0, 0, { k: 0 });
    post("forklift", 0, 0, 0, { k: 0 });
    for (let k = 0; k < 4; k++) post("bagci", 64 + dx + k * 17, 0, 0, { k });
    for (const bx of [52, 136, 70]) post("palamar", bx + dx, z1 - 2.2, 0);
    for (let k = 0; k < 3; k++) post("kontrol", 0, 0, 0, { k });
    post("bekci", P.booth[0], P.booth[1], Math.PI);
    for (let k = 0; k < 3; k++) post("ambar", 0, 0, 0, { k });
    post("sofor", P.truck.x + 2.2, P.truck.z + 7.5, -Math.PI / 2);
    for (const [bx, bz, h] of P.benches) for (const ox of [-0.5, 0.5]) post("mola", bx + ox, bz, h);
    P.posts = posts;
    const innerDoor = [wh.x + wh.w / 2 - 1.6, wh.z + wh.d / 2 + 0.6];
    this._addWorkplace("liman", 0, { door, innerDoor, path: [door, [560, wz], HUB], anchor: [95 + dx, 215 + dz], spread: 20 });
    this.labels.push({ text: "Freight Terminal", x: 98 + dx, z: 215 + dz, h: 24 });
  }

  _layoutShipyard() {
    // Driftwood Boatyard: batıdaki dolgu rıhtımda; Lighthouse Road'dan inen yolla.
    const [tx, tz] = this.coastPoint(-950, 200, 0, 1);
    this.addBuilding({ kind: "tersane", x: tx, z: tz - 13, rot: 0, w: 30, d: 18, floors: 2, roofType: "gable", wall: "#8f8a80", roof: "#3f4247", workplace: true, industrial: true, style: { door: "#2f4256", sign: "#2f4256" }, address: "1 Boatyard Road" });
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
    this.addRoad([[tx, 6], tDoor], this.has("cevre_yolu") ? "giris" : "patika");
    this._addWorkplace("tersane", 0, { door: tDoor, innerDoor: [tx + 15 - 1.6, tz - 13 + 9 + 0.6], path: [tDoor, [tx, 6], HUB], anchor: [tx, S.boat.z], spread: 5 });
    this.labels.push({ text: "Boatyard", x: tx, z: tz, h: 20 });
  }

  _layoutCove(toHub, coast) {
    // Fishing Wharf: ıstakoz tekneleri, yem kulübeleri, tuzak yığınları ve şamandıralar (kulübe duvarında asılı).
    const [bx, bz] = coast(-300);
    for (let i = 0; i < 3; i++) {
      this.addBuilding({ kind: "kulube", x: bx - 14 + i * 12, z: bz - 9, rot: 0, w: 8, d: 6, floors: 1, roofType: "gable", wall: ["#8f8a80", "#9a9488", "#8e2f2a"][i], roof: "#3f4247", address: `Fishing Wharf, Shack ${i + 1}` });
    }
    const jx = bx + 2, jz = bz - 2, jlen = 30;
    this.features.push({ type: "iskele", x: jx, z: jz, len: jlen, w: 4 });
    this.piers.push({ x0: jx - 2, x1: jx + 2, z0: jz, z1: jz + jlen, top: 1.53 });
    this.features.push({ type: "tekne", x: jx + 4.0, z: jz + 12, rot: 0, len: 10, istakoz: true });
    this.features.push({ type: "tekne", x: jx - 4.0, z: jz + 21, rot: 0, len: 10, istakoz: true });
    this.features.push({ type: "tekne", x: bx - 14, z: bz + 12, rot: 0.5, len: 6 });
    const K = {
      jetty: { x: jx, z0: jz, z1: jz + jlen },
      racks: [[bx - 14, bz - 0.5], [bx + 13, bz - 0.5]],
      upturned: [bx - 25, bz - 1.5, 0.3],
      crates: [jx, jz - 1.8],
      table: [bx - 3.5, bz - 1.4],
      buoys: [[bx - 12, bz + 13], [bx + 9, bz + 20], [bx - 2, bz + 26]],
      huts: [0, 1, 2].map((i) => [bx - 14 + i * 12, bz - 9]),
      boardwalk: [[bx - 20, bz - 3.8], [bx, bz - 3.8]],
      stall: [jx + 4.5, jz - 0.8],
      beached: [[bx + 9, bz - 0.5, 0.35, "#b8433c"], [bx + 12.5, bz + 0.2, -0.25, "#2f4256"]],
      traps: [[bx - 19.6, bz - 5.0], [bx - 8.6, bz - 5.0], [bx + 3.0, bz - 5.0]],
      ropes: [[jx - 0.7, jz + 4], [jx + 0.7, jz + 12], [jx - 0.7, jz + 20]],
      rocks: [jx + 9, jz + 14],
      sign: [bx, bz - 15.5],
      lobster: true,
    };
    for (const lx of [bx - 22, bx - 8, bx + 4]) this.lamps.push({ x: lx, z: bz - 2.6, dir: Math.PI });
    const kposts = [];
    const kpost = (type, x, z, heading, extra = {}) => kposts.push({ post: type, x, z, heading, ...extra });
    for (const [rx, rz] of K.racks) for (const ox of [-1.4, 1.4]) kpost("ag", rx + ox, rz + 1.3, Math.PI);
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
    if (!this.has("cevre_yolu")) this.addRoad([bDoor, [bx, I.mainZ(bx)]], "patika");
    cat().isyerleri.balikci_koyu.forEach((_, i) => this._addWorkplace("balikci_koyu", i, {
      door: bDoor, innerDoor: [jx, jz + jlen - 1], path: [bDoor, ...toHub(bx)], anchor: [bx, bz + 1], spread: 7,
    }));
    this.labels.push({ text: "Fishing Wharf", x: bx, z: bz + 18, h: 20 });
  }

  // --- doğa ve ada yolları: Bluff Head, Gull Point Light, Ocean Beach, boardwalk, bataklık ---

  _layoutNature() {
    // Ana yollar: araçlar gelene kadar kum yol, sonra asfalt cadde. Mahalleler bunlara bağlanır.
    for (const tr of I.TRUNKS) {
      if (this.has("cevre_yolu")) this.addRoad(tr.pts, "cadde", { trunk: tr.id });
      else this.addRoad(tr.pts, "patika", { width: 5, trunk: tr.id });
    }

    // Bluff Head: fundalık tepe; Bluff Road'un ucundan patika, tepede seyir noktası ve banklar.
    const top = [this.hill.x, this.hill.z];
    const trail = [[1450, 40], [1560, 70], [1640, 100], top];
    this.addRoad(trail, "patika");
    this.addBench(top[0] + 3, top[1] + 4, 0, "tepe");
    this.addBench(top[0] - 4, top[1] + 5, 0.3, "tepe");
    this._place("tepe", { anchors: [top], spread: 7, path: [...trail].reverse().concat([HUB]) });
    this.labels.push({ text: "Bluff Head", x: top[0], z: top[1], h: 36 });

    // Gull Point Light: batı kum dilinin ucunda; Lighthouse Road'un ucundan kum dili boyunca patika.
    const tip = [-1240, 1010], base = [-1820, 300];
    const ax = (tip[0] - base[0]) / Math.hypot(tip[0] - base[0], tip[1] - base[1]), az = (tip[1] - base[1]) / Math.hypot(tip[0] - base[0], tip[1] - base[1]);
    const [fx, fz] = this.coastPoint(tip[0] - ax * 60, tip[1] - az * 60, ax, az, 14);
    this.features.push({ type: "fener", x: fx, z: fz, abd: true });
    this.block(fx - 5, fz - 5, fx + 5, fz + 5, 0);
    const lend = I.TRUNKS.find((t) => t.id === "light").pts.at(-1);
    const fenerTrail = [lend, [-1560, 520], [-1400, 760], [fx - ax * 8, fz - az * 8]];
    this.addRoad(fenerTrail, "patika");
    const fenerPath = [...fenerTrail].reverse().concat([HUB]);
    this._addWorkplace("fener", 0, { door: [fx, fz], path: fenerPath, anchor: [fx - ax * 4, fz - az * 4], spread: 2 });
    const views = [];
    for (const rr of [8.5, 11.5, 14.5, 17.5]) {
      const n = Math.round((2 * Math.PI * rr) / 2.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rr;
        const vx = fx + Math.cos(a) * rr, vz = fz + Math.sin(a) * rr;
        if (this.rawHeight(vx, vz) < 0.6) continue;
        if ((vx - fx) * ax + (vz - fz) * az < -2) continue; // denize (kum dilinin ucuna) bakan yarı
        views.push({ x: vx, z: vz, heading: Math.atan2(vx - fx + ax * 20, vz - fz + az * 20) });
      }
    }
    this._place("fener", { anchors: views.map((v) => [v.x, v.z]), spots: views, spread: 0, path: fenerPath });
    this.fener = { x: fx, z: fz, door: [fx - ax * 4.8, fz - az * 4.8] };
    {
      const ex = fx - ax * 16 + az * 7, ez = fz - az * 16 - ax * 7;
      this.addBuilding({ kind: "kulube", x: ex, z: ez, rot: Math.atan2(fx - ex, fz - ez), w: 9, d: 7, floors: 1, roofType: "gable", wall: "#f4f1ea", roof: "#8e2f2a", address: "Keeper's House, Gull Point" });
    }
    this.labels.push({ text: "Gull Point Light", x: fx, z: fz, h: 34 });

    // İtfaiye ve belediye garajı: Lighthouse Road'un kuzeyinde, kasabanın batısında.
    const sx = -560, gx = -650, sz = -18;
    this._tag("itfaiye", () => {
      const fs = this.addBuilding({ kind: "itfaiye", x: sx, z: sz - 8, rot: 0, w: 24, d: 14, floors: 2, roofType: "gable", wall: "#a34a3a", roof: "#3f4247", style: { garage: "#b8231f", tower: false }, address: "Driftwood Fire Department" });
      this.plazas.push({ x0: sx - 12, z0: sz - 1, x1: sx + 12, z1: sz + 8.5, kind: "avlu" });
      this.addRoad([[sx, sz + 2.5], [sx, I.TRUNKS[3] ? 60 : 60]], "giris");
      this.fireStation = { building: fs, bay: [sx, sz + 4] };
    });
    this._tag("garaj", () => {
      const dp = this.addBuilding({ kind: "garaj", x: gx, z: sz - 8, rot: 0, w: 18, d: 14, floors: 1, roofType: "gable", wall: "#d9dde2", roof: "#6f7f92", style: { garage: "#4f8a3e" }, address: "Public Works Garage" });
      this.plazas.push({ x0: gx - 9, z0: sz - 1, x1: gx + 9, z1: sz + 8.5, kind: "avlu" });
      this.addRoad([[gx, sz + 2.5], [gx, 38]], "giris");
      this.depot = { building: dp, bay: [gx, sz + 4] };
    });

    // Kızılcık bataklıkları ve elma bahçesi (batı iç): Cranberry Lane, Lighthouse Road'dan kuzeye.
    const lane = [[-1040, 0], [-1040, -420]];
    this._tag("tarla:0", () => this.addRoad(lane, this.has("cevre_yolu") ? "koy" : "patika", { width: 5 }));
    cat().isyerleri.tarla.forEach((name, i) => this._tag(`tarla:${i}`, () => {
      if (i === 0) {
        // 3 × 3 kızılcık havuzu, setlerle ayrılmış; Ekim–Kasım hasatta su basılır (fields.js).
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
          const fx0 = -1300 + c * 74 + (c > 0 ? 0 : 0), fz0 = -500 + r * 56;
          this.plazas.push({ x0: fx0, z0: fz0, x1: fx0 + 66, z1: fz0 + 48, kind: "tarla", ekin: "kizilcik", crop: 2 });
          this.block(fx0, fz0, fx0 + 66, fz0 + 48, 0);
        }
      } else {
        for (let f = 0; f < 2; f++) {
          const fx0 = -1000 + f * 100, fz0 = -380;
          this.plazas.push({ x0: fx0, z0: fz0, x1: fx0 + 88, z1: fz0 + 60, kind: "tarla", ekin: "elma", crop: 1 });
          this.block(fx0, fz0, fx0 + 88, fz0 + 60, 0);
        }
      }
      const bx = i === 0 ? -1080 : -930, bz = i === 0 ? -300 : -240;
      const barn = this.addBuilding({ kind: "ahir", x: bx, z: bz, rot: i === 0 ? Math.PI / 2 : 0, w: 18, d: 12, floors: 2, roofType: "gable", wall: "#8e2f2a", roof: "#3f4247", workplace: true, industrial: true, style: { door: "#f4f1ea" }, address: `${name}, Cranberry Lane` });
      const door = i === 0 ? [bx + 6.4, bz] : [bx, bz + 6.4];
      this._addWorkplace("tarla", i, { door, path: [door, [-1040, bz], HUB], anchor: i === 0 ? [-1190, -420] : [-910, -350], spread: 40 });
    }));

    // Ocean Beach: dış kıyıda, Beach Road'un ucunda. Kumsal baştan vardır; şemsiyeler, cankurtaran kuleleri gelişimle.
    const bxc = -80;
    const dir = [0.02, -1];
    const [px, pz] = this.coastPoint(bxc, I.northShoreZ(bxc) + 260, dir[0], dir[1], 14);
    const beachEnd = I.TRUNKS.find((t) => t.id === "beach").pts.at(-1);
    this.addRoad([beachEnd, [px, pz + 14]], "patika", { width: 4 });
    const beach = [];
    for (let i = -4; i <= 4; i++) beach.push(this.coastPoint(bxc + i * 16, I.northShoreZ(bxc) + 260, dir[0], dir[1], 12));
    const beachPath = [[px, pz + 14], beachEnd, HUB];
    this._place("plaj", { anchors: beach.map(([x, z]) => [x, z - 4]), spread: 5, path: beachPath });
    this._tag("plaj:0", () => {
      this._layoutBeach(bxc, dir, px, pz);
      this._addWorkplace("plaj", 0, { door: [px, pz], path: beachPath, anchor: [px, pz - 2], spread: 3 });
      this.features.push({ type: "cankurtaran", x: px, z: pz + 2 });
    });
    this.labels.push({ text: "Ocean Beach", x: px, z: pz, h: 20 });
    this._tag("lunapark:0", () => this._layoutLunapark());
  }

  /**
   * Plaj düzeni (kıyı çizgisine göre; "geri" = su kenarından karaya metre): iki sıra şemsiye kümesi, kumsala inen
   * üç tahta yol, duşlar, soyunma kabinleri, büfe (masalarıyla), voleybol, şamandıralı yüzme alanı. Çizim: beach.js.
   * dir: denize doğru birim yön.
   */
  _layoutBeach(kx, dir, px, pz) {
    const [dx, dz] = dir;
    const start = (x) => [x, I.northShoreZ(x) + 260];
    const at = (x, back) => { const [sx, sz] = start(x); return this.coastPoint(sx, sz, dx, dz, back); };
    const face = Math.atan2(dx, dz); // şezlonglar denize bakar
    const walks = [kx - 66, px, kx + 6];
    const B = { face, clusters: [], walks: [], showers: [], cabins: [], buoys: [], volley: null, bins: [] };
    for (let x = kx - 96; x <= kx + 34; x += 6.2) {
      for (const [back, off] of [[9, 0], [15, 3.1]]) {
        const xx = x + off;
        if (walks.some((w) => Math.abs(w - xx) < 4.2) || Math.abs(xx - px) < 7) continue;
        const [cx, cz] = at(xx, back);
        B.clusters.push({ x: cx, z: cz, c: Math.round((xx - kx) / 6.2 + back) });
        for (const side of [-1, 1]) {
          const sx = cx + side * 1.0 * dz, sz = cz - side * 1.0 * dx;
          this.seats.push({ x: sx, z: sz, heading: face, h: 0.38, place: "plaj", sunbed: true });
        }
      }
    }
    for (const wx of walks) {
      B.walks.push({ a: at(wx, 31), b: at(wx, 5) });
      B.showers.push(at(wx + 2.6, 20));
      B.bins.push(at(wx - 2.4, 21));
    }
    for (const o of [-6.5, -4.5, 4.5, 6.5]) B.cabins.push(at(px + o, 25));
    const [bx, bz] = at(walks[0] - 9, 27);
    this.addBuilding({ kind: "bufe", x: bx, z: bz, rot: face, w: 6, d: 4.5, floors: 1, roofType: "flat", wall: "#f4f1ea", roof: "#c9c4bb", style: { shop: true, awning: "#2f7fb5" }, address: "Snack Shack, Ocean Beach" });
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
    const [vx, vz] = at(kx + 46, 16);
    B.volley = { x: vx, z: vz, rot: face };
    for (let x = kx - 100; x <= kx + 38; x += 3.5) B.buoys.push(at(x, -30));
    this.beach = B;
    const zs = B.clusters.map((c) => c.z);
    this.block(kx - 100, Math.min(...zs) - 4, kx + 52, Math.max(...zs) + 4, 0);
  }

  /** Boardwalk (kumulların önünde tahta gezinti yolu), denize uzanan eğlence iskelesi ve dönme dolap. */
  _layoutLunapark() {
    const x0 = 180, x1 = 700, back = 34;
    const pts = [];
    for (let x = x0; x <= x1; x += 20) pts.push([x, I.northShoreZ(x) + 60 + back]);
    this.addRoad(pts, "sahil", { width: 8, tahta: true });
    const px = 430, sz = I.northShoreZ(px) + 40, len = 150;
    const pier = { x0: px - 9, x1: px + 9, z0: sz - len, z1: sz + 6, top: 2.6 };
    this.piers.push(pier);
    this.features.push({ type: "lunapark", x: px, z0: pier.z0, z1: pier.z1, wheel: [px, pier.z0 + 26] });
    this.addRoad([[px, I.northShoreZ(px) + 60 + back], [px, sz + 6]], "sahil", { width: 6, tahta: true });
    const arcade = this.addBuilding({ kind: "lunapark", x: px + 26, z: I.northShoreZ(px + 26) + 60 + back + 12, rot: Math.PI, w: 22, d: 12, floors: 1, roofType: "flat", wall: "#f4f1ea", roof: "#c9c4bb", workplace: true, style: { shop: true, awning: "#c43a3a" }, address: "Driftwood Pier Amusements" });
    const door = [arcade.x, arcade.z - 6.35];
    this._addWorkplace("lunapark", 0, { door, path: [door, HUB], anchor: [px, pier.z0 + 40], spread: 6, building: arcade });
    this.lunapark = { pier, wheel: [px, pier.z0 + 26] };
    this._place("lunapark", { anchors: [[px, pier.z0 + 40], [px, pier.z0 + 80], [px - 60, pts[0][1]], [px + 80, pts[0][1]]], spread: 4, path: [door, HUB] });
    this.labels.push({ text: "Pier Amusements", x: px, z: pier.z0 + 26, h: 40 });
  }

  // --- mahalleler ---

  /** Mahallenin karakteri (tohumdan): ön bahçe derinliği, renk eğilimi. */
  mahalleStyle(m) {
    this._styles ??= new Map();
    if (!this._styles.has(m)) {
      const h = (salt) => hash2(m, salt, 77);
      this._styles.set(m, { yard: 4.5 + h(4) * 2, tint: Math.floor(h(5) * HOUSE_WALLS.length) });
    }
    return this._styles.get(m);
  }

  /** Bölgenin yerel noktasından dünyaya (kısaltma). */
  _zw(z, u, v) {
    return I.zoneToWorld(z, u, v);
  }

  _rowV(r) {
    return I.ZONE.row0 + r * I.ZONE.pitch;
  }

  /** Sokak s'nin sırası ve yanı: girişe yakın sıradan uzağa, önce sağ (+u) yan. */
  _street(s) {
    return { r: Math.floor(s / 2), c: s % 2 ? -1 : 1 };
  }

  /** Bir yapının (ev ya da apartman) bölgedeki yeri: sokak s, yapı sırası ev (0'dan; iki yana dönüşümlü). */
  _housePos(zone, s, ev) {
    const tip = zone.tip, H = I.HOUSE[tip], { r, c } = this._street(s);
    const k = Math.floor(ev / 2), back = ev % 2 === 1; // tek numaralar ön (giriş) tarafta, çiftler arkada
    const u = c * (I.ZONE.avenue + 3 + H.lot * (k + 0.5));
    const dims = HOUSE_DIMS[tip];
    const style = this.mahalleStyle(zone.m);
    const yard = tip === "apartments" ? 4 : style.yard;
    const rv = this._rowV(r), sgn = back ? 1 : -1;
    const v = rv + sgn * (ROADS.sokak.width / 2 + yard + dims.d / 2);
    const [x, z] = this._zw(zone, u, v);
    // Cephe sokağa bakar: önde +v, arkada −v.
    const f = back ? [-zone.n[0], -zone.n[1]] : zone.n;
    const door = this._zw(zone, u, rv + sgn * (ROADS.sokak.width / 2 + yard + 0.35));
    return { x, z, rot: Math.atan2(f[0], f[1]), door, u, v, k, back, dims };
  }

  _layoutMahalle(zone) {
    const m = zone.m, hw = zone.hw, D = I.ZONE.depth, side = I.ZONE.side;
    const cars = this.has("cevre_yolu");
    const tip = zone.tip, H = I.HOUSE[tip], dims = HOUSE_DIMS[tip];
    const birim = housingOf(m).birim;
    const first = m * perMahalle();
    const perSokak = cap("daire_per_bina") * cap("bina_per_sokak");
    const sideU = hw - side;
    // Çevre yolları (yanlar ve arka) ve giriş caddesi araçlarla birlikte; yan yollar ana yola kadar iner.
    this._tag("cevre_yolu", () => {
      for (const sg of [-1, 1]) this.addRoad([this._zw(zone, sg * sideU, -11), this._zw(zone, sg * sideU, D - side)], "cadde");
      this.addRoad([this._zw(zone, -sideU, D - side), this._zw(zone, sideU, D - side)], "cadde");
    });
    const built = new Map(); // sıra r -> { 1: en uzak u, -1: ... }
    const style = this.mahalleStyle(m);
    for (let s = 0; s < cap("sokak_per_mahalle"); s++) {
      const houses = (perSokak / birim) | 0;
      for (let ev = 0; ev < houses; ev++) {
        const slot0 = first + s * perSokak + ev * birim;
        if (slot0 >= this.population) continue;
        const q = this._housePos(zone, s, ev);
        const { r, c } = this._street(s);
        const reach = built.get(r) ?? { 1: 0, "-1": 0 };
        reach[c] = Math.max(reach[c], Math.abs(q.u) + H.lot / 2 + 3);
        built.set(r, reach);
        const key = m * 100000 + s * 100 + ev;
        const wall = HOUSE_WALLS[(style.tint + Math.floor(hash2(key, 3, 5) * 5)) % HOUSE_WALLS.length];
        const b = this.addBuilding({
          kind: "konut", house: tip, x: q.x, z: q.z, rot: q.rot, w: dims.w, d: dims.d, floors: dims.floors,
          perFloor: dims.perFloor, daireler: birim, slot0, yard: tip === "apartments" ? 4 : style.yard, pathSeed: key,
          roofType: tip === "fourplex" ? "hip" : "gable",
          wall, roof: HOUSE_ROOFS[Math.floor(hash2(key, 4, 5) * HOUSE_ROOFS.length)],
          porch: tip !== "apartments", shutters: hash2(key, 6, 5) < 0.6, garage: tip === "cottage" && hash2(key, 7, 5) < 0.45,
          address: streetAddress(slot0).replace(/, Apt \d+$/, ""),
        });
        this.buildingBySlot0.set(slot0, b);
      }
    }
    // Sokaklar: evi olan sıralar; araçlar gelene kadar evlerin önüne kadar, sonra yan yollara kadar. Giriş caddesi
    // en uzak sokağa kadar (araçlarla arka yola kadar) gider.
    const reach = new Map();
    for (const a of this._amenityPlan(zone)) {
      if (!this.has(a.key)) continue;
      if (!reach.has(a.row)) reach.set(a.row, new Set());
      reach.get(a.row).add(a.side);
    }
    let far = -1;
    for (const r of new Set([...built.keys(), ...reach.keys()])) {
      far = Math.max(far, r);
      const b = built.get(r) ?? { 1: 0, "-1": 0 };
      const ua = cars || reach.get(r)?.has(-1) ? -sideU : -Math.max(8, b[-1]);
      const ub = cars || reach.get(r)?.has(1) ? sideU : Math.max(8, b[1]);
      const pts = [];
      for (let u = ua; u < ub - 0.1; u += 20) pts.push(this._zw(zone, u, this._rowV(r)));
      pts.push(this._zw(zone, ub, this._rowV(r)));
      this.addRoad(pts, "sokak");
    }
    if (far >= 0 || cars) {
      const vEnd = cars ? D - side : this._rowV(far);
      // Giriş caddesi ana yoldan (11 m dışarıda) içeri.
      this.addRoad([this._zw(zone, 0, -11), this._zw(zone, 0, vEnd)], cars ? "cadde" : "sokak");
    }
    this._layoutAmenities(zone);
    if (built.size) this.labels.push({ text: mahalleName(m), x: zone.cx, z: zone.cz, h: 45 });
  }

  /**
   * Mahalle yerleri: iki yandaki şeritlerde sokak araları. Sol: kilise, dondurmacı, oyun parkı, park; sağ: okul
   * (okul sayısı kadar mahallede) ya da park, dondurmacı, oyun parkı, basketbol. İlk mahallenin kilisesi Green'dedir.
   */
  _amenityPlan(zone) {
    const m = zone.m;
    const sides = { "-1": [m % 3 === 0 && m > 0 ? "cami" : "park", "cay", "oyun", "park"], "1": [m < cat().isyerleri.okul.length ? "okul" : "park", "cay", "oyun", "basket"] };
    const out = [];
    for (const side of [-1, 1]) {
      sides[side].forEach((kind, i) => out.push({ side, kind, r: i, row: i, key: `${kind === "park" ? "mpark" : kind}:${m}` }));
    }
    return out;
  }

  _layoutAmenities(zone) {
    const m = zone.m, hw = zone.hw;
    const Ls = I.streetLength(zone.tip);
    const place = "mahalle:" + m;
    const anchors = [], anchorKeys = [];
    const u0 = I.ZONE.avenue + 3 + Ls, u1 = hw - I.ZONE.side - 7; // şerit
    const su = (u0 + u1) / 2, sw = u1 - u0;
    const rot0 = Math.atan2(zone.n[0], zone.n[1]); // +v'ye bakan
    const rplaza = (side, v, w, d, kind, extra = {}) => {
      const [cx, cz] = this._zw(zone, side * su, v);
      const ext = (Math.abs(w * zone.t[0]) + Math.abs(d * zone.n[0])) / 2, ezz = (Math.abs(w * zone.t[1]) + Math.abs(d * zone.n[1])) / 2;
      this.plazas.push({ x0: cx - ext, x1: cx + ext, z0: cz - ezz, z1: cz + ezz, cx, cz, w, d, rot: rot0, kind, ...extra });
      return [cx, cz];
    };
    for (const { side, kind, r, key } of this._amenityPlan(zone)) {
      const v = (this._rowV(r) + this._rowV(r + 1)) / 2, gh = I.ZONE.pitch - ROADS.sokak.width - 2;
      this._tag(key, () => {
        const [cx, cz] = this._zw(zone, side * su, v);
        this.block(cx - sw / 2 - 4, cz - sw / 2 - 4, cx + sw / 2 + 4, cz + sw / 2 + 4, 0);
        switch (kind) {
          case "cami": {
            // Mahalle kilisesi: beyaz, kulesi sokağa (girişe yakın sıraya) bakar.
            this._church(cx, cz + 0, rot0 + Math.PI, `${mahalleName(m)} Church`, m);
            break;
          }
          case "okul": {
            const b = this.addBuilding({ kind: "okul", x: cx, z: cz, rot: rot0 + Math.PI, w: Math.min(30, sw - 2), d: 13, floors: 2, roofType: "flat", wall: "#a34a3a", roof: "#6f665c", workplace: true, style: STYLES.okul, address: `${cat().isyerleri.okul[m]}, ${mahalleName(m)}` });
            const [dx, dz] = this._zw(zone, side * su, v - 6.85);
            const door = [dx, dz];
            this._addWorkplace("okul", m, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
            (this.schools ??= []).push({ x0: cx - 12, x1: cx + 12, z0: cz - 12, z1: cz + 12, x: cx, building: b, _k: this._key });
            break;
          }
          case "cay": {
            // Dondurmacı: küçük büfe ve önünde piknik masaları.
            rplaza(side, v, sw - 2, gh - 2, "avlu");
            const bp = this._zw(zone, side * su + side * (sw / 2 - 5), v - gh / 2 + 4);
            this.addBuilding({ kind: "bufe", x: bp[0], z: bp[1], rot: rot0 + Math.PI, w: 6, d: 4.5, floors: 1, roofType: "flat", wall: "#f7e9ef", roof: "#c9c4bb", style: { shop: true, awning: "#e07a9a" }, address: `Ice Cream Parlor, ${mahalleName(m)}` });
            for (let t = 0; t < 6; t++) {
              const [tx, tz] = this._zw(zone, side * su - 5 + (t % 2) * 9 - side * 2, v - 6 + Math.floor(t / 2) * 7);
              this.features.push({ type: "masa1", x: tx, z: tz, piknik: true });
              this.features.push({ type: "semsiye", x: tx, z: tz, c: (m + t) % 4, town: true });
              for (const dv of [-0.7, 0.7]) {
                const [sx, sz] = this._zw(zone, side * su - 5 + (t % 2) * 9 - side * 2, v - 6 + Math.floor(t / 2) * 7 + dv);
                const heading = Math.atan2(tx - sx, tz - sz);
                this.features.push({ type: "sandalye", x: sx, z: sz, rot: heading });
                this.seats.push({ x: sx, z: sz, heading, h: 0.475, place, table: [tx, tz] });
              }
            }
            anchors.push([cx, cz]);
            anchorKeys.push(this._key);
            break;
          }
          case "oyun": {
            const seedP = m * 7 + r * 3 + (side > 0 ? 1 : 0);
            rplaza(side, v, Math.min(22, sw - 2), gh - 4, "oyun", { color: ["#4f8a57", "#b8523f", "#4f78a8", "#7a8f3f", "#3e8a86"][seedP % 5] });
            this.features.push({ type: "oyun", x: cx, z: cz, seed: seedP, w: Math.min(20, sw - 4), d: gh - 6 });
            for (const dv of [-1, 1]) {
              const [bx, bz] = this._zw(zone, side * su - side * 10.5, v + dv * 6);
              this.addBench(bx, bz, rot0 + (side > 0 ? -Math.PI / 2 : Math.PI / 2), place);
            }
            break;
          }
          case "basket": {
            rplaza(side, v, 16, 28, "basket");
            const [ax, az] = this._zw(zone, side * su, v - 13), [bx, bz] = this._zw(zone, side * su, v + 13);
            this.features.push({ type: "pota", x: ax, z: az, rot: rot0 });
            this.features.push({ type: "pota", x: bx, z: bz, rot: rot0 + Math.PI });
            break;
          }
          default: {
            this.unblock(cx - sw / 2, cz - sw / 2, cx + sw / 2, cz + sw / 2);
            this.parks.push({ x0: cx - sw / 2 + 2, z0: cz - gh / 2, x1: cx + sw / 2 - 2, z1: cz + gh / 2 });
            this.addBench(cx, cz, rot0, place);
            anchors.push([cx, cz]);
            anchorKeys.push(this._key);
          }
        }
      });
      // Community Center: sağdaki dondurmacı şeridinde, girişe yakın sokağa bakan tek katlı bina.
      if (kind === "cay" && side > 0) this._tag(`muhtarlik:${m}`, () => {
        const st = STYLES.muhtarlik;
        const [bx, bz] = this._zw(zone, su - 2, v - gh / 2 + st.d / 2 + 1);
        const names = cat().isyerleri.muhtarlik;
        const b = this.addBuilding({
          kind: "muhtarlik", x: bx, z: bz, rot: rot0 + Math.PI, w: st.w, d: st.d, floors: st.floors, roofType: st.roof,
          wall: st.wall, roof: st.roofColor, workplace: true, style: st, address: `${names[m % names.length]}`,
        });
        const door = this._zw(zone, su - 2, v - gh / 2 + 1.35);
        this._addWorkplace("muhtarlik", m % names.length, { door, path: [door, HUB], anchor: door, spread: 1.5, building: b });
      });
    }
    this._place(place, { anchors, anchorKeys, spread: 4, path: [this._zw(zone, 0, this._rowV(2))], mahalle: m });
  }

  /** Bir sakinin evi: yapının konumu ve yönü, kapı ve Green'e giden yol. */
  homeOf(slot) {
    const p = addressParts(slot);
    const zone = this.zones[p.mahalle % this.zones.length];
    const h = houseOf(slot);
    const perSokak = cap("daire_per_bina") * cap("bina_per_sokak");
    const first = p.mahalle * perMahalle() + p.sokak * perSokak + h.ev * h.birim;
    const q = this._housePos(zone, p.sokak, h.ev);
    return { bx: q.x, bz: q.z, rot: q.rot, door: q.door, path: [q.door, HUB], north: !q.back, parts: p, building: this.buildingBySlot0.get(first) };
  }

  workplaceOf(wp) {
    const list = this.workplaces[wp.kind];
    return list[wp.index] ?? list.find(Boolean);
  }

  placeOf(name) {
    return this.places[name] ?? this.places.meydan;
  }
}

/** Tabloda adı olmayan gelişim adımlarının adı (Main Street dükkânları, sonraki mahallelerin yerleri). */
function stageName(key) {
  const [kind, n] = key.split(":");
  const m = Number(n);
  switch (kind) {
    case "carsi": return "A new shop on Main Street";
    case "cami": return `${mahalleName(m)} Church`;
    case "cay": return `${mahalleName(m)} ice cream parlor`;
    case "mpark": return `${mahalleName(m)} park`;
    case "oyun": return `${mahalleName(m)} playground`;
    case "basket": return `${mahalleName(m)} basketball court`;
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
