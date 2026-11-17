// Yarış (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; iki ada, arayüz
// olay-moduller.js). Mercanada'da ada turu bisiklet yarışı: bisikletçiler çarşının yaya caddesindeki şişme takın önünde
// dizilir, çevre yolunda turlar atar (yol trafiğe kapalı, kavşaklarda bariyer; araçlar yan sokaklarda bekler), bitiş
// yine takın altında, meydanın girişinde. Driftwood'da "fun run": koşucular Main Street ve Water Street çevresinde tur
// atar, bitiş Town Green'in önünde. Yarışçılar sakin değildir (adları yok, formalarının rengiyle anılır); sakinler yol
// kenarından ve bitişte alkışlar. Her şey (dakika, tohum, dünya) işlevidir.
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { roll } from "../sim.js";
import { walkPose, resetPose } from "./people.js";
import { kesir } from "./olay-plan.js";
import { cizgi, agYolu, yumusat, temizle, enYakin, gorunum, tavirPoz, bisikletPoz, boya, birlestir, kutu, silindir, malzeme, yaziDoku, yayaYeri, clamp01, ease, aci, fark, lerp } from "./olay-yardim.js";

// Evreler (olay-plan.js yaris ile aynı): hazirlik 0–0.15, yaris 0.15–0.8, bitis 0.8–1.
const EY = 0.15, EB = 0.8;
const RENKLER = [["kırmızı", "red", "#c62828"], ["mavi", "blue", "#1e5bc6"], ["sarı", "yellow", "#f2c230"], ["yeşil", "green", "#2e8b47"],
  ["turuncu", "orange", "#ef7d22"], ["mor", "purple", "#7b3fa6"], ["beyaz", "white", "#f2f2ee"], ["pembe", "pink", "#e86aa0"]];

/** Alt çizgi: C'nin [a, b] metresi. */
function kes(C, a, b) {
  const out = [], q = {};
  C.at(a, q); out.push([q.x, q.z]);
  for (let i = 0; i < C.pts.length; i++) if (C.cum[i] > a + 0.05 && C.cum[i] < b - 0.05) out.push(C.pts[i]);
  C.at(b, q); out.push([q.x, q.z]);
  return cizgi(temizle(out, 0.05));
}

