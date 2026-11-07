// İnsan figürü: gerçek oranlarda (1,75 m'ye ölçeklenmiş, yaklaşık 7,5 baş boyu) eklemli low-poly beden.
// İskelet: kalça (kök) → gövde → baş; kalça → uyluk → baldır; gövde → üst kol → ön kol → el.
// Her parça ayrı bir InstancedMesh; renkler kişiye göre (ten, saç, üst, alt) instance rengiyle verilir.
// Eşyalar (olta, kitap, gitar, bisiklet, uçurtma...) ve köpekler de burada çizilir.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const HIP_Y = 0.92;
const WAIST_Y = 1.0;
const NECK_Y = 1.52;
const SHOULDER_Y = 1.44;
const THIGH = 0.45;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;

function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}

function merge(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

const W = "#ffffff";
const HY = NECK_Y + 0.155; // baş merkezi

// Low-poly beden: az bölümlü, köşeli parçalar. Renk instance'tan gelir (beyaz köşeler), yüz ayrıntıları sabit.
const GEO = {
  head: () => merge([
    tint(new THREE.CylinderGeometry(0.046, 0.054, 0.12, 6).translate(0, NECK_Y + 0.03, 0), W),
    tint(new THREE.IcosahedronGeometry(0.106, 1).scale(0.98, 1.16, 1.04).translate(0, HY, 0.004), W),
    tint(new THREE.ConeGeometry(0.02, 0.052, 4).rotateX(Math.PI / 2).translate(0, HY - 0.02, 0.112), "#ececec"),
    tint(new THREE.BoxGeometry(0.03, 0.048, 0.03).translate(-0.104, HY - 0.005, 0), "#e6e6e6"),
    tint(new THREE.BoxGeometry(0.03, 0.048, 0.03).translate(0.104, HY - 0.005, 0), "#e6e6e6"),
    ...[-0.038, 0.038].map((x) => tint(new THREE.BoxGeometry(0.024, 0.022, 0.012).translate(x, HY + 0.014, 0.1), "#1b1b22")),
    ...[-0.038, 0.038].map((x) => tint(new THREE.BoxGeometry(0.038, 0.009, 0.012).rotateZ(x > 0 ? -0.12 : 0.12).translate(x, HY + 0.042, 0.1), "#3a2b22")),
    tint(new THREE.BoxGeometry(0.042, 0.009, 0.012).translate(0, HY - 0.06, 0.1), "#8f4f48"),
  ]),
  torso: () => merge([
    // Göğüs omuzlarda geniş, bele doğru daralır; önden arkaya basık.
    tint(new THREE.CylinderGeometry(0.2, 0.152, 0.36, 7).scale(1, 1, 0.56).translate(0, 1.27, 0), W),
    tint(new THREE.CylinderGeometry(0.152, 0.162, 0.15, 7).scale(1, 1, 0.6).translate(0, 1.03, 0), W),
    tint(new THREE.SphereGeometry(0.2, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.3, 0.56).translate(0, 1.45, 0), W),
    // Yaka.
    tint(new THREE.CylinderGeometry(0.062, 0.075, 0.03, 6).translate(0, 1.5, 0.004), "#f4f4f4"),
  ]),
  hips: () => merge([
    tint(new THREE.CylinderGeometry(0.164, 0.156, 0.17, 7).scale(1, 1, 0.66).translate(0, HIP_Y + 0.04, 0), W),
    tint(new THREE.CylinderGeometry(0.166, 0.166, 0.035, 7).scale(1, 1, 0.66).translate(0, HIP_Y + 0.12, 0), "#3a3330"),
  ]),
  thigh: () => merge([tint(new THREE.CylinderGeometry(0.078, 0.056, THIGH, 6).translate(0, -THIGH / 2, 0), W)]),
  shin: () => merge([
    tint(new THREE.CylinderGeometry(0.055, 0.042, 0.42, 6).translate(0, -0.21, 0), W),
    tint(new THREE.BoxGeometry(0.096, 0.072, 0.25).translate(0, -0.44, 0.048), "#2b2b31"),
  ]),
  upperArm: () => merge([tint(new THREE.CylinderGeometry(0.049, 0.04, UPPER_ARM, 6).translate(0, -UPPER_ARM / 2, 0), W)]),
  forearm: () => merge([tint(new THREE.CylinderGeometry(0.039, 0.032, FOREARM, 6).translate(0, -FOREARM / 2, 0), W)]),
  hand: () => merge([tint(new THREE.IcosahedronGeometry(0.042, 0).scale(0.75, 1.2, 0.55).translate(0, -0.04, 0), W)]),
};

// Aksesuar: sakal ve gözlük (başa bağlı). Etek yok: sakinin cinsiyetini bilmiyoruz, rastgele etek herkese düşmesin.
const EXTRAS = {
  beard: () => merge([
    tint(new THREE.IcosahedronGeometry(0.1, 1).scale(1.0, 0.75, 0.9).translate(0, HY - 0.07, 0.03), W),
  ]),
  glasses: () => merge([
    ...[-0.038, 0.038].map((x) => tint(new THREE.TorusGeometry(0.024, 0.005, 3, 8).translate(x, HY + 0.014, 0.108), "#222228")),
    tint(new THREE.BoxGeometry(0.03, 0.005, 0.005).translate(0, HY + 0.016, 0.11), "#222228"),
  ]),
  // İş başlıkları (üniformayla gelir; renk kişiden). Saçın tepesini örter, yanlardan ve arkadan saç görünür.
  kep: () => merge([ // polis kepi: tepe, koyu bant, siperlik
    tint(new THREE.CylinderGeometry(0.132, 0.118, 0.07, 10).scale(1, 1, 1.08).translate(0, HY + 0.115, -0.006), W),
    tint(new THREE.CylinderGeometry(0.12, 0.12, 0.034, 10).scale(1, 1, 1.08).translate(0, HY + 0.073, -0.006), "#3a3a44"),
    tint(new THREE.BoxGeometry(0.15, 0.012, 0.075).rotateX(0.3).translate(0, HY + 0.064, 0.118), "#3a3a44"),
  ]),
  asci: () => merge([ // aşçı ve fırıncı börkü
    tint(new THREE.CylinderGeometry(0.115, 0.118, 0.17, 10).translate(0, HY + 0.15, -0.006), W),
    tint(new THREE.IcosahedronGeometry(0.13, 1).scale(1, 0.45, 1).translate(0, HY + 0.24, -0.006), W),
  ]),
  kask: () => merge([ // baret
    tint(new THREE.SphereGeometry(0.13, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.08).translate(0, HY + 0.045, -0.006), W),
    tint(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 12).scale(1, 1, 1.12).translate(0.0, HY + 0.05, 0.012), W),
  ]),
  bere: () => merge([ // yün bere (balıkçı, fener bekçisi)
    tint(new THREE.SphereGeometry(0.123, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.1, 1.08).translate(0, HY + 0.03, -0.01), W),
    tint(new THREE.CylinderGeometry(0.126, 0.126, 0.045, 9).scale(1, 1, 1.08).translate(0, HY + 0.035, -0.01), "#d0d0d0"),
  ]),
  sapka: () => merge([ // siperlikli şapka (cankurtaran, bahçıvan)
    tint(new THREE.SphereGeometry(0.122, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1.08).translate(0, HY + 0.05, -0.006), W),
    tint(new THREE.BoxGeometry(0.13, 0.012, 0.1).rotateX(0.12).translate(0, HY + 0.055, 0.125), W),
  ]),
  hasir: () => merge([ // geniş kenarlı hasır şapka (zeytinci)
    tint(new THREE.CylinderGeometry(0.1, 0.118, 0.09, 10).translate(0, HY + 0.12, -0.006), W),
    tint(new THREE.CylinderGeometry(0.25, 0.25, 0.012, 14).translate(0, HY + 0.078, -0.006), W),
  ]),
};
// Başlık takanlarda tepeden taşan saç (topuz, kıvırcık) kısa saça döner.
export const HAT_HAIR = { 3: 1, 5: 1 };

