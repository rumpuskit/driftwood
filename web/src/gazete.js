// Driftwood Gazetesi: adanın o günkü hâli, yalnız gerçek veriden (sakin listesi, gelişim tablosu, simülasyon).
// Uydurma yok: her satır sitede doğrulanabilir; satıra dokununca kamera oraya/o sakine gider.
import * as sim from "./sim.js";
import { FERRY } from "./world/ferry.js";

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const fmt = new Intl.NumberFormat("tr-TR");

export function dateText(day) {
  const d = new Date(day * 86400000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Gelişim adımlarının açıldığı gün: N. sakinin geldiği gün (o sırada gelen kişi açtı). */
export function openings(residents) {
  const bySlot = new Map(residents.map((r) => [r.slot, r]));
  const peak = residents.reduce((m, r) => Math.max(m, r.slot + 1), 0);
  return sim.cat().gelisim.filter((g) => g.nufus <= Math.max(peak, sim.townLevel())).map((g) => {
    const r = bySlot.get(g.nufus - 1) ?? null;
    return { ...g, r, day: r?.arrived_day ?? null };
  });
}

/**
 * Gazete sayfasının öğeleri. d: { residents, people, world, today, theme, select(i), flyTo(x,z,d), at(r) }.
 */
export function gazete(d) {
  const { residents, people, world } = d;
  const day = d.today();
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const out = [];
  const first = residents.reduce((m, r) => Math.min(m, r.arrived_day), day);
  out.push(el("p", `${DAYS[sim.weekday(day)]}, ${dateText(day)} · Sayı ${fmt.format(day - first + 1)}`, "muted"));

  // Manşet: günün olayı.
  const th = people.theme;
  if (th) {
    out.push(el("h3", "Manşet"));
    const p = el("p");
    const b = el("span", th.ad, "link");
    b.addEventListener("click", () => d.flyToTheme());
    p.append(b, th.bas != null ? ` · ${sim.formatMinute(th.bas)}–${sim.formatMinute(th.son)}` : "");
    out.push(p);
  }

  // Günün saklı nesnesi (ipucu bölge, bulunduysa söyler).
  const sk = d.sakli?.();
  if (sk?.ad) {
    out.push(el("h3", "Saklı nesne"));
    out.push(el("p", sk.bulundu ? `Bugünkü ${sk.ad} bulundu. Yarın yenisi saklanacak.` : `Bugün adada ${sk.ad} saklı: ${sk.area} bak, yakınlaş ve ona dokun.`));
  }

  // Bugün ve dün gelenler.
  const named = residents.map((r, i) => [r, i]).filter(([r]) => !r.hidden);
  const bugun = named.filter(([r]) => r.arrived_day === day), dun = named.filter(([r]) => r.arrived_day === day - 1);
  out.push(el("h3", "Ada bugün"));
  out.push(el("p", `Adada ${fmt.format(residents.length)} kişi yaşıyor. Bugün ${fmt.format(residents.filter((r) => r.arrived_day === day).length)}, dün ${fmt.format(residents.filter((r) => r.arrived_day === day - 1).length)} kişi taşındı.`));
  const people1 = (list, title) => {
    if (!list.length) return;
    const p = el("p");
    p.append(el("b", `${title}: `));
    list.slice(0, 24).forEach(([r, i], n) => {
      const a = el("span", d.at(r), "link");
      a.addEventListener("click", () => d.select(i));
      p.append(n ? ", " : "", a);
    });
    if (list.length > 24) p.append(` ve ${fmt.format(list.length - 24)} kişi daha`);
    out.push(p);
  };
  people1(bugun, "Bugün gelenler");
  people1(dun, "Dün gelenler");

  // Açılanlar ve sıradaki.
  const ops = openings(residents);
  const recent = ops.filter((o) => o.day != null && day - o.day <= 7).reverse();
  out.push(el("h3", "Açılanlar"));
  if (recent.length) {
    const ul = el("ul", null, "liste");
    for (const o of recent) {
      const li = el("li");
      li.append(el("b", o.day === day ? "Bugün" : o.day === day - 1 ? "Dün" : dateText(o.day).replace(/ \d{4}$/, "")));
      const span = el("span");
      span.append(`${o.ad} · ${o.nufus}. sakin `);
      const a = el("span", d.at(o.r), "link");
      const idx = residents.indexOf(o.r);
      a.addEventListener("click", () => d.select(idx));
      span.append(a, " ile");
      li.append(span);
      ul.append(li);
    }
    out.push(ul);
  } else out.push(el("p", "Bu hafta yeni bir yer açılmadı.", "muted"));
  const next = sim.cat().gelisim.find((g) => g.nufus > sim.townLevel());
  if (next) out.push(el("p", `Sırada ${next.ad}: ${fmt.format(next.nufus - residents.length)} kişi daha lazım (${next.nufus}. sakinde).`));

  // Program.
  out.push(el("h3", "Bugünün programı"));
  const prog = el("ul", null, "liste");
  const row = (t, s) => { const li = el("li"); li.append(el("b", t), el("span", s)); prog.append(li); };
  row(sim.formatMinute(FERRY.first), `İlk vapur; ${FERRY.period} dakikada bir, son sefer ${sim.formatMinute(FERRY.last)}`);
  if (d.zeplin) row("09:00", "Driftwood Blimp adaya geliyor, 22:00'de dönüyor");
  if (th?.bas != null) row(sim.formatMinute(th.bas), th.ad);
  if (world.pitch) row("19:30", `Driftwood Gulls maçı${sim.weekday(day) >= 5 ? " (ayrıca 15:00)" : ""}`);
  out.push(prog);

  // Meslekler.
  const jobs = new Map();
  for (const r of residents) {
    const j = sim.dreamJob(r);
    const name = j.kademeler[1] ?? j.kademeler[0];
    jobs.set(name, (jobs.get(name) ?? 0) + 1);
  }
  const top = [...jobs].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const secen = residents.filter((r) => r.overrides?.meslek).length;
  if (top.length) {
    out.push(el("h3", "Meslekler"));
    out.push(el("p", top.map(([n, c]) => `${fmt.format(c)} ${n.toLocaleLowerCase("tr")}`).join(", ") + "."));
    if (secen) out.push(el("p", `${fmt.format(secen)} kişi mesleğini yorumla kendisi seçti.`, "muted"));
  }

  // Haftanın sakini (her pazartesi değişir).
  if (named.length) {
    const week = Math.floor((day + 3) / 7);
    const [r, i] = named[sim.roll(week, "haftanin_sakini") % named.length];
    out.push(el("h3", "Haftanın sakini"));
    const p = el("p");
    const a = el("span", d.at(r), "link");
    a.addEventListener("click", () => d.select(i));
    p.append(a, ` · ${sim.title(r, day)} · ${people.hobbies[i].ad.toLocaleLowerCase("tr")} seviyor · ${sim.addressText(r.slot).replace(/, Driftwood$/, "")}`);
    out.push(p);
  }

  // Ada tarihi.
  if (ops.length) {
    out.push(el("h3", "Ada tarihi"));
    const ul = el("ul", null, "liste");
    for (const o of [...ops].reverse()) {
      const li = el("li");
      li.append(el("b", o.day != null ? dateText(o.day).replace(/ \d{4}$/, "") : "—"));
      li.append(el("span", `${o.ad} (${o.nufus}. sakin)`));
      ul.append(li);
    }
    out.push(ul);
  }
  if (d.tur) {
    const p = el("p");
    const a = el("span", "Ada turuna çık (30 saniye)", "link");
    a.addEventListener("click", () => d.tur());
    p.append(a);
    out.push(el("h3", "Adayı tanı"), p);
  }
  out.push(el("p", "TikTok'ta @driftwoodlive'yı takip eden adaya taşınır. Mesleğini seçmek için videolarımıza “meslek: balıkçı” gibi yaz.", "muted"));
  return out;
}
