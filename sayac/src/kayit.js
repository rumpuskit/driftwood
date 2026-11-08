// Kayıt: sitenin yazabildiği her şey tek bir Durable Object'te (SQLite). TikTok girişi olmadığı için kimlik
// "yorumla doğrulama"dır: site 4 haneli bir kod verir, kişi kodu videomuza yorum olarak yazar, sunucu yorumu
// okuyunca kodu o kullanıcı adına bağlar (POST /api/onayla, yayın anahtarıyla). Cihaz gizli bir anahtar tutar;
// burada yalnız özeti (SHA-256) saklanır.
//
// Saklananlar: bekleyen kodlar (48 saat), cihaz anahtarı özeti → kullanıcı adı, hazır seçeneklerden ev ve gün
// tercihleri (herkese açık: site evleri buna göre çizer), anket oyları (cihaz kimliğiyle; sonuçlar açık),
// saklı nesneyi bulan cihaz sayısı, siteden verilen seçim oyları (sunucu çeker). IP adresi saklanmaz: yalnız
// kötüye kullanım sınırı için günlük tuzla özeti, o gün boyunca.
import { DurableObject } from "cloudflare:workers";
import { dayOf } from "../../web/src/sim.js";

// Seçenekler sitedeki listelerle aynı (web/src/tercih.js); dışındaki değer reddedilir.
export const SECENEK = {
  duvar: ["#f4efe6", "#f6d9d0", "#dfe9d8", "#d8e4f0", "#efe2c4", "#e6dcef", "#f3e0c9", "#d9e8e6"],
  koltuk: ["#7a8fb8", "#c96f62", "#6f9a72", "#d9a441", "#8a6fb0", "#4f5560"],
  perde: ["#ffffff", "#f2c9cf", "#cfe3f2", "#f5e3a8", "#c9e4c5", "#e0d2f0"],
  cicek: ["yok", "sardunya", "lavanta", "papatya", "begonvil", "kaktus"],
  evcil_ad: ["Biscuit", "Luna", "Max", "Pepper", "Scout", "Maple", "Captain", "Pickles", "Daisy", "Cooper", "Bailey", "Rosie",
    "Buddy", "Ginger", "Oliver", "Mittens", "Sunny", "Peanut", "Shadow", "Cocoa", "Penny", "Tucker", "Willow", "Murphy",
    "Hazel", "Skipper", "Clover", "Gus", "Marley", "Waffles"],
  etkinlik: ["piknik", "tepe_yuruyus", "plaj_yuruyus", "kosu", "gun_batimi", "vapur", "kiyi_balik", "kapi_onu", "yildiz",
    "kahvehane", "kafe", "carsi", "ucurtma", "fotograf", "tas", "meydan_sohbet"],
};
// Anketler: günün olayı (yarın; pazartesi–perşembe günleri) ve haftalık cumartesi filmi.
export const TEMA_SECENEK = ["ucurtma", "gunbatimi", "balik", "temizlik", "yildiz", "tavla", "komsuluk"];
export const FILM_SECENEK = ["komedi", "macera", "korku", "animasyon"];

const HANDLE = /^[a-z0-9._]{2,24}$/;
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3600e3, DAY = 86400e3;
// Kod 7 gün geçerli (8 Kasım: 48 saatte yorumu geç okunan kişinin kodu düşüyordu; kod alanın zorlanmaması öncelik).
const KOD_GUN = 7;

/** Levenshtein uzaklığı: kullanıcı adındaki küçük yazım hatası (sitede "ahmett", TikTok'ta "ahmet"). */
function yakin(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}


