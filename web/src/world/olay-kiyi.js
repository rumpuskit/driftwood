// Kıyı olaylarının ortak yardımcıları (17 Kasım akşamı; fok, köpekbalığı, su hortumu, dalga modülleri kullanır). Bu dosya
// iki adada aynıdır. Hiçbir şey sayfa açılışında kurulmaz: yer seçimi ve geometri modülün kur(o)'sunda (olay günü) çağrılır.
//   kiyiYeri(world, o, s) → { W: su kenarı [x, z], K: seyirci kara noktası (su kenarından ~7 m içeride), e2: denize doğru
//     birim [x, z], e1: kıyı boyunca birim, ad } | null  (deterministik: aynı gün aynı yer)
//   kopukHavuzu(group, sayilar) → örnekli köpük/damla/sis havuzu (karede ayırma yok; her kare bas() … bitir())
//   govde / levha / kure / boyaLevha / suAlti: düşük poligonlu hayvan geometrisi (deniz.js ile aynı yaklaşım)
import * as THREE from "three";

export const TAU = Math.PI * 2;
export const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const mod = (a, n) => ((a % n) + n) % n;
/** Sayısal karma (ayırmasız): tamsayılar → [0, 1). */
export function hr(a, b, c = 0, d = 0) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15) ^ b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13) ^ c, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 16) ^ d, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
/** Yumuşak 1B gürültü [0, 1). */
export function gur1(x, t) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return mix(hr(t, i), hr(t, i + 1), u);
}

// ---------------------------------------------------------------- yer seçimi

/** (x, z)'den en yakın derin suya (esik m) yön: 32 yönde tarar, en yakın birkaç yönün ortalaması. */
export function derinYon(world, x, z, esik = -2, maxS = 200) {
  let best = Infinity; const d = new Float64Array(32);
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * TAU, dx = Math.sin(a), dz = Math.cos(a);
    d[k] = Infinity;
    for (let s = 2; s < maxS; s += 2) if (world.height(x + dx * s, z + dz * s) < esik) { d[k] = s; break; }
    best = Math.min(best, d[k]);
  }
  if (!isFinite(best)) return null;
  let sx = 0, sz = 0;
  for (let k = 0; k < 32; k++) if (d[k] < best + 8) { const a = (k / 32) * TAU; sx += Math.sin(a); sz += Math.cos(a); }
  const l = Math.hypot(sx, sz) || 1;
  return [sx / l, sz / l];
}
/** Vapur yoluna uzaklık (harbor.js: yanaştığı yerden 26 m doğuya, 160 m açığa). */
export function vapurUzak(world, x, z) {
  const f = world.features?.find((q) => q.type === "vapur");
  if (!f) return Infinity;
  const ax = f.x, az = f.z - 30, bx = f.x + 26, bz = f.z + 170, ex = bx - ax, ez = bz - az;
  const q = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
  return Math.hypot(ax + ex * q - x, az + ez * q - z);
}
export function iskeleUzak(world, x, z, haric = null) {
  let d = Infinity;
  for (const p of world.piers ?? []) if (p !== haric) d = Math.min(d, Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1)));
  return d;
}

/**
 * Seyircilerin görebileceği bir kıyı noktası. s: { tuz, kaynak: ["sahil_yolu", "iskele", "kasaba", "plaj"] (ağırlık sırası),
 *   deniz: (W, e2, e1) => bool (açıkta istenen alan uygun mu), yanBos: kara tarafında gereken yürünebilir yer sayısı (5'te) }
 * Kaynaklar: sahil_yolu (Mercanada kordonu), iskele (balık iskelesinin kara başı), kasaba (meydana en yakın kıyı noktaları:
 * Driftwood'un rıhtımı), plaj (yalnız plaj kurulmuşsa: world.beach).
 */
