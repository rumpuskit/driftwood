// Dev av (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Mercanada: açıktan dönen bir balıkçı teknesi güvertesinde 3 metrelik dev bir orkinosla Balıkçı Koyu'na gelir, iskeleye
// yanaşır; orkinos teknenin bumbasıyla kaldırılıp iskeledeki balık askısına kuyruğundan asılır, sakinler fotoğraf için toplanır.
// Driftwood: ıstakoz teknesi dev bir ıstakozla (kıskaçlarıyla ~1,8 m) Fishing Wharf'a döner; ıstakoz kasasıyla vinçle iskeleye
// konur, kıskaçlarını açıp kapar. Koyun balıkçıları (mesaideyse) avın yanında durur. Kimse yaralanmaz.
// Her şey (dakika, plan, dünya) işlevidir: video günün her saniyesini aynı çizer. Tekne ve av olaydan sonra gün boyu iskelede kalır.
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { roll } from "../sim.js";
import { balikciTeknesi, istakozTeknesi, kopukHavuzu, tekneIzi, birlestir, TEKNE_MAT, ease, clamp01, lerp } from "./olay-tekne.js";
import { box, colored, cyl } from "./harbor.js";

const EN = DIL === "en";
// Evre sınırları (olay-plan.js E.balik ile aynı): dönüş 0–0.3, yanaşma –0.42, indirme –0.58, fotoğraf –1.
const F = { yanas: 0.3, dok: 0.42, kaldir0: 0.44, kaldir1: 0.48, cevir1: 0.53, indir1: 0.56, birak: 0.57, geri1: 0.61 };

/** Orkinos (boy L; baş +z, sırt +y): koyu lacivert sırt, gümüş karın, sarı yüzgeççikler, hilal kuyruk. */
function orkinosGeo(L = 3.1) {
  const R = L * 0.135, prof = [];
  for (let i = 0; i <= 16; i++) {
    const s = i / 16; // 0 kuyruk sapı, 1 burun
    const r = s < 0.12 ? R * (0.12 + 0.6 * (s / 0.12) ** 1.5) : R * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * (s - 0.12) / 0.88) * 0.5 + Math.PI * 0.5 * (s > 0.6 ? (s - 0.6) / 0.4 : 0)), 0.7) * (s > 0.85 ? 1 - ((s - 0.85) / 0.15) ** 2 * 0.85 : 1);
    prof.push(new THREE.Vector2(Math.max(0.005, r), (s - 0.5) * L));
  }
  const body = new THREE.LatheGeometry(prof, 16).rotateX(Math.PI / 2); // boy y → −z… (aşağıda düzeltilir)
  body.rotateY(Math.PI); // burun +z
  // Renk: sırt koyu, karın gümüş (yerel y'ye göre).
  const pos = body.attributes.position, col = new Float32Array(pos.count * 3), sirt = new THREE.Color("#1d2c4a"), karin = new THREE.Color("#c9d2d8"), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const k = THREE.MathUtils.smoothstep(pos.getY(i) / R, -0.25, 0.35); c.copy(karin).lerp(sirt, k); col.set([c.r, c.g, c.b], i * 3); }
  body.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const tri = (pts, renk) => {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3)); g.setIndex(pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
    return colored(g, renk);
  };
  const zt = -L / 2;
  const parts = [body,
    // Hilal kuyruk (dikey).
    tri([[0, 0, zt + 0.05], [0, R * 1.9, zt - R * 1.1], [0, R * 1.2, zt - R * 0.55], [0, 0, zt - 0.1]], "#1a2440"),
    tri([[0, 0, zt + 0.05], [0, -R * 1.9, zt - R * 1.1], [0, -R * 1.2, zt - R * 0.55], [0, 0, zt - 0.1]], "#1a2440"),
    // Sırt yüzgeçleri, anal yüzgeç, göğüs yüzgeçleri.
    tri([[0, R * 0.85, L * 0.12], [0, R * 1.9, L * 0.02], [0, R * 0.9, -L * 0.04]], "#1d2c4a"),
    tri([[0, R * 0.6, -L * 0.14], [0, R * 1.5, -L * 0.2], [0, R * 0.5, -L * 0.24]], "#c9a227"),
    tri([[0, -R * 0.6, -L * 0.14], [0, -R * 1.4, -L * 0.2], [0, -R * 0.5, -L * 0.24]], "#c9a227"),
    tri([[R * 0.9, 0, L * 0.2], [R * 1.1, -R * 0.2, -L * 0.08], [R * 0.95, R * 0.1, L * 0.16]], "#24324f"),
    tri([[-R * 0.9, 0, L * 0.2], [-R * 1.1, -R * 0.2, -L * 0.08], [-R * 0.95, R * 0.1, L * 0.16]], "#24324f"),
  ];
  // Sarı yüzgeççikler (kuyruğa doğru sırt ve karında).
  for (let k = 0; k < 6; k++) {
    const z = -L * 0.27 - k * L * 0.032, r = R * (0.55 - k * 0.06);
    for (const sy of [1, -1]) parts.push(tri([[0, sy * r, z + 0.03], [0, sy * (r + 0.07), z - 0.02], [0, sy * r, z - 0.05]], "#e2b52a"));
  }
  for (const sx of [-1, 1]) parts.push(colored(new THREE.SphereGeometry(R * 0.13, 8, 6).translate(sx * R * 0.62, R * 0.15, L * 0.38), "#0d0f12"));
  return birlestir(parts);
}