/** Saç biçimleri (görünüş.sac); null: kel. Baş kemiğine bağlıdır. */
function hairGeometries() {
  const cap = (theta = 0.52, r = 0.114, segs = 9) => tint(new THREE.SphereGeometry(r, segs, 5, 0, Math.PI * 2, 0, Math.PI * theta).scale(1, 1.16, 1.07).translate(0, HY + 0.004, -0.012), W);
  return [
    merge([cap(), tint(new THREE.BoxGeometry(0.17, 0.04, 0.05).rotateX(0.5).translate(0.01, HY + 0.085, 0.085), W)]), // kısa, kahküllü
    merge([cap(0.45, 0.109)]), // asker tıraşı
    merge([cap(0.6), tint(new THREE.BoxGeometry(0.21, 0.3, 0.06).translate(0, HY - 0.12, -0.085), W),
      tint(new THREE.BoxGeometry(0.035, 0.22, 0.07).translate(-0.1, HY - 0.08, -0.01), W), tint(new THREE.BoxGeometry(0.035, 0.22, 0.07).translate(0.1, HY - 0.08, -0.01), W)]), // uzun düz
    merge([cap(), tint(new THREE.IcosahedronGeometry(0.058, 0).translate(0, HY + 0.12, -0.075), W)]), // topuz
    merge([cap(), tint(new THREE.CylinderGeometry(0.036, 0.016, 0.26, 5).rotateX(0.35).translate(0, HY - 0.07, -0.135), W)]), // at kuyruğu
    merge([tint(new THREE.IcosahedronGeometry(0.142, 1).scale(1.02, 0.95, 1).translate(0, HY + 0.04, -0.02), W)]), // kıvırcık
    null, // kel
    merge([cap(0.68, 0.117), tint(new THREE.BoxGeometry(0.2, 0.05, 0.05).rotateX(0.35).translate(0, HY + 0.075, 0.09), W)]), // küt
  ];
}