export function kiyiYeri(world, o, s = {}) {
  const pl = world.places ?? {};
  const adaylar = [];
  const ekle = (ad, noktalar, w) => { if (noktalar?.length) adaylar.push({ ad, noktalar, w }); };
  for (const k of s.kaynak ?? ["sahil_yolu", "kasaba", "iskele"]) {
    if (k === "sahil_yolu") ekle(k, world.promenade?.length ? world.promenade.filter((_, i) => i % 2 === 0) : pl.sahil_yolu?.anchors, 4);
    else if (k === "iskele" && pl.iskele?.anchors?.length) { const a = pl.iskele.anchors[0]; ekle(k, [world.nearestWalkable(a[0], a[1] - 24, 8)], 1.5); }
    else if (k === "plaj" && world.beach) ekle(k, pl.plaj?.anchors, 5);
    else if (k === "kasaba") {
      const mey = pl.meydan?.anchors?.[0] ?? [0, 0];
      const kasaba = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; kasaba.push(world.coastPoint(mey[0], mey[1], Math.sin(a), Math.cos(a), 9)); }
      ekle(k, kasaba.filter(Boolean).sort((p1, p2) => Math.hypot(p1[0] - mey[0], p1[1] - mey[1]) - Math.hypot(p2[0] - mey[0], p2[1] - mey[1])).slice(0, 6), 3);
    }
  }
  const t = o.tohum | 0, tuz = s.tuz ?? 0;
  const sira = adaylar.map((c, i) => [Math.pow(hr(t, 61 + tuz, i), 1 / c.w), c]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
  for (const c of sira) {
    const n = c.noktalar.length, bas = Math.floor(hr(t, 62 + tuz, n) * n);
    for (let ii = 0; ii < n; ii++) {
      const i = mod(bas + (ii % 2 ? -1 : 1) * Math.ceil(ii / 2), n);
      const [x0, z0] = c.noktalar[i];
      const y = derinYon(world, x0, z0);
      if (!y) continue;
      const [e2x, e2z] = y;
      const W = world.coastPoint(x0 - e2x * 30, z0 - e2z * 30, e2x, e2z, 0);
      const [kx, kz] = world.nearestWalkable(W[0] - e2x * 7, W[1] - e2z * 7, 6);
      if (!world.isWalkable(kx, kz) || !world.isLand(kx, kz)) continue;
      let ok = 0;
      for (const [la, ge] of [[-9, -2], [9, -2], [0, -6], [-6, -7], [6, -7]]) if (world.isWalkable(kx + e2z * la + e2x * ge, kz - e2x * la + e2z * ge)) ok++;
      if (ok < (s.yanBos ?? 3)) continue;
      const e1 = [e2z, -e2x];
      if (s.deniz && !s.deniz(W, [e2x, e2z], e1)) continue;
      return { W, K: [kx, kz], e2: [e2x, e2z], e1, ad: c.ad };
    }
  }
  return null;
}

// ---------------------------------------------------------------- geometri

