// Film çekimi (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; iki ada, arayüz
// olay-moduller.js). Bir film ekibinin kamyonu çarşının yaya caddesinden (Driftwood: Main Street) meydanın/Town Green'in
// yanına gelir; ekip ışık ayaklarını, reflektörü, kamera vincini ve monitör çadırını kurar, alanı "SET" bandıyla kapatır.
// Çekimde iki oyuncu çeşmenin/bandoşun önünde sahne oynar; klaketçi "motor"da klaketi vurur, vinç kolu yükselip döner,
// mikrofoncu boom'u tutar; birkaç sakin figüran olarak setin içinden yürür; sahne defalarca tekrarlanır. Meraklılar bandın
// arkasından izler. Sonda ekip toplanır, kamyon geri geri çıkar. Oyuncular ve ekip sakin değildir (adları yok).
// Her şey (dakika, tohum, dünya) işlevidir.
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { roll } from "../sim.js";
import { walkPose, sitPose, resetPose } from "./people.js";
import { gorunum, tavirPoz, boya, birlestir, kutu, silindir, malzeme, yaziDoku, isimaMalzeme, clamp01, ease, aci, fark, lerp } from "./olay-yardim.js";

// Evreler (olay-plan.js film ile aynı): kurulum 0–0.15, çekim 0.15–0.85, toplama 0.85–1.
const EC = 0.15, ET = 0.85;
const CEKIM = 1.5, AKSIYON = 0.45; // bir çekim döngüsü (dk) ve "motor"dan "kestik"e (dk)

