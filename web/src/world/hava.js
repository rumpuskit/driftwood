// Hava olayları (16 Kasım 2026): fırtına (bulut tavanı, yağmur, şimşek, gökkuşağı) ve deniz sisi. olay.js çağırır.
// Arayüz: buildHava({ world, scene, sky }) → { group, durum, bilgi, simsekler, update(o, evre, minute, real, env) }
//   o: günün olayı (olay-plan.js) ya da null; evre: olayEvre(o, minute); env: { camera, light, sunDeg, dt }
//   durum (0–1; ses ve sakinler okur): yagmur, sis, karanlik, simsek (çakış nabzı), gokkusagi, ruzgar,
//     simsekNo (her çakışta artar: ses gök gürültüsünü bununla tetikler), simsekMesafe (m, kameradan)
//   bilgi (video çekimi için): gokkusagi [x, z] (gökkuşağının ufuktaki yönü, birim), ruzgar [x, z] (rüzgârın estiği yön),
//     simsek { x, y, z, t } (son çakışın yer noktası ve dakikası) | null
//   simsekler(o, m0, m1): o aralıktaki çakış dakikaları (araç; her çağrıda dizi kurar)
//
// Video kaydı (kaydet.mjs) kareleri sanal saatle adımlar: zamanlaması önemli her şey (yoğunluk, çakışlar, gökkuşağı) yalnız
// sim dakikasına ve o.tohum'a bağlıdır (Math.random yok). Yağmur çizgilerinin akışı `real` ile (yalnız görünüm).
// Gök: sky.update'ten SONRA çağrılır; sky her karede ışıkları ve renkleri baştan kurduğu için burada yalnız üstüne
// yazılır (sis uzaklığı hariç: olay bitince ilk değere döner). Olay yokken grup gizli, kare başına iş yok.
import * as THREE from "three";

const ss = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const lerp = THREE.MathUtils.lerp;
const lerpLog = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));

// Tam sayı karması (dize kurmaz; kare başına çağrılabilir): (a, b) → [0, 1).
function karma(a, b) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 13; h = Math.imul(h, 0x165667b1); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// Yumuşak 1B gürültü (dakikaya bağlı esinti/yoğunluk dalgası).
function gurultu(x, tohum) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(karma(tohum, i), karma(tohum, i + 1), u);
}

// Görünen renkler (sRGB). Gök kubbesi ve sis aynı rengi aynı dönüşümle gösterir (sky.js gibi sis = ufuk): dikiş yok.
const C = (h) => new THREE.Color(h);
const FIRTINA = { top: C("#363d46"), hor: C("#5f6873"), koyu: C("#1f242b"), acik: C("#5e6670"), parca: C("#6d757e"),
  hemi: C("#8e9aaa"), zemin: C("#4a4a46"), gunes: C("#c9ced6"), yagmur: C("#c4ccd6"), cakim: C("#e4e8ff") };
const SIS = { gece: C("#3a4350"), safak: C("#9aa6b4"), gun: C("#cfd4d8"), hemi: C("#eef1f3"), zemin: C("#b8b6ae") };
const BEYAZ = C("#ffffff");

// Şimşek takvimi: yaklaşmanın %60'ından dinmenin yarısına dek, 35–90 sn arayla (ortada sıklaşır).
const SIMSEK_BAS = 0.16 * 0.6, SIMSEK_SON = 0.84 + 0.16 * 0.5;
const BULUT_TABAN = 600; // m: fırtına bulutunun tabanı (sahnedeki beyaz bulutlar 520–640 m: fırtınada gizlenir)

// Çakış: 2–4 boşalma (vuruş), her biri hızlı söner. Video 4× hızla adımlarken (kare başına ~0,13 sn) okunsun diye
// vuruşlar geniş (τ 0,09 sn) ve toplam ~0,4–0,7 sn. s: çakıştan beri saniye. Döner: parlaklık 0–1.
function cakisEgrisi(s, tohum, i) {
  if (s < 0 || s > 1.2) return 0;
  const n = 2 + Math.floor(karma(tohum, i * 13 + 5) * 3);
  let v = 0, t = 0;
  for (let k = 0; k < n; k++) {
    if (k) t += 0.1 + 0.12 * karma(tohum, i * 13 + 6 + k);
    const a = k === 0 ? 1 : 0.55 + 0.45 * karma(tohum, i * 13 + 9 + k);
    if (s >= t) v = Math.max(v, a * Math.exp(-(s - t) / 0.09));
  }
  return v;
}
function cakisSuresi(tohum, i) {
  const n = 2 + Math.floor(karma(tohum, i * 13 + 5) * 3);
  let t = 0;
  for (let k = 1; k < n; k++) t += 0.1 + 0.12 * karma(tohum, i * 13 + 6 + k);
  return t + 0.22;
}

