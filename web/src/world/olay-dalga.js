// Dev dalgalar (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Mercanada: lodos. Deniz kabarır (köpüklü dalga sırtları, beyaz köpük çizgileri), gök griye döner; dev dalgalar kıyıyı
// döver, her dalga kırılınca su tozu ve köpük havalanır, rüzgârla karaya savrulur, büyük dalgalarda sahil yolunu aşıp
// caddeye kadar ulaşır. Kıyı şeridi ve balık iskelesi boşaltılır (tahliye), sahil caddesi trafiğe kapanır (kapali;
// iki ucunda bariyer, mesaideki polisler başında), sakinler güvenli mesafeden izler. Driftwood: rıhtımı aşan dalgalar,
// köpükler liman yoluna kadar savrulur, rıhtım boşaltılır (araç yolu yok, kapatma yalnız yaya).
// Her şey (dakika, o.tohum, dünya) işlevidir: Math.random ve kare arası birikim yok. Dalga takvimi: n. dalga kıyı
// noktası u'da tB = n·P + u·EGIK anında kırılır; açıktaki köpük şeritleri (gölgelendirici) aynı formülü kullanır.
import * as THREE from "three";
import { DIL } from "./olay-ayar.js";
import { TAU, ss, mix, hr, kiyiYeri, kiyiAdi, vapurUzak, kopukHavuzu, gokKarart } from "./olay-kiyi.js";
import { roll } from "../sim.js";

const P = 8.5, C = 7, EGIK = 0.018; // dalga periyodu (sn), hızı (m/sn), kıyı boyunca kırılma kayması (sn/m)
const YARI = 85, ADIM = 5; // dövülen kıyı şeridi ±YARI m, ADIM m'lik parçalar
const GRI = { top: new THREE.Color("#6b7580"), hor: new THREE.Color("#9aa3ab"), hemi: new THREE.Color("#b2bac3") };

