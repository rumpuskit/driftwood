// Kar (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; mevsimlik: yalnız 1 Aralık–28 Şubat,
// olay-plan.js gerek). Gök kapanır, kar yağar (kameraya bağlı hafif parçacıklar), zemin, yollar, çatılar ve ağaçlar yavaşça
// beyazlar (tek bir gölgelendirici değişkeni: aynı dakikada her yüzey aynı görünür), yağış bitince kar gün boyu yerde kalır
// (ertesi gün plan yok: kar yok). Kar tutunca çocuklar parkta (Driftwood'da Town Green'de) kartopu oynar, ikisi kardan adam
// yapar; birkaç komşu gelip izler. Vapur seferleri sürer: kar altında yanaşır (yazi bunu yalnız olduysa söyler).
// Her şey (dakika, o.tohum, dünya) işlevidir (kar tanelerinin akışı yalnız görünüm: yağmur gibi gerçek saatle).
// Sokak lambaları: hava.js kuralı (gök karanlığı > 0,45) değişmez; kar bulutu o eşiğin altında kalır, lambalar güneşe bağlı.
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { kesir } from "./olay-plan.js";
import { nextArrival } from "./ferry.js";
import { resetPose, idleGesture } from "./people.js";
import * as P from "./palette.js";

const ss = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
const lerp = THREE.MathUtils.lerp;
const lerpLog = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
const yon = (dx, dz) => Math.atan2(dx, dz);
const C = (h) => new THREE.Color(h);
const GOK = { ust: C("#9aa3ad"), ufuk: C("#c3c9cf"), hemi: C("#e2e8ef"), zemin: C("#c9ccd0") };
// Çocuklar kar tutunca gelir (yağışın %40'ı), en geç gün batımından ~20 dk önce eve döner (yerel dakika).
const COCUK_SINIR = DIL === "en" ? 945 : 1020;

/** Kar yağışının şiddeti (0–1) ve yerdeki kar (0–1) o dakikada; olayEvre ile aynı oranlar (olay-plan.js kar evreleri). */
export function karDurum(o, minute) {
  if (!o || minute < o.bas) return { yag: 0, birikim: 0, bulut: 0 };
  const D = o.son - o.bas, u = (minute - o.bas) / D;
  if (u > 1) {
    const s = minute - o.son;
    return { yag: 0, birikim: 1, bulut: 1 - ss(s, 0, 40) };
  }
  const dalga = 0.85 + 0.15 * Math.sin((minute - o.bas) * 0.31 + (o.tohum % 7));
  const yag = u < 0.15 ? ss(u / 0.15, 0, 1) * 0.9 : u < 0.75 ? dalga : dalga * (1 - ss((u - 0.75) / 0.25, 0, 1));
  return { yag, birikim: ss(u, 0.03, 0.62), bulut: ss(u / 0.15, 0, 1) };
}