/** Dev ıstakoz (kıskaçlarıyla boy ~1,4 m; baş +z): gövde + kuyruk + bacaklar + antenler; kıskaçlar ayrı (açılıp kapanır). */
function istakozParcalari() {
  const K1 = "#8e2f1d", K2 = "#a83c22", K3 = "#e0753a";
  const p = [];
  const elips = (rx, ry, rz, x, y, z, renk, ry0 = 0) => colored(new THREE.SphereGeometry(1, 12, 8).scale(rx, ry, rz).rotateY(ry0).translate(x, y, z), renk);
  p.push(elips(0.13, 0.11, 0.24, 0, 0.12, 0.02, K1)); // baş-göğüs
  for (let k = 0; k < 6; k++) p.push(elips(0.115 - k * 0.008, 0.075 - k * 0.004, 0.06, 0, 0.1 - k * 0.006, -0.24 - k * 0.085, k % 2 ? K2 : K1));
  // Kuyruk yelpazesi.
  for (let k = -2; k <= 2; k++) p.push(colored(new THREE.BoxGeometry(0.07, 0.015, 0.13).rotateY(k * 0.32).translate(k * 0.045, 0.06, -0.78), K2));
  // Yürüme bacakları (4 çift) ve antenler.
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const z = 0.08 - k * 0.07;
    p.push(colored(new THREE.CylinderGeometry(0.012, 0.01, 0.28, 5).rotateZ(sx * 1.0).translate(sx * 0.2, 0.04, z), K3));
  }
  for (const sx of [-1, 1]) {
    p.push(colored(new THREE.CylinderGeometry(0.012, 0.006, 0.75, 5).rotateX(Math.PI / 2 - 0.35).rotateZ(sx * 0.35).translate(sx * 0.12, 0.3, 0.55), K3));
    p.push(colored(new THREE.SphereGeometry(0.022, 6, 5).translate(sx * 0.06, 0.2, 0.25), "#111"));
  }
  const govde = birlestir(p);
  // Kıskaç (sağ/sol aynı; x > 0 tarafı): kol iki boğum, büyük kıskaç (sabit parmak + oynar parmak ayrı).
  const kol = birlestir([
    colored(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 7).rotateX(Math.PI / 2).rotateY(0.7).translate(0.07, 0.1, 0.12), K2),
    colored(new THREE.CylinderGeometry(0.045, 0.035, 0.2, 7).rotateX(Math.PI / 2).translate(0.15, 0.1, 0.3), K2),
    elips(0.085, 0.06, 0.17, 0.16, 0.1, 0.5, K1),
    colored(new THREE.ConeGeometry(0.045, 0.2, 7).rotateX(Math.PI / 2).translate(0.13, 0.1, 0.72), K1),
  ]);
  const parmak = birlestir([colored(new THREE.ConeGeometry(0.038, 0.2, 7).rotateX(Math.PI / 2).translate(0, 0, 0.1), K3)]);
  return { govde, kol, parmak };
}

