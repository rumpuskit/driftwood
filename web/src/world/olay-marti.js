// Martı simit kaptı (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; iki ada, arayüz
// olay-moduller.js). Vapur iskelesinde korkuluğun başında simidini (Driftwood: hot dog) yiyen bir sakinin tepesinde
// martılar döner, ikisi korkuluğa konar. Bir martı denizin üstünde süzülüp bekler, birden dalar, simidi elinden kapar ve
// denize doğru kaçar; öbür martılar peşine düşer, iskeledekiler güler, eliyle gösterir. Simitli martı sonunda denize
// konar, öbürleri çevresine konup didişir, sonra dağılırlar. Kimse yaralanmaz; simidi kaptıranın adı/kusuru yazılmaz.
// Her şey (dakika, tohum, dünya) işlevidir: dalış saniye saniye aynı çizilir (video ?saat=HH:MM:SS).
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { roll } from "../sim.js";
import { resetPose } from "./people.js";
import { kesir } from "./olay-plan.js";
import { gorunum, tavirPoz, boya, birlestir, malzeme, clamp01, ease, aci, fark, lerp } from "./olay-yardim.js";

// Evreler (olay-plan.js marti ile aynı): simit 0–0.3, kapma 0.3–0.36, kovalama 0.36–0.8, dagilma 0.8–1.
const EK = 0.3, EKO = 0.36, ED = 0.8;
const N = 6; // martı
const DALIS = 3; // kapma evresinin başından kapışa (sn)