// Eşyalar: yerel kökleri tutulduğu yere göre.
const PROPS = {
  olta: () => merge([tint(new THREE.CylinderGeometry(0.012, 0.022, 3.4, 5).translate(0, 1.7, 0), "#3a3a3a"), tint(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8).rotateZ(Math.PI / 2).translate(0.04, 0.35, 0), "#c0c0c0")]),
  // Açık kitap: renkli kapak (−z, okurun karşısına bakar), +z yüzde okura dönük iki sayfa (ortadan hafif kırık).
  kitap: () => merge([
    tint(new THREE.BoxGeometry(0.3, 0.22, 0.012), "#2f5d8a"),
    tint(new THREE.BoxGeometry(0.142, 0.205, 0.016).rotateY(-0.12).translate(-0.072, 0, 0.012), "#f4efe2"),
    tint(new THREE.BoxGeometry(0.142, 0.205, 0.016).rotateY(0.12).translate(0.072, 0, 0.012), "#f4efe2"),
    tint(new THREE.BoxGeometry(0.008, 0.2, 0.02).translate(0, 0, 0.006), "#d9d0bc"),
  ]),
  // Telefon: koyu gövde, bir yüzünde açık ekran (+z), kenarında kamera (−z yüzde).
  telefon: () => merge([
    tint(new THREE.BoxGeometry(0.072, 0.145, 0.012), "#1c1c22"),
    tint(new THREE.BoxGeometry(0.062, 0.128, 0.002).translate(0, 0, 0.0065), "#9fd0f5"),
    tint(new THREE.BoxGeometry(0.014, 0.014, 0.003).translate(-0.022, 0.055, -0.0068), "#3a3a44"),
  ]),
  fotograf: () => merge([tint(new THREE.BoxGeometry(0.15, 0.1, 0.08), "#222226"), tint(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10).rotateX(Math.PI / 2).translate(0, 0, 0.07), "#111114"), tint(new THREE.BoxGeometry(0.04, 0.03, 0.02).translate(-0.04, 0.06, 0), "#c0c0c0")]),
  durbun: () => merge([tint(new THREE.CylinderGeometry(0.03, 0.035, 0.16, 8).rotateX(Math.PI / 2).translate(-0.04, 0, 0), "#1c1c22"), tint(new THREE.CylinderGeometry(0.03, 0.035, 0.16, 8).rotateX(Math.PI / 2).translate(0.04, 0, 0), "#1c1c22"), tint(new THREE.BoxGeometry(0.05, 0.03, 0.05), "#2a2a30")]),
  gitar: () => merge([
    tint(new THREE.CylinderGeometry(0.17, 0.17, 0.09, 12).rotateX(Math.PI / 2).translate(0, -0.12, 0), "#b9783f"),
    tint(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 12).rotateX(Math.PI / 2).translate(0, 0.1, 0), "#b9783f"),
    tint(new THREE.BoxGeometry(0.05, 0.5, 0.03).translate(0, 0.45, 0), "#4a3020"),
  ]),
  kasa: () => merge([tint(new THREE.BoxGeometry(0.5, 0.32, 0.36), "#b48a5a")]),
  sovale: () => merge([
    tint(new THREE.BoxGeometry(0.04, 1.7, 0.04).rotateX(0.15).translate(-0.3, 0.85, 0), "#8a6a4a"),
    tint(new THREE.BoxGeometry(0.04, 1.7, 0.04).rotateX(0.15).translate(0.3, 0.85, 0), "#8a6a4a"),
    tint(new THREE.BoxGeometry(0.04, 1.6, 0.04).rotateX(-0.35).translate(0, 0.8, -0.2), "#8a6a4a"),
    tint(new THREE.BoxGeometry(0.7, 0.55, 0.03).rotateX(0.15).translate(0, 1.3, 0.1), "#f4efe4"),
    tint(new THREE.BoxGeometry(0.5, 0.3, 0.035).rotateX(0.15).translate(0, 1.33, 0.11), "#7fb3d9"),
  ]),
  bisiklet: () => {
    const wheel = (z) => tint(new THREE.TorusGeometry(0.33, 0.025, 5, 16).rotateY(Math.PI / 2).translate(0, 0.35, z), "#202024");
    return merge([
      wheel(-0.52), wheel(0.52),
      tint(new THREE.BoxGeometry(0.04, 0.04, 0.75).rotateX(-0.45).translate(0, 0.55, 0.05), "#c8312f"),
      tint(new THREE.BoxGeometry(0.04, 0.5, 0.04).rotateX(-0.25).translate(0, 0.62, -0.25), "#c8312f"),
      tint(new THREE.BoxGeometry(0.04, 0.5, 0.04).rotateX(0.3).translate(0, 0.68, 0.45), "#c8312f"),
      tint(new THREE.BoxGeometry(0.5, 0.03, 0.03).translate(0, 0.95, 0.38), "#202024"),
      tint(new THREE.BoxGeometry(0.12, 0.05, 0.24).translate(0, 0.9, -0.3), "#202024"),
      tint(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10).rotateZ(Math.PI / 2).translate(0, 0.3, 0.02), "#8a8a8a"),
      tint(new THREE.BoxGeometry(0.3, 0.025, 0.025).translate(0, 0.3, 0.02), "#2a2a2a"),
    ]);
  },
  mat: () => merge([tint(new THREE.BoxGeometry(0.62, 0.012, 1.8), "#7a5cc4")]),
  // Tekerlekli valiz (gövde rengi kişiye göre değişir: beyaz tonlu gövde örnek rengiyle çarpılır).
  valiz: () => merge([
    tint(new THREE.BoxGeometry(0.4, 0.56, 0.24).translate(0, 0.35, 0), "#ffffff"),
    tint(new THREE.BoxGeometry(0.41, 0.03, 0.25).translate(0, 0.35, 0), "#bdbdbd"),
    tint(new THREE.BoxGeometry(0.02, 0.36, 0.02).translate(-0.12, 0.81, -0.08), "#2a2a2e"),
    tint(new THREE.BoxGeometry(0.02, 0.36, 0.02).translate(0.12, 0.81, -0.08), "#2a2a2e"),
    tint(new THREE.BoxGeometry(0.27, 0.035, 0.035).translate(0, 0.99, -0.08), "#2a2a2e"),
    tint(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8).rotateZ(Math.PI / 2).translate(-0.15, 0.04, -0.09), "#1a1a1a"),
    tint(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8).rotateZ(Math.PI / 2).translate(0.15, 0.04, -0.09), "#1a1a1a"),
  ]),
  havlu: () => merge([tint(new THREE.BoxGeometry(0.8, 0.01, 1.7), "#e8607a")]),
  // Piknik örtüsü: kırmızı-beyaz kareli (beyaz şeritler kırmızı zeminin hemen üstünde).
  ortu: () => merge([
    tint(new THREE.BoxGeometry(1.9, 0.01, 1.9), "#d9534f"),
    ...[-0.6, 0, 0.6].map((o) => tint(new THREE.BoxGeometry(0.22, 0.012, 1.9).translate(o, 0.002, 0), "#f6f1e9")),
    ...[-0.6, 0, 0.6].map((o) => tint(new THREE.BoxGeometry(1.9, 0.013, 0.22).translate(0, 0.003, o), "#f6f1e9")),
  ]),
  ucurtma: () => merge([
    tint(new THREE.ConeGeometry(0.55, 1.1, 4).scale(1, 1, 0.05).rotateX(Math.PI / 2).rotateX(-Math.PI / 2), "#e0463c"),
    tint(new THREE.BoxGeometry(0.03, 1.4, 0.01).translate(0, -1.1, 0), "#f2c230"),
  ]),
  ip: () => merge([tint(new THREE.CylinderGeometry(0.006, 0.006, 1, 3).translate(0, 0.5, 0), "#f4f4f4")]),
};

