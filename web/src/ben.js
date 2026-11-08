// "Benim evim": yorumla doğrulama ve doğrulanmış sakinin seçimleri. TikTok girişi yok: site 4 haneli kod verir,
// kişi kodu videolarımızdan birine yorum olarak yazar; yorumlar saatte bir okunur, kod o ada bağlanınca bu cihaz
// o sakin olarak seçim yapabilir. Serbest metin yok: her seçim hazır listeden.
import { api } from "./api.js";
import { TIKTOK } from "./config.js";
import { ETKINLIK } from "./world/etkinlik.js";
import { CICEK_AD, SECENEK, dateKey, setPrefs } from "./tercih.js";
import * as sim from "./sim.js";

export function createBen({ sayfa, residents, people, ui, today, onPrefs, secim, prefsData }) {
  let state = null, poll = null, busy = false, prefill = "", degistir = false;
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const button = (text, cls, onClick) => { const b = el("button", text, cls); b.addEventListener("click", onClick); return b; };
  const idxOf = (h) => residents.findIndex((r) => r.handle === h);

  async function refresh() {
    try { state = await api.ben(); } catch (e) { state = { hata: e.message }; }
    render();
  }

  function render() {
    if (!sayfa.isOpen) return;
    clearInterval(poll); poll = null;
    if (!state) return sayfa.set(el("p", "Loading…", "muted"));
    if (state.hata) return sayfa.set([el("p", `Couldn't connect right now (${state.hata}). Please try again in a bit.`, "muted"), button("Try again", "ana", refresh)]);
    if (state.handle) return sayfa.set(verified());
    if (state.bekleyen && !degistir) {
      poll = setInterval(refresh, 60000); // yorumlar saatte bir okunur; açık kaldıkça dakikada bir bakılır
      return sayfa.set(pending());
    }
    return sayfa.set(start());
  }

  function start() {
    const out = [];
    // Süresi dolan kod (7 gün içinde yorumu göremedik): kişi neden başa döndüğünü bilsin, aynı adla tek dokunuşla yeniden alsın.
    const eski = state?.suresi_doldu;
    if (eski && !degistir) {
      out.push(el("p", `The code you got for @${eski} expired; we never saw your comment. Just get a new code with the same name and post it again.`));
      if (!prefill) prefill = eski;
    }
    out.push(el("p", "Is that home on the island yours? Verify it's you, then pick your wall and couch colors, your window flowers and your pet's name, and decide what you do today and who you meet."));
    out.push(el("p", `How it works: type your username and we'll give you a 4-digit code. Post the code as a comment on any recent @${TIKTOK} video. No password, no login.`, "muted"));
    const input = el("input");
    Object.assign(input, { type: "text", placeholder: "@username", autocomplete: "off", spellcheck: false, inputMode: "text", value: prefill ? "@" + prefill : "" });
    input.className = "ben-input";
    input.style.cssText = "width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--glass-2);color:var(--ink);font:800 15px Nunito,system-ui,sans-serif;margin:8px 0";
    const msg = el("p", "", "muted");
    const go = button("Get my code", "ana", async () => {
      const h = input.value.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._]{2,24}$/.test(h)) { msg.textContent = "Type your username exactly as on TikTok (letters, numbers, periods, underscores)."; return; }
      if (busy) return;
      busy = true;
      try { await api.baslat(h); degistir = false; prefill = ""; await refresh(); } catch (e) { msg.textContent = e.message; } finally { busy = false; }
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go.click(); });
    out.push(input, go, msg);
    if (degistir && state?.bekleyen) out.push(button("Back to my code", "secim", () => { degistir = false; render(); }));
    return out;
  }

  function pending() {
    const { kod, handle, gorulen, kalan_gun } = state.bekleyen;
    const out = [];
    out.push(el("p", `Your code for @${handle}:`));
    out.push(el("p", kod, "kod"));
    out.push(el("p", `Comment it from @${handle} on any @${TIKTOK} video. The code just has to be in your comment: "code ${kod}" or only "${kod}".`));
    // Kod başka bir hesaptan yazılmış görüldüyse kişi neden eşleşmediğini bilsin.
    if (gorulen) out.push(el("p", `We saw your code posted from @${gorulen}, but it was made for @${handle}. Post it from @${handle}, or fix the username.`));
    const gun = kalan_gun ?? 7;
    out.push(el("p", `We read comments every hour, but TikTok can be slow to show them to us: it usually matches within a few hours. When it does, this page opens by itself (this device remembers, even if you close the page). The code is good for ${gun} more ${gun === 1 ? "day" : "days"}; no need to get a new one.`, "muted"));
    out.push(el("p", "Post it as a new comment on the video, not as a reply to another comment; we see those faster.", "muted"));
    if (idxOf(handle) < 0) out.push(el("p", "This name isn't on the island right now. Follow on TikTok first; your home is ready at the next move-in.", "muted"));
    out.push(button("Check now", "secim", refresh), button("Change username", "secim", () => { degistir = true; prefill = handle; render(); }));
    return out;
  }

  /** Seçim düğmeleri: değeri kaydeder, hemen uygular. */
  async function save(patch, note) {
    try {
      const r = await api.tercih(patch);
      state.tercih = r.tercih;
      prefsData[state.handle] = r.tercih;
      setPrefs(prefsData, residents);
      onPrefs(patch);
      if (note) ui.toast(note);
    } catch (e) { ui.toast(e.message); }
    render();
  }

  function swatches(key, title) {
    const box = el("div", null, "renkler");
    for (const c of SECENEK[key]) {
      const b = el("button", null, "renk" + (state.tercih[key] === c ? " on" : ""));
      b.style.background = c;
      b.setAttribute("aria-label", `${title} ${c}`);
      b.addEventListener("click", () => save({ [key]: state.tercih[key] === c ? null : c }, "Saved"));
      box.append(b);
    }
    return [el("h3", title), box];
  }

  function chips(list, current, label, onPick) {
    const box = el("div");
    for (const v of list) box.append(button(label(v), "secim" + (current === v ? " on" : ""), () => onPick(current === v ? null : v)));
    return box;
  }

  function verified() {
    const h = state.handle, i = idxOf(h), t = state.tercih ?? {};
    const out = [];
    out.push(el("p", `You're verified as @${h}.`));
    if (i < 0) { out.push(el("p", "You don't have a home on the island yet. Follow on TikTok; once you move in at the next move-in, your choices show up in your home.", "muted")); }
    else {
      const go = button("Go to my home", "ana", () => { sayfa.close(); ui.select(i); });
      const share = button("Share my card", "secim", () => { sayfa.close(); ui.select(i); setTimeout(() => document.querySelector("#card-actions button:last-child")?.click(), 1200); });
      out.push(go, share);
    }
    out.push(...swatches("duvar", "Wall color"), ...swatches("koltuk", "Couch"), ...swatches("perde", "Curtains"));
    out.push(el("h3", "Window flowers"), chips(SECENEK.cicek.filter((c) => c !== "yok"), t.cicek, (c) => CICEK_AD[c], (c) => save({ cicek: c }, c ? "Flowers are in your window" : "Flowers removed")));
    const pet = i >= 0 ? sim.pet(residents[i], today()) : null;
    if (pet) {
      out.push(el("h3", `${pet}'s name`));
      out.push(chips(SECENEK.evcil_ad, t.evcil_ad, (n) => n, (n) => save({ evcil_ad: n }, n ? `Your ${pet.toLowerCase()} is now ${n}` : null)));
    } else out.push(el("p", "You don't have a pet. Comment “pet: cat” on one of our videos and it arrives at the next move-in; then you can pick its name here.", "muted"));

    // Bugün: etkinlik ve buluşma (yalnız bugüne geçerli).
    const g = t.gun?.tarih === dateKey(today()) ? t.gun : {};
    out.push(el("h3", "What should I do today?"));
    out.push(el("p", "Your character does it if it fits the hours you're out (stargazing, for example, happens at night).", "muted"));
    const setGun = (patch) => save({ gun: { tarih: dateKey(today()), etkinlik: g.etkinlik ?? null, bulusma: g.bulusma ?? null, ...patch } }, "Today's plan saved");
    out.push(chips(SECENEK.etkinlik, g.etkinlik, (id) => ETKINLIK[id]?.ad.replace(/,.*$/, "") ?? id, (id) => setGun({ etkinlik: id })));
    out.push(el("h3", "Who should I meet?"));
    out.push(el("p", "If you both pick each other, you'll be out at the same place at the same time.", "muted"));
    const friends = residents.filter((r) => r.handle && r.handle !== h).map((r) => r.handle).sort();
    const sel = el("select");
    sel.style.cssText = "width:100%;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--glass-2);color:var(--ink);font:800 14px Nunito,system-ui,sans-serif";
    sel.append(new Option("Nobody", ""), ...friends.map((f) => new Option("@" + f, f, false, g.bulusma === f)));
    sel.addEventListener("change", () => setGun({ bulusma: sel.value || null }));
    out.push(sel);
    if (g.bulusma) {
      const other = people.residents.findIndex((r) => r.handle === g.bulusma);
      const mutual = other >= 0 && people.meet?.[i] === other;
      out.push(el("p", mutual ? `@${g.bulusma} picked you too: you're meeting up today.` : `You'll meet if @${g.bulusma} picks you too. Let them know.`, "muted"));
    }

    // Seçim (açıksa): adaylık ve oy siteden de verilir; sunucu yorumdakiyle aynı kuralı uygular.
    const s = secim?.();
    if (s?.durum === "acik") {
      out.push(el("h3", "Mayoral election"));
      out.push(button("I'm running", "secim", async () => { try { await api.secim({ aday: true }); ui.toast("You're signed up as a candidate; you'll be on the list after the next count"); } catch (e) { ui.toast(e.message); } }));
      for (const [ad] of (s.adaylar ?? []).filter(([a]) => a)) out.push(button(`Vote: @${ad}`, "secim", async () => { try { await api.secim({ oy: ad }); ui.toast("Vote saved; it's counted at the next count"); } catch (e) { ui.toast(e.message); } }));
    }
    out.push(el("p", " "));
    out.push(button("Sign out on this device", "secim", async () => { await api.cikis(); state = null; refresh(); }));
    return out;
  }

  return {
    /** handle: karttaki "This is me" ile gelindiyse ad kutusu dolu gelir. */
    open(handle = "") {
      prefill = handle;
      sayfa.open("My home", el("p", "Loading…", "muted"));
      refresh();
    },
    /** Sayfa yüklenince: doğrulanmışsa sessizce durumu al (kart ve menü için). */
    async peek() { if (api.hasToken()) { try { state = await api.ben(); } catch {} } return state; },
    get handle() { return state?.handle ?? null; },
  };
}
