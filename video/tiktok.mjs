// TikTok bağlantısı (Login Kit + Content Posting API): günlük videoyu kendi hesabımızın TikTok gelen kutusuna
// taslak olarak gönderir; paylaşma (açıklama, yapay zekâ etiketi) uygulamadan tek dokunuşla yapılır.
// Doğrudan paylaşım (video.publish) incelenmemiş uygulamada yalnız gizli paylaşabildiği için kullanılmıyor.
//
//   node tiktok.mjs baglan          # izin bağlantısı (tarayıcıda aç, @driftwoodlive ile izin ver)
//   node tiktok.mjs kod KOD         # yönlendirme sayfasının (driftwood.rumpuskit.com/tiktok/) gösterdiği kod
//   node tiktok.mjs durum           # bağlı hesap ve belirtecin süresi
//   node tiktok.mjs yukle video.mp4 # taslak olarak gelen kutusuna
//
// Anahtarlar depoda değil: ../secret/tiktok-dev/{client,secret} (git dışı); belirteç aynı klasörde token.json.
import { readFileSync, writeFileSync, existsSync, statSync, openSync, readSync, closeSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../secret/tiktok-dev");
const TOKEN = resolve(DIR, "token.json");
const REDIRECT = "https://driftwood.rumpuskit.com/tiktok/";
const SCOPES = "user.info.basic,video.upload";
const API = "https://open.tiktokapis.com/v2";

const oku = (ad) => readFileSync(resolve(DIR, ad), "utf8").trim();
const anahtar = () => ({ client_key: oku("client"), client_secret: oku("secret") });
const yaz = (veri) => {
  const tmp = TOKEN + ".tmp";
  writeFileSync(tmp, JSON.stringify(veri, null, 1), { mode: 0o600 });
  renameSync(tmp, TOKEN);
};
const durumOku = () => (existsSync(TOKEN) ? JSON.parse(readFileSync(TOKEN, "utf8")) : {});

async function tokenIste(alanlar) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ ...anahtar(), ...alanlar }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`TikTok belirteç hatası: ${data.error ?? res.status} ${data.error_description ?? ""}`.trim());
  const now = Math.floor(Date.now() / 1000);
  const d = durumOku();
  yaz({
    ...d,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? d.refresh_token,
    open_id: data.open_id ?? d.open_id,
    scope: data.scope ?? d.scope,
    expires_at: now + Number(data.expires_in ?? 86400) - 300,
    refresh_expires_at: now + Number(data.refresh_expires_in ?? 0),
  });
}

/** Geçerli erişim belirteci (süresi dolmuşsa yenilenir). */
export async function belirtec() {
  let d = durumOku();
  if (!d.refresh_token) throw new Error("TikTok bağlı değil: node tiktok.mjs baglan");
  if ((d.expires_at ?? 0) < Date.now() / 1000) {
    if ((d.refresh_expires_at ?? 0) < Date.now() / 1000) throw new Error("TikTok izninin süresi doldu: node tiktok.mjs baglan");
    await tokenIste({ grant_type: "refresh_token", refresh_token: d.refresh_token });
    d = durumOku();
  }
  return d.access_token;
}

async function api(yol, govde, token) {
  const res = await fetch(`${API}${yol}`, {
    method: govde ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    ...(govde ? { body: JSON.stringify(govde) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error.code !== "ok")) {
    throw new Error(`TikTok ${yol}: HTTP ${res.status} ${data.error?.code ?? ""} ${data.error?.message ?? ""}`.trim());
  }
  return data.data;
}

/** Videoyu gelen kutusuna taslak olarak yükler; TikTok işleyip kullanıcıya iletince döner. */
export async function yukle(dosya, log = console.log) {
  const token = await belirtec();
  const boyut = statSync(dosya).size;
  // 64 MB'a kadar tek parça; daha büyükse 10 MB'lık parçalar (sonuncusu kalanı da alır).
  const parca = boyut <= 64 * 1024 * 1024 ? boyut : 10 * 1024 * 1024;
  const adet = boyut <= 64 * 1024 * 1024 ? 1 : Math.floor(boyut / parca);
  const init = await api("/post/publish/inbox/video/init/", { source_info: { source: "FILE_UPLOAD", video_size: boyut, chunk_size: parca, total_chunk_count: adet } }, token);
  const fd = openSync(dosya, "r");
  try {
    for (let k = 0; k < adet; k++) {
      const bas = k * parca, son = k === adet - 1 ? boyut - 1 : bas + parca - 1;
      const buf = Buffer.alloc(son - bas + 1);
      readSync(fd, buf, 0, buf.length, bas);
      const res = await fetch(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length), "Content-Range": `bytes ${bas}-${son}/${boyut}` },
        body: buf,
      });
      if (!res.ok) throw new Error(`TikTok yükleme (parça ${k + 1}/${adet}): HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  } finally {
    closeSync(fd);
  }
  log(`yüklendi (${(boyut / 1e6).toFixed(1)} MB), TikTok işliyor… (${init.publish_id})`);
  let son = null;
  for (let i = 0; i < 120; i++) {
    await new Promise((ok) => setTimeout(ok, 5000));
    const s = await api("/post/publish/status/fetch/", { publish_id: init.publish_id }, token);
    if (s.status !== son?.status) log(`  durum: ${s.status}${s.fail_reason ? " " + s.fail_reason : ""}`);
    son = s;
    if (s.status === "SEND_TO_USER_INBOX" || s.status === "PUBLISH_COMPLETE") return { publish_id: init.publish_id, status: s.status };
    if (s.status === "FAILED") throw new Error(`TikTok işleyemedi: ${s.fail_reason ?? "bilinmiyor"}`);
  }
  throw new Error(`TikTok 10 dakikada işlemeyi bitirmedi (son durum ${son?.status}, ${init.publish_id}; gelen kutusunu sonra kontrol et)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [komut, arg] = process.argv.slice(2);
  if (komut === "sorgula") {
    // Bir yüklemenin durumu: node tiktok.mjs sorgula PUBLISH_ID
    console.log(await api("/post/publish/status/fetch/", { publish_id: arg }, await belirtec()));
    process.exit(0);
  }
  if (komut === "baglan") {
    const state = randomBytes(12).toString("hex");
    yaz({ ...durumOku(), state });
    console.log("Tarayıcıda aç (@driftwoodlive hesabıyla giriş yapılmış olmalı):\n");
    console.log("https://www.tiktok.com/v2/auth/authorize/?" + new URLSearchParams({ client_key: anahtar().client_key, scope: SCOPES, response_type: "code", redirect_uri: REDIRECT, state }));
  } else if (komut === "kod") {
    if (!arg) throw new Error("kod gerekli");
    await tokenIste({ code: decodeURIComponent(arg.trim()), grant_type: "authorization_code", redirect_uri: REDIRECT });
    const u = await api("/user/info/?fields=open_id,display_name", null, await belirtec());
    console.log(`Bağlandı: ${u.user.display_name} · izinler: ${durumOku().scope}`);
  } else if (komut === "durum") {
    const d = durumOku();
    if (!d.refresh_token) console.log("Bağlı değil.");
    else {
      const u = await api("/user/info/?fields=open_id,display_name", null, await belirtec());
      const gun = Math.floor((d.refresh_expires_at - Date.now() / 1000) / 86400);
      console.log(`Bağlı: ${u.user.display_name} · izinler: ${d.scope} · izin ${gun} gün daha geçerli`);
    }
  } else if (komut === "yukle") {
    console.log(JSON.stringify(await yukle(arg)));
  } else {
    console.log("komutlar: baglan | kod KOD | durum | yukle video.mp4");
  }
}