/** Köpek parçaları: gövde, baş (boyundan döner), kuyruk (kökünden döner), bacak (omuzdan/kalçadan). */
function dogGeometries() {
  return {
    body: merge([
      tint(new THREE.CylinderGeometry(0.13, 0.12, 0.6, 8).rotateX(Math.PI / 2).translate(0, 0.42, 0), W),
      tint(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 6).rotateX(-0.6).translate(0, 0.5, 0.3), W),
    ]),
    head: merge([
      tint(new THREE.SphereGeometry(0.115, 8, 6).scale(1, 1, 1.2).translate(0, 0.06, 0.06), W),
      tint(new THREE.BoxGeometry(0.1, 0.08, 0.14).translate(0, 0.02, 0.18), W),
      tint(new THREE.SphereGeometry(0.025, 5, 4).translate(0, 0.04, 0.26), "#141414"),
      tint(new THREE.SphereGeometry(0.016, 4, 3).translate(-0.045, 0.1, 0.13), "#141414"),
      tint(new THREE.SphereGeometry(0.016, 4, 3).translate(0.045, 0.1, 0.13), "#141414"),
      tint(new THREE.BoxGeometry(0.05, 0.12, 0.04).rotateZ(0.35).translate(-0.08, 0.15, 0.03), "#8a8a8a"),
      tint(new THREE.BoxGeometry(0.05, 0.12, 0.04).rotateZ(-0.35).translate(0.08, 0.15, 0.03), "#8a8a8a"),
    ]),
    tail: merge([tint(new THREE.CylinderGeometry(0.018, 0.03, 0.28, 5).translate(0, 0.14, 0), W)]),
    leg: merge([tint(new THREE.CylinderGeometry(0.035, 0.03, 0.34, 6).translate(0, -0.17, 0), W)]),
  };
}

