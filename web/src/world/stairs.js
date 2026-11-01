// Çift kollu (sahanlıklı) bina merdiveni: apartman çekirdeği (interior.js) ve iş yeri çekirdeği (workinterior.js)
// aynı merdiveni kullanır. İlk kol önden arkaya yarım kata çıkar, arkada sahanlık, ikinci kol arkadan öne üst kata.
// Taş basamak (açık), rıht (koyu), burunda kaymaz şerit; ikinci kolun altında eğimli taşıyıcı döşeme; her kolda
// eğime paralel, basamak burnundan 90 cm yukarıda ahşap tutamaklı korkuluk ve basamak başına metal dikme, kol
// başlarında baba; duvar tarafında konsollu tırabzan.
import * as THREE from "three";

const TREAD = "#e8e2d6", RISER = "#cbc3b4", NOSE = "#7d776e", SLAB = "#d9d2c6", RAIL = "#7a5638", METAL = { metalness: 0.55, roughness: 0.35 };

/**
 * add(w, h, d, lx, ly, lz, color, rot, opts): yerel kutu ekleyici (ly taban; opts.geo verilirse ly geometri kökü).
 * o: { xa, xb (kol merkezleri), zFront, zBack (kolların ön ve arka ucu; zBack < zFront), land (sahanlık derinliği),
 *      H (kat yüksekliği), steps (kol başına), w (kol genişliği), upper (ikinci kol çizilsin mi) }
 */
export function doubleStair(add, o) {
  const { xa, xb, zFront, zBack, land = 1.0, H, steps = 9, w = 1.0, upper = true } = o;
  const half = H / 2, rise = half / steps, run = (zFront - zBack) / steps, L = zFront - zBack;
  const ang = Math.atan2(half, L), slopeLen = Math.hypot(half, L);
  const inner = Math.sign(xb - xa); // kuyu (iki kol arası) xa'dan xb'ye doğru
  // İlk kol: dolu basamaklar (rıht rengi gövde + taş basamak + burun şeridi), önden arkaya yükselir.
  for (let i = 0; i < steps; i++) {
    const y = rise * (i + 1), z = zFront - (i + 0.5) * run;
    add(w, y - 0.035, run, xa, 0, z, RISER);
    add(w, 0.035, run + 0.025, xa, y - 0.035, z + 0.0125, TREAD);
    add(w - 0.04, 0.012, 0.035, xa, y - 0.004, z + run / 2 - 0.005, NOSE, 0, { shadow: false });
  }
  // Sahanlık: iki kolu kaplar, kalın döşeme ve önde burun şeridi.
  const sx0 = Math.min(xa, xb) - w / 2, sx1 = Math.max(xa, xb) + w / 2;
  add(sx1 - sx0, 0.2, land, (sx0 + sx1) / 2, half - 0.2, zBack - land / 2, SLAB);
  add(sx1 - sx0, 0.03, land, (sx0 + sx1) / 2, half - 0.03, zBack - land / 2, TREAD);
  add(Math.abs(xb - xa) + w - 0.04, 0.012, 0.035, (sx0 + sx1) / 2, half - 0.004, zBack - 0.02, NOSE, 0, { shadow: false });
  if (upper) {
    // İkinci kol: eğimli taşıyıcı döşeme (altı düz), üstünde basamaklar arkadan öne yükselir.
    // Döşeme basamakların alt köşelerinden geçen çizginin 8 cm altında; kol öne doğru yükseldiği için eğim −ang.
    const soffit = new THREE.BoxGeometry(w, 0.16, slopeLen).rotateX(-ang);
    add(w, 0.16, slopeLen, xb, 0.75 * H - rise / 2 - 0.1, (zFront + zBack) / 2, SLAB, 0, { geo: soffit });
    for (let i = 0; i < steps; i++) {
      const y = half + rise * (i + 1), z = zBack + (i + 0.5) * run;
      add(w, rise + 0.02, run, xb, y - rise - 0.02, z, RISER);
      add(w, 0.035, run + 0.025, xb, y - 0.035, z - 0.0125, TREAD);
      add(w - 0.04, 0.012, 0.035, xb, y - 0.004, z - run / 2 + 0.005, NOSE, 0, { shadow: false });
    }
  }
  // Korkuluklar: kuyu tarafında her kolun kenarında (eğime paralel tutamak, basamak başına dikme), sahanlık
  // kenarında yatay; duvar tarafında konsollu tırabzan.
  const railLine = (x, y0, z0, y1, z1, posts) => {
    const len = Math.hypot(y1 - y0, z1 - z0), a = Math.atan2(y1 - y0, z0 - z1);
    const g = new THREE.BoxGeometry(0.06, 0.05, len).rotateX(a);
    add(0.06, 0.05, len, x, (y0 + y1) / 2 + 0.9, (z0 + z1) / 2, RAIL, 0, { geo: g, shadow: false });
    // Dikme basamak üstünden tutamağın altına kadar: tutamak burun çizgisini izler (basamak ortasında çizgi
    // basamak üstünden yarım rıht aşağıda), dikme o kadar kısa olur, ucu tutamaktan taşmaz.
    for (const [py, pz] of posts) add(0.022, 0.9 - rise / 2 - 0.03, 0.022, x, py, pz, "#3a3f47", 0, { mat: METAL, shadow: false });
  };
  const xi1 = xa + inner * (w / 2 - 0.05), xi2 = xb - inner * (w / 2 - 0.05);
  const posts1 = [], posts2 = [];
  for (let i = 0; i < steps; i++) {
    posts1.push([rise * (i + 1), zFront - (i + 0.5) * run]);
    posts2.push([half + rise * (i + 1), zBack + (i + 0.5) * run]);
  }
  railLine(xi1, 0, zFront, half, zBack, posts1);
  // Kol başı babası (altta) ve sahanlıkta dönüş babası.
  add(0.09, 1.0, 0.09, xi1, 0, zFront - 0.05, RAIL);
  add(0.09, 1.0, 0.09, (xi1 + xi2) / 2, half, zBack - land + 0.06, RAIL);
  // Sahanlığın kuyu kenarı (iki kol arası boşluğa bakan kısa kenar).
  add(0.06, 0.05, land - 0.1, (xi1 + xi2) / 2, half + 0.9, zBack - land / 2, RAIL, 0, { shadow: false });
  if (upper) {
    railLine(xi2, half, zBack, H, zFront, posts2);
    add(0.09, 1.0, 0.09, xi2, H, zFront - 0.05, RAIL);
  }
  // Duvar tarafı tırabzanı (dikmesiz, kısa konsollarla duvara bağlı).
  const wallRail = (x, y0, z0, y1, z1) => {
    const len = Math.hypot(y1 - y0, z1 - z0), a = Math.atan2(y1 - y0, z0 - z1);
    add(0.05, 0.05, len, x, (y0 + y1) / 2 + 0.88, (z0 + z1) / 2, RAIL, 0, { geo: new THREE.CylinderGeometry(0.025, 0.025, len, 6).rotateX(Math.PI / 2).rotateX(a), shadow: false });
    for (const t of [0.2, 0.8]) add(0.03, 0.03, 0.08, x - inner * 0.04, y0 + (y1 - y0) * t + 0.86, z0 + (z1 - z0) * t, "#3a3f47", 0, { mat: METAL, shadow: false });
  };
  wallRail(xa - inner * (w / 2 - 0.06), 0, zFront, half, zBack);
  if (upper) wallRail(xb + inner * (w / 2 - 0.06), half, zBack, H, zFront);
}
