// Yapı denetimi (sayısal, kare almaz): (1) bina taban izlerinin birbirine girmesi; (2) konut iç mekânları: her türden
// N bina, her kat; eşya ↔ duvar, kapı kasası, kapı kanadı, merdiven çekirdeği; (3) iş yeri iç mekânları: her türden bir
// bina, her kat; eşya ↔ dış kabuk ve iç duvar. Bina, iç mekân ya da yerleşim değişikliğinden sonra çalıştır; hepsi 0
// olmalı. kalite.mjs (alçak açılı kareler) ve iç mekân kareleriyle birlikte.
//   cd web && npx vite build && npx vite preview --port 4183   (ayrı terminalde)
//   cd video && node yapi-denetle.mjs [sorgu, varsayılan "gelisim=20000&nufus=20000"] [N, varsayılan 12]
//   F=<regex> yalnız eşleşen türler (konut: "cottage|apartments", iş yeri: "garaj|ahir"), V=1 daha çok örnek.
import { chromium } from "playwright-core";
const q = process.argv[2] ?? "gelisim=20000&nufus=20000", N = Number(process.argv[3] ?? 12);
const b = await chromium.launch({ channel: "chrome", args: ["--use-angle=metal", "--enable-gpu"] });
const p = await b.newPage({ viewport: { width: 300, height: 300 } });
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.goto(`http://localhost:4183/?denetle&saat=14:00&api=yok&${q}`);
await p.waitForFunction(() => globalThis.__ada?.ui, null, { timeout: 180000 });
const res = await p.evaluate(({ N, F, V }) => {
  const A = globalThis.__ada, W = A.world, D = A.people.dollhouse, P = Object.getPrototypeOf(D);
  const lim = V ? 40 : 6;

  // (1) Taban izleri (döndürülmüş dikdörtgenler, ayırma ekseni sınaması; 5 cm'ye kadar değme sayılmaz).
  const B = W.buildings.filter((bb) => Number.isFinite(bb.x));
  const corners = (bb) => { const r = bb.rot ?? 0, c = Math.cos(r), s = Math.sin(r), hw = bb.w / 2, hd = bb.d / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [bb.x + x * c + z * s, bb.z - x * s + z * c]); };
  const axes = (Q) => [0, 1].map((k) => { const dx = Q[k + 1][0] - Q[k][0], dz = Q[k + 1][1] - Q[k][1], L = Math.hypot(dx, dz); return [dx / L, dz / L]; });
  const pen = (Q, R) => { let m = Infinity; for (const [ax, az] of [...axes(Q), ...axes(R)]) { const pr = (S) => S.map(([x, z]) => x * ax + z * az); const a = pr(Q), c = pr(R);
    m = Math.min(m, Math.min(Math.max(...a), Math.max(...c)) - Math.max(Math.min(...a), Math.min(...c))); } return m; };
  const C = B.map(corners), taban = [];
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], c = B[j];
    if (Math.hypot(a.x - c.x, a.z - c.z) > (Math.hypot(a.w, a.d) + Math.hypot(c.w, c.d)) / 2) continue;
    const o = pen(C[i], C[j]);
    if (o > 0.05) taban.push(`${o.toFixed(2)} m: ${a.kind} ${a.address} ⟂ ${c.kind} ${c.address}`);
  }

  // İç mekân kutularını kaydetmek için Dollhouse yardımcılarını sar (kategori: hangi yardımcının içinde eklendi).
  let cat = "esya", rec = null;
  const wrap = (name, c) => { const f = P[name]; P[name] = function (...a) { const o = cat; cat = c; try { return f.apply(this, a); } finally { cat = o; } }; };
  wrap("_wallX", "duvar"); wrap("_wallZ", "duvar"); wrap("_shell", "kabuk"); wrap("_buildCore", "cekirdek");
  const ad = P._adder;
  P._adder = function (bb, y0) { const add = ad.call(this, bb, y0); return (w, h, d, lx, ly, lz, color, rot = 0, opts = {}) => {
    const m = add(w, h, d, lx, ly, lz, color, rot, opts);
    if (rec && !opts.geo && Math.abs(Math.sin(rot * 2)) < 0.05) {
      let c = cat;
      if (c === "esya" && color === "#6b4a35" && h === 2.1) c = "kanat";
      else if (c === "esya" && h >= 2.0 && Math.min(w, d) <= 0.16 && ly === 0) c = "kasa";
      else if (c === "esya" && Math.abs(ly - 2.1) < 0.01 && h === 0.08) c = "kasa";
      // İş yerinde iç duvar: yerden yükselen ince kesik duvar (kısa parçalar da: kapı boşluğunun yanındaki uç).
      else if (c === "esya" && !rec.konut && h >= 1.0 && Math.min(w, d) <= 0.16 && (Math.max(w, d) >= 1.4 || Math.abs(h - 1.05) < 0.01) && ly <= 0.07) c = "duvar";
      const sw = Math.abs(Math.cos(rot)) < 0.5;
      rec.push({ c, x0: lx - (sw ? d : w) / 2, x1: lx + (sw ? d : w) / 2, z0: lz - (sw ? w : d) / 2, z1: lz + (sw ? w : d) / 2, y0: ly, y1: ly + h, color, w, h, d });
    }
    return m; }; };
  const kat = (bb, f, konut, t) => {
    rec = []; rec.konut = konut; D.open(bb, f); const R = rec; rec = null; t.kat++; t.kutu += R.length;
    const hard = R.filter((x) => x.c !== "esya" && x.c !== "cekirdek" && (!konut || x.y1 - x.y0 > 0.3));
    const soft = R.filter((x) => (x.c === "esya" || x.c === "cekirdek") && x.y1 - x.y0 > 0.04 && x.y1 > 0.1);
    for (const s of soft) for (const h of hard) {
      const ox = Math.min(s.x1, h.x1) - Math.max(s.x0, h.x0), oz = Math.min(s.z1, h.z1) - Math.max(s.z0, h.z0), oy = Math.min(s.y1, h.y1) - Math.max(s.y0, h.y0);
      if (ox > 0.04 && oz > 0.04 && oy > 0.04) {
        const tt = `${s.c}>${h.c}`; t.tur[tt] = (t.tur[tt] ?? 0) + 1; t.sorun++;
        if (t.ornek.length < lim) t.ornek.push(`${bb.address} k${f}: ${s.c} ${s.color} ${s.w}x${s.h}x${s.d} @(${((s.x0 + s.x1) / 2).toFixed(2)},${((s.z0 + s.z1) / 2).toFixed(2)}) ⟂ ${h.c} ${+h.w.toFixed(2)}x${+h.h.toFixed(2)}x${+h.d.toFixed(2)} @(${((h.x0 + h.x1) / 2).toFixed(2)},${((h.z0 + h.z1) / 2).toFixed(2)})`);
      }
    }
  };
  const yeni = () => ({ bina: 0, kat: 0, kutu: 0, sorun: 0, tur: {}, ornek: [] });

  // (2) Konutlar: türüne göre N bina (adaya yayılmış).
  const konut = {}, isyeri = {};
  const gk = {};
  W.buildings.forEach((bb, i) => { if (!bb.daireler) return; const k = `${bb.house ?? "apt"} ${bb.w}x${bb.d}`; if (F && !new RegExp(F).test(k)) return; (gk[k] ??= []).push(i); });
  for (const [k, ids] of Object.entries(gk)) {
    const t = (konut[k] = yeni()), n = Math.min(N, ids.length);
    for (let j = 0; j < n; j++) { const bb = W.buildings[ids[Math.floor((j * ids.length) / n)]]; t.bina++; for (let f = 0; f < bb.floors; f++) kat(bb, f, true, t); }
  }
  // (3) İş yerleri: türün ve ölçünün ilk binası.
  const gi = {};
  W.buildings.forEach((bb, i) => { if (bb.daireler || !Number.isFinite(bb.x)) return; const k = `${bb.kind} ${bb.w}x${bb.d} ${bb.floors}`; if (F && !new RegExp(F).test(k)) return; gi[k] ??= i; });
  for (const [k, i] of Object.entries(gi)) { const bb = W.buildings[i], t = (isyeri[k] = yeni()); t.bina++; for (let f = 0; f < (bb.icKat ?? bb.floors); f++) kat(bb, f, false, t); }
  D.close();
  return { taban, konut, isyeri };
}, { N, F: process.env.F, V: process.env.V });
let toplam = res.taban.length;
console.log(`== taban izi: ${res.taban.length} çakışan bina çifti`);
for (const e of res.taban.slice(0, process.env.V ? 40 : 6)) console.log("   ", e);
for (const [ad, grup] of [["konut", res.konut], ["iş yeri", res.isyeri]]) {
  for (const [k, t] of Object.entries(grup)) {
    toplam += t.sorun;
    if (!t.sorun && !process.env.V) continue;
    console.log(`== ${ad} ${k}: ${t.bina} bina, ${t.kat} kat, ${t.kutu} kutu, ${t.sorun} çakışma`, JSON.stringify(t.tur));
    for (const e of t.ornek) console.log("   ", e);
  }
  const n = Object.values(grup);
  console.log(`== ${ad}: ${n.length} tür, ${n.reduce((a, t) => a + t.kat, 0)} kat, ${n.reduce((a, t) => a + t.kutu, 0)} kutu, ${n.reduce((a, t) => a + t.sorun, 0)} çakışma`);
}
console.log(toplam ? `SORUN: ${toplam}` : "TEMİZ");
await b.close();
process.exit(toplam ? 1 : 0);