const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);

export class Crowd {
  constructor(capacity) {
    this.capacity = capacity;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    const make = (geo, shadow, n = capacity) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.count = 0;
      return m;
    };
    const parts = ["head", "torso", "hips", "thighL", "thighR", "shinL", "shinR", "upperArmL", "upperArmR", "forearmL", "forearmR", "handL", "handR"];
    const shared = {};
    for (const p of parts) {
      const base = p.replace(/[LR]$/, "");
      shared[base] ??= GEO[base]();
      this[p] = make(shared[base], ["torso", "thighL", "thighR", "shinL", "shinR", "head"].includes(p));
    }
    this.parts = parts.map((p) => this[p]);
    this.hair = hairGeometries().map((g) => (g ? make(g, false) : null));
    this.extras = Object.fromEntries(Object.entries(EXTRAS).map(([k, f]) => [k, make(f(), false)]));
    const propCap = Math.max(16, Math.ceil(capacity / 3));
    this.props = Object.fromEntries(Object.entries(PROPS).map(([k, f]) => [k, make(f(), k === "bisiklet" || k === "sovale", propCap)]));
    const dog = dogGeometries();
    const dogCap = Math.max(16, Math.ceil(capacity / 4));
    this.dogBody = make(dog.body, true, dogCap);
    this.dogOwner = new Int32Array(dogCap); // köpek → sahibinin sırası (dokununca sahibi seçilir)
    this.dogHead = make(dog.head, false, dogCap);
    this.dogTail = make(dog.tail, false, dogCap);
    this.dogLegs = make(dog.leg, false, dogCap * 4);
    this.group = new THREE.Group();
    for (const m of [...this.parts, ...this.hair, ...Object.values(this.extras), ...Object.values(this.props), this.dogBody, this.dogHead, this.dogTail, this.dogLegs]) if (m) this.group.add(m);
    this.drawToIndex = new Int32Array(capacity);

    this._m = Array.from({ length: 12 }, () => new THREE.Matrix4());
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._one = new THREE.Vector3(1, 1, 1);
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  begin() {
    this.count = 0;
    this.hairCounts = this.hair.map(() => 0);
    this.extraCounts = Object.fromEntries(Object.keys(this.extras).map((k) => [k, 0]));
    this.propCounts = Object.fromEntries(Object.keys(this.props).map((k) => [k, 0]));
    this.dogCount = 0;
  }

  /** out = parent × T(x,y,z) × R(eksen sırası: Y, X, Z). */
  _joint(out, parent, x, y, z, rx = 0, ry = 0, rz = 0) {
    const q = this._q;
    q.setFromAxisAngle(AY, ry);
    if (rx) q.multiply(this._q2.setFromAxisAngle(AX, rx));
    if (rz) q.multiply(this._q2.setFromAxisAngle(AZ, rz));
    out.compose(this._p.set(x, y, z), q, this._one);
    return out.premultiply(parent);
  }

  _prop(name, matrix, color) {
    const mesh = this.props[name];
    const k = this.propCounts[name];
    if (k >= mesh.instanceMatrix.count) return;
    mesh.setMatrixAt(k, matrix);
    if (color) mesh.setColorAt(k, color);
    this.propCounts[name] = k + 1;
  }

