// Düğün konvoyu (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; yalnız Mercanada, arayüz
// olay-moduller.js). Otoparkın kapı koridorunda süslü arabalar sıralanır (önde kurdeleli, çiçekli beyaz gelin arabası),
// davul zurna çalar; konvoy dörtlüler yanarak ve korna çalarak çevre yolundan mahalle sokaklarına girer, sokak sokak
// dolaşır (kapıya çıkan komşular el sallar), sahil yolundan çarşının yaya caddesine girip meydanın yanında durur. Gelinle
// damat ve konuklar meydana yürür; çeşmenin çevresinde davul zurnayla halay çekilir, sakinler halaya katılır ya da izler.
// Gelin ve damat sakin değildir (kim oldukları yazılmaz). Her şey (dakika, tohum, dünya) işlevidir.
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { roll } from "../sim.js";
import { walkPose, sitPose, resetPose } from "./people.js";
import { kesir } from "./olay-plan.js";
import { cizgi, seritYolu, yumusat, temizle, enYakin, gorunum, tavirPoz, boya, birlestir, kutu, malzeme, yayaYeri, clamp01, ease, aci, fark } from "./olay-yardim.js";

const N = 6; // araç (gelin arabası dahil)
const ARA = 6.4; // araçlar arası (m, yol boyunca)
// Evreler (olay-plan.js dugun ile aynı): toplanma 0–0.15, konvoy 0.15–0.40, halay 0.40–1.
const EK = 0.15, EH = 0.4;
// Konvoy renkleri (traffic.js CAR_COLORS sırası): gelin arabası beyaz (0); diğerleri karışık.
const RENKLER = [3, 2, 4, 1, 6, 5, 8, 7]; // ardışık ikisi birbirine benzemez

/** Hız profili: x∈[0,1] → yol kesri (başta a, sonda d kesrinde yumuşak hızlanma/yavaşlama). */
function profil(x, a = 0.05, d = 0.08) {
  x = clamp01(x);
  const T = 1 - a / 2 - d / 2;
  if (x < a) return (x * x) / (2 * a) / T;
  if (x > 1 - d) return (1 - a / 2 - d / 2 - ((1 - x) * (1 - x)) / (2 * d)) / T;
  return (x - a / 2) / T;
}

