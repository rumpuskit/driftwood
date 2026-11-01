// Harita kontrolleri (Google Haritalar alışkanlığıyla):
//  - Sol tık sürükle / tek parmak: kaydır (tutulan nokta imlecin altında kalır)
//  - Sağ tık ya da Ctrl/Shift + sürükle: döndür (yatay) ve eğ (dikey)
//  - Tekerlek / iki parmak sıkıştır: imlecin (parmakların) olduğu yere yakınlaş-uzaklaş
//  - İki parmak çevir: döndür; iki parmağı birlikte yukarı-aşağı kaydır: eğ
//  - Çift tık / çift dokunma: yakınlaş
// Kamera ve hedef doğrudan güncellenir; uçuşlar (flyTo) aynı nesneleri kullanabilir.
import * as THREE from "three";

export class MapControls2 {
  constructor(camera, dom, { groundY = () => 0 } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3();
    this.minDistance = 6;
    this.maxDistance = 3200;
    this.minPitch = 0.12; // dikeyden (radyan): neredeyse tepeden
    this.maxPitch = 1.28; // ufka yakın
    this.groundY = groundY;
    this.enabled = true;
    this.onUserMove = null; // (tür) => …  tür: "pan" | "zoom" | "rotate"
    this.lockTarget = false; // takipte: yakınlaştırma ve döndürme hedefin çevresinde, kaydırma takibi bırakır
    // Omuz kamerası gibi özel kipler: verilirse sürüklemeler custom.rotate(dx, dy), yakınlaştırma
    // custom.zoom(çarpan) olur; kamera bu sınıf yerine o kipin sahibince yerleştirilir.
    this.custom = null;
    this._pointers = new Map();
    this._ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._vel = new THREE.Vector3();
    this._lastTap = 0;
    dom.addEventListener("pointerdown", (e) => this._down(e));
    dom.addEventListener("pointermove", (e) => this._move(e));
    dom.addEventListener("pointerup", (e) => this._up(e));
    dom.addEventListener("pointercancel", (e) => this._up(e));
    dom.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("dblclick", (e) => this._zoomAt(e.clientX, e.clientY, 0.5));
    addEventListener("keydown", (e) => this._key(e));
  }

