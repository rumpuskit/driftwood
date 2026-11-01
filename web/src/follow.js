// Takip: kamera bir aracı ya da bir sakini izler.
//  - "harita": hedef ekranın ortasında kalır; yakınlaştırıp döndürmek takibi bozmaz, sürükleyince biter.
//  - "omuz": sakinin (ya da aracın) arkasından, üçüncü şahıs bakış. Kamera yönünü yavaşça hedefin
//    gidiş yönüne çevirir; sürükleyerek etrafına bakılır, tekerlek/sıkıştırma ile yaklaşılır.
//    Binalar kameranın önüne girerse kamera duvarın berisine çekilir (duvarın içinden bakılmaz).
import * as THREE from "three";
import { FLAT_Y, FLOOR_H } from "./world/layout.js";

const HEAD = { sakin: 1.55, car: 1.3, taxi: 1.3, bus: 2.8, ambulans: 2.2, itfaiye: 2.6, cop: 2.6, zeplin: 4 };
const BACK = { sakin: 3.6, car: 7, taxi: 7, bus: 13, ambulans: 9, itfaiye: 12, cop: 11, zeplin: 105 };
const ZOOM = { zeplin: [45, 260] }; // omuz görünümünde yaklaşma sınırları (varsayılan 1,6–40 m)
// Zeplin omuz görünümünde çapraz yandan izlenir (reklam alanı görünsün); kamera bu açıya döner.
const REST_YAW = { zeplin: 1.05 }, PITCH = { zeplin: 0.14 };

