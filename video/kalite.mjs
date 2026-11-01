// Kalite taraması: adanın her yerinden alçak açılı kareler (yol türleri, meydanlar, iskeleler, rıhtım boyu,
// binaların tabanı, rastgele kara noktaları). Arazi/yol/kıyı değişikliğinden sonra çalıştır, kareleri gözle incele.
//   cd web && npx vite build && npx vite preview --port 4183   (ayrı terminalde)
//   cd video && node kalite.mjs <çıktı klasörü> [sorgu, varsayılan "gelisim=3000&nufus=3000"]
//   F="rihtim|iskele" yalnız o türler; N=20 ilk 20 nokta. Her nokta iki açıdan: <sıra>-0.png, <sıra>-1.png.
// "CONTEXT LOST" satırı WebGL bağlamının düştüğünü gösterir (ağır sahnede telefonda da olabilir: incele).
import { chromium } from "playwright-core";
const out = process.argv[2], q = process.argv[3] ?? "gelisim=3000&nufus=3000";
const b = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const p = await b.newPage({ viewport: { width: 420, height: 420 } });
await p.goto(`http://localhost:4183/?denetle&saat=12:30&api=yok&${q}`);
await p.waitForFunction(() => globalThis.__ada?.ui, null, { timeout: 180000 });
await p.evaluate(() => { const c = document.querySelector("canvas"); c.addEventListener("webglcontextlost", () => console.log("CONTEXT LOST")); c.addEventListener("webglcontextrestored", () => console.log("CONTEXT RESTORED")); });
p.on("console", (m) => /CONTEXT|rror/.test(m.text()) && console.log("KONSOL", m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.addStyleTag({ content: "body > *:not(canvas):not(#app) { display: none !important } #dock,#hud,#sol,#navbtns,#minimap,#arama { display:none !important }" });
await p.waitForTimeout(3000);
const pts = await p.evaluate(() => {
  const W = globalThis.__ada.world, out = [];
  const byType = {};
  for (const r of W.roads) (byType[r.type] ??= []).push(r);
  for (const [t, rs] of Object.entries(byType)) {
    const n = Math.min(8, rs.length);
    for (let k = 0; k < n; k++) {
      const r = rs[Math.floor((k * rs.length) / n)], pt = r.points[Math.floor(r.points.length / 2)];
      const a = r.points[Math.max(0, Math.floor(r.points.length / 2) - 1)];
      out.push({ ad: `yol:${t}`, x: pt[0], z: pt[1], dir: Math.atan2(pt[0] - a[0], pt[1] - a[1]) });
    }
  }
  for (const pl of W.plazas.filter((_, i) => i % 3 === 0).slice(0, 14)) {
    const x = pl.x ?? (pl.x0 + pl.x1) / 2, z = pl.z ?? (pl.z0 + pl.z1) / 2;
    if (Number.isFinite(x)) out.push({ ad: `meydan:${pl.kind ?? ""}`, x, z, dir: 0.7 });
  }
  // Binalar: tabanın araziye oturuşu (düzlük dışındakiler öncelikli).
  const bs = W.buildings.filter((b) => Number.isFinite(b.x));
  const out2 = bs.filter((b) => !b.daireler).concat(bs.filter((b) => b.daireler).filter((_, i) => i % 40 === 0));
  for (const b of out2.slice(0, 40)) out.push({ ad: `bina:${b.kind ?? ""}`, x: b.x, z: b.z, dir: (b.rot ?? 0) + 0.3, r: Math.max(b.w ?? 10, b.d ?? 10) * 0.9 + 8 });
  // Rastgele kara noktaları (sabit tohum).
  let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let k = 0, n = 0; k < 4000 && n < 30; k++) {
    const x = -2600 + rnd() * 5000, z = -1500 + rnd() * 2800;
    if (W.sdf(x, z) < -5) { out.push({ ad: "arazi", x, z, dir: rnd() * 6.28 }); n++; }
  }
  for (const pi of W.piers) out.push({ ad: "iskele", x: (pi.x0 + pi.x1) / 2, z: pi.z0 + 3, dir: 0.4 });
  for (let x = -950; x <= 750; x += 170) {
    let z = 0; for (; z < 1400 && W.sdf(x, z) < 0; z += 2);
    out.push({ ad: "rihtim", x, z: z - 2, dir: 1.2 });
  }
  return out;
});
console.log(pts.length, "nokta");
let i = 0;
for (const pt of pts.filter((q) => !process.env.F || new RegExp(process.env.F).test(q.ad)).slice(0, Number(process.env.N ?? 999))) {
  for (const [k, da] of [[0, 0.9], [1, 2.6]]) {
    await p.evaluate(({ pt, da }) => {
      const A = globalThis.__ada, W = A.world, a = pt.dir + da;
      const gy = W.groundY(pt.x, pt.z);
      A.controls.target.set(pt.x, gy + 0.8, pt.z);
      const R = pt.r ?? 16; A.camera.position.set(pt.x + Math.sin(a) * R, gy + 4.5 + R * 0.1, pt.z + Math.cos(a) * R);
      A.camera.lookAt(A.controls.target); A.controls.update?.();
    }, { pt, da });
    await p.waitForTimeout(450);
    await p.screenshot({ path: `${out}/${String(i).padStart(3, "0")}-${k}.png` });
  }
  console.log(String(i).padStart(3, "0"), pt.ad, Math.round(pt.x), Math.round(pt.z));
  i++;
}
await b.close();
