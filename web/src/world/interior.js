// İç mekân (bebek evi) görünümü: seçilen binanın seçilen katı kesilir; alt katlar dışarıdan, o kat
// içeriden görünür.
//
// Apartmanlar: ortada merdiven ve asansör çekirdeği; katta ikiden fazla daire varsa arkada ortak
// koridor. Her dairenin planı tohumdan seçilir (önde salon, arkada salon, açık mutfaklı salon,
// çalışma odalı) ve eşyalar sağa ya da sola aynalanır. Odalar arasında kapı boşlukları vardır;
// sakinler bir işten ötekine dairenin orta aksından yürüyerek geçer, duvarların içinden geçmez.
// İş yerleri: türüne göre döşeme (workinterior.js); o an işte olanlar işlerinin başında.
import * as THREE from "three";
import { isHoliday, pet, roll } from "../sim.js";
import { buildKit, drawBuilding, local, makeKit } from "./city.js";
import { FLAT_Y, FLOOR_H, unitLayout } from "./layout.js";
import { homeActivity } from "./life.js";
import { idleGesture, keepExtra, resetPose, sitPose, walkPose } from "./people.js";
import { buildWorkInterior, workPose } from "./workinterior.js";
import { phonePose } from "./human.js";
import { doubleStair } from "./stairs.js";
import * as P from "./palette.js";
import { prefFor } from "../tercih.js";
import { Color } from "three";

const SCHOOL_TOP = [new Color("#2f4a6d"), new Color("#f4f1ea")];

const WALL_H = 2.9;
const CUT = 1.05; // iç duvarlar bu yüksekliğe kadar kesilir (içerisi görünsün)
const DOOR = 0.95;
const FLOORS = ["#b58a63", "#c79f74", "#9c7353", "#d2b48c", "#a98b6f", "#cfc6b8"];
const PAINTS = ["#f3ece2", "#e7eef2", "#f1e4d6", "#e6efe3", "#f2e1e1", "#ece6f2", "#f5efd9"];
const SOFAS = ["#5b7a99", "#8a5a4a", "#6f8f6a", "#9a8f80", "#4a4f63", "#b07a55", "#7a4f6a"];
const DUVETS = ["#e8eef5", "#d9e4ef", "#f2e3d5", "#e6d8ee", "#dfeadf", "#f3dede"];
const RUGS = ["#b8625a", "#5a7fa8", "#c9a25a", "#7a6a9a", "#5f8f7f", "#a86a4a"];
const WOODS = ["#7a5a44", "#a07a58", "#5e4636", "#c9a27a"];
const BOOKS = ["#b8423c", "#2f4a6d", "#d9a441", "#3e8a86"];

// Daire planları: önden arkaya oda türleri ve göreli derinlikleri.
const PLANS = [
  [["salon", 4.4], ["mutfak", 3.0], ["banyo", 2.0], ["yatak", 3.6]],
  [["yatak", 3.6], ["banyo", 2.0], ["mutfak", 2.9], ["salon", 4.3]],
  [["acik", 6.0], ["banyo", 2.0], ["yatak", 3.8]],
  [["salon", 3.9], ["calisma", 2.6], ["banyo", 1.9], ["yatak", 3.4]],
];

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const H = (seed, n) => (roll(seed, "ic" + n) % 10000) / 10000;

// Duraktaki işin duruşu (workinterior.js workPose türleri).
const DWELL_POSE = { counter: "counter", shelf: "shelf", board: "board", look: "stand", serve: "stand", check: "stand", explain: "stand" };

/**
 * Duraklı tur: sp.path = [{x, z, dwell, act, fx?, fz?}] (dünya koordinatı; fx/fz: durakta bakılan nokta).
 * Döner: {x, z, heading, moving, dist (yürünen toplam yol: adım evresi), act}. Yürüyüş uçlarda yavaşlar,
 * yön durağa varırken ve kalkarken yarım saniyede döner (bir anda değil).
 */
