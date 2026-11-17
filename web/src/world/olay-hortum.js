// Su hortumu (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"; arayüz olay-moduller.js).
// Açıkta, kıyıdan 500–700 m uzakta koyu bir bulut tabanı oluşur, gök kısmen kararır; bulut tabanından bir huni iner, su
// yüzünde dönen bir serpinti halkası belirir, huni suya değer (su hortumu), kıyıya koşut ağır ağır ilerler, sonra incelip
// kopar ve dağılır. Hortum kıyıya ulaşmaz (yol hep açıkta). Sakinler kıyıdan izler.
// Kamera (video): hareketli hedef (canli) hortumla kıyının arasındaki bir noktadır; kamera kıyı tarafında durur, hortum
// kadrajın ortasında arkada kalır (hedefin kendisi 400 m'lik bir yapı: yakın kadraj anlamsız).
// Her şey (dakika, o.tohum, dünya) işlevidir: Math.random ve kare arası birikim yok. Fırtınayla aynı anda olmaz (tek etkin
// olay; hava.js yalnız fırtına/siste gökyüzünü yönetir, burada yalnız bu olayın evresinde üstüne yazılır).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DIL, HORTUM } from "./olay-ayar.js";
import { TAU, ss, mix, hr, kiyiYeri, kiyiAdi, kopukHavuzu, gokKarart } from "./olay-kiyi.js";