/** Balık askısı (iki dikme, üst kiriş, kanca, sarı kantar): (x, y, z) taban ortası, açıklık w, yükseklik h. */
function askiGeo(w, h) {
  return birlestir([
    box(0.18, h, 0.18, -w / 2, h / 2, 0, "#7a5a3e"), box(0.18, h, 0.18, w / 2, h / 2, 0, "#7a5a3e"),
    box(w + 0.5, 0.2, 0.22, 0, h, 0, "#7a5a3e"),
    box(0.06, 0.4, 0.06, 0, h - 0.3, 0, "#3a3f47"), box(0.32, 0.36, 0.14, 0, h - 0.62, 0, "#e8b93a"), box(0.04, 0.3, 0.04, 0, h - 0.95, 0, "#3a3f47"),
    // Arkada levha (kuru tahta).
    box(w * 0.8, 0.55, 0.05, 0, h - 0.55, -0.15, "#e9e2cf"),
  ]);
}
/** Istakoz kasası (tahta çıtalı). */
function kasaGeo() {
  const p = [box(0.95, 0.06, 0.62, 0, 0.03, 0, "#9b7350")];
  for (const y of [0.12, 0.26, 0.4]) for (const sz of [-1, 1]) p.push(box(0.95, 0.07, 0.04, 0, y, sz * 0.3, "#b08a5e"));
  for (const y of [0.12, 0.26, 0.4]) for (const sx of [-1, 1]) p.push(box(0.04, 0.07, 0.62, sx * 0.46, y, 0, "#b08a5e"));
  p.push(box(0.97, 0.05, 0.64, 0, 0.46, 0, "#9b7350"));
  return birlestir(p);
}