export function buildFilmOlay({ world, group, traffic }) {
  let K = null, G = null;
  const q = {};

  // ------------------------------------------------ görsel parçalar (ilk film gününde bir kez)
  function gorsel() {
    if (G) return G;
    const mat = malzeme();
    const g = new THREE.Group();
    g.visible = false;
    group.add(g);
    const tekerler = (wb, iz, r, y = r) => [-wb / 2, wb / 2].flatMap((z) => [-iz / 2, iz / 2].map((x) => silindir(r, r, 0.3, x, y, z, "#1d1d20", 12, 0, Math.PI / 2)));
    // Kamyon: kabin + kasa (ön +z), kasanın iki yanında yazı.
    const kamyon = new THREE.Group();
    kamyon.add(new THREE.Mesh(birlestir([
      kutu(2.4, 2.0, 2.0, 0, 1.55, 3.0, "#f4f4f2"), kutu(2.2, 0.8, 0.06, 0, 2.15, 4.02, "#33414f"), kutu(2.45, 0.35, 2.05, 0, 0.6, 3.0, "#2a2b2f"),
      kutu(2.5, 2.9, 6.0, 0, 2.05, -1.3, "#e9e9e6"), kutu(2.52, 0.25, 6.02, 0, 0.62, -1.3, "#2a2b2f"), kutu(2.52, 0.12, 6.02, 0, 3.45, -1.3, "#c9c9c4"),
      kutu(0.3, 0.12, 0.06, -0.85, 1.0, 4.0, "#fff4cc"), kutu(0.3, 0.12, 0.06, 0.85, 1.0, 4.0, "#fff4cc"),
      ...tekerler(4.8, 2.1, 0.5),
    ]), mat));
    const yaziM = new THREE.MeshStandardMaterial({ map: yaziDoku(DIL === "en" ? "FILM CREW" : "FİLM EKİBİ", { zemin: "#1f2c45", renk: "#ffd447", w: 1024, h: 256, font: "bold 150px sans-serif" }), roughness: 0.7 });
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), yaziM); m.position.set(s * 1.27, 2.3, -1.3); m.rotation.y = s * Math.PI / 2; kamyon.add(m); }
    g.add(kamyon);
    // Işık ayağı: üç ayak, direk, lamba kafası (ön yüzü ışıyan), kanatlar; ışıma sprite'ı (PointLight yok).
    const ayak = birlestir([
      ...[0, 2.09, 4.19].map((a) => boya(new THREE.CylinderGeometry(0.025, 0.03, 1.5, 5).rotateX(0.5).translate(0, 0.62, 0.36).rotateY(a), "#2b2b2e")),
      silindir(0.03, 0.035, 2.6, 0, 1.6, 0, "#3a3a3e", 6),
      kutu(0.55, 0.45, 0.4, 0, 2.95, 0, "#1d1d20"), kutu(0.04, 0.45, 0.3, -0.32, 2.95, 0.25, "#1d1d20", -0.6), kutu(0.04, 0.45, 0.3, 0.32, 2.95, 0.25, "#1d1d20", 0.6),
    ]);
    const lamba = new THREE.MeshBasicMaterial({ color: "#fff6dc" });
    const isikAyak = [], isima = [];
    for (let k = 0; k < 3; k++) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(ayak, mat));
      const yuz = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.36), lamba); yuz.position.set(0, 2.95, 0.205); grp.add(yuz);
      const sp = new THREE.Sprite(isimaMalzeme("#fff2c8", 0.75)); sp.position.set(0, 2.95, 0.6); sp.scale.setScalar(2.6); grp.add(sp);
      isima.push(sp); isikAyak.push(grp); g.add(grp);
    }
    // Reflektör: ayakta gümüş pano.
    const reflektor = new THREE.Mesh(birlestir([
      ...[0, 2.09, 4.19].map((a) => boya(new THREE.CylinderGeometry(0.02, 0.025, 1.2, 5).rotateX(0.5).translate(0, 0.5, 0.3).rotateY(a), "#2b2b2e")),
      silindir(0.025, 0.03, 1.6, 0, 1.1, 0, "#3a3a3e", 6), kutu(1.3, 1.3, 0.04, 0, 2.2, 0, "#d9dde2", 0, -0.25),
    ]), mat);
    g.add(reflektor);
    // Kamera vinci: tekerlekli taban, kule, kol (pivot), karşı ağırlık, ucunda kamera.
    const vinc = new THREE.Group();
    vinc.add(new THREE.Mesh(birlestir([kutu(1.6, 0.25, 1.6, 0, 0.25, 0, "#2f3136"), ...tekerler(1.3, 1.3, 0.13), silindir(0.12, 0.16, 1.7, 0, 1.2, 0, "#3b3e44", 8)]), mat));
    const kol = new THREE.Group(); kol.position.y = 2.1;
    kol.add(new THREE.Mesh(birlestir([kutu(0.18, 0.2, 6.2, 0, 0, 1.6, "#3b3e44"), kutu(0.45, 0.45, 0.6, 0, -0.05, -1.6, "#55585e"),
      kutu(0.35, 0.3, 0.55, 0, -0.32, 4.7, "#1c1c1f"), silindir(0.1, 0.12, 0.25, 0, -0.32, 5.05, "#111114", 10, Math.PI / 2), kutu(0.2, 0.18, 0.2, 0, -0.08, 4.6, "#c0392b")]), mat));
    vinc.add(kol);
    g.add(vinc);
    // Monitör çadırı: dört direk, siyah tente, masa ve monitör, iki yönetmen sandalyesi.
    const sandalye = (x, z, ry) => [kutu(0.5, 0.04, 0.45, x, 0.62, z, "#3b2b1f", ry), kutu(0.5, 0.35, 0.03, x - Math.sin(ry) * 0.22, 0.95, z - Math.cos(ry) * 0.22, "#1d1d20", ry),
      ...[[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]].map(([a, b]) => kutu(0.03, 0.62, 0.03, x + Math.cos(ry) * a + Math.sin(ry) * b, 0.31, z - Math.sin(ry) * a + Math.cos(ry) * b, "#3b2b1f"))];
    const cadir = new THREE.Mesh(birlestir([
      ...[[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].map(([x, z]) => silindir(0.03, 0.03, 2.4, x, 1.2, z, "#9a9a9a", 5)),
      kutu(3.3, 0.08, 3.3, 0, 2.42, 0, "#1d1e22"), kutu(1.2, 0.05, 0.6, 0, 0.75, 0.6, "#cfcfcf"), ...[[-0.55, 0.35], [0.55, 0.35], [-0.55, 0.85], [0.55, 0.85]].map(([x, z]) => kutu(0.04, 0.75, 0.04, x, 0.37, z, "#9a9a9a")),
      kutu(0.6, 0.38, 0.05, 0, 1.0, 0.75, "#151517"), kutu(0.54, 0.32, 0.01, 0, 1.0, 0.72, "#4f86c6"),
      ...sandalye(-0.5, -0.3, 0), ...sandalye(0.5, -0.3, 0),
    ]), mat);
    g.add(cadir);
    // Set bandı: direkler (InstancedMesh) ve sarı-siyah yazılı bant.
    const direk = new THREE.InstancedMesh(birlestir([silindir(0.035, 0.035, 1.0, 0, 0.5, 0, "#d8d8d8", 6), silindir(0.16, 0.18, 0.06, 0, 0.03, 0, "#2a2a2a", 8)]), mat, 40);
    direk.count = 0;
    const bantDoku = yaziDoku(DIL === "en" ? "FILM SET · DO NOT CROSS" : "SET · GİRİLMEZ", { zemin: "#ffd31a", renk: "#111", w: 1024, h: 64, font: "bold 44px sans-serif" });
    bantDoku.wrapS = THREE.RepeatWrapping;
    g.add(direk);
    for (const m of [kamyon, vinc, reflektor, cadir, direk]) m.traverse?.((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    G = { g, kamyon, isikAyak, isima, reflektor, vinc, kol, cadir, direk, bantDoku, bantlar: [] };
    return G;
  }

  // ------------------------------------------------ yer ve kurgu

  /** Setin yerleşimi: A oyuncuların yeri, f kameradan oyunculara yön, r f'nin sağı; yerel (u: f boyunca, v: r boyunca). */
  function yerlesim(o) {
    const merkez = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
    const feat = (t) => (world.features ?? []).find((f) => f.type === t && Math.hypot(f.x - merkez[0], f.z - merkez[1]) < 4);
    const bando = feat("bandstand"), cesme = feat("cesme");
    let yonler, uzak, kamyonD;
    if (bando) { yonler = [[0, 1]]; uzak = 20; kamyonD = 57; } // Town Green: güney yarısı, kamyon Main Street'te
    else { yonler = [[0, 1], [1, 0], [0, -1], [-1, 0]]; uzak = cesme ? 12 : 8; kamyonD = 44; } // meydan: dört yaya caddesinden biri
    const sira = yonler.map((_, k) => yonler[(k + (o.tohum >>> 5)) % yonler.length]);
    for (const d of sira) {
      const A = [merkez[0] + d[0] * uzak, merkez[1] + d[1] * uzak], f = [-d[0], -d[1]], r = [-f[1], f[0]];
      const L = (u, v) => [A[0] + f[0] * u + r[0] * v, A[1] + f[1] * u + r[1] * v];
      // Kamyon: kameranın arkasındaki yolda (yaya caddesi / Main Street), sete dönük; 110 m geriden gelir.
      let park, yol;
      if (bando) {
        const yk = enYakinYol(L(-(kamyonD - uzak), 0));
        if (!yk) continue;
        park = [yk.x - yk.tx * 8, yk.z - yk.tz * 8]; yol = [yk.tx, yk.tz];
      } else { park = [merkez[0] + d[0] * kamyonD, merkez[1] + d[1] * kamyonD]; yol = f; }
      const noktalar = [L(0, 0), L(2.4, -11), L(2.4, 11), L(-11, 3.5), L(-5, -4.5), L(-5, 4.5), L(-12.4, -10.4), L(-14.4, 3.5), park];
      if (!noktalar.every(([x, z]) => world.isWalkable?.(x, z) && !world.inCarriage?.(x, z))) continue;
      return { merkez, A, f, r, L, park, yol, bando: !!bando };
    }
    return null;
  }
  /** En yakın yol (network kenarı) noktası ve teğeti (Driftwood Main Street). */
  function enYakinYol(p) {
    let en = null;
    for (const e of world.network?.edges ?? []) {
      if (!["patika", "sokak", "cadde", "yaya"].includes(e.road?.type)) continue;
      for (let i = 1; i < e.pts.length; i++) {
        const a = e.pts[i - 1], b = e.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
        const t = clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2), x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p[0] - x, p[1] - z);
        if (!en || d < en.d) { const l = Math.sqrt(l2); en = { d, x, z, tx: dx / l, tz: dz / l }; }
      }
    }
    return en && en.d < 25 ? en : null;
  }

  function kur(o) {
    const Y = yerlesim(o);
    if (!Y) return null;
    const sure = o.son - o.bas, Tc0 = o.bas + EC * sure, Tc1 = o.bas + ET * sure;
    const { L } = Y;
    // Kamyon yolu: 110 m geriden sete doğru (ön yöne bakar), sonda geri geri çıkar.
    const kh = aci(Y.yol[0], Y.yol[1]);
    const kamyon = { park: Y.park, bas: [Y.park[0] - Y.yol[0] * 110, Y.park[1] - Y.yol[1] * 110], h: kh, gel: [o.bas, o.bas + 2.2], git: [o.son - 1.6, o.son + 0.4] };
    // Eşyalar (yerel konum, set bandının içinde) ve kurulma dakikaları (ekip taşır, yerine koyar).
    const esya = [
      { ad: "vinc", p: L(-11, 3.5), h: aci(Y.f[0], Y.f[1]) },
      { ad: "isik0", p: L(-5, -4.5), h: aci(Y.f[0] + Y.r[0] * 0.75, Y.f[1] + Y.r[1] * 0.75) },
      { ad: "isik1", p: L(-5, 4.5), h: aci(Y.f[0] - Y.r[0] * 0.75, Y.f[1] - Y.r[1] * 0.75) },
      { ad: "isik2", p: L(1.5, -7), h: aci(-Y.r[0] - Y.f[0] * 0.3, -Y.r[1] - Y.f[1] * 0.3) },
      { ad: "reflektor", p: L(0.6, 4.4), h: aci(-Y.r[0] * 0.8 + Y.f[0] * 0.4, -Y.r[1] * 0.8 + Y.f[1] * 0.4) },
      { ad: "cadir", p: L(-12.4, -10.4), h: aci(Y.f[0], Y.f[1]) },
    ];
    const kurBas = o.bas + 2.4, kurSon = Tc0 - 0.6;
    esya.forEach((e, k) => { e.t = kurBas + ((kurSon - kurBas) * k) / esya.length; e.t2 = Tc1 + 0.6 + ((o.son - 2.4 - Tc1 - 0.6) * k) / esya.length; });
    // Set bandı: dikdörtgen u∈[−14.8, 3.4], v∈[−15, 15]; ön kenar (oyuncuların arkası) çeşme/bandoşa değmesin diye yalnız uçlarda.
    const U0 = -14.8, U1 = 3.4, V = 15;
    const kenar = Y.bando ? [[[U0, -V], [U0, V]], [[U0, V], [U1, V]], [[U1, V], [U1, -V]], [[U1, -V], [U0, -V]]]
      : [[[U0, -V], [U0, V]], [[U0, V], [U1, V]], [[U1, V], [U1, 8.5]], [[U1, -8.5], [U1, -V]], [[U1, -V], [U0, -V]]];
    K = { o, Y, sure, Tc0, Tc1, kamyon, esya, U0, U1, V, kenar: kenar.map(([a, b]) => [L(...a), L(...b)]), figuranN: 0, figuran: [] };
    // Ekip ve oyuncular (sakin değil): rol, görünüm, yer.
    const ekip = (rol, ust, alt, op = {}) => ({ rol, g: gorunum(o.tohum + rol.length * 7 + (op.k ?? 0), ust, alt, op) });
    K.kisi = [
      { ...ekip("oyuncu1", "#7b1e2b", "#2a2a2e", { kadin: true, style: 2 }), yer: L(0.4, -1.2) },
      { ...ekip("oyuncu2", "#3d4a5c", "#26262a", { kadin: false, style: 0, height: 1.82 }), yer: L(0.4, 1.2) },
      { ...ekip("yonetmen", "#2b2b30", "#4a4036", { hat: "sapka", hatColor: "#1d1d20" }), yer: L(-12.7, -10.9) },
      { ...ekip("kameraci", "#1d1d20", "#2a2a2e", { k: 1 }), yer: L(-14.4, 3.5) },
      { ...ekip("klaketci", "#8a8f96", "#2a2a2e", { k: 2 }), yer: L(-5.6, -2.2) },
      { ...ekip("mikrofoncu", "#3e5a3a", "#2a2a2e", { k: 3 }), yer: L(-1.4, 3.2) },
      { ...ekip("isikci", "#d07a2a", "#2a2a2e", { k: 4, hat: "sapka", hatColor: "#d07a2a" }), yer: L(-6.4, -6.2) },
    ];
    gorsel();
    bantKur();
    return { odak: L(-1, 0), odakY: 1.6, kalabalik: L(-19.5, 0), kiyi: null, yon: aci(-Y.f[0] - Y.r[0] * 0.55, -Y.f[1] - Y.r[1] * 0.55), yerAdi: Y.bando ? "Town Green" : "meydan", zaman: null, gitD: 46, gitEgim: 0.62, kalabalikArkadan: true };
  }

  /** Bandı ve direkleri bugünkü yerleşime kurar. */
  function bantKur() {
    for (const m of G.bantlar) { G.g.remove(m); m.geometry.dispose(); m.material.dispose(); }
    G.bantlar = [];
    const M = new THREE.Matrix4(), yer = (x, z) => world.groundY(x, z);
    let n = 0;
    for (const [a, b] of K.kenar) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), adim = Math.max(1, Math.round(L / 5));
      for (let k = 0; k <= adim && n < 40; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / adim, z = a[1] + ((b[1] - a[1]) * k) / adim;
        G.direk.setMatrixAt(n++, M.makeTranslation(x, yer(x, z), z));
      }
      for (let k = 0; k < adim; k++) {
        const x0 = a[0] + ((b[0] - a[0]) * k) / adim, z0 = a[1] + ((b[1] - a[1]) * k) / adim, x1 = a[0] + ((b[0] - a[0]) * (k + 1)) / adim, z1 = a[1] + ((b[1] - a[1]) * (k + 1)) / adim;
        const l = Math.hypot(x1 - x0, z1 - z0), y0 = yer(x0, z0) + 0.92, y1 = yer(x1, z1) + 0.92;
        const doku = G.bantDoku.clone(); doku.repeat.set(l / 3.2, 1); doku.needsUpdate = true;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.13), new THREE.MeshStandardMaterial({ map: doku, side: THREE.DoubleSide, roughness: 0.8 }));
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 0.04, (z0 + z1) / 2);
        m.rotation.set(0, -Math.atan2(z1 - z0, x1 - x0), Math.atan2(y1 - y0, l));
        m.rotation.order = "YXZ";
        G.g.add(m); G.bantlar.push(m);
      }
    }
    G.direk.count = n;
    G.direk.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------ zaman çizelgesi

  /** Çekim döngüsü: { k (kaçıncı çekim), u (döngü içi dk), aksiyon (motor–kestik arası mı) } | null. */
  function cekim(m) {
    if (!K || m < K.Tc0 || m >= K.Tc1) return null;
    const t = m - K.Tc0, k = Math.floor(t / CEKIM), u = t - k * CEKIM;
    return { k, u, aksiyon: u >= 0.12 && u < 0.12 + AKSIYON };
  }
  const cekimSayisi = (m) => (m < K.Tc0 ? 0 : Math.min(Math.floor((Math.min(m, K.Tc1) - K.Tc0 - 0.12) / CEKIM) + 1, Math.floor((K.Tc1 - K.Tc0) / CEKIM)));
  /** Kurulu mu (0–1 ölçek: ekip koyarken büyür, toplarken küçülür). */
  function kurulu(e, m) {
    if (m < e.t) return 0;
    if (m < e.t + 0.08) return ease((m - e.t) / 0.08);
    if (m < e.t2) return 1;
    return m < e.t2 + 0.08 ? 1 - ease((m - e.t2) / 0.08) : 0;
  }
  function kamyonPoz(m, out) {
    const T = K.kamyon;
    if (!K || m < K.o.bas || m > T.git[1]) return null;
    let u = 1;
    if (m < T.gel[1]) u = ease((m - T.gel[0]) / (T.gel[1] - T.gel[0]));
    else if (m > T.git[0]) u = 1 - ease((m - T.git[0]) / (T.git[1] - T.git[0]));
    out.x = lerp(T.bas[0], T.park[0], u); out.z = lerp(T.bas[1], T.park[1], u); out.heading = T.h;
    out.y = world.groundY(out.x, out.z);
    out.yolda = u < 1;
    return out;
  }

  function update(o, evre, minute, real) {
    if (!o || !K || K.o !== o || minute < o.bas || minute > o.son + 0.5) { if (G) G.g.visible = false; if (!o && K) K = null; return; }
    G.g.visible = true;
    const kp = kamyonPoz(minute, q);
    G.kamyon.visible = !!kp;
    if (kp) { G.kamyon.position.set(kp.x, kp.y, kp.z); G.kamyon.rotation.y = kp.heading; }
    const c = cekim(minute);
    for (const e of K.esya) {
      const s = kurulu(e, minute) * (e.ad.startsWith("isik") ? 1.35 : 1), obj = e.ad === "vinc" ? G.vinc : e.ad === "cadir" ? G.cadir : e.ad === "reflektor" ? G.reflektor : G.isikAyak[Number(e.ad.slice(4))];
      obj.visible = s > 0.01;
      if (!obj.visible) continue;
      obj.position.set(e.p[0], world.groundY(e.p[0], e.p[1]), e.p[1]); obj.rotation.y = e.h; obj.scale.setScalar(Math.max(0.01, s));
    }
    // Işıklar çekim boyunca yanar (kurulumun son dakikasından toplamaya dek).
    const yanik = minute > K.Tc0 - 1 && minute < K.Tc1 + 0.4;
    G.isima.forEach((sp, k) => { sp.visible = yanik; sp.material.opacity = 0.62 + 0.06 * Math.sin(real * 3 + k); });
    // Vinç kolu: aksiyonda alçaktan yükselir ve oyunculara doğru döner; arada dinlenir.
    let egim = 0.05, don = 0;
    if (c) {
      const a = clamp01((c.u - 0.12) / AKSIYON), geri = clamp01((c.u - 0.12 - AKSIYON) / 0.4);
      const w = c.aksiyon ? ease(a) : 1 - ease(geri);
      egim = lerp(0.1, -0.32, w); don = Math.sin((c.k % 3) * 1.7) * 0.35 * w;
    }
    G.kol.rotation.set(egim, don, 0);
  }

  // ------------------------------------------------ sakinler: figüranlar ve seyirci

  /** Figüran yolu: oyuncuların arkasından (u = 2,4) set boyunca; çift sıralılar ters yönde. */
  function figuranYeri(k, m, out) {
    const { L } = K.Y, c = cekim(m), yon = k % 2 ? -1 : 1, u = 2.1 + (k % 3) * 0.55, v0 = -11 * yon, v1 = 11 * yon;
    const gecikme = (k % 3) * 0.04;
    let w = 0, yuru = false;
    if (c) {
      const a = (c.u - 0.12 - gecikme) / (AKSIYON - 0.08);
      if (c.u >= 0.12 + gecikme && a < 1) { w = a; yuru = true; } // aksiyonda karşıya yürür
      else if (a >= 1) {
        const g = (c.u - 0.12 - AKSIYON - 0.05) / 0.75; // kestikten sonra başa döner
        if (g > 0 && g < 1) { w = 1 - g; yuru = true; } else w = g >= 1 ? 0 : 1;
      }
    }
    const [x0, z0] = L(u, v0), [x1, z1] = L(u, v1);
    out.x = lerp(x0, x1, w); out.z = lerp(z0, z1, w);
    const ileri = c && c.u >= 0.12 + gecikme && c.u < 0.12 + AKSIYON - 0.08 + gecikme;
    out.heading = ileri ? aci(x1 - x0, z1 - z0) : yuru ? aci(x0 - x1, z0 - z1) : aci(-K.Y.f[0], -K.Y.f[1]);
    out.yuru = yuru; out.d = Math.hypot(x1 - x0, z1 - z0) * w;
    return out;
  }

  function gorev(people, day, S, plans) {
    if (!K || K.o !== S.plan) return [];
    const R = people.residents, T = K.Tc0, out = [], adaylar = [];
    const yerOf = (seg) => (seg.ne === "meydan" || seg.ne === "hobi" ? world.placeOf?.(seg.ne === "hobi" ? seg.yer.replace("hobi:", "") : "meydan")?.anchors?.[0] : null);
    plans.forEach((plan, i) => {
      const seg = plan.find((s) => s.bas <= T - 2 && s.son > T + 20);
      if (!seg) return;
      const a = seg.ne === "ev" ? people.homes[i]?.door : yerOf(seg);
      if (!a) return;
      const d = Math.hypot(a[0] - K.Y.A[0], a[1] - K.Y.A[1]);
      if (d > (seg.ne === "ev" ? 600 : 700)) return; // set haberi yayılır (küçük adada evler uzak)
      adaylar.push({ i, d, r: roll(R[i].seed, "filmFiguran", day) % 1000 });
    });
    adaylar.sort((a, b) => a.r - b.r);
    const n = Math.min(6, adaylar.length);
    for (let k = 0; k < n; k++) {
      const { i, d } = adaylar[k];
      out.push({ i, T0: K.Tc0 - 1.5, T1: K.Tc1 + 0.5, commute: Math.max(2, Math.round(d / 1.25 / 60) + 1), item: { modul: "film", rol: "figuran", k, x: 0, z: 0 } });
    }
    K.figuranN = n;
    return out;
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    if (it.rol === "figuran" && K) {
      figuranYeri(it.k, minute, q);
      stand(q.x, q.z, q.heading);
      if (q.yuru) walkPose(p, (q.d / (0.72 * p.height / 1.75)) * Math.PI);
      else idleGesture(p, t, ph, (it.k + Math.floor(t / 20)) % 2 === 0);
      return true;
    }
    stand(it.x, it.z, it.heading);
    const bak = it.look ? fark(aci(it.look[0] - it.x, it.look[1] - it.z) - it.heading) : 0;
    tavirPoz(p, it.tavir, t, ph, bak, idleGesture);
    return true;
  }

  /** Set bandının içi boşaltılır: içeride duran (figüran ve ekip dışı) en yakın kenarın 1,5 m dışına yürür. */
  function tahliye(x, z, minute) {
    if (!K) return null;
    const t0 = K.o.bas + 2, t1 = K.o.son - 1;
    if (minute < t0 || minute > t1 + 1) return null;
    const { A, f, r } = K.Y, dx = x - A[0], dz = z - A[1], u = dx * f[0] + dz * f[1], v = dx * r[0] + dz * r[1];
    if (u < K.U0 - 0.3 || u > K.U1 + 0.3 || Math.abs(v) > K.V + 0.3) return null;
    // Ön kenar (çeşme/bandoş tarafı) açık: oradan değil, yanlardan ve arkadan çıkılır.
    const dU0 = u - K.U0, dV = K.V - Math.abs(v);
    let u2 = u, v2 = v;
    if (dU0 < dV) u2 = K.U0 - 1.5 - (Math.abs(v * 3.7) % 1.2); else v2 = Math.sign(v || 1) * (K.V + 1.5 + (Math.abs(u * 3.7) % 1.2));
    const e = Math.min(1, (minute - t0) / 1, (t1 + 1 - minute) / 1);
    const uu = u + (u2 - u) * clamp01(e), vv = v + (v2 - v) * clamp01(e);
    const nx = A[0] + f[0] * uu + r[0] * vv, nz = A[1] + f[1] * uu + r[1] * vv;
    const yuru = e < 1 ? (Math.hypot(uu - u, vv - v) / 0.72) * Math.PI : 0;
    const bak = e < 1 ? aci(nx - x, nz - z) : aci(A[0] - nx, A[1] - nz);
    return { x: nx, z: nz, heading: e < 1 && minute > t1 ? bak + Math.PI : bak, yuru };
  }
  /** Seyirci yeri set bandının içinde olamaz. */
  function yasak(x, z) {
    if (!K) return false;
    const { A, f, r } = K.Y, dx = x - A[0], dz = z - A[1], u = dx * f[0] + dz * f[1], v = dx * r[0] + dz * r[1];
    return u > K.U0 - 1.2 && u < K.U1 + 1.2 && Math.abs(v) < K.V + 1.2;
  }

  // ------------------------------------------------ ekip ve oyuncular

  const fp = {};
  function ekstra(crowd, minute, time) {
    if (!K || minute < K.o.bas || minute >= K.o.son) return;
    const { L, f, r, A } = K.Y, c = cekim(minute), kamyonda = kamyonPoz(minute, {});
    const ileriH = aci(f[0], f[1]), kameraH = aci(-f[0], -f[1]);
    K.kisi.forEach((kisi, k) => {
      resetPose(fp); Object.assign(fp, kisi.g); fp.t = time;
      // Kurulumda kamyondan iner, toplamada kamyona döner (ekip; oyuncular çekimden 2 dk önce gelir).
      const oyuncu = kisi.rol.startsWith("oyuncu");
      const gel = oyuncu ? K.Tc0 - 2 : K.kamyon.gel[1] + k * 0.15, git = oyuncu ? K.Tc1 + 0.6 : K.o.son - 2.7 + k * 0.04; // kamyon son − 1,6'da çıkar
      if (minute < gel || minute > git + 1.2 || !kamyonda) return;
      const kapi = [K.kamyon.park[0] - Math.sin(K.kamyon.h) * 4 + Math.cos(K.kamyon.h) * 1.8 * (k % 2 ? 1 : -1), K.kamyon.park[1] - Math.cos(K.kamyon.h) * 4 - Math.sin(K.kamyon.h) * 1.8 * (k % 2 ? 1 : -1)];
      let [x, z] = kisi.yer, h = oyuncu ? kameraH : kisi.rol === "yonetmen" ? ileriH : aci(A[0] - x, A[1] - z), yuru = 0, tasi = false;
      // Işıkçı ve klaketçi kurulumda eşyaları taşır: eşyanın yerine yürür.
      const kurucu = kisi.rol === "isikci" || kisi.rol === "klaketci" || kisi.rol === "kameraci";
      if (kurucu && minute < K.Tc0 - 0.5) {
        const sira = K.esya.filter((_, j) => j % 3 === ["isikci", "klaketci", "kameraci"].indexOf(kisi.rol));
        const e = sira.find((e2) => minute < e2.t + 0.15);
        if (e) {
          const u2 = clamp01((minute - (e.t - 0.6)) / 0.6), dx = e.p[0] - kapi[0], dz = e.p[1] - kapi[1];
          x = kapi[0] + dx * u2 - dx * 0.08; z = kapi[1] + dz * u2 - dz * 0.08; h = aci(dx, dz); yuru = Math.hypot(dx, dz) * u2; tasi = u2 < 1 && u2 > 0;
          if (u2 <= 0) { x = kapi[0]; z = kapi[1]; yuru = 0; }
        }
      }
      // Klaketçi: her çekimin başında kameranın önüne yürür (3 sn), klaketi vurur, aksiyon başlarken çekilir.
      if (kisi.rol === "klaketci" && c && minute >= K.Tc0) {
        const [x1, z1] = L(-3.4, 1.6), w = c.u < 0.05 ? c.u / 0.05 : c.u < 0.1 ? 1 : c.u < 0.15 ? 1 - (c.u - 0.1) / 0.05 : 0;
        if (w > 0) {
          const dx = x1 - x, dz = z1 - z, yur = c.u < 0.05 || (c.u >= 0.1 && c.u < 0.15);
          x += dx * w; z += dz * w; h = yur ? aci(c.u < 0.05 ? dx : -dx, c.u < 0.05 ? dz : -dz) : kameraH + Math.PI;
          if (yur) { yuru = Math.hypot(dx, dz) * w; tasi = true; }
        }
      }
      const varis = Math.min(1, (minute - gel) / 0.7), donus = clamp01((minute - git) / 1.0);
      if (varis < 1) { const dx = x - kapi[0], dz = z - kapi[1]; yuru = Math.hypot(dx, dz) * varis; x = kapi[0] + dx * varis; z = kapi[1] + dz * varis; h = aci(dx, dz); }
      else if (donus > 0) { const dx = kapi[0] - x, dz = kapi[1] - z; yuru = Math.hypot(dx, dz) * donus; x += dx * donus; z += dz * donus; h = aci(dx, dz); if (donus >= 1) return; }
      fp.x = x; fp.z = z; fp.heading = h; fp.y = world.groundY(x, z);
      if (yuru > 0 && (varis < 1 || donus > 0 || tasi)) {
        walkPose(fp, (yuru / (0.72 * fp.height / 1.75)) * Math.PI);
        if (tasi && kisi.rol !== "klaketci") { fp.props = ["kasa"]; fp.shL = fp.shR = 0.7; fp.elL = fp.elR = 1.1; } else if (tasi) fp.props = ["klaket"];
      }
      else poz(kisi.rol, fp, minute, time, c, k);
      crowd.add(-1, fp);
    });
  }

  /** Ekip/oyuncu duruşu (yerinde). */
  function poz(rol, p, m, t, c, k) {
    const aks = c?.aksiyon;
    switch (rol) {
      case "oyuncu1": case "oyuncu2": {
        if (aks) { // sahne: tartışıp birbirine döner, el kol hareketi
          const g = Math.max(0, Math.sin(t * 1.6 + k * 2));
          p.heading += (rol === "oyuncu1" ? 1 : -1) * 1.1 * ease(clamp01((c.u - 0.12) / 0.15));
          p.shR = 0.4 + 1.1 * g; p.elR = 0.5 + 0.6 * g; p.abR = 0.1; p.shL = 0.2 + 0.4 * (1 - g); p.headPitch = -0.05;
        } else { p.shL = 0.3; p.elL = 0.6; p.headYaw = 0.3 * Math.sin(t * 0.3 + k); }
        break;
      }
      case "yonetmen": {
        // Monitörün başında oturur; motorda doğrulup elini kaldırır.
        if (aks && c.u < 0.22) { p.shR = 2.4; p.elR = 0.2; }
        else { sitPose(p, p.y + 0.62, p.height / 1.75); p.shL = p.shR = 0.5; p.elL = p.elR = 1.3; p.headPitch = 0.1; }
        break;
      }
      case "kameraci": p.shL = p.shR = 1.0; p.elL = p.elR = 0.4; p.lean = 0.25; p.headPitch = -0.2; break;
      case "klaketci": {
        // Motordan hemen önce kameranın önüne geçip klaketi vurur, sonra çekilir.
        if (c && c.u >= 0.05 && c.u < 0.1) { p.shR = 1.5; p.elR = 0.4 + (c.u > 0.08 ? 0.6 : 0); p.props = ["klaket"]; p.shL = 1.3; p.elL = 0.9; }
        else { p.props = ["klaket"]; p.shR = 0.3; p.elR = 1.2; }
        break;
      }
      case "mikrofoncu": p.props = ["boom"]; p.shR = 2.5; p.elR = 0.15; p.shL = 2.3; p.elL = 0.3; p.abR = -0.1; p.lean = -0.05; break;
      case "isikci": p.shL = 0.5; p.elL = 2.0; p.shR = 0.5; p.elR = 2.0; p.abL = p.abR = 0.25; break;
    }
  }

  function canli() { return null; }

  function ses(minute) {
    if (!K || minute < K.o.bas + 3 || minute >= K.o.son) return null;
    return { kalabalik: minute > K.Tc0 && minute < K.Tc1 ? 0.45 : 0.25 };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const n = cekimSayisi(minute), fN = K.figuranN, sey = S.seyirci, yerAd = K.Y.bando ? "the Town Green" : "the square";
    const yerTr = K.Y.bando ? "Town Green" : "meydan", arka = K.Y.bando ? "bandstand" : "fountain", arkaTr = K.Y.bando ? "bandoşun" : "çeşmenin";
    if (DIL === "en") {
      if (minute < K.Tc0) return { kisa: "Film crew on " + yerAd + "!", uzun: `At ${saatYaz(o.bas)} a film crew's truck pulled up by ${yerAd}; the crew is setting up lights and a camera crane and has taped off the area in front of the ${arka}.` };
      if (minute < K.Tc1) return { kisa: "Filming on " + yerAd + "!", uzun: `Two actors are shooting a scene in front of the ${arka} under the lights while the camera crane swings overhead${fN ? `; ${fN} neighbors are walking through the shot as extras` : ""}. The scene has been shot ${n} ${n === 1 ? "time" : "times"} so far${sey ? `, and ${sey} people are watching from behind the tape` : ""}.` };
      if (minute < o.son - 0.5) return { kisa: "Film crew packing up", uzun: `The film crew shot the same scene ${n} times in front of the ${arka}${fN ? ` with ${fN} neighbors as extras` : ""}; now they are packing up the lights and the crane.` };
      return { kisa: `Film shoot on ${yerAd} today · ${saatYaz(o.bas)}`, uzun: `A film crew taped off ${yerAd} from ${saatYaz(o.bas)} and shot the same scene ${n} times in front of the ${arka}${fN ? `; ${fN} neighbors walked through it as extras` : ""}${sey ? ` and ${sey} watched from behind the tape` : ""}. Then the crew packed up the lights and the crane and the truck backed out.` };
    }
    const Yd = K.Y.bando ? "Town Green'de" : "Meydanda", Ye = K.Y.bando ? "Town Green'e" : "meydana";
    if (minute < K.Tc0) return { kisa: `${Yd} film ekibi!`, uzun: `Saat ${saatte(o.bas)} bir film ekibinin kamyonu ${Ye} geldi; ekip ışık ayaklarını ve kamera vincini kuruyor, ${arkaTr} önünü set bandıyla kapattı.` };
    if (minute < K.Tc1) return { kisa: `${Yd} film çekiliyor!`, uzun: `${arkaTr.charAt(0).toUpperCase() + arkaTr.slice(1)} önünde iki oyuncu ışıkların altında sahne çekiyor, kamera vinci tepelerinde dönüyor${fN ? `; ${fN} sakin figüran olarak sahneden geçiyor` : ""}. Sahne şimdiye dek ${n} kez çekildi${sey ? `, ${sey} kişi bandın arkasından izliyor` : ""}.` };
    if (minute < o.son - 0.5) return { kisa: "Film ekibi toplanıyor", uzun: `Film ekibi ${arkaTr} önünde aynı sahneyi ${n} kez çekti${fN ? `, ${fN} sakin figüran oldu` : ""}; şimdi ışıkları ve vinci topluyor.` };
    return { kisa: `Bugün ${yerTr === "meydan" ? "meydanda" : "Town Green'de"} film çekildi · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(o.bas)} gelen film ekibi ${arkaTr} önünü set bandıyla kapatıp aynı sahneyi ${n} kez çekti${fN ? `; ${fN} sakin figüran oldu` : ""}${sey ? `, ${sey} kişi bandın arkasından izledi` : ""}. Ekip ışıkları ve vinci toplayıp ayrıldı, kamyon geri geri çıktı.` };
  }

  return {
    kur, update, gorev, durus, tahliye, ekstra, canli, ses, yazi,
    seyirciBas: (o) => (K && K.o === o ? K.Tc0 - 4 : o.bas),
    seyirci: { r0: 17, r1: 21, isR: 160, uzak: 2.4, en: 28, ozel: true, yasak, tavirlar: ["cek", "konus", "goster", "cek", "bak", "konus"] },
  };
}