  /**
   * Bir kişiyi çizer. pose: konum ve yön, boy, renkler ve eklem açıları (radyan):
   * lie (sırtüstü yatma), drop (kalça alçalması, m), lean (gövde öne), twist, headYaw, headPitch,
   * hipL/R (uyluk öne), kneeL/R (diz bükümü), shL/R (kol öne), abL/R (kol yana), elL/R (dirsek), props.
   */
  add(index, p) {
    if (this.count >= this.capacity) return;
    const d = this.count++;
    this.drawToIndex[d] = index;
    const [root, torso, head, thigh, shin, upper, fore, hand, tmp, propM] = this._m;
    const k = p.height / 1.75;
    this._q.setFromAxisAngle(AY, p.heading);
    if (p.lie) this._q.multiply(this._q2.setFromAxisAngle(AX, -p.lie));
    root.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.set(k, k, k));
    if (p.drop) root.multiply(tmp.makeTranslation(0, -p.drop, 0));

    this.hips.setMatrixAt(d, root);
    // Gövde belden döner, baş boyundan.
    this._joint(torso, root, 0, WAIST_Y, 0, p.lean || 0, p.twist || 0).multiply(tmp.makeTranslation(0, -WAIST_Y, 0));
    this.torso.setMatrixAt(d, torso);
    this._joint(head, torso, 0, NECK_Y, 0, p.headPitch || 0, p.headYaw || 0).multiply(tmp.makeTranslation(0, -NECK_Y, 0));
    this.head.setMatrixAt(d, head);

    const leg = (side, hipA, kneeA, thighMesh, shinMesh) => {
      this._joint(thigh, root, side * 0.088, HIP_Y, 0, -hipA, 0, side * 0.03);
      thighMesh.setMatrixAt(d, thigh);
      this._joint(shin, thigh, 0, -THIGH, 0, kneeA);
      shinMesh.setMatrixAt(d, shin);
    };
    leg(-1, p.hipL || 0, p.kneeL || 0, this.thighL, this.shinL);
    leg(1, p.hipR || 0, p.kneeR || 0, this.thighR, this.shinR);

    const hands = [];
    const arm = (side, shA, abA, elA, upperMesh, foreMesh, handMesh) => {
      this._joint(upper, torso, side * 0.215, SHOULDER_Y, 0, -shA, 0, side * (0.07 + abA));
      upperMesh.setMatrixAt(d, upper);
      this._joint(fore, upper, 0, -UPPER_ARM, 0, -elA);
      foreMesh.setMatrixAt(d, fore);
      this._joint(hand, fore, 0, -FOREARM, 0);
      handMesh.setMatrixAt(d, hand);
      hands.push(this._m[10 + hands.length].copy(hand));
    };
    arm(-1, p.shL || 0, p.abL || 0, p.elL || 0, this.upperArmL, this.forearmL, this.handL);
    arm(1, p.shR || 0, p.abR || 0, p.elR || 0, this.upperArmR, this.forearmR, this.handR);

    for (const [mesh, color] of [
      [this.head, p.skin], [this.handL, p.skin], [this.handR, p.skin],
      [this.torso, p.top], [this.upperArmL, p.top], [this.upperArmR, p.top],
      [this.forearmL, p.sleeves ? p.top : p.skin], [this.forearmR, p.sleeves ? p.top : p.skin],
      [this.hips, p.bottom], [this.thighL, p.bottom], [this.thighR, p.bottom],
      [this.shinL, p.shorts ? p.skin : p.bottom], [this.shinR, p.shorts ? p.skin : p.bottom],
    ]) mesh.setColorAt(d, color);

    const extra = (name, matrix, color) => {
      const mesh = this.extras[name];
      const n = this.extraCounts[name]++;
      mesh.setMatrixAt(n, matrix);
      if (color) mesh.setColorAt(n, color);
    };
    if (p.beard) extra("beard", head, p.hairColor);
    if (p.glasses) extra("glasses", head);
    if (p.hat) extra(p.hat, head, p.hatColor);

    const hair = this.hair[p.style];
    if (hair) {
      const h = this.hairCounts[p.style]++;
      hair.setMatrixAt(h, head);
      hair.setColorAt(h, p.hairColor);
    }