async function sha(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
/** Adanın takvim günü (ABD Doğu saati, yaz saatli; sitedeki sim.dayOf ile aynı kural). */
const trDay = (ms = Date.now()) => new Date(dayOf(ms / 1000) * DAY).toISOString().slice(0, 10);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export class Kayit extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bekleyen (kod TEXT PRIMARY KEY, handle TEXT NOT NULL, anahtar TEXT NOT NULL, olusma INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oturum (anahtar TEXT PRIMARY KEY, handle TEXT NOT NULL, olusma INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tercih (handle TEXT PRIMARY KEY, veri TEXT NOT NULL, guncel INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS anket_oy (anket TEXT NOT NULL, cihaz TEXT NOT NULL, secim TEXT NOT NULL, olusma INTEGER NOT NULL, PRIMARY KEY (anket, cihaz));
      CREATE TABLE IF NOT EXISTS bulunan (gun TEXT NOT NULL, cihaz TEXT NOT NULL, PRIMARY KEY (gun, cihaz));
      CREATE TABLE IF NOT EXISTS secim_oy (handle TEXT NOT NULL, tur TEXT NOT NULL, aday TEXT, olusma INTEGER NOT NULL, PRIMARY KEY (handle, tur));
      CREATE TABLE IF NOT EXISTS sinir (anahtar TEXT PRIMARY KEY, n INTEGER NOT NULL, bitis INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS gorulen (kod TEXT PRIMARY KEY, yazan TEXT NOT NULL, zaman INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS biten (anahtar TEXT PRIMARY KEY, handle TEXT NOT NULL, zaman INTEGER NOT NULL);
    `);
  }

  /** Kötüye kullanım sınırı: aynı anahtarla pencere içinde en çok max istek. */
  limit(key, max, windowMs) {
    const now = Date.now();
    const row = this.sql.exec("SELECT n, bitis FROM sinir WHERE anahtar = ?", key).toArray()[0];
    if (!row || row.bitis < now) { this.sql.exec("INSERT OR REPLACE INTO sinir VALUES (?, 1, ?)", key, now + windowMs); return true; }
    if (row.n >= max) return false;
    this.sql.exec("UPDATE sinir SET n = n + 1 WHERE anahtar = ?", key);
    return true;
  }

  async who(request) {
    const tok = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (!/^[0-9a-f]{64}$/.test(tok)) return null;
    const row = this.sql.exec("SELECT handle FROM oturum WHERE anahtar = ?", await sha(tok)).toArray()[0];
    return row?.handle ?? null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const ipKey = await sha(`${request.headers.get("cf-connecting-ip") ?? "?"}|${trDay()}|${this.env.YAYIN_ANAHTARI ?? ""}`);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const now = Date.now();
    // Eskiyen kayıtlar: bekleyen kodlar 7 gün (süresi dolan "biten"e geçer: site kişiye söyler), sınırlar süresi
    // bitince, görülen/biten notları 7 gün.
    this.sql.exec("INSERT OR REPLACE INTO biten SELECT anahtar, handle, ? FROM bekleyen WHERE olusma < ?", now, now - KOD_GUN * DAY);
    this.sql.exec("DELETE FROM bekleyen WHERE olusma < ?", now - KOD_GUN * DAY);
    this.sql.exec("DELETE FROM biten WHERE zaman < ?", now - 7 * DAY);
    this.sql.exec("DELETE FROM gorulen WHERE zaman < ?", now - 7 * DAY);
    this.sql.exec("DELETE FROM sinir WHERE bitis < ?", now);

    if (path === "/api/dogrula" && request.method === "POST") {
      const handle = String(body.handle ?? "").toLowerCase().replace(/^@/, "").trim();
      if (!HANDLE.test(handle)) return json({ hata: "Invalid username" }, 400);
      // Cihaz anahtarı varsa korunur: aynı cihazın eski kodları da geçerli kalır (kişi eski kodu yazmış olabilir).
      const tokIn = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
      let token = /^[0-9a-f]{64}$/.test(tokIn) ? tokIn : null;
      let anahtar = token ? await sha(token) : null;
      if (anahtar) {
        // Aynı ad için zaten kod varsa yenisi verilmez: aynı kod döner, süresi tazelenir.
        const ayni = this.sql.exec("SELECT kod FROM bekleyen WHERE anahtar = ? AND handle = ?", anahtar, handle).toArray()[0];
        if (ayni) {
          this.sql.exec("UPDATE bekleyen SET olusma = ? WHERE kod = ?", now, ayni.kod);
          return json({ kod: ayni.kod, token, handle });
        }
      }
      if (!this.limit(`d:${ipKey}`, 6, HOUR)) return json({ hata: "Too many tries; please try again in a bit" }, 429);
      let kod;
      for (let n = 0; n < 40; n++) {
        kod = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
        if (Number(kod) >= 1900 && Number(kod) <= 2099) continue; // yıl gibi sayılar yorumlarda sık geçer
        if (!this.sql.exec("SELECT 1 FROM bekleyen WHERE kod = ?", kod).toArray().length) break;
      }
      if (!token) { token = rand(32); anahtar = await sha(token); }
      this.sql.exec("INSERT OR REPLACE INTO bekleyen VALUES (?, ?, ?, ?)", kod, handle, anahtar, now);
      this.sql.exec("DELETE FROM biten WHERE anahtar = ?", anahtar);
      return json({ kod, token, handle });
    }
    if (path === "/api/ben" && request.method === "GET") {
      const handle = await this.who(request);
      const tok = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
      const anahtar = /^[0-9a-f]{64}$/.test(tok) ? await sha(tok) : "";
      const bek = handle ? null : this.sql.exec("SELECT kod, handle, olusma FROM bekleyen WHERE anahtar = ? ORDER BY olusma DESC LIMIT 1", anahtar).toArray()[0] ?? null;
      if (bek) {
        // Kod başka bir hesaptan yazılmış görüldüyse kişiye söylenir; kalan gün de.
        bek.gorulen = this.sql.exec("SELECT yazan FROM gorulen WHERE kod = ?", bek.kod).toArray()[0]?.yazan ?? null;
        bek.kalan_gun = Math.max(1, Math.ceil((bek.olusma + KOD_GUN * DAY - now) / DAY));
        delete bek.olusma;
      }
      const biten = handle || bek ? null : this.sql.exec("SELECT handle FROM biten WHERE anahtar = ?", anahtar).toArray()[0]?.handle ?? null;
      const t = handle ? this.sql.exec("SELECT veri FROM tercih WHERE handle = ?", handle).toArray()[0] : null;
      return json({ handle, bekleyen: bek, suresi_doldu: biten, tercih: t ? JSON.parse(t.veri) : {} });
    }
    if (path === "/api/cikis" && request.method === "POST") {
      const tok = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
      if (/^[0-9a-f]{64}$/.test(tok)) { const h = await sha(tok); this.sql.exec("DELETE FROM oturum WHERE anahtar = ?", h); this.sql.exec("DELETE FROM bekleyen WHERE anahtar = ?", h); this.sql.exec("DELETE FROM biten WHERE anahtar = ?", h); }
      return json({ ok: true });
    }
    if (path === "/api/bekleyen-sayi" && request.method === "GET") {
      return json({ n: this.sql.exec("SELECT count(*) AS n FROM bekleyen").toArray()[0].n });
    }
    if (path === "/api/onayla" && request.method === "POST") {
      // Sunucu: yorumlarda görülen [kod, kullanıcı adı] çiftleri. Kod o kullanıcı adına verilmişse bağlanır.
      if (!this.env.YAYIN_ANAHTARI || request.headers.get("authorization") !== `Bearer ${this.env.YAYIN_ANAHTARI}`) return json({ hata: "not allowed" }, 401);
      const out = [];
      // Üçüncü öğe "kesin": yorum açıkça kod yazıyor ("kod 1234" ya da yalnız "1234"); değilse yorumda geçen herhangi
      // bir 4 haneli sayıdır (yalnız tam ad eşleşmesinde bağlanır).
      for (const [kod, h, kesin = true] of Array.isArray(body.ciftler) ? body.ciftler.slice(0, 500) : []) {
        const yazan = String(h).toLowerCase();
        const row = this.sql.exec("SELECT handle, anahtar FROM bekleyen WHERE kod = ?", String(kod)).toArray()[0];
        if (!row || !HANDLE.test(yazan)) continue;
        // Sitede yazılan ad küçük bir yazım hatasıyla farklıysa (en çok 2 harf) kodu yazan gerçek hesaba bağlanır.
        const uygun = row.handle === yazan || (kesin && yakin(row.handle, yazan) <= 2);
        if (!uygun) {
          if (kesin) this.sql.exec("INSERT OR REPLACE INTO gorulen VALUES (?, ?, ?)", String(kod), yazan, now);
          continue;
        }
        this.sql.exec("INSERT OR REPLACE INTO oturum VALUES (?, ?, ?)", row.anahtar, yazan, now);
        this.sql.exec("DELETE FROM gorulen WHERE kod IN (SELECT kod FROM bekleyen WHERE anahtar = ?)", row.anahtar);
        this.sql.exec("DELETE FROM bekleyen WHERE anahtar = ?", row.anahtar);
        this.sql.exec("DELETE FROM biten WHERE anahtar = ?", row.anahtar);
        out.push(yazan);
      }
      return json({ onaylanan: out });
    }
    if (path === "/api/sil" && request.method === "POST") {
      // Sunucu: kaydı silinen (takibi bırakıp 7 gün dönmeyen ya da çıkarılan) sakinlerin tercih, oturum ve oyları.
      if (!this.env.YAYIN_ANAHTARI || request.headers.get("authorization") !== `Bearer ${this.env.YAYIN_ANAHTARI}`) return json({ hata: "not allowed" }, 401);
      let n = 0;
      for (const h of Array.isArray(body.handles) ? body.handles.slice(0, 2000) : []) {
        const k = String(h).toLowerCase();
        n += this.sql.exec("DELETE FROM tercih WHERE handle = ?", k).rowsWritten;
        this.sql.exec("DELETE FROM oturum WHERE handle = ?", k);
        this.sql.exec("DELETE FROM bekleyen WHERE handle = ?", k);
        this.sql.exec("DELETE FROM secim_oy WHERE handle = ?", k);
      }
      return json({ silinen: n });
    }
    if (path === "/api/tercih" && request.method === "POST") {
      const handle = await this.who(request);
      if (!handle) return json({ hata: "Please verify first" }, 401);
      if (!this.limit(`t:${handle}`, 60, HOUR)) return json({ hata: "That was a lot of changes; please try again in a bit" }, 429);
      const old = JSON.parse(this.sql.exec("SELECT veri FROM tercih WHERE handle = ?", handle).toArray()[0]?.veri ?? "{}");
      const v = { ...old };
      for (const k of ["duvar", "koltuk", "perde", "cicek", "evcil_ad"]) {
        if (body[k] === null) delete v[k];
        else if (body[k] != null) { if (!SECENEK[k].includes(body[k])) return json({ hata: `Invalid option: ${k}` }, 400); v[k] = body[k]; }
      }
      if (body.gun !== undefined) {
        // Günün etkinliği ve buluşma: yalnız o güne (Türkiye takvimi) geçerli.
        const g = body.gun;
        if (g === null) delete v.gun;
        else {
          if (!g || !TARIH.test(g.tarih) || (g.tarih !== trDay() && g.tarih !== trDay(now + DAY))) return json({ hata: "Invalid day" }, 400);
          if (g.etkinlik != null && !SECENEK.etkinlik.includes(g.etkinlik)) return json({ hata: "Invalid activity" }, 400);
          const bul = g.bulusma == null ? null : String(g.bulusma).toLowerCase().replace(/^@/, "");
          if (bul != null && (!HANDLE.test(bul) || bul === handle)) return json({ hata: "Invalid meetup" }, 400);
          v.gun = { tarih: g.tarih, ...(g.etkinlik ? { etkinlik: g.etkinlik } : {}), ...(bul ? { bulusma: bul } : {}) };
        }
      }
      this.sql.exec("INSERT OR REPLACE INTO tercih VALUES (?, ?, ?)", handle, JSON.stringify(v), now);
      return json({ ok: true, tercih: v });
    }
    if (path === "/tercihler.json") {
      // Herkese açık: doğrulanmış sakinlerin seçtikleri (site evleri, evcil adlarını ve günlerini buna göre çizer).
      const out = {};
      for (const r of this.sql.exec("SELECT handle, veri FROM tercih").toArray()) out[r.handle] = JSON.parse(r.veri);
      return json({ v: 1, tercih: out });
    }
    if (path === "/api/anket" && request.method === "GET") {
      const cihaz = url.searchParams.get("cihaz") ?? "";
      const ids = (url.searchParams.get("id") ?? "").split(",").filter((x) => /^(tema|film):[0-9W-]{7,10}$/.test(x)).slice(0, 6);
      const out = {};
      for (const id of ids) {
        const rows = this.sql.exec("SELECT secim, count(*) AS n FROM anket_oy WHERE anket = ? GROUP BY secim", id).toArray();
        const mine = this.sql.exec("SELECT secim FROM anket_oy WHERE anket = ? AND cihaz = ?", id, cihaz).toArray()[0]?.secim ?? null;
        out[id] = { sonuc: Object.fromEntries(rows.map((r) => [r.secim, r.n])), benim: mine };
      }
      return json(out);
    }
    if (path === "/api/anket" && request.method === "POST") {
      const id = String(body.id ?? ""), secim = String(body.secim ?? ""), cihaz = String(body.cihaz ?? "");
      if (!/^[0-9a-f]{32}$/.test(cihaz)) return json({ hata: "Invalid device" }, 400);
      const m = id.match(/^(tema):(\d{4}-\d{2}-\d{2})$|^(film):(\d{4}-W\d{2})$/);
      if (!m) return json({ hata: "Invalid poll" }, 400);
      // Günün olayı anketi yalnız ertesi gün için ve o günden önce açık; film anketi haftası boyunca.
      if (m[1] === "tema" && m[2] !== trDay(now + DAY)) return json({ hata: "This poll is closed" }, 400);
      const opts = m[1] === "tema" ? TEMA_SECENEK : FILM_SECENEK;
      if (!opts.includes(secim)) return json({ hata: "Invalid option" }, 400);
      if (!this.limit(`a:${id}:${ipKey}`, 5, DAY)) return json({ hata: "Enough votes from this network for this poll" }, 429);
      this.sql.exec("INSERT OR REPLACE INTO anket_oy VALUES (?, ?, ?, ?)", id, cihaz, secim, now);
      return json({ ok: true });
    }
    if (path === "/api/bulundu") {
      const gun = request.method === "POST" ? String(body.gun ?? "") : url.searchParams.get("gun") ?? "";
      if (!TARIH.test(gun)) return json({ hata: "Invalid day" }, 400);
      if (request.method === "POST") {
        const cihaz = String(body.cihaz ?? "");
        if (!/^[0-9a-f]{32}$/.test(cihaz) || gun !== trDay()) return json({ hata: "Invalid" }, 400);
        if (this.limit(`b:${gun}:${ipKey}`, 5, DAY)) this.sql.exec("INSERT OR IGNORE INTO bulunan VALUES (?, ?)", gun, cihaz);
        this.sql.exec("DELETE FROM bulunan WHERE gun < ?", trDay(now - 40 * DAY));
      }
      return json({ n: this.sql.exec("SELECT count(*) AS n FROM bulunan WHERE gun = ?", gun).toArray()[0].n });
    }
    if (path === "/api/secim" && request.method === "POST") {
      // Siteden adaylık ya da oy (doğrulanmış sakin). Sunucu seçim kurallarını uygular (adada oturma, süre).
      const handle = await this.who(request);
      if (!handle) return json({ hata: "Please verify first" }, 401);
      if (body.aday === true) this.sql.exec("INSERT OR REPLACE INTO secim_oy VALUES (?, 'aday', NULL, ?)", handle, now);
      else {
        const aday = String(body.oy ?? "").toLowerCase().replace(/^@/, "");
        if (!HANDLE.test(aday)) return json({ hata: "Invalid candidate" }, 400);
        this.sql.exec("INSERT OR REPLACE INTO secim_oy VALUES (?, 'oy', ?, ?)", handle, aday, now);
      }
      return json({ ok: true });
    }
    if (path === "/api/secim-oylari" && request.method === "GET") {
      // Sunucu çeker (yayın anahtarıyla): verilen zamandan sonraki adaylık ve oylar.
      if (!this.env.YAYIN_ANAHTARI || request.headers.get("authorization") !== `Bearer ${this.env.YAYIN_ANAHTARI}`) return json({ hata: "not allowed" }, 401);
      const since = Number(url.searchParams.get("since") ?? 0);
      return json({ oylar: this.sql.exec("SELECT handle, tur, aday, olusma FROM secim_oy WHERE olusma > ? ORDER BY olusma", since).toArray() });
    }
    return json({ hata: "not found" }, 404);
  }
}
