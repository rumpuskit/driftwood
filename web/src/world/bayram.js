// Milli bayramlar: 23 Nisan, 19 Mayıs, 30 Ağustos ve 29 Ekim'de (bir gün önce ve sonra da) ada bayraklarla
// süslenir: cadde lambalarında dalgalanan bayraklar, belediyenin önünde büyük gönder, okul ve sağlık ocağının
// önünde direkler, apartman balkonlarından sarkan bayraklar. 29 Ekim akşamı denizde havai fişek.
// Meydandaki gönderde bayrak her gün dalgalanır (boş adada da).
import * as THREE from "three";
import { FLAT_Y, FLOOR_H, unitLayout } from "./layout.js";

const DAYS = [[4, 23], [5, 19], [8, 30], [10, 29]]; // [ay, gün]
const FIREWORKS = { month: 10, day: 29, from: 20 * 60 + 30, to: 21 * 60 + 5 };

/** Türkiye gün numarası (sim.dayOf) → [ay, gün]. */
function monthDay(day) {
  const d = new Date(day * 86400000);
  return [d.getUTCMonth() + 1, d.getUTCDate()];
}

export function bayramOf(day) {
  for (const k of [0, 1, -1]) {
    const [m, d] = monthDay(day + k);
    if (DAYS.some(([bm, bd]) => bm === m && bd === d)) return true;
  }
  return false;
}

