// Bayraklar ve tatil süsleri (ABD). Town Green'deki ve Town Hall önündeki direklerde ABD bayrağı her gün dalgalanır;
// evlerin bir kısmının verandasında yıl boyu küçük bayrak asılıdır.
// Bayrak günlerinde (Presidents' Day, Memorial Day, 4 Temmuz, Labor Day, Veterans Day; sim.holidayOf) sokak
// lambalarında ve kamu binalarının önünde bayraklar, verandalarda daha çok bayrak. 4 Temmuz akşamı ve yılbaşı gece
// yarısı koyun üstünde havai fişek. Halloween haftası (24–31 Ekim) verandalarda balkabakları (gece içleri yanar),
// Aralık boyunca (6 Ocak'a kadar) saçaklarda renkli ışıklar ve Green'de Noel ağacı.
import * as THREE from "three";
import { civilFromDays, holidayOf } from "../sim.js";
import { FLAT_Y, FLOOR_H } from "./layout.js";
import { sunTimes } from "./sky.js";

const FLAG_DAYS = new Set(["presidents", "memorial", "independence", "labor", "veterans"]);

function monthDay(day) {
  const [, m, d] = civilFromDays(day);
  return [m, d];
}

/** Bayrak günü mü? 4 Temmuz'da bir gün önce ve sonra da (uzun hafta sonu). */
export function bayramOf(day) {
  if (FLAG_DAYS.has(holidayOf(day))) return true;
  const [m, d] = monthDay(day);
  return m === 7 && d >= 3 && d <= 5;
}

function halloweenOf(day) {
  const [m, d] = monthDay(day);
  return m === 10 && d >= 24;
}

function christmasOf(day) {
  const [m, d] = monthDay(day);
  return m === 12 || (m === 1 && d <= 6);
}

/** Havai fişek zamanı: 4 Temmuz 21:00–21:35 ve yılbaşı 00:00–00:20. */
function fireworksOn(day, minute) {
  const [m, d] = monthDay(day);
  if (m === 7 && d === 4) return minute >= 21 * 60 && minute < 21 * 60 + 35;
  if (m === 1 && d === 1) return minute < 20;
  return false;
}