export function buildDalgaOlay({ world, scene, group: olayGrubu, sky, traffic }) {
  let G = null, K = null;
  const uni = {
    uT: { value: 0 }, uGuc: { value: 0 }, uIsik: { value: 1 }, uMaske: { value: null }, uEn: { value: new THREE.Vector2(1, 1) },
  };
  function hazirla() {
    if (G) return G;
    const group = new THREE.Group(); group.name = "olay-dalga"; group.visible = false;
    olayGrubu.add(group);
    // Açık deniz: kabaran dalga sırtları ve beyaz köpük çizgileri (tek düzlem; karaya düşen kısım maskeyle silinir).
    const deniz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUV;
        void main() { vUV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uT; uniform float uGuc; uniform float uIsik; uniform sampler2D uMaske; uniform vec2 uEn;
        varying vec2 vUV;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main() {
          float u = (vUV.x - 0.5) * uEn.x, v = vUV.y * uEn.y; // u kıyı boyunca, v açığa (m)
          float m = texture2D(uMaske, vUV).r;
          if (m < 0.01 || uGuc < 0.01) discard;
          // Dalga sırtları: n. sırt v = C·(n·P + u·EGIK − t) (kıyıya doğru yürür).
          float ph = fract((v / ${C.toFixed(1)} + uT - u * ${EGIK}) / ${P.toFixed(1)});
          float sirt = smoothstep(0.86, 0.97, ph) * (1.0 - smoothstep(0.97, 1.0, ph));
          float kirpi = vn(vec2(u * 0.09, v * 0.05 - uT * 0.3)) * 0.6 + vn(vec2(u * 0.31, v * 0.2 + uT * 0.5)) * 0.4;
          float kopuk = sirt * smoothstep(0.35, 0.75, kirpi) * smoothstep(420.0, 30.0, v);
          // Beyaz köpük çizgileri ve lekeler (rüzgârın yırttığı dalga tepeleri).
          float lek = smoothstep(0.72, 0.86, vn(vec2(u * 0.05 + uT * 0.04, v * 0.12 - uT * 0.55)) * 0.7 + vn(vec2(u * 0.4, v * 0.6 - uT)) * 0.3);
          float ac = 1.0 - smoothstep(0.0, 1.0, abs(vUV.x - 0.5) * 2.0);
          float a = uGuc * m * ac * (0.22 * (1.0 - ph) + 0.75 * kopuk + 0.45 * lek * (0.4 + 0.6 * sirt));
          vec3 koyu = vec3(0.13, 0.25, 0.3), beyaz = vec3(0.93, 0.96, 0.97);
          vec3 c = mix(koyu, beyaz, clamp(kopuk * 1.4 + lek * 0.8, 0.0, 1.0)) * (0.45 + 0.55 * uIsik);
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    }));
    deniz.renderOrder = 2; deniz.frustumCulled = false;
    // Kırılan dalga duvarları: kıyıya bakan dik yüz, arkası yatık kama (örnekli, parça başına bir).
    const kama = new THREE.BufferGeometry();
    {
      const pr = [[-0.25, 0], [0.05, 1], [0.5, 0.86], [2.4, 0]]; // (v, y): ön taban, tepe, sırt, arka taban
      const pos = [], idx = [];
      for (const s of [-0.5, 0.5]) for (const [v, y] of pr) pos.push(s, y, v);
      for (let i = 0; i < 3; i++) { const a = i, b = i + 1, c2 = i + 4, d = i + 5; idx.push(a, c2, b, b, c2, d); }
      idx.push(0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6);
      kama.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); kama.setIndex(idx);
      kama.computeVertexNormals();
    }
    const n = Math.round((2 * YARI) / ADIM) + 1;
    const duvar = new THREE.InstancedMesh(kama, new THREE.MeshStandardMaterial({ color: "#5aa9b6", roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.9, flatShading: true }), n);
    duvar.instanceMatrix.setUsage(THREE.DynamicDrawUsage); duvar.frustumCulled = false; duvar.renderOrder = 3; duvar.count = 0;
    // Bariyer (kırmızı-beyaz): kapatılan yol uçlarında.
    const bariyer = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.25, 0.12).translate(0, 0.95, 0), new THREE.MeshStandardMaterial({ color: "#d8312a", roughness: 0.6 }), 8);
    const ayak = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.0, 0.5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#eeeeea", roughness: 0.6 }), 16);
    bariyer.count = ayak.count = 0; bariyer.castShadow = ayak.castShadow = true;
    group.add(deniz, duvar, bariyer, ayak);
    const kopuk = kopukHavuzu(group, { damla: 320, puf: 300, leke: 120 });
    G = { group, deniz, duvar, bariyer, ayak, kopuk, n };
    return G;
  }

  function kur(o) {
    const yer = kiyiYeri(world, o, {
      tuz: 7, kaynak: ["sahil_yolu", "kasaba", "iskele"],
      deniz: (W, e2, e1) => {
        if (vapurUzak(world, W[0], W[1]) < 70) return false;
        for (const la of [-YARI, 0, YARI]) if (world.height(W[0] + e1[0] * la + e2[0] * 40, W[1] + e1[1] * la + e2[1] * 40) > -1) return false;
        return true;
      },
    });
    if (!yer) return null;
    hazirla();
    const { W, e1, e2 } = yer, t = o.tohum | 0, Ts = (o.son - o.bas) * 60;
    // Her parçanın su çizgisi (kıyı tam düz değil): kıyı boyunca u'da su kenarının v'si.
    const parca = [];
    for (let i = 0; i < G.n; i++) {
      const u = -YARI + i * ADIM, bx = W[0] + e1[0] * u, bz = W[1] + e1[1] * u;
      const p = world.coastPoint(bx - e2[0] * 40, bz - e2[1] * 40, e2[0], e2[1], 0);
      const v0 = (p[0] - W[0]) * e2[0] + (p[1] - W[1]) * e2[1];
      parca.push({ u, v0: Math.abs(v0) < 30 ? v0 : 0, buyuk: 0 });
    }
    // Deniz düzlemi: kıyı boyunca 900 m, açığa 520 m; maske = su (yükseklik < −0,4), kıyıda ince bant.
    const EN = [900, 520], MW = 72, MH = 42, mask = new Uint8Array(MW * MH * 4);
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      const u = ((i + 0.5) / MW - 0.5) * EN[0], v = ((j + 0.5) / MH) * EN[1];
      const x = W[0] + e1[0] * u + e2[0] * v, z = W[1] + e1[1] * u + e2[1] * v;
      const h = world.height(x, z);
      mask[(j * MW + i) * 4] = h < -0.4 ? Math.round(255 * ss(-0.4, -1.6, h)) : 0;
      mask[(j * MW + i) * 4 + 3] = 255;
    }
    if (uni.uMaske.value) uni.uMaske.value.dispose();
    const tx = new THREE.DataTexture(mask, MW, MH); tx.magFilter = tx.minFilter = THREE.LinearFilter; tx.needsUpdate = true;
    uni.uMaske.value = tx; uni.uEn.value.set(EN[0], EN[1]);
    const yaw = Math.atan2(e1[0], e1[1]);
    // PlaneGeometry (rotateX): yerel x → kıyı boyunca (e1), yerel −z → açığa (e2); uv.y 0 (kıyı) → 1 (açık).
    G.deniz.scale.set(-EN[0], 1, EN[1]); // −x: uv.x kıyı boyunca +e1 (maske ve dalga takvimiyle aynı yön)
    G.deniz.rotation.set(0, Math.atan2(-e2[0], -e2[1]), 0);
    G.deniz.position.set(W[0] + e2[0] * EN[1] / 2, 0.04, W[1] + e2[1] * EN[1] / 2);
    // Kapatılan taşıt yolları: kıyı şeridinin 8–55 m gerisinden geçen yollar → uç düğümler kapalı, araçlar gizli.
    const kapali = new Set(), bariyerler = [];
    const net = world.network;
    if (traffic && net) {
      for (const e of net.edges) {
        if (!(e.road?.carriage > 0)) continue;
        const ic = e.pts.some(([x, z]) => { const u = (x - W[0]) * e1[0] + (z - W[1]) * e1[1], v = (x - W[0]) * e2[0] + (z - W[1]) * e2[1]; return Math.abs(u) < YARI - 10 && v < -6 && v > -55; });
        if (!ic) continue;
        for (const [nd, pt, ic2] of [[e.a, e.pts[0], e.pts[Math.min(3, e.pts.length - 1)]], [e.b, e.pts[e.pts.length - 1], e.pts[Math.max(0, e.pts.length - 4)]]]) {
          if (!nd || kapali.has(nd.id)) continue;
          kapali.add(nd.id);
          // Bariyer: düğümden kapatılan yola doğru 9 m içeride, yola dik.
          const dx = ic2[0] - pt[0], dz = ic2[1] - pt[1], L = Math.hypot(dx, dz) || 1;
          bariyerler.push({ x: pt[0] + (dx / L) * 9, z: pt[1] + (dz / L) * 9, yon: Math.atan2(dx, dz), en: e.road.carriage + (e.road.width - e.road.carriage) * 0.2 });
        }
      }
    }
    // Bariyerleri yerleştir (en çok 4 uç; her uçta yolu kapatan iki parça).
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
    let nb = 0, na = 0;
    for (const b of bariyerler.slice(0, 4)) {
      const yan = [Math.cos(b.yon), -Math.sin(b.yon)];
      for (const k of [-0.5, 0.5]) {
        const x = b.x + yan[0] * k * (b.en * 0.55), z = b.z + yan[1] * k * (b.en * 0.55);
        q.setFromAxisAngle(Y, b.yon + Math.PI / 2); p.set(x, world.surfaceY(x, z) + 0.06, z);
        m.compose(p, q, s1); G.bariyer.setMatrixAt(nb++, m);
        for (const a of [-1.15, 1.15]) { p.set(x + Math.sin(b.yon + Math.PI / 2) * a, world.surfaceY(x, z) + 0.06, z + Math.cos(b.yon + Math.PI / 2) * a); m.compose(p, q, s1); G.ayak.setMatrixAt(na++, m); }
      }
    }
    G.bariyer.count = nb; G.ayak.count = na;
    G.bariyer.instanceMatrix.needsUpdate = G.ayak.instanceMatrix.needsUpdate = true;
    // Kapanış ve açılış: dövme evresinin başında (+1 dk), durulma evresinde (olay-plan.js dalga: yukselme 0,15, dovme 0,85).
    const kap = o.bas + (Ts * 0.15) / 60 + 1, ac = o.bas + (Ts * 0.9) / 60;
    const kal = world.nearestWalkable(W[0] - e2[0] * 26, W[1] - e2[1] * 26, 8);
    // Şeritteki iskeleler: dalga sırtı geçerken iki yanında su fışkırır ("dalgalar iskeleyi döver").
    const iskeleler = [];
    for (const pr of world.piers ?? []) {
      const cx = (pr.x0 + pr.x1) / 2, cz = (pr.z0 + pr.z1) / 2, u = (cx - W[0]) * e1[0] + (cz - W[1]) * e1[1];
      if (Math.abs(u) > YARI - 5) continue;
      const vs = [[pr.x0, pr.z0], [pr.x1, pr.z1], [pr.x0, pr.z1], [pr.x1, pr.z0]].map(([x, z]) => (x - W[0]) * e2[0] + (z - W[1]) * e2[1]);
      const v1 = Math.max(...vs);
      if (v1 < 4) continue;
      iskeleler.push({ u, v0: Math.max(0, Math.min(...vs)), v1, en: Math.max(pr.x1 - pr.x0, pr.z1 - pr.z0) < 20 ? Math.min(pr.x1 - pr.x0, pr.z1 - pr.z0) / 2 + 0.8 : 3 });
    }
    K = { o, yer, W, e1, e2, Ts, t, parca, kapali, iskeleler, bariyerler: bariyerler.slice(0, 4), kap, ac, kal, ad: kiyiAdi(world, yer, DIL), yaw, bos: new Set() };
    const odak = [W[0] + e2[0] * 4, W[1] + e2[1] * 4];
    // Kamera kıyı boyunca bakar (kiyi verilmez: video kamerası denizden ya da karanın içinden değil, sahil şeridinin
    // ilerisinden dalgaların kıyıyı dövdüğü çizgiye bakar; deniz bir yanda, sahil yolu öbür yanda).
    const sg = hr(t, 9) < 0.5 ? -1 : 1, yx = e1[0] * sg * 0.94 - e2[0] * 0.34, yz = e1[1] * sg * 0.94 - e2[1] * 0.34;
    return { odak, odakY: 3, kalabalik: kal, kiyi: null, yon: Math.atan2(yx, yz), yerAdi: K.ad.ad, zaman: null,
      gitD: 80, gitEgim: 0.3, cekimOlcek: 1.25, kalabalikArkadan: true };
  }

  /** Dalganın gücü (0–1): yükselme evresinde artar, dövmede tam (dalgalanarak), durulmada söner. */
  const guc = (ts) => { const u = ts / K.Ts; return ss(0, 0.15, u) * (1 - ss(0.82, 1, u) * 0.85) * (0.85 + 0.15 * Math.sin(ts * 0.05)); };
  /** n. dalga büyük mü (4–5 dalgada bir; dalga numarasıyla deterministik). */
  const buyukMu = (n) => hr(K.t, 300, n) < 0.24;

  function update(o, evre, minute, real, env) {
    if (!o || !K || K.o !== o || !evre) { if (G) G.group.visible = false; if (!o) K = null; return; }
    const ts = (minute - o.bas) * 60, g = guc(ts), light = env?.light ?? 1;
    // Bariyerler kapanıştan açılışa dek; dalgalar olay boyunca.
    const yolKapali = minute >= K.kap && minute < K.ac;
    G.bariyer.visible = G.ayak.visible = yolKapali;
    G.group.visible = true;
    G.deniz.visible = G.duvar.visible = evre.ad !== "sonra";
    if (evre.ad === "sonra") { G.kopuk.bas(); G.kopuk.bitir(); return; }
    uni.uT.value = ts; uni.uGuc.value = g; uni.uIsik.value = light;
    gokKarart(sky, scene, 0.55 * ss(0, 0.2, ts / K.Ts) * (1 - ss(0.85, 1, ts / K.Ts)), light, GRI);
    const { W, e1, e2 } = K, kp = G.kopuk, dm = G.duvar;
    kp.bas(light);
    let nd = 0;
    const _m = MAT, ruz = 3.2; // rüzgâr karaya doğru (m/sn)
    const cam = env?.camera?.position;
    for (let i = 0; i < K.parca.length; i++) {
      const pc = K.parca[i], u = pc.u, kenar = 1 - ss(YARI - 20, YARI, Math.abs(u));
      // Sıradaki dalga (kırılmamış) ve son kırılan dalga.
      const k = (ts - u * EGIK) / P, nSon = Math.floor(k), tB = (nSon + 1) * P + u * EGIK, vC = C * (tB - ts);
      const buy = buyukMu(nSon + 1), H = (buy ? 3.4 : 2.1) * g * (0.75 + 0.25 * kenar);
      // Duvar: 45 m açıktan kabarır, kıyıda yığılıp kırılır.
      if (vC < 45 && H > 0.15) {
        const h = H * ss(45, 10, vC) * ss(0, 2.5, vC) + 0.2;
        const bx = W[0] + e1[0] * u + e2[0] * (pc.v0 + vC), bz = W[1] + e1[1] * u + e2[1] * (pc.v0 + vC);
        // Kameranın dibindeki dalga duvarı çizilmez (alçak video kamerası kamanın içine düşüp kareyi yeşile boyuyordu).
        if (!cam || Math.hypot(cam.x - bx, cam.z - bz) > 9 || cam.y > h + 2) {
          KOY(_m, bx, -0.3, bz, K.yaw, ADIM * 1.12, h, 1 + h * 0.9);
          dm.setMatrixAt(nd++, _m);
        }
        // Sırtta köpük (yığıldıkça artar).
        const kpk = ss(34, 4, vC) * g;
        if (kpk > 0.05) for (let j = 0; j < 2; j++) {
          const r = hr(K.t, i * 7 + j, nSon), s = 1.2 + 1.8 * kpk;
          kp.ekle("puf", bx + e1[0] * (j - 0.5) * 2.4, h - 0.1, bz + e1[1] * (j - 0.5) * 2.4 - e2[1] * 0.1, s, s * 0.5, s, 0.95 * kpk * (0.7 + 0.3 * r));
        }
      }
      // Kırılma: son kırılan dalganın su tozu ve köpüğü (6 sn).
      const tK = nSon * P + u * EGIK, a = ts - tK, bS = buyukMu(nSon), HS = (bS ? 3.4 : 2.1) * guc(tK) * (0.75 + 0.25 * kenar);
      if (a >= 0 && a < 6.5 && HS > 0.3 && i % 2 === (nSon & 1)) {
        const ust = (bS ? 13 : 6.5) * (HS / 2.1), x0 = W[0] + e1[0] * u + e2[0] * pc.v0, z0 = W[1] + e1[1] * u + e2[1] * pc.v0, tohum = K.t + i * 131 + nSon * 7;
        // Su tozu: kırıldığı yerde dikine fışkırır, tepeden rüzgârla karaya savrulur (büyük dalgada sahil yolunu aşar).
        for (let j = 0; j < 10; j++) {
          const r1 = hr(tohum, j, 1), r2 = hr(tohum, j, 2), aj = a - 0.1 * j * r1;
          if (aj < 0) continue;
          const yk = ust * (0.3 + 0.7 * r2), y = yk * (1 - Math.exp(-aj * 2.6)) - 0.35 * Math.max(0, aj - 1.2) * (aj - 1.2);
          const geri = (0.3 + (ruz * 0.5 + (bS ? 1.4 : 0)) * aj * (0.4 + 0.6 * r2)) * (0.7 + 0.5 * r1);
          const s = (0.75 + 0.4 * aj) * (bS ? 1.3 : 1) * (0.7 + 0.5 * r2);
          const al = 0.75 * (1 - ss(0.8, 4.8, aj)) * ss(0, 0.2, aj);
          kp.ekle("puf", x0 + e1[0] * (r1 - 0.5) * 4 - e2[0] * geri, Math.max(0.4, y), z0 + e1[1] * (r1 - 0.5) * 4 - e2[1] * geri, s, s * 1.5, s, al);
        }
        for (let j = 0; j < 10; j++) {
          const r1 = hr(tohum, j, 3), r2 = hr(tohum, j, 4), r3 = hr(tohum, j, 5), aj = a - 0.04 * j;
          if (aj < 0 || aj > 3.2) continue;
          const vy = (6 + 7 * r2) * (bS ? 1.4 : 1) * Math.sqrt(HS / 2.1), y = vy * aj - 4.9 * aj * aj;
          if (y < 0) continue;
          const geri = (0.6 + 2 * r1 + ruz * 0.8) * aj, sz = 0.1 + 0.16 * r3;
          kp.ekle("damla", x0 + e1[0] * (r3 - 0.5) * 6 - e2[0] * geri, y + 0.3, z0 + e1[1] * (r3 - 0.5) * 6 - e2[1] * geri, sz, sz * 1.5, sz);
        }
        // Kıyıya taşan köpük: kumsalda/rıhtımda, büyük dalgada daha içeride; yavaşça söner.
        const tas = (bS ? 9 : 4) * (HS / 2.1), al = 0.5 * ss(0, 0.6, a) * (1 - ss(2.5, 6.5, a)); // köpük kıyının hemen gerisine taşar (çimde beyaz lekeler yapmasın)
        const vv = -2 - tas * ss(0, 1.8, a);
        kp.ekle("leke", x0 + e2[0] * vv, world.groundY(x0 + e2[0] * vv, z0 + e2[1] * vv) + 0.06, z0 + e2[1] * vv, ADIM * 0.9, 1, 3 + tas * 0.25, al, K.yaw - Math.PI / 2);
      }
    }
    for (const is of K.iskeleler) {
      const k = (ts - is.u * EGIK) / P, tB = (Math.floor(k) + 1) * P + is.u * EGIK, vC = C * (tB - ts);
      if (vC < is.v0 || vC > is.v1 || g < 0.3) continue;
      const bx = W[0] + e1[0] * is.u + e2[0] * vC, bz = W[1] + e1[1] * is.u + e2[1] * vC, n = Math.floor(ts / P);
      for (let j = 0; j < 6; j++) {
        const r1 = hr(K.t, 500 + j, n), r2 = hr(K.t, 520 + j, n), yan = j % 2 ? 1 : -1, s2 = (1.2 + 1.2 * r2) * g;
        kp.ekle("puf", bx + e1[0] * yan * (is.en + 0.6 * r1) - e2[0] * j * 0.6, 1.2 + 2.6 * r2 * g, bz + e1[1] * yan * (is.en + 0.6 * r1) - e2[1] * j * 0.6, s2, s2 * 1.4, s2, 0.8 * g * (1 - j / 8));
      }
    }
    dm.count = nd; dm.instanceMatrix.needsUpdate = true;
    kp.bitir();
  }

  function canli() {
    // Sabit hedef: dövülen şeridin ortası, su kenarının hemen gerisi (kamera çekim boyunca sıçramasın).
    return K ? [K.W[0] - K.e2[0] * 3, 3, K.W[1] - K.e2[1] * 3] : null;
  }

  /** Kıyı şeridi boşaltılır: ±(YARI+15) m, su kenarından 18 m içeriye dek (iskeleler dahil) → 22–26 m geriye. */
  function tahliye(x, z, minute) {
    if (!K || minute < K.kap - 1 || minute > K.ac + 2) return null;
    const { W, e1, e2 } = K, dx = x - W[0], dz = z - W[1], u = dx * e1[0] + dz * e1[1], v = dx * e2[0] + dz * e2[1];
    if (Math.abs(u) > YARI + 15 || v < -18) return null;
    const v2 = -22 - (Math.abs(u * 7.3) % 4);
    const t0 = K.kap - 1, t1 = K.ac;
    const e = Math.min(1, (minute - t0) / 1.5, (t1 + 2 - minute) / 1.5);
    const vv = v + (v2 - v) * Math.max(0, Math.min(1, e));
    let nx = W[0] + e1[0] * u + e2[0] * vv, nz = W[1] + e1[1] * u + e2[1] * vv;
    if (e >= 1 && !world.isWalkable(nx, nz)) [nx, nz] = world.nearestWalkable(nx, nz, 5);
    const yuru = e < 1 ? (Math.abs(vv - v) / 0.72) * Math.PI : 0;
    const bak = e < 1 ? Math.atan2(nx - x, nz - z) + (minute > t1 ? Math.PI : 0) : Math.atan2(W[0] - nx, W[1] - nz);
    return { x: nx, z: nz, heading: bak, yuru };
  }

  function kapali(minute) {
    return K && K.kapali.size && minute >= K.kap && minute < K.ac ? K.kapali : null;
  }
  function gizle(x, z, minute) {
    if (!K || !K.kapali.size || minute < K.kap || minute >= K.ac) return false;
    const dx = x - K.W[0], dz = z - K.W[1], u = dx * K.e1[0] + dz * K.e1[1], v = dx * K.e2[0] + dz * K.e2[1];
    return Math.abs(u) < YARI + 10 && v < -6 && v > -55;
  }

  /** Görevli: mesaideki polisler (en çok 2) kapatılan yolun bariyerinde trafiği yönlendirir; iş yerinden yürüyerek gelir. */
  function gorev(people, day, S, plans) {
    if (!K || !K.bariyerler.length) return [];
    const R = people.residents, T0 = K.kap + 0.5, T1 = K.ac - 0.3, out = [];
    const ad = R.map((r, i) => i).filter((i) => people.works[i]?.job === "polis" && plans[i].some((s) => s.ne === "is" && s.bas <= T0 - 12 && s.son >= T1 + 2))
      .sort((a, b) => roll(R[a].seed, "dalgaGorev", day) - roll(R[b].seed, "dalgaGorev", day)).slice(0, Math.min(2, K.bariyerler.length));
    ad.forEach((i, k) => {
      const b = K.bariyerler[k], kapi = people.works[i]?.loc?.door ?? [b.x, b.z];
      const x = b.x - Math.sin(b.yon) * 2.5, z = b.z - Math.cos(b.yon) * 2.5; // bariyerin önünde (kapalı yolun dışında)
      const commute = Math.max(1, Math.round(Math.hypot(kapi[0] - x, kapi[1] - z) / 1.25 / 60));
      out.push({ i, T0: T0 + commute, T1, commute, item: { x, z, heading: b.yon + Math.PI, gorevli: "polis", rol: "trafik", look: null } });
    });
    K.polis = out.length;
    return out;
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K || K.o !== o) return null;
    const ts = (minute - o.bas) * 60, u = ts / K.Ts, n = S.seyirci, A = K.ad, yol = K.kapali.size > 0, kapSure = Math.round(K.ac - K.kap);
    if (DIL === "en") {
      const izle = n ? ` ${n} ${n === 1 ? "neighbor is" : "neighbors are"} watching from a safe distance.` : "";
      if (u < 0.15) return { kisa: "The sea is building", uzun: `Since ${saatYaz(o.bas)} the wind has been whipping up the sea off ${A.ad}; whitecaps are rolling in and the waves are getting bigger.` };
      if (minute < K.ac) return { kisa: `Big waves pounding ${A.ad}`, uzun: `Big waves are crashing into ${A.ad} and throwing spray across the waterfront${yol ? "; the shore road is closed to traffic" : ""}. Everyone has stepped back from the water's edge.${izle}` };
      return { kisa: `Big waves ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`, uzun: `From ${saatYaz(o.bas)} big waves pounded ${A.ad}, throwing spray across the waterfront. Everyone stayed back from the water's edge for about ${kapSure} minutes${yol ? " and the shore road was closed" : ""}; by ${saatYaz(o.son)} the sea had calmed down.${n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} watched from a safe distance.` : ""}` };
    }
    const izle = n ? ` ${n} kişi güvenli mesafeden izliyor.` : "";
    const polis = K.polis ? `; polis bariyer başında` : "";
    if (u < 0.15) return { kisa: "Lodos başladı, deniz kabarıyor", uzun: `Saat ${saatte(o.bas)} lodos başladı; ${A.in} açığında köpüklü dalgalar kıyıya doğru büyüyor.` };
    if (minute < K.ac) return { kisa: yol ? "Lodos: sahil caddesi kapandı" : "Lodos dalgaları sahili dövüyor", uzun: `Dev dalgalar ${A.i} dövüyor, köpükler sahil yoluna savruluyor. Kıyıdakiler geri çekildi${yol ? `, sahil caddesi trafiğe kapatıldı${polis}` : ""}.${izle}` };
    return { kisa: `Bugün lodos dalgaları · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(o.bas)} başlayan lodosla dev dalgalar sahili dövdü, köpükler sahil yoluna savruldu. Kıyıdakiler ${kapSure} dakika geri çekildi${yol ? ", sahil caddesi trafiğe kapalı kaldı" : ""}; saat ${saatte(o.son)} deniz duruldu.${n ? ` ${n} kişi güvenli mesafeden izledi.` : ""}` };
  }

  return {
    kur, update, canli, yazi, tahliye, kapali, gizle, gorev,
    ses: (minute) => (K && minute >= K.o.bas && minute <= K.o.son ? { ruzgar: 0.75 * guc((minute - K.o.bas) * 60), kalabalik: minute > K.kap && minute < K.ac ? 0.25 : 0 } : null),
    seyirci: { r0: 2, r1: 12, isR: 250, uzak: 1.8, kiyida: true, en: 30, tavirlar: ["cek", "goster", "sasir", "cek", "konus", "bak"] },
  };
}

const MAT = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
/** Kama örneği: (x, y, z), kıyı yönü yaw (yerel x kıyı boyunca, yerel +z açığa), boyutlar. */
function KOY(m, x, y, z, yaw, sx, sy, sz) {
  _q.setFromAxisAngle(_Y, yaw - Math.PI / 2); _p.set(x, y, z); _s.set(sx, sy, sz);
  return m.compose(_p, _q, _s);
}
