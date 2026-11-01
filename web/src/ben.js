// "Benim evim": yorumla doğrulama ve doğrulanmış sakinin seçimleri. TikTok girişi yok: site 4 haneli kod verir,
// kişi kodu videolarımızdan birine yorum olarak yazar; yorumlar saatte bir okunur, kod o ada bağlanınca bu cihaz
// o sakin olarak seçim yapabilir. Serbest metin yok: her seçim hazır listeden.
import { api } from "./api.js";
import { TIKTOK } from "./config.js";
import { ETKINLIK } from "./world/etkinlik.js";
import { CICEK_AD, SECENEK, dateKey, setPrefs } from "./tercih.js";
import * as sim from "./sim.js";

export function createBen({ sayfa, residents, people, ui, today, onPrefs, secim, prefsData }) {
  let state = null, poll = null, busy = false, prefill = "";
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
    if (!state) return sayfa.set(el("p", "Yükleniyor…", "muted"));
    if (state.hata) return sayfa.set([el("p", `Şu an bağlanılamadı (${state.hata}). Biraz sonra yeniden dene.`, "muted"), button("Yeniden dene", "ana", refresh)]);
    if (state.handle) return sayfa.set(verified());
    if (state.bekleyen) {
      poll = setInterval(refresh, 60000); // yorumlar saatte bir okunur; açık kaldıkça dakikada bir bakılır
      return sayfa.set(pending());
    }
    return sayfa.set(start());
  }

  function start() {
    const out = [];
    out.push(el("p", "Adadaki evin senin mi? Kendini doğrula: evinin duvar ve koltuk rengini, pencerendeki çiçekleri, evcilinin adını seç; bugün ne yapacağına ve kiminle buluşacağına sen karar ver."));
    out.push(el("p", `Nasıl: kullanıcı adını yaz, sana 4 haneli bir kod verelim; kodu @${TIKTOK} videolarımızdan birine yorum olarak yaz. Şifre ya da giriş yok.`, "muted"));
    const input = el("input");
    Object.assign(input, { type: "text", placeholder: "@kullanıcıadı", autocomplete: "off", spellcheck: false, inputMode: "text", value: prefill ? "@" + prefill : "" });
    input.className = "ben-input";
    input.style.cssText = "width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--glass-2);color:var(--ink);font:800 15px Nunito,system-ui,sans-serif;margin:8px 0";
    const msg = el("p", "", "muted");
    const go = button("Kod al", "ana", async () => {
      const h = input.value.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._]{2,24}$/.test(h)) { msg.textContent = "Kullanıcı adını TikTok'taki gibi yaz (harf, rakam, nokta, alt çizgi)."; return; }
      if (busy) return;
      busy = true;
      try { await api.baslat(h); await refresh(); } catch (e) { msg.textContent = e.message; } finally { busy = false; }
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go.click(); });
    out.push(input, go, msg);
    return out;
  }

  function pending() {
    const { kod, handle } = state.bekleyen;
    const out = [];
    out.push(el("p", `@${handle} için kodun:`));
    out.push(el("p", kod, "kod"));
    out.push(el("p", `@${TIKTOK} videolarımızdan herhangi birine yorum olarak şunu yaz:`));
    out.push(el("p", `kod ${kod}`, "kod"));
    out.push(el("p", "Yorumlar saatte bir okunur; kodun eşleşince bu ekran kendiliğinden açılır (sayfayı kapatsan da bu cihaz hatırlar). Kod 48 saat geçerli.", "muted"));
    if (idxOf(handle) < 0) out.push(el("p", "Bu ad şu an adada görünmüyor: önce TikTok'ta takip et, sıradaki taşınmada evin hazırlanır.", "muted"));
    out.push(button("Şimdi bak", "secim", refresh), button("Vazgeç", "secim", async () => { await api.cikis(); state = null; refresh(); }));
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
      b.addEventListener("click", () => save({ [key]: state.tercih[key] === c ? null : c }, "Kaydedildi"));
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
    out.push(el("p", `@${h} olarak doğrulandın.`));
    if (i < 0) { out.push(el("p", "Adada henüz evin yok: TikTok'ta takip et, sıradaki taşınmada yerleşince seçimlerin evine işlenir.", "muted")); }
    else {
      const go = button("Evime git", "ana", () => { sayfa.close(); ui.select(i); });
      const share = button("Kartımı paylaş", "secim", () => { sayfa.close(); ui.select(i); setTimeout(() => document.querySelector("#card-actions button:last-child")?.click(), 1200); });
      out.push(go, share);
    }
    out.push(...swatches("duvar", "Duvar rengi"), ...swatches("koltuk", "Koltuk"), ...swatches("perde", "Perde"));
    out.push(el("h3", "Pencere çiçekleri"), chips(SECENEK.cicek.filter((c) => c !== "yok"), t.cicek, (c) => CICEK_AD[c], (c) => save({ cicek: c }, c ? "Çiçekler pencerende" : "Çiçekler kaldırıldı")));
    const pet = i >= 0 ? sim.pet(residents[i], today()) : null;
    if (pet) {
      out.push(el("h3", `${pet} adı`));
      out.push(chips(SECENEK.evcil_ad, t.evcil_ad, (n) => n, (n) => save({ evcil_ad: n }, n ? `${pet} artık ${n}` : null)));
    } else out.push(el("p", "Evcil hayvanın yok; videolarımıza “evcil: kedi” yazarsan sıradaki taşınmada gelir, sonra adını buradan seçersin.", "muted"));

    // Bugün: etkinlik ve buluşma (yalnız bugüne geçerli).
    const g = t.gun?.tarih === dateKey(today()) ? t.gun : {};
    out.push(el("h3", "Bugün ne yapayım?"));
    out.push(el("p", "Dışarı çıktığın saatlere uyarsa karakterin bunu yapar (ör. yıldız izlemek gece olur).", "muted"));
    const setGun = (patch) => save({ gun: { tarih: dateKey(today()), etkinlik: g.etkinlik ?? null, bulusma: g.bulusma ?? null, ...patch } }, "Bugünün planı kaydedildi");
    out.push(chips(SECENEK.etkinlik, g.etkinlik, (id) => ETKINLIK[id]?.ad.replace(/,.*$/, "") ?? id, (id) => setGun({ etkinlik: id })));
    out.push(el("h3", "Kiminle buluşayım?"));
    out.push(el("p", "İkiniz de birbirinizi seçerseniz dışarıda aynı saatlerde aynı yerde olursunuz.", "muted"));
    const friends = residents.filter((r) => r.handle && r.handle !== h).map((r) => r.handle).sort();
    const sel = el("select");
    sel.style.cssText = "width:100%;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--glass-2);color:var(--ink);font:800 14px Nunito,system-ui,sans-serif";
    sel.append(new Option("Kimse", ""), ...friends.map((f) => new Option("@" + f, f, false, g.bulusma === f)));
    sel.addEventListener("change", () => setGun({ bulusma: sel.value || null }));
    out.push(sel);
    if (g.bulusma) {
      const other = people.residents.findIndex((r) => r.handle === g.bulusma);
      const mutual = other >= 0 && people.meet?.[i] === other;
      out.push(el("p", mutual ? `@${g.bulusma} de seni seçti: bugün buluşuyorsunuz.` : `@${g.bulusma} seni seçerse buluşursunuz. Ona söyle!`, "muted"));
    }

    // Seçim (açıksa): adaylık ve oy siteden de verilir; sunucu yorumdakiyle aynı kuralı uygular.
    const s = secim?.();
    if (s?.durum === "acik") {
      out.push(el("h3", "Belediye başkanlığı seçimi"));
      out.push(button("Adayım", "secim", async () => { try { await api.secim({ aday: true }); ui.toast("Adaylığın kaydedildi; sıradaki okumada listeye girer"); } catch (e) { ui.toast(e.message); } }));
      for (const [ad] of (s.adaylar ?? []).filter(([a]) => a)) out.push(button(`Oyum @${ad}`, "secim", async () => { try { await api.secim({ oy: ad }); ui.toast("Oyun kaydedildi; sıradaki okumada sayılır"); } catch (e) { ui.toast(e.message); } }));
    }
    out.push(el("p", " "));
    out.push(button("Bu cihazda çıkış yap", "secim", async () => { await api.cikis(); state = null; refresh(); }));
    return out;
  }

  return {
    /** handle: karttaki "Bu benim" ile gelindiyse ad kutusu dolu gelir. */
    open(handle = "") {
      prefill = handle;
      sayfa.open("Benim evim", el("p", "Yükleniyor…", "muted"));
      refresh();
    },
    /** Sayfa yüklenince: doğrulanmışsa sessizce durumu al (kart ve menü için). */
    async peek() { if (api.hasToken()) { try { state = await api.ben(); } catch {} } return state; },
    get handle() { return state?.handle ?? null; },
  };
}