    // Eşyalar.
    const handR = hands[1];
    for (const prop of p.props ?? []) {
      switch (prop) {
        // Olta elden çıkar ama yönü gövdeye göre: öne (bakılan yöne, suya) ve ~40° yukarı, sapı elin 0,4 m gerisinde
        // (7 Kasım: ele bağlı açı kola göre döndüğü için olta yukarı-geriye, kara tarafına ve kıyıya paralel uzanıyordu).
        // Kitap iki elin arasında, sayfalar okura dönük.
        case "olta": {
          this._p.setFromMatrixPosition(handR);
          // Atışta (people.js "fish": omuz 0,75 → 1,75) olta yalnız düşey düzlemde başın üstüne kalkar, yana dönmez.
          const atis = Math.min(1, Math.max(0, ((p.shR ?? 0.75) - 0.75) / 1.0));
          this._q.setFromAxisAngle(AY, p.heading).multiply(this._q2.setFromAxisAngle(AX, 0.88 - 1.1 * atis));
          propM.compose(this._p, this._q, this._s.set(k, k, k)).multiply(tmp.makeTranslation(0.04, -0.4, 0));
          this._prop("olta", propM);
          break;
        }
        case "kitap": this._prop("kitap", this._joint(propM, handR, -0.12, -0.06, 0.06, -0.7)); break;
        // Ekran (+z) yüze dönük, telefon 45°'ye yakın eğik (−1,3'te dimdik, +1,6'da ekran karşıya bakıyordu).
        case "telefon": this._prop("telefon", this._joint(propM, handR, 0, -0.07, 0.03, -0.6)); break;
        case "fotograf": this._prop("fotograf", this._joint(propM, handR, -0.08, -0.06, 0.04, -1.57)); break;
        case "durbun": this._prop("durbun", this._joint(propM, handR, -0.09, -0.07, 0.05, -1.57)); break;
        case "gitar": this._prop("gitar", this._joint(propM, torso, 0.02, 1.12, 0.17, 0, 0, 1.15)); break;
        case "kasa": this._prop("kasa", this._joint(propM, torso, 0, 1.12, 0.32)); break;
        case "sovale": this._prop("sovale", this._joint(propM, root, 0.1, 0, 0.75, 0, Math.PI)); break;
        case "bisiklet": {
          // Bisiklet ölçeklenmez; tekerlekler yerde, sele kalçanın altında.
          this._q.setFromAxisAngle(AY, p.heading);
          // Sele (bisikletin 0,3 m arkası) kalçanın altına gelir.
          propM.compose(this._p.set(p.x + Math.sin(p.heading) * 0.3, p.groundY ?? p.y, p.z + Math.cos(p.heading) * 0.3), this._q, this._one);
          this._prop("bisiklet", propM);
          break;
        }
        case "mat": this._prop("mat", this._joint(propM, root, 0, 0.01, 0.3)); break;
        case "valiz": {
          // Valiz yerde, sağ elin yanında; sapı ele doğru.
          this._q.setFromAxisAngle(AY, p.heading);
          const sx = Math.cos(p.heading), sz = -Math.sin(p.heading);
          propM.compose(this._p.set(p.x - sx * 0.42 * k, p.groundY ?? p.y, p.z - sz * 0.42 * k), this._q, this._one);
          this._prop("valiz", propM, p.propColor);
          break;
        }
        case "ortu": {
          // Örtü grubun ortasında yerde (herkes aynı örtüyü aynı yere çizer).
          if (!p.ortu) break;
          this._q.setFromAxisAngle(AY, 0.3);
          propM.compose(this._p.set(p.ortu[0], p.ortu[1] + 0.01, p.ortu[2]), this._q, this._one);
          this._prop("ortu", propM);
          break;
        }
        case "havlu": {
          // Havlu yerde, bedenin ortasında (yatan kişinin başı arkada kalır).
          this._q.setFromAxisAngle(AY, p.heading);
          propM.compose(this._p.set(p.x - Math.sin(p.heading) * 0.85 * k, p.y - 0.1, p.z - Math.cos(p.heading) * 0.85 * k), this._q, this._one);
          this._prop("havlu", propM);
          break;
        }
        case "ucurtma": {
          const kx = p.x + Math.sin(p.heading) * 18, kz = p.z + Math.cos(p.heading) * 18;
          const ky = p.y + 16 + Math.sin(p.t * 0.7) * 1.5;
          this._q.setFromAxisAngle(AY, p.heading + Math.sin(p.t * 1.3) * 0.3);
          propM.compose(this._p.set(kx, ky, kz), this._q, this._one);
          this._prop("ucurtma", propM);
          // İp: elden uçurtmaya.
          const hx = handR.elements[12], hy = handR.elements[13], hz = handR.elements[14];
          const dx = kx - hx, dy = ky - hy, dz = kz - hz, len = Math.hypot(dx, dy, dz);
          this._q.setFromUnitVectors(AY, this._p.set(dx / len, dy / len, dz / len));
          propM.compose(this._p.set(hx, hy, hz), this._q, this._s.set(1, len, 1));
          this._prop("ip", propM);
          break;
        }
      }
    }
  }

  /**
   * Köpek. moving: sahibiyle yürüyor mu; durunca sırayla oturur, yatar, yeri koklar ya da etrafına
   * bakınıp kuyruk sallar (köpeğe ve zamana göre).
   */
  addDog(x, y, z, heading, phase, color, moving = true, t = 0, seed = 0, owner = -1) {
    const i = this.dogCount;
    if (i >= this.dogBody.instanceMatrix.count) return;
    this.dogCount++;
    this.dogOwner[i] = owner;
    const [root, leg, head, tail, tmp] = this._m;
    const slot = Math.floor((t + seed * 13) / 25);
    const state = moving ? "walk" : ["stand", "sit", "sniff", "lie", "sit", "stand"][(slot + seed) % 6];
    let lift = 0, pitch = 0, headPitch = 0, headYaw = 0;
    const legA = [0, 0, 0, 0]; // ön sol, ön sağ, arka sol, arka sağ
    let legDrop = [0, 0, 0, 0];
    let wag = Math.sin(t * (moving ? 6 : 9)) * (state === "lie" ? 0.15 : 0.5);
    if (state === "walk") {
      lift = Math.abs(Math.sin(phase)) * 0.03;
      legA[0] = Math.sin(phase) * 0.5; legA[1] = Math.sin(phase + Math.PI) * 0.5;
      legA[2] = Math.sin(phase + Math.PI) * 0.5; legA[3] = Math.sin(phase) * 0.5;
      headPitch = 0.05 * Math.sin(phase * 2);
    } else if (state === "sit") {
      pitch = -0.45; lift = -0.04;
      legA[2] = legA[3] = -1.25; legDrop = [0, 0, 0.1, 0.1];
      legA[0] = legA[1] = 0.25;
      headYaw = 0.5 * Math.sin(t * 0.4 + seed);
    } else if (state === "lie") {
      lift = -0.25;
      legA[0] = legA[1] = -1.35; legA[2] = legA[3] = 1.3;
      headPitch = 0.25; headYaw = 0.3 * Math.sin(t * 0.2 + seed);
    } else if (state === "sniff") {
      headPitch = 0.7 + 0.08 * Math.sin(t * 7);
      headYaw = 0.4 * Math.sin(t * 0.7 + seed);
      pitch = 0.08;
      legA[0] = 0.15;
    } else {
      headYaw = 0.6 * Math.sin(t * 0.5 + seed);
      headPitch = -0.1;
    }
    this._q.setFromAxisAngle(AY, heading);
    if (pitch) this._q.multiply(this._q2.setFromAxisAngle(AX, pitch));
    root.compose(this._p.set(x, y + lift, z), this._q, this._one);
    this.dogBody.setMatrixAt(i, root);
    this.dogBody.setColorAt(i, color);
    this._joint(head, root, 0, 0.55, 0.33, headPitch, headYaw);
    this.dogHead.setMatrixAt(i, head);
    this.dogHead.setColorAt(i, color);
    this._joint(tail, root, 0, 0.5, -0.3, -0.9 - (state === "lie" ? -0.7 : 0), wag * 0.6, wag);
    this.dogTail.setMatrixAt(i, tail);
    this.dogTail.setColorAt(i, color);
    const legs = [[-0.08, 0.22], [0.08, 0.22], [-0.08, -0.22], [0.08, -0.22]];
    legs.forEach(([lx, lz], j) => {
      this._joint(leg, root, lx, 0.34 - legDrop[j], lz, legA[j]);
      this.dogLegs.setMatrixAt(i * 4 + j, leg);
      this.dogLegs.setColorAt(i * 4 + j, color);
    });
    void tmp;
  }

  end() {
    for (const m of this.parts) {
      m.count = this.count;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const [k, m] of Object.entries(this.extras)) {
      m.count = this.extraCounts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.hair.forEach((m, i) => {
      if (!m) return;
      m.count = this.hairCounts[i];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
    for (const [k, m] of Object.entries(this.props)) {
      m.count = this.propCounts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.dogBody.count = this.dogHead.count = this.dogTail.count = this.dogCount;
    this.dogLegs.count = this.dogCount * 4;
    for (const m of [this.dogBody, this.dogHead, this.dogTail, this.dogLegs]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  pickTargets() {
    return [this.torso, this.head, this.thighL, this.thighR];
  }

  dogTargets() {
    return [this.dogBody, this.dogHead];
  }
}

/**
 * Telefona bakma duruşu: sağ el göğüs önünde, çene hizasının altında; telefonun ekranı yüze dönük, baş öne eğik.
 * (Eski duruşta kol omuz hizasına kalkıyor, telefon başın yanında dışarı bakıyordu.)
 */
export function phonePose(p) {
  p.shR = 0.35; p.elR = 1.45; p.headPitch = 0.55;
}