/** ABD bayrağı dokusu: 13 kırmızı-beyaz çizgi, lacivert kantonda 50 yıldız (9 sıra, 6 ve 5). Oran 19:10. */
function flagTexture() {
  const c = document.createElement("canvas");
  c.width = 494; c.height = 260;
  const g = c.getContext("2d");
  const sh = c.height / 13;
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? "#ffffff" : "#b22234";
    g.fillRect(0, i * sh, c.width, sh + 0.5);
  }
  const cw = c.width * 0.4, ch = sh * 7;
  g.fillStyle = "#3c3b6e";
  g.fillRect(0, 0, cw, ch);
  g.fillStyle = "#ffffff";
  for (let r = 0; r < 9; r++) {
    const n = r % 2 ? 5 : 6;
    for (let k = 0; k < n; k++) {
      const x = (cw / 12) * (r % 2 ? 2 + k * 2 : 1 + k * 2), y = (ch / 10) * (r + 1);
      g.beginPath();
      for (let p = 0; p < 10; p++) {
        const a = -Math.PI / 2 + (p * Math.PI) / 5, rr = p % 2 ? 2.2 : 5.4;
        p ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath(); g.fill();
    }
  }
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

const hsh = (b, salt) => (Math.imul((Math.round(b.x * 7) ^ Math.round(b.z * 13) ^ (salt * 7919)) | 0, 2654435761) >>> 0) / 4294967296;

/** Evin verandası (yerel): balkabağı yerleri, bayrak direği ucu, saçak çizgisi. */
function porchOf(b) {
  const front = b.d / 2;
  switch (b.house) {
    case "cottage": return { pumpkins: [[-0.95, front + 1.0], [1.0, front + 1.1]], deck: 0.45, flag: [1.0, front + 1.25, 2.3] };
    case "twofamily": return { pumpkins: [[-b.w / 2 + 0.7, front + 1.6], [-b.w / 2 + 1.3, front + 1.9], [b.w / 2 - 0.8, front + 1.6]], deck: 0.5, flag: [b.w / 2 - 0.2, front + 2.25, 2.6] };
    case "fourplex": return { pumpkins: [[-1.6, front + 1.5], [1.6, front + 1.5], [-b.w / 2 + 0.8, front + 2.0]], deck: 0.5, flag: [b.w / 2 - 0.2, front + 2.45, 2.6] };
    default: return { pumpkins: [[-1.9, front + 1.2], [1.9, front + 1.2]], deck: 0.1, flag: null };
  }
}

export function buildBayram(world) {
  const group = new THREE.Group(); // bayrak günleri
  group.visible = false;
  const uniforms = { uTime: { value: 0 } };
  const tex = flagTexture();
  // Bayrak düzlemi: sol kenar (gönder tarafı) x = 0'da, üst kenar y = 0'da; 1 × 10/19 m, ölçeklenir.
  const flagGeo = new THREE.PlaneGeometry(1, 10 / 19, 10, 2).translate(0.5, -5 / 19, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: "#e4e6e9", roughness: 0.4, metalness: 0.6 });
  const poleGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
  const knobGeo = new THREE.SphereGeometry(1, 10, 8);
  const gold = new THREE.MeshStandardMaterial({ color: "#e8c35a", roughness: 0.3, metalness: 0.7 });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), TILT = new THREE.Vector3(1, 0, 0);
  const mat4 = (x, y, z, rot, w, tilt = 0) => {
    q.setFromAxisAngle(UP, rot);
    if (tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(TILT, tilt));
    return m4.compose(p.set(x, y, z), q, sc.set(w, w, w)).clone();
  };
  const toWorld = (b, lx, lz) => {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  };
  const inst = (geo, mat, list, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.count = list.length;
    m.castShadow = shadow;
    m.frustumCulled = false;
    return m;
  };

  // --- bayrak günleri ---
  const wave = [], poles = [];
  // 1) Sokak lambaları: direğe bağlı, yola paralel dalgalanan bayrak.
  for (const l of world.lampSpots ?? []) {
    if (l.hidden) continue;
    const top = l.deco ? 3.5 : 5.0;
    const along = l.dir + Math.PI / 2;
    wave.push(mat4(l.x + Math.sin(along) * 0.12, l.y + top, l.z + Math.cos(along) * 0.12, along - Math.PI / 2, l.deco ? 1.35 : 1.6));
  }
  // 2) Kamu binalarının önünde direk.
  for (const b of world.buildings) {
    if (!["okul", "saglik", "karakol", "adliye", "liman", "kutuphane", "muze"].includes(b.kind)) continue;
    const ahead = b.d / 2 + 4, side = b.w * 0.36;
    const x = b.x + Math.sin(b.rot) * ahead + Math.cos(b.rot) * side, z = b.z + Math.cos(b.rot) * ahead - Math.sin(b.rot) * side;
    if (!world.isLand(x, z)) continue;
    const y = world.groundY(x, z);
    poles.push({ x, y, z, h: 8, r: 0.06 });
    wave.push(mat4(x, y + 8 - 0.15, z, b.rot - Math.PI / 2, 1.9));
  }
  // 3) Verandalarda eğik direkli bayrak: bayrak günlerinde evlerin %40'ı (yıl boyu asılı olanlar hariç).
  const porchFlags = { always: [], holiday: [] };
  for (const b of world.buildings) {
    if (!b.house) continue;
    const pr = porchOf(b);
    if (!pr.flag) continue;
    const r = hsh(b, 1);
    if (r > 0.4) continue;
    const [x, z] = toWorld(b, pr.flag[0], pr.flag[1]);
    (r < 0.12 ? porchFlags.always : porchFlags.holiday).push(mat4(x, FLAT_Y + pr.flag[2], z, b.rot + Math.PI / 2, 1.0, -0.6));
  }
  group.add(inst(flagGeo, waveMaterial(tex, 0.1, uniforms), wave));
  group.add(inst(flagGeo, waveMaterial(tex, 0.03, uniforms), porchFlags.holiday, false));
  group.add(inst(poleGeo, poleMat, poles.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y, o.z), q.identity(), sc.set(o.r * 2, o.h, o.r * 2)))));
  group.add(inst(knobGeo, gold, poles.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h + o.r * 1.6, o.z), q.identity(), sc.setScalar(o.r * 1.9)))));

  const fireworks = buildFireworks(world);

  // --- her gün: Green ve Town Hall direkleri, yıl boyu veranda bayrakları ---
  const mast = new THREE.Group();
  const mastU = { uTime: { value: 0 } };
  const masts = world.features.filter((f) => f.type === "gonder").map((f) => ({ x: f.x, y: world.groundY(f.x, f.z), z: f.z, h: f.abd ? 14 : 12, r: 0.1 }));
  if (masts.length) {
    mast.add(inst(flagGeo, waveMaterial(tex, 0.13, mastU), masts.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h - 0.15, o.z), q.identity(), sc.setScalar(3.2)))));
    mast.add(inst(poleGeo, poleMat, masts.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y, o.z), q.identity(), sc.set(o.r * 2, o.h, o.r * 2)))));
    mast.add(inst(knobGeo, gold, masts.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h + o.r * 1.6, o.z), q.identity(), sc.setScalar(o.r * 1.9)))));
  }
  mast.add(inst(flagGeo, waveMaterial(tex, 0.03, mastU), porchFlags.always, false));
  mast.add(fireworks.points);

  // --- Halloween: verandalarda balkabakları (gece içleri yanar) ---
  const halloween = new THREE.Group();
  halloween.visible = false;
  const pumpkinMat = new THREE.MeshStandardMaterial({ color: "#e0772a", roughness: 0.7, emissive: new THREE.Color("#ff8a1e"), emissiveIntensity: 0 });
  const pumpkins = [], stems = [];
  for (const b of world.buildings) {
    if (!b.house || hsh(b, 2) > 0.7) continue;
    const pr = porchOf(b);
    pr.pumpkins.forEach(([lx, lz], i) => {
      if (i > 0 && hsh(b, 3 + i) > 0.6) return;
      const [x, z] = toWorld(b, lx, lz);
      const s = 0.34 + hsh(b, 9 + i) * 0.16;
      pumpkins.push(new THREE.Matrix4().compose(p.set(x, FLAT_Y + pr.deck + s * 0.7, z), q.identity(), sc.set(s, s * 0.78, s)));
      stems.push(new THREE.Matrix4().compose(p.set(x, FLAT_Y + pr.deck + s * 1.45, z), q.identity(), sc.set(1, 1, 1)));
    });
  }
  halloween.add(inst(new THREE.SphereGeometry(1, 12, 8).scale(1, 1, 1), pumpkinMat, pumpkins));
  halloween.add(inst(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 5), new THREE.MeshStandardMaterial({ color: "#4f6b2a" }), stems, false));

  // --- Aralık: saçak ışıkları ve Green'de Noel ağacı ---
  const christmas = new THREE.Group();
  christmas.visible = false;
  // Ampuller: örnek rengiyle çarpılan tonsuz malzeme (gece parlak, gündüz soluk).
  const bulbMat = new THREE.MeshBasicMaterial({ color: "#8c8c8c", toneMapped: false });
  const bulbs = [], bulbColors = [];
  const COLORS = ["#ff3b3b", "#3bd16f", "#3b8bff", "#ffc23b", "#fff2d6"];
  for (const b of world.buildings) {
    if (!b.house || hsh(b, 5) > 0.65) continue;
    const y = FLAT_Y + b.floors * FLOOR_H + 0.05;
    const warm = hsh(b, 6) < 0.4; // bir kısmında tek renk sıcak beyaz
    for (let lx = -b.w / 2; lx <= b.w / 2 + 0.01; lx += 0.5) {
      const [x, z] = toWorld(b, lx, b.d / 2 + 0.42);
      bulbs.push(new THREE.Matrix4().compose(p.set(x, y, z), q.identity(), sc.setScalar(1)));
      bulbColors.push(warm ? "#fff2d6" : COLORS[bulbs.length % COLORS.length]);
    }
  }
  const bulbMesh = inst(new THREE.SphereGeometry(0.07, 5, 4), bulbMat, bulbs, false);
  bulbColors.forEach((c, i) => bulbMesh.setColorAt(i, new THREE.Color(c)));
  christmas.add(bulbMesh);
  // Noel ağacı (Green'in güneybatısında): üç katlı koni, ışıklar ve tepede yıldız.
  {
    const tx = -38, tz = 22, y = world.groundY(tx, tz);
    const tree = new THREE.MeshStandardMaterial({ color: "#2f5a34", roughness: 0.9, flatShading: true });
    for (const [r, h, yy] of [[3.4, 4.2, 1.6], [2.7, 3.6, 4.0], [1.9, 3.0, 6.2]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), tree);
      c.position.set(tx, y + yy + h / 2, tz);
      c.castShadow = true;
      christmas.add(c);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.8, 8), new THREE.MeshStandardMaterial({ color: "#5f4a3a" }));
    trunk.position.set(tx, y + 0.9, tz);
    christmas.add(trunk);
    const tb = [];
    for (let k = 0; k < 90; k++) {
      const t = k / 90, a = k * 2.4, hh = 1.8 + t * 7.0, rr = 3.3 * (1 - t) + 0.2;
      tb.push(new THREE.Matrix4().compose(p.set(tx + Math.cos(a) * rr, y + hh, tz + Math.sin(a) * rr), q.identity(), sc.setScalar(1.6)));
    }
    const treeBulbs = inst(new THREE.SphereGeometry(0.07, 5, 4), bulbMat, tb, false);
    tb.forEach((_, i) => treeBulbs.setColorAt(i, new THREE.Color(COLORS[i % COLORS.length])));
    christmas.add(treeBulbs);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshStandardMaterial({ color: "#ffd75a", emissive: new THREE.Color("#ffcf3a"), emissiveIntensity: 1.2 }));
    star.position.set(tx, y + 9.4, tz);
    christmas.add(star);
  }
  mast.add(halloween, christmas);

  let active = null, sunDay = null, sun = null;
  return {
    group,
    mast,
    counts: { lamba: wave.length - poles.length, direk: poles.length, veranda: porchFlags.always.length + porchFlags.holiday.length, balkabagi: pumpkins.length, isik: bulbs.length },
    /** px: çizim tamponu yüksekliği / 900 (parçacıklar her çözünürlükte aynı büyüklükte görünsün). */
    update(day, minute, real, px = 1) {
      mastU.uTime.value = real;
      uniforms.uTime.value = real;
      const on = bayramOf(day);
      if (on !== active) { group.visible = on; active = on; }
      if (sunDay !== day) { sun = sunTimes(day); sunDay = day; }
      // Işıklar gün batımından yarım saat önce yanar, gün doğumunda söner.
      const dark = minute > (sun.set ?? 1080) - 30 || minute < (sun.rise ?? 400);
      halloween.visible = halloweenOf(day);
      pumpkinMat.emissiveIntensity = halloween.visible && dark ? 1.4 : 0.05;
      christmas.visible = christmasOf(day);
      bulbMat.color.setScalar(dark ? 1.9 : 0.55);
      fireworks.update(fireworksOn(day, minute), real, px);
    },
  };
}