function flagTexture() {
  // Ölçüler TS 1 (Türk Bayrağı Kanunu) oranlarıyla: 1200×800 düzlemde ay ve yıldız.
  const c = document.createElement("canvas");
  c.width = 480; c.height = 320;
  const g = c.getContext("2d");
  const s = c.width / 1200;
  g.fillStyle = "#e30a17";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#ffffff";
  g.beginPath(); g.arc(425 * s, 400 * s, 200 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#e30a17";
  g.beginPath(); g.arc(475 * s, 400 * s, 160 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#ffffff";
  const star = [[583.334, 400], [764.235, 458.779], [652.431, 304.894], [652.431, 495.106], [764.235, 341.221]];
  g.beginPath();
  star.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dalgalanan bayrak malzemesi: gönder tarafı (uv.x = 0) sabit, uç tarafı rüzgârda dalgalanır. */
function waveMaterial(map, amp, uniforms) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.8, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix[3];
          float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
          float u = uv.x;
          transformed.z += ${amp.toFixed(3)} * u * sin(u * 5.5 - uTime * 4.2 + ph);
          transformed.y -= ${(amp * 0.6).toFixed(3)} * u * u * (0.6 + 0.4 * sin(uTime * 1.3 + ph));
        }`);
  };
  return m;
}

export function buildBayram(world) {
  const group = new THREE.Group();
  group.visible = false;
  const uniforms = { uTime: { value: 0 } };
  const tex = flagTexture();
  // Bayrak düzlemi: sol kenar (gönder tarafı) x = 0'da, üst kenar y = 0'da; 1 × 2/3 m, ölçeklenir.
  const flagGeo = new THREE.PlaneGeometry(1, 2 / 3, 10, 2).translate(0.5, -1 / 3, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: "#d9dde3", roughness: 0.4, metalness: 0.6 });
  const poleGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
  const knobGeo = new THREE.SphereGeometry(1, 10, 8);

  const flags = { wave: [], drape: [] };
  const poles = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const put = (list, x, y, z, rot, w) => {
    q.setFromAxisAngle(UP, rot);
    list.push(m4.compose(p.set(x, y, z), q, sc.set(w, w, w)).clone());
  };
  const pole = (x, y, z, h, r) => poles.push({ x, y, z, h, r });

  // 1) Lambalar: her lambada, direğe bağlı, yola paralel dalgalanan bayrak.
  world.lampSpots.forEach((l) => {
    if (l.hidden) return;
    const top = l.deco ? 3.5 : 5.0;
    const along = l.dir + Math.PI / 2; // yolun doğrultusu (lamba kolu yola dik)
    put(flags.wave, l.x + Math.sin(along) * 0.12, l.y + top, l.z + Math.cos(along) * 0.12, along - Math.PI / 2, l.deco ? 1.35 : 1.75);
  });

  // 2) Belediye önünde büyük gönder; okul, sağlık ocağı, hastane ve karakol önünde direk.
  const front = (b, ahead, side) => [b.x + Math.sin(b.rot) * ahead + Math.cos(b.rot) * side, b.z + Math.cos(b.rot) * ahead - Math.sin(b.rot) * side];
  for (const b of world.buildings) {
    const big = b.kind === "belediye";
    if (!big && !["okul", "hastane", "saglik", "karakol", "liman"].includes(b.kind)) continue;
    const [x, z] = front(b, b.d / 2 + (big ? 7 : 4), b.w * (big ? 0.32 : 0.36));
    if (!world.isWalkable?.(x, z) && !world.isLand(x, z)) continue;
    const y = world.groundY(x, z);
    const h = big ? 15 : 8;
    pole(x, y, z, h, big ? 0.09 : 0.06);
    put(flags.wave, x, y + h - 0.15, z, b.rot - Math.PI / 2, big ? 3.6 : 1.8);
  }

  // 3) Apartmanlar: aşağı yukarı üçte birinde bir balkondan sarkan bayrak.
  for (const b of world.buildings) {
    if (b.kind !== "konut" || !b.balconies || (b.floors ?? 0) < 2) continue;
    const hsh = (Math.imul((Math.round(b.x * 7) ^ Math.round(b.z * 13)) | 0, 2654435761) >>> 0) / 4294967296;
    if (hsh > 0.55) continue;
    const plan = unitLayout(b);
    const unit = plan.units[Math.floor(hsh * 97) % plan.units.length];
    const floor = 1 + (Math.floor(hsh * 991) % (b.floors - 1));
    const lx = unit.cx - 1.05, ly = floor * FLOOR_H + 1.04, lz = b.d / 2 + 1.25;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    put(flags.drape, b.x + lx * c + lz * s, FLAT_Y + ly, b.z - lx * s + lz * c, b.rot, 2.1);
  }

  const inst = (geo, mat, list) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.count = list.length;
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  };
  group.add(inst(flagGeo, waveMaterial(tex, 0.11, uniforms), flags.wave));
  group.add(inst(flagGeo, waveMaterial(tex, 0.025, uniforms), flags.drape));
  const poleMesh = inst(poleGeo, poleMat, poles.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y, o.z), q.identity(), sc.set(o.r * 2, o.h, o.r * 2))));
  const knobMesh = inst(knobGeo, new THREE.MeshStandardMaterial({ color: "#e8c35a", roughness: 0.3, metalness: 0.7 }), poles.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h + o.r * 1.6, o.z), q.identity(), sc.setScalar(o.r * 1.9))));
  group.add(poleMesh, knobMesh);

  const fireworks = buildFireworks(world);
  group.add(fireworks.points);

  // Meydan gönderi: her gün bayraklı (ayrı grup, hep görünür).
  const mast = new THREE.Group();
  const mastU = { uTime: { value: 0 } };
  const masts = world.features.filter((f) => f.type === "gonder").map((f) => ({ x: f.x, y: world.groundY(f.x, f.z), z: f.z, h: 12, r: 0.1 }));
  if (masts.length) {
    // Bayrak doğuya uzanır: geniş yüzü güneye, iskeleden gelenlere bakar.
    const mflags = masts.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h - 0.15, o.z), q.identity(), sc.setScalar(3)));
    mast.add(inst(flagGeo, waveMaterial(tex, 0.13, mastU), mflags));
    mast.add(inst(poleGeo, poleMat, masts.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y, o.z), q.identity(), sc.set(o.r * 2, o.h, o.r * 2)))));
    mast.add(inst(knobGeo, new THREE.MeshStandardMaterial({ color: "#e8c35a", roughness: 0.3, metalness: 0.7 }), masts.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h + o.r * 1.6, o.z), q.identity(), sc.setScalar(o.r * 1.9)))));
  }

  let active = null;
  return {
    group,
    mast,
    counts: { lamba: flags.wave.length - poles.length, gonder: poles.length, balkon: flags.drape.length },
    /** px: çizim tamponu yüksekliği / 900 (parçacıklar her çözünürlükte aynı büyüklükte görünsün). */
    update(day, minute, real, px = 1) {
      mastU.uTime.value = real;
      const on = bayramOf(day);
      if (on !== active) { group.visible = on; active = on; }
      if (!on) return;
      uniforms.uTime.value = real;
      const [m, d] = monthDay(day);
      fireworks.update(m === FIREWORKS.month && d === FIREWORKS.day && minute >= FIREWORKS.from && minute < FIREWORKS.to, real, px);
    },
  };
}

/**
 * Havai fişek: limanın açığında, denizin üstünde. Altı fişek sırayla atılır; her biri yükselen bir iz,
 * patlama anında parlama ve 140 parçacıktan oluşur. Parçacıkların hızı ve yönü biraz rastgele (kusursuz
 * küre değil), arkalarında kısa bir iz bırakır, yerçekimiyle düşer, sönerken titreşir. Konumlar
 * gölgelendiricide hesaplanır (CPU'da iş yok).
 */
function buildFireworks(world) {
  const BURSTS = 6, N = 140, TRAIL = 4;
  const count = BURSTS * (N * TRAIL + 1 + 12);
  const dir = new Float32Array(count * 3), info = new Float32Array(count * 4);
  let k = 0;
  const rnd = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (let b = 0; b < BURSTS; b++) {
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + rnd(i + b * 31))) / N, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + rnd(i * 7 + b) * 0.5;
      const sp = 0.78 + rnd(i * 3 + b * 17) * 0.3;
      for (let t = 0; t < TRAIL; t++, k++) {
        dir.set([Math.cos(a) * r * sp, y * sp, Math.sin(a) * r * sp], k * 3);
        info.set([b, 0, t, rnd(i * 11 + b * 5)], k * 4); // [fişek, tür 0: parçacık, iz sırası, rastgele]
      }
    }
    dir.set([0, 0, 0], k * 3); info.set([b, 1, 0, 0], k * 4); k++; // patlama parlaması
    for (let t = 0; t < 12; t++, k++) { dir.set([0, 0, 0], k * 3); info.set([b, 2, t, 0], k * 4); } // yükselen iz
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
  geo.setAttribute("aInfo", new THREE.BufferAttribute(info, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
  const pier = world.ferryPier ?? { z1: 280 };
  const uniforms = { uTime: { value: 0 }, uBase: { value: new THREE.Vector3(0, 0, pier.z1 + 70) }, uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aDir; attribute vec4 aInfo;
      uniform float uTime; uniform vec3 uBase; uniform float uPx;
      varying vec3 vColor; varying float vA;
      float h(float n) { return fract(sin(n * 91.345) * 47453.5453); }
      void main() {
        float b = aInfo.x, kind = aInfo.y, tr = aInfo.z, rn = aInfo.w;
        float period = 3.4, rise = 1.1;
        float tt = uTime + b * period / 6.0 * 1.37;
        float cyc = floor(tt / period), lt = mod(tt, period);
        float s = cyc * 7.0 + b * 13.0;
        vec3 o = uBase + vec3((h(s) - 0.5) * 70.0, 70.0 + h(s + 1.0) * 50.0, (h(s + 2.0) - 0.5) * 50.0);
        float pick = h(s + 4.0);
        vec3 c = pick < 0.4 ? vec3(1.0, 0.16, 0.18) : pick < 0.7 ? vec3(1.0, 0.96, 0.92) : pick < 0.85 ? vec3(1.0, 0.72, 0.22) : vec3(0.55, 0.85, 1.0);
        vec3 p; float a = 0.0, size = 2.0;
        float bt = lt - rise; // patlamadan beri geçen süre
        if (kind > 1.5) {
          // Yükselen iz: denizden patlama noktasına.
          float u = clamp((lt - tr * 0.025) / rise, 0.0, 1.0);
          p = vec3(o.x, mix(2.0, o.y, 1.0 - (1.0 - u) * (1.0 - u)), o.z);
          a = lt < rise ? (1.0 - tr / 12.0) * 0.9 : 0.0;
          c = vec3(1.0, 0.8, 0.5); size = 3.0;
        } else if (kind > 0.5) {
          p = o; a = bt > 0.0 ? exp(-bt * 9.0) * 3.0 : 0.0; size = 60.0; c = mix(c, vec3(1.0), 0.6);
        } else {
          float t = max(bt - tr * 0.045, 0.0);
          float spd = 30.0 + h(s + 3.0) * 14.0;
          float drag = (1.0 - exp(-t * 1.5)) / 1.5;
          p = o + aDir * spd * drag + vec3(0.0, -3.8 * t * t, 0.0);
          float life = 1.7 + rn * 0.8;
          a = bt > tr * 0.045 ? (1.0 - smoothstep(life * 0.55, life, t)) : 0.0;
          a *= (1.0 - tr / float(${TRAIL})) * (0.75 + 0.25 * sin(uTime * 37.0 + rn * 40.0));
          size = 4.6 - tr * 0.8;
        }
        vColor = c; vA = a;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(size * 420.0 / -mv.z, 1.2, kind > 0.5 && kind < 1.5 ? 140.0 : 18.0) * uPx;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float f = exp(-d * d * 18.0);
        gl_FragColor = vec4(vColor * f * vA * 1.5, f * vA);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  return {
    points,
    update(on, real, px) {
      points.visible = on;
      if (on) { uniforms.uTime.value = real; uniforms.uPx.value = px; }
    },
  };
}
