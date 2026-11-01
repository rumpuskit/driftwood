// Anketler: yarının günün olayı (sabit günler hariç: cami açıksa cuma namazı, cumartesi sinema, pazar keyfi) ve
// cumartesi sinemasının film türü (haftalık). Cihaz başına bir oy (değiştirilebilir); sonuçlar herkese açık.
// Kazanan olay ertesi gün adada gerçekten olur (etkinlik.js dayTheme), film türü perdede oynar.
import { api } from "./api.js";
import { FILM_AD, FILM_SECENEK, TEMA_AD, TEMA_SECENEK, dateKey, setVotes, weekKey } from "./tercih.js";
import * as sim from "./sim.js";

const DAYS = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"];

export function createAnket({ sayfa, today, world, toast, onVote }) {
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

  /** Yarın sabit bir gün mü (oylama yok)? etkinlik.js dayTheme ile aynı kural. */
  function fixedTomorrow() {
    const wd = sim.weekday(today() + 1);
    if (wd === 4 && world.workplaces.cami?.some(Boolean)) return "Yarın cuma namazı var";
    if (wd === 5) return "Yarın cumartesi: plajda açık hava sineması";
    if (wd === 6) return "Yarın pazar keyfi: piknik ve yürüyüş";
    return null;
  }

  function poll(id, title, note, options, labels, data) {
    const out = [el("h3", title)];
    if (note) out.push(el("p", note, "muted"));
    const counts = data?.sonuc ?? {}, mine = data?.benim ?? null;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const o of options) {
      const n = counts[o] ?? 0;
      const b = el("button", `${labels[o]}${n ? ` · ${n}` : ""}`, "secim" + (mine === o ? " on" : ""));
      b.addEventListener("click", async () => {
        try { await api.oy(id, o); onVote?.(id, o); toast("Oyun kaydedildi"); await open(true); } catch (e) { toast(e.message); }
      });
      out.push(b);
      if (total) { const bar = el("div", null, "cubuk"); const fill = el("i"); fill.style.width = `${Math.round((n / total) * 100)}%`; bar.append(fill); out.push(bar); }
    }
    out.push(el("p", total ? `Toplam ${total} oy.` : "Henüz oy yok: ilk oyu sen ver.", "muted"));
    return out;
  }

  async function open(keep = false) {
    if (!keep) sayfa.open("Anket", el("p", "Yükleniyor…", "muted"));
    const t = today(), tema = `tema:${dateKey(t + 1)}`, film = `film:${weekKey(t)}`;
    let res = {};
    try { res = await api.anket([tema, film, `tema:${dateKey(t)}`]); setVotes(res); } catch (e) { return sayfa.set([el("p", `Şu an bağlanılamadı (${e.message}).`, "muted")]); }
    const out = [];
    const fixed = fixedTomorrow();
    if (fixed) out.push(el("h3", "Yarın"), el("p", `${fixed}; günün olayı oylaması pazartesi–perşembe günleri için açılır.`, "muted"));
    else out.push(...poll(tema, `Yarın (${DAYS[sim.weekday(t + 1)]}) adada ne olsun?`, "Gece yarısına kadar oy ver; en çok oyu alan yarın adada olur.", TEMA_SECENEK, TEMA_AD, res[tema]));
    out.push(...poll(film, "Cumartesi sinemasında ne oynasın?", "Bu haftanın oylaması; cumartesi akşamı plajdaki perdede oynar.", FILM_SECENEK, FILM_AD, res[film]));
    sayfa.set(out);
  }

  return { open: () => open(false) };
}
