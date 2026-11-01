// Menü (sağdaki ızgara düğmesi): gazete, fotoğraf modu, benim evim, anket, ada turu, saklı nesne ipucu.
// Ortak açılır sayfa (#sayfa) burada yönetilir; sayfaların içeriğini kendi modülleri kurar (open(sayfa)).
// Fotoğraf modu: arayüz gizlenir, saat kaydırıcısı yalnız bakılan anı değiştirir, çekilen kare bantla paylaşılır.
import { svg } from "./icons.js";
import { photoFrame, shareCanvas } from "./paylas.js";
import * as sim from "./sim.js";
import { DAYS, clockText } from "./fmt.js";

const $ = (id) => document.getElementById(id);

export function createMenu({ capture, minute, today, shiftView, toast }) {
  // Sekme çubuğu (#dock): telefonda altta, masaüstünde aramanın üstünde; etiketli düğmeler ve "yeni" noktası.
  const items = [];
  const dock = $("dock");
  function render() {
    dock.replaceChildren(...items.filter((it) => !it.hidden?.()).map((it) => {
      const b = document.createElement("button");
      b.type = "button";
      // İki etiket: tam (geniş ekran) ve kısa (telefon sekme çubuğu); hangisinin görüneceğine CSS karar verir.
      b.innerHTML = `<span class="ic">${svg(it.icon)}</span><span class="lb"></span><span class="ks"></span>`;
      b.querySelector(".lb").textContent = typeof it.label === "function" ? it.label() : it.label;
      b.querySelector(".ks").textContent = it.short ?? b.querySelector(".lb").textContent;
      if (it.badge?.()) b.classList.add("yeni");
      b.setAttribute("aria-label", b.querySelector(".lb").textContent);
      b.addEventListener("click", () => { it.run(); render(); });
      return b;
    }));
  }

  // --- ortak sayfa ---
  const sayfa = {
    open(title, body) {
      $("sayfa-baslik").textContent = title;
      $("sayfa-govde").replaceChildren(...(Array.isArray(body) ? body : [body]));
      $("sayfa").hidden = false;
      $("sayfa-govde").scrollTop = 0;
    },
    set(body) { $("sayfa-govde").replaceChildren(...(Array.isArray(body) ? body : [body])); },
    close() { $("sayfa").hidden = true; },
    get isOpen() { return !$("sayfa").hidden; },
  };
  $("sayfa-kapat").addEventListener("click", () => sayfa.close());
  $("sayfa").addEventListener("click", (e) => { if (e.target === $("sayfa")) sayfa.close(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") { sayfa.close(); if (foto) exitPhoto(); } });

  // --- fotoğraf modu ---
  let foto = false;
  const slider = $("foto-saat"), label = $("foto-saat-yazi");
  function enterPhoto() {
    foto = true;
    document.body.classList.add("foto");
    $("foto-bar").hidden = false;
    slider.value = String(Math.round(minute()));
    label.textContent = clockText(minute());
  }
  function exitPhoto() {
    foto = false;
    document.body.classList.remove("foto");
    $("foto-bar").hidden = true;
    $("foto-onizleme").hidden = true;
    shiftView(null); // gerçek saate dön
  }
  slider.addEventListener("input", () => {
    const m = Number(slider.value);
    shiftView(m);
    label.textContent = clockText(m);
  });
  let lastShot = null;
  $("foto-cek").addEventListener("click", () => {
    const w = Math.min(2160, Math.round(innerWidth * Math.min(2, devicePixelRatio)));
    const h = Math.round(w * (innerHeight / innerWidth));
    const shot = capture(null, w, h);
    const day = today();
    lastShot = photoFrame(shot, `${DAYS[sim.weekday(day)]} ${clockText(minute())}`);
    $("foto-img").src = lastShot.toDataURL("image/jpeg", 0.9);
    $("foto-onizleme").hidden = false;
  });
  $("foto-yeniden").addEventListener("click", () => { $("foto-onizleme").hidden = true; });
  $("foto-paylas").addEventListener("click", async () => {
    if (!lastShot) return;
    const res = await shareCanvas(lastShot, { name: `driftwood-foto-${Date.now()}`, text: "A moment on Driftwood Island", url: "https://driftwood.rumpuskit.com" });
    if (res.startsWith("indirildi")) toast("Photo downloaded");
  });
  $("foto-kapat").addEventListener("click", exitPhoto);

  return {
    sayfa,
    /** Sekme ekler: { icon, label, short?, run, hidden?, badge? }. */
    add(item) { items.push(item); render(); },
    /** Görünürlük ya da "yeni" noktası değişince. */
    refresh: render,
    enterPhoto,
    get photo() { return foto; },
  };
}