export function buildBalikOlay({ world, scene }) {
  let G = null, K = null;
  const Y = new THREE.Vector3(0, 1, 0), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const _p = { x: 0, z: 0, h: 0 };

  function geoKur() {
    const group = new THREE.Group(); group.name = "olay-balik"; scene.add(group);
    const tekne = EN ? istakozTeknesi(11, "#f4f1ea", "#2a6b4a", "#f6f4ee") : balikciTeknesi(13);
    group.add(tekne.mesh);
    // Bumba (yük kolu): birim boy, +z yönünde; mafsalda döner.
    const bumba = new THREE.Mesh(birlestir([cyl(0.07, 0.05, 1, 0, 0.5, 0, "#d9d4c8", 6).rotateX(Math.PI / 2), box(0.12, 0.12, 0.12, 0, 0, 1, "#3a3f47")]), TEKNE_MAT());
    group.add(bumba);
    const halat = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#d9cfa8", roughness: 0.9 }));
    group.add(halat);
    const kop = kopukHavuzu(group, 160);
    let av, kiskac = null, aski = null, kasa = null;
    if (EN) {
      const P = istakozParcalari();
      av = new THREE.Group();
      kasa = new THREE.Mesh(kasaGeo(), TEKNE_MAT()); av.add(kasa);
      const ist = new THREE.Group(); ist.position.set(0, 0.5, -0.1); ist.scale.setScalar(1.3); av.add(ist); // kıskaçlarıyla ~1,8 m
      ist.add(new THREE.Mesh(P.govde, TEKNE_MAT()));
      kiskac = [1, -1].map((sx) => {
        const g = new THREE.Group(); g.scale.x = sx; ist.add(g);
        g.add(new THREE.Mesh(P.kol, TEKNE_MAT()));
        const pm = new THREE.Mesh(P.parmak, TEKNE_MAT()); pm.position.set(0.2, 0.1, 0.62); g.add(pm);
        return { g, pm };
      });
      av.userData.ist = ist;
    } else {
      av = new THREE.Mesh(orkinosGeo(3.1), TEKNE_MAT());
      aski = new THREE.Mesh(askiGeo(1.9, 4.7), TEKNE_MAT()); group.add(aski);
    }
    av.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    group.add(av);
    group.visible = false;
    return { group, tekne, bumba, halat, kop, av, kiskac, aski, kasa };
  }

  // --- kurgu ---
  function kur(o) {
    const koy = world.koy;
    if (!koy?.jetty) return null;
    G ??= geoKur();
    const j = koy.jetty, pr = world.piers.find((q) => q.x0 <= j.x && q.x1 >= j.x && Math.abs(q.z1 - j.z1) < 2) ?? { x0: j.x - 1.3, x1: j.x + 1.3, top: 1.53 };
    const w = pr.x1 - pr.x0, top = pr.top ?? 1.53;
    const len = EN ? 11 : 13, beam = len * (EN ? 0.34 : 0.33);
    // Tekne iskelenin ucunda, doğu yanında, pruvası karaya (kuzeye) dönük.
    const dok = { x: j.x + w / 2 + beam / 2 + 0.35, z: j.z1 - 1.5, h: Math.PI };
    const D = o.son - o.bas, T = (k) => o.bas + k * D;
    // Avın son yeri: Mercanada askı iskelenin ucunda (ortası), Driftwood kasa iskelenin üstünde.
    const son = EN ? { x: j.x - 0.2, z: j.z1 - 3.2 } : { x: j.x, z: j.z1 - 2.4 };
    // Bumba mafsalı tekne yerelinde (Mercanada direk, Driftwood çekme makarası), boyu, güvertedeki av yeri (yerel).
    const H = G.tekne.H;
    const mafsal = EN ? [beam * 0.3, H.deckY(0.44) + 1.35, H.z(0.44)] : [...G.tekne.direk];
    // Askı/kasa yerine olan yatay uzaklık → bumba açısı (eğim) ve boyu: uç tam üstünde.
    const mw = yerel(dok, mafsal[0], mafsal[2], {}), r = Math.hypot(son.x - mw.x, son.z - mw.z);
    const bl = EN ? r / Math.cos(0.5) : G.tekne.bumbaBoy, egim = Math.acos(Math.min(0.95, r / bl));
    const kancaY = EN ? top + 0.5 : top + 4.7 - 1.0; // av asılınca kuyruğun/kasanın tutulduğu yükseklik
    const S0 = { x: dok.x + 300, z: dok.z + 2100 }, C1 = { x: dok.x, z: dok.z + 260 };
    // Güvertedeki av: bumbanın dinlenme yönünde, aynı yatay uzaklıkta (kaldırırken dikine çıkar).
    const guverte = EN ? [mafsal[0] - r * Math.sin(0.0) * 0, H.deckY(0.2) + 0.02, mafsal[2] - r] : [0, H.deckY(0.2) + 0.25, mafsal[2] - r];
    K = { o, D, T, dok, son, mafsal, r, bl, egim, kancaY, S0, C1, top, guverte, len, beam };
    if (aski()) { G.aski.position.set(son.x, top, son.z); G.aski.rotation.y = 0; }
    // Kalabalık iskelenin karaya yakın yarısında ve kıyıdaki tahta yolda (av karşılarında).
    const kal = [j.x, j.z0 + (j.z1 - j.z0) * 0.35];
    return { odak: [son.x + 0.8, son.z - 0.5], odakY: EN ? 2.0 : 3.2, kalabalik: kal, kiyi: null, yon: Math.atan2(-0.5, 0.86), yerAdi: EN ? "Fishing Wharf" : "Balıkçı Koyu", zaman: null,
      gitD: EN ? 30 : 46, gitEgim: 0.32, cekimOlcek: EN ? 0.55 : 0.75, cekimOlcekH: EN ? 0.6 : 0.8, kalabalikArkadan: true };
  }
  const aski = () => G?.aski;
  const yerel = (P, lx, lz, out) => { const c = Math.cos(P.h), s = Math.sin(P.h); out.x = P.x + lx * c + lz * s; out.z = P.z - lx * s + lz * c; return out; };

  /** Teknenin duruşu (dakika); olaydan önce null. */
  function teknePoz(m, out) {
    if (!K || m < K.o.bas) return null;
    const u = (m - K.o.bas) / K.D;
    let e;
    if (u < F.yanas) e = 0.85 * (u / F.yanas);
    else if (u < F.dok) { const w = (u - F.yanas) / (F.dok - F.yanas); e = 0.85 + 0.15 * (1 - (1 - w) ** 2.2); }
    else { out.x = K.dok.x; out.z = K.dok.z; out.h = K.dok.h; return out; }
    const a = K.S0, b = K.C1, c = K.dok, n = 1 - e;
    out.x = n * n * a.x + 2 * n * e * b.x + e * e * c.x; out.z = n * n * a.z + 2 * n * e * b.z + e * e * c.z;
    const tx = 2 * n * (b.x - a.x) + 2 * e * (c.x - b.x), tz = 2 * n * (b.z - a.z) + 2 * e * (c.z - b.z);
    out.h = Math.atan2(tx, tz);
    return out;
  }

  /** Bumba azimutu (dünya açısı; uç = mafsal + bl·(cos eğim · yön, sin eğim)), halat boyu, av durumu. */
  function vinc(m) {
    const u = (m - K.o.bas) / K.D, P = K.dok;
    const mw = yerel(P, K.mafsal[0], K.mafsal[2], {});
    const azDinlen = P.h + Math.PI; // teknenin kıçına doğru (güvertedeki ava)
    const azAvYeri = Math.atan2(K.son.x - mw.x, K.son.z - mw.z);
    let d = azAvYeri - azDinlen; d = Math.atan2(Math.sin(d), Math.cos(d));
    let az = azDinlen, durum = "guverte", kalk = 0;
    if (u >= F.kaldir0 && u < F.kaldir1) { durum = "kalkiyor"; kalk = ease((u - F.kaldir0) / (F.kaldir1 - F.kaldir0)); }
    else if (u >= F.kaldir1 && u < F.cevir1) { durum = "havada"; kalk = 1; az = azDinlen + d * ease((u - F.kaldir1) / (F.cevir1 - F.kaldir1)); }
    else if (u >= F.cevir1 && u < F.birak) { durum = "iniyor"; kalk = 1; az = azAvYeri; }
    else if (u >= F.birak) { durum = "yerinde"; az = u < F.geri1 ? azAvYeri - d * ease((u - F.birak) / (F.geri1 - F.birak)) : azDinlen; }
    const ce = Math.cos(K.egim), se = Math.sin(K.egim);
    const uc = { x: mw.x + Math.sin(az) * K.bl * ce, y: K.mafsal[1] + 0.2 + K.bl * se, z: mw.z + Math.cos(az) * K.bl * ce };
    return { mw, az, uc, durum, kalk, u };
  }

  function update(o, evre, minute, real, env) {
    if (!G) return;
    if (!o || !K || K.o !== o || minute < o.bas) { G.group.visible = false; return; }
    G.group.visible = true;
    const t = real, bob = 0.06 * Math.sin(t * 1.1), P = teknePoz(minute, _p);
    const tk = G.tekne.mesh;
    tk.position.set(P.x, 0.08 + bob, P.z); tk.rotation.set(0.012 * Math.sin(t * 0.8), P.h, 0.02 * Math.sin(t * 0.9));
    const V = vinc(minute);
    const docked = minute >= K.T(F.dok);
    // Bumba: mafsaldan uca.
    const yukS = 0.08 + bob;
    if (docked) {
      v1.set(V.mw.x, K.mafsal[1] + yukS, V.mw.z); v2.set(V.uc.x, V.uc.y + yukS, V.uc.z);
    } else {
      const mw = yerel(P, K.mafsal[0], K.mafsal[2], {}), az = P.h + Math.PI, ce = Math.cos(K.egim), se = Math.sin(K.egim);
      v1.set(mw.x, K.mafsal[1] + yukS, mw.z); v2.set(mw.x + Math.sin(az) * K.bl * ce, K.mafsal[1] + yukS + K.bl * se, mw.z + Math.cos(az) * K.bl * ce);
    }
    G.bumba.position.copy(v1); G.bumba.scale.set(1, 1, v1.distanceTo(v2)); G.bumba.lookAt(v2);
    // Av.
    const av = G.av, sal = 0.06 * Math.sin(t * 1.3);
    let halatAlt = null;
    const L = 3.1;
    if (!docked || V.durum === "guverte") {
      // Güvertede yatıyor (orkinos boylamasına, ıstakoz kasasında).
      const g = yerel(P, K.guverte[0], K.guverte[2], {});
      av.position.set(g.x, K.guverte[1] + yukS, g.z);
      av.rotation.set(0, P.h + (EN ? 0 : Math.PI), 0);
    } else if (V.durum === "yerinde") {
      if (EN) { av.position.set(K.son.x, K.top, K.son.z); av.rotation.set(0, -0.6, 0); } // kıskaçlar denize/kameraya
      else { av.position.set(K.son.x, K.kancaY - L / 2, K.son.z); av.rotation.set(Math.PI / 2, 1.05 + 0.08 * Math.sin(t * 0.7), 0, "YXZ"); } // böğrü kameraya (güneybatı) dönük
    } else {
      // Halatta: kuyruk (kasa) bumbanın ucundan sarkar; kalkarken yatıktan dikine döner.
      const ustY = V.durum === "kalkiyor" ? lerp(K.guverte[1] + yukS + (EN ? 0.5 : 0.25), K.kancaY + (EN ? 0.6 : 0), V.kalk) : V.durum === "iniyor" && EN ? lerp(K.kancaY + 0.6, K.top + 0.5, ease((V.u - F.cevir1) / (F.birak - F.cevir1))) : K.kancaY + (EN ? 0.6 : 0);
      const g = yerel(P, K.guverte[0], K.guverte[2], {});
      const hx = V.durum === "kalkiyor" ? lerp(g.x, V.uc.x, V.kalk) : V.uc.x, hz = V.durum === "kalkiyor" ? lerp(g.z, V.uc.z, V.kalk) : V.uc.z;
      halatAlt = [hx, ustY, hz];
      if (EN) { av.position.set(hx + sal * 0.3, ustY - 0.5, hz); av.rotation.set(0, V.az, 0); }
      else {
        const dik = V.durum === "kalkiyor" ? ease(Math.min(1, V.kalk * 1.6)) : 1;
        av.rotation.set(dik * Math.PI / 2, P.h + Math.PI + sal, 0, "YXZ");
        av.position.set(hx, ustY - (L / 2) * Math.sin(dik * Math.PI / 2) - 0.25 * (1 - dik), hz);
      }
    }
    // Istakoz: kıskaçlar açılıp kapanır, hafif kıpırdar (canlı).
    if (G.kiskac) G.kiskac.forEach((k, i) => { const a = 0.25 + 0.25 * Math.max(0, Math.sin(t * 1.3 + i * 1.9)); k.pm.rotation.y = a; k.g.rotation.x = -0.55 - 0.2 * Math.sin(t * 0.6 + i); }); // kıskaçlar havada
    G.halat.visible = !!halatAlt;
    if (halatAlt) {
      v1.set(V.uc.x, V.uc.y + yukS, V.uc.z); v2.set(...halatAlt);
      const d = v2.clone().sub(v1), Lh = Math.max(0.1, d.length());
      G.halat.position.copy(v1); G.halat.scale.set(1, Lh, 1); G.halat.quaternion.setFromUnitVectors(Y, d.normalize());
    }
    // Köpük: dönüşte iz.
    G.kop.basla();
    if (!docked) tekneIzi(G.kop, (sn, out) => teknePoz(o.bas + sn / 60, out), (minute - o.bas) * 60, { boy: K.len, en: K.beam, hiz0: 4, n: 12, dt: 1.0 });
    G.kop.bitir(env?.light ?? 1);
  }

  function canli(minute) {
    if (!K || minute < K.o.bas || minute > K.o.son) return null;
    if (minute < K.T(F.kaldir0)) { const P = teknePoz(minute, _p); return [P.x, 2, P.z]; }
    return [K.son.x, EN ? K.top + 0.6 : K.kancaY - 1.2, K.son.z];
  }

  /** Görevliler: o saatte koyda mesaide olan balıkçılar (en çok 2) tekne yanaşınca avın yanına gelir. */
  function gorev(people, day, S, plans) {
    if (!K) return [];
    const T0 = K.T(F.dok) + 0.4, T1 = Math.min(K.o.son + 4, T0 + 40);
    const R = people.residents;
    const adaylar = R.map((r, i) => i).filter((i) => people.works[i]?.job === "balikci" && plans[i].some((s) => s.ne === "is" && s.bas <= T0 - 3 && s.son >= T1 + 2))
      .sort((a, b) => roll(R[a].seed, "balikGorev" + K.o.yuva, day) - roll(R[b].seed, "balikGorev" + K.o.yuva, day)).slice(0, 2);
    const yerler = EN
      ? [{ x: K.son.x + 0.8, z: K.son.z - 1.4, heading: Math.PI + 0.4 }, { x: K.son.x - 0.9, z: K.son.z - 1.5, heading: Math.PI - 0.4 }]
      : [{ x: K.son.x + 0.55, z: K.son.z - 0.9, heading: Math.PI + 0.5 }, { x: K.son.x - 0.6, z: K.son.z - 1.0, heading: Math.PI - 0.5 }];
    K.balikci = adaylar.length;
    // Yerler iskelenin karaya bakan yanında (av arkada, kalabalığa dönük).
    return adaylar.map((i, k) => ({ i, T0, T1, commute: 1, item: { modul: "balik", x: yerler[k].x, z: yerler[k].z, heading: yerler[k].heading + Math.PI, rol: k ? "goster" : "poz" } }));
  }
  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    stand(it.x, it.z, it.heading);
    if (it.rol === "poz") { p.shR = 1.25; p.elR = 0.25; p.abR = 0.3; p.shL = 0.35; p.elL = 1.7; p.abL = 0.5; p.headYaw = 0.25; } // bir el avda, öbürü belde
    else { const g = Math.max(0, Math.sin(t * 0.6 + ph)); p.shL = 0.5 + 0.9 * g; p.elL = 0.2; idleGesture(p, t, ph, true); }
    return true;
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const u = (minute - o.bas) / K.D, n = S.seyirci, dok = K.T(F.dok), asildi = K.T(F.birak);
    const bal = K.balikci ? (EN ? (K.balikci > 1 ? " The wharf's lobstermen stood by the catch." : " A Driftwood lobsterman stood by the catch.") : (K.balikci > 1 ? " Koyun balıkçıları orkinosun yanında durdu." : " Koyun bir balıkçısı orkinosun yanında durdu.")) : "";
    if (EN) {
      const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} came down to take pictures.` : "";
      if (u < F.yanas) return { kisa: "Giant lobster on its way in!", uzun: `At ${saatYaz(o.bas)} a lobster boat came in from offshore heading for the Fishing Wharf with a giant lobster on deck, about six feet long with its claws.` };
      if (u < F.dok) return { kisa: "Lobster boat coming into the wharf", uzun: `A lobster boat with a giant lobster on deck is coming alongside the Fishing Wharf.` };
      if (u < F.birak) return { kisa: "Giant lobster coming ashore", uzun: `At ${saatYaz(dok)} the lobster boat tied up at the Fishing Wharf; the giant lobster is being hoisted onto the wharf in its crate.` };
      return { kisa: `Giant lobster at the Fishing Wharf · ${saatYaz(dok)}`, uzun: `At ${saatYaz(o.bas)} a lobster boat came in with a giant lobster, about six feet long with its claws. At ${saatYaz(asildi)} it was set on the wharf in its crate, still waving its claws.${izle}${bal}` };
    }
    const izle = n ? ` ${n} kişi fotoğraf çekmek için koya toplandı.` : "";
    if (u < F.yanas) return { kisa: "Tekne dev orkinosla dönüyor!", uzun: `Saat ${saatte(o.bas)} açıktan bir balıkçı teknesi güvertesinde 3 metrelik dev bir orkinosla Balıkçı Koyu'na doğru geliyor.` };
    if (u < F.dok) return { kisa: "Orkinoslu tekne koya yanaşıyor", uzun: `Güvertesinde 3 metrelik bir orkinos olan balıkçı teknesi Balıkçı Koyu iskelesine yanaşıyor.` };
    if (u < F.birak) return { kisa: "Dev orkinos iskeleye çıkarılıyor", uzun: `Tekne saat ${saatte(dok)} Balıkçı Koyu iskelesine yanaştı; orkinos bumbayla kaldırılıp iskeledeki balık askısına asılıyor.` };
    return { kisa: `Balıkçı Koyu'nda dev orkinos · ${saatYaz(dok)}`, uzun: `Saat ${saatte(o.bas)} açıktan dönen bir balıkçı teknesi 3 metrelik dev bir orkinos getirdi. Orkinos ${saatte(asildi)} iskeledeki balık askısına kuyruğundan asıldı.${izle}${bal}` };
  }

  return {
    kur, update, canli, yazi, gorev, durus,
    seyirci: { r0: 1.5, r1: 16, isR: 260, uzak: 1.8, kiyida: true, en: 28, tavirlar: ["cek", "cek", "goster", "sasir", "konus", "cek", "bak"] },
  };
}