const C = new THREE.Color();
/** Dönel gövde: prof [s (0 burun → 1 kuyruk), r, wx, wy, yo]; z = L·(0,5 − s) (burun +z). boya(renk, sinA, s, k). */
export function govde(prof, L, na, boya, burunUcu = true, kuyrukUcu = true) {
  const pos = [], col = [], idx = [];
  for (const [s, r, wx, wy, yo] of prof) {
    for (let k = 0; k < na; k++) {
      const a = (k / na) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(r * wx * ca, r * wy * sa + yo, L * (0.5 - s));
      boya(C, sa, s, k, ca); col.push(C.r, C.g, C.b);
    }
  }
  const n = prof.length;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < na; k++) {
    const A = i * na + k, Bk = i * na + ((k + 1) % na), Cc = A + na, D = Bk + na;
    idx.push(A, Cc, Bk, Bk, Cc, D);
  }
  const uc = (i, z, y, ters) => {
    const t = pos.length / 3; pos.push(0, y, z);
    boya(C, 0, prof[i][0], 0, 1); col.push(C.r, C.g, C.b);
    for (let k = 0; k < na; k++) { const a = i * na + k, b = i * na + ((k + 1) % na); ters ? idx.push(t, b, a) : idx.push(t, a, b); }
  };
  if (burunUcu) uc(0, L * (0.5 - prof[0][0]) + prof[0][1] * 0.6, prof[0][4], false);
  if (kuyrukUcu) uc(n - 1, L * (0.5 - prof[n - 1][0]) - prof[n - 1][1] * 0.6, prof[n - 1][4], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const ni = g.toNonIndexed(); ni.computeVertexNormals();
  return ni;
}
/** Düz levha (yüzgeç): noktalar XY'de, kalınlık z; renk(renk, normal, konum) boyaLevha'da uygulanır. */
export function levha(noktalar, kalin, renk) {
  const sh = new THREE.Shape(noktalar.map(([x, y]) => new THREE.Vector2(x, y)));
  let g = new THREE.ExtrudeGeometry(sh, { depth: kalin, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -kalin / 2);
  g.deleteAttribute("uv");
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  g.userData.renk = renk;
  return g;
}
export function boyaLevha(g) {
  const p = g.attributes.position, nr = g.attributes.normal, col = new Float32Array(p.count * 3);
  const n = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(nr, i); v.fromBufferAttribute(p, i);
    g.userData.renk(C, n, v); col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
export function kure(r, x, y, z, hex, d = 0, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, d).scale(sx, sy, sz).translate(x, y, z); g.deleteAttribute("uv");
  const c = new THREE.Color(hex), col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}
/** Su altındaki kısım derinlikle suyun rengine karışır (saydam su yüzeyinin altında "havada" gibi durmasın). */
const SU_ALTI = { value: new THREE.Color("#1f6f9a") };
export function suAlti(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSuAlti = SU_ALTI;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vDenizY;")
      .replace("#include <project_vertex>", `#include <project_vertex>
      vec4 dwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        dwp = instanceMatrix * dwp;
      #endif
      vDenizY = (modelMatrix * dwp).y;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vDenizY;\nuniform vec3 uSuAlti;")
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uSuAlti, clamp(-vDenizY * 0.45, 0.0, 0.8) * step(vDenizY, 0.0));`);
  };
  return m;
}

// ---------------------------------------------------------------- köpük havuzu