function tourAt(sp, t, speed, out) {
  if (!sp._legs) {
    let T = 0;
    sp._legs = sp.path.map((a, k) => {
      const b = sp.path[(k + 1) % sp.path.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const leg = { a, b, L, t0: T, walk: L / speed, dwell: b.dwell ?? 0, dir: Math.atan2(b.x - a.x, b.z - a.z) };
      leg.face = b.fx != null ? Math.atan2(b.fx - b.x, b.fz - b.z) : leg.dir;
      T += leg.walk + leg.dwell;
      return leg;
    });
    sp._T = T || 1;
  }
  const lerpAng = (a, b, u) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * u;
  let u = ((t % sp._T) + sp._T) % sp._T;
  for (let k = 0; k < sp._legs.length; k++) {
    const lg = sp._legs[k], prev = sp._legs[(k - 1 + sp._legs.length) % sp._legs.length];
    if (u < lg.walk) {
      const ease = (x) => x * x * (2 - x);
      const A = Math.min(0.6, lg.L / 2), d0 = u * speed;
      const d = A <= 0.01 ? d0 : d0 < A ? A * ease(d0 / A) : d0 > lg.L - A ? lg.L - A * ease((lg.L - d0) / A) : d0;
      const f = lg.L ? d / lg.L : 1;
      out.x = lg.a.x + (lg.b.x - lg.a.x) * f; out.z = lg.a.z + (lg.b.z - lg.a.z) * f;
      out.heading = lerpAng(prev.face, lg.dir, Math.min(1, u / 0.5));
      out.moving = lg.L > 0.05; out.dist = lg.t0 * speed + d; out.act = null;
      return out;
    }
    u -= lg.walk;
    if (u < lg.dwell) {
      out.x = lg.b.x; out.z = lg.b.z; out.heading = lerpAng(lg.dir, lg.face, Math.min(1, u / 0.5));
      out.moving = false; out.act = lg.b.act; out.dist = 0;
      return out;
    }
    u -= lg.dwell;
  }
  out.x = sp.path[0].x; out.z = sp.path[0].z; out.heading = 0; out.moving = false; out.act = null;
  return out;
}

export class Dollhouse {
  constructor(world, city, people, scene) {
    Object.assign(this, { world, city, people, scene });
    this.building = null;
    this.floor = 0;
    this.group = null;
    this.units = new Map(); // sakin indeksi -> daire (odalar, noktalar)
    this.workSpots = new Map(); // sakin indeksi -> iş yerindeki çalışma noktası
    this.tvs = [];
    this.lights = [];
    this.pets = [];
  }

  isOpen() {
    return !!this.building;
  }

  open(b, floor) {
    this.close();
    this.building = b;
    // icKat: içi gezilen kat sayısı (cami tek kat harim: kubbeli dış hacim iki kat yüksekliğinde).
    this.floor = Math.max(0, Math.min((b.icKat ?? b.floors) - 1, floor));
    this.city.setHidden(b, true);
    this.group = new THREE.Group();
    // Alt katlar: normal bina, çatısız.
    if (this.floor > 0) {
      const K = makeKit();
      drawBuilding(K, b, this.floor);
      this.group.add(buildKit(K));
    }
    if (b.daireler) this._buildFloor(b, this.floor);
    else this._buildWork(b, this.floor);
    this.scene.add(this.group);
  }

  setFloor(floor) {
    if (this.building) this.open(this.building, floor);
  }

  /** Açık iç mekânı yeniden çizer (sakin evinin rengini değiştirince). */
  rebuild() {
    if (this.building) this.open(this.building, this.floor);
  }

  close() {
    if (!this.building) return;
    this.city.setHidden(this.building, false);
    this.scene.remove(this.group);
    this.group.traverse((o) => o.geometry?.dispose?.());
    this.building = null;
    this.group = null;
    this.units.clear();
    this.workSpots.clear();
    this.guests = [];
    this.tvs = [];
    this.lights = [];
    this.pets = [];
  }

  /** Kamera için: açık katın ortası ve binanın önü. */
  focus() {
    const b = this.building;
    const y = this.floor * FLOOR_H + 1.2;
    const c = local(b, 0, y, 1).clone();
    const front = local(b, 0, y, 30).clone().sub(local(b, 0, y, 0).clone()).normalize();
    return { target: c, front };
  }

  /** Binanın yerel koordinatlarında kutu ekleyen yardımcı (opts.geo verilirse o geometri, tabanı ortalanmaz). */
  _adder(b, y0) {
    const g = this.group;
    return (w, h, d, lx, ly, lz, color, rot = 0, opts = {}) => {
      const geo = opts.geo ?? new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, opts.material ?? std(color, opts.mat));
      mesh.position.copy(local(b, lx, y0 + ly + (opts.geo ? 0 : h / 2), lz));
      mesh.rotation.y = b.rot + rot;
      mesh.castShadow = opts.shadow ?? true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
  }

  /** x boyunca uzanan duvar (z sabit), kapı boşluklarıyla. gaps: [[merkez, genişlik]]. */
  _wallX(add, a, b2, z, h, color, gaps = []) {
    let x = a;
    for (const [c, w] of [...gaps].sort((p, q) => p[0] - q[0])) {
      const g0 = c - w / 2, g1 = c + w / 2;
      if (g0 - x > 0.05) add(g0 - x, h, 0.12, (x + g0) / 2, 0, z, color);
      x = Math.max(x, g1);
    }
    if (b2 - x > 0.05) add(b2 - x, h, 0.12, (x + b2) / 2, 0, z, color);
  }

  /** z boyunca uzanan duvar (x sabit), kapı boşluklarıyla. */
  _wallZ(add, a, b2, x, h, color, gaps = []) {
    let z = a;
    for (const [c, w] of [...gaps].sort((p, q) => p[0] - q[0])) {
      const g0 = c - w / 2, g1 = c + w / 2;
      if (g0 - z > 0.05) add(0.12, h, g0 - z, x, 0, (z + g0) / 2, color);
      z = Math.max(z, g1);
    }
    if (b2 - z > 0.05) add(0.12, h, b2 - z, x, 0, (z + b2) / 2, color);
  }

  _shell(b, add) {
    const hd = b.d / 2;
    add(b.w + 0.3, 0.25, b.d + 0.3, 0, -0.25, 0, "#d6d0c6");
    add(b.w + 0.3, WALL_H, 0.25, 0, 0, -hd, b.wall);
    add(0.25, WALL_H, b.d + 0.3, -b.w / 2, 0, 0, b.wall);
    add(0.25, WALL_H, b.d + 0.3, b.w / 2, 0, 0, b.wall);
    add(b.w + 0.3, CUT, 0.25, 0, 0, hd, b.wall);
  }

  _buildFloor(b, f) {
    const add = this._adder(b, f * FLOOR_H);
    const plan = unitLayout(b);
    const hd = b.d / 2;
    const zf = hd - 0.15;
    const zb = plan.corridor ? -hd + 0.15 + plan.corridorDepth : -hd + 0.15;
    this._shell(b, add);
    this._buildCore(b, f, add, plan, zb);
    if (plan.corridor) {
      // Ortak koridor: arkada boydan boya; dairelerin kapıları koridor duvarında.
      add(b.w - 0.3, 0.06, plan.corridorDepth, 0, 0, -hd + 0.15 + plan.corridorDepth / 2, "#d9d4ca", 0, { shadow: false });
      const gaps = plan.units.map((u) => [u.cx, DOOR]).concat([[0, 2.4]]);
      this._wallX(add, -b.w / 2, b.w / 2, zb, CUT, "#ece6da", gaps);
      for (let x = -b.w / 2 + 2; x < b.w / 2 - 1; x += 4) {
        add(0.3, 0.05, 0.3, x, WALL_H - 0.08, -hd + 0.15 + plan.corridorDepth / 2, "#fff6e0", 0, { mat: { emissive: "#fff1d0", emissiveIntensity: 0.5 }, shadow: false });
      }
    }
    // Daireler arası duvarlar (çekirdeğe ve dış duvara denk gelmeyen sınırlar).
    for (const u of plan.units) {
      if (u.x1 < b.w / 2 - 0.2 && Math.abs(u.x1) > 1.3) this._wallZ(add, zb, zf, u.x1, CUT, "#e9e3d8");
    }
    for (const unit of plan.units) {
      const k = f * b.perFloor + unit.col;
      if (k >= b.daireler) continue;
      this._buildUnit(b, f, add, plan, unit, b.slot0 + k, zb, zf);
    }
  }

  /** Merdiven (iki kol ve sahanlık), asansör, giriş katında posta kutuları ve paspas. */
  _buildCore(b, f, add, plan, zb) {
    const hd = b.d / 2;
    const [cx0, cx1] = plan.core;
    // Çekirdek duvarları; koridor yoksa daire kapıları bu duvarlarda.
    for (const x of [cx0, cx1]) this._wallZ(add, zb, hd - 0.15, x, CUT, "#ece6da", plan.corridor ? [] : [[1.6, DOOR]]);
    add(cx1 - cx0 - 0.1, 0.06, hd - 0.15 - zb, 0, 0, (zb + hd - 0.15) / 2, "#cfc8bc", 0, { shadow: false });
    // Merdiven: sol kol arkaya doğru yarım kata çıkar, sahanlık, sağ kol öne doğru üst kata (stairs.js).
    doubleStair(add, { xa: -0.6, xb: 0.6, zFront: 0.6, zBack: zb + 1.0, land: 0.85, H: FLOOR_H, upper: f < b.floors - 1 });
    // Asansör yalnız 4 ve daha çok katlı apartmanda (yönetmelik gibi); 3 katlıda o köşede saksı.
    const ez0 = 2.4, ez1 = Math.min(hd - 0.3, 4.2);
    if (b.floors < 4) {
      add(0.45, 0.4, 0.45, 0.5, 0.06, (ez0 + ez1) / 2, "#b5653f");
      add(0.7, 0.8, 0.7, 0.5, 0.85, (ez0 + ez1) / 2, "#5f8f4a", 0, { geo: new THREE.IcosahedronGeometry(0.4, 0) });
    }
    const steel = { metalness: 0.4, roughness: 0.4 };
    if (b.floors >= 4) {
      // Kuyu duvarları da kesik (içerisi görünsün); kapı kasası ve kat göstergesi tam boy.
      add(1.7, CUT, 0.1, 0, 0, ez1, "#9aa3ad", 0, { mat: steel });
      for (const x of [-0.85, 0.85]) add(0.1, CUT, ez1 - ez0, x, 0, (ez0 + ez1) / 2, "#9aa3ad", 0, { mat: steel });
      for (const x of [-0.82, 0.82]) add(0.08, 2.3, 0.12, x, 0, ez0, "#9aa3ad", 0, { mat: steel, shadow: false });
      add(1.72, 0.1, 0.12, 0, 2.25, ez0, "#9aa3ad", 0, { mat: steel, shadow: false });
      for (const x of [-0.38, 0.38]) add(0.74, CUT + 0.2, 0.05, x, 0.06, ez0, "#c9ced4", 0, { mat: { metalness: 0.7, roughness: 0.25 } });
      add(0.6, 0.02, 1.3, 0, 0.06, (ez0 + ez1) / 2, "#5a5f66", 0, { shadow: false });
      add(0.12, 0.25, 0.04, 1.0, 1.0, ez0 - 0.06, "#2a2a2e");
      add(0.3, 0.08, 0.03, 0, 2.38, ez0 - 0.07, null, 0, { material: new THREE.MeshBasicMaterial({ color: "#5fe08a", toneMapped: false }), shadow: false });
    }
    if (f === 0) {
      add(1.4, 0.02, 0.9, 0, 0.06, hd - 0.7, "#6b4a35", 0, { shadow: false });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
        add(0.06, 0.2, 0.26, cx0 + 0.09, 1.1 + r * 0.22, 0.95 + c * 0.28, "#b8a06a", 0, { mat: { metalness: 0.5, roughness: 0.4 }, shadow: false });
      }
    }
  }

  /** Bir daire: odalar, kapı boşlukları, eşyalar ve sakinin kullanacağı noktalar. */
  _buildUnit(b, f, add, plan, unit, slot, zb, zf) {
    const key = slot * 7 + 3;
    const pick = (arr, tag) => arr[roll(key, tag) % arr.length];
    const { x0, x1, cx } = unit;
    const mirror = H(key, 1) < 0.5; // ana eşyalar hangi yan duvarda
    const A = mirror ? x1 : x0, B = mirror ? x0 : x1;
    const sA = mirror ? -1 : 1; // A duvarından içeri yön
    // Doğrulanmış sakin kendi evinin duvar ve koltuk rengini seçebilir (tercih.js).
    const pref = prefFor(slot);
    const paint = pref?.duvar ?? pick(PAINTS, "boya");
    const wood = pick(WOODS, "ahsap");
    const floorCol = pick(FLOORS, "parke");

    // Planı derinliğe yay.
    const tpl = PLANS[Math.floor(H(key, 2) * PLANS.length)];
    const total = tpl.reduce((t, [, l]) => t + l, 0);
    const D = zf - zb;
    const rooms = [];
    let z = zf;
    for (const [kind, l] of tpl) {
      const depth = (l / total) * D;
      rooms.push({ kind, z1: z, z0: z - depth });
      z -= depth;
    }
    const floorOf = (k) => (k === "banyo" ? "#dfe6ea" : k === "mutfak" ? "#d8d0c2" : floorCol);
    for (const r of rooms) add(x1 - x0 - 0.14, 0.06, r.z1 - r.z0 - 0.08, cx, 0, (r.z0 + r.z1) / 2, floorOf(r.kind), 0, { shadow: false });
    // Odalar arası duvarlar, ortada kapı boşluğu ve kasası.
    for (let i = 1; i < rooms.length; i++) {
      this._wallX(add, x0 + 0.08, x1 - 0.08, rooms[i].z1, CUT, paint, [[cx, DOOR]]);
      for (const e of [-1, 1]) add(0.07, 2.1, 0.16, cx + e * (DOOR / 2 + 0.035), 0, rooms[i].z1, wood, 0, { shadow: false });
      add(DOOR + 0.14, 0.08, 0.16, cx, 2.1, rooms[i].z1, wood, 0, { shadow: false });
    }
    // Daire kapısı: koridor varsa arka duvarda (ortada), yoksa çekirdek duvarında.
    const coreX = unit.side < 0 ? x1 : x0;
    const entry = plan.corridor ? [cx, zb + 0.6] : [coreX - unit.side * 0.6, 1.6];
    if (plan.corridor) add(0.05, 2.1, DOOR, cx - DOOR / 2, 0, zb + DOOR / 2, "#6b4a35", 0, { shadow: false });
    else add(DOOR, 2.1, 0.05, coreX - unit.side * DOOR / 2, 0, 1.6 + DOOR / 2, "#6b4a35", 0, { shadow: false });

    const spots = { entry: { p: entry, heading: 0 } };
    const occupant = this.people.slotToIndex.get(slot);
    const job = occupant != null ? this.people.works[occupant].job : "";
    const ctx = { x0, x1, cx, A, B, sA, wood, pick, spots, job, key, pref };
    for (const r of rooms) this._furnish(add, r, ctx);

    // Evcil hayvan.
    const animal = occupant != null ? pet(this.people.residents[occupant], this.people.day) : "";
    if (animal) {
      const pt = this._pet(add, animal, spots, key);
      if (pt) this.pets.push(pt);
    }

    const lamp = new THREE.PointLight("#ffd9a0", 0, 10, 1.6);
    lamp.position.copy(local(b, cx, f * FLOOR_H + 2.5, (zb + zf) / 2));
    this.group.add(lamp);
    this.lights.push({ lamp, slot });
    if (spots.tvMat) this.tvs.push({ mat: spots.tvMat, slot });
    if (occupant != null) {
      const toWorld = (q) => local(b, q[0], 0, q[1]).clone();
      const conv = {};
      for (const [k, sp] of Object.entries(spots)) {
        if (!sp?.p) continue;
        conv[k] = { ...sp, w: toWorld(sp.p), heading: b.rot + (sp.heading ?? 0) };
      }
      this.units.set(occupant, { spots: conv, cx, rooms, y0: FLAT_Y + f * FLOOR_H + 0.06, toWorld, rot: b.rot });
    }
  }

  /** Oda döşeme: türüne göre eşyalar; noktalar spots'a yazılır. Orta aks (cx ± 0,5) boş kalır. */
  _furnish(add, r, o) {
    const { A, B, sA, wood, pick, spots, pref } = o;
    const zc = (r.z0 + r.z1) / 2, dz = r.z1 - r.z0;
    const ax = (d) => A + sA * d; // A duvarından içeri d metre
    const bx = (d) => B - sA * d; // B duvarından içeri d metre
    const faceA = sA > 0 ? -Math.PI / 2 : Math.PI / 2; // A duvarına bakış
    const faceB = -faceA;
    switch (r.kind) {
      case "salon": case "acik": {
        const sofa = pref?.koltuk ?? pick(SOFAS, "koltuk");
        const sz = r.kind === "acik" ? r.z1 - 1.7 : zc;
        // Kanepe A duvarında, televizyon karşısında (B duvarı).
        add(0.9, 0.42, 2.1, ax(0.5), 0.06, sz, sofa);
        add(0.25, 0.5, 2.1, ax(0.15), 0.48, sz, sofa);
        for (const e of [-1, 1]) add(0.9, 0.22, 0.2, ax(0.5), 0.48, sz + e * 0.98, sofa);
        add(0.4, 0.06, 0.4, ax(0.6), 0.5, sz + 0.62, pick(["#e8c55a", "#f4f1ea", "#d98ca0"], "yastik"), 0.3, { shadow: false });
        add(1.5, 0.02, 2.0, ax(1.4), 0.06, sz, pick(RUGS, "hali"), 0, { shadow: false });
        add(0.5, 0.36, 0.9, ax(1.3), 0.06, sz, wood);
        add(0.4, 0.5, 1.6, bx(0.22), 0.06, sz, "#3f3a36");
        const tvMat = new THREE.MeshBasicMaterial({ color: "#1a1d22", toneMapped: false });
        add(0.05, 0.7, 1.2, bx(0.24), 0.75, sz, null, 0, { material: tvMat, shadow: false });
        spots.tvMat = tvMat;
        add(0.35, 0.8, 0.35, bx(0.3), 0.06, r.z1 - 0.45, "#6a8f5a");
        add(0.03, 0.6, 0.9, ax(0.03), 1.45, sz, pick(["#d98ca0", "#6f8fb5", "#e0b060", "#7aa37a"], "tablo"), 0, { shadow: false });
        add(0.04, 1.5, 0.04, ax(0.3), 0.06, sz - 1.35, "#3c4148");
        add(0.34, 0.3, 0.34, ax(0.3), 1.5, sz - 1.35, "#f3e3c0", 0, { mat: { emissive: "#ffd9a0", emissiveIntensity: 0.25 } });
        const facing = sA > 0 ? Math.PI / 2 : -Math.PI / 2;
        spots.sofa = { p: [ax(0.62), sz + 0.4], heading: facing, seat: 0.42 };
        spots.sofa2 = { p: [ax(0.62), sz - 0.4], heading: facing, seat: 0.42 };
        if (r.kind === "acik") {
          // Açık mutfak: salonun arka bölümünde B duvarında tezgâh, A tarafında yemek masası.
          const kz = r.z0 + 1.5;
          this._kitchenCounter(add, bx, kz, Math.min(2.4, dz * 0.4), spots, faceB);
          this._diningTable(add, ax(0.9), kz, o, spots);
        } else if (dz > 3.6) {
          // Kitaplık B duvarında, televizyonun önünde kalmayacak yerde.
          const bz = r.z0 + 0.7;
          add(0.32, 1.9, 1.0, bx(0.18), 0.06, bz, wood);
          for (let sh = 0; sh < 4; sh++) add(0.22, 0.32, 0.85, bx(0.2), 0.15 + sh * 0.45, bz, BOOKS[(sh + o.key) % 4], 0, { shadow: false });
        }
        break;
      }
      case "mutfak": {
        this._kitchenCounter(add, ax, zc, Math.min(2.8, dz - 0.5), spots, faceA);
        this._diningTable(add, bx(0.75), zc, o, spots);
        break;
      }
      case "banyo": {
        // Klozet ve duş A duvarında, lavabo ve ayna B duvarında.
        add(0.4, 0.42, 0.55, ax(0.3), 0.06, r.z1 - 0.45, "#f6f6f4");
        add(0.4, 0.35, 0.18, ax(0.1), 0.48, r.z1 - 0.45, "#f6f6f4");
        add(0.45, 0.82, 0.5, bx(0.25), 0.06, zc, "#f6f6f4");
        add(0.03, 0.6, 0.5, bx(0.02), 1.3, zc, "#cfe3ee", 0, { mat: { roughness: 0.05, metalness: 0.6 }, shadow: false });
        add(0.9, 0.06, 0.85, ax(0.5), 0.06, r.z0 + 0.5, "#e9eef0");
        add(0.02, 1.8, 0.85, ax(0.97), 0.12, r.z0 + 0.5, "#cfe3ee", 0, { mat: { transparent: true, opacity: 0.35 }, shadow: false });
        add(0.06, 0.04, 0.5, bx(0.05), 1.15, zc + 0.55, "#c9ced4", 0, { mat: { metalness: 0.7 }, shadow: false });
        add(0.05, 0.4, 0.35, bx(0.08), 0.8, zc + 0.55, pick(["#f4f1ea", "#9fc3d8", "#e8b9a8"], "havlu"), 0, { shadow: false });
        spots.sink = { p: [bx(0.7), zc], heading: faceB };
        break;
      }
      case "yatak": {
        // Yatak başı arka duvarda (A yarısında), gardırop B duvarında.
        const bxw = ax(0.95), bz = r.z0 + 1.1;
        add(1.6, 0.35, 2.05, bxw, 0.06, bz, wood);
        add(1.55, 0.2, 2.0, bxw, 0.41, bz, "#f6f3ee");
        add(1.6, 0.9, 0.08, bxw, 0.06, r.z0 + 0.06, wood);
        for (const e of [-0.38, 0.38]) add(0.55, 0.12, 0.35, bxw + e, 0.61, r.z0 + 0.3, "#ffffff");
        const duvetColor = pick(DUVETS, "yorgan");
        const duvet = add(1.62, 0.1, 1.35, bxw, 0.62, bz + 0.32, duvetColor);
        // Uyurken ayrı yorgan: bedeni örter, ortası kabarık, kenarlardan ve ayak ucundan yatağın yanlarına
        // sarkar. Yatan bedenin en yüksek noktası (ayak ucu ~0,87 m, göğüs ve kemer ~0,79 m) üst yüzün
        // altında kalır, yüzeyler çakışmaz; baş ucunda çene hizasına alçalır, baş ve omuz başı yastıkta görünür.
        const c0 = bz - 0.52, c1 = bz + 1.06, cl = c1 - c0;
        const cover = new THREE.BoxGeometry(1.66, 1, cl, 12, 1, 10);
        const cp = cover.attributes.position;
        for (let k = 0; k < cp.count; k++) {
          if (cp.getY(k) < 0) { cp.setY(k, 0.45); continue; }
          const x = cp.getX(k), along = cp.getZ(k) + cl / 2; // 0: baş ucu
          const hump = Math.abs(x) < 0.62 ? Math.cos((Math.PI * x) / 1.24) ** 2 : 0; // kollar da altında
          const edge = Math.max(0, Math.abs(x) - 0.72) * 0.9; // kenara doğru hafif düşüş
          cp.setY(k, 0.67 + 0.27 * hump * Math.min(1, 0.7 + along / 0.75) - edge);
        }
        cover.computeVertexNormals();
        const covered = add(0, 0, 0, bxw, 0, c0 + cl / 2, duvetColor, 0, { geo: cover });
        covered.visible = false;
        add(0.4, 0.5, 0.38, ax(2.0), 0.06, r.z0 + 0.3, wood);
        add(0.16, 0.25, 0.16, ax(2.0), 0.56, r.z0 + 0.3, "#f3e3c0", 0, { mat: { emissive: "#ffd9a0", emissiveIntensity: 0.2 } });
        const wl = Math.min(1.6, dz - 0.6);
        add(0.6, 2.1, wl, bx(0.32), 0.06, r.z1 - wl / 2 - 0.3, "#e9e2d6");
        add(0.02, 1.9, 0.02, bx(0.63), 0.15, r.z1 - wl / 2 - 0.3, "#8a8f96", 0, { shadow: false });
        add(1.4, 0.02, 0.8, bxw, 0.06, Math.min(bz + 1.5, r.z1 - 0.5), pick(RUGS, "hali2"), 0, { shadow: false });
        spots.bed = { p: [bxw, bz + 0.95], heading: 0, top: 0.63, duvet, covered };
        spots.wardrobe = { p: [bx(1.05), r.z1 - wl / 2 - 0.3], heading: faceB };
        break;
      }
      case "calisma": {
        // Çalışma masası A duvarında (bilgisayar ya da şövale mesleğe göre), kitaplık B duvarında.
        add(0.7, 0.05, 1.3, ax(0.35), 0.72, zc, wood);
        for (const e of [-0.6, 0.6]) add(0.05, 0.7, 0.05, ax(0.35), 0.02, zc + e, "#3c4148", 0, { shadow: false });
        if (["ressam", "seramikci"].includes(o.job)) {
          add(0.05, 1.6, 0.05, ax(0.6), 0.06, zc - 1.0, "#8a6a4a");
          add(0.03, 0.55, 0.7, ax(0.62), 1.15, zc - 1.0, "#f4efe4", 0, { shadow: false });
        }
        add(0.03, 0.38, 0.6, ax(0.12), 0.95, zc, null, 0, { material: new THREE.MeshBasicMaterial({ color: "#7fb0e0", toneMapped: false }), shadow: false });
        add(0.45, 0.05, 0.45, ax(0.95), 0.45, zc, "#2f3540");
        add(0.45, 0.5, 0.05, ax(1.17), 0.5, zc, "#2f3540", Math.PI / 2);
        add(0.04, 0.42, 0.04, ax(0.95), 0.02, zc, "#3c4148", 0, { shadow: false });
        const bl = Math.min(1.6, dz - 0.4);
        add(0.32, 1.9, bl, bx(0.18), 0.06, zc, wood);
        for (let sh = 0; sh < 4; sh++) add(0.22, 0.32, bl - 0.15, bx(0.2), 0.15 + sh * 0.45, zc, BOOKS[(sh + o.key) % 4], 0, { shadow: false });
        spots.desk = { p: [ax(0.95), zc], heading: faceA, seat: 0.47 };
        break;
      }
    }
  }

  _kitchenCounter(add, wallX, zc, len, spots, faceWall) {
    // Duvar boyunca tezgâh: eviye, ocak ve davlumbaz; ucunda buzdolabı; üstte dolaplar.
    add(0.62, 0.9, len, wallX(0.31), 0.06, zc, "#f2efe9");
    add(0.66, 0.05, len + 0.04, wallX(0.33), 0.96, zc, "#5b5f66");
    add(0.4, 0.02, 0.5, wallX(0.33), 1.0, zc - len * 0.25, "#b9c2cc", 0, { shadow: false });
    add(0.5, 0.02, 0.6, wallX(0.33), 1.0, zc + len * 0.2, "#222222", 0, { shadow: false });
    add(0.45, 0.3, 0.6, wallX(0.23), 1.75, zc + len * 0.2, "#c9ced4", 0, { mat: { metalness: 0.5 } });
    add(0.35, 0.6, len * 0.45, wallX(0.18), 1.55, zc - len * 0.25, "#ebe6dd");
    add(0.68, 1.9, 0.7, wallX(0.34), 0.06, zc - len / 2 - 0.4, "#e6e9ec");
    spots.stove = { p: [wallX(0.95), zc + len * 0.2], heading: faceWall };
  }

  _diningTable(add, tx, zc, o, spots) {
    add(0.8, 0.05, 1.2, tx, 0.72, zc, o.wood);
    for (const [dx, dz] of [[-0.32, -0.52], [0.32, -0.52], [-0.32, 0.52], [0.32, 0.52]]) add(0.05, 0.7, 0.05, tx + dx, 0.02, zc + dz, "#3c4148", 0, { shadow: false });
    // İki sandalye (masanın uçlarında), dört ayaklı, arkalıklı.
    for (const e of [-1, 1]) {
      const sz = zc + e * 0.85;
      add(0.42, 0.05, 0.42, tx, 0.43, sz, o.wood);
      add(0.42, 0.45, 0.04, tx, 0.48, sz + e * 0.19, o.wood);
      for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) add(0.03, 0.42, 0.03, tx + dx, 0.01, sz + dz, "#3c4148", 0, { shadow: false });
    }
    add(0.3, 0.1, 0.3, tx, 0.77, zc, "#f4f1ea", 0, { shadow: false });
    spots.chair = { p: [tx, zc - 0.85], heading: 0, seat: 0.45 };
    spots.chair2 = { p: [tx, zc + 0.85], heading: Math.PI, seat: 0.45 };
  }

  _pet(add, animal, spots, key) {
    const t = H(key, 9);
    const base = spots.sofa?.p ?? spots.desk?.p ?? [0, 0];
    if (animal === "Cat" || animal === "Dog") {
      const cat = animal === "Cat";
      const col = (cat ? ["#e0a050", "#3a3533", "#f2f0ea", "#8a8a8a"] : ["#8a5a32", "#2b2622", "#e8dcc4", "#c9954f"])[Math.floor(t * 4)];
      const body = add(0, 0, 0, 0, 0, 0, col, 0, { geo: cat ? new THREE.SphereGeometry(0.17, 10, 8).scale(0.75, 0.7, 1.35) : new THREE.CapsuleGeometry(0.14, 0.42, 4, 8).rotateX(Math.PI / 2) });
      const head = add(0, 0, 0, 0, 0, 0, col, 0, { geo: new THREE.SphereGeometry(cat ? 0.1 : 0.12, 8, 6) });
      if (!cat) add(0.8, 0.08, 0.6, base[0] + (spots.sofa?.heading > 0 ? 1.6 : -1.6), 0.06, base[1] + 1.2, "#8a5a32", 0, { shadow: false });
      return { kind: cat ? "kedi" : "kopek", body, head, base, facing: spots.sofa?.heading ?? 0, ph: t * 40 };
    }
    if (animal === "Parrot") {
      add(0.4, 0.55, 0.4, base[0], 1.0, base[1] - 1.6, "#cfd6de", 0, { mat: { metalness: 0.6, wireframe: true } });
      add(0.03, 1.0, 0.03, base[0], 0.06, base[1] - 1.6, "#3c4148", 0, { shadow: false });
      const bird = add(0.12, 0.22, 0.1, base[0], 1.15, base[1] - 1.6, "#3fa34d");
      return { kind: "papagan", body: bird, base, ph: t * 40 };
    }
    add(0.7, 0.35, 0.45, base[0], 0.06, base[1] + 1.8, "#cfe3ee", 0, { mat: { transparent: true, opacity: 0.5 } });
    add(0.25, 0.1, 0.3, base[0], 0.1, base[1] + 1.8, "#6f7d4a");
    return null;
  }

  /** Bu sakin açık katta mı (evinde ya da işinde)? */
  contains(i) {
    return this.units.has(i) || this.workSpots.has(i);
  }

  /** Etkinlik → dairedeki nokta. */
  _spotFor(u, act, seed) {
    const s = u.spots;
    switch (act) {
      case "uyku": return s.bed;
      case "hazirlik": return seed % 2 ? s.sink : s.wardrobe ?? s.sink;
      case "kahvalti": case "aksam_yemegi": return s.chair;
      case "yemek_yapma": return s.stove;
      case "kitap": case "telefon": return (seed % 3 === 0 && s.desk) || s.sofa;
      case "calisma": return s.desk ?? s.chair2 ?? s.chair;
      case "temizlik": return null;
      default: return seed % 2 ? s.sofa : s.sofa2 ?? s.sofa;
    }
  }

  /** Evdeki sakinin duruşu: o anki etkinliğin noktasında; etkinlik yeni başladıysa orta akstan oraya yürür. */
  pose(i, seg, minute, time, p) {
    const u = this.units.get(i);
    if (!u || (seg.ne !== "ev" && seg.ne !== "uyku")) return false;
    const r = this.people.residents[i];
    const day = this.people.day;
    const hob = this.people.hobbies[i].id;
    const hw = !!this.people.homeWork?.[i];
    const act = homeActivity(r.seed, seg, minute, day, hob, hw);
    const k = p.height / 1.75;
    const ph = (r.seed % 1000) / 159;
    resetPose(p);
    p.activity = act;
    p.radius = 0;
    // Etkinliğin başladığı an ve önceki etkinlik (eve yeni geldiyse kapı).
    let start = minute, prevAct = null;
    for (let m = minute - 0.25; m >= Math.max(seg.bas, minute - 30); m -= 0.25) {
      const a = homeActivity(r.seed, seg, m, day, hob, hw);
      if (a !== act) { prevAct = a; break; }
      start = m;
    }
    if (!prevAct && start - seg.bas < 0.26 && seg.ne === "ev") prevAct = "kapi";
    const dest = this._spotFor(u, act, r.seed);
    const from = prevAct === "kapi" ? u.spots.entry : prevAct ? this._spotFor(u, prevAct, r.seed) : null;
    const walkAlong = (path, el) => {
      let d = el, j = 1;
      const len = (a, c) => Math.hypot(c[0] - a[0], c[1] - a[1]);
      while (j < path.length - 1 && d > len(path[j - 1], path[j])) { d -= len(path[j - 1], path[j]); j++; }
      const a = path[j - 1], c = path[j];
      const L = len(a, c) || 1;
      const q = [a[0] + ((c[0] - a[0]) * d) / L, a[1] + ((c[1] - a[1]) * d) / L];
      const w = u.toWorld(q), w2 = u.toWorld(c);
      p.x = w.x; p.z = w.z; p.y = u.y0;
      if (Math.hypot(w2.x - w.x, w2.z - w.z) > 0.01) p.heading = Math.atan2(w2.x - w.x, w2.z - w.z);
      walkPose(p, (el / (0.72 * k)) * Math.PI);
      p.moving = false;
    };
    // Bir noktadan ötekine: önce orta aksa çıkar, aks boyunca yürür, sonra hedefe döner.
    if (dest && from && from !== dest) {
      const path = [from.p, [u.cx, from.p[1]], [u.cx, dest.p[1]], dest.p];
      let L = 0;
      for (let j = 1; j < path.length; j++) L += Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1]);
      const el = (minute - start) * 60;
      if (el < L) {
        p.heading = 0;
        walkAlong(path, el);
        return true;
      }
    }
    if (!dest) {
      // Ev toplama: aks boyunca odadan odaya gidip gelir, elinde süpürge sallar.
      const z0 = u.rooms[u.rooms.length - 1].z0 + 0.8, z1 = u.rooms[0].z1 - 0.8;
      const L = Math.max(1, z1 - z0);
      let d = (time * 0.5 + ph * 3) % (2 * L);
      const back = d > L;
      if (back) d = 2 * L - d;
      const a = [u.cx, z0 + d];
      walkAlong([a, [u.cx, a[1] + (back ? -0.5 : 0.5)]], 0);
      walkPose(p, ((time * 0.5) / (0.72 * k)) * Math.PI);
      p.moving = false;
      p.shR = 0.9; p.elR = 0.4 + 0.3 * Math.sin(time * 4); p.lean = 0.2;
      return true;
    }
    p.x = dest.w.x; p.z = dest.w.z; p.y = u.y0; p.heading = dest.heading;
    switch (act) {
      case "uyku":
        p.y = u.y0 + dest.top + 0.05;
        p.lie = Math.PI / 2;
        p.kneeL = p.kneeR = 0.15; p.shL = p.shR = 0.05;
        p.headYaw = 0.4 * Math.sin(ph);
        break;
      case "kahvalti": case "aksam_yemegi": {
        sitPose(p, u.y0 + dest.seat, k);
        const bite = Math.max(0, Math.sin(time * 0.9 + ph)) ** 4;
        p.lean = 0.12; p.shL = 0.6; p.elL = 1.3; p.shR = 0.6 + 0.5 * bite; p.elR = 1.3 + 0.9 * bite; p.headPitch = 0.2;
        break;
      }
      case "yemek_yapma": {
        // Ocakla eviye arasında yarım adım gidip gelir, doğrar, karıştırır.
        const sway = Math.sin(time * 0.35 + ph) * 0.35;
        p.x += Math.sin(dest.heading + Math.PI / 2) * sway; p.z += Math.cos(dest.heading + Math.PI / 2) * sway;
        const chop = Math.sin(time * 5 + ph);
        p.shL = 0.75; p.elL = 1.2; p.shR = 0.8 + 0.15 * chop; p.elR = 1.0 - 0.2 * chop; p.lean = 0.12; p.headPitch = 0.35;
        break;
      }
      case "hazirlik":
        idleGesture(p, time, ph, false);
        if (dest === u.spots.sink) { p.shL = p.shR = 1.1; p.elL = p.elR = 1.9 + 0.15 * Math.sin(time * 6); p.headPitch = 0.1; }
        else { p.shR = 1.0 + 0.3 * Math.sin(time * 1.3 + ph); p.elR = 0.6; }
        break;
      default: {
        // Kanepede ya da çalışma masasında oturur.
        sitPose(p, u.y0 + (dest.seat ?? 0.42), k);
        const atDesk = dest === u.spots.desk;
        p.lean = atDesk ? 0.15 : -0.18;
        if (act === "telefon") { phonePose(p); p.props = ["telefon"]; }
        else if (act === "kitap") { p.shL = p.shR = 0.7; p.elL = p.elR = 1.5; p.headPitch = 0.45; p.props = ["kitap"]; }
        else if (act === "dinlenme") { p.shL = p.shR = 0.2; p.elL = p.elR = 0.6; p.headPitch = -0.15; }
        else if (atDesk || act === "calisma") { p.shL = p.shR = 0.75; p.elL = p.elR = 1.35 + 0.08 * Math.sin(time * 9); p.lean = 0.15; p.headPitch = 0.25 + 0.1 * Math.sin(time * 0.2); }
      }
    }
    if (u.spots.bed?.duvet) { u.spots.bed.duvet.visible = act !== "uyku"; u.spots.bed.covered.visible = act === "uyku"; }
    return true;
  }

  // --- iş yerleri ---

  /** İş yeri katı: kabuk, türüne göre döşeme ve o katta çalışanların noktaları. */
  /**
   * Zemin katın döşeme yüksekliği: bina tabanı (FLAT_Y) çevredeki eğimli zeminden ya da avlu taşından alçakta
   * kalabilir (iskele, ambar, tersane, kıyı kulübeleri, cami avlusu); döşeme en yüksek zeminin üstüne çıkar,
   * yoksa toprak ve taş içeriyi örter.
   */
  _lift(b) {
    let top = FLAT_Y;
    for (const [fx, fz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const p = local(b, fx * (b.w / 2 - 0.4), 0, fz * (b.d / 2 - 0.4));
      top = Math.max(top, this.world.groundY(p.x, p.z));
    }
    return Math.max(0.1, top - FLAT_Y + 0.08);
  }

  _buildWork(b, f) {
    const y0 = f * FLOOR_H + (f === 0 ? this._lift(b) : 0);
    const add = this._adder(b, y0);
    this._shell(b, add);
    // Nokta (ve varsa duraklı turu: [[x, z, bekleme, iş, bakılanX, bakılanZ], ...]) yerelden dünyaya.
    const W = (lx, lz) => { const q = local(b, lx, 0, lz); return { x: q.x, z: q.z }; };
    const spots = buildWorkInterior(b, f, add, (lx, lz, heading, type, path) => ({
      p: local(b, lx, 0, lz).clone(), heading: b.rot + heading, type, y: FLAT_Y + y0 + 0.06,
      ...(path ? { path: path.map(([x, z, dwell = 0, act = "look", fx, fz]) => ({ ...W(x, z), dwell, act, ...(fx != null ? (({ x: X, z: Z }) => ({ fx: X, fz: Z }))(W(fx, fz)) : {}) })) } : {}),
    }));
    this.guests = spots.guests ?? [];
    for (const lx of [-b.w / 4, b.w / 4]) {
      const lamp = new THREE.PointLight("#fff1d8", 0, 12, 1.4);
      lamp.position.copy(local(b, lx, y0 + 2.6, 0));
      this.group.add(lamp);
      this.lights.push({ lamp, work: true });
    }
    // Bu iş yerinde çalışanlar: katlara dağılır, kattaki noktalara sırayla yerleşir.
    const people = this.people;
    const here = [];
    for (let i = 0; i < people.n; i++) {
      if (people.works[i].loc?.building !== b) continue;
      if (roll(people.residents[i].seed, "kat") % b.floors !== f) continue;
      here.push(i);
    }
    // Önce o an işte olanlar yerleşir (vardiyası olmayan bir yeri doldurmasın). Noktalardan fazla kişi
    // varsa, fazlası ön koridor şeridinde ikişer ikişer ayakta konuşur (sıra halinde dizilmezler).
    here.sort((a, c) => (this.people.activities[c]?.ne === "is") - (this.people.activities[a]?.ne === "is") || a - c);
    const hd = b.d / 2;
    here.forEach((i, n) => {
      if (n < spots.length) return this.workSpots.set(i, spots[n]);
      const e = n - spots.length;
      const x = -b.w / 2 + 1.5 + Math.floor(e / 2) * 2.6, z = hd - 0.9 + (e % 2 ? 0 : -0.75);
      if (x > b.w / 2 - 1) return; // yer yok: binanın başka bir yerinde
      this.workSpots.set(i, { p: local(b, x, 0, z).clone(), heading: b.rot + (e % 2 ? Math.PI : 0), type: "stand", y: FLAT_Y + y0 + 0.06 });
    });
    this.workName = Object.values(this.world.workplaces).flat().find((w) => w?.building === b)?.name ?? null;
  }

  /**
   * Sakin olmayan iç mekân kalabalığı: kafe, kahvehane ve fırında müşteriler (saate göre doluluk),
   * okulda ders saatinde sıralarda öğrenciler. Kimlikleri yok; yalnızca o kat açıkken çizilir.
   */
  addExtras(crowd, minute, time, day) {
    if (!this.building || !this.guests?.length) return;
    const kind = this.building.kind;
    const v = (this._extra ??= {});
    const dress = (seed, adult = true) => Object.assign(v, {
      style: seed % 2, skin: P.SKIN[seed % P.SKIN.length], hairColor: P.HAIR[(seed * 3) % P.HAIR.length],
      top: adult ? P.CLOTHES[(seed * 7) % P.CLOTHES.length] : SCHOOL_TOP[seed % 2], bottom: P.BOTTOMS[(seed * 5) % P.BOTTOMS.length],
      sleeves: seed % 3 !== 0, beard: adult && seed % 5 === 0, glasses: seed % 6 === 0,
    });
    const k = 1.75;
    if (kind === "okul") {
      const wd = (day + 3) % 7;
      const lesson = wd < 5 && !isHoliday(day) && minute >= 520 && minute < 920 && !(minute % 60 >= 50 || (minute >= 720 && minute < 760));
      if (!lesson) return;
      this.guests.forEach((g, n) => {
        if (!keepExtra(this.people.lively, n * 977 + 5)) return; // sınıflar nüfusla dolar
        resetPose(v); v.height = 1.2 + (n % 6) * 0.035; v.t = time;
        v.x = g.p.x; v.z = g.p.z; v.heading = g.heading;
        sitPose(v, g.y + 0.44, v.height / k);
        v.lean = 0.15; v.shL = v.shR = 0.6; v.elL = v.elR = 1.4;
        if ((n * 7 + Math.floor(time / 9)) % 23 === 0) { v.shR = 2.7; v.elR = 0.1; } // parmak kaldıran
        dress(n * 13 + 5, false);
        crowd.add(-1, v);
      });
      return;
    }
    if (!["kafe", "kahvehane", "firin", "bufe"].includes(kind)) return;
    // Doluluk: sabah kahvaltısı, öğle ve akşam üstü tepeleri; kapalı saatlerde boş.
    const h = minute / 60;
    if (h < 7 || h >= 22) return; // çalışanlarla birlikte kapanır
    const busy = 0.25 + 0.45 * Math.exp(-((h - 9) ** 2) / 2) + 0.4 * Math.exp(-((h - 13) ** 2) / 1.5) + 0.5 * Math.exp(-((h - 18.5) ** 2) / 3);
    const slot = Math.floor(minute / 25); // müşteriler 25 dakikada bir değişir
    this.guests.forEach((g, n) => {
      const seed = roll(n * 131 + this.building.x * 7, "musteri", slot);
      if ((seed % 100) / 100 > busy * this.people.lively) return; // müşteriler adanın nüfusundan
      resetPose(v); v.height = 1.6 + (seed % 7) * 0.04; v.t = time;
      v.x = g.p.x; v.z = g.p.z; v.heading = g.heading;
      sitPose(v, g.y + 0.44, v.height / k);
      const ph = seed % 10;
      const sip = Math.max(0, Math.sin(time * 0.35 + ph)) ** 10;
      idleGesture(v, time, ph, sip < 0.1 && seed % 2 === 0);
      v.shR = Math.max(v.shR, 0.5 + 0.9 * sip); v.elR = Math.max(v.elR, 1.2 + 1.0 * sip); v.lean = 0.12;
      if (kind === "kahvehane" && seed % 3 === 0) { v.shL = v.shR = 0.7; v.elL = v.elR = 1.3; v.lean = 0.3; v.headPitch = 0.45; } // tavla/okey
      dress(seed);
      crowd.add(-1, v);
    });
  }

  /** İşteki sakinin duruşu. */
  workPoseFor(i, seg, time, p) {
    const sp = this.workSpots.get(i);
    if (!sp || seg.ne !== "is") return false;
    resetPose(p);
    const r = this.people.residents[i];
    const ph = (r.seed % 1000) / 159;
    const k = p.height / 1.75;
    p.x = sp.p.x; p.z = sp.p.z; p.y = sp.y; p.heading = sp.heading;
    p.radius = 0;
    if (sp.path || sp.type === "waiter" || sp.type === "walk") {
      // Duraklı tur: noktalar arasında yürür (uçlarda hızlanıp yavaşlar), durakta işine döner ve işini yapar.
      // Rotası verilmemiş eski noktalar: yönüne dik iki uç arasında, uçlarda kısa duraklı.
      if (!sp.path) {
        const dx = Math.cos(sp.heading) * 2.2, dz = -Math.sin(sp.heading) * 2.2;
        sp.path = [{ x: sp.p.x - dx, z: sp.p.z - dz, dwell: 3, act: "look" }, { x: sp.p.x + dx, z: sp.p.z + dz, dwell: 3, act: "look" }];
      }
      const st = tourAt(sp, time + ph * 37, 0.95, this._tour ??= {});
      p.x = st.x; p.z = st.z; p.heading = st.heading;
      if (st.moving) {
        walkPose(p, (st.dist / (0.72 * k)) * Math.PI);
        if (sp.type === "waiter") { p.shR = 1.15; p.elR = 1.45; p.abR = 0.15; } // tepsi taşır
      } else {
        workPose(DWELL_POSE[st.act] ?? "stand", p, time, ph, sitPose, idleGesture, k);
        if (st.act === "serve") { p.shR = 0.9; p.elR = 1.2; p.lean = 0.12; p.headPitch = 0.25; }
        else if (st.act === "check") { p.lean = 0.25; p.shR = 0.6; p.elR = 1.3; p.headPitch = 0.45; }
        else if (st.act === "explain") { p.shR = 0.9 + 0.3 * Math.sin(time * 1.3 + ph); p.elR = 0.5; p.abR = 0.4; p.headYaw = 0.4 * Math.sin(time * 0.4 + ph); }
      }
      p.moving = false;
      return true;
    }
    workPose(sp.type, p, time, ph, sitPose, idleGesture, k);
    return true;
  }

  /** Işıklar, televizyon ve evcil hayvanlar. */
  update(night, time) {
    if (!this.building) return;
    const { people } = this;
    for (const l of this.lights) {
      if (l.work) { l.lamp.intensity = 8 + 18 * night; continue; }
      const i = people.slotToIndex.get(l.slot);
      const awake = i != null && people.athome[i] === 1 && people.homeActs?.[i] !== "uyku";
      l.lamp.intensity = awake ? 4 + 26 * night : 0;
    }
    for (const t of this.tvs) {
      const i = people.slotToIndex.get(t.slot);
      const on = i != null && people.homeActs?.[i] === "tv";
      if (on) t.mat.color.setHSL((Math.sin(time * 1.7 + t.slot) + 1) * 0.3, 0.5, 0.45 + 0.15 * Math.sin(time * 9 + t.slot));
      else t.mat.color.set("#1a1d22");
    }
    const b = this.building, y0 = this.floor * FLOOR_H;
    for (const pt of this.pets) {
      const T = time + pt.ph;
      if (pt.kind === "papagan") {
        // Tünekte sağa sola seker, arada kanat çırpar.
        const hop = Math.max(0, Math.sin(T * 1.3)) ** 6;
        pt.body.position.copy(local(b, pt.base[0] + 0.08 * Math.sin(T * 0.4), y0 + 1.26 + 0.05 * hop, pt.base[1] - 1.6));
        pt.body.scale.x = 1 + 1.2 * Math.max(0, Math.sin(T * 9)) * hop;
        continue;
      }
      // Sırayla: kanepede kıvrılıp uyur, oturur, odada dolaşır, yere uzanır.
      const cat = pt.kind === "kedi";
      const phase = Math.floor(T / 45) % 4;
      const inward = pt.facing > 0 ? 1 : -1;
      let lx = pt.base[0], lz = pt.base[1], ly = 0.06, yaw = 0.5, headUp = 0.1, len = 1;
      if (phase === 0) { ly = cat ? 0.58 : 0.06; lx += cat ? 0 : inward * 1.6; lz += cat ? -0.6 : 1.2; headUp = 0.0; len = 0.8; } // kıvrılmış
      else if (phase === 1) { lx += inward * 1.0; lz += 1.3; headUp = 0.28; yaw = -Math.PI / 2 * inward; len = 0.85; } // oturur
      else if (phase === 2) {
        // Dolaşır: oda içinde ileri geri.
        const d = Math.sin(T * 0.35) * 1.1;
        lx += inward * 1.2; lz += d;
        yaw = Math.cos(T * 0.35) > 0 ? 0 : Math.PI;
        headUp = 0.14;
      } else { lx += inward * 1.4; lz -= 0.3; headUp = 0.05; yaw = 1.2; len = 1.1; } // uzanır
      const w = local(b, lx, y0 + ly + (cat ? 0.13 : 0.16) * (phase === 0 ? 0.6 : 1), lz);
      pt.body.position.copy(w);
      pt.body.rotation.y = b.rot + yaw;
      pt.body.scale.set(1, phase === 0 ? 0.7 : 1, len);
      const step = phase === 2 ? 0.02 * Math.abs(Math.sin(T * 6)) : 0;
      pt.body.position.y += step;
      const fx = Math.sin(pt.body.rotation.y), fz = Math.cos(pt.body.rotation.y);
      const reach = (cat ? 0.2 : 0.3) * len;
      pt.head.position.set(w.x + fx * reach, w.y + headUp + (phase === 0 ? 0 : 0.06), w.z + fz * reach);
    }
  }
}
