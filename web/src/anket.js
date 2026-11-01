// Anketler: yarının günün olayı (sabit günler hariç: cami açıksa cuma namazı, cumartesi sinema, pazar keyfi) ve
// cumartesi sinemasının film türü (haftalık). Cihaz başına bir oy (değiştirilebilir); sonuçlar herkese açık.
// Kazanan olay ertesi gün adada gerçekten olur (etkinlik.js dayTheme), film türü perdede oynar.
import { api } from "./api.js";
import { FILM_AD, FILM_SECENEK, TEMA_AD, TEMA_SECENEK, dateKey, setVotes, weekKey } from "./tercih.js";
import * as sim from "./sim.js";
import { DAYS, num, plural } from "./fmt.js";

export function createAnket({ sayfa, today, world, toast, onVote }) {
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

  /** Yarın sabit bir gün mü (oylama yok)? etkinlik.js dayTheme ile aynı kural. */
  function fixedTomorrow() {
    const wd = sim.weekday(today() + 1);
    if (wd === 4 && world.workplaces.cami?.some(Boolean)) return "Tomorrow is Friday: community lunch at the church hall";
    if (wd === 5) return "Tomorrow is Saturday: beach movie night";
    if (wd === 6) return "Tomorrow is Sunday: picnics and walks";
    return null;
  }

  function poll(id, title, note, options, labels, data) {
    const out = [el("h3", title)];
    if (note) out.push(el("p", note, "muted"));
    const counts = data?.sonuc ?? {}, mine = data?.benim ?? null;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const o of options) {
      const n = counts[o] ?? 0;
      const b = el("button", `${labels[o]}${n ? ` · ${num(n)}` : ""}`, "secim" + (mine === o ? " on" : ""));
      b.addEventListener("click", async () => {
        try { await api.oy(id, o); onVote?.(id, o); toast("Vote saved"); await open(true); } catch (e) { toast(e.message); }
      });
      out.push(b);
      if (total) { const bar = el("div", null, "cubuk"); const fill = el("i"); fill.style.width = `${Math.round((n / total) * 100)}%`; bar.append(fill); out.push(bar); }
    }
    out.push(el("p", total ? `${plural(total, "vote")} so far.` : "No votes yet. Be the first.", "muted"));
    return out;
  }

  async function open(keep = false) {
    if (!keep) sayfa.open("Poll", el("p", "Loading…", "muted"));
    const t = today(), tema = `tema:${dateKey(t + 1)}`, film = `film:${weekKey(t)}`;
    let res = {};
    try { res = await api.anket([tema, film, `tema:${dateKey(t)}`]); setVotes(res); } catch (e) { return sayfa.set([el("p", `Couldn't connect right now (${e.message}).`, "muted")]); }
    const out = [];
    const fixed = fixedTomorrow();
    if (fixed) out.push(el("h3", "Tomorrow"), el("p", `${fixed}. Voting on the day's event opens for Mondays through Thursdays.`, "muted"));
    else out.push(...poll(tema, `What should happen on the island tomorrow (${DAYS[sim.weekday(t + 1)]})?`, "Vote until midnight; the winner happens on the island tomorrow.", TEMA_SECENEK, TEMA_AD, res[tema]));
    out.push(...poll(film, "What should play at Saturday movie night?", "This week's vote; it plays on the screen at the beach Saturday evening.", FILM_SECENEK, FILM_AD, res[film]));
    sayfa.set(out);
  }

  return { open: () => open(false) };
}