function kopukMalzeme() {
  // Köşe rengi (kırmızı) yumuşak kenar saydamlığı, örnek rengi örnek başına saydamlık: ikisi çarpılır.
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "diffuseColor.a *= vColor.r;"); };
  return m;
}
function yumusak(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}
/** Yatay halka/leke: yarıçap oranları ve o yarıçaptaki saydamlık. */
function yatayGeo(rr, aa, n = 24) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i < rr.length; i++) for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU; pos.push(Math.cos(a) * rr[i], 0, Math.sin(a) * rr[i]); col.push(aa[i], aa[i], aa[i]);
  }
  for (let i = 0; i < rr.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * n + k, b = i * n + ((k + 1) % n); idx.push(a, a + n, b, b, a + n, b + n);
  }
  return yumusak(pos, col, idx);
}
/** Yumuşak puf (kameraya dönük disk): merkez opak, kenar saydam. */
function pufGeo() {
  const rr = [0, 0.35, 0.65, 0.85, 1], aa = [1, 0.85, 0.5, 0.18, 0], n = 16, pos = [], col = [], idx = [];
  for (let i = 0; i < rr.length; i++) for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, w = 1 + (i > 1 ? 0.12 * Math.sin(a * 3 + i) : 0); // hafif düzensiz kenar
    pos.push(Math.cos(a) * rr[i] * w, Math.sin(a) * rr[i] * w, 0); col.push(aa[i], aa[i], aa[i]);
  }
  for (let i = 0; i < rr.length - 1; i++) for (let k = 0; k < n; k++) {
    const a = i * n + k, b = i * n + ((k + 1) % n); idx.push(a, b, a + n, b, b + n, a + n);
  }
  return yumusak(pos, col, idx);
}
function pufMalzeme() {
  // Örnek matrisinin konumu ve ölçeği alınır, disk kameraya döndürülür (billboard); saydamlık köşe × örnek rengi.
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, vertexColors: true, fog: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <project_vertex>", `
      vec4 pc = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float psx = length(instanceMatrix[0].xyz), psy = length(instanceMatrix[1].xyz);
      vec3 pr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), pu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec4 mvPosition = viewMatrix * vec4(pc.xyz + pr * transformed.x * psx + pu * transformed.y * psy, 1.0);
      gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", "diffuseColor.a *= vColor.r;");
  };
  return m;
}
function bulutGeo() {
  const g = new THREE.IcosahedronGeometry(1, 1); g.deleteAttribute("uv"); g.deleteAttribute("normal");
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = 0.5 + 0.5 * Math.max(0, p.getY(i)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Köpük havuzu: damla (katı küçük küre), leke (yatay yumuşak leke), halka (yatay halka), bulut (yumuşak sis/serpinti
 * kümesi), puf (kameraya dönük yumuşak disk: su tozu; ölçek x/y kullanılır). sayilar: { damla, leke, halka, bulut }. Her karede bas(isik) → ekle… → bitir(). Ekleme: (x, y, z, sx, sy, sz,
 * alfa, ry). İsik (0–1) köpüğü alacakaranlıkta söndürür.
 */
export function kopukHavuzu(group, sayilar) {
  const kMat = kopukMalzeme();
  const dMat = new THREE.MeshBasicMaterial({ color: 0xf2f9fc });
  const geo = { damla: () => new THREE.IcosahedronGeometry(1, 0), leke: () => yatayGeo([0, 0.45, 0.8, 1], [1, 0.8, 0.35, 0], 18), halka: () => yatayGeo([0.72, 0.84, 0.92, 1], [0, 1, 0.8, 0], 28), bulut: () => bulutGeo(), puf: () => pufGeo() };
  const pMat = sayilar.puf ? pufMalzeme() : null;
  const H = {}, P = {};
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  for (const [ad, n] of Object.entries(sayilar)) {
    if (!n) continue;
    const m = new THREE.InstancedMesh(geo[ad](), ad === "damla" ? dMat : ad === "puf" ? pMat : kMat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.renderOrder = 3;
    for (let i = 0; i < n; i++) m.setColorAt(i, C.setRGB(1, 1, 1));
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    H[ad] = m; P[ad] = 0;
  }
  const ekle = (ad, x, y, z, sx, sy, sz, alfa = 1, ry = 0) => {
    const m = H[ad], i = P[ad];
    if (!m || i >= m.instanceMatrix.count || alfa <= 0.003) return;
    _q.setFromAxisAngle(_Y, ry); _p.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s); m.setMatrixAt(i, _m);
    if (ad !== "damla") m.setColorAt(i, C.setRGB(alfa, alfa, alfa));
    P[ad] = i + 1;
  };
  return {
    ekle,
    bas(isik = 1) {
      for (const k in P) P[k] = 0;
      const l = 0.45 + 0.55 * Math.min(1, Math.max(0, isik));
      kMat.color.setScalar(l); dMat.color.setRGB(0.95 * l, 0.98 * l, l); if (pMat) pMat.color.setScalar(0.92 * l);
    },
    bitir() {
      for (const k in H) {
        const m = H[k], n = P[k];
        m.count = n;
        if (n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
      }
    },
    /** Sıçrama: (x, z) su yüzünde, str gücü, age saniye önce, olc boyut. Damlalar + halka + leke. */
    sicrama(x, z, str, age, tohum, olc = 1, y0 = 0) {
      const omur = 2.2 + 0.3 * str;
      if (age < 0 || age > omur) return;
      const k = Math.sqrt(str), n = Math.min(40, Math.round(8 + 14 * str));
      for (let i = 0; i < n; i++) {
        const r1 = hr(tohum, i, 1), r2 = hr(tohum, i, 2), r3 = hr(tohum, i, 3), r4 = hr(tohum, i, 4);
        const tk = age - 0.08 * r4;
        if (tk < 0) continue;
        const vy = (1.6 + 3.4 * r2) * k;
        const y = vy * tk - 4.9 * tk * tk;
        if (y < 0) continue;
        const a = r1 * TAU, d = (0.4 + 1.4 * r3) * k * olc * 0.8 * tk + 0.12 * olc;
        const sz = (0.03 + 0.06 * r4 * r4) * (0.7 + 0.5 * k) * olc;
        ekle("damla", x + Math.cos(a) * d, y0 + y, z + Math.sin(a) * d, sz, sz * 1.3, sz);
      }
      const u = age / omur, r = (0.4 + 1.8 * Math.sqrt(age)) * k * olc;
      ekle("halka", x, y0 + 0.05, z, r, 1, r, 0.6 * Math.pow(1 - u, 1.4));
      const rl = (0.4 + 0.5 * Math.sqrt(age)) * k * olc;
      ekle("leke", x, y0 + 0.04, z, rl, 1, rl, 0.8 * Math.pow(1 - u, 2));
    },
  };
}

/** Gökyüzünü kısmen karartır (sky.update'ten sonra; hava.js fırtınasıyla aynı yaklaşım, daha hafif). k 0–1. */
const GRI = { top: new THREE.Color("#59626d"), hor: new THREE.Color("#8a939c"), hemi: new THREE.Color("#a3adb9") };
const _t = new THREE.Color();
export function gokKarart(sky, scene, k, light = 1, renk = GRI) {
  if (!sky || k <= 0.001) return;
  const SU = sky.dome?.material?.uniforms, gun = 0.2 + 0.8 * light;
  if (SU?.top) SU.top.value.lerp(_t.copy(renk.top).multiplyScalar(gun), k * 0.9);
  if (SU?.horizon) SU.horizon.value.lerp(_t.copy(renk.hor).multiplyScalar(gun), k * 0.85);
  if (SU?.glow) SU.glow.value.multiplyScalar(1 - 0.8 * k);
  if (sky.sun) sky.sun.intensity *= 1 - 0.6 * k;
  if (sky.hemi) sky.hemi.color.lerp(renk.hemi, k * 0.6);
  scene.fog.color.lerp(_t.copy(renk.hor).multiplyScalar(gun), k * 0.8);
}

/** Kıyı yerinin adı (metin için): { ad, in (tamlayan: "Sahil yolunun"), da (bulunma: "Sahil yolunda"), i (belirtme: "sahil yolunu") }. Türkçede
 *  özel ad kesmeyle; İngilizcede in/da "off the …"/"on the …" kalıbına girecek ad ("the waterfront"). */
export function kiyiAdi(world, yer, dil) {
  const L = world.labels ?? [], [x, z] = yer.W;
  let lb = null, dmin = 160;
  for (const l of L) { const d = Math.hypot((l.x ?? 0) - x, (l.z ?? 0) - z); if (d < dmin && /İskele|Liman|Plaj|Landing|Wharf|Beach|Pier/i.test(l.text ?? "")) { dmin = d; lb = l.text; } }
  if (dil === "en") {
    if (yer.ad === "plaj") return { ad: "the beach" };
    if (lb) return { ad: `the ${lb}` };
    return { ad: yer.ad === "iskele" ? "the fishing pier" : "the waterfront" };
  }
  if (yer.ad === "sahil_yolu") return { ad: "Sahil yolu", in: "Sahil yolunun", da: "Sahil yolunda", i: "sahil yolunu" };
  if (yer.ad === "plaj") return { ad: "Plaj", in: "Plajın", da: "Plajda", i: "plajı" };
  if (yer.ad === "iskele") return { ad: "Balık iskelesi", in: "Balık iskelesinin", da: "Balık iskelesinde", i: "balık iskelesini ve sahil yolunu" };
  if (lb === "Vapur İskelesi") return { ad: lb, in: "Vapur İskelesi'nin", da: "Vapur İskelesi'nde", i: "Vapur İskelesi'ni" };
  if (lb === "Yük Limanı") return { ad: lb, in: "Yük Limanı'nın", da: "Yük Limanı'nda", i: "Yük Limanı'nı" };
  return { ad: "Kıyı", in: "kıyının", da: "kıyıda", i: "kıyıyı" };
}