function bulutGeo(tohum, R) {
  // Bulut tabanı: basık kabarcıklar (yarıçap R), altı koyu, üstü açık; ortada aşağı sarkan "duvar bulutu".
  const parca = [], A = new THREE.Color("#4b535d"), B = new THREE.Color("#a7aeb6"), C = new THREE.Color();
  const kab = (x, y, z, r, sy) => {
    const g = new THREE.IcosahedronGeometry(r, 1); g.deleteAttribute("uv");
    g.scale(1, sy, 1).translate(x, y, z);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { C.copy(A).lerp(B, ss(y - r * sy * 0.6, y + r * sy, p.getY(i))); col[i * 3] = C.r; col[i * 3 + 1] = C.g; col[i * 3 + 2] = C.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    parca.push(g.index ? g.toNonIndexed() : g);
  };
  for (let i = 0; i < 34; i++) {
    const a = hr(tohum, 70, i) * TAU, d = Math.sqrt(hr(tohum, 71, i)) * R, r = (0.22 + 0.2 * hr(tohum, 72, i)) * R;
    kab(Math.cos(a) * d, 20 + 40 * hr(tohum, 73, i), Math.sin(a) * d, r, 0.32);
  }
  kab(0, -10, 0, R * 0.32, 0.4); // duvar bulutu (huninin tepesi)
  kab(R * 0.12, -4, -R * 0.1, R * 0.24, 0.42);
  return mergeGeometries(parca);
}

export function buildHortumOlay({ world, scene, group: olayGrubu, sky }) {
  const AY = { uzak: 650, H: 430, ...(HORTUM ?? {}) };
  let G = null, K = null;
  const uni = {
    uTaban: { value: new THREE.Vector3() }, uTepe: { value: new THREE.Vector3() }, uBuk: { value: new THREE.Vector2() },
    uT: { value: 0 }, uIn: { value: 0 }, uIp: { value: 0 }, uAlfa: { value: 0 }, uIsik: { value: 1 }, uSis: { value: new THREE.Color() },
    uSisNF: { value: new THREE.Vector2(1600, 6000) },
  };
  function hazirla() {
    if (G) return G;
    const group = new THREE.Group(); group.name = "olay-hortum"; group.visible = false;
    olayGrubu.add(group);
    const bulutMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0, flatShading: true });
    const bulut = new THREE.Mesh(new THREE.BufferGeometry(), bulutMat);
    bulut.frustumCulled = false; bulut.renderOrder = 2;
    // Huni: açık uçlu silindir (y 0–1); eksen eğrisi, yarıçap profili, ip gibi incelme ve kopma gölgelendiricide.
    const hg = new THREE.CylinderGeometry(1, 1, 1, 20, 56, true).translate(0, 0.5, 0); hg.deleteAttribute("uv");
    const huni = new THREE.Mesh(hg, new THREE.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `
        uniform vec3 uTaban; uniform vec3 uTepe; uniform vec2 uBuk; uniform float uT; uniform float uIp;
        varying float vH; varying float vA; varying float vF; varying float vD;
        void main() {
          float h = position.y;
          vec3 ek = mix(uTaban, uTepe, h);
          // Eğri eksen: ortada yana kavis + hafif dalgalanma (ip evresinde kıvrım artar).
          float s = sin(h * 3.14159);
          ek.xz += uBuk * s * (1.0 + 0.8 * uIp) + vec2(sin(h * 7.0 + uT * 0.35), cos(h * 5.0 + uT * 0.3)) * (1.5 + 6.0 * uIp) * s;
          float r = 6.5 + 5.0 * smoothstep(0.12, 0.0, h) + 42.0 * pow(h, 3.5);
          r *= 1.0 - 0.62 * uIp * smoothstep(0.85, 0.3, h);
          vec2 c = normalize(position.xz);
          vec3 p = ek + vec3(c.x * r, 0.0, c.y * r);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vec3 v = normalize(cameraPosition - wp.xyz);
          vF = 1.0 - abs(dot(normalize(vec3(c.x, 0.0, c.y)), v));
          vH = h; vA = atan(c.y, c.x); vD = length(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uT; uniform float uIn; uniform float uIp; uniform float uAlfa; uniform float uIsik; uniform vec3 uSis; uniform vec2 uSisNF;
        varying float vH; varying float vA; varying float vF; varying float vD;
        void main() {
          // Dönen dikey çizgiler (yoğuşma bantları).
          float bant = 0.72 + 0.28 * sin(vA * 6.0 + vH * 26.0 - uT * 2.6) * sin(vA * 3.0 - vH * 9.0 - uT * 1.4);
          float kenar = mix(0.38, 1.0, pow(vF, 1.3));
          // İniş: tepeden aşağı (uIn 0 → 1); ip evresinde ortadan kopar.
          float gor = smoothstep(1.0 - uIn - 0.06, 1.0 - uIn + 0.02, vH);
          float kop = 1.0 - uIp * smoothstep(0.22, 0.0, abs(vH - 0.42 + 0.1 * sin(uT * 0.2))) * smoothstep(0.35, 0.8, uIp) * 1.2;
          float a = uAlfa * kenar * bant * gor * clamp(kop, 0.0, 1.0) * mix(1.0, 0.55, uIp);
          if (a < 0.01) discard;
          vec3 renk = mix(vec3(0.86, 0.88, 0.9), vec3(0.55, 0.59, 0.64), smoothstep(0.2, 0.95, vH)) * (0.45 + 0.55 * uIsik);
          float sis = smoothstep(uSisNF.x, uSisNF.y, vD);
          gl_FragColor = vec4(mix(renk, uSis, sis), a * (1.0 - 0.6 * sis));
          #include <colorspace_fragment>
        }`,
    }));
    huni.frustumCulled = false; huni.renderOrder = 4;
    group.add(bulut, huni);
    const kopuk = kopukHavuzu(group, { damla: 140, bulut: 150, halka: 6, leke: 24 });
    G = { group, bulut, bulutMat, huni, kopuk };
    return G;
  }

  function kur(o) {
    const t = o.tohum | 0, sg = hr(t, 81) < 0.5 ? -1 : 1, uz = AY.uzak * (0.88 + 0.24 * hr(t, 82));
    let P = null;
    const yer = kiyiYeri(world, o, {
      tuz: 5, kaynak: ["sahil_yolu", "kasaba"],
      deniz: (W, e2, e1) => {
        // Yol: kıyıya koşut −130 → +130 m (sg), uz m açıkta; çevresi 250 m boyunca kara olmamalı (kıyıya ulaşmaz).
        for (const la of [-170, -90, 0, 90, 170]) for (const d of [uz - 250, uz, uz + 150]) {
          if (world.height(W[0] + e1[0] * la + e2[0] * d, W[1] + e1[1] * la + e2[1] * d) > -4) return false;
        }
        P = { W, e1, e2 }; return true;
      },
    });
    if (!yer) return null;
    hazirla();
    const { W, e1, e2 } = P, Ts = (o.son - o.bas) * 60;
    const A0 = [W[0] + e2[0] * uz - e1[0] * sg * 130, W[1] + e2[1] * uz - e1[1] * sg * 130];
    const A1 = [W[0] + e2[0] * (uz + 40) + e1[0] * sg * 130, W[1] + e2[1] * (uz + 40) + e1[1] * sg * 130];
    G.bulut.geometry.dispose();
    G.bulut.geometry = bulutGeo(t, AY.H * 0.95);
    const kiyi = yer.K, orta = [(A0[0] + A1[0]) / 2, (A0[1] + A1[1]) / 2], dist = Math.hypot(orta[0] - kiyi[0], orta[1] - kiyi[1]);
    K = { o, yer, W, e1, e2, A0, A1, Ts, t, sg, kiyi, dist, ad: kiyiAdi(world, yer, DIL), buk: [(hr(t, 83) - 0.5) * 70, (hr(t, 84) - 0.5) * 70] };
    // Odak hortumun kendisi değil, kıyıyla hortumun arasında ~200 m açıkta bir nokta: sitenin kamerası hedefi ada sınırının
    // 300 m ötesine bırakmıyor (hortum 650 m açıkta). Kamera kıyıdan bu noktaya bakınca hortum aynı doğrultuda, arkada kalır.
    // "Olaya git": kıyı noktasının ~12 m üstünden (palmiyelerin önünde, su kenarında), ufka yakın bakış (site hedefi uçuştan sonra deniz düzeyine indiriyor:
    // yüksek kamera aşağı bakıp hortumu kadrajın üstünden kesiyordu); kalabalık çekimi seyircilerin arkasından aynı doğrultuda.
    const od = Math.min(220, dist * 0.4), odak = [kiyi[0] + (orta[0] - kiyi[0]) / dist * od, kiyi[1] + (orta[1] - kiyi[1]) / dist * od];
    return { odak, odakY: 4, kalabalik: kiyi, kiyi, yon: Math.atan2(kiyi[0] - orta[0], kiyi[1] - orta[1]), yerAdi: K.ad.ad, zaman: null,
      gitD: od - 6, gitEgim: 0.035, cekimOlcek: Math.max(1, (0.45 * dist) / 60), cekimOlcekH: 0.75, kalabalikArkadan: true };
  }

  // Evreler (olay-plan.js hortum): olusma 0–0,2, hortum 0,2–0,8, dagilma 0,8–1.
  const _p = [0, 0];
  function taban(ts, out) {
    const u = ss(0, K.Ts, ts) * 0.8 + 0.2 * (ts / K.Ts); // hafif yumuşak hız
    out[0] = mix(K.A0[0], K.A1[0], u); out[1] = mix(K.A0[1], K.A1[1], u);
    return out;
  }
  function durum(ts) {
    const u = ts / K.Ts;
    return {
      bulut: ss(0, 0.12, u) * (1 - ss(0.9, 1, u)),
      karar: ss(0.02, 0.18, u) * (1 - ss(0.86, 1, u)),
      in: ss(0.08, 0.2, u), // huni tepeden suya iner
      halka: ss(0.1, 0.18, u) * (1 - ss(0.86, 0.95, u)), // su yüzünde serpinti halkası
      alfa: ss(0.06, 0.12, u) * (1 - ss(0.93, 0.99, u)),
      ip: ss(0.8, 0.94, u),
    };
  }

  function update(o, evre, minute, real, env) {
    if (!o || !K || K.o !== o || !evre || evre.ad === "sonra") { if (G) G.group.visible = false; if (!o) K = null; return; }
    G.group.visible = true;
    const ts = (minute - o.bas) * 60, d = durum(ts), light = env?.light ?? 1;
    taban(ts, _p);
    const H = AY.H;
    G.bulut.position.set(_p[0] + K.buk[0] * 0.3, H, _p[1] + K.buk[1] * 0.3);
    G.bulut.scale.set(0.75 + 0.25 * d.bulut, 0.6 + 0.4 * d.bulut, 0.75 + 0.25 * d.bulut);
    G.bulutMat.opacity = 0.95 * d.bulut;
    G.bulut.visible = d.bulut > 0.01;
    uni.uTaban.value.set(_p[0], 0, _p[1]);
    uni.uTepe.value.set(_p[0] + K.buk[0] * 0.3, H - 18, _p[1] + K.buk[1] * 0.3);
    uni.uBuk.value.set(K.buk[0], K.buk[1]);
    uni.uT.value = ts; uni.uIn.value = d.in; uni.uIp.value = d.ip; uni.uAlfa.value = 0.9 * d.alfa; uni.uIsik.value = light;
    uni.uSis.value.copy(scene.fog.color); uni.uSisNF.value.set(scene.fog.near, scene.fog.far);
    G.huni.visible = d.alfa > 0.01;
    gokKarart(sky, scene, 0.7 * d.karar, light);
    // Serpinti: tabanda dönen, yükselen su tozu (halka önce oluşur, huni inmeden).
    const kp = G.kopuk;
    kp.bas(light);
    const h = d.halka * (0.4 + 0.6 * d.in) * (1 - 0.5 * d.ip);
    if (h > 0.01) {
      for (let i = 0; i < 150; i++) {
        const r1 = hr(K.t, 90, i), r2 = hr(K.t, 91, i), r3 = hr(K.t, 92, i);
        const f = (r1 + ts * (0.03 + 0.03 * r2)) % 1; // yükselme evresi
        const a = r3 * TAU + ts * (0.9 - 0.4 * f) * K.sg + f * 2.5 * K.sg, rr = (5 + 13 * r2) * (1 + 0.9 * f);
        const y = 1 + 30 * f * f + 4 * r1, s = (2.2 + 3.5 * r2) * (0.7 + 0.9 * f);
        kp.ekle("bulut", _p[0] + Math.cos(a) * rr, y, _p[1] + Math.sin(a) * rr, s, s * 0.8, s, 0.42 * h * (1 - f) * ss(0, 0.08, f));
      }
      for (let i = 0; i < 140; i++) {
        const r1 = hr(K.t, 93, i), r2 = hr(K.t, 94, i), f = (r1 + ts * 0.25) % 1;
        const a = r2 * TAU + ts * 1.4 * K.sg, rr = 7 + 16 * f;
        kp.ekle("damla", _p[0] + Math.cos(a) * rr, 0.5 + 9 * f * (1 - f) * 2, _p[1] + Math.sin(a) * rr, 0.35, 0.35, 0.35);
      }
      kp.ekle("halka", _p[0], 0.06, _p[1], 26 + 3 * Math.sin(ts * 0.7), 1, 26, 0.55 * h);
      kp.ekle("halka", _p[0], 0.07, _p[1], 15 + 2 * Math.sin(ts * 1.1), 1, 15, 0.45 * h);
      kp.ekle("leke", _p[0], 0.05, _p[1], 20, 1, 20, 0.5 * h);
    }
    kp.bitir();
  }

  function canli(minute) {
    if (!K) return null;
    taban((minute - K.o.bas) * 60, _p);
    // Kıyı ile hortum arası (%45): kamera kıyı tarafında kalır, hortum kadrajda arkada.
    return [mix(K.kiyi[0], _p[0], 0.45), 60, mix(K.kiyi[1], _p[1], 0.45)];
  }

  function yazi(o, S, minute, { saatYaz, saatte }) {
    if (!K || K.o !== o) return null;
    const ts = (minute - o.bas) * 60, u = ts / K.Ts, n = S.seyirci, A = K.ad, m = Math.round(K.dist / 10) * 10;
    const temas = o.bas + (K.Ts * 0.2) / 60, sure = Math.round((K.Ts * 0.62) / 60);
    if (DIL === "en") {
      const izle = n ? ` ${n} ${n === 1 ? "neighbor" : "neighbors"} watched from the shore.` : "";
      if (u < 0.2) return { kisa: "Funnel cloud over the sea!", uzun: `At ${saatYaz(o.bas)} a dark cloud built up about ${m} meters off ${A.ad} and a funnel began to drop toward the water.` };
      if (u < 0.86) return { kisa: "Waterspout off the coast!", uzun: `A waterspout touched down about ${m} meters off ${A.ad} at ${saatYaz(temas)} and is crawling along the coast, spinning up spray; it is staying well out at sea.${n ? ` ${n} ${n === 1 ? "neighbor is" : "neighbors are"} watching from the shore.` : ""}` };
      return { kisa: `Waterspout ${o.yuva ? "this afternoon" : "this morning"} · ${saatYaz(o.bas)}`, uzun: `At ${saatYaz(temas)} a waterspout touched down about ${m} meters off ${A.ad}. It crawled along the coast for about ${sure} minutes without coming ashore, then thinned into a rope and broke apart.${izle}` };
    }
    const izle = n ? ` ${n} kişi kıyıdan izledi.` : "";
    if (u < 0.2) return { kisa: "Denizde hortum oluşuyor!", uzun: `Saat ${saatte(o.bas)} ${A.in} yaklaşık ${m} metre açığında koyu bir bulut oluştu; bulut tabanından denize doğru bir huni iniyor.` };
    if (u < 0.86) return { kisa: "Açıkta su hortumu!", uzun: `Saat ${saatte(temas)} ${A.in} yaklaşık ${m} metre açığında bir su hortumu denize değdi; serpintiler savurarak kıyıya koşut ilerliyor, kıyıya yaklaşmıyor.${n ? ` ${n} kişi kıyıdan izliyor.` : ""}` };
    return { kisa: `Bugün açıkta su hortumu · ${saatYaz(o.bas)}`, uzun: `Saat ${saatte(temas)} ${A.in} yaklaşık ${m} metre açığında bir su hortumu denize değdi. Yaklaşık ${sure} dakika kıyıya koşut ilerledi, kıyıya ulaşmadan incelip koptu ve dağıldı.${izle}` };
  }

  return {
    kur, update, canli, yazi,
    ses: (minute) => (K && minute >= K.o.bas && minute <= K.o.son ? { ruzgar: 0.3 * durum((minute - K.o.bas) * 60).karar } : null),
    seyirci: { r0: 2, r1: 14, isR: 450, uzak: 3.5, // odak ~200 m açıkta: uzaklık sınırları ona göre geniş
       kiyida: true, en: 30, tavirlar: ["cek", "goster", "sasir", "cek", "goster", "konus"] },
  };
}
