// Çevrimiçi sayacı: sitede o an kaç kişinin olduğunu gösterir.
// Her ziyaretçi tek bir WebSocket açar; tek bir Durable Object bağlantıları sayar ve sayıyı herkese yollar.
// Hiçbir kimlik, IP ya da çerez saklanmaz; yalnızca açık bağlantıların sayısı tutulur.
// Ayrıca /sakinler.json: adadaki sakinlerin listesi. Asıl kayıt sunucudaki veritabanındadır; sunucu her
// aktarımdan sonra listeyi buraya yollar (PUT), ziyaretçiler Cloudflare kenarından okur (GET).
import { DurableObject } from "cloudflare:workers";
export { Kayit } from "./kayit.js";

const ORIGINS = ["https://driftwood.rumpuskit.com", "http://localhost:4183", "http://localhost:4189", "http://localhost:5173"];

export class Presence extends DurableObject {
  async fetch(request) {
    const pair = new WebSocketPair();
    // Uyku (hibernation) API'si: boşta bekleyen bağlantılar için ücret ya da bellek harcanmaz.
    this.ctx.acceptWebSocket(pair[1]);
    this._schedule();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, message) {
    // İstemci yalnızca ara sıra "p" (canlılık) yollar; cevap olarak güncel sayı döner.
    if (message === "p") ws.send(String(this._count()));
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    this._schedule();
  }

  webSocketError() {
    this._schedule();
  }

  _count() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN).length;
  }

  /** Bağlantı değişince sayıyı en geç bir saniye içinde herkese yayar (ani girişlerde tek yayın). */
  async _schedule() {
    if ((await this.ctx.storage.getAlarm()) == null) await this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  async alarm() {
    const n = String(this._count());
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(n); } catch {}
    }
  }
}

const LIST_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*", // herkese açık veri: sitede zaten görünür
  "cache-control": "public, max-age=60",
};

/** Zamanlamadan bilgi sızdırmayan karşılaştırma. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function residents(request, env, ctx) {
  if (request.method === "GET" || request.method === "HEAD") {
    const cache = caches.default;
    const key = new Request(new URL("/sakinler.json", request.url).toString());
    const hit = await cache.match(key);
    if (hit) return hit;
    const body = (await env.SAKINLER.get("sakinler")) ?? '{"v":1,"sakinler":[],"bekleyen":0,"takipci":null}';
    const res = new Response(body, { headers: LIST_HEADERS });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  if (request.method === "PUT") {
    const auth = request.headers.get("authorization") ?? "";
    if (!env.YAYIN_ANAHTARI || !same(auth, `Bearer ${env.YAYIN_ANAHTARI}`)) return new Response("not allowed", { status: 401 });
    const text = await request.text();
    let data;
    try { data = JSON.parse(text); } catch { return new Response("invalid JSON", { status: 400 }); }
    if (data?.v !== 1 || !Array.isArray(data.sakinler)) return new Response("unexpected format", { status: 400 });
    await env.SAKINLER.put("sakinler", text);
    await caches.default.delete(new Request(new URL("/sakinler.json", request.url).toString()));
    return new Response(JSON.stringify({ ok: true, sakin: data.sakinler.length }), { headers: { "content-type": "application/json" } });
  }
  if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET" } });
  return new Response("method not allowed", { status: 405 });
}

/** Kayıt isteklerini tek Durable Object'e iletir; tarayıcı için CORS ve tercih listesi için kısa önbellek. */
async function kayit(request, env, ctx, url, origin) {
  const cors = {
    "access-control-allow-origin": url.pathname === "/tercihler.json" ? "*" : ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "vary": "origin",
  };
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  const cacheable = url.pathname === "/tercihler.json" && request.method === "GET";
  const key = new Request(new URL("/tercihler.json", request.url).toString());
  if (cacheable) {
    const hit = await caches.default.match(key);
    if (hit) return hit;
  }
  const stub = env.KAYIT.get(env.KAYIT.idFromName("ada"));
  const res = await stub.fetch(request);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  if (cacheable) {
    out.headers.set("cache-control", "public, max-age=30");
    ctx.waitUntil(caches.default.put(key, out.clone()));
  }
  // Tercih değişince herkese açık liste önbellekten düşer.
  if ((url.pathname === "/api/tercih" || url.pathname === "/api/sil") && res.ok) ctx.waitUntil(caches.default.delete(key));
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (url.pathname === "/sakinler.json") return residents(request, env, ctx);
    // Sitenin yazabildiği her şey (doğrulama, tercihler, anketler, saklı nesne, seçim): Kayit (kayit.js).
    if (url.pathname.startsWith("/api/") || url.pathname === "/tercihler.json") return kayit(request, env, ctx, url, origin);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket expected", { status: 426 });
      if (origin && !ORIGINS.includes(origin)) return new Response("not allowed", { status: 403 });
      const stub = env.PRESENCE.get(env.PRESENCE.idFromName("ada"));
      return stub.fetch(request);
    }
    return new Response("Driftwood Island online counter", { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
