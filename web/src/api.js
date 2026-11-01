// Worker'daki kayıt API'sinin istemcisi. Cihaz anahtarı (doğrulama) ve anonim cihaz kimliği (anket, saklı
// nesne) bu tarayıcıda saklanır; ikisi de rastgele, kişisel bilgi içermez.
import { KAYIT_URL } from "./config.js";

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};

export function deviceId() {
  let id = store.get("driftwood_cihaz");
  if (!/^[0-9a-f]{32}$/.test(id ?? "")) {
    id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    store.set("driftwood_cihaz", id);
  }
  return id;
}

const token = () => store.get("driftwood_anahtar");

async function call(method, path, body, auth = false) {
  // GET'te gövde ve içerik türü yok: tarayıcı ön kontrol (preflight) isteği atmaz.
  const headers = body ? { "content-type": "application/json" } : {};
  if (auth && token()) headers.authorization = `Bearer ${token()}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(KAYIT_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.hata ?? `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

let available = null;

export const api = {
  /** Kayıt API'si yayında mı (Worker güncellenmeden önceki sürümde /api yok): açılışta bir kez bakılır. */
  async ping() {
    if (available != null) return available;
    try { const r = await call("GET", "/api/bekleyen-sayi"); available = typeof r.n === "number"; } catch { available = false; }
    return available;
  },
  get available() { return !!available; },
  hasToken: () => !!token(),
  /** Doğrulamayı başlatır: kod ve cihaz anahtarı (anahtar saklanır). */
  async baslat(handle) {
    const r = await call("POST", "/api/dogrula", { handle });
    store.set("driftwood_anahtar", r.token);
    return r;
  },
  ben: () => (token() ? call("GET", "/api/ben", null, true) : Promise.resolve({ handle: null, bekleyen: null, tercih: {} })),
  tercih: (patch) => call("POST", "/api/tercih", patch, true),
  async cikis() { try { await call("POST", "/api/cikis", {}, true); } finally { store.set("driftwood_anahtar", null); } },
  secim: (body) => call("POST", "/api/secim", body, true),
  anket: (ids) => call("GET", `/api/anket?id=${ids.join(",")}&cihaz=${deviceId()}`),
  oy: (id, secim) => call("POST", "/api/anket", { id, secim, cihaz: deviceId() }),
  bulundu: (gun, post = false) => (post ? call("POST", "/api/bulundu", { gun, cihaz: deviceId() }) : call("GET", `/api/bulundu?gun=${gun}`)),
  tercihler: async () => { const r = await call("GET", "/tercihler.json"); if (!r || typeof r.tercih !== "object") throw new Error("no list"); return r; },
};
