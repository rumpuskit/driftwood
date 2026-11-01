// Driftwood Gazetesi: adanın o günkü hâli, yalnız gerçek veriden (sakin listesi, gelişim tablosu, simülasyon).
// Uydurma yok: her satır sitede doğrulanabilir; satıra dokununca kamera oraya/o sakine gider.
import * as sim from "./sim.js";
import { FERRY } from "./world/ferry.js";
import { TIKTOK } from "./config.js";
import { clockText, dateText, longDateText, num, plural } from "./fmt.js";

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
  out.push(el("p", `${longDateText(day)} · Issue ${num(day - first + 1)}`, "muted"));

  // Manşet: günün olayı.
  const th = people.theme;
  if (th) {
    out.push(el("h3", "Top story"));
    const p = el("p");
    const b = el("span", th.ad, "link");
    b.addEventListener("click", () => d.flyToTheme());
    p.append(b, th.bas != null ? ` · ${clockText(th.bas)}–${clockText(th.son)}` : "");
    out.push(p);
  }

  // Günün saklı nesnesi (ipucu bölge, bulunduysa söyler).
  const sk = d.sakli?.();
  if (sk?.ad) {
    out.push(el("h3", "Hidden object"));
    out.push(el("p", sk.bulundu ? `You found today's hidden object (${sk.ad}). A new one is hidden tomorrow.` : `Hidden on the island today: ${sk.ad}. Look ${sk.area}, zoom in and tap it.`));
  }

  // Bugün ve dün gelenler.
  const named = residents.map((r, i) => [r, i]).filter(([r]) => !r.hidden);
  const bugun = named.filter(([r]) => r.arrived_day === day), dun = named.filter(([r]) => r.arrived_day === day - 1);
  out.push(el("h3", "The island today"));
  const N = residents.length, nToday = residents.filter((r) => r.arrived_day === day).length;
  out.push(el("p", `${N === 1 ? "1 resident lives" : `${num(N)} residents live`} on the island. ${plural(nToday, "person", "people")} moved in today, ${num(residents.filter((r) => r.arrived_day === day - 1).length)} yesterday.`));
  const people1 = (list, title) => {
    if (!list.length) return;
    const p = el("p");
    p.append(el("b", `${title}: `));
    list.slice(0, 24).forEach(([r, i], n) => {
      const a = el("span", d.at(r), "link");
      a.addEventListener("click", () => d.select(i));
      p.append(n ? ", " : "", a);
    });
    if (list.length > 24) p.append(` and ${num(list.length - 24)} more`);
    out.push(p);
  };
  people1(bugun, "Moved in today");
  people1(dun, "Moved in yesterday");

  // Açılanlar ve sıradaki.
  const ops = openings(residents);
  const recent = ops.filter((o) => o.day != null && day - o.day <= 7).reverse();
  out.push(el("h3", "Just opened"));
  if (recent.length) {
    const ul = el("ul", null, "liste");
    for (const o of recent) {
      const li = el("li");
      li.append(el("b", o.day === day ? "Today" : o.day === day - 1 ? "Yesterday" : dateText(o.day)));
      const span = el("span");
      span.append(`${o.ad} · opened when `);
      const a = el("span", d.at(o.r), "link");
      const idx = residents.indexOf(o.r);
      a.addEventListener("click", () => d.select(idx));
      span.append(a, ` became resident #${num(o.nufus)}`);
      li.append(span);
      ul.append(li);
    }
    out.push(ul);
  } else out.push(el("p", "No new places opened this week.", "muted"));
  const next = sim.cat().gelisim.find((g) => g.nufus > sim.townLevel());
  if (next) out.push(el("p", `Next: ${next.ad} · ${plural(Math.max(1, next.nufus - residents.length), "more resident")} (opens at ${num(next.nufus)}).`));

  // Program.
  out.push(el("h3", "Today's schedule"));
  const prog = el("ul", null, "liste");
  const row = (t, s) => { const li = el("li"); li.append(el("b", t), el("span", s)); prog.append(li); };
  row(clockText(FERRY.first), `First ferry; every ${FERRY.period} minutes, last one at ${clockText(FERRY.last)}`);
  if (d.zeplin) row(clockText(540), `The Driftwood Blimp flies in and heads back at ${clockText(1320)}`);
  if (th?.bas != null) row(clockText(th.bas), th.ad);
  if (world.pitch) row(clockText(1170), `Driftwood Gulls game${sim.weekday(day) >= 5 ? ` (also at ${clockText(900)})` : ""}`);
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
    out.push(el("h3", "Jobs"));
    out.push(el("p", top.map(([n, c]) => `${n} (${num(c)})`).join(", ") + "."));
    if (secen) out.push(el("p", `${plural(secen, "resident")} picked their own job with a comment.`, "muted"));
  }

  // Haftanın sakini (her pazartesi değişir).
  if (named.length) {
    const week = Math.floor((day + 3) / 7);
    const [r, i] = named[sim.roll(week, "haftanin_sakini") % named.length];
    out.push(el("h3", "Resident of the week"));
    const p = el("p");
    const a = el("span", d.at(r), "link");
    a.addEventListener("click", () => d.select(i));
    p.append(a, ` · ${sim.title(r, day)} · loves ${people.hobbies[i].ad.toLowerCase()} · ${sim.streetAddress(r.slot)}, ${sim.mahalleName(sim.addressParts(r.slot).mahalle)}`);
    out.push(p);
  }

  // Ada tarihi.
  if (ops.length) {
    out.push(el("h3", "Island history"));
    const ul = el("ul", null, "liste");
    for (const o of [...ops].reverse()) {
      const li = el("li");
      li.append(el("b", o.day != null ? dateText(o.day) : "—"));
      li.append(el("span", `${o.ad} (${plural(o.nufus, "resident")})`));
      ul.append(li);
    }
    out.push(ul);
  }
  if (d.tur) {
    const p = el("p");
    const a = el("span", "Take the island tour (30 seconds)", "link");
    a.addEventListener("click", () => d.tur());
    p.append(a);
    out.push(el("h3", "Get to know the island"), p);
  }
  out.push(el("p", `Everyone who follows @${TIKTOK} on TikTok moves to the island. To pick your job, comment something like “job: fisherman” on one of our videos.`, "muted"));
  return out;
}