// Kar gölgelendiricisi (yalnız kar günü, ilk kurulumda eklenir; ortak değişken uKar).
const KAR = { uKar: { value: 0 }, uKarRenk: { value: C("#f2f5f9") } };
function karYama(m, kat) {
  if (!m || m.userData.karYama || m.isShaderMaterial || m.isMeshBasicMaterial || m.isPointsMaterial || m.isLineBasicMaterial || m.isSpriteMaterial) return 0;
  if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return 0;
  m.userData.karYama = true;
  const anahtar = m.customProgramCacheKey(), eski = m.onBeforeCompile, uKat = { value: kat };
  m.onBeforeCompile = (sh, r) => {
    eski?.call(m, sh, r);
    sh.uniforms.uKar = KAR.uKar; sh.uniforms.uKarRenk = KAR.uKarRenk; sh.uniforms.uKarKat = uKat;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vKarW;\nvarying vec3 vKarN;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        {
          vec4 kw = vec4(transformed, 1.0); vec3 kn = objectNormal;
          #ifdef USE_INSTANCING
            kw = instanceMatrix * kw; kn = transpose(inverse(mat3(instanceMatrix))) * kn;
          #endif
          vKarW = (modelMatrix * kw).xyz;
          vKarN = (vec4(normalMatrix * kn, 0.0) * viewMatrix).xyz; // dünya normali (ölçekli örnekte de doğru)
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vKarW; varying vec3 vKarN; uniform float uKar; uniform float uKarKat; uniform vec3 uKarRenk;
        float karH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float karV(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(karH(i), karH(i + vec2(1.0, 0.0)), f.x), mix(karH(i + vec2(0.0, 1.0)), karH(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        if (uKar > 0.001) {
          // Yukarı bakan yüzey (çatı, zemin, ağaç tepesi) beyazlar; deniz altındaki zemin (sığ suyun dibi) beyazlamaz.
          float karUst = smoothstep(0.45, 0.8, normalize(vKarN).y) * smoothstep(0.15, 0.7, vKarW.y);
          float karN = karV(vKarW.xz * 0.19) * 0.6 + karV(vKarW.xz * 1.7) * 0.4;
          float karA = smoothstep(karN * 0.78, karN * 0.78 + 0.24, uKar * uKarKat) * karUst;
          diffuseColor.rgb = mix(diffuseColor.rgb, uKarRenk, karA);
        }`);
  };
  m.customProgramCacheKey = () => anahtar + "|kar1";
  m.needsUpdate = true;
  return 1;
}

/** Çocukların oyun yeri: meydanın yakınında açık bir alan (park/çayır ya da meydanın taş zemini), çevresinde ağaç, bank,
 *  çardak ve bina olmayan yer (17 Kasım denemesi: parkın ortası çam ormanıydı, çocuklar ağaçların altında görünmüyordu).
 *  Izgara taranır; puan: yakın engel (sert) + 18 m içindeki ağaç (kadrajı kapatır) + meydana uzaklık. Döner { x, z, h, tur }. */
function oyunYeri(world, traffic) {
  const m = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
  const agac = [...(world.trees ?? []).map((t) => [t.x, t.z]), ...world.features.filter((f) => f.type === "agac").map((f) => [f.x, f.z])];
  const engel = [...world.features.filter((f) => f.type !== "agac" && f.x != null).map((f) => [f.x, f.z, f.type === "cesme" || f.type === "bandstand" || f.type === "havuz" ? 7 : 1.5]),
    ...(world.plazas ?? []).filter((p) => p.r != null && p.r < 16).map((p) => [p.x, p.z, p.r + 1])];
  const alanlar = (world.plazas ?? []).filter((p) => (p.kind === "park" || p.kind === "cimen") && p.x0 != null);
  const meydan = (world.plazas ?? []).find((p) => p.kind === "meydan" && p.r >= 20);
  const icinde = (x, z) => alanlar.find((p) => x > p.x0 + 8 && x < p.x1 - 8 && z > p.z0 + 8 && z < p.z1 - 8) ?? (meydan && Math.hypot(x - meydan.x, z - meydan.z) < meydan.r - 7 ? meydan : null);
  let en = null;
  for (let x = m[0] - 240; x <= m[0] + 240; x += 4) for (let z = m[1] - 240; z <= m[1] + 240; z += 4) {
    const alan = icinde(x, z);
    if (!alan || !world.isWalkable?.(x, z)) continue;
    let puan = Math.hypot(x - m[0], z - m[1]) / 40, ok = true;
    for (const [ex, ez, er] of engel) { const d = Math.hypot(ex - x, ez - z) - er; if (d < 7.5) { ok = false; break; } if (d < 12) puan += 3; }
    if (!ok) continue;
    for (const [ax, az] of agac) { const d = Math.hypot(ax - x, az - z); if (d < 7.5) { ok = false; break; } if (d < 18) puan += 1.5; }
    if (!ok) continue;
    for (const b of world.buildings) if (Math.hypot(b.x - x, b.z - z) < Math.max(b.w ?? 6, b.d ?? 6) / 2 + 9) { ok = false; break; }
    if (!ok || traffic?.locate?.([x, z], 9, ["cadde", "sokak", "koy", "giris"])) continue;
    if (!en || puan < en.puan) en = { x, z, puan, tur: alan.kind === "meydan" ? "meydan" : alan.kind };
  }
  if (!en) return { x: m[0] + 12, z: m[1], h: Math.PI / 2, tur: "meydan" };
  // Oyun ekseni meydana dik (takımlar yan yana görünür; kamera meydan yönünden bakar).
  return { x: en.x, z: en.z, h: Math.atan2(en.z - m[1], en.x - m[0]) + Math.PI / 2, tur: en.tur };
}

const YER = {
  tr: { park: ["parkta", "Park"], cimen: ["çayırda", "Çayır"], meydan: ["meydanda", "Meydan"] },
  en: { park: ["in the park", "the park"], cimen: ["on the Town Green", "the Town Green"], meydan: ["on the square", "the square"] },
};

export function buildKarOlay({ world, scene, group: anaGrup, traffic, sky, yuzey }) {
  const group = new THREE.Group();
  group.name = "kar";
  group.visible = false;
  anaGrup.add(group);
  const SU = sky.dome.material.uniforms;
  let K = null, kurulu = false, fog0 = null, sisDegisti = false, beyaz = null;
  let tanecik = null, kardanAdam = null, toplar = null;
  const tmp = new THREE.Color(), v3 = new THREE.Vector3(), m4 = new THREE.Matrix4();

  /** İlk kar gününde bir kez: yüzeylere kar gölgelendiricisi, parçacıklar, kardan adam, kartopları. */
  function hazirla() {
    if (kurulu) return;
    kurulu = true;
    let n = 0;
    const roadMats = new Set(yuzey?.roads?.userData?.groundMaterials ?? []);
    const kat = { roads: 0.62, harbor: 0.85, trees: 0.92, beach: 0.9 };
    for (const [ad, kok] of Object.entries(yuzey ?? {})) {
      kok?.traverse?.((ob) => {
        if (!(ob.isMesh || ob.isInstancedMesh) || ob.isSprite) return;
        for (const m of Array.isArray(ob.material) ? ob.material : [ob.material]) n += karYama(m, ad === "roads" && !roadMats.has(m) ? 1 : kat[ad] ?? 1);
      });
    }
    group.userData.yamali = n;
    tanecik = tanecikKur();
    group.add(tanecik);
    kardanAdam = kardanAdamKur();
    group.add(kardanAdam.g);
    toplar = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 1 }), 6);
    toplar.count = 0;
    toplar.frustumCulled = false;
    group.add(toplar);
    fog0 = { near: scene.fog.near, far: scene.fog.far };
    for (const ob of scene.children) if (ob.userData.span && ob.children[0]?.material) { beyaz = ob; beyaz.op0 = ob.children[0].material.opacity; }
  }

  function kur(o) {
    hazirla();
    const yer = oyunYeri(world, traffic);
    const c = Math.cos(yer.h), s = Math.sin(yer.h); // u: oyun ekseni (iki takım), v: yana (kardan adam)
    const P0 = (u, v) => [yer.x + c * u - s * v, yer.z + s * u + c * v];
    const D = o.son - o.bas;
    const cocukBas = o.bas + Math.round(D * 0.4), cocukSon = Math.min(Math.max(o.son + 120, cocukBas + 60), COCUK_SINIR);
    const cocuk = cocukBas + 10 <= cocukSon;
    const atanlar = [[-3.8, -1.7, 0], [-3.4, 1.5, 0], [3.6, -1.4, 1], [3.9, 1.8, 1]].map(([u, v, takim], i) => {
      const [x, z] = P0(u, v);
      return { x, z, takim, P: 3.3 + 0.37 * i, ofs: kesir("karAt", o.tohum, i) * 7 };
    });
    for (const a of atanlar) { const hedefler = atanlar.filter((b) => b.takim !== a.takim); a.hedef = hedefler[Math.floor(kesir("karHedef", o.tohum, a.x) * 2)]; a.heading = yon(a.hedef.x - a.x, a.hedef.z - a.z); }
    const adam = P0(0.4, 5.2);
    const yapanlar = [[-1.05, 4.6], [1.15, 5.5]].map(([u, v]) => { const [x, z] = P0(u, v); return { x, z, heading: yon(adam[0] - x, adam[1] - z) }; });
    const yer0 = YER[DIL === "en" ? "en" : "tr"][yer.tur];
    K = { o, yer, P0, cocukBas, cocukSon, cocuk, atanlar, adam, yapanlar, yerDe: yer0[0], yerAd: yer0[1], izleyen: 0, adamBitti: cocukBas + 24 };
    kardanAdam.g.position.set(adam[0], world.groundY(adam[0], adam[1]), adam[1]);
    kardanAdam.g.rotation.y = yon(-s, c) + Math.PI; // yüzü oyun alanına
    // Kamera: oyun alanını yandan, kardan adam ve iki takım aynı kadrajda (kalabalık izleyenlerin arkasından).
    const kal = P0(0, -9);
    return { odak: [yer.x - s * 1.5, yer.z + c * 1.5], odakY: 1.2, kalabalik: kal, kiyi: null, yon: yon(-s * 0.9 + c * 0.45, c * 0.9 + s * 0.45) + Math.PI,
      yerAdi: yer0[1], zaman: { cocuk: [cocukBas, cocukSon], kardanAdam: [cocukBas, K.adamBitti] }, gitD: 46, gitEgim: 0.6, kalabalikArkadan: true };
  }

  /** İzleyen komşular (çocuklar gelince): o saatte evinde ya da yakında dışarıda olan, oyun yerine ≤260 m olanlar; oyunun
   *  kenarında yayda durur, kimi telefonla çeker. Genel seyirci yok (seyirci.en 0: kar başlarken boş parka toplanmasın). */
  function gorev(people, day, S, plans) {
    if (!K || !K.cocuk || S.plan !== K.o) return [];
    const T = K.cocukBas + 4, R = people.residents, out = [];
    const adaylar = [];
    plans.forEach((plan, i) => {
      const seg = plan.find((g) => g.bas <= T && g.son > T + 15);
      if (!seg || !["ev", "meydan", "hobi"].includes(seg.ne)) return;
      const a = seg.ne === "ev" ? people.homes[i]?.door : world.placeOf?.("meydan")?.anchors?.[0];
      if (!a) return;
      const d = Math.hypot(a[0] - K.yer.x, a[1] - K.yer.z);
      if (d > 260) return;
      adaylar.push({ i, d, r: kesir("karIzle", R[i].seed, day) });
    });
    adaylar.sort((a, b) => a.d / 260 + a.r - (b.d / 260 + b.r));
    const yerler = [];
    for (let t = 0; yerler.length < 9 && t < 200; t++) {
      const a = -Math.PI / 2 + (kesir("karYay", K.o.tohum, t) - 0.5) * 2.2, r = 8.5 + kesir("karYayR", K.o.tohum, t) * 4;
      const [x, z] = K.P0(Math.sin(a) * r * 0.9, -Math.cos(a) * r * 0.75 - 1);
      if (!world.isWalkable?.(x, z) || traffic?.locate?.([x, z], 3.6, ["cadde", "sokak", "koy", "giris"])) continue;
      if (yerler.some((q) => Math.hypot(q.x - x, q.z - z) < 1)) continue;
      yerler.push({ x, z });
    }
    adaylar.slice(0, yerler.length).forEach(({ i, d }, k) => {
      const commute = Math.max(3, Math.round(d / 1.25 / 60) + 2);
      const T0 = K.cocukBas + 3 + (Math.floor(kesir("karVar", R[i].seed, day) * 8)), T1 = Math.min(K.cocukSon, T0 + 14 + Math.floor(kesir("karKal", R[i].seed, day) * 16));
      const { x, z } = yerler[k], q = [K.yer.x, K.yer.z];
      out.push({ i, T0, T1, commute, item: { modul: "kar", x, z, heading: yon(q[0] - x, q[1] - z), tavir: ["cek", "bak", "konus", "cek", "goster"][k % 5] } });
    });
    K.izleyen = out.length;
    return out;
  }

  function durus(i, it, minute, t, p, ph, stand) {
    stand(it.x, it.z, it.heading);
    if (it.tavir === "cek") { p.shR = 1.45; p.elR = 0.35; p.shL = 0.5; p.elL = 1.2; p.props = ["telefon"]; p.headPitch = -0.05; }
    else if (it.tavir === "goster") { const g = Math.max(0, Math.sin(t * 0.7 + ph)); p.shR = 0.4 + 1.0 * g; p.elR = 0.2; idleGesture(p, t, ph, false); }
    else idleGesture(p, t, ph, it.tavir === "konus");
    return true;
  }

  // --- çocuklar (sakin değil; people.js kalabalık çiziminde, olay.js ekstra) ---
  const kid = {};
  const KOT = ["#c8423a", "#2f6fb5", "#e0a32e", "#3e8a86", "#8a4fb0", "#d9667a"].map(C);
  function giydir(seed) {
    Object.assign(kid, { style: seed % 2, skin: P.SKIN[seed % P.SKIN.length], hairColor: P.HAIR[(seed * 3) % P.HAIR.length], top: KOT[seed % KOT.length], bottom: P.BOTTOMS[(seed * 5) % P.BOTTOMS.length], sleeves: true, beard: false, glasses: false });
  }
  /** Atıcının o saniyedeki evresi (0–1) ve döngü sayısı. */
  const atEvre = (a, sec) => { const x = (sec + a.ofs) / a.P; return [x - Math.floor(x), Math.floor(x)]; };
  function ekstra(crowd, minute, time) {
    if (!K || !K.cocuk || minute < K.cocukBas || minute > K.cocukSon) return;
    const sec = minute * 60;
    K.atanlar.forEach((a, i) => {
      resetPose(kid);
      kid.height = 1.08 + i * 0.07; kid.t = time;
      const [e, n] = atEvre(a, sec);
      // Kaçma: her üç atıştan birinde gelen topa karşı yana sıçrar.
      const kac = n % 3 === 1 && e > 0.7 ? Math.sin((e - 0.7) / 0.3 * Math.PI) * 0.7 : 0;
      kid.x = a.x + Math.cos(a.heading) * kac; kid.z = a.z - Math.sin(a.heading) * kac;
      kid.y = world.groundY(kid.x, kid.z); kid.heading = a.heading;
      if (e < 0.32) { // eğilip kar toplar
        const k = Math.sin((e / 0.32) * Math.PI);
        kid.lean = 0.75 * k; kid.kneeL = kid.kneeR = 0.9 * k; kid.drop = 0.14 * k; kid.hipL = kid.hipR = 0.7 * k;
        kid.shL = kid.shR = 0.9 * k; kid.elL = kid.elR = 0.3; kid.headPitch = 0.3 * k;
      } else if (e < 0.58) { // geri çeker
        const k = ss((e - 0.32) / 0.26, 0, 1);
        kid.shR = -1.0 * k; kid.elR = 0.4 + 1.0 * k; kid.twist = -0.35 * k; kid.shL = 0.6 * k; kid.lean = -0.05;
      } else if (e < 0.7) { // fırlatır
        const k = ss((e - 0.58) / 0.12, 0, 1);
        kid.shR = lerp(-1.0, 2.1, k); kid.elR = lerp(1.4, 0.15, k); kid.twist = lerp(-0.35, 0.35, k); kid.lean = 0.2 * k; kid.shL = 0.6; kid.hipL = 0.25 * k;
      } else { idleGesture(kid, sec, i * 1.7, false); kid.shL = 0.3; kid.elL = 0.6; }
      giydir(K.o.tohum + i * 7);
      crowd.add(-1, kid);
    });
    // Kardan adam yapanlar: yapılırken eğilip yuvarlar/sıvazlar, bitince yanında el sallar.
    K.yapanlar.forEach((y, j) => {
      resetPose(kid);
      kid.height = 1.12 + j * 0.1; kid.t = time;
      kid.x = y.x; kid.z = y.z; kid.y = world.groundY(y.x, y.z); kid.heading = y.heading;
      if (minute < K.adamBitti) {
        const w = Math.sin(sec * 2.6 + j * 1.3);
        kid.lean = 0.55; kid.kneeL = kid.kneeR = 0.5; kid.drop = 0.08; kid.hipL = kid.hipR = 0.4;
        kid.shL = 1.1 + 0.25 * w; kid.shR = 1.1 - 0.25 * w; kid.elL = kid.elR = 0.5; kid.headPitch = 0.35;
      } else {
        idleGesture(kid, sec, j * 2.1, true);
        const g = Math.max(0, Math.sin(sec * 1.1 + j * 2));
        kid.shL = 2.4 * g; kid.abL = 0.3 * g; kid.elL = 0.3;
      }
      giydir(K.o.tohum + 40 + j * 11);
      crowd.add(-1, kid);
    });
  }

  /** Uçan kartopları (fırlatmadan 0,8 sn içinde hedefe; tepe 1,2 m). */
  function toplariGuncelle(minute) {
    let n = 0;
    if (K?.cocuk && minute >= K.cocukBas && minute <= K.cocukSon) {
      const sec = minute * 60;
      for (const a of K.atanlar) {
        const [e] = atEvre(a, sec);
        const ucus = (e - 0.66) * a.P / 0.8;
        if (ucus < 0 || ucus > 1) continue;
        const b = a.hedef, s0 = Math.sin(a.heading), c0 = Math.cos(a.heading);
        const ax = a.x + s0 * 0.35 + c0 * 0.2, az = a.z + c0 * 0.35 - s0 * 0.2, ay = world.groundY(a.x, a.z) + 1.25;
        const bx = b.x, bz = b.z, by = world.groundY(b.x, b.z) + 0.9;
        v3.set(lerp(ax, bx, ucus), lerp(ay, by, ucus) + Math.sin(ucus * Math.PI) * 1.2, lerp(az, bz, ucus));
        toplar.setMatrixAt(n++, m4.makeTranslation(v3.x, v3.y, v3.z));
      }
    }
    toplar.count = n;
    if (n) toplar.instanceMatrix.needsUpdate = true;
  }

  function update(o, evre, minute, real, env) {
    if (!o || !K || K.o !== o) {
      if (K && !o) K = null;
      if (kurulu && group.visible) kapat();
      return;
    }
    const { yag, birikim, bulut } = karDurum(o, minute);
    group.visible = true;
    KAR.uKar.value = birikim;
    // Gök: kapalı, gri; güneş zayıf, ufuk pus (kar yağarken görüş kısa).
    const light = env.light ?? 1, gun = 0.2 + 0.8 * light;
    if (bulut > 0.001) {
      SU.top.value.lerp(tmp.copy(GOK.ust).multiplyScalar(gun), 0.85 * bulut);
      SU.horizon.value.lerp(tmp.copy(GOK.ufuk).multiplyScalar(gun), 0.85 * bulut);
      SU.glow.value.multiplyScalar(1 - 0.85 * bulut);
      sky.sun.intensity *= 1 - 0.72 * bulut; // kapalı gök: gölgeler yumuşar
      sky.hemi.intensity *= 1 + 0.3 * bulut;
      sky.hemi.color.lerp(GOK.hemi, 0.6 * bulut);
      sky.hemi.groundColor.lerp(GOK.zemin, 0.5 * bulut * birikim);
      scene.fog.color.lerp(tmp.copy(GOK.ufuk).multiplyScalar(gun), 0.85 * bulut);
      if (beyaz) { const op = beyaz.op0 * (1 - ss(bulut, 0, 0.6)); beyaz.children[0].material.opacity = op; beyaz.visible = op > 0.01; }
    }
    if (yag > 0.001) {
      const yuk = 1 + Math.max(0, env.camera.position.y - 20) / 120;
      scene.fog.near = lerpLog(fog0.near, Math.min(fog0.near, 90 * yuk), yag * 0.85);
      scene.fog.far = lerpLog(fog0.far, Math.min(fog0.far, 900 * yuk), yag * 0.85);
      sisDegisti = true;
    } else if (sisDegisti) { scene.fog.near = fog0.near; scene.fog.far = fog0.far; sisDegisti = false; }
    // Kar taneleri.
    tanecik.visible = yag > 0.003;
    if (tanecik.visible) {
      const u = tanecik.material.uniforms;
      u.uCam.value.copy(env.camera.position);
      env.camera.getWorldDirection(u.uIleri.value);
      u.uZaman.value = real % 900;
      u.uMiktar.value = yag;
      u.uRuz.value.set(Math.cos(o.tohum % 628 / 100), Math.sin(o.tohum % 628 / 100)).multiplyScalar(0.6);
      u.uRenk.value.setScalar(0.55 + 0.45 * light);
    }
    // Kardan adam: yapılırken gövde, sonra beden ve baş büyür; gün boyu kalır.
    const ka = K.cocuk ? (minute - K.cocukBas) / (K.adamBitti - K.cocukBas) : -1;
    kardanAdam.g.visible = ka > 0;
    if (ka > 0) kardanAdam.ayarla(Math.min(1, ka));
    toplariGuncelle(minute);
  }

  function kapat() {
    group.visible = false;
    KAR.uKar.value = 0;
    if (sisDegisti) { scene.fog.near = fog0.near; scene.fog.far = fog0.far; sisDegisti = false; }
    if (beyaz) { beyaz.children[0].material.opacity = beyaz.op0; beyaz.visible = true; }
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const sure = o.son - o.bas, yagiyor = minute < o.son, oyun = K.cocuk && minute >= K.cocukBas, oynuyor = oyun && minute <= K.cocukSon;
    const adam = K.cocuk && minute >= K.adamBitti, izle = oyun && minute >= K.cocukBas + 6 ? K.izleyen : 0;
    // Vapur: yağış sırasında (ya da şimdiye dek) iskeleye yanaşan sefer var mı (ferry.js tarifesi; 06:00–23:00).
    const varis = nextArrival(o.bas + 2), vapur = varis <= Math.min(minute, o.son) && varis >= 360;
    if (DIL === "en") {
      const kids = oyun ? ` Kids ${oynuyor ? "are having" : "had"} a snowball fight ${K.yerDe}${adam ? ` and ${oynuyor ? "have " : ""}built a snowman` : ""}.${izle ? ` ${izle} ${izle === 1 ? "neighbor" : "neighbors"} came out to watch.` : ""}` : "";
      const ferry = vapur ? " The ferry came in to the dock through the falling snow." : "";
      if (yagiyor) return { kisa: oyun ? `Snow day! Snowball fight ${K.yerDe}` : "It's snowing on the island!", uzun: `Snow started falling at ${saatYaz(o.bas)}; roofs, streets and trees are turning white.${kids}${ferry}` };
      return { kisa: `Snow ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`, uzun: `Snow fell for ${sure} minutes from ${saatYaz(o.bas)} and covered the roofs, streets and trees in white.${kids}${ferry}` };
    }
    const kids = !oyun ? "" : oynuyor
      ? ` Çocuklar ${K.yerDe} kartopu oynuyor${adam ? "; bir de kardan adam yaptılar" : ""}.${izle ? ` ${izle} komşu gelip izledi.` : ""}`
      : ` Çocuklar ${K.yerDe} kartopu oynadı${adam ? " ve kardan adam yaptı" : ""}.${izle ? ` ${izle} komşu gelip izledi.` : ""}`;
    const ferry = vapur ? " Vapur kar altında iskeleye yanaştı." : "";
    if (yagiyor) return { kisa: oyun ? "Kar yağıyor, çocuklar kartopunda!" : "Adaya kar yağıyor!", uzun: `Saat ${saatte(o.bas)} adaya kar yağmaya başladı; çatılar, sokaklar ve ağaçlar beyazlıyor.${kids}${ferry}` };
    return { kisa: `Bugün kar yağdı · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(o.bas)} başlayan kar ${sure} dakika sürdü; çatılar, sokaklar ve ağaçlar beyaza büründü.${kids}${ferry}` };
  }

  return {
    kur, update, yazi, gorev, durus, ekstra,
    // Genel seyirci yok (en: 0); izleyenler gorev ile çocuklar gelince gelir.
    seyirci: { r0: 9, r1: 13, isR: 0, uzak: 1, en: 0, tavirlar: ["bak"] },
  };
}

/** Kameraya bağlı kar taneleri: üç katman (yakın 18 m, orta 48 m, uzak 150 m; kameraya 2–5 m'den yakın tane yok: iri leke olmasın; uzakta iri ama soluk), dünyaya bağlı
 *  sarmalanan kutular. Kameraya dönük yuvarlak, yumuşak lekeler; yavaş düşüş ve salınım. */
function tanecikKur() {
  const NK = [1300, 1000, 600], N = NK[0] + NK[1] + NK[2];
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const seed = new Float32Array(N * 4);
  const h = (i, k) => { let x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < N; i++) {
    seed[i * 4] = h(i, 1); seed[i * 4 + 1] = h(i, 2); seed[i * 4 + 2] = h(i, 3);
    seed[i * 4 + 3] = (i < NK[0] ? 0 : i < NK[0] + NK[1] ? 1 : 2) + h(i, 4) * 0.999;
  }
  g.setAttribute("seed", new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = N;
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uIleri: { value: new THREE.Vector3(0, 0, -1) }, uZaman: { value: 0 }, uMiktar: { value: 0 }, uRuz: { value: new THREE.Vector2() }, uRenk: { value: new THREE.Color(1, 1, 1) } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `
      attribute vec4 seed;
      uniform vec3 uCam; uniform vec3 uIleri; uniform float uZaman; uniform float uMiktar; uniform vec2 uRuz;
      varying float vA; varying vec2 vP;
      void main() {
        float kat = floor(seed.w);
        float S = kat < 0.5 ? 18.0 : kat < 1.5 ? 48.0 : 150.0;
        vec3 mer = uCam + uIleri * (S * 0.42);
        float hiz = mix(0.75, 1.35, seed.y);
        vec3 akis = vec3(uRuz.x, -hiz, uRuz.y) * uZaman;
        vec3 sal = vec3(sin(uZaman * (0.9 + seed.z) + seed.x * 40.0), 0.0, cos(uZaman * (0.8 + seed.x) + seed.z * 40.0)) * 0.4;
        vec3 p = mer + mod(seed.xyz * S + akis - mer + 0.5 * S, S) - 0.5 * S + sal;
        vec3 q = p - uCam;
        float L = length(q);
        float boy = mix(0.03, 0.055, seed.x) * (kat > 1.5 ? 2.2 : kat > 0.5 ? 1.4 : 1.0);
        float gen = max(boy, L * 0.0017); // en az ~1,5 piksel; zorla büyüyen tane soluklaşır
        vec3 sag = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 ust = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float var_ = step(fract(seed.w), uMiktar * mix(1.0, 0.8, kat * 0.5));
        vA = var_ * smoothstep(0.5 * S, 0.32 * S, L) * smoothstep(2.2, 5.0, L) * clamp(boy / gen * 1.6, 0.25, 1.0) * mix(1.0, 0.6, kat * 0.5);
        vP = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(p + (sag * position.x + ust * position.y) * gen, 1.0);
        if (var_ < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uRenk;
      varying float vA; varying vec2 vP;
      void main() {
        float r = dot(vP, vP);
        float a = vA * (1.0 - smoothstep(0.25, 1.0, r)) * 0.9;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uRenk, a);
        #include <colorspace_fragment>
      }`,
  }));
  m.frustumCulled = false;
  m.renderOrder = 5;
  m.visible = false;
  return m;
}

/** Kardan adam: üç kar topu, kömür gözler ve düğmeler, havuç burun, atkı, dal kollar. ayarla(u): 0–1 yapım. */
function kardanAdamKur() {
  const g = new THREE.Group();
  g.visible = false;
  const kar = new THREE.MeshStandardMaterial({ color: "#f3f6f9", roughness: 1 });
  const komur = new THREE.MeshStandardMaterial({ color: "#1b1b1d", roughness: 0.8 });
  const havuc = new THREE.MeshStandardMaterial({ color: "#e8731e", roughness: 0.7 });
  const atki = new THREE.MeshStandardMaterial({ color: "#c8343a", roughness: 0.9 });
  const dal = new THREE.MeshStandardMaterial({ color: "#5a3e2b", roughness: 0.9 });
  const top = (r) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), kar); m.castShadow = true; g.add(m); return m; };
  const alt = top(0.5), orta = top(0.36), bas = top(0.25);
  const ek = new THREE.Group();
  g.add(ek);
  const parca = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); ek.add(m); return m; };
  const nok = new THREE.SphereGeometry(0.035, 6, 4);
  parca(nok, komur, -0.08, 1.67, 0.21); parca(nok, komur, 0.08, 1.67, 0.21);
  for (const y of [0.98, 1.12, 1.26]) parca(nok, komur, 0, y, Math.sqrt(0.36 * 0.36 - (y - 1.12) ** 2) - 0.005);
  parca(new THREE.ConeGeometry(0.04, 0.22, 8).rotateX(Math.PI / 2), havuc, 0, 1.6, 0.33);
  parca(new THREE.TorusGeometry(0.22, 0.05, 6, 16).rotateX(Math.PI / 2), atki, 0, 1.4, 0);
  parca(new THREE.BoxGeometry(0.09, 0.28, 0.04), atki, 0.12, 1.25, 0.2, 0.2, 0.2);
  const kol = new THREE.CylinderGeometry(0.018, 0.024, 0.62, 5);
  parca(kol, dal, -0.52, 1.25, 0, 0, 1.0); parca(kol, dal, 0.52, 1.3, 0, 0, -0.85);
  function ayarla(u) {
    const a = ss(u, 0, 0.45), b = ss(u, 0.45, 0.72), c = ss(u, 0.72, 0.9);
    alt.scale.setScalar(Math.max(0.01, a)); alt.position.y = 0.42 * a;
    orta.scale.setScalar(Math.max(0.01, b)); orta.position.y = 0.42 * a + 0.38 + 0.32 * b; orta.visible = b > 0.01;
    bas.scale.setScalar(Math.max(0.01, c)); bas.position.y = 1.4 + 0.2 * c; bas.visible = c > 0.01;
    ek.visible = u >= 0.95;
  }
  return { g, ayarla };
}