export function buildMartiOlay({ world, group }) {
  let K = null, G = null;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, "YXZ"), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), S0 = new THREE.Vector3();
  const a3 = [0, 0, 0], b3 = [0, 0, 0], c3 = [0, 0, 0];
  const QW = new THREE.Quaternion(), MW = new THREE.Matrix4(), VW = new THREE.Vector3(0, 0.05, 0.02), SW = new THREE.Vector3(), ZEK = new THREE.Vector3(0, 0, 1);

  function gorsel() {
    if (G) return G;
    const mat = malzeme(), g = new THREE.Group();
    g.visible = false; group.add(g);
    // Martı (ön +z): gövde, baş, sarı gaga, gri kuyruk; kanatlar ayrı (omuzdan döner, uçları siyah).
    const govde = birlestir([
      boya(new THREE.SphereGeometry(0.15, 8, 6).scale(1, 0.9, 2.3), "#f7f7f4"),
      boya(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 0.08, 0.36), "#ffffff"),
      boya(new THREE.ConeGeometry(0.028, 0.13, 5).rotateX(Math.PI / 2).translate(0, 0.065, 0.5), "#f2b11c"),
      boya(new THREE.ConeGeometry(0.1, 0.26, 4).rotateX(-Math.PI / 2).scale(1, 0.25, 1).translate(0, 0.02, -0.42), "#9aa1a8"),
      boya(new THREE.SphereGeometry(0.016, 4, 3).translate(0.06, 0.11, 0.42), "#111"), boya(new THREE.SphereGeometry(0.016, 4, 3).translate(-0.06, 0.11, 0.42), "#111"),
      boya(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).translate(0.05, -0.17, -0.02), "#e8a33c"), boya(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4).translate(-0.05, -0.17, -0.02), "#e8a33c"),
    ]);
    const kanat = (s) => birlestir([boya(new THREE.BoxGeometry(0.62, 0.025, 0.26).translate(s * 0.31, 0.03, 0), "#a7aeb5"), boya(new THREE.BoxGeometry(0.2, 0.026, 0.2).translate(s * 0.72, 0.03, -0.02), "#202024")]);
    const mk = (geo) => { const m = new THREE.InstancedMesh(geo, mat, N); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; g.add(m); return m; };
    const simit = new THREE.Mesh(birlestir(DIL === "en"
      ? [boya(new THREE.CapsuleGeometry(0.03, 0.14, 3, 8).rotateZ(Math.PI / 2), "#e3b46a"), boya(new THREE.CapsuleGeometry(0.019, 0.16, 3, 8).rotateZ(Math.PI / 2).translate(0, 0.02, 0), "#b4442c")]
      : [boya(new THREE.TorusGeometry(0.07, 0.022, 6, 14).rotateX(Math.PI / 2), "#b8752f")]), mat);
    g.add(simit);
    G = { g, govde: mk(govde), kanatL: mk(kanat(-1)), kanatR: mk(kanat(1)), simit };
    return G;
  }

  function kur(o) {
    const P = world.ferryPier;
    if (!P) return null;
    // Kurbanın yeri: iskelenin kıyıdan %40'ı, tohuma göre doğu/batı korkuluğu; yüzü denize.
    const kiyi = world.groundY((P.x0 + P.x1) / 2, P.z0 - 3) > 0.5 ? 1 : -1; // kıyı z0 yanındaysa iskele +z'ye (açığa) uzanır
    // Vapurun yanaştığı yanın karşısı (vapur gövdesi kadrajı kapatıyordu); vapur yoksa tohuma göre.
    const vapur = (world.features ?? []).find((f) => f.type === "vapur" && Math.abs(f.x - (P.x0 + P.x1) / 2) < 40 && f.z > P.z0 - 20 && f.z < P.z1 + 40);
    const yan = vapur ? -(Math.sign(vapur.x - (P.x0 + P.x1) / 2) || 1) : (o.tohum >>> 4) % 2 ? 1 : -1;
    const z = P.z0 + 0.4 * (P.z1 - P.z0), x = yan > 0 ? P.x1 - 0.85 : P.x0 + 0.85;
    if (!world.isWalkable?.(x, z)) return null;
    const out = [yan, 0], boy = [0, kiyi > 0 ? 1 : -1]; // denize doğru (yatay), iskele boyunca açığa doğru
    const y0 = world.groundY(x, z);
    const sure = o.son - o.bas, Tk = o.bas + EK * sure, Tg = Tk + DALIS / 60;
    const f = (k, s) => kesir("marti", o.tohum, k, s);
    K = { o, V: [x, z], y0, out, boy, sure, Tk, Tg, Tko: o.bas + EKO * sure, Td: o.bas + ED * sure, kurban: null, kurbanG: gorunum(o.tohum + 5, null, null), f };
    // Martıların dönme çemberleri ve kovalamadaki gecikme/yanal kayması.
    K.m = Array.from({ length: N }, (_, k) => ({ r: 6 + f(k, 1) * 6, h: 8 + f(k, 2) * 6, w: (0.35 + f(k, 3) * 0.25) * (f(k, 4) < 0.5 ? 1 : -1), ph: f(k, 5) * 6.28,
      gec: 0.7 + k * 0.45 + f(k, 6) * 0.3, yk: (f(k, 7) - 0.5) * 3, yy: (f(k, 8) - 0.5) * 2.2, kon: k >= 4 }));
    // Kovalama halkası: açıkta, iskelenin yanında; martı oraya kaçar, sekiz çizer, sonra denize konar.
    // Açıkta (iskelenin ucundan öteye, vapurun karşı yanında): kamera kıyıdan bakınca arkada açık deniz.
    K.C = [x + out[0] * 16 + boy[0] * 48, z + out[1] * 16 + boy[1] * 48];
    K.su = [x + out[0] * 12 + boy[0] * 34, z + out[1] * 12 + boy[1] * 34];
    K.TL = (o.bas + 0.66 * sure - Tg) * 60; // kapıştan konmaya (sn)
    gorsel();
    const yon = aci(-boy[0] * 1.0 - out[0] * 0.3, -boy[1] * 1.0 - out[1] * 0.3);
    return { odak: [x, z], odakY: 1.6, kalabalik: [x + boy[0] * 5 - out[0] * 2.5, z + boy[1] * 5 - out[1] * 2.5], kiyi: null, yon, yerAdi: DIL === "en" ? "the pier" : "vapur iskelesi", zaman: null, gitD: 24, gitEgim: 0.42, cekimOlcek: 0.55, cekimOlcekH: 0.5 };
  }

  // ------------------------------------------------ uçuş

  const nokta = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
  const bez = (out, a, b, c, d, u) => {
    const m = 1 - u;
    for (let i = 0; i < 3; i++) out[i] = m * m * m * a[i] + 3 * m * m * u * b[i] + 3 * m * u * u * c[i] + u * u * u * d[i];
    return out;
  };
  /** Kurbanın simit tutan eli (dalışın hedefi). */
  function el(out) {
    const { V, y0, out: o } = K, k = K.kurbanG.height / 1.75, sx = -o[1], sz = o[0]; // sağ: yüze göre
    return nokta(out, V[0] + o[0] * 0.54 * k - sx * 0.215 * k, y0 + 1.37 * k, V[1] + o[1] * 0.54 * k - sz * 0.215 * k);
  }
  /** Simitli martının (0) konumu; t: kapıştan saniye. */
  function hirsiz(t, out) {
    const { V, y0, out: o, boy, C, su } = K;
    const H = [V[0] + o[0] * 6.5 - boy[0] * 1.5, y0 + 4.8, V[1] + o[1] * 6.5 - boy[1] * 1.5];
    if (t < -DALIS - 25) return null; // daha önce öbürleriyle döner (dön())
    if (t < -DALIS) { const b = Math.sin(t * 2.1) * 0.25; return nokta(out, H[0] + Math.sin(t * 0.7) * 0.6, H[1] + b, H[2] + Math.cos(t * 0.5) * 0.4); } // süzülüp bekler
    const hand = el(b3);
    if (t < 0) { // dalış: yukarıdan aşağı, son anda gaga ele
      const u = (t + DALIS) / DALIS, uu = u * u * (1.4 - 0.4 * u);
      return bez(out, H, [H[0], H[1] + 1.2, H[2]], [hand[0] + o[0] * 1.6, hand[1] + 0.8, hand[2] + o[1] * 1.6], hand, uu);
    }
    const Ek = [V[0] + o[0] * 14 + boy[0] * 22, y0 + 10, V[1] + o[1] * 14 + boy[1] * 22];
    if (t < 4) return bez(out, hand, [hand[0] + o[0] * 3, hand[1] + 0.3, hand[2] + o[1] * 3], [Ek[0] - o[0] * 8, Ek[1] - 2, Ek[2] - o[1] * 8], Ek, ease(t / 4));
    // Kovalama: açıkta sekiz çizer (yükseklik dalgalı); başta kaçış ucundan halkaya geçiş.
    const sekiz = (tt, o2) => { const w = 0.16, a = (tt - 4) * w; return nokta(o2, C[0] + o[0] * 16 * Math.sin(a) + boy[0] * 22 * Math.sin(2 * a) * 0.5 - o[0] * 0, y0 + 9 + 2.5 * Math.sin(a * 1.7), C[1] + o[1] * 16 * Math.sin(a) + boy[1] * 22 * Math.sin(2 * a) * 0.5); };
    if (t < K.TL) {
      sekiz(t, out);
      if (t < 8) { const w = ease((t - 4) / 4); out[0] = lerp(Ek[0], out[0], w); out[1] = lerp(Ek[1], out[1], w); out[2] = lerp(Ek[2], out[2], w); }
      return out;
    }
    // Konma: 5 sn'de suya iner, sonra suda yüzer.
    const W = [su[0], 0.05, su[1]];
    if (t < K.TL + 5) { const A = sekiz(K.TL, c3); return bez(out, A, [A[0], A[1] - 1, A[2]], [W[0] - o[0] * 4, 1.5, W[2] - o[1] * 4], W, ease((t - K.TL) / 5)); }
    const kalkis = (K.o.son - K.Tg) * 60 - 25;
    if (t > kalkis) { const u = clamp01((t - kalkis) / 20); return nokta(out, W[0] + o[0] * 60 * u * u, 0.05 + 14 * u * u, W[2] + o[1] * 60 * u * u); }
    return nokta(out, W[0], 0.05 + Math.sin(t * 1.3) * 0.04, W[2]);
  }
  /** Çemberde dönen martı (kapıştan önce). */
  function don(k, t, out) {
    const m = K.m[k], { V, y0, out: o } = K, a = m.ph + m.w * t * 0.5;
    const cx = V[0] + o[0] * 5, cz = V[1] + o[1] * 5;
    return nokta(out, cx + Math.sin(a) * m.r, y0 + m.h + Math.sin(t * 0.4 + m.ph) * 1.2, cz + Math.cos(a) * m.r);
  }
  /** Korkuluğa konmuş martı (4, 5): kurbanın iki yanında. */
  function konmus(k, out) {
    const { V, y0, out: o, boy } = K, d = k === 4 ? 2.2 : -2.6;
    return nokta(out, V[0] + o[0] * 0.55 + boy[0] * d, y0 + 1.05, V[1] + o[1] * 0.55 + boy[1] * d);
  }
  /** k. martının konumu ve kipi ("uc" | "konmus" | "yuzer" | "dalis"); t: kapıştan sn. */
  function marti(k, t, out) {
    if (k === 0) {
      const h = hirsiz(t, out);
      if (h) { out.kip = t < -DALIS ? "suz" : t < 0 ? "dalis" : t > K.TL + 5 && t < (K.o.son - K.Tg) * 60 - 25 ? "yuzer" : "uc"; return out; }
      don(0, t, out); out.kip = "uc"; return out;
    }
    const m = K.m[k];
    if (t < 0.6) { if (m.kon) { konmus(k, out); out.kip = "konmus"; } else { don(k, t, out); out.kip = "uc"; } return out; }
    // Kovalama: hırsızın yolunu gecikmeyle izler; geçişte (ilk 3 sn) bulunduğu yerden katılır.
    const td = t - m.gec;
    const takip = (tt, o2) => { const h = hirsiz(Math.min(tt, K.TL), o2) ?? don(0, tt, o2); o2[0] += -K.out[1] * m.yk; o2[1] += m.yy * (tt < K.TL ? 1 : 0); o2[2] += K.out[0] * m.yk; return o2; };
    if (t < K.TL + m.gec) {
      takip(Math.max(td, 0.6 - m.gec), out);
      if (t < 3.6) { const A = m.kon ? konmus(k, a3) : don(k, 0.6, a3), w = ease((t - 0.6) / 3); out[0] = lerp(A[0], out[0], w); out[1] = lerp(A[1], out[1], w); out[2] = lerp(A[2], out[2], w); }
      out.kip = "uc"; return out;
    }
    // Hırsızın çevresine konar; dağılmada sırayla kalkıp açığa uçar.
    const a = (k / N) * 6.28 + K.f(k, 9), r = 1.4 + K.f(k, 10) * 1.6, W = [K.su[0] + Math.sin(a) * r, 0.05, K.su[1] + Math.cos(a) * r];
    const t0 = K.TL + m.gec, kalk = (K.Td - K.Tg) * 60 + k * 9;
    if (t < t0 + 4) { const A = takip(K.TL, a3); bez(out, A, [A[0], A[1] - 1, A[2]], [W[0], 1.2, W[2]], W, ease((t - t0) / 4)); out.kip = "uc"; return out; }
    if (t < kalk) {
      // Didişme: arada kanat çırpıp hırsıza doğru zıplar.
      const hop = Math.max(0, Math.sin(t * 0.9 + k * 1.7)) ** 8;
      nokta(out, W[0] + (K.su[0] - W[0]) * 0.3 * hop, 0.05 + hop * 0.6 + Math.sin(t * 1.4 + k) * 0.04, W[2] + (K.su[1] - W[2]) * 0.3 * hop);
      out.kip = hop > 0.2 ? "uc" : "yuzer"; return out;
    }
    const u = clamp01((t - kalk) / 18), dx = -K.out[1] * (k % 2 ? 1 : -1) + K.out[0], dz = K.out[0] * (k % 2 ? 1 : -1) + K.out[1];
    nokta(out, W[0] + dx * 70 * u * u, 0.05 + 16 * u * u, W[2] + dz * 70 * u * u); out.kip = "uc"; return out;
  }

  const m0 = [0, 0, 0], m1 = [0, 0, 0];
  function update(o, evre, minute, real) {
    if (!o || !K || K.o !== o || minute < o.bas || minute >= o.son) { if (G) G.g.visible = false; if (!o && K) K = null; return; }
    G.g.visible = true;
    const t = (minute - K.Tg) * 60;
    for (let k = 0; k < N; k++) {
      marti(k, t, m0); const kip = m0.kip;
      marti(k, t + 0.12, m1);
      const dx = m1[0] - m0[0], dy = m1[1] - m0[1], dz = m1[2] - m0[2], yat = Math.hypot(dx, dz);
      const hz = kip === "konmus" ? aci(K.out[0], K.out[1]) + Math.sin(t * 0.8 + k) * 0.6 : kip === "yuzer" ? K.f(k, 11) * 6.28 + Math.sin(t * 0.3 + k) * 0.5 : yat > 0.02 ? aci(dx, dz) : 0;
      const pitch = kip === "uc" || kip === "dalis" || kip === "suz" ? -Math.atan2(dy, Math.max(0.05, yat)) * 0.8 : 0;
      // Dönüşte yatış (yönün değişimi).
      marti(k, t + 0.24, a3);
      const h2 = aci(a3[0] - m1[0], a3[2] - m1[2]), roll_ = kip === "uc" || kip === "suz" ? Math.max(-0.7, Math.min(0.7, -fark(h2 - hz) * 3)) : 0;
      E.set(pitch, hz, roll_);
      Q.setFromEuler(E);
      const s = 1.15;
      M4.compose(V.set(m0[0], m0[1], m0[2]), Q, S0.set(s, s, s));
      G.govde.setMatrixAt(k, M4);
      // Kanat: uçarken çırpar (süzülürken ara ara), dalışta geride, konmuş/yüzerken katlı.
      let kan = 0, ac = 1;
      if (kip === "uc") kan = Math.sin(real * 9 + k * 1.3) * 0.75;
      else if (kip === "suz") kan = Math.sin(real * 7) * 0.4;
      else if (kip === "dalis") { kan = 0.5; ac = 0.75; }
      else { kan = 0.15; ac = 0.42; }
      for (const [mesh, sgn] of [[G.kanatL, -1], [G.kanatR, 1]]) {
        QW.setFromAxisAngle(ZEK, sgn * kan);
        MW.compose(VW, QW, SW.set(ac, 1, ac > 0.5 ? 1 : 0.8));
        mesh.setMatrixAt(k, MW.premultiply(M4));
      }
      if (k === 0) {
        // Simit: kapıştan sonra hırsızın gagasında (konunca önünde suda).
        G.simit.visible = t >= 0;
        if (t >= 0) {
          const ileri = kip === "yuzer" ? 0.45 : 0.62;
          G.simit.position.set(m0[0] + Math.sin(hz) * ileri * s, m0[1] + (kip === "yuzer" ? -0.03 : 0.04) * s, m0[2] + Math.cos(hz) * ileri * s);
          G.simit.rotation.set(0, hz, 0);
        }
      }
    }
    G.govde.instanceMatrix.needsUpdate = G.kanatL.instanceMatrix.needsUpdate = G.kanatR.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------ sakinler

  /** Simidi kaptıran: olay saatinde dışarıda ya da evde, iskeleye yürüyebilecek bir sakin (yoksa adaya gelen biri). */
  function gorev(people, day, S, plans) {
    if (!K || K.o !== S.plan) return [];
    const R = people.residents, T = K.o.bas, aday = [];
    const yerOf = (seg) => (seg.ne === "meydan" || seg.ne === "hobi" ? world.placeOf?.(seg.ne === "hobi" ? seg.yer.replace("hobi:", "") : "meydan")?.anchors?.[0] : null);
    plans.forEach((plan, i) => {
      const seg = plan.find((s) => s.bas <= T - 4 && s.son >= T + 8);
      if (!seg) return;
      const a = seg.ne === "ev" ? people.homes[i]?.door : yerOf(seg);
      if (!a) return;
      const d = Math.hypot(a[0] - K.V[0], a[1] - K.V[1]);
      if (d > 700) return;
      aday.push({ i, d, r: roll(R[i].seed, "martiKurban", day) % 1000 });
    });
    aday.sort((a, b) => a.d / 700 + a.r / 1000 - (b.d / 700 + b.r / 1000));
    const k = aday[0];
    if (!k) { K.kurban = null; return []; }
    K.kurban = k.i;
    K.kurbanG = { height: people.colors?.[k.i]?.height ?? 1.75 };
    return [{ i: k.i, T0: K.o.bas + 0.5, T1: K.o.son, commute: Math.max(2, Math.round(k.d / 1.25 / 60) + 1), item: { modul: "marti", rol: "kurban", x: K.V[0], z: K.V[1], heading: aci(K.out[0], K.out[1]) } }];
  }

  /** Kurbanın duruşu (t: kapıştan sn): yer, uzatır, kapışta irkilir, martıyı gösterir, güler. */
  function kurbanPoz(p, tk, t, ph, idle) {
    const yiyecek = DIL === "en" ? "sosisli" : "simit";
    const G0 = marti(0, tk, a3), bak = fark(aci(G0[0] - p.x, G0[2] - p.z) - p.heading);
    if (tk < -DALIS - 6) {
      // Yer: ara ara ağzına götürür (9 sn'de bir), arada elinde tutar; martılara bakar.
      const isir = ((t + ph * 3) % 9) < 1.6;
      p.props = [yiyecek]; p.shR = isir ? 1.9 : 0.85; p.elR = isir ? 2.25 : 1.5; p.headPitch = isir ? 0.05 : -0.35; p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.5;
      idle(p, t, ph, false); p.shR = isir ? 1.9 : 0.85; p.elR = isir ? 2.25 : 1.5;
    } else if (tk < 0) {
      // Denize bakarken simidi önünde tutar (martı oradan kapar).
      p.props = [yiyecek]; p.shR = 1.2; p.elR = 0.5; p.headPitch = -0.1; p.headYaw = Math.max(-0.8, Math.min(0.8, bak)) * 0.6;
    } else if (tk < 3.5) { p.shL = p.shR = 2.3; p.elL = p.elR = 2.3; p.abL = p.abR = 0.3; p.lean = -0.12; p.headPitch = -0.35; p.headYaw = Math.max(-1, Math.min(1, bak)); }
    else if (tk < 28) { p.shR = 1.6; p.elR = 0.15; p.headPitch = -0.3; p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.9; p.shL = 0.4; p.elL = 1.2; }
    else if (tk < 45) { p.shL = p.shR = 0.55; p.elL = p.elR = 1.65; p.abL = p.abR = 0.45; p.headPitch = -0.1; } // omuz silker, avuçlar açık
    else tavirPoz(p, ((t / 14 + ph) | 0) % 3 === 0 ? "gul" : "konus", t, ph, bak, idle);
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    stand(it.x, it.z, it.heading);
    if (!K) return true;
    const tk = (minute - K.Tg) * 60;
    if (it.rol === "kurban") { kurbanPoz(p, tk, t, ph, idleGesture); return true; }
    // İskeledeki seyirci: önce martıları izler/çeker; kapışta irkilir, sonra güler ve gösterir.
    const G0 = marti(0, tk, a3), bak = fark(aci(G0[0] - it.x, G0[2] - it.z) - it.heading);
    let tavir = it.tavir === "cek" ? "cek" : "bak";
    if (tk >= 0 && tk < 2.5) tavir = "sasir";
    else if (tk >= 2.5 && tk < 70) tavir = (roll(i, "mGul") % 3) === 0 ? "goster" : "gul";
    else if (tk >= 70) tavir = it.tavir;
    tavirPoz(p, tavir, t, ph, bak, idleGesture);
    if (tavir === "bak" || tavir === "cek") { p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.7; p.headPitch = -0.25; }
    return true;
  }

  /** Kurban sakin değilse (o saatte kimse yoksa) adaya gelen biri yer simidini. */
  const fp = {};
  function ekstra(crowd, minute, time) {
    if (!K || K.kurban != null || minute < K.o.bas + 0.5 || minute >= K.o.son) return;
    resetPose(fp); Object.assign(fp, K.kurbanG); fp.t = time;
    fp.x = K.V[0]; fp.z = K.V[1]; fp.y = K.y0; fp.heading = aci(K.out[0], K.out[1]);
    kurbanPoz(fp, (minute - K.Tg) * 60, time, 0.3, (p, t, ph) => { p.headYaw = 0.2 * Math.sin(t * 0.3 + ph); });
    crowd.add(-1, fp);
  }

  /** Video: kapıştan önce kurban ve tepesindeki martılar, dalışta kurbanla martının arası, sonra simitli martı. */
  function canli(m) {
    if (!K) return null;
    const t = (m - K.Tg) * 60;
    // Kapıştan önce ve hemen sonra kurbanın göğsü (iskelenin üstünde: kamera yüksekliği iskeleye göre; martı denizden
    // kurbanın arkasından dalar). Sonra simitli martı.
    if (t < 5) return [K.V[0] + K.out[0] * 0.4, K.y0 + 1.5, K.V[1] + K.out[1] * 0.4];
    const g = marti(0, t, [0, 0, 0]);
    return [g[0], g[1], g[2]];
  }
  function anlik(o, m) {
    if (!K || K.o !== o) return null;
    const t = (m - K.Tg) * 60;
    if (t < 6 || t > K.TL + 8) return null;
    const g = marti(0, t, [0, 0, 0]);
    // Kovalama: iskeleyle martıların arası (ikisi de kadrajda).
    return { odak: [(g[0] + K.V[0]) / 2, (g[2] + K.V[1]) / 2], gitD: 42, gitEgim: 0.35, odakY: 4 };
  }

  function ses(minute) {
    if (!K || minute < K.o.bas || minute >= K.o.son) return null;
    const t = (minute - K.Tg) * 60;
    return { kalabalik: t > 0 && t < 80 ? 0.6 : 0.2 };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const t = (minute - K.Tg) * 60, sey = S.seyirci, en = DIL === "en";
    const sakin = K.kurban != null;
    if (en) {
      const kim = sakin ? "a neighbor" : "a visitor";
      if (t < 0) return { kisa: "Seagulls circling the pier", uzun: `On the pier ${kim} is eating a hot dog at the railing; six seagulls are circling overhead and two have landed on the railing.` };
      if (t < K.TL + 5) return { kisa: "Seagull snatches a hot dog!", uzun: `At ${saatYaz(K.Tg)} a seagull dove down and snatched the hot dog right out of ${kim}'s hand on the pier, then flew off over the water with five gulls chasing it${sey ? `; ${sey} people on the pier burst out laughing` : ""}.` };
      if (minute < o.son - 0.4) return { kisa: "The seagull got away with the hot dog", uzun: `At ${saatYaz(K.Tg)} a seagull snatched a hot dog out of ${kim}'s hand on the pier and five gulls chased it over the water${sey ? ` while ${sey} people laughed` : ""}. It finally landed on the water with its prize and the others squabbled around it.` };
      return { kisa: `Seagull snatched a hot dog on the pier · ${saatYaz(K.Tg)}`, uzun: `At ${saatYaz(K.Tg)} a seagull dove down and snatched a hot dog out of ${kim}'s hand on the pier; five gulls chased it over the water${sey ? ` and ${sey} people on the pier laughed` : ""}. It landed on the water with the hot dog and the others gathered around it.` };
    }
    const kimin = sakin ? "bir sakinin" : "iskeleye gelen birinin", kim = sakin ? "bir sakin" : "iskeleye gelen biri";
    if (t < 0) return { kisa: "İskelede martılar dolanıyor", uzun: `Vapur iskelesinde ${kim} korkuluğun başında simidini yiyor; tepesinde altı martı dönüyor, ikisi korkuluğa kondu.` };
    if (t < K.TL + 5) return { kisa: "Martı simidi kaptı!", uzun: `Saat ${saatte(K.Tg)} iskelede bir martı dalıp ${kimin} elindeki simidi kaptı ve denize doğru kaçtı; beş martı peşine düştü${sey ? `, iskeledeki ${sey} kişi kahkahayı bastı` : ""}.` };
    if (minute < o.son - 0.4) return { kisa: "Martı simitle kaçtı", uzun: `Saat ${saatte(K.Tg)} bir martı iskelede ${kimin} elinden simidi kapıp kaçtı, beş martı peşine düştü${sey ? `; ${sey} kişi güldü` : ""}. Simitli martı sonunda denize kondu, öbürleri çevresinde didişiyor.` };
    return { kisa: `Bugün iskelede martı simit kaptı · ${saatYaz(K.Tg)}`, uzun: `Saat ${saatte(K.Tg)} vapur iskelesinde bir martı dalıp ${kimin} elindeki simidi kaptı; beş martı denizin üstünde peşine düştü${sey ? `, iskeledeki ${sey} kişi güldü` : ""}. Martı simitle denize kondu, öbürleri de çevresine kondu.` };
  }

  return {
    kur, update, gorev, durus, ekstra, canli, anlik, ses, yazi,
    seyirciBas: (o) => (K && K.o === o ? K.Tg - 14 : o.bas),
    seyirci: { r0: 2.4, r1: 7, isR: 220, uzak: 1.8, en: 12, ozel: true, tavirlar: ["cek", "bak", "konus", "cek", "bak"] },
  };
}