  /** Ekran noktasının hedef yüksekliğindeki zemin düzlemine izdüşümü. */
  _ground(cx, cy, out = new THREE.Vector3()) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.target.y);
    const hit = this._ray.ray.intersectPlane(plane, out);
    if (!hit) return null;
    // Ufka çok yakın noktalar: hedeften en fazla 4 km.
    if (hit.distanceTo(this.target) > 4000) return null;
    return hit;
  }

  _offset() {
    return this._v.copy(this.camera.position).sub(this.target);
  }

  _pan(delta) {
    this.target.add(delta);
    this.camera.position.add(delta);
  }

  _rotate(dYaw, dPitch, pivot = this.target) {
    const off = this._offset();
    const dist = off.length();
    let yaw = Math.atan2(off.x, off.z);
    let pitch = Math.acos(THREE.MathUtils.clamp(off.y / dist, -1, 1));
    yaw += dYaw;
    pitch = THREE.MathUtils.clamp(pitch + dPitch, this.minPitch, this.maxPitch);
    // Pivot hedef değilse hedef de pivot çevresinde döner.
    if (pivot !== this.target && dYaw) {
      const t = this.target.clone().sub(pivot);
      const c = Math.cos(dYaw), s = Math.sin(dYaw);
      this.target.set(pivot.x + t.x * c + t.z * s, this.target.y, pivot.z - t.x * s + t.z * c);
    }
    this.camera.position.set(
      this.target.x + dist * Math.sin(pitch) * Math.sin(yaw),
      this.target.y + dist * Math.cos(pitch),
      this.target.z + dist * Math.sin(pitch) * Math.cos(yaw),
    );
    this.camera.lookAt(this.target);
  }

  /**
   * P noktasına doğru yakınlaş (factor < 1) ya da uzaklaş (> 1). Uzaklaşma hep ekranın ortası (hedef)
   * çevresinde: imleç noktasından uzaklaşmak eğik kamerada bakılan yeri ileri ya da geri savuruyordu
   * (mini haritadaki konum uzaklaşınca kayıyordu). Google Haritalar gibi: yakınlaşma imlece, uzaklaşma ortadan.
   */
  _zoom(factor, pivot = this.target) {
    const P = (factor > 1 ? this.target : pivot).clone(); // pivot hedefin kendisi olabilir; hedef değişirken bozulmasın
    const off = this._offset();
    const dist = off.length();
    const nd = THREE.MathUtils.clamp(dist * factor, this.minDistance, this.maxDistance);
    const f = nd / dist;
    this.camera.position.sub(P).multiplyScalar(f).add(P);
    this.target.sub(P).multiplyScalar(f).add(P);
    this.target.y = P.y;
    this.camera.lookAt(this.target);
  }

  _zoomAt(cx, cy, factor) {
    if (this.custom) return this.custom.zoom(factor);
    const P = this.lockTarget ? this.target.clone() : this._ground(cx, cy) ?? this.target.clone();
    this.onUserMove?.("zoom");
    this._zoom(factor, P);
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0016;
    this._zoomAt(e.clientX, e.clientY, Math.exp(THREE.MathUtils.clamp(e.deltaY * scale, -0.6, 0.6)));
  }

  _down(e) {
    if (!this.enabled) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, ctrl: e.ctrlKey || e.shiftKey || e.metaKey });
    this._vel.set(0, 0, 0);
    this._dragPx = 0;
    if (this._pointers.size === 1) {
      const rotate = e.button === 2 || e.ctrlKey || e.shiftKey || e.metaKey;
      this._mode = rotate ? "rotate" : "pan";
      this._grab = this._ground(e.clientX, e.clientY);
      // Çift dokunma ile yakınlaş.
      if (e.pointerType === "touch") {
        const now = performance.now();
        if (now - this._lastTap < 300 && Math.hypot(e.clientX - this._tapX, e.clientY - this._tapY) < 30) this._zoomAt(e.clientX, e.clientY, 0.5);
        this._lastTap = now; this._tapX = e.clientX; this._tapY = e.clientY;
      }
    } else if (this._pointers.size === 2) {
      this._mode = "multi";
      this._multi = this._multiState();
    }
  }

  _multiState() {
    const [a, b] = [...this._pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    return { mx, my, dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  _move(e) {
    const p = this._pointers.get(e.pointerId);
    if (!p || !this.enabled) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    this._dragPx += Math.abs(dx) + Math.abs(dy);
    if (this._mode === "pan" && this._pointers.size === 1) {
      // Dokunurken parmak titrer: birkaç pikselden kısa sürüklemeler kaydırma sayılmaz.
      if (this._dragPx < 8) return;
      if (this.custom) return this.custom.rotate(dx, dy);
      this.onUserMove?.("pan");
      if (!this._grab) { this._grab = this._ground(e.clientX, e.clientY); return; }
      const now = this._ground(e.clientX, e.clientY);
      if (!now) return;
      const delta = this._grab.clone().sub(now);
      delta.y = 0;
      this._pan(delta);
      this._vel.copy(delta);
    } else if (this._mode === "rotate" && this._pointers.size === 1) {
      const h = this.dom.clientHeight || 1;
      if (this.custom) return this.custom.rotate(dx, dy);
      if (Math.abs(dx) + Math.abs(dy) > 0) this.onUserMove?.("rotate");
      this._rotate(-dx * (Math.PI / h) * 0.9, -dy * (Math.PI / h) * 0.7);
    } else if (this._mode === "multi" && this._pointers.size === 2) {
      const prev = this._multi, cur = this._multiState();
      if (this.custom) {
        if (prev.dist > 0 && cur.dist > 0) this.custom.zoom(prev.dist / cur.dist);
        this.custom.rotate(cur.mx - prev.mx, cur.my - prev.my);
        this._multi = cur;
        return;
      }
      // Sıkıştır: yakınlaştır; çevir: döndür (parmakların ortası çevresinde); birlikte kaydır: eğ ya da kaydır.
      const pivot = this.lockTarget ? this.target.clone() : this._ground(cur.mx, cur.my) ?? this.target.clone();
      this.onUserMove?.("zoom");
      if (prev.dist > 0 && cur.dist > 0) this._zoom(prev.dist / cur.dist, pivot);
      let da = cur.angle - prev.angle;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) > 0.002) this._rotate(-da, 0, pivot);
      const [a, b] = [...this._pointers.values()];
      void a; void b;
      const my = cur.my - prev.my, mx = cur.mx - prev.mx;
      const sameDir = Math.abs(cur.dist - prev.dist) < 3;
      if (sameDir && Math.abs(my) > Math.abs(mx) * 1.5) {
        this._rotate(0, -my * 0.006);
      } else if (!this.lockTarget) {
        const g0 = this._ground(prev.mx, prev.my), g1 = this._ground(cur.mx, cur.my);
        if (g0 && g1) { const d = g0.sub(g1); d.y = 0; this._pan(d); }
      }
      this._multi = cur;
    }
  }

  _up(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size === 1) {
      const [p] = this._pointers.values();
      this._mode = "pan";
      this._grab = this._ground(p.x, p.y);
    } else if (this._pointers.size === 0) {
      this._mode = null;
      this._grab = null;
    }
  }

  _key(e) {
    if (!this.enabled || e.target?.tagName === "INPUT") return;
    const dist = this._offset().length();
    const step = dist * 0.08;
    const off = this._offset();
    const fwd = new THREE.Vector3(-off.x, 0, -off.z).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const map = {
      ArrowUp: () => this._pan(fwd.multiplyScalar(step)),
      ArrowDown: () => this._pan(fwd.multiplyScalar(-step)),
      ArrowLeft: () => this._pan(right.multiplyScalar(-step)),
      ArrowRight: () => this._pan(right.multiplyScalar(step)),
      "+": () => this._zoom(0.8), "=": () => this._zoom(0.8), "-": () => this._zoom(1.25),
      q: () => this._rotate(0.12, 0), e: () => this._rotate(-0.12, 0),
    };
    if (this.custom) {
      const k = { ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -20], ArrowDown: [0, 20], q: [-30, 0], e: [30, 0] }[e.key];
      if (k) this.custom.rotate(...k);
      else if (e.key === "+" || e.key === "=") this.custom.zoom(0.8);
      else if (e.key === "-") this.custom.zoom(1.25);
      return;
    }
    const f = map[e.key];
    if (f) { f(); this.onUserMove?.(e.key.startsWith("Arrow") ? "pan" : e.key === "q" || e.key === "e" ? "rotate" : "zoom"); }
  }

  /** Her karede: bırakınca kısa süreli kayma (eylemsizlik). */
  update(dt = 1 / 60) {
    if (this.custom) { this._vel.set(0, 0, 0); this.camera.lookAt(this.target); return; }
    if (this.lockTarget) this._vel.set(0, 0, 0);
    if (this._pointers.size === 0 && this._vel.lengthSq() > 1e-4) {
      this._pan(this._vel);
      this._vel.multiplyScalar(Math.pow(0.0025, dt));
    }
    this.camera.lookAt(this.target);
  }
}