export function buildYarisOlay({ world, group, traffic }) {
  let K = null, G = null;
  const q = {}, q2 = {};

  function gorsel() {
    if (G) return G;
    const mat = malzeme(), g = new THREE.Group();
    g.visible = false; group.add(g);
    // Şişme takı: yarım simit (kırmızı), tepede iki yüzü yazılı pankart; kavşak bariyerleri; bitiş düzlüğünde demir bariyer.
    const tak = new THREE.Group();
    tak.add(new THREE.Mesh(birlestir([boya(new THREE.TorusGeometry(4.6, 0.55, 8, 28, Math.PI), "#d42a2a"), silindir(0.7, 0.8, 0.4, -4.6, 0.2, 0, "#2a2a2a", 10), silindir(0.7, 0.8, 0.4, 4.6, 0.2, 0, "#2a2a2a", 10)]), mat));
    const yazilar = DIL === "en" ? ["FINISH", "START"] : ["BİTİŞ", "BAŞLANGIÇ"];
    for (const [k, s] of [[0, 1], [1, -1]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.0), new THREE.MeshStandardMaterial({ map: yaziDoku(yazilar[k], { zemin: "#ffffff", renk: "#c62828", w: 512, h: 116, font: "bold 78px sans-serif" }), roughness: 0.7 }));
      m.position.set(0, 4.55, s * 0.57); m.rotation.y = s > 0 ? 0 : Math.PI; tak.add(m);
    }
    tak.children[0].castShadow = true;
    g.add(tak);
    const bariyer = new THREE.InstancedMesh(birlestir([kutu(2.4, 0.22, 0.06, 0, 0.95, 0, "#e02020"), kutu(0.4, 0.22, 0.065, -0.8, 0.95, 0, "#ffffff"), kutu(0.4, 0.22, 0.065, 0, 0.95, 0, "#ffffff"), kutu(0.4, 0.22, 0.065, 0.8, 0.95, 0, "#ffffff"),
      kutu(0.07, 1.0, 0.07, -1.0, 0.5, 0, "#e8e8e8"), kutu(0.07, 1.0, 0.07, 1.0, 0.5, 0, "#e8e8e8"), kutu(0.5, 0.05, 0.5, -1.0, 0.03, 0, "#333"), kutu(0.5, 0.05, 0.5, 1.0, 0.03, 0, "#333")]), mat, 48);
    const levhaM = new THREE.MeshStandardMaterial({ map: yaziDoku(DIL === "en" ? "ROAD CLOSED" : "YOL KAPALI", { zemin: "#ffffff", renk: "#c62828", w: 256, h: 64, font: "bold 40px sans-serif" }) });
    const levha = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 0.33).translate(0, 1.32, 0.05), levhaM, 48);
    const cit = new THREE.InstancedMesh(birlestir([kutu(2.0, 0.04, 0.04, 0, 1.05, 0, "#b8bcc2"), kutu(2.0, 0.04, 0.04, 0, 0.25, 0, "#b8bcc2"), ...[-0.6, -0.2, 0.2, 0.6].map((x) => kutu(0.025, 0.8, 0.025, x, 0.65, 0, "#b8bcc2")),
      kutu(0.05, 1.08, 0.05, -1.0, 0.54, 0, "#9ea2a8"), kutu(0.05, 1.08, 0.05, 1.0, 0.54, 0, "#9ea2a8"), kutu(0.06, 0.03, 0.7, -1.0, 0.02, 0, "#9ea2a8"), kutu(0.06, 0.03, 0.7, 1.0, 0.02, 0, "#9ea2a8")]), mat, 40);
    for (const m of [bariyer, levha, cit]) { m.count = 0; g.add(m); }
    G = { g, tak, bariyer, levha, cit };
    return G;
  }

  // ------------------------------------------------ rota

  /** Rota: { tak (bitiş noktası), yon (takın bakış yönü), giris (taktan tura), tur (kapalı halka), cikis, durak[] , bisiklet }. */
  function rota() {
    const merkez = world.placeOf?.("meydan")?.anchors?.[0] ?? [0, 0];
    const bando = (world.features ?? []).some((f) => f.type === "bandstand" && Math.hypot(f.x - merkez[0], f.z - merkez[1]) < 4);
    if (!bando && traffic?.lanes?.length) {
      // Mercanada: tak güney yaya caddesinde (meydandan 45 m), halka çevre yolu (güney → doğu → kuzey → batı).
      const ya = agYolu(world, [[merkez[0], merkez[1] + 30], [merkez[0], merkez[1] + 165]], ["yaya", "patika"]);
      const halka = agYolu(world, [[0, 165], [280, 0], [280, -135], [0, -135], [-280, -135], [-280, 0], [0, 165]], ["cadde"]);
      if (!ya || !halka) return null;
      const Y = cizgi(ya), tak0 = enYakin(Y, merkez[0], merkez[1] + 45);
      const tur = cizgi(yumusat(halka, 9, 6));
      if (tur.len < 800 || Y.len - tak0.s < 40) return null;
      // Giriş: taktan güneye, sahil yolunda halkanın 12 m ilerisine kıvrılır; çıkış: halkanın 12 m gerisinden yaya caddesine.
      const kesit = kes(Y, tak0.s, Y.len).pts, a = tur.at(12, {}), b = tur.at(tur.len - 12, {});
      const giris = cizgi(yumusat(temizle([...kesit, [a.x, a.z]], 0.3), 8, 6));
      const cikis = cizgi(yumusat(temizle([[b.x, b.z], ...[...kesit].reverse()], 0.3), 8, 6));
      const durak = [];
      for (let k = 0; k < 16; k++) { const x = merkez[0] + (k % 2 ? 1 : -1) * (2.6 + Math.floor(k / 2) % 4 * 2.1), z = merkez[1] + 27 + Math.floor(k / 8) * 2.6; durak.push([x, z]); }
      return { bisiklet: true, tak: [tak0.x, tak0.z], tur, turBas: 12, turEksi: 24, giris, cikis, durak, merkez, ad: "çarşı" };
    }
    if (bando) {
      // Driftwood: Main Street – Water Street halkası, tak Main Street'te Town Green'in önünde.
      const halka = agYolu(world, [[90, 54], [210, 58], [210, 134], [-110, 135], [-110, 58], [90, 54]], ["patika", "sokak"]);
      if (!halka) return null;
      const tur = cizgi(yumusat(halka, 7, 6));
      const t = enYakin(tur, merkez[0], merkez[1] + 56);
      if (t.d > 8 || tur.len < 500) return null;
      const durak = [];
      for (let k = 0; k < 20; k++) durak.push([merkez[0] - 14 + (k % 10) * 3.1 + (Math.floor(k / 10) % 2) * 1.5, merkez[1] + 47.5 + Math.floor(k / 10) * 2.2]);
      return { bisiklet: false, tak: [t.x, t.z], tur, turBas: t.s, turEksi: 0, giris: null, cikis: null, durak, merkez, ad: "Main Street" };
    }
    return null;
  }

  function kur(o) {
    const R0 = rota();
    if (!R0) return null;
    const sure = o.son - o.bas, Ts = o.bas + EY * sure, Tb = o.bas + EB * sure;
    const bis = R0.bisiklet, n = bis ? 14 : 16;
    // Grup hızı (m/sn); yarışçılar gruba göre öne kaçar (kaçamak), grupta kalır ya da geride kalır.
    const vp = bis ? 10.2 : 3.25;
    const Lg = R0.giris?.len ?? 0, Lc = R0.cikis?.len ?? 0;
    // Tur sayısı: en hızlı yarışçı yarış evresinin sonunda bitirsin.
    const tur = Math.max(2, Math.round((vp * (Tb - Ts) * 60 - Lg - Lc + R0.turEksi) / R0.tur.len));
    const Lt = tur * R0.tur.len - R0.turEksi, Ltop = Lg + Lt + Lc;
    const yar = [];
    for (let k = 0; k < n; k++) {
      const f = (s) => kesir("yaris", o.tohum, k, s);
      const renk = bis ? RENKLER[k % 7] : RENKLER[Math.floor(f(1) * RENKLER.length)];
      // Kaçamak (ilk 3), ana grup, geride kalanlar (son 3–4); kayma yarış boyunca doğrusal büyür (m).
      const grup = k < 3 ? 0 : k < n - (bis ? 3 : 5) ? 1 : 2;
      const kay = grup === 0 ? (bis ? 110 : 60) + f(2) * 60 : grup === 1 ? -14 + f(2) * 16 : -(bis ? 140 : 90) - f(2) * (bis ? 180 : 120);
      const vb = vp;
      const sira = Math.floor(k / (bis ? 4 : 5)), sut = k % (bis ? 4 : 5);
      yar.push({ k, renk, vb, grup, kay, A: grup === 1 ? 3 + f(4) * 4 : 1.5 + f(4) * 2, w: (Math.PI * 2) / (90 + f(5) * 160), ph: f(6) * 6.28, geri: 1.2 + sira * 2.2, serit: (bis ? -2.8 : -1.8) + ((k * 5) % n) * ((bis ? 5.6 : 3.6) / (n - 1)),
        yan: (sut - (bis ? 1.5 : 2)) * (bis ? 1.15 : 0.95), g: gorunum(o.tohum + 100 + k, renk[2], bis ? "#1d1d20" : ["#1d1d20", "#2c3a52", "#4a6589"][k % 3], { sleeves: !bis ? false : true, shorts: true, hat: bis ? "kask" : null, hatColor: renk[2], height: 1.68 + f(7) * 0.16 }) });
    }
    K = { o, R: R0, sure, Ts, Tb, tur, Ltop, Lg, Lt, yar, n, bis };
    // Bitiş: her yarışçının yarışı bitirdiği an (sn, Ts'den); sıra; durak yeri (hızlı olan önde).
    for (const y of yar) {
      let a = 0, b = (3 * Ltop) / y.vb;
      for (let i = 0; i < 50; i++) { const c = (a + b) / 2; if (yol(y, c) < Ltop) a = c; else b = c; }
      y.T = (a + b) / 2;
    }
    const sirali = [...yar].sort((a, b) => a.T - b.T);
    sirali.forEach((y, i) => { y.derece = i; y.durak = R0.durak[i % R0.durak.length]; });
    K.birinci = sirali[0]; K.sonT = sirali[sirali.length - 1].T;
    K.kapali = [Ts - 3, Ts + K.sonT / 60 + 1.5];
    gorsel();
    takKur();
    // Mercanada: halkadaki kavşaklar kapanır, yan sokak ağızlarına bariyer.
    K.dugum = new Set();
    if (bis && traffic) bariyerKur();
    const tk = K.R.tak, ileri = K.R.giris ? K.R.giris.at(0, {}) : K.R.tur.at(K.R.turBas, {});
    // Seyircinin ortası: bitiş düzlüğünün kenarı (yolun ortası değil: kalabalık çekimi yarışçıların içinde kalıyordu).
    const kal = [tk[0] + Math.sin(ileri.heading) * 10 + ileri.nx * (bis ? 6.5 : 5.5), tk[1] + Math.cos(ileri.heading) * 10 + ileri.nz * (bis ? 6.5 : 5.5)];
    // Video (kaydet.mjs aracAni): önde gideni izleyen çekim otomatik saatte yarışın 4. dakikasında.
    const zaman = { lider: { yol: [Ts, Ts + 4.35] } };
    return { odak: tk.slice(), odakY: 1.3, kalabalik: kal, kiyi: null, yon: ileri.heading + 0.6, yerAdi: R0.ad, zaman, gitD: 44, gitEgim: 0.55 };
  }

  /** Ts'den t sn sonra yarışçının aldığı yol (m): yumuşak kalkış + hafif hız dalgalanması (sıralar değişir). */
  function yol(y, t) {
    if (t <= 0) return 0;
    const tau = K.bis ? 5 : 3, base = t - tau * (1 - Math.exp(-t / tau)), Tr = (K.Tb - K.Ts) * 60;
    // Grup + kişisel kayma (yarış süresince doğrusal) + gruptaki dalgalanma (sıralar değişir); ilk 40 sn kayma yok.
    const a = Math.min(1, t / 40);
    return y.vb * base + a * (y.kay * (t / Tr) + y.A * Math.sin(y.w * t + y.ph) - y.A * Math.sin(y.ph));
  }
  /** Yol üzerindeki s'nin (0 = tak, giriş → turlar → çıkış) noktası. */
  function nokta(s, out) {
    const { R, Lg, Lt } = K, L = R.tur.len;
    if (R.giris && s < Lg) return R.giris.at(s, out);
    const t = s - Lg;
    if (R.cikis && t >= Lt) return R.cikis.at(t - Lt, out);
    return R.tur.at((((R.turBas + t) % L) + L) % L, out);
  }

  /** Yarışçının o anki durumu: { x, z, heading, kip: "bekle"|"git"|"dur", d (krank/adım), lider? }. */
  function durum(y, m, out) {
    const { o, Ts } = K;
    if (m < o.bas + 0.5 || m >= o.son) return null;
    const t = (m - Ts) * 60;
    const tk = K.R.tak, h0 = nokta(0.5, q2).heading;
    if (t <= 0) {
      // Başlangıç ızgarası: takın arkasında sıra sıra (hazırlıkta yerine yürür/sürer).
      const gx = tk[0] - Math.sin(h0) * y.geri + Math.cos(h0) * y.yan, gz = tk[1] - Math.cos(h0) * y.geri - Math.sin(h0) * y.yan;
      out.x = gx; out.z = gz; out.heading = h0; out.kip = "bekle"; out.d = 0;
      return out;
    }
    if (t < y.T) {
      const s = yol(y, t) - y.geri * Math.max(0, 1 - t / 20);
      if (s < 0) { // henüz takın gerisinde (ızgaradan çıkış)
        out.x = tk[0] + Math.sin(h0) * s + Math.cos(h0) * y.yan; out.z = tk[1] + Math.cos(h0) * s - Math.sin(h0) * y.yan; out.heading = h0; out.kip = "git"; out.d = s;
        return out;
      }
      nokta(s, out);
      const ser = y.serit + 0.5 * Math.sin(t * 0.05 + y.ph) - (t < 20 ? (1 - t / 20) * (y.serit - y.yan) : 0);
      out.x += out.nx * ser; out.z += out.nz * ser;
      out.kip = "git"; out.d = s;
      return out;
    }
    // Bitişten sonra durak yerine yavaşlayarak gider.
    const F = nokta(K.Ltop, q2), dx = y.durak[0] - F.x, dz = y.durak[1] - F.z, D = Math.hypot(dx, dz) || 1;
    const v = y.vb, Td = (2 * D) / (v * (K.bis ? 1 : 0.6)), u = Math.min(1, (t - y.T) / Td), w = u * (2 - u);
    out.x = F.x + dx * w; out.z = F.z + dz * w; out.heading = aci(dx, dz);
    out.kip = u < 1 ? "git" : "dur"; out.d = K.Ltop + D * w; out.yavas = 1 - u;
    return out;
  }
  /** Lider (en önde olan, bitişten sonra birinci). */
  function lider(m) {
    if (!K || m < K.Ts) return null;
    let en = null, ens = -1;
    const t = (m - K.Ts) * 60;
    for (const y of K.yar) { const s = t >= y.T ? K.Ltop + (K.birinci === y ? 1 : 0) : yol(y, t); if (s > ens) { ens = s; en = y; } }
    return en;
  }

  // ------------------------------------------------ görsel kurulum

  function takKur() {
    const tk = K.R.tak, hb = nokta(K.Ltop - 0.5, q2).heading;
    G.tak.position.set(tk[0], world.groundY(tk[0], tk[1]), tk[1]);
    G.tak.rotation.y = hb + Math.PI; // BİTİŞ yüzü bitişe gelen yarışçıya dönük
    // Bitiş düzlüğü boyunca iki yanda demir bariyer (seyirci arkasında).
    const M = new THREE.Matrix4(), Qq = new THREE.Quaternion(), Ss = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const yari = K.bis ? 4.2 : 3.2, boy = K.bis ? 30 : 22;
    for (let d = -boy; d <= boy; d += 2.05) {
      if (Math.abs(d) < 2) continue;
      const s = K.bis ? (d >= 0 ? d : null) : K.R.turBas + d;
      if (s == null) continue;
      const p = K.bis ? K.R.giris.at(d, {}) : K.R.tur.at(((s % K.R.tur.len) + K.R.tur.len) % K.R.tur.len, {});
      for (const yan of [-1, 1]) {
        const x = p.x + p.nx * yari * yan, z = p.z + p.nz * yari * yan;
        if (!world.isWalkable?.(x, z) && !K.bis) continue;
        G.cit.setMatrixAt(n++, M.compose(V.set(x, world.groundY(x, z), z), Qq.setFromAxisAngle(UP, p.heading + Math.PI / 2), Ss));
      }
    }
    G.cit.count = n; G.cit.instanceMatrix.needsUpdate = true;
  }

  /** Halkadaki kavşaklar trafiğe kapanır; halkada olmayan kolların ağzına bariyer ve "yol kapalı" levhası. */
  function bariyerKur() {
    const M = new THREE.Matrix4(), Qq = new THREE.Quaternion(), Ss = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const nd of world.network?.nodes ?? []) {
      const yk = enYakin(K.R.tur, nd.p[0], nd.p[1], 6);
      if (yk.d > 3) continue;
      const kollar = nd.ends.filter((e) => e.edge?.road?.carriage > 0);
      if (kollar.length < 3) continue;
      K.dugum.add(nd.id);
      for (const e of kollar) {
        const pts = e.edge.pts, ic = e.at === "a" ? pts[Math.min(1, pts.length - 1)] : pts[Math.max(0, pts.length - 2)];
        const dx = ic[0] - nd.p[0], dz = ic[1] - nd.p[1], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
        // Kol halkanın üstündeyse (yarışçılar oradan geçer) bariyer yok.
        const t = enYakin(K.R.tur, nd.p[0] + ux * 12, nd.p[1] + uz * 12, 6);
        if (t.d < 2.5) continue;
        const x = nd.p[0] + ux * 10, z = nd.p[1] + uz * 10, h = aci(ux, uz);
        if (n >= 48) break;
        M.compose(V.set(x, world.surfaceY(x, z), z), Qq.setFromAxisAngle(UP, h + Math.PI / 2), Ss);
        G.bariyer.setMatrixAt(n, M);
        M.compose(V.set(x, world.surfaceY(x, z), z), Qq.setFromAxisAngle(UP, h), Ss);
        G.levha.setMatrixAt(n, M);
        n++;
      }
    }
    G.bariyer.count = G.levha.count = n;
    G.bariyer.instanceMatrix.needsUpdate = G.levha.instanceMatrix.needsUpdate = true;
  }

  function update(o, evre, minute) {
    if (!o || !K || K.o !== o || minute < o.bas || minute >= o.son) { if (G) G.g.visible = false; if (!o && K) K = null; return; }
    G.g.visible = true;
    const kap = minute >= K.kapali[0] && minute < K.kapali[1];
    G.bariyer.visible = G.levha.visible = kap;
  }
  function kapali(minute) {
    if (!K || !K.dugum.size) return null;
    return minute >= K.kapali[0] && minute < K.kapali[1] ? K.dugum : null;
  }
  /** Yol kapalıyken halkadaki gerçek trafik çizilmez (yarışçıların içinden geçmesin). */
  function gizle(x, z, minute) {
    if (!K || !K.bis || minute < K.kapali[0] || minute >= K.kapali[1]) return false;
    return enYakin(K.R.tur, x, z, 8).d < 7.5 || (K.R.giris && enYakin(K.R.giris, x, z, 8).d < 6);
  }

  // ------------------------------------------------ sakinler

  /** Yol kenarında alkışlayanlar: yarış saatinde evinde olan, kapısı halkaya ≤ 30 m komşular kaldırıma çıkar. */
  function gorev(people, day, S, plans) {
    if (!K || K.o !== S.plan || !K.bis) return [];
    const R = people.residents, out = [], aday = [];
    const T0 = K.Ts + 1, T1 = K.Ts + K.sonT / 60;
    plans.forEach((plan, i) => {
      const door = people.homes[i]?.door;
      if (!door) return;
      const yk = enYakin(K.R.tur, door[0], door[1], 32);
      if (yk.d > 30) return;
      const seg = plan.find((s) => s.bas <= T0 - 3 && s.son >= T0 + 12);
      if (!seg || seg.ne !== "ev") return;
      let ok = null;
      const L = Math.hypot(yk.x - door[0], yk.z - door[1]), ux = (yk.x - door[0]) / (L || 1), uz = (yk.z - door[1]) / (L || 1);
      for (let d = 0; d < L; d += 0.5) { const px = door[0] + ux * d, pz = door[1] + uz * d; if (world.inCarriage?.(px, pz)) break; if (d > 1 && yayaYeri(world, traffic, px, pz)) ok = [px, pz]; }
      if (!ok) return;
      aday.push({ i, x: ok[0], z: ok[1], h: aci(yk.x - ok[0], yk.z - ok[1]), s: yk.s, r: roll(R[i].seed, "yarisAlkis", day) % 1000 });
    });
    aday.sort((a, b) => a.r - b.r);
    for (const a of aday) {
      if (out.length >= 30) break;
      if (out.some((g) => Math.hypot(g.item.x - a.x, g.item.z - a.z) < 3)) continue;
      const kal = 8 + (roll(R[a.i].seed, "yarisKal", day) % 10);
      out.push({ i: a.i, T0: T0 + (a.r % 5) * 0.4, T1: Math.min(T1, T0 + kal), commute: 1, item: { modul: "yaris", rol: "kenar", x: a.x, z: a.z, heading: a.h, s: a.s } });
    }
    K.kenarN = out.length;
    return out;
  }

  function durus(i, it, minute, t, p, ph, stand, { idleGesture }) {
    stand(it.x, it.z, it.heading);
    if (it.rol === "kenar") {
      // Yakından (≤ 45 m) bir yarışçı geçerken alkışlar, başını ona çevirir; arada bekler, yolu kollar.
      let en = null, ed = 45;
      if (K) for (const y of K.yar) { const d = durum(y, minute, q); if (d && d.kip === "git") { const dd = Math.hypot(d.x - it.x, d.z - it.z); if (dd < ed) { ed = dd; en = d; } } }
      if (en) tavirPoz(p, (roll(i, "yAlk") % 5) === 0 ? "salla" : "alkis", t, ph, fark(aci(en.x - it.x, en.z - it.z) - it.heading), idleGesture);
      else idleGesture(p, t, ph, false);
      return true;
    }
    // Bitişteki seyirci: yarışçı yaklaşırken alkış ve el sallama, arada telefonla çekim.
    const bak = it.look ? fark(aci(it.look[0] - it.x, it.look[1] - it.z) - it.heading) : 0;
    tavirPoz(p, it.tavir, t, ph, bak, idleGesture);
    return true;
  }
  /** Seyirci yarış yolunun üstünde durmaz (bitiş düzlüğünün bariyer içi). */
  function yasak(x, z) {
    if (!K) return false;
    const yari = K.bis ? 4.6 : 3.6;
    if (K.R.giris && enYakin(K.R.giris, x, z, 8).d < yari) return true;
    if (enYakin(K.R.tur, x, z, 8).d < yari) return true;
    return K.R.durak.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 2);
  }

  // ------------------------------------------------ yarışçılar

  const fp = {};
  function ekstra(crowd, minute, time) {
    if (!K || minute < K.o.bas + 0.5 || minute >= K.o.son) return;
    const ld = lider(minute);
    for (const y of K.yar) {
      const d = durum(y, minute, q);
      if (!d) continue;
      resetPose(fp); Object.assign(fp, y.g); fp.t = time;
      fp.x = d.x; fp.z = d.z; fp.heading = d.heading; fp.y = world.groundY(d.x, d.z);
      // Hazırlıkta yerine gelir (ilk 1,5 dk takın arkasından süzülür).
      const gel = clamp01((minute - K.o.bas - 0.5) / 1.5);
      if (d.kip === "bekle" && gel < 1) { fp.x -= Math.sin(d.heading) * (1 - gel) * 12; fp.z -= Math.cos(d.heading) * (1 - gel) * 12; }
      if (K.bis) {
        if (d.kip === "git" || (d.kip === "bekle" && gel < 1)) bisikletPoz(fp, d.kip === "bekle" ? (1 - gel) * 12 / 2.1 : d.d / 2.1, d.yavas != null ? 0.2 + 0.22 * d.yavas : 0.42);
        else {
          // Durunca bisikletin üstünde ayakta (ayaklar yerde); birinci kollarını kaldırır.
          fp.groundY = fp.y; fp.props = ["bisiklet"]; fp.shL = fp.shR = 0.9; fp.elL = fp.elR = 0.5; fp.lean = 0.12;
          if (d.kip === "dur" && y.derece === 0) { fp.shL = fp.shR = 2.8; fp.elL = fp.elR = 0.2; fp.abL = fp.abR = 0.3 + 0.15 * Math.sin(time * 4); }
        }
        // Birinci çizgiyi geçerken kollar havada (bitişten sonraki ilk 6 sn).
        if (y.derece === 0 && d.kip === "git" && d.yavas != null && d.yavas > 0.4) { fp.shL = fp.shR = 2.7; fp.elL = fp.elR = 0.2; fp.lean = 0.15; }
      } else {
        if (d.kip === "git") { walkPose(fp, (d.d / (1.1 * fp.height / 1.75)) * Math.PI, d.yavas != null && d.yavas < 0.5 ? 0 : 1); fp.sleeves = false; }
        else if (d.kip === "bekle" && gel < 1) walkPose(fp, ((1 - gel) * 12 / 0.72) * Math.PI);
        else { const sk = Math.sin(time * 2 + y.k); fp.kneeL = 0.08 + 0.12 * Math.max(0, sk); fp.kneeR = 0.08 + 0.12 * Math.max(0, -sk); if (d.kip === "dur" && y.derece === 0) { fp.shL = fp.shR = 2.8; fp.elL = fp.elR = 0.2; } else if (d.kip === "dur") { fp.shL = fp.shR = 0.3; fp.abL = fp.abR = 0.5; fp.elL = fp.elR = 2.0; } }
      }
      crowd.add(-1, fp);
    }
    // Hakem: takın yanında; başlangıçta bayrağı kaldırıp indirir, bitişte birinciye bayrak sallar.
    resetPose(fp); Object.assign(fp, K.hakem ??= gorunum(K.o.tohum + 77, "#111111", "#2a2a2e", { kadin: false, hat: "sapka", hatColor: "#111" }));
    const tk = K.R.tak, h0 = nokta(0.5, q2).heading, yanX = Math.cos(h0) * (K.bis ? 5.6 : 4.4), yanZ = -Math.sin(h0) * (K.bis ? 5.6 : 4.4);
    fp.x = tk[0] + yanX; fp.z = tk[1] + yanZ; fp.y = world.groundY(fp.x, fp.z); fp.heading = aci(-yanX, -yanZ); fp.t = time;
    const ts = (minute - K.Ts) * 60, tb = ld ? (minute - K.Ts) * 60 - K.birinci.T : -1;
    fp.props = ["mendil"];
    if (ts > -20 && ts < 2) { fp.shR = ts < 0 ? 2.9 : 0.6; fp.elR = 0.1; }
    else if (tb > -8 && tb < 10) { const g = Math.sin(time * 9); fp.shR = 2.6; fp.abR = 0.2 + 0.4 * g; fp.elR = 0.2; }
    else { fp.shR = 0.2; fp.elR = 0.3; }
    crowd.add(-1, fp);
  }

  function anlik(o, m) {
    if (!K || K.o !== o || m < K.Ts || m >= K.Ts + K.birinci.T / 60) return null;
    // Liderin 25 m önü (kamera uçarken grup kadraja girer).
    const y = lider(m), d = y && durum(y, m, {});
    if (!d) return null;
    const t = (m - K.Ts) * 60, s = yol(y, t);
    const p = s > 0 && t < y.T ? nokta(Math.min(K.Ltop, s + 25), {}) : d;
    return { odak: [p.x, p.z], yon: d.heading + 0.5, odakY: 1.2, gitD: 56, gitEgim: 0.5 };
  }
  function canli(m) {
    if (!K) return null;
    const y = lider(m), d = y && m < K.Ts + K.birinci.T / 60 + 0.1 ? durum(y, m, {}) : null;
    if (d) return [d.x, world.groundY(d.x, d.z) + 1.1, d.z];
    const tk = K.R.tak;
    return [tk[0], world.groundY(tk[0], tk[1]) + 1.2, tk[1]];
  }
  function vehicles(v, real, minute, araclar) {
    if (!K) return;
    const y = lider(minute), d = y && durum(y, minute, {});
    if (d && d.kip === "git") araclar.set("lider", { x: d.x, y: world.groundY(d.x, d.z), z: d.z, heading: d.heading, park: false });
  }

  function ses(minute) {
    if (!K || minute < K.Ts - 4 || minute >= K.o.son) return null;
    const t = (minute - K.Ts) * 60, bitis = t > K.birinci.T - 20 && t < K.sonT + 20;
    return { kalabalik: bitis || (t > -60 && t < 20) ? 0.75 : 0.35 };
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K) return null;
    const t = (minute - K.Ts) * 60, n = K.n, tur = K.tur, sey = S.seyirci, en = DIL === "en";
    const R1 = K.birinci.renk, bitti = K.yar.filter((y) => y.T <= t).length;
    const dk = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const kapaliDk = Math.round(K.kapali[1] - K.kapali[0]);
    if (K.bis) {
      if (en) return null; // bisiklet yarışı yalnız Mercanada'da
      if (t < 0) return { kisa: "Ada turu bisiklet yarışı başlıyor!", uzun: `Çarşıdaki şişme takın önünde ${n} bisikletçi dizildi; çevre yolu yarış boyunca trafiğe kapalı, kavşaklara bariyer kondu. Yarış saat ${saatte(K.Ts)} başlıyor: ${tur} tur.` };
      if (t < K.birinci.T) {
        const ld = lider(minute), lt = Math.min(tur, Math.max(1, Math.ceil((yol(ld, t) - K.Lg + 0.01) / K.R.tur.len)));
        return { kisa: "Bisiklet yarışı: çevre yolu kapalı", uzun: `${n} bisikletçi çevre yolunda ${tur} tur atıyor; şu an önde ${ld.renk[0]} formalı bir bisikletçi var (${lt}. tur). ${K.kenarN ? "Yol kenarına çıkan sakinler alkışlıyor" : "Yol trafiğe kapalı"}${sey && t > K.birinci.T - 600 ? `, bitişte ${sey} kişi bekliyor` : ""}.` };
      }
      if (t < K.sonT + 30) return { kisa: `Yarışı ${R1[0]} formalı bisikletçi kazandı!`, uzun: `${n} bisikletçinin ${tur} tur attığı ada turu yarışında birinci ${R1[0]} formalı bisikletçi oldu (${dk(K.birinci.T)}). Şu ana dek ${bitti} bisikletçi bitişe ulaştı${sey ? `, ${sey} kişi bitişte alkışlıyor` : ""}.` };
      return { kisa: `Bugün ada turu bisiklet yarışı vardı · ${saatYaz(K.Ts)}`, uzun: `Saat ${saatte(K.Ts)} çarşıdan başlayan yarışta ${n} bisikletçi çevre yolunda ${tur} tur attı; birinciliği ${R1[0]} formalı bisikletçi aldı (${dk(K.birinci.T)}). Çevre yolu ${kapaliDk} dakika trafiğe kapalı kaldı${sey ? `, bitişte ${sey} kişi izledi` : ""}.` };
    }
    // Driftwood: fun run.
    if (!en) return null;
    const shirt = (y) => `the runner in ${y.renk[1]}`;
    if (t < 0) return { kisa: "Fun run about to start!", uzun: `${n} runners are lining up under the inflatable arch on Main Street in front of the Town Green. The race starts at ${saatYaz(K.Ts)}: ${tur} laps around Main Street and Water Street.` };
    if (t < K.birinci.T) { const ld = lider(minute); return { kisa: "Fun run on Main Street!", uzun: `${n} runners are doing ${tur} laps around Main Street and Water Street; ${shirt(ld)} is in front right now${sey ? `, and ${sey} neighbors are cheering at the finish` : ""}.` }; }
    if (t < K.sonT + 30) return { kisa: `Fun run won by ${shirt(K.birinci)}!`, uzun: `${shirt(K.birinci).replace(/^t/, "T")} crossed the finish line first after ${tur} laps (${dk(K.birinci.T)}); ${bitti} of the ${n} runners have finished so far${sey ? `, with ${sey} neighbors cheering` : ""}.` };
    return { kisa: `Fun run on Main Street ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(K.Ts)}`, uzun: `At ${saatYaz(K.Ts)} ${n} runners set off from the arch in front of the Town Green for ${tur} laps around Main Street and Water Street; ${shirt(K.birinci)} finished first (${dk(K.birinci.T)})${sey ? ` and ${sey} neighbors cheered them in` : ""}.` };
  }

  return {
    kur, update, kapali, gizle, gorev, durus, ekstra, anlik, canli, vehicles, ses, yazi,
    seyirciBas: (o) => (K && K.o === o ? K.Ts + K.birinci.T / 60 - 14 : o.bas), // bitişi görmeye gelirler
    seyirci: { r0: 3.5, r1: 15, isR: 160, uzak: 1.6, en: 30, ozel: true, yasak, tavirlar: ["alkis", "alkis", "cek", "salla", "alkis", "goster"] },
  };
}
