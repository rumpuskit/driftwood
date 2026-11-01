// Mahalle bölgelerinin (island.js zones) önceden hesaplanmış kopyası: web/src/world/zones.json. Bölgeler nüfustan
// bağımsız ve deterministik; site her açılışta hesaplamasın diye dosyadan okunur (≈150 ms kazanç).
//   node web/tests/zones.mjs           # dosya hesapla aynı mı? (CI ve test_parity.py; değilse çıkış kodu 1)
//   node web/tests/zones.mjs --yaz     # island.js ya da katalog değiştiyse dosyayı yeniden yaz
import { readFileSync, writeFileSync } from "node:fs";
import * as sim from "../src/sim.js";

sim.setCatalog(JSON.parse(readFileSync(new URL("../../data/catalog.json", import.meta.url), "utf8")));
const I = await import("../src/world/island.js");
const fresh = I.computeZones(sim.cap("mahalle_per_ada"), (m) => sim.housingOf(m).tip)
  .map(({ m, tip, hw, ox, oz, t, n, cx, cz, r, road, s, side }) => ({ m, tip, hw, ox, oz, t, n, cx, cz, r, road, s, side }));
const file = new URL("../src/world/zones.json", import.meta.url);
const text = JSON.stringify(fresh);
if (process.argv.includes("--yaz")) {
  writeFileSync(file, text + "\n");
  console.log(`zones.json yazıldı: ${fresh.length} bölge`);
} else {
  const saved = readFileSync(file, "utf8").trim();
  if (saved !== text) {
    console.error("zones.json güncel değil: node web/tests/zones.mjs --yaz");
    process.exit(1);
  }
  console.log(`zones.json güncel (${fresh.length} bölge)`);
}
