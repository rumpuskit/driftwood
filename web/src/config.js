// Yayın ayarları: hesap adı, veri adresi, taşınma saatleri.
import { minuteOf } from "./sim.js";
// Sakinlerin geldiği TikTok hesabı (kullanıcı adı, @ olmadan).
// Değişirse burası, public/gizlilik.html ve Mac'teki takip aracının config.toml'u ([driftwood] hesap)
// birlikte güncellenir.
export const TIKTOK = "driftwoodlive";
export const TIKTOK_URL = `https://www.tiktok.com/@${TIKTOK}`;
export const VERI_URL = "https://driftwood-data.rumpuskit.com/sakinler.json";
// Taşınmalar (ABD Doğu saati, yaz saatli; sim.js kuralı): Mac'teki takip aracı bu saatlerde tam listeyi sunucuya
// yollar (config.toml tasinma_saatleri ile aynı olmalı). Mac uyuyorsa taşınma uyanınca yapılır.
export const TASINMA_SAATLERI = [9, 15, 21];

/** Saat (0-23) → "9 AM", "3 PM". */
export const hourText = (s) => `${s % 12 || 12} ${s < 12 ? "AM" : "PM"}`;

/** Sıradaki taşınmanın saati ("3 PM" ya da "tomorrow 9 AM"), ada saatiyle. */
export function nextMove(now = Date.now()) {
  const h = minuteOf(now / 1000) / 60;
  const next = TASINMA_SAATLERI.find((s) => s > h);
  return next != null ? hourText(next) : "tomorrow " + hourText(TASINMA_SAATLERI[0]);
}

// Driftwood Blimp'nin yan reklam alanları (giydirme). gorsel: 3:1 PNG/JPG (önerilen 3000×1000), public/ altında
// ("zeplin/reklam.png") ya da CORS izinli tam adres; null ise Driftwood'nın kendi tanıtımı. ad: kartta görünen
// reklamveren adı. İki yana da aynı görsel okunur yönde basılır; gece alan ışıklı parlar.
export const ZEPLIN_REKLAM = { gorsel: null, ad: null };

// Kayıt API'si (yorumla doğrulama, tercihler, anketler, saklı nesne): sakin listesiyle aynı Worker.
// Yerel denemede ?api=yerel → wrangler dev (localhost:8809).
export const KAYIT_URL = typeof location !== "undefined" && new URLSearchParams(location.search).get("api") === "yerel"
  ? "http://localhost:8809" : VERI_URL.replace(/\/sakinler\.json$/, "");