/**
 * Havai fişek: Harbor Bay'in üstünde. Altı fişek sırayla atılır; her biri yükselen bir iz, patlama anında parlama
 * ve 140 parçacıktan oluşur. Parçacıkların hızı ve yönü biraz rastgele (kusursuz küre değil), arkalarında kısa bir
 * iz bırakır, yerçekimiyle düşer, sönerken titreşir. Konumlar gölgelendiricide hesaplanır (CPU'da iş yok).
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
  // Koyun ortası, Ferry Landing'in açığı (kasabadan ve iskeleden görünür).
  const pier = world.ferryPier ?? { z1: 300 };
  const uniforms = { uTime: { value: 0 }, uBase: { value: new THREE.Vector3(150, 0, pier.z1 + 160) }, uPx: { value: 1 } };
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
        vec3 o = uBase + vec3((h(s) - 0.5) * 90.0, 70.0 + h(s + 1.0) * 55.0, (h(s + 2.0) - 0.5) * 60.0);
        float pick = h(s + 4.0);
        // Kırmızı, beyaz, mavi ağırlıklı; ara sıra altın.
        vec3 c = pick < 0.35 ? vec3(1.0, 0.16, 0.2) : pick < 0.65 ? vec3(1.0, 0.97, 0.94) : pick < 0.9 ? vec3(0.3, 0.5, 1.0) : vec3(1.0, 0.75, 0.25);
        vec3 p; float a = 0.0, size = 2.0;
        float bt = lt - rise; // patlamadan beri geçen süre
        if (kind > 1.5) {
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