export function buildDugunOlay({ world, group, traffic }) {
  let K = null, G = null;
  const q = {}, q2 = {};
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);

  /** Görsel parçalar (ilk olay gününde bir kez): gelin arabası süsü, konvoy kurdeleleri, gelinlik ve duvak. */
  function gorsel() {
    if (G) return G;
    const mat = malzeme();
    // Gelin arabası: kaputta çiçek kümesi ve tül fiyonk, aynalardan kaputun ucuna çapraz kırmızı kurdele, tavanda tül.
    const cicek = [];
    for (let k = 0; k < 13; k++) {
      const a = kesir("cicek", k) * 6.28, r = 0.08 + kesir("cicekR", k) * 0.22;
      cicek.push(boya(new THREE.IcosahedronGeometry(0.075 + kesir("cicekS", k) * 0.04, 0).translate(Math.cos(a) * r * 1.4, 1.08 + kesir("cicekY", k) * 0.06, 1.45 + Math.sin(a) * r), ["#ffffff", "#f4b6c8", "#d6264a", "#ffffff", "#f7d8e2"][k % 5]));
    }
    const kurdele = (x0, z0, x1, z1, y0, y1) => {
      const L = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      const g = new THREE.BoxGeometry(0.07, 0.012, L);
      g.rotateX(-Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0))).rotateY(Math.atan2(x1 - x0, z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      return boya(g, "#d4202c");
    };
    const gelinSus = new THREE.Mesh(birlestir([
      ...cicek,
      kurdele(-0.9, 0.75, 0.25, 2.05, 1.08, 1.06), kurdele(0.9, 0.75, -0.25, 2.05, 1.08, 1.06),
      boya(new THREE.TorusGeometry(0.16, 0.05, 5, 10).scale(1, 0.7, 0.5).translate(-0.17, 1.1, 2.04), "#ffffff"),
      boya(new THREE.TorusGeometry(0.16, 0.05, 5, 10).scale(1, 0.7, 0.5).translate(0.17, 1.1, 2.04), "#ffffff"),
      kutu(0.12, 0.12, 0.08, 0, 1.06, 2.05, "#d4202c"),
      kutu(1.3, 0.03, 1.3, 0, 1.51, -0.3, "#fbf3f6"), // tavanda tül örtü
      kutu(0.05, 0.4, 0.02, -0.92, 0.82, 0.75, "#ffffff"), kutu(0.05, 0.4, 0.02, 0.92, 0.82, 0.75, "#ffffff"),
    ]), mat);
    // Diğer araçlar: aynalarda sarkan kurdeleler ve kaputun önünde küçük fiyonk (renk araç başına).
    const susGeo = birlestir([
      kutu(0.05, 0.42, 0.02, -0.94, 0.8, 0.75, "#ffffff"), kutu(0.05, 0.36, 0.02, -0.97, 0.83, 0.68, "#ffffff"),
      kutu(0.05, 0.42, 0.02, 0.94, 0.8, 0.75, "#ffffff"), kutu(0.05, 0.36, 0.02, 0.97, 0.83, 0.68, "#ffffff"),
      boya(new THREE.TorusGeometry(0.12, 0.04, 4, 8).scale(1, 0.7, 0.5).translate(-0.12, 1.08, 2.0), "#ffffff"),
      boya(new THREE.TorusGeometry(0.12, 0.04, 4, 8).scale(1, 0.7, 0.5).translate(0.12, 1.08, 2.0), "#ffffff"),
    ]);
    const konvoySus = new THREE.InstancedMesh(susGeo, mat, N);
    konvoySus.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const SUS_RENK = ["#f06292", "#ffd54f", "#ffffff", "#e53935", "#81d4fa", "#ce93d8"];
    for (let k = 0; k < N; k++) konvoySus.setColorAt(k, new THREE.Color(SUS_RENK[k % SUS_RENK.length]));
    konvoySus.frustumCulled = false;
    // Gelinlik: belden yere kabarık etek; duvak: başın arkasından omuzlara inen tül.
    const beyaz = new THREE.MeshStandardMaterial({ color: "#fbfaf6", roughness: 0.6 });
    const gelinlik = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.48, 1.0, 12, 1, true).translate(0, 0.5, 0), beyaz);
    gelinlik.material.side = THREE.DoubleSide;
    const duvak = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.75, 10, 1, true).translate(0, -0.3, -0.06), new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    const g = new THREE.Group();
    g.add(gelinSus, konvoySus, gelinlik, duvak);
    g.visible = false;
    group.add(g);
    for (const m of [gelinSus, konvoySus, gelinlik]) m.castShadow = true;
    G = { g, gelinSus, konvoySus, gelinlik, duvak };
    return G;
  }

  /** Konvoy rotası: otopark koridoru → kapı → çevre yolu → mahalle sokakları → sahil yolu → çarşının yaya caddesi. */
  function rota(lot) {
    const sx = Math.sign(lot.gate[0]) || -1, A = Math.abs(lot.gate[0]) + 16;
    const cx = lot.gateSide < 0 ? lot.x0 + 3.4 : lot.x1 - 3.4, gz = lot.gate[1];
    const bas = [[cx, lot.z1 - 1.2], [cx, gz + 5.5], [lot.gate[0], gz]];
    const sokaklar = [lot.gate, [sx * A, 20], [sx * A, -150], [sx * 140, -171], [-sx * 140, -171], [-sx * A, -196], [-sx * 140, -222], [sx * 140, -222],
      [sx * A, -246], [sx * 140, -271], [-sx * 140, -271], [-sx * A, -200], [-sx * A, -60], [-sx * A, 60], [-sx * 140, 164], [-sx * 40, 165]];
    const halka = [lot.gate, [sx * A, 20], [sx * A, -100], [0, -135], [-sx * A, -100], [-sx * A, 60], [-sx * 140, 164], [-sx * 40, 165]];
    const yol = seritYolu(traffic, sokaklar) ?? seritYolu(traffic, halka);
    if (!yol) return null;
    // Yaya caddesine giriş: son şerit noktasından çarşıya (x ≈ 0) kıvrılıp sağda (doğu kenarı) durur.
    const son = yol[yol.length - 1];
    const kuyruk = [[son[0] * 0.3, son[1] - 0.6], [2.4, son[1] - 14], [2.4, 58]];
    if (!world.isWalkable?.(2.4, 80) || world.inCarriage?.(2.4, 80)) return null;
    return yumusat(temizle([...bas, ...yol, ...kuyruk], 0.3), 4.5, 5);
  }

  function kur(o) {
    if (!traffic?.lanes?.length) return null;
    const lots = (world.parkingLots ?? []).filter((l) => l.gate && l.gateSide).sort((a, b) => a.gate[0] - b.gate[0]);
    if (!lots.length) return null;
    const lot = lots[(o.tohum >>> 3) % lots.length];
    const pts = rota(lot);
    if (!pts) return null;
    const C = cizgi(pts);
    const merkez = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
    const cesme = (world.features ?? []).some((f) => f.type === "cesme" && Math.hypot(f.x - merkez[0], f.z - merkez[1]) < 3);
    const sure = o.son - o.bas, Tk0 = o.bas + EK * sure, Tk1 = o.bas + EH * sure;
    const s0 = 0.3 + (N - 1) * ARA, s1 = C.len - 0.3;
    // Konvoy Tk0'dan halaydan 0,7 dk öncesine dek yolda; konuklar inip meydana yürür (halay evresinin ilk 1,5 dk'sı).
    const yol = { t0: Tk0, t1: Tk1 - 0.7 };
    const renk = RENKLER.map((_, k) => RENKLER[(k + (o.tohum % RENKLER.length)) % RENKLER.length]);
    const Rh = cesme ? 10.4 : 6.5, w = 0.24 / Rh; // halay halkası (çeşmenin çevresi), dönme hızı (rad/sn sim)
    const Hb = Tk1 + 1.2; // halay başlar
    // Halayın başı yaya caddesine bakan yanda başlar (konuklar kısa yoldan gelir).
    const th0 = aci(2.4 - merkez[0], 60 - merkez[1]);
    K = { o, C, lot, merkez, Rh, w, Hb, th0, sure, Tk0, Tk1, s0, s1, yol, renk, sallaN: 0, halayN: 0, odak: [merkez[0], merkez[1]] };
    // Konuklar ve gelin-damat (sakin değil): halay sırası 0 damat (mendil), 1 gelin, 2–5 konuk; davul ve zurna halkanın dışında.
    K.figur = [
      { rol: "damat", g: gorunum(o.tohum + 1, "#25262c", "#25262c", { kadin: false, style: 0, height: 1.8 }), sira: 0, arac: 0, yan: 1 },
      { rol: "gelin", g: gorunum(o.tohum + 2, "#fbfaf6", "#fbfaf6", { kadin: true, style: 3, height: 1.66 }), sira: 1, arac: 0, yan: -1 },
      ...["#7a2f6b", "#2f6b5e", "#c9a227", "#3b4d8f"].map((u, k) => ({ rol: "konuk", g: gorunum(o.tohum + 10 + k, u, null), sira: 2 + k, arac: 1 + k, yan: 1 })),
      { rol: "davul", g: gorunum(o.tohum + 20, "#a8322a", "#2a2a2e", { kadin: false }), arac: 5, yan: 1, sabit: 0 },
      { rol: "zurna", g: gorunum(o.tohum + 21, "#2f4a6d", "#2a2a2e", { kadin: false }), arac: 5, yan: -1, sabit: 1 },
    ];
    K.surucu = Array.from({ length: N }, (_, k) => gorunum(o.tohum + 40 + k, null, null));
    gorsel();
    const kal = [merkez[0] + Math.sin(th0) * 13.2, merkez[1] + Math.cos(th0) * 13.2];
    // Video (kaydet.mjs aracAni): gelin arabası takibi otomatik saatte konvoyun 2. dakikasında (mahalle sokaklarında).
    const zaman = { gelin: { yol: [Tk0, Tk0 + 2.35], park: [yol.t1, o.son] } };
    return { odak: K.odak.slice(), odakY: 1.2, kalabalik: kal, kiyi: null, yon: th0 + 0.5, yerAdi: "meydan", zaman, gitD: 48, gitEgim: 0.75 };
  }

  // ------------------------------------------------ konvoy

  /** Gelin arabasının (önde) yol üzerindeki yeri (m). */
  function sOn(m) {
    const { yol, s0, s1 } = K;
    if (m <= yol.t0) return s0;
    if (m >= yol.t1) return s1;
    return s0 + (s1 - s0) * profil((m - yol.t0) / (yol.t1 - yol.t0));
  }
  /** Gelin arabasının s'ye vardığı dakika (el sallayan komşular: konvoy kapının önünden geçerken). */
  function varis(s) {
    let a = K.yol.t0, b = K.yol.t1;
    if (s <= K.s0) return a;
    for (let k = 0; k < 40; k++) { const c = (a + b) / 2; if (sOn(c) < s) a = c; else b = c; }
    return (a + b) / 2;
  }
  /** k. aracın pozu (son'da kaybolur). */
  function arac(k, m, out) {
    if (!K || m < K.o.bas - 0.01 || m >= K.o.son) return null;
    K.C.at(sOn(m) - k * ARA, out);
    out.y = world.surfaceY(out.x, out.z) + 0.06;
    return out;
  }

  function vehicles(vehicles, real, minute, araclar) {
    if (!K) return;
    const yolda = minute > K.yol.t0 && minute < K.yol.t1;
    for (let k = 0; k < N; k++) {
      const p = arac(k, minute, q);
      if (!p) return;
      vehicles.addCar(p.x, p.y, p.z, p.heading, k === 0 ? 0 : K.renk[k - 1], { hazard: real + k * 0.13, lights: yolda, brake: !yolda });
      if (k === 0) araclar.set("gelin", { x: p.x, y: p.y, z: p.z, heading: p.heading, park: !yolda });
    }
  }

  function gizle(x, z, minute) {
    if (!K || minute < K.o.bas || minute >= K.o.son) return false;
    for (let k = 0; k < N; k++) { const p = arac(k, minute, q2); if (p && Math.abs(p.x - x) < 5.5 && Math.abs(p.z - z) < 5.5) return true; }
    return false;
  }

  // ------------------------------------------------ halay

  /** Halay sırasındaki k. kişinin açısı (çeşmenin çevresinde; sıra büyüdükçe geride). */
  const halayAci = (k, m) => K.th0 + K.w * (m - K.Hb) * 60 - (k * 0.8) / K.Rh;
  function halayYeri(k, m, out) {
    const a = halayAci(k, m), { merkez, Rh } = K;
    out.x = merkez[0] + Math.sin(a) * Rh; out.z = merkez[1] + Math.cos(a) * Rh;
    out.heading = aci(merkez[0] - out.x, merkez[1] - out.z);
    return out;
  }
  /** Halay adımı (p: sıfırlanmış, ayakta): serçe parmaklar omuz hizasında tutulu, omuz titretme, sırayla ayak vurma. */
  function halayPoz(p, t, k, bas) {
    const f = t * 2.4 + k * 0.35, s = Math.sin(f), c = Math.cos(f);
    p.shL = 0.35; p.shR = 0.35; p.abL = p.abR = 0.62; p.elL = p.elR = 1.35;
    if (s > 0) { p.hipR = 0.5 * s; p.kneeR = 0.9 * s; } else { p.hipL = -0.35 * s; p.kneeL = 0.7 * -s; }
    p.y += 0.035 * Math.abs(c); p.twist = 0.08 * Math.sin(f * 2); p.lean = 0.08;
    if (bas) { const g = Math.sin(t * 5); p.shR = 2.5; p.abR = 0.3 + 0.25 * g; p.elR = 0.25; p.props = ["mendil"]; }
  }

  // ------------------------------------------------ sakinler

  /** Görevliler: konvoy geçerken kapıya çıkıp el sallayan komşular, halaya katılan sakinler. */
  function gorev(people, day, S, plans) {
    if (!K || K.o !== S.plan) return [];
    const out = [], R = people.residents, sec = new Set();
    // 1) El sallayanlar: o saatte evinde olan, kapısı rotaya ≤ 24 m komşular yolun kenarına çıkar.
    const aday = [];
    plans.forEach((plan, i) => {
      const door = people.homes[i]?.door;
      if (!door) return;
      const yak = enYakin(K.C, door[0], door[1], 26);
      if (yak.d > 24 || yak.s < K.s0 + 20 || yak.s > K.s1 - 40) return;
      const Tg = varis(yak.s), T0 = Tg - 1.6, T1 = varis(Math.min(K.s1, yak.s + (N - 1) * ARA)) + 1.2;
      const seg = plan.find((s) => s.bas <= T0 - 3 && s.son >= T1 + 3);
      if (!seg || seg.ne !== "ev") return;
      // Kapıdan yola doğru yürünür; taşıt yolundan önceki son yaya noktası.
      let x = door[0], z = door[1], ok = null;
      const L = Math.hypot(yak.x - x, yak.z - z), ux = (yak.x - x) / (L || 1), uz = (yak.z - z) / (L || 1);
      for (let d = 0; d < L; d += 0.5) { const px = x + ux * d, pz = z + uz * d; if (world.inCarriage?.(px, pz)) break; if (yayaYeri(world, traffic, px, pz) || (d > 1 && world.isWalkable?.(px, pz))) ok = [px, pz]; }
      if (!ok || Math.hypot(ok[0] - door[0], ok[1] - door[1]) < 0.8) return;
      aday.push({ i, T0, T1, x: ok[0], z: ok[1], h: aci(yak.x - ok[0], yak.z - ok[1]), s: yak.s, r: roll(R[i].seed, "dugunSalla", day) % 1000 });
    });
    aday.sort((a, b) => a.r - b.r);
    const yerler = [];
    for (const a of aday) {
      if (out.length >= 28) break;
      if (yerler.some((y) => Math.hypot(y[0] - a.x, y[1] - a.z) < 3)) continue;
      yerler.push([a.x, a.z]); sec.add(a.i);
      out.push({ i: a.i, T0: a.T0, T1: a.T1, commute: 1, item: { modul: "dugun", rol: "salla", x: a.x, z: a.z, heading: a.h, s: a.s } });
    }
    K.sallaN = out.length;
    // 2) Halaya katılanlar: meydanda/hobide ya da evde (≤ 220 m) olanlar; sırayla katılır, olay bitiminde dağılır.
    const kat = [], T = K.Hb + 1;
    const yerOf = (seg) => (seg.ne === "meydan" || seg.ne === "hobi" ? world.placeOf?.(seg.ne === "hobi" ? seg.yer.replace("hobi:", "") : "meydan")?.anchors?.[0] : null);
    plans.forEach((plan, i) => {
      if (sec.has(i)) return;
      const seg = plan.find((s) => s.bas <= T && s.son > T + 15);
      if (!seg) return;
      const a = seg.ne === "ev" ? people.homes[i]?.door : yerOf(seg);
      if (!a) return;
      const d = Math.hypot(a[0] - K.merkez[0], a[1] - K.merkez[1]);
      if (d > (seg.ne === "ev" ? 260 : 320)) return;
      kat.push({ i, d, r: roll(R[i].seed, "dugunHalay", day) % 1000 });
    });
    kat.sort((a, b) => a.d / 320 + a.r / 1000 - (b.d / 320 + b.r / 1000));
    const n = Math.min(16, kat.length);
    for (let j = 0; j < n; j++) {
      const { i, d } = kat[j], sira = 6 + j;
      const T0 = K.Hb + 0.6 + j * 0.45, T1 = K.o.son - 1.5 - (roll(R[i].seed, "dugunGit", day) % 3) * 0.3;
      out.push({ i, T0, T1, commute: Math.max(2, Math.round(d / 1.25 / 60) + 1), item: { modul: "dugun", rol: "halay", sira, x: 0, z: 0 } });
    }
    K.halayN = n;
    return out;
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    if (!K) { stand(it.x, it.z, it.heading ?? 0); return true; }
    if (it.rol === "salla") {
      stand(it.x, it.z, it.heading);
      // Konvoyun yakın aracına bakar; konvoy önünden geçerken (öndeki 70 m önceden, arkadaki 25 m sonrasına dek) el sallar.
      const s = sOn(minute), ön = it.s - s, arka = s - (N - 1) * ARA - it.s;
      const yak = ön > 0 ? s : Math.min(s, Math.max(s - (N - 1) * ARA, it.s));
      K.C.at(yak, q2);
      const bak = fark(aci(q2.x - it.x, q2.z - it.z) - it.heading);
      if (ön < 70 && arka < 25) tavirPoz(p, (roll(i, "dSal") % 4) === 0 ? "cek" : "salla", t, ph, bak, idleGesture);
      else { idleGesture(p, t, ph, false); p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.7; }
      return true;
    }
    if (it.rol === "halay") {
      halayYeri(it.sira, minute, q2);
      stand(q2.x, q2.z, q2.heading);
      halayPoz(p, t + ph, it.sira, false);
      return true;
    }
    // Seyirci (seyirci.ozel): halayı izler, alkışlar, telefonla çeker.
    stand(it.x, it.z, it.heading);
    const bak = it.look ? fark(aci(it.look[0] - it.x, it.look[1] - it.z) - it.heading) : 0;
    tavirPoz(p, it.tavir, t, ph, bak, idleGesture);
    return true;
  }

  // ------------------------------------------------ gelin-damat, konuklar, davul-zurna, sürücüler

  /** Sakin olmayan figürün o anki durumu: { x, z, heading, kip: "ayak"|"yuru"|"halay"|"cal"|"otur", d (yürüme mesafesi) } | null. */
  function figurDurum(f, m, out) {
    const { o, Tk1, Hb } = K;
    if (m < o.bas || m >= o.son) return null;
    const arac0 = (mm) => { K.C.at(sOn(mm) - f.arac * ARA, q2); return q2; };
    // Aracın yanındaki yer (yolcu tarafı / sürücü tarafı) ve halaydaki yer.
    const yanYer = (mm, ileri = 0) => {
      const a = arac0(mm), r = 1.9 * f.yan;
      return [a.x + a.nx * r + Math.sin(a.heading) * ileri, a.z + a.nz * r + Math.cos(a.heading) * ileri, a.heading];
    };
    const halay = (mm) => {
      if (f.sabit != null) {
        // Davul ve zurna halkanın içinde (halay çevrelerinde döner; seyirci dışarıda), başın başlangıç yerinin yanında.
        const a = K.th0 - 0.3 - f.sabit * 0.16, r = K.Rh - 1.5;
        const x = K.merkez[0] + Math.sin(a) * r, z = K.merkez[1] + Math.cos(a) * r;
        return [x, z, aci(K.merkez[0] - x, K.merkez[1] - z)];
      }
      halayYeri(f.sira, mm, q);
      return [q.x, q.z, q.heading];
    };
    const ileri = f.arac === 5 ? (f.yan > 0 ? -3.4 : -4.4) : 0;
    let A, B, u = -1;
    if (m < K.yol.t0 - 0.4) { const [x, z, h] = yanYer(m, ileri); A = [x, z, h + (f.yan > 0 ? -Math.PI / 2 : Math.PI / 2)]; }
    else if (m < K.yol.t0) { A = yanYer(K.yol.t0 - 0.4, ileri); B = yanYer(K.yol.t0); u = (m - (K.yol.t0 - 0.4)) / 0.4; if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 0.5) { u = -1; A = [A[0], A[1], A[2] + (f.yan > 0 ? -Math.PI / 2 : Math.PI / 2)]; } } // arabaya biner
    else if (m < Tk1 - 0.6) return { kip: "otur" };
    else if (m < Hb) { A = yanYer(Tk1 - 0.6); B = halay(Hb); u = (m - (Tk1 - 0.6)) / (Hb - (Tk1 - 0.6)); } // meydana yürür
    else if (m < o.son - 2) { const [x, z, h] = halay(m); A = [x, z, h]; }
    else { A = halay(o.son - 2); B = yanYer(o.son); u = (m - (o.son - 2)) / 1.5; } // arabalara döner
    if (u >= 0) {
      if (u >= 1) return m >= o.son - 0.5 ? null : { x: B[0], z: B[1], heading: B[2], kip: "ayak" };
      const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz);
      out.x = A[0] + dx * u; out.z = A[1] + dz * u; out.heading = aci(dx, dz); out.kip = "yuru"; out.d = L * u;
      return out;
    }
    out.x = A[0]; out.z = A[1]; out.heading = A[2];
    out.kip = m >= Hb && m < o.son - 2 ? (f.sabit != null ? "cal" : "halay") : f.sabit != null ? "cal" : "ayak";
    return out;
  }

  const fp = {};
  function ekstra(crowd, minute, time) {
    if (!K || minute < K.o.bas || minute >= K.o.son) return;
    K.figur.forEach((f, k) => {
      const st = figurDurum(f, minute, {});
      if (!st) return;
      resetPose(fp); Object.assign(fp, f.g); fp.t = time;
      if (st.kip === "otur") {
        // Arabada: gelin-damat gelin arabasının arka koltuğunda, konuklar kendi arabalarında yolcu koltuğunda.
        const a = arac(f.arac, minute, q); if (!a) return;
        const lx = f.rol === "gelin" ? -0.4 : f.rol === "damat" ? 0.4 : f.yan > 0 ? -0.4 : 0.4, lz = f.rol === "gelin" || f.rol === "damat" || f.arac === 5 && f.yan < 0 ? -0.75 : 0.05;
        fp.x = a.x + Math.cos(a.heading) * lx + Math.sin(a.heading) * lz; fp.z = a.z - Math.sin(a.heading) * lx + Math.cos(a.heading) * lz; fp.heading = a.heading;
        sitPose(fp, a.y + 0.42, fp.height / 1.75); fp.shL = fp.shR = 0.6; fp.elL = fp.elR = 0.9; fp.inVehicle = true;
        crowd.add(-1, fp); return;
      }
      fp.x = st.x; fp.z = st.z; fp.heading = st.heading; fp.y = world.groundY(st.x, st.z);
      if (st.kip === "yuru") walkPose(fp, (st.d / (0.72 * fp.height / 1.75)) * Math.PI);
      else if (st.kip === "halay") halayPoz(fp, time + k * 0.7, f.sira, f.rol === "damat");
      else if (st.kip === "cal") {
        if (f.rol === "davul") { const v = Math.max(0, Math.sin(time * 9)); fp.props = ["davul"]; fp.shR = 0.9 + 0.7 * v; fp.elR = 1.3 - 0.6 * v; fp.shL = 0.7; fp.elL = 1.4; fp.abL = 0.2; fp.lean = -0.08; }
        else { fp.props = ["zurna"]; fp.shL = fp.shR = 1.15; fp.elL = fp.elR = 1.75; fp.abL = fp.abR = -0.12; fp.headPitch = -0.12; fp.lean = -0.05 + 0.04 * Math.sin(time * 1.3); }
        fp.kneeL = 0.08 + 0.1 * Math.max(0, Math.sin(time * 4.5)); fp.y += 0.02 * Math.abs(Math.sin(time * 4.5));
      } else if (f.rol === "gelin" || f.rol === "damat") { fp.headYaw = 0.3 * Math.sin(time * 0.4 + k); fp.shL = 0.3; }
      crowd.add(-1, fp);
      if (f.rol === "gelin") gelinlikYerlestir(fp);
    });
    // Sürücüler (yolculuk boyunca ve otoparkta direksiyonda).
    for (let k = 0; k < N; k++) {
      const a = arac(k, minute, q);
      if (!a || minute > K.Tk1 + 0.2) break;
      resetPose(fp); Object.assign(fp, K.surucu[k]); fp.t = time;
      fp.x = a.x + Math.cos(a.heading) * 0.4 + Math.sin(a.heading) * 0.05; fp.z = a.z - Math.sin(a.heading) * 0.4 + Math.cos(a.heading) * 0.05; fp.heading = a.heading;
      sitPose(fp, a.y + 0.42, fp.height / 1.75); fp.shL = fp.shR = 0.95; fp.elL = fp.elR = 0.7; fp.inVehicle = true;
      crowd.add(-1, fp);
    }
  }

  /** Gelinlik ve duvak gelin figürünün yerinde (ekstra'da çizildiği karede). */
  function gelinlikYerlestir(p) {
    const k = p.height / 1.75;
    G.gelinlik.visible = !p.inVehicle;
    G.gelinlik.position.set(p.x, world.groundY(p.x, p.z) + 0.02, p.z);
    G.gelinlik.scale.set(k, k * 1.02, k);
    G.gelinlik.rotation.y = p.heading;
    G.duvak.visible = true;
    G.duvak.position.set(p.x - Math.sin(p.heading) * 0.05, p.y + 1.66 * k, p.z - Math.cos(p.heading) * 0.05);
    G.duvak.rotation.set(0, p.heading, 0);
    G.duvak.scale.setScalar(k);
    K.gelinKare = true;
  }

  function update(o, evre, minute) {
    if (!o || !K || K.o !== o || minute < o.bas || minute >= o.son) { if (G) G.g.visible = false; if (!o && K) K = null; return; }
    G.g.visible = true;
    // Süsler araçların pozunda.
    for (let k = 0; k < N; k++) {
      const a = arac(k, minute, q);
      Q.setFromAxisAngle(UP, a.heading);
      M4.compose(V.set(a.x, a.y, a.z), Q, S1);
      if (k === 0) { G.gelinSus.position.set(a.x, a.y, a.z); G.gelinSus.rotation.set(0, a.heading, 0); }
      G.konvoySus.setMatrixAt(k, k === 0 ? M4.makeScale(0, 0, 0) : M4);
    }
    G.konvoySus.instanceMatrix.needsUpdate = true;
    // Gelin bu karede çizilmediyse (arabada değilse bile görünmüyorsa) gelinlik gizli.
    if (!K.gelinKare) { G.gelinlik.visible = false; G.duvak.visible = false; }
    K.gelinKare = false;
  }

  /** "Olaya git" ve video: konvoy yolda/otoparktayken gelin arabası, sonra halay. */
  function anlik(o, m) {
    if (!K || K.o !== o || m < o.bas) return null;
    if (m >= K.Tk1) {
      // Halay: kamera halkanın dışında, sıranın ortasının karşısında (çeşme arkada).
      const c = canli(m);
      return c ? { yon: aci(c[0] - K.merkez[0], c[2] - K.merkez[1]) + 0.25 } : null;
    }
    const a = arac(0, m, q2);
    if (!a) return null;
    return { odak: [a.x, a.z], yon: a.heading + 0.55, odakY: 1, gitD: 38, gitEgim: 0.6 };
  }
  function canli(m) {
    if (!K) return null;
    if (m >= K.o.bas && m < K.Tk1) { const a = arac(0, m, q2); return a ? [a.x, a.y + 1, a.z] : null; }
    // Halay: sıranın ortası (o ana dek katılanlara göre; gelin-damat başta).
    const n = 6 + Math.max(0, Math.min(K.halayN, Math.floor((m - K.Hb - 0.6) / 0.45) + 1));
    halayYeri(Math.max(0, (n - 1) / 2), Math.max(m, K.Hb), q2);
    return [q2.x, world.groundY(q2.x, q2.z) + 1.2, q2.z];
  }

  function ses(minute) {
    if (!K || minute < K.o.bas || minute >= K.o.son) return null;
    if (minute < K.yol.t0) return { korna: 0.15, kalabalik: 0.25 };
    if (minute < K.yol.t1) return { korna: 1 };
    return { kalabalik: 0.65, korna: minute < K.Tk1 ? 0.6 : 0 };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    // Halaya katılan: gelin-damat ve dört konuk + o ana dek gelen sakinler (sakinler 0,45 dk arayla katılır).
    const halayN = 6 + Math.max(0, Math.min(K.halayN, Math.floor((minute - K.Hb - 0.6) / 0.45) + 1)), sey = S.seyirci;
    const yolaCikis = saatte(K.yol.t0), cikis = saatYaz(K.yol.t0);
    if (DIL === "en") {
      if (minute < K.yol.t0) return { kisa: "Wedding convoy lining up!", uzun: `Decorated cars are lining up in the parking lot, a white bridal car with ribbons and flowers in front; drums and pipes are playing. The ${N}-car convoy leaves at ${cikis}.` };
      if (minute < K.Tk1) return { kisa: "Wedding convoy touring the island!", uzun: `A ${N}-car wedding convoy led by a white bridal car is honking its way through the streets with hazard lights flashing${K.sallaN ? "; neighbors are coming out to their doors to wave" : ""}.` };
      const bitti = minute >= o.son - 2, gecmis = `At ${cikis} a ${N}-car wedding convoy toured the island honking${K.sallaN ? ` while ${K.sallaN} neighbors waved from their doors` : ""}, then pulled up by the square.`;
      if (!bitti) return { kisa: "Wedding dance in the square!", uzun: `${gecmis} With drums and pipes, the bride and groom are leading a line dance around the fountain; ${halayN} people have joined${sey ? ` and ${sey} more are watching` : ""}.` };
      return { kisa: `Wedding in the square today · ${saatYaz(o.bas)}`, uzun: `${gecmis} With drums and pipes, ${halayN} people joined the bride and groom in a line dance around the fountain${sey ? `; ${sey} more gathered to watch` : ""}.` };
    }
    if (minute < K.yol.t0) return { kisa: "Düğün konvoyu toplanıyor!", uzun: `Otoparkta süslü arabalar sıralandı; önde kurdeleli, çiçekli beyaz gelin arabası, yanında davul zurna. ${N} araçlık konvoy saat ${yolaCikis} yola çıkacak.` };
    if (minute < K.Tk1) return { kisa: "Düğün konvoyu adayı turluyor!", uzun: `Önde beyaz gelin arabası, ${N} araçlık düğün konvoyu dörtlüleri yanarak ve korna çalarak mahalle sokaklarını dolaşıyor${K.sallaN ? "; komşular kapıya çıkıp el sallıyor" : ""}.` };
    const bitti = minute >= o.son - 2, gecmis = `Saat ${yolaCikis} yola çıkan ${N} araçlık düğün konvoyu korna çalarak mahalleleri dolaştı${K.sallaN ? `, ${K.sallaN} komşu kapıdan el salladı` : ""}; konvoy çarşıya girip meydanın yanında durdu.`;
    if (!bitti) return { kisa: "Meydanda düğün halayı!", uzun: `${gecmis} Çeşmenin çevresinde davul zurnayla halay çekiliyor: gelinle damadın başını çektiği halaya ${halayN} kişi katıldı${sey ? `, ${sey} kişi de izliyor` : ""}.` };
    return { kisa: `Bugün meydanda düğün vardı · ${saatYaz(o.bas)}`, uzun: `${gecmis} Çeşmenin çevresinde davul zurnayla halay çekildi: gelinle damadın başını çektiği halaya ${halayN} kişi katıldı${sey ? `, ${sey} kişi de izledi` : ""}.` };
  }

  return {
    kur, update, vehicles, gizle, gorev, durus, ekstra, anlik, canli, ses, yazi,
    seyirciBas: (o) => (K && K.o === o ? K.Hb : o.bas),
    seyirci: { r0: 12.3, r1: 13.8, isR: 120, uzak: 1, en: 26, ozel: true, tavirlar: ["alkis", "cek", "alkis", "konus", "alkis", "goster", "cek"] },
  };
}
