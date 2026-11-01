// Parite testi için JS simülasyonunun çıktısını JSON olarak basar:
// node web/tests/parity_vectors.mjs <gün> <gelişim düzeyi | inf> <kullanıcı adı>...
// node web/tests/parity_vectors.mjs saat   (stdin: {"unix": [...], "gunler": [...], "yerel": [[gün, dakika], ...]})
// server/tests/test_parity.py bunu Python çıktısıyla karşılaştırır.
import { readFileSync, writeSync } from "node:fs";
import * as sim from "../src/sim.js";

sim.setCatalog(JSON.parse(readFileSync(new URL("../../data/catalog.json", import.meta.url), "utf8")));

const [dayArg, levelArg, ...handles] = process.argv.slice(2);
if (dayArg === "saat") {
  // Saat ve takvim: yaz saati geçişleri, gece yarısı sınırları, tatiller.
  const input = JSON.parse(readFileSync(0, "utf8"));
  writeSync(1, JSON.stringify({
    unix: input.unix.map((u) => [sim.tzOffset(u), sim.dayOf(u), sim.minuteOf(u)]),
    gunler: input.gunler.map((d) => [sim.weekday(d), sim.holidayOf(d), sim.civilFromDays(d)]),
    yerel: input.yerel.map(([d, m]) => sim.unixOf(d, m)),
  }));
  process.exit(0);
}
const day = Number(dayArg);
sim.setTown(levelArg === "inf" ? Infinity : Number(levelArg));
const out = handles.map((handle, i) => {
  const n = i + 1;
  const r = { handle, seed: sim.seedOf(handle), slot: n * 977, arrived_day: day - (n % 60) };
  // Bazılarına yorum isteği: kadrolu ama istenebilir (polis) ve mahalleye bağlı (muhtar) meslekler.
  if (n % 7 === 3) r.overrides = { meslek: n % 2 ? "polis" : "muhtar" };
  else if (n % 11 === 5) r.overrides = { meslek: n % 2 ? "okul_muduru" : "hakim" };
  const plans = [];
  for (let d = day; d < day + 7; d++) plans.push(sim.dayPlan(r, d));
  return {
    seed: r.seed,
    address: sim.addressText(r.slot),
    job: sim.job(r).id,
    dream: sim.dreamJob(r).id,
    workplace: sim.workplace(r).name,
    title: sim.title(r, day),
    pet: sim.pet(r, day),
    hobby: sim.hobby(r).id,
    look: sim.look(r),
    plans,
  };
});
process.stdout.write(JSON.stringify(out));