export function buildHava({ world, scene, sky }) {
  const group = new THREE.Group();
  group.name = "hava";
  group.visible = false;
  const durum = { yagmur: 0, sis: 0, karanlik: 0, simsek: 0, gokkusagi: 0, ruzgar: 0, simsekNo: 0, simsekMesafe: 0 };
  const bilgi = { gokkusagi: [0, 1], ruzgar: [1, 0], simsek: null };
  const fog0 = { near: scene.fog.near, far: scene.fog.far };
  const B = world.bounds, merkez = [(B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2];
  const SU = sky.dome.material.uniforms;

  // --- fırtına bulutu: kameraya bağlı gök kubbesi, bulut tabanı düzlemiyle kesişimde akan fbm (iki katman) + gökkuşağı ---
  const bu = {
    uCam: { value: new THREE.Vector3() }, uTaban: { value: BULUT_TABAN }, uOrtu: { value: 0 }, uKarsi: { value: 0 },
    uRuz: { value: new THREE.Vector2() }, uRuz2: { value: new THREE.Vector2() }, uCephe: { value: new THREE.Vector2(1, 0) },
    uKoyu: { value: new THREE.Color() }, uAcik: { value: new THREE.Color() }, uParca: { value: new THREE.Color() }, uUfuk: { value: new THREE.Color() },
    uCakim: { value: 0 }, uCakimYon: { value: new THREE.Vector3(0, 1, 0) }, uGunes: { value: new THREE.Vector3(0, 1, 0) }, uYay: { value: 0 },
  };
  const kubbe = new THREE.Mesh(
    new THREE.SphereGeometry(14000, 40, 20),
    new THREE.ShaderMaterial({
      uniforms: bu, side: THREE.BackSide, depthWrite: false, transparent: true, premultipliedAlpha: true, fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
        }`,
      fragmentShader: `
        uniform vec3 uCam; uniform float uTaban; uniform float uOrtu; uniform float uKarsi; uniform vec2 uRuz; uniform vec2 uRuz2; uniform vec2 uCephe;
        uniform vec3 uKoyu; uniform vec3 uAcik; uniform vec3 uParca; uniform vec3 uUfuk;
        uniform float uCakim; uniform vec3 uCakimYon; uniform vec3 uGunes; uniform float uYay;
        varying vec3 vDir;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float a = 0.5, s = 0.0;
          for (int i = 0; i < 5; i++) { s += a * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
          return s;
        }
        float fbm3(vec2 p) { // bükme için kaba (ucuz) sürüm
          float s = 0.5 * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; s += 0.25 * vn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p;
          return (s + 0.125 * vn(p)) * 1.143;
        }
        vec3 tayf(float x) { // 0 mor … 1 kırmızı
          float h = (1.0 - x) * 0.78;
          return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        }
        void main() {
          vec3 d = normalize(vDir);
          if (d.y < -0.02) discard; // ufkun altı: sahne örter
          vec3 col = vec3(0.0); float a = 0.0;
          if (d.y > 0.0 && uOrtu > 0.001) {
            float yuk = max(uTaban, uCam.y + 150.0);
            float t = (yuk - uCam.y) / max(d.y, 0.015);
            vec2 w = uCam.xz + d.xz * t;
            vec2 p = w * 0.0011;
            vec2 bk = vec2(fbm3(p * 0.45 + uRuz * 0.5), fbm3(p * 0.45 - uRuz * 0.5 + 5.2)) * 1.8; // alan bükme: kabarık
            float n1 = fbm(p + bk + uRuz), n2 = fbm(p * 2.3 + bk * 0.7 - uRuz * 1.4 + 7.3);
            vec2 ys = normalize(d.xz + 1e-4), gk = normalize(-uGunes.xz + 1e-4);
            float karsi = max(dot(ys, gk), 0.0);
            // Fırtına cephesi rüzgârın geldiği yandan gelir: örtü o yanda önce dolar, karşı yanda sonra.
            float cephe = dot(ys, uCephe) * uOrtu * (1.0 - uOrtu) * 1.7;
            float ortu = clamp(uOrtu + cephe + uKarsi * karsi * karsi, 0.0, 1.0);
            float yog = smoothstep(1.0 - ortu - 0.08, 1.0 - ortu + 0.32, n1 * 0.7 + n2 * 0.38);
            // Uzakta (yatık bakış) gürültü titrer: ortalamasına yaklaştır.
            float lod = smoothstep(3500.0, 12000.0, t);
            yog = mix(yog, smoothstep(0.0, 1.0, ortu) * 0.92, lod);
            // Alt yüz: koyu kabarıklar, aralarında açık damarlar; uzakta ufuk rengine karışır.
            float doku = mix(smoothstep(0.35, 0.9, n2 * 0.55 + n1 * 0.6), 0.5, lod);
            vec3 c = mix(uAcik, uKoyu, doku * 0.85 + 0.15 * yog);
            c *= 1.0 - 0.45 * karsi * min(1.0, uKarsi * 2.0); // gökkuşağının ardındaki yağmur bulutu koyu
            // Alçak parça bulutlar: daha hızlı akar, açık gri, yırtık.
            float t2 = (yuk * 0.55 - uCam.y) / max(d.y, 0.015);
            float y2 = 0.0;
            if (t2 > 0.0 && uOrtu > 0.35) {
              float m = fbm((uCam.xz + d.xz * t2) * 0.0024 + uRuz2);
              y2 = smoothstep(0.56, 0.78, m) * smoothstep(0.35, 0.9, uOrtu) * 0.75 * (1.0 - smoothstep(2000.0, 7000.0, t2));
              c = mix(c, uParca * (0.85 + 0.3 * m), y2);
            }
            float uzak = 1.0 - exp(-t / 5200.0);
            c = mix(c, uUfuk, uzak * 0.8);
            // Uzak yağmur perdeleri: ufkun hemen üstünde, yer yer koyu sarkan şeritler.
            float az = atan(d.z, d.x);
            float perde = smoothstep(0.45, 0.75, vn(vec2(az * 9.0 + uRuz.x * 0.3, 0.5))) * smoothstep(0.16, 0.0, d.y) * smoothstep(0.5, 1.0, uOrtu);
            c = mix(c, uKoyu * 1.15, perde * 0.55);
            c += uCakim * vec3(0.82, 0.86, 1.0) * (0.12 + 1.1 * pow(max(dot(d, uCakimYon), 0.0), 9.0)) * (1.0 - 0.45 * doku);
            a = max(max(yog, y2) * smoothstep(0.0, 0.06, d.y), perde * 0.6 * smoothstep(-0.01, 0.02, d.y));
            col = c * a;
          }
          // Gökkuşağı: güneşin tam karşısında 40,5–42,5° (dışı kırmızı), soluk ikinci yay 50–53,5° (ters sıra).
          if (uYay > 0.001) {
            float ang = degrees(acos(clamp(dot(d, -uGunes), -1.0, 1.0)));
            float x1 = (ang - 40.6) / 1.9, x2 = (53.6 - ang) / 3.2;
            float b1 = smoothstep(0.0, 0.25, x1) * smoothstep(1.0, 0.8, x1);
            float b2 = smoothstep(0.0, 0.25, x2) * smoothstep(1.0, 0.7, x2) * 0.32;
            float ic = smoothstep(40.5, 25.0, ang) * smoothstep(5.0, 30.0, ang) * 0.045; // yayın içi hafif aydınlık
            float yer = smoothstep(-0.005, 0.05, d.y) * (0.8 + 0.2 * vn(vec2(atan(d.z, d.x) * 3.0, 1.0)));
            col += (tayf(clamp(x1, 0.0, 1.0)) * b1 + tayf(clamp(1.0 - x2, 0.0, 1.0)) * b2 + vec3(ic)) * 0.55 * uYay * yer;
          }
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    }),
  );
  kubbe.renderOrder = -1; // saydamlardan önce: sonra çizilen saydam yüzeyler (ağaç tepeleri, su) bulutla örtülmez
  kubbe.frustumCulled = false;
  group.add(kubbe);

  // --- sis kıyısı: denizden gelen sis yığını (gelişte). Adanın çevresinde elips duvar + dışında sis tavanı; yarıçap
  // küçülerek kıyıya yaklaşır, kıyıya varınca söner ve yerini uzaklık sisi alır. Kuşbakışında "sis denizi" görünür.
  const ku = { uMer: { value: new THREE.Vector2(merkez[0], merkez[1]) }, uR: { value: 3000 }, uA: { value: 0 }, uRenk: { value: new THREE.Color() }, uKay: { value: new THREE.Vector2() } };
  const kiyiOrtak = `
    uniform vec2 uMer; uniform float uR; uniform float uA; uniform vec3 uRenk; uniform vec2 uKay;
    varying vec3 vW;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
    float elips(vec2 w) { vec2 d = w - uMer; return length(vec2(d.x, d.y * 2.0)); }`;
  const kiyiVert = "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
  const tavan = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: ku, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, vertexShader: kiyiVert,
    fragmentShader: kiyiOrtak + `
      void main() {
        float n = fbm(vW.xz * 0.004 + uKay), e = elips(vW.xz) + (n - 0.5) * 120.0;
        float a = smoothstep(uR - 160.0, uR + 40.0, e) * (0.88 + 0.12 * n) * uA; // iç kenar duvarın tepesine oturur
        gl_FragColor = vec4(uRenk * (0.93 + 0.12 * fbm(vW.xz * 0.012 - uKay * 2.0)), a);
        #include <colorspace_fragment>
      }`,
  }));
  tavan.position.y = 46;
  const duvar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({
    uniforms: ku, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, vertexShader: kiyiVert,
    fragmentShader: kiyiOrtak + `
      void main() {
        float az = atan(vW.z - uMer.y, vW.x - uMer.x);
        float n = fbm(vec2(az * 14.0, vW.y * 0.03) + uKay * 3.0);
        float y = vW.y / 46.0;
        float a = (1.0 - smoothstep(0.55 + 0.4 * n, 1.08, y)) * (0.7 + 0.3 * n) * uA;
        gl_FragColor = vec4(uRenk * (0.9 + 0.12 * n), a);
        #include <colorspace_fragment>
      }`,
  }));
  duvar.renderOrder = tavan.renderOrder = 4;
  duvar.frustumCulled = tavan.frustumCulled = false;
  const kiyi = new THREE.Group();
  kiyi.add(tavan, duvar);
  kiyi.visible = false;
  group.add(kiyi);

  // --- yağmur: kameranın önünde dünyaya bağlı, sarmalanan iki kutu (yakın 16 m, uzak 64 m): bütün damlalar kadrajda ---
  const YAKIN = 3600, UZAK = 2400, N = YAKIN + UZAK;
  const yg = new THREE.InstancedBufferGeometry();
  yg.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  yg.setIndex([0, 1, 2, 2, 1, 3]);
  {
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      seed[i * 4] = karma(i, 11); seed[i * 4 + 1] = karma(i, 12); seed[i * 4 + 2] = karma(i, 13);
      seed[i * 4 + 3] = (i < YAKIN ? 0 : 1) + karma(i, 14) * 0.999; // tam kısım: katman, kesir: eşik
    }
    yg.setAttribute("seed", new THREE.InstancedBufferAttribute(seed, 4));
  }
  yg.instanceCount = N;
  const yu = {
    uCam: { value: new THREE.Vector3() }, uIleri: { value: new THREE.Vector3(0, 0, -1) }, uHiz: { value: new THREE.Vector3(0, -9.5, 0) }, uZaman: { value: 0 },
    uMiktar: { value: 0 }, uRenk: { value: new THREE.Color() }, uOpak: { value: 0.28 },
  };
  const yagmur = new THREE.Mesh(yg, new THREE.ShaderMaterial({
    uniforms: yu, transparent: true, depthWrite: false, fog: false,
    vertexShader: `
      attribute vec4 seed;
      uniform vec3 uCam; uniform vec3 uIleri; uniform vec3 uHiz; uniform float uZaman; uniform float uMiktar;
      varying float vA; varying float vS; varying float vT;
      void main() {
        float uzak = floor(seed.w);
        float S = mix(16.0, 64.0, uzak);
        vec3 mer = uCam + uIleri * (S * 0.42);
        vec3 bas = mer + mod(seed.xyz * S + uHiz * uZaman * mix(1.0, 1.08, seed.y) - mer + 0.5 * S, S) - 0.5 * S;
        vec3 q = bas - uCam;
        float L = length(q);
        float boy = mix(0.05, 0.12, uzak); // saniye: hareket bulanıklığı (çizgi boyu = hız × süre)
        vec3 kuyruk = bas - uHiz * boy;
        vec3 yon = bas - kuyruk;
        vec3 yan = normalize(cross(yon, cameraPosition - bas));
        float iz = 0.006 * mix(1.0, 1.6, uzak); // damla izinin gerçek eni (m)
        float gen = max(iz, L * 0.0011);        // en az ~1 piksel; incelen iz saydamlaşır
        vec3 p = mix(kuyruk, bas, position.y) + yan * position.x * gen;
        float var_ = step(fract(seed.w), uMiktar * mix(1.0, 0.85, uzak));
        vA = var_ * smoothstep(0.9 * S, 0.6 * S, L) * smoothstep(0.8, 2.5, L) * mix(0.75, 1.0, smoothstep(2.0, 8.0, L)) * mix(1.0, 0.75, uzak) * clamp(iz / gen * 2.2, 0.35, 1.0);
        vS = position.x; vT = position.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        if (var_ < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uRenk; uniform float uOpak;
      varying float vA; varying float vS; varying float vT;
      void main() {
        float a = vA * uOpak * (1.0 - vS * vS) * smoothstep(0.0, 0.6, vT) * (0.55 + 0.45 * vT);
        if (a < 0.003) discard;
        gl_FragColor = vec4(uRenk, a);
        #include <colorspace_fragment>
      }`,
  }));
  yagmur.frustumCulled = false;
  yagmur.renderOrder = 5;
  group.add(yagmur);

  // --- şimşek: kameraya dönük şerit (ana kanal 128 parça + 4 dal × 64), çekirdek ve hale tek çizimde ---
  const DAL = 4, ANA = 129, DALN = 65, NP = ANA + DAL * DALN;
  const sp = new Float32Array(NP * 3), sYon = new Float32Array(NP * 3), sBr = new Float32Array(NP);
  const sg = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(new Float32Array(NP * 6), 3), aYon = new THREE.BufferAttribute(new Float32Array(NP * 6), 3);
  const aYan = new THREE.BufferAttribute(new Float32Array(NP * 2), 1), aBr = new THREE.BufferAttribute(new Float32Array(NP * 2), 1);
  for (let i = 0; i < NP; i++) { aYan.array[i * 2] = -1; aYan.array[i * 2 + 1] = 1; }
  sg.setAttribute("position", aPos); sg.setAttribute("aYon", aYon); sg.setAttribute("aYan", aYan); sg.setAttribute("aBr", aBr);
  {
    const idx = [];
    const serit = (s, n) => { for (let k = s; k < s + n - 1; k++) { const v = k * 2; idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3); } };
    serit(0, ANA);
    for (let b = 0; b < DAL; b++) serit(ANA + b * DALN, DALN);
    sg.setIndex(idx);
  }
  const su = { uParlak: { value: 0 }, uGen: { value: 2.0 } };
  const simsek = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    uniforms: su, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute vec3 aYon; attribute float aYan; attribute float aBr;
      uniform float uGen;
      varying float vS; varying float vBr;
      void main() {
        vec3 k = cameraPosition - position;
        vec3 yan = normalize(cross(aYon, k) + 1e-5);
        float g = uGen * max(1.0, length(k) * 0.0028) * (0.45 + 0.55 * aBr);
        vS = aYan; vBr = aBr;
        gl_Position = projectionMatrix * viewMatrix * vec4(position + yan * aYan * g, 1.0);
      }`,
    fragmentShader: `
      uniform float uParlak;
      varying float vS; varying float vBr;
      void main() {
        float x = vS * vS;
        float cek = exp(-x * 80.0), hale = exp(-x * 6.0) * 0.28;
        vec3 c = mix(vec3(0.55, 0.62, 1.0), vec3(1.0, 0.98, 1.0), cek);
        gl_FragColor = vec4(c * (cek * 2.6 + hale) * uParlak * vBr, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  simsek.frustumCulled = false;
  simsek.renderOrder = 6;
  simsek.visible = false;
  group.add(simsek);

  // Tohumlu rastgele (yalnız çakış başında kurulur).
  function rng(a, b) {
    let s = (karma(a, b) * 4294967296) >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Orta nokta kaydırmasıyla kırık çizgi: sp[o..o+n] (n parça, 2'nin kuvveti).
  function kirik(o, n, ax, ay, az, bx, by, bz, gen, r) {
    sp.set([ax, ay, az], o * 3); sp.set([bx, by, bz], (o + n) * 3);
    // Büyük ölçekte hafif kıvrım, küçük ölçekte sert zikzak (gerçek kanal 10–30 m'lik kırıklardan oluşur).
    let amp = gen, kat = 0;
    for (let st = n; st > 1; st >>= 1, kat++) {
      amp = kat === 0 ? gen : kat === 1 ? gen * 1.1 : kat === 2 ? 0.32 : 0.72;
      for (let i = 0; i < n; i += st) {
        const A = (o + i) * 3, Z = (o + i + st) * 3, M = (o + i + st / 2) * 3;
        const L = Math.hypot(sp[Z] - sp[A], sp[Z + 1] - sp[A + 1], sp[Z + 2] - sp[A + 2]);
        sp[M] = (sp[A] + sp[Z]) / 2 + (r() - 0.5) * L * amp;
        sp[M + 1] = (sp[A + 1] + sp[Z + 1]) / 2 + (r() - 0.5) * L * amp * 0.35;
        sp[M + 2] = (sp[A + 2] + sp[Z + 2]) / 2 + (r() - 0.5) * L * amp;
      }
    }
  }
  const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  let cakis = { no: -1, t: 0, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, guc: 1, sure: 0.5 };
  // Çakışı kurar: yer noktası (kameranın baktığı yerin ötesi, ada ya da fener), kanal ve dallar.
  function cakisKur(o, i, t, camera) {
    const T = o.tohum, r = rng(T, i * 31 + 7), tur = r();
    let gx, gz, gy;
    if (tur < 0.12 && world.fener) {
      gx = world.fener.x; gz = world.fener.z; gy = world.height(gx, gz) + 23.5;
    } else if (tur < 0.7) {
      // Kameranın bakışının yere değdiği noktanın 60–360 m ötesi, görüş açısı içinde (dikey kadrajda da görünür).
      camera.getWorldDirection(v3);
      const yatay = Math.hypot(v3.x, v3.z) || 1, fx = v3.x / yatay, fz = v3.z / yatay;
      // Sokak kamerasında (bakış yere yakın değer) en az 350 m: çatıların ardında, gökte okunur.
      const yer = v3.y < -0.05 ? Math.min(900, camera.position.y / -v3.y) * yatay : 350;
      const D = Math.max(350, yer) + 60 + 300 * r();
      const ac = (r() - 0.5) * 2 * 0.15;
      const c = Math.cos(ac), s = Math.sin(ac);
      gx = camera.position.x + (fx * c - fz * s) * D; gz = camera.position.z + (fx * s + fz * c) * D;
      gy = Math.max(0, world.height(gx, gz));
    } else {
      const a = r() * Math.PI * 2, R = 150 + 450 * r();
      gx = merkez[0] + Math.cos(a) * R; gz = merkez[1] + Math.sin(a) * R; gy = Math.max(0, world.height(gx, gz));
    }
    const tx = gx + (r() - 0.5) * 240, tz = gz + (r() - 0.5) * 240, ty = BULUT_TABAN + 40;
    kirik(0, ANA - 1, tx, ty, tz, gx, gy, gz, 0.22, r);
    sBr.fill(1, 0, ANA);
    for (let k = 0; k < ANA; k++) sBr[k] = 0.75 + 0.25 * (k / (ANA - 1));
    const dalSay = 2 + Math.floor(r() * 3);
    v4.setFromMatrixColumn(camera.matrixWorld, 0);
    const sagN = Math.hypot(v4.x, v4.z) || 1, sagX = v4.x / sagN, sagZ = v4.z / sagN;
    for (let b = 0; b < DAL; b++) {
      const o0 = ANA + b * DALN;
      if (b >= dalSay) { sp.fill(0, o0 * 3, (o0 + DALN) * 3); sBr.fill(0, o0, o0 + DALN); continue; }
      const j = 40 + Math.floor(r() * 70), J = j * 3;
      const yuk = sp[J + 1] - gy, boy = yuk * (0.22 + 0.3 * r());
      // Dallar ekranda yana açılır (kameranın sağ/sol yönünde), yoksa ana kanalın arkasında kaybolur.
      const yan = (b % 2 ? 1 : -1) * (0.3 + 0.4 * r());
      const yx = sagX * yan + (r() - 0.5) * 0.4, yz = sagZ * yan + (r() - 0.5) * 0.4, n = Math.hypot(yx, 1, yz);
      kirik(o0, DALN - 1, sp[J], sp[J + 1], sp[J + 2], sp[J] + (yx / n) * boy, sp[J + 1] - boy / n, sp[J + 2] + (yz / n) * boy, 0.4, r);
      for (let k = 0; k < DALN; k++) sBr[o0 + k] = 0.7 * (1 - k / (DALN - 1)) ** 1.1;
    }
    // Teğetler ve şerit köşeleri (her nokta iki köşe).
    const ser = (s, n) => {
      for (let k = s; k < s + n; k++) {
        const a = Math.max(s, k - 1) * 3, z = Math.min(s + n - 1, k + 1) * 3;
        sYon[k * 3] = sp[z] - sp[a]; sYon[k * 3 + 1] = sp[z + 1] - sp[a + 1]; sYon[k * 3 + 2] = sp[z + 2] - sp[a + 2];
      }
    };
    ser(0, ANA);
    for (let b = 0; b < DAL; b++) ser(ANA + b * DALN, DALN);
    for (let k = 0; k < NP; k++) {
      for (let e = 0; e < 2; e++) {
        const v = (k * 2 + e) * 3;
        aPos.array[v] = sp[k * 3]; aPos.array[v + 1] = sp[k * 3 + 1]; aPos.array[v + 2] = sp[k * 3 + 2];
        aYon.array[v] = sYon[k * 3]; aYon.array[v + 1] = sYon[k * 3 + 1]; aYon.array[v + 2] = sYon[k * 3 + 2];
        aBr.array[k * 2 + e] = sBr[k];
      }
    }
    aPos.needsUpdate = aYon.needsUpdate = aBr.needsUpdate = true;
    const mesafe = Math.hypot(gx - camera.position.x, gy - camera.position.y, gz - camera.position.z);
    cakis = { no: i, t, x: gx, y: gy, z: gz, tx, ty, tz, guc: 0.6 + 0.4 * (1 - Math.min(1, mesafe / 1600)), sure: cakisSuresi(T, i), mesafe };
    bilgi.simsek = { x: gx, y: gy, z: gz, t };
  }

  // Çakış takvimi: i. çakışın dakikası (önbellekli ilerleme; geri sarınca baştan).
  const tk = { tohum: -1, i: -1, t: 0, son: 0 };
  function aralik(o, i) {
    const sure = o.son - o.bas, u = (tk.t - o.bas) / sure;
    const orta = 1 - 0.35 * Math.exp(-(((u - 0.5) / 0.22) ** 2)); // fırtınanın ortasında sık
    return ((35 + 55 * karma(o.tohum, i * 7 + 3)) * orta) / 60;
  }
  function takvim(o, minute) {
    const sure = o.son - o.bas, bas = o.bas + SIMSEK_BAS * sure, son = o.bas + SIMSEK_SON * sure;
    if (tk.tohum !== o.tohum || tk.i < 0 || minute < tk.t) {
      tk.tohum = o.tohum; tk.son = son; tk.t = bas + (10 + 30 * karma(o.tohum, 1)) / 60;
      tk.i = minute < tk.t ? -1 : 0;
      if (tk.i < 0) return;
    }
    for (;;) {
      const n = tk.t + aralik(o, tk.i);
      if (n > minute || n > son) break;
      tk.t = n; tk.i++;
    }
  }
  function simsekler(o, m0, m1) {
    const out = [];
    if (!o || o.tur !== "firtina") return out;
    const kayit = { ...tk };
    tk.tohum = -1;
    for (let m = m0; m <= m1; m += 0.25) {
      takvim(o, m);
      if (tk.i >= 0 && tk.t >= m0 && tk.t <= m1 && tk.t <= tk.son && out[out.length - 1] !== tk.t) out.push(tk.t);
    }
    Object.assign(tk, kayit);
    return out;
  }

  // --- deniz feneri: sisli ve fırtınalı havada gündüz de yanar (city.js setFlood sarılır; sarmal yalnız bir kez) ---
  let fener = null;
  function fenerBul() {
    if (fener !== null) return;
    fener = false;
    scene.traverse((ob) => { if (!fener && ob.userData.fenerLamps && ob.userData.setFlood) fener = ob; });
    if (!fener) return;
    const asil = fener.userData.setFlood, son = [0, 0];
    fener.userData.setFlood = (s, f = s) => { son[0] = s; son[1] = f; asil(s, Math.max(f, fener.ek)); };
    fener.ek = 0;
    fener.uygula = (ek) => { if (Math.abs(ek - fener.ek) > 0.01) { fener.ek = ek; asil(son[0], Math.max(son[1], ek)); } };
  }
  // Sahnedeki beyaz bulutlar (nature.js buildClouds): fırtına tavanının altında kalmasınlar.
  let beyaz = null;
  function beyazBul() {
    if (beyaz !== null) return;
    beyaz = false;
    for (const ob of scene.children) if (ob.userData.span && ob.children[0]?.material) { beyaz = ob; beyaz.op0 = ob.children[0].material.opacity; }
  }

  const tmp = new THREE.Color(), sisRenk = new THREE.Color();
  let aktif = false;
  function kapat() {
    if (!aktif) return;
    aktif = false;
    group.visible = false;
    scene.fog.near = fog0.near; scene.fog.far = fog0.far;
    for (const k in durum) if (k !== "simsekNo") durum[k] = 0;
    if (fener) fener.uygula(0);
    if (beyaz) { beyaz.children[0].material.opacity = beyaz.op0; beyaz.visible = true; }
    simsek.visible = false;
  }

  function update(o, evre, minute, real, env) {
    const tur = o?.tur;
    if (!evre || (tur !== "firtina" && tur !== "sis")) return kapat();
    if (!aktif) { aktif = true; group.visible = true; fenerBul(); beyazBul(); }
    const { camera } = env, light = env.light ?? 1;
    const T = o.tohum;
    const ruzA = karma(T, 2) * Math.PI * 2, rx = Math.cos(ruzA), rz = Math.sin(ruzA);
    bilgi.ruzgar[0] = rx; bilgi.ruzgar[1] = rz;
    const g = gurultu(minute * 0.45, T), g2 = gurultu(minute * 1.7 + 50, T ^ 0x55);

    let bulut = 0, yag = 0, ruz = 0, yay = 0, sis = 0, flas = 0, kiyiL = -1;
    if (tur === "firtina") {
      const a = evre.ad, u = evre.u;
      if (a === "yaklasma") { const l = u / 0.16; bulut = ss(l, 0, 1); yag = 0.5 * ss(l, 0.82, 1); ruz = ss(l, 0.25, 1) * (0.75 + 0.25 * g2); }
      else if (a === "yagmur") { const l = (u - 0.16) / 0.68; bulut = 1; yag = (0.5 + 0.5 * ss(l, 0, 0.05)) * lerp(1, 0.72 + 0.28 * g, ss(l, 0, 0.08)); ruz = 0.65 + 0.35 * g2; }
      else if (a === "dinme") {
        const l = (u - 0.84) / 0.16;
        bulut = 1 - 0.72 * ss(l, 0.1, 1); yag = (0.72 + 0.28 * g) * (1 - ss(l, 0, 0.8)); ruz = (0.65 + 0.35 * g2) * (1 - 0.7 * ss(l, 0, 1));
        yay = 0.45 * ss(l, 0.65, 1);
      } else { bulut = 0.28 * (1 - ss(evre.u, 0, 0.8)); ruz = 0.2 * (1 - evre.u); yay = (0.45 + 0.55 * ss(evre.u, 0, 0.08)) * (1 - ss(evre.u, 0.4, 1)); }
      yay *= ss(light, 0.5, 0.8) * (env.sunDeg < 41 ? 1 : 0);

      // Şimşek: takvimdeki son çakış hâlâ sürüyorsa nabız.
      takvim(o, minute);
      if (tk.i >= 0 && tk.t <= tk.son) {
        const s = (minute - tk.t) * 60;
        if (s >= 0 && s < 1.3) {
          if (cakis.no !== tk.i || cakis.t !== tk.t) cakisKur(o, tk.i, tk.t, camera);
          flas = cakisEgrisi(s, T, tk.i) * cakis.guc;
          simsek.visible = s < cakis.sure;
          su.uParlak.value = 0.35 + 0.65 * Math.min(1, flas / cakis.guc + 0.15);
          durum.simsekNo = tk.i + 1;
          durum.simsekMesafe = cakis.mesafe;
        } else simsek.visible = false;
      } else simsek.visible = false;
    } else {
      const a = evre.ad, u = evre.u;
      if (a === "gelis") { const l = u / 0.18; sis = ss(l, 0, 1); kiyiL = l; }
      else if (a === "yogun") sis = 0.9 + 0.1 * g;
      else sis = (0.9 + 0.1 * g) * (1 - ss((u - 0.78) / 0.22, 0, 1));
      simsek.visible = false;
    }
    const k = bulut * (0.86 + 0.14 * g); // karanlık
    durum.yagmur = yag; durum.sis = sis; durum.karanlik = k; durum.simsek = flas; durum.gokkusagi = yay; durum.ruzgar = Math.max(ruz, sis * 0.15);

    // --- gök ve ışık (sky.update'in üstüne) ---
    const gun = 0.18 + 0.82 * light; // gece fırtınası da koyu, ama tamamen siyah değil
    if (k > 0 || flas > 0) {
      SU.top.value.lerp(tmp.copy(FIRTINA.top).multiplyScalar(gun), k * 0.95);
      SU.horizon.value.lerp(tmp.copy(FIRTINA.hor).multiplyScalar(gun), k * 0.92);
      SU.glow.value.multiplyScalar(1 - 0.97 * k);
      SU.night.value *= 1 - k;
      sky.sun.intensity *= 1 - 0.93 * k;
      sky.sun.color.lerp(FIRTINA.gunes, k * 0.7);
      sky.hemi.intensity = sky.hemi.intensity * (1 - 0.5 * k) + 2.4 * flas;
      sky.hemi.color.lerp(FIRTINA.hemi, k * 0.85).lerp(FIRTINA.cakim, Math.min(1, flas * 1.5));
      sky.hemi.groundColor.lerp(FIRTINA.zemin, k * 0.8);
      tmp.copy(FIRTINA.hor).multiplyScalar(gun);
      scene.fog.color.lerp(tmp, Math.min(1, k * 1.3) * 0.95);
      if (flas > 0) {
        SU.top.value.lerp(FIRTINA.cakim, flas * 0.25);
        SU.horizon.value.lerp(FIRTINA.cakim, flas * 0.22);
        scene.fog.color.lerp(FIRTINA.cakim, flas * 0.22);
      }
      const kf = Math.pow(k, 0.6); // pus örtüden önce koyulaşır (uzak deniz cephe gelirken griye döner)
      scene.fog.near = lerpLog(fog0.near, 240, kf);
      scene.fog.far = lerpLog(fog0.far, 1000, kf * (0.85 + 0.15 * yag));
    } else if (tur === "firtina") { scene.fog.near = fog0.near; scene.fog.far = fog0.far; }

    if (sis > 0) {
      // Sis rengi ışığa göre: gece mavi-gri, şafakta soğuk mavi-gri, gündüz gri-beyaz.
      sisRenk.copy(SIS.gece).lerp(SIS.safak, ss(light, 0, 0.6)).lerp(SIS.gun, ss(light, 0.55, 1));
      SU.top.value.lerp(sisRenk, sis * 0.97);
      SU.horizon.value.lerp(sisRenk, sis);
      SU.glow.value.multiplyScalar(1 - 0.8 * sis);
      SU.night.value *= 1 - sis;
      sky.sun.intensity *= 1 - 0.78 * sis;
      sky.hemi.intensity *= 1 + 0.12 * sis;
      sky.hemi.color.lerp(tmp.copy(SIS.hemi).lerp(sisRenk, 0.5), sis * 0.8);
      sky.hemi.groundColor.lerp(SIS.zemin, sis * 0.6 * light);
      scene.fog.color.lerp(sisRenk, sis);
      // Alçak deniz sisi: kamera yükseldikçe biraz daha uzağı görür (tepeler ve çatılar sisten sıyrılır).
      // Gelişte uzaklık sisi, kıyı yığını karaya yaklaşınca koyulaşır (önce yığın denizde görünür).
      const sd = kiyiL >= 0 ? ss(kiyiL, 0.3, 1) : sis;
      const yuk = 1 + Math.max(0, camera.position.y - 10) / 160;
      // Açılış görünümünde (kamera ~440 m yüksekte, adaya ~900 m) ada seçilebilsin (17 Kasım QC: yoğun siste ekran
      // bembeyazdı). 60 m altındaki (video) kameralarda değişmez.
      const yuksek = Math.max(0, camera.position.y - 60);
      scene.fog.near = lerpLog(fog0.near, Math.max(18 * yuk, yuksek * 0.75), sd);
      scene.fog.far = lerpLog(fog0.far, Math.max(175 * yuk, yuksek * 3.6), sd);
    }
    // Fener: sisli/karanlık havada gündüz de yanar (gündüz mercek, gece huzme).
    if (fener) fener.uygula(Math.max(sis, ss(k, 0.4, 0.9)) * (0.3 + 0.7 * (1 - light)));
    if (beyaz) {
      const op = beyaz.op0 * (1 - ss(bulut, 0, 0.6));
      beyaz.children[0].material.opacity = op;
      beyaz.visible = op > 0.01;
    }

    // --- sis kıyısı ---
    const kA = kiyiL >= 0 ? ss(kiyiL, 0, 0.06) * (1 - ss(kiyiL, 0.5, 0.75)) : 0;
    kiyi.visible = kA > 0.002;
    if (kiyi.visible) {
      const R = lerp(3400, 900, Math.pow(Math.min(1, kiyiL / 0.72), 0.85));
      ku.uR.value = R; ku.uA.value = kA;
      ku.uRenk.value.copy(sisRenk);
      ku.uKay.value.set(rx, rz).multiplyScalar((minute - o.bas) * 0.05);
      duvar.scale.set(R, 46, R * 0.5);
      duvar.position.set(merkez[0], 0, merkez[1]);
    }

    // --- bulut kubbesi ---
    const bulutVar = tur === "firtina" && (bulut > 0.001 || yay > 0.001);
    kubbe.visible = bulutVar;
    if (bulutVar) {
      const sn = (minute - o.bas) * 60;
      bu.uCam.value.copy(camera.position);
      bu.uOrtu.value = bulut;
      bu.uKarsi.value = yay * 0.8;
      bu.uCephe.value.set(-rx, -rz);
      bu.uRuz.value.set(rx, rz).multiplyScalar(sn * 9 * 0.0011);
      bu.uRuz2.value.set(rx, rz).multiplyScalar(sn * 16 * 0.0024);
      bu.uKoyu.value.copy(FIRTINA.koyu).multiplyScalar(gun);
      bu.uAcik.value.copy(FIRTINA.acik).multiplyScalar(gun);
      bu.uParca.value.copy(FIRTINA.parca).multiplyScalar(gun);
      bu.uUfuk.value.copy(SU.horizon.value);
      bu.uCakim.value = flas;
      if (flas > 0) bu.uCakimYon.value.set(cakis.tx - camera.position.x, cakis.ty - camera.position.y, cakis.tz - camera.position.z).normalize();
      bu.uGunes.value.copy(SU.sunDir.value);
      bu.uYay.value = yay;
      const gk = SU.sunDir.value;
      const n = Math.hypot(gk.x, gk.z) || 1;
      bilgi.gokkusagi[0] = -gk.x / n; bilgi.gokkusagi[1] = -gk.z / n;
    }

    // --- yağmur ---
    yagmur.visible = yag > 0.005;
    if (yagmur.visible) {
      yu.uCam.value.copy(camera.position);
      camera.getWorldDirection(yu.uIleri.value);
      const rh = 2 + 2.5 * ruz;
      yu.uHiz.value.set(rx * rh, -9.5, rz * rh);
      yu.uZaman.value = real % 600;
      yu.uMiktar.value = yag;
      yu.uRenk.value.copy(FIRTINA.yagmur).multiplyScalar(0.35 + 0.65 * light).lerp(BEYAZ, flas * 0.6);
    }
  }

  group.userData.api = { bilgi, simsekler }; // deneme/video araçları sahneden de bulsun (scene.getObjectByName("hava"))
  return { group, durum, bilgi, simsekler, update };
}