export class Follower {
  constructor({ camera, controls, world, people, traffic, zeplin = null }) {
    Object.assign(this, { camera, controls, world, people, traffic, zeplin });
    this.target = null; // {kind: "arac", key} | {kind: "sakin", i} | {kind: "zeplin"}
    this.view = "harita";
    this.t = 0;
    this.lastState = null;
    this.onHide = null; // sakin bir binaya girince/çıkınca (iç mekânı açmak için) çağrılır
    this._custom = {
      rotate: (dx, dy) => {
        const h = this.controls.dom.clientHeight || 700;
        this.yaw -= dx * (Math.PI / h) * 1.2;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * (Math.PI / h) * 0.8, -0.15, 1.2);
        this.userTurned = performance.now();
      },
      zoom: (f) => { const [lo, hi] = ZOOM[this._kind()] ?? [1.6, 40]; this.dist = THREE.MathUtils.clamp(this.dist * f, lo, hi); },
    };
  }

  get() {
    return this.target ? { ...this.target, view: this.view } : null;
  }

  /** yaklas: false, kamera başka bir uçuşla (iç mekân) yaklaşırken takip kendi yaklaşmasını yapmasın. */
  start(target, view = "harita", { yaklas = true } = {}) {
    this.target = target;
    this.view = view;
    this.t = 0;
    this.lastState = null;
    this.yaw = 0;
    this.pitch = 0.32;
    this.heading = null;
    const kind = this._kind();
    // Dikey ekranda (telefon) biraz daha geriden bakılır; kart ekranın altını kapatır.
    this.dist = (BACK[kind] ?? 4) * (innerWidth < innerHeight ? 1.6 : 1);
    this.pitch = PITCH[kind] ?? (innerWidth < innerHeight ? 0.42 : 0.32);
    this.yaw = REST_YAW[kind] ?? 0;
    this.controls.custom = view === "omuz" ? this._custom : null;
    this.controls.lockTarget = true;
    // Harita görünümünde uzaktan dokunulduysa hedefe yaklaşılır (sakin 40 m, araç 80 m); yakınsa olduğu gibi.
    const want = kind === "sakin" ? 40 : kind === "zeplin" ? 170 : 80;
    const cd = this.camera.position.distanceTo(this.controls.target);
    this.zoomTo = yaklas && view === "harita" && cd > want * 1.25 ? want : null;
  }

  stop() {
    this.target = null;
    this.controls.custom = null;
    this.controls.lockTarget = false;
  }

  _kind() {
    if (!this.target) return null;
    if (this.target.kind === "sakin" || this.target.kind === "zeplin") return this.target.kind;
    return this.traffic.active.get(this.target.key)?.kind ?? "car";
  }

  /** Hedefin şu anki yeri: {x, y, z, heading, hidden}; yoksa null (araç yolculuğunu bitirdi). */
  _point() {
    const T = this.target;
    if (T.kind === "zeplin") {
      const z = this.zeplin?.pose;
      return z?.visible ? { x: z.x, y: z.y, z: z.z, heading: z.heading, kind: "zeplin" } : null;
    }
    if (T.kind === "arac") {
      const v = this.traffic.active.get(T.key);
      if (!v) return null;
      const p = v.route.position(v.s);
      return { x: p.x, y: this.world.surfaceY(p.x, p.z), z: p.z, heading: p.heading, kind: v.kind };
    }
    const P = this.people, i = T.i;
    if (P.visible[i]) {
      const pose = P.poses[i];
      if (pose.inVehicle) {
        const v = this.traffic.active.get(pose.vehicleKey);
        if (v) {
          const p = v.route.position(v.s);
          return { x: p.x, y: this.world.surfaceY(p.x, p.z), z: p.z, heading: p.heading, kind: v.kind };
        }
      }
      return { x: P.positions[i * 3], y: pose.lie ? P.positions[i * 3 + 1] - 0.9 : P.positions[i * 3 + 1], z: P.positions[i * 3 + 2], heading: pose.heading, kind: "sakin", indoor: pose.indoor };
    }
    const [x, z] = P.focusPoint(i);
    return { x, y: this.world.groundY(x, z), z, heading: null, kind: "sakin", hidden: true };
  }

  /** Her kare. false dönerse takip bitmiştir. */
  update(dt) {
    if (!this.target) return true;
    const p = this._point();
    if (!p) { this.stop(); return false; }
    // Sakin evine/işine girip çıkınca: iç mekânı aç/kapa (görünür kalsın).
    if (this.target.kind === "sakin") {
      const ne = this.people.activities[this.target.i]?.ne ?? null;
      if (ne !== this.lastState) { this.lastState = ne; this.onHide?.(this.target.i); }
    }
    this.t = Math.min(1, this.t + dt / 0.35);
    const { controls, camera } = this;
    if (this.view === "harita") {
      // Hedef ekranın ortasında: ilk anda kısa bir süzülme, sonra kilit (gecikme yok).
      const k = this.t >= 1 ? 1 : 1 - Math.exp(-dt * 14);
      // Zeplin havada: hedef yüksekliğiyle birlikte izlenir.
      const d = new THREE.Vector3((p.x - controls.target.x) * k, p.kind === "zeplin" ? (p.y - controls.target.y) * k : 0, (p.z - controls.target.z) * k);
      controls.target.add(d); camera.position.add(d);
      if (this.zoomTo) {
        const cd = camera.position.distanceTo(controls.target);
        if (Math.abs(cd - this.zoomTo) < 1.5) this.zoomTo = null;
        else controls._zoom(Math.pow(this.zoomTo / cd, Math.min(1, dt * 3.5)));
      }
      return true;
    }
    // Omuz kamerası.
    const kind = p.kind;
    const head = new THREE.Vector3(p.x, p.y + (HEAD[kind] ?? 1.5), p.z);
    if (p.heading != null) {
      if (this.heading == null) this.heading = p.heading;
      // Kullanıcı az önce etrafına baktıysa bir süre kendi açısında kalır, sonra yavaşça arkaya döner.
      let dh = p.heading - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 2.5);
      const rest = REST_YAW[kind] ?? 0;
      if (performance.now() - (this.userTurned ?? 0) > 4000) this.yaw = rest + (this.yaw - rest) * Math.max(0, 1 - dt * 0.8);
    }
    const h = (this.heading ?? 0) + Math.PI + this.yaw;
    const dir = new THREE.Vector3(Math.sin(h) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(h) * Math.cos(this.pitch));
    let dist = this.dist;
    if (!p.indoor) dist = Math.min(dist, this._clear(head, dir, dist, p));
    const want = head.clone().addScaledVector(dir, dist);
    const ground = this.world.groundY(want.x, want.z) + 0.4;
    if (want.y < ground) want.y = ground;
    const look = head.clone();
    if (p.heading != null) look.add(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(kind === "sakin" ? 1.2 : 3));
    look.y -= kind === "sakin" ? 0.25 : 0.4;
    const k = this.t >= 1 ? 1 - Math.exp(-dt * 20) : 1 - Math.exp(-dt * 6);
    camera.position.lerp(want, k);
    controls.target.lerp(look, k);
    camera.lookAt(controls.target);
    return true;
  }

  /** Baştan kameraya giden ışın bir binaya çarpıyorsa, çarpmadan önceki uzaklık. */
  _clear(o, dir, max, p) {
    let best = max;
    for (const b of this.world.buildings) {
      const R = Math.max(b.w, b.d) / 2 + max + 2;
      if (Math.abs(b.x - o.x) > R || Math.abs(b.z - o.z) > R) continue;
      // Sakinin şu an içinde olduğu bina (açık iç mekân) sayılmaz.
      const c = Math.cos(b.rot), s = Math.sin(b.rot);
      const lx = (x, z) => (x - b.x) * c - (z - b.z) * s, lz = (x, z) => (x - b.x) * s + (z - b.z) * c;
      const ox = lx(o.x, o.z), oz = lz(o.x, o.z), oy = o.y - FLAT_Y;
      const dx = dir.x * c - dir.z * s, dz = dir.x * s + dir.z * c, dy = dir.y;
      const hx = b.w / 2 + 0.25, hz = b.d / 2 + 0.25, top = b.floors * FLOOR_H + 1.5;
      if (Math.abs(ox) < hx && Math.abs(oz) < hz && oy < top) continue;
      let t0 = 0, t1 = best;
      for (const [o1, d1, lo, hi] of [[ox, dx, -hx, hx], [oz, dz, -hz, hz], [oy, dy, -1, top]]) {
        if (Math.abs(d1) < 1e-6) { if (o1 < lo || o1 > hi) { t0 = Infinity; break; } continue; }
        let a = (lo - o1) / d1, bb = (hi - o1) / d1;
        if (a > bb) [a, bb] = [bb, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, bb);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < best) best = Math.max(0.6, t0 - 0.35);
    }
    void p;
    return best;
  }
}
