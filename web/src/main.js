import * as THREE from "three";
import { MapControls2 } from "./controls.js";
import catalog from "../../data/catalog.json";
import * as sim from "./sim.js";
import { World } from "./world/layout.js";
import { buildTerrain, buildWater } from "./world/terrain.js";
import { buildGrounds, buildRoads } from "./world/roads.js";
import { buildCity, buildSites } from "./world/city.js";
import { buildClouds, buildTrees, driftClouds, fadeTrees } from "./world/nature.js";
import { buildLabels, scaleLabels } from "./world/labels.js";
import { People } from "./world/people.js";
import { createSky } from "./world/sky.js";
import { Dollhouse } from "./world/interior.js";
import { createLampLight } from "./world/lighting.js";
import * as P from "./world/palette.js";
import { createUI } from "./ui.js";
import { createMapUI } from "./mapui.js";
import { NameTags } from "./world/nametags.js";
import { Traffic, Vehicles, buildSignals, buildStops } from "./world/traffic.js";
import { buildHarbor } from "./world/harbor.js";
import { buildBeach } from "./world/beach.js";
import { buildFields } from "./world/fields.js";
import { svg } from "./icons.js";
import { buildBayram } from "./world/bayram.js";
import { Stories } from "./world/story.js";
import { Ambience } from "./sound.js";
import { startOnline } from "./online.js";
import { Follower } from "./follow.js";
import { TASINMA_SAATLERI, VERI_URL, ZEPLIN_REKLAM, hourText } from "./config.js";
import { FERRY } from "./world/ferry.js";
import { clockText, plural } from "./fmt.js";
import { Zeplin } from "./world/zeplin.js";
import { api } from "./api.js";
import { buildFlowers, curtain, dateKey, setPrefs, setVotes, weekKey } from "./tercih.js";
import { buildHidden } from "./world/sakli.js";
import { createMenu } from "./menu.js";
import { createTour } from "./tur.js";
import { createBen } from "./ben.js";
import { createAnket } from "./anket.js";
import { gazete } from "./gazete.js";
import "./style.css";

sim.setCatalog(catalog);

const params = new URLSearchParams(location.search);
const nowUnix = () => Date.now() / 1000;

// --- yükleme ekranı: gerçek aşamalarla ilerleyen çubuk ve ipuçları; ada hazır olunca "Adaya gir" ---
const loadFill = document.getElementById("load-fill"), loadStep = document.getElementById("load-step"), loadPct = document.getElementById("load-pct");
function progress(f, text) {
  loadFill.style.width = `${Math.round(f * 100)}%`;
  loadPct.textContent = `${Math.round(f * 100)}%`;
  loadFill.parentElement.setAttribute("aria-valuenow", String(Math.round(f * 100)));
  if (text) loadStep.textContent = text;
}
// Ağır kurulum adımları arasında tarayıcıya bir kare çizdirir (çubuk ilerlesin).
const paint = () => new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
const TIPS = [
  `Move-ins three times a day: ${TASINMA_SAATLERI.map(hourText).join(", ")} (ET). Follow on TikTok and you move in at the next one.`,
  "Type your @username in the search below to see your home and your day.",
  "Tap a resident and the camera follows them. \"Over the shoulder\" walks right behind them.",
  "Comment \"job: fisherman\" on one of our videos and you become a fisherman at the next move-in.",
  "New places open as residents arrive: the Diner, the Bakery, the school, the freight terminal…",
  `Island time is Eastern Time: lights come on after sunset and the first ferry docks at ${clockText(FERRY.first)}.`,
];
{
  const tip = document.getElementById("load-tip");
  let n = Math.floor(Math.random() * TIPS.length);
  const show = () => {
    tip.style.opacity = 0;
    setTimeout(() => { tip.innerHTML = svg("ampul"); tip.append(TIPS[n++ % TIPS.length]); tip.style.opacity = 1; }, 300);
  };
  show();
  const timer = setInterval(show, 4200);
  document.getElementById("enter").addEventListener("click", () => clearInterval(timer), { once: true });
}
progress(0.06, "Getting the resident list…");

// Sakinler: TikTok takipçileri. Asıl liste sunucudaki veritabanındadır; her aktarımdan sonra Cloudflare'e
// yollanır, site oradan okur. ?nufus=N örnek sakinlerle N kişilik ada kurar (video ve testler için),
// ?bekleyen=N iskelede N bekleyen gösterir.
const today = sim.dayOf(nowUnix());
const sample = Number(params.get("nufus"));
const { residents, waiting, listError, peak = 0, secim = null } = sample > 0 ? sampleTown(Math.min(60000, sample)) : await loadResidents();
// Doğrulanmış sakinlerin tercihleri ve anket sonuçları (Worker): evler, evcil adları, günün olayı ve sinema
// filmi bunlara göre. Alınamazsa ada varsayılanlarla kurulur (bekletmez: en çok 4 sn).
const prefsData = {};
const oylarim = {}; // açılıştaki anket durumu (bu cihaz oy verdi mi): sekmedeki "yeni" noktası için
if (!(sample > 0)) {
  const within = (p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 4000))]);
  const [t, a] = await Promise.allSettled([within(api.tercihler()), within(api.anket([`tema:${dateKey(today)}`, `tema:${dateKey(today + 1)}`, `film:${weekKey(today)}`])), within(api.ping())]);
  if (t.status === "fulfilled") Object.assign(prefsData, t.value.tercih ?? {});
  if (a.status === "fulfilled") { setVotes(a.value); Object.assign(oylarim, a.value); }
}
setPrefs(prefsData, residents);
progress(0.16, "Building the island…");
await paint();
// Ada, en büyük sıra numarasına kadar kurulur: ayrılanların boş kalan evleri de durur (yeni gelen yerleşir).
const population = residents.reduce((m, r) => Math.max(m, r.slot + 1), 0);
// Gelişim düzeyi: adanın ulaştığı en yüksek nüfus (ayrılanlar yüzünden açılmış yer kapanmaz). Neyin açık
// olduğu (iş yerleri, yollar, parklar) buna göre; ?gelisim=N adayı o düzeyde gösterir (deneme ve video).
const level = Number(params.get("gelisim")) || Math.max(population, peak);
sim.setTown(level);

function sampleTown(n) {
  const residents = Array.from({ length: n }, (_, i) => {
    const handle = `sakin_${String(i).padStart(4, "0")}`;
    return { handle, seed: sim.seedOf(handle), slot: i, arrived_day: today - Math.floor(90 * (1 - i / n)) };
  });
  return { residents, waiting: Number(params.get("bekleyen")) || 0 };
}

async function loadResidents() {
  const parse = (data) => ({
    residents: data.sakinler.map(([handle, seed, slot, arrived_day, overrides]) => ({
      handle: handle ?? `gizli.komsu.${slot}`, seed, slot, arrived_day, ...(overrides ? { overrides } : {}), ...(handle ? {} : { hidden: true }),
    })),
    waiting: Number(params.get("bekleyen")) || data.bekleyen || 0,
    peak: data.zirve ?? 0,
    secim: data.secim ?? null, // belediye başkanlığı seçimi (sunucu: secim.py)
  });
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(VERI_URL, { signal: ctl.signal, cache: "no-cache" });
    clearTimeout(timer);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const out = parse(JSON.parse(text));
    try { localStorage.setItem("sakinler", text); } catch {}
    return out;
  } catch (e) {
    // Liste alınamadıysa son görülen liste (varsa); yoksa boş ada ve uyarı.
    console.warn("could not load the resident list", e);
    try {
      const cached = localStorage.getItem("sakinler");
      if (cached) return { ...parse(JSON.parse(cached)), listError: "stale" };
    } catch {}
    return { residents: [], waiting: 0, listError: "none" };
  }
}

// --- sahne ---
const canvas = document.getElementById("scene");
const mobile = Math.min(innerWidth, innerHeight) < 700;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  document.getElementById("loading").textContent = "Your browser does not support 3D graphics (WebGL).";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 20000);
// Derinlik hassasiyeti: yakın ve uzak düzlem kamera uzaklığıyla birlikte ayarlanır; üst üste yakın
// yüzeyler (yol, kaldırım, çizgi) uzaktan bakınca titremesin.
function fitDepth(dist) {
  const near = THREE.MathUtils.clamp(dist * 0.02, 0.2, 25);
  const far = Math.max(8000, dist * 30);
  if (Math.abs(camera.near - near) / near > 0.1 || camera.far !== far) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}
const controls = new MapControls2(camera, canvas);
// Kaydırınca uçuş da takip de biter; yakınlaştırıp döndürmek takibi bozmaz (hedef aracın üstünde kalır).
controls.onUserMove = (kind) => { flight = null; if (follower) follower.zoomTo = null; if (kind === "pan") follower?.stop(); };

const T0 = performance.now();
const world = new World(population);
const T1 = performance.now();
progress(0.3, "Laying the roads…");
await paint();
const roads = buildRoads(world);
const T2 = performance.now();
progress(0.42, "Shaping the shore and hills…");
await paint();
const terrain = buildTerrain(world);
const T3 = performance.now();
const grounds = buildGrounds(world);
const water = buildWater(world);
const harbor = buildHarbor(world);
const beach = buildBeach(world);
scene.add(water, terrain, roads, grounds, harbor, beach, buildFields(world));
const T6 = performance.now();
progress(0.54, "Putting up traffic lights…");
await paint();
const traffic = new Traffic(world);
const T7 = performance.now();
scene.add(buildStops(traffic, world));
const signals = buildSignals(traffic, world);
scene.add(signals);
progress(0.62, "Building homes and shops…");
await paint();
const city = buildCity(world);
const T4 = performance.now();
progress(0.76, "Planting trees…");
await paint();
const trees = buildTrees(world);
const T5 = performance.now();
const lampLight = createLampLight(world, world.lampSpots,
  [terrain.material, ...roads.userData.groundMaterials, ...grounds.userData.groundMaterials, ...(harbor.userData.groundMaterials ?? [])],
  { wallMaterials: city.wallMaterials });
scene.add(city.group, trees, buildSites(world));
// Pencere çiçekleri (tercih.js): seçen dairelerin pencerelerinde; tercih değişince yeniden kurulur.
let flowers = buildFlowers(city.windowInfo);
scene.add(flowers);
function refreshFlowers() {
  scene.remove(flowers);
  flowers.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  flowers = buildFlowers(city.windowInfo);
  scene.add(flowers);
}
// Günün saklı nesnesi.
const hidden = buildHidden(world);
scene.add(hidden.group);
const bayram = buildBayram(world);
scene.add(bayram.group, bayram.mast);
const clouds = buildClouds(world);
const labels = buildLabels(world);
scene.add(clouds, labels);
const vehicles = new Vehicles(Math.ceil(population * 0.4) + 80);
scene.add(vehicles.group);
progress(0.86, residents.length ? "Residents are settling in…" : "The island is waiting for its first resident…");
await paint();
const people = new People(world, residents, traffic);
people.waiting = waiting;
const stories = new Stories(people);
people.stories = stories;
const T8 = performance.now();
if (params.has("denetle")) console.info(`timings: world ${Math.round(T1 - T0)} roads ${Math.round(T2 - T1)} terrain ${Math.round(T3 - T2)} city ${Math.round(T4 - T3)} trees ${Math.round(T5 - T4)} traffic ${Math.round(T7 - T6)} people ${Math.round(T8 - T7)}`);
scene.add(people.group);
const dollhouse = new Dollhouse(world, city, people, scene);
people.dollhouse = dollhouse;
const sky = createSky(scene);
sky.sun.shadow.mapSize.set(2048, 2048);
// Driftwood Blimp: gelişim tablosundaki adımında açılır (?zeplin her düzeyde gösterir; ?zeplin_reklam=adres
// reklam görselini dener, ör. reklamverene önizleme).
const zeplin = sim.isOpen("zeplin") || params.has("zeplin")
  ? new Zeplin(world, { reklam: params.get("zeplin_reklam") || ZEPLIN_REKLAM.gorsel, mobile })
  : null;
if (zeplin) scene.add(zeplin.group);

// Ortam sesleri: varsayılan açık; tarayıcılar sesi ancak bir dokunuşla başlatır, o dokunuş "Adaya gir".
// Kapatan kişinin tercihi bu cihazda hatırlanır.
const ambience = new Ambience();
const soundBtn = document.getElementById("sound");
const pref = { get: () => { try { return localStorage.getItem("ses") !== "kapali"; } catch { return true; } },
  set: (on) => { try { localStorage.setItem("ses", on ? "acik" : "kapali"); } catch {} } };
let soundWanted = pref.get();
soundBtn.innerHTML = svg(soundWanted ? "sesAcik" : "sesKapali");
soundBtn.addEventListener("click", () => {
  soundWanted = !ambience.enabled;
  if (soundWanted) ambience.start(); else ambience.stop();
  soundBtn.innerHTML = svg(soundWanted ? "sesAcik" : "sesKapali");
  pref.set(soundWanted);
});
const limanZ = world.coastPoint(210, 60, 0, 1)[1]; // feribot iskelesinin kıyısı
function soundEnv(dist, light, minute) {
  const t = controls.target;
  // Yakındaki insanlar ve araçlar ağırlıkla sayılır: odaktaki kişi tam, 12 m ötedeki yarım (araçta 25 m).
  let near = 0;
  const P = people.positions;
  for (let i = 0; i < residents.length; i++) {
    if (!people.visible[i]) continue;
    const dx = P[i * 3] - t.x, dz = P[i * 3 + 2] - t.z, d2 = dx * dx + dz * dz;
    if (d2 < 60 * 60) near += 1 / (1 + d2 / 144);
  }
  let traffic = 0;
  for (const v of trafficRef.active.values()) {
    if (v.parked) continue;
    const q = v.route.position(v.s), d2 = (q.x - t.x) ** 2 + (q.z - t.z) ** 2;
    if (d2 < 100 * 100) traffic += 1 / (1 + d2 / 625);
  }
  const zt = world.zoneAt(t.x, t.z);
  const inPark = world.parks.some((q) => t.x > q.x0 - 20 && t.x < q.x1 + 20 && t.z > q.z0 - 20 && t.z < q.z1 + 20) || world.plazas.some((q) => q.kind === "park" && t.x > q.x0 && t.x < q.x1 && t.z > q.z0 && t.z < q.z1);
  return {
    dist, minute, day: light, people: near, traffic,
    coast: Math.max(0, world.margin(t.x, t.z) - world.sdf(t.x, t.z)),
    fountain: 1e9, // Green'de çeşme yok (çardak)
    harbor: Math.hypot(t.x - 210, t.z - limanZ),
    nature: inPark || zt === "tepe" || zt === "kir" || zt === "kumul" || zt === "tarla" ? 1 : 0.35,
    match: people.ball ? Math.hypot(t.x - world.pitch.cx, t.z - world.pitch.cz) : null,
  };
}

// Maç topu.
const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.6, flatShading: true }));
ball.castShadow = true;
scene.add(ball);

// Seçili sakin işareti.
const marker = new THREE.Group();
const pin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 12).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: "#e0607a", toneMapped: false }));
const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#e0607a", transparent: true, opacity: 0.8, toneMapped: false, depthTest: false }));
marker.add(pin, ring);
marker.visible = false;
scene.add(marker);

// Başlangıç görünümü adanın o anki büyüklüğüne göre: küçük adada yerleşik yere (meydan, evler, açılmış yerler)
// yakın ve ortalı, şehir büyüdükçe uzak (en çok merkez ve ilk mahalleler). Sabit uzak açı ilk günlerde adayı
// boş bir orman gibi gösteriyordu.
const home = new THREE.Vector3(60, 0, 70); // Green ile feribot iskelesinin arası
const aspectBoost = innerWidth < innerHeight ? 1.9 : 1;
let homeDist = 480;
{
  // Adada baştan duran altyapı (vapur iskelesi binası, fener bekçisinin evi, liman) yerleşimden sayılmaz.
  const built = world.buildings.filter((b) => !["liman", "kulube", "ambar", "tersane"].includes(b.kind) && Math.hypot(b.x, b.z) < 700);
  if (built.length) {
    const pts = [[0, 0], [210, 160], ...built.map((b) => [b.x, b.z])]; // Green ve feribot iskelesi hep dahil
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const r = Math.max(35, ...built.map((b) => Math.hypot(b.x - cx, b.z - cz) + Math.max(b.w, b.d) / 2));
    homeDist = Math.min(480, Math.max(140, r * 2.4));
    if (homeDist < 480) home.set(cx, 0, cz);
  }
}
controls.target.copy(home);
camera.position.copy(new THREE.Vector3(260, 230, 330).normalize().multiplyScalar(homeDist * aspectBoost)).add(home);
controls.update();

// --- zaman ---
// Zaman hızı yalnızca geliştirmede (vite dev, ?gelistir ya da ?test): yayında şehir gerçek saatle yaşar.
const dev = import.meta.env.DEV || params.has("gelistir") || params.has("denetle") || params.has("test");
let speed = dev ? Number(params.get("hiz")) || 1 : 1;
if (dev) {
  const speedBar = document.getElementById("speed"), hud = document.getElementById("hud");
  speedBar.hidden = false;
  // Telefonda hız düğmeleri üst bilginin hemen altında (üst bilgi satır ekledikçe aşağı kayar).
  const place = () => { speedBar.style.top = innerWidth < 900 ? `${Math.round(hud.getBoundingClientRect().bottom + 8)}px` : ""; };
  new ResizeObserver(place).observe(hud);
  addEventListener("resize", place);
}
let simBase = nowUnix();
let realBase = performance.now() / 1000;
// ?tarih=2026-10-29 (test): o günün aynı saatine (ya da ?saat'e) gider.
const dateDay = dev && /^\d{4}-\d{2}-\d{2}$/.test(params.get("tarih") ?? "") ? Date.parse(params.get("tarih") + "T00:00:00Z") / 86400000 : null;
if (dateDay != null) simBase += (dateDay - today) * 86400;
const fixed = dev && params.get("saat")?.match(/^(\d{1,2}):(\d{2})$/);
if (fixed) simBase = sim.unixOf(dateDay ?? today, Number(fixed[1]) * 60 + Number(fixed[2]));
// Fotoğraf modunda saat kaydırıcısı yalnız bakılan anı kaydırır (viewShift, saniye); çıkınca sıfırlanır.
let viewShift = 0;
const simNow = () => simBase + (performance.now() / 1000 - realBase) * speed + viewShift;
function setSpeed(next) {
  simBase = simNow();
  realBase = performance.now() / 1000;
  speed = next;
}

// --- kamera uçuşu ---
let flight = null;
let follower = null; // takip (araç ya da sakin; harita ya da omuz görünümü), aşağıda kurulur
function flyTo(x, y, z, distance = 120, direction = null, sure = 1.3) {
  const dir = direction ? direction.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
  if (!direction && dir.y < 0.45) dir.setY(0.45).normalize();
  flight = {
    t: 0, sure,
    fromT: controls.target.clone(), toT: new THREE.Vector3(x, y, z),
    fromC: camera.position.clone(), toC: new THREE.Vector3(x, y, z).addScaledVector(dir, distance),
  };
}

const nameTags = new NameTags(scene);
if (params.has("denetle")) globalThis.__ada = { world, people, traffic, residents, scene, zeplin };
const busColors = traffic.lines.map((l) => new THREE.Color(l.color));
const trafficRef = traffic;
follower = new Follower({ camera, controls, world, people, traffic, zeplin });
const claim = {}; // "Bu benim" (karttan Benim evim'e): ben oluşturulunca doldurulur
const ui = createUI({ residents, people, world, dollhouse, stories, traffic, zeplin, capture, claim, follow: { get: () => follower.get(), set: (t, view, o) => { if (t) follower.start(t, view, o); else follower.stop(); flight = null; } }, setSpeed, flyTo, speed, waiting, listError, secim, today: () => sim.dayOf(simNow()), minute: () => sim.minuteOf(simNow()) });
if (globalThis.__ada) Object.assign(globalThis.__ada, { ui, camera, controls, follower, followKey: () => follower.get()?.key ?? null });
// Takip edilen sakin evine ya da işine girince iç mekân açılır, çıkınca kapanır.
follower.onHide = (i) => { if (ui.selected() === i) ui.select(i, false, false); };
// Çevrimiçi sayacı yalnızca yayındaki sitede (ya da ?sayac ile denerken).
if (location.hostname === "driftwood.rumpuskit.com" || params.has("sayac")) startOnline();
const mapUI = createMapUI({ world, camera, controls, flyTo, ui, residents, zeplin });

// --- menü: gazete, fotoğraf, benim evim, anket, ada turu, saklı nesne ---
function shiftView(m) {
  if (m == null) { viewShift = 0; return; }
  viewShift += (m - sim.minuteOf(simNow())) * 60;
}
const menu = createMenu({ capture, minute: () => sim.minuteOf(simNow()), today: () => sim.dayOf(simNow()), shiftView, toast: ui.toast });
const tour = createTour({ world, people, residents, flyTo, cinema: people.cinema, vec: (x, y, z) => new THREE.Vector3(x, y, z) });
{ const move = controls.onUserMove; controls.onUserMove = (kind) => { move(kind); tour.stop(); }; } // kamerayı tutan turu bitirir
const ben = createBen({
  sayfa: menu.sayfa, residents, people, ui, today: () => sim.dayOf(simNow()), secim: () => secim, prefsData,
  onPrefs(patch) {
    // Değişiklik hemen bu ekranda: çiçekler yeniden kurulur, evin içi açıksa yeniden çizilir, gün planı yenilenir.
    if ("cicek" in patch) refreshFlowers();
    if ("duvar" in patch || "koltuk" in patch) dollhouse.rebuild?.();
    if ("gun" in patch) { const d = people.day; people.day = null; people.setDay(d); }
  },
});
const anket = createAnket({ sayfa: menu.sayfa, today: () => sim.dayOf(simNow()), world, toast: ui.toast, onVote: (id, secim) => { oylarim[id] = { ...(oylarim[id] ?? {}), benim: secim }; menu.refresh(); } });
const flyToTheme = () => {
  const th = people.theme;
  if (!th) return;
  const at = th.yer === "cami" ? world.workplaces.cami?.find(Boolean)?.door : th.id === "sinema" && people.cinema ? people.cinema.spot : world.placeOf(th.yer).anchors[0];
  if (at) { menu.sayfa.close(); ui.close(); flyTo(at[0], Math.max(0, world.height(at[0], at[1])), at[1], 90); }
};
// Sekmeler: "yeni" noktası bu cihazda yapılmamış şeyler için (bugünün gazetesi, açık anket, saklı nesne...).
const seen = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const todayKey = () => dateKey(sim.dayOf(simNow()));
const anketAcik = () => {
  const t = sim.dayOf(simNow()), wd = sim.weekday(t + 1);
  const temaAcik = !(wd === 5 || wd === 6 || (wd === 4 && world.workplaces.cami?.some(Boolean)));
  return (temaAcik && !oylarim[`tema:${dateKey(t + 1)}`]?.benim) || !oylarim[`film:${weekKey(t)}`]?.benim;
};
menu.add({ icon: "kitap", label: "News", badge: () => seen.get("gazete") !== todayKey(), run: () => {
  seen.set("gazete", todayKey());
  menu.sayfa.open("The Driftwood Gazette", gazete({
    residents, people, world, zeplin, today: () => sim.dayOf(simNow()), at: (r) => (r?.hidden ? "Private neighbor" : "@" + (r?.handle ?? "?")),
    select: (i) => { menu.sayfa.close(); ui.select(i); }, flyToTheme,
    sakli: () => ({ ...hidden.info(), bulundu: hidden.found() }), tur: () => { menu.sayfa.close(); ui.close(); tour.start(); },
  }));
} });
menu.add({ icon: "ev", label: "My home", badge: () => !seen.get("evim"), hidden: () => !api.available, run: () => { seen.set("evim", "1"); ben.open(); } });
menu.add({ icon: "sepet", label: "Poll", badge: anketAcik, hidden: () => !api.available, run: () => anket.open() });
menu.add({ icon: "kamera", label: "Photo", badge: () => !seen.get("foto"), run: () => { seen.set("foto", "1"); ui.close(); menu.enterPhoto(); } });
menu.add({ icon: "goz", label: "Hidden", badge: () => !hidden.found(), run: () => {
  const h = hidden.info();
  if (!h) return;
  if (hidden.found()) return ui.toast(`You already found today's hidden object (${h.ad}). A new one is hidden tomorrow.`);
  ui.toast(`Hint: today there's ${h.ad} ${h.area}. Zoom in and tap it.`, 5000);
} });
ben.peek();
if (api.available) Object.assign(claim, { open: (h) => { seen.set("evim", "1"); ui.close(); ben.open(h); menu.refresh(); }, me: () => ben.handle });
if (globalThis.__ada) Object.assign(globalThis.__ada, { hidden, menu, tour, ben, city, capture });

// Bir sakine dokununca kartını aç.
const raycaster = new THREE.Raycaster();
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = e.button === 0 ? [e.clientX, e.clientY] : null; });
canvas.addEventListener("pointerup", (e) => {
  // Yalnızca sol tık / dokunma seçer; sağ tık ve sürükleme yalnızca kamerayı döndürür.
  if (e.button !== 0 || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  down = null;
  // Omuz görünümünde dokunmak/tıklamak yalnızca bakışı çevirir; seçimi değiştirmez.
  if (follower.target && follower.view === "omuz") return;
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // Günün saklı nesnesi: bulana seri ve bugün kaç kişinin bulduğu.
  if (hidden.pick(raycaster)) {
    const h = hidden.info(), res = hidden.markFound();
    const seri = res.seri > 1 ? ` That's ${res.seri} days in a row.` : "";
    menu.refresh();
    if (api.available) api.bulundu(dateKey(h.day), true).then((r) => ui.toast(`You found it: ${h.ad}.${seri} ${plural(r.n, "person", "people")} found it today.`, 5000)).catch(() => ui.toast(`You found it: ${h.ad}.${seri}`, 5000));
    else ui.toast(`You found it: ${h.ad}.${seri}`, 5000);
    return;
  }
  const index = people.pick(raycaster);
  if (index != null && !people.poses[index].inVehicle) return ui.select(index, false);
  const veh = vehicles.pick(raycaster);
  if (veh) return ui.selectVehicle(veh);
  if (zeplin?.pick(raycaster)) return ui.selectVehicle({ kind: "zeplin" });
  // Aracın içindeki sakine dokunulduysa (camdan) aracı seç; kartta sahibine/yolcuya geçilebilir.
  const inside = index != null ? traffic.active.get(people.poses[index].vehicleKey) : null;
  if (inside) return ui.selectVehicle({ kind: inside.kind, key: inside.key, owner: inside.owner, line: inside.line, dep: inside.dep });
  if (index != null) return ui.select(index, false);
  const building = city.pickBuilding(raycaster);
  if (building) return ui.openBuilding(building);
  // Yol, meydan, kumsal: oraya odaklan (seçim ve takip biter).
  const g = groundHit(raycaster.ray);
  if (g) {
    ui.close();
    const cd = camera.position.distanceTo(controls.target);
    flyTo(g.x, g.y, g.z, THREE.MathUtils.clamp(cd * 0.75, 35, cd));
  }
});

/** Işının araziye (ya da denize) değdiği nokta: kameradan uzaklaştıkça büyüyen adımlarla. */
function groundHit(ray) {
  const p = new THREE.Vector3();
  let t = 0, prev = 0;
  for (let k = 0; k < 400 && t < 4000; k++) {
    ray.at(t, p);
    const gy = Math.max(0, world.groundY(p.x, p.z));
    if (p.y <= gy) {
      // Son iki adım arasında ikiye bölerek incelt.
      let a = prev, b = t;
      for (let j = 0; j < 12; j++) {
        const m = (a + b) / 2;
        ray.at(m, p);
        if (p.y <= Math.max(0, world.groundY(p.x, p.z))) b = m; else a = m;
      }
      ray.at(b, p);
      return { x: p.x, y: Math.max(0, world.groundY(p.x, p.z)), z: p.z };
    }
    prev = t;
    t += Math.max(0.5, t * 0.02);
  }
  return null;
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});

// --- paylaşım ve fotoğraf için sahne görüntüsü ---
/**
 * Sahneyi bu anda çizip w×h oranında (ortadan kırparak) bir tuvale kopyalar. frame verilirse kamera o kare
 * için oraya konur, sonra eski yerine döner. İşaretçi görüntüye girmez.
 */
function capture(frame = null, w = 1080, h = 1240) {
  const pos = camera.position.clone(), tgt = controls.target.clone();
  const view = camera.view?.enabled;
  if (view) camera.clearViewOffset();
  const mv = marker.visible, tv = nameTags.group.visible;
  marker.visible = false;
  nameTags.group.visible = false; // ad kartta yazıyor; yakın kadrajda etiket görüntüyü kapatır
  // frame: { target: [x, y, z], dist, up } — kamera bugünkü bakış yönünden, up eğimiyle (0 yatay, 1 tepeden).
  let look = controls.target;
  if (frame) {
    look = new THREE.Vector3(...frame.target);
    // Bugünkü bakış yönünden başlayıp çevresinde 16 yön ve iki eğim denenir; arada bina kalmayan (en açık) seçilir.
    const base = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    let best = null, bestClear = -1;
    for (const up of [frame.up, frame.up + 0.3, frame.up - 0.2]) {
      for (let k = 0; k < 16; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const dir = new THREE.Vector3(Math.sin(a) * Math.cos(up), Math.sin(up), Math.cos(a) * Math.cos(up));
        const clear = frame.inside ? frame.dist : rayClear(look, dir, frame.dist);
        if (clear > bestClear + 0.5) { bestClear = clear; best = dir; }
        if (clear >= frame.dist - 0.01) break;
      }
      if (bestClear >= frame.dist - 0.01) break;
    }
    camera.position.copy(look).addScaledVector(best, Math.max(4, bestClear));
  }
  camera.lookAt(look);
  fitDepth(camera.position.distanceTo(look));
  renderer.render(scene, camera);
  const src = renderer.domElement, sw = src.width, sh = src.height;
  const s = Math.min(sw / w, sh / h), cw = w * s, ch = h * s;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  out.getContext("2d").drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  camera.position.copy(pos); controls.target.copy(tgt); camera.lookAt(tgt);
  marker.visible = mv;
  nameTags.group.visible = tv;
  return out;
}

/** Işın (o'dan dir yönünde) bir binaya çarpmadan gidebildiği uzaklık (en çok max). Binalar tam kutularıyla. */
function rayClear(o, dir, max) {
  let best = max;
  for (const b of world.buildings) {
    const R = Math.max(b.w, b.d) / 2 + max;
    if (Math.abs(b.x - o.x) > R || Math.abs(b.z - o.z) > R) continue;
    const c = Math.cos(b.rot), sn = Math.sin(b.rot);
    const ox = (o.x - b.x) * c - (o.z - b.z) * sn, oz = (o.x - b.x) * sn + (o.z - b.z) * c, oy = o.y - 1.2;
    const dx = dir.x * c - dir.z * sn, dz = dir.x * sn + dir.z * c;
    const hx = b.w / 2 + 0.3, hz = b.d / 2 + 0.3, top = b.floors * 3.2 + 2.5;
    if (Math.abs(ox) < b.w / 2 - 0.4 && Math.abs(oz) < b.d / 2 - 0.4 && oy < top) continue; // içindeyse (açık iç mekân)
    let t0 = 0, t1 = best;
    for (const [o1, d1, lo, hi] of [[ox, dx, -hx, hx], [oz, dz, -hz, hz], [oy, dir.y, -1, top]]) {
      if (Math.abs(d1) < 1e-6) { if (o1 < lo || o1 > hi) { t0 = Infinity; break; } continue; }
      let a = (lo - o1) / d1, bb = (hi - o1) / d1;
      if (a > bb) [a, bb] = [bb, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, bb);
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < best) best = Math.max(0, t0 - 0.5);
  }
  return best;
}

// --- pencereler ve lambalar ---
const tmpColor = new THREE.Color();
const LAMP_OFF = new THREE.Color("#cfd6de");
function updateWindows(minute, light, sunDeg) {
  const night = 1 - light;
  const { windows, windowOwners } = city;
  for (let i = 0; i < windowOwners.length; i++) {
    const o = windowOwners[i];
    let lit;
    if (o.slot != null) lit = o.slot < population && people.athome[o.slot] === 1;
    else if (o.workplace === "otel" || o.workplace === "saglik" || o.workplace === "karakol") lit = (o.seed * 7) % 5 < 3;
    else lit = minute > 470 && minute < 1380 && (o.seed * 5) % 7 < 5;
    tmpColor.copy(P.WINDOW_DAY).lerp(lit ? P.WINDOW_NIGHT : P.WINDOW_DARK, night);
    if (o.slot != null) curtain(o.slot, tmpColor, night, lit); // seçtiği perde rengi
    windows.setColorAt(i, tmpColor);
  }
  windows.instanceColor.needsUpdate = true;
  // Lambalar güneş ufkun altına inince yanar.
  const on = sunDeg < -1.5;
  for (const m of roads.userData.lampHeads) m.color.copy(LAMP_OFF).lerp(P.WINDOW_NIGHT, on ? 1 : 0);
  lampLight.setNight(on ? Math.min(1, (-1.5 - sunDeg) / 6 + 0.35) : 0);
  // Saha ışıkları yalnızca akşam (17:30-23:00), fener bütün gece.
  const stadium = on && minute >= 1050 && minute < 1380 ? 1 : 0;
  city.setFlood(stadium, on ? 1 : 0);
  lampLight.setStadium(stadium);
  harbor.userData.setNight(on ? 1 : 0);
}

// --- giriş: yükleme bitince "Adaya gir"; dokununca ses açılır ve kamera yüksekten adaya süzülür ---
// Paylaşılan bağlantıda (?bul, ?bak, ?takip) ve video kaydında giriş uçuşu yapılmaz.
const intro = !["bul", "bak", "takip", "denetle"].some((k) => params.has(k));
const homeView = { target: controls.target.clone(), pos: camera.position.clone() };
if (intro) camera.position.copy(homeView.target).add(new THREE.Vector3(-120, 900, 1100));
function ready() {
  progress(1, "The island is ready");
  if (params.has("denetle")) return enter();
  const btn = document.getElementById("enter");
  btn.hidden = false;
  btn.focus({ preventScroll: true });
  btn.addEventListener("click", enter, { once: true });
}
function enter() {
  const el = document.getElementById("loading");
  el.classList.add("done");
  setTimeout(() => el.remove(), 1200);
  if (soundWanted && !params.has("denetle")) ambience.start();
  if (intro) {
    const off = homeView.pos.clone().sub(homeView.target);
    flyTo(homeView.target.x, homeView.target.y, homeView.target.z, off.length(), off, 2.6);
    // İlk gelişte (bu cihazda) ada turu önerilir.
    if (!tour.seen() && residents.length) setTimeout(() => tour.offer(), 3200);
  }
}

// --- döngü ---
let frame = 0;
let lastReal = performance.now() / 1000;

// Uyarlanır kalite: zayıf telefonlarda kare hızı düşük kalırsa önce çözünürlük kademeli düşer, en sonda
// gölgeler kapanır. Yalnız düşürür (gidip gelme olmaz); video kaydında (sanal saat) devre dışı.
const quality = { t0: null, n: 0, steps: 0 };
function adaptQuality(real) {
  if (globalThis.__yonetmen !== undefined || document.hidden) return;
  if (quality.t0 == null || frame < 60) { quality.t0 = real; quality.n = 0; return; }
  quality.n++;
  const span = real - quality.t0;
  if (span < 4) return;
  const fps = quality.n / span;
  quality.t0 = real; quality.n = 0;
  if (fps >= 26 || quality.steps >= 4) return;
  const pr = renderer.getPixelRatio();
  if (pr > 1.01) renderer.setPixelRatio(Math.max(1, pr - 0.35));
  else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
  else return;
  renderer.setSize(innerWidth, innerHeight, false);
  quality.steps++;
  if (params.has("denetle")) console.info(`quality lowered: ${fps.toFixed(1)} fps → pixel ratio ${renderer.getPixelRatio()}, shadows ${renderer.shadowMap.enabled}`);
}
let lastSim = null;
let zeplinNight = 0;
const bounds = world.bounds;
function tick() {
  const real = performance.now() / 1000;
  const dt = Math.min(0.1, real - lastReal);
  lastReal = real;
  const unix = simNow();
  const day = sim.dayOf(unix);
  const minute = sim.minuteOf(unix);
  const simDtSec = lastSim == null ? 0 : unix - lastSim;
  lastSim = unix;
  const U0 = performance.now();
  people.setDay(day);
  const U1 = performance.now();
  people.update(minute, real);
  if (frame < 3 && params.has("denetle")) console.info(`frame ${frame}: day ${Math.round(U1 - U0)} ms, update ${Math.round(performance.now() - U1)} ms`);
  city.setOpenDoors(people.openDoors);
  ball.visible = !!people.ball;
  if (people.ball) ball.position.set(people.ball[0], world.groundY(people.ball[0], people.ball[1]) + people.ball[2], people.ball[1]);
  // Araçlar: sürülenler, park halindekiler ve otobüsler.
  // Trafik benzetimi (sakinlerin araç yolculukları people.update içinde istenir).
  traffic.step(simDtSec, minute, day);
  signals.userData.update(minute * 60);
  // Araçlar: yoldakiler, park halindekiler (farlar sönük) ve bekleyen taksiler.
  vehicles.begin();
  const vp = {};
  for (const v of traffic.active.values()) {
    v.route.position(v.s, vp);
    const y = world.surfaceY(vp.x, vp.z) + 0.06;
    const record = { kind: v.kind, key: v.key, owner: v.owner, line: v.line, dep: v.dep };
    if (v.kind === "car" || v.kind === "taxi") vehicles.addCar(vp.x, y, vp.z, vp.heading, v.color ?? 0, { taxi: v.kind === "taxi", lights: !v.parked, brake: v.braking, record });
    else if (v.kind === "bus") vehicles.add("bus", vp.x, y, vp.z, vp.heading, { color: busColors[v.line], brake: v.braking || v.v < 0.3, record });
    else vehicles.add(v.kind, vp.x, y, vp.z, vp.heading, { brake: v.braking, flash: v.emergency && v.phase !== "back" ? real : v.kind === "cop" ? real : null, record });
  }
  for (const [slot, color, owner] of people.parked) {
    const s = traffic.slots[slot];
    vehicles.addCar(s.x, world.surfaceY(s.x, s.z) + 0.06, s.z, s.heading, color, { lights: false, record: { kind: "car", owner, parked: true, slot } });
  }
  for (const c of people.staticCars) vehicles.addCar(c.x, world.surfaceY(c.x, c.z) + 0.06, c.z, c.heading, 0, { taxi: c.taxi, record: { kind: "taxi" } });

  zeplin?.update(unix, real, zeplinNight); // takipten önce: kamera zeplinin bu karedeki yerini izler
  if (flight) {
    flight.t = Math.min(1, flight.t + dt / flight.sure);
    const k = 1 - (1 - flight.t) ** 3;
    controls.target.lerpVectors(flight.fromT, flight.toT, k);
    camera.position.lerpVectors(flight.fromC, flight.toC, k);
    if (flight.t >= 1) flight = null;
  }
  // Takip: hedef aracın ya da sakinin üstünde (harita) veya arkasında (omuz).
  if (follower.target && !flight) follower.update(dt);
  const shoulder = follower.target && follower.view === "omuz";
  // Hedef adanın çevresinde kalır; yüksekliği zemini izler (kamera da birlikte kayar).
  {
    const t = controls.target;
    const nx = THREE.MathUtils.clamp(t.x, bounds.x0 - 200, bounds.x1 + 200), nz = THREE.MathUtils.clamp(t.z, bounds.z0 - 200, bounds.z1 + 300);
    const ny = flight || dollhouse.isOpen() || shoulder || follower.target?.kind === "zeplin" ? t.y : THREE.MathUtils.lerp(t.y, Math.max(0, world.height(t.x, t.z)), 0.1);
    const d = new THREE.Vector3(nx - t.x, ny - t.y, nz - t.z);
    if (!shoulder && d.lengthSq() > 1e-8) { t.add(d); camera.position.add(d); }
  }
  // Video kaydı (video/kaydet.mjs): senaryo, varsa, kamerayı her karede kendisi yerleştirir.
  globalThis.__yonetmen?.(dt, unix);
  controls.update(dt);

  hidden.setDay(day);
  hidden.update(real);
  const skyState = sky.update(day, minute, controls.target);
  const light = skyState.light;
  zeplinNight = 1 - light;
  const dist = camera.position.distanceTo(controls.target);
  fitDepth(dist);
  const size = THREE.MathUtils.clamp(dist * 0.8, 25, 1400);
  const sc = sky.sun.shadow.camera;
  if (sc.right !== size) {
    sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size;
    sc.near = 1; sc.far = 2400;
    sc.updateProjectionMatrix();
  }
  if (frame % 6 === 0) updateWindows(minute, light, skyState.sunDeg);
  dollhouse.update(1 - light, real);
  vehicles.end();
  if (frame % 15 === 0) ui.tick(unix, minute, day, skyState.times);
  if (frame % 8 === 0 && ambience.enabled) ambience.update(soundEnv(dist, light, minute));
  driftClouds(clouds, dt);
  water.userData.tick(real);
  city.tick(real);
  harbor.userData.tick(real);
  beach.userData.tick?.(real);
  harbor.userData.setMinute(minute);
  bayram.update(day, minute, real, renderer.domElement.height / 900);
  fadeTrees(trees, dist);
  // Telefonda kart ekranın altını kapatır; görüntüyü yukarı kaydır.
  const cardOpen = !document.getElementById("card").hidden;
  if (cardOpen && innerWidth < 900) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
  else if (camera.view?.enabled) camera.clearViewOffset();
  scaleLabels(labels, camera);

  const sel = ui.selected();
  if (sel != null && shoulder) {
    marker.visible = false; // omuz görünümünde başının üstünde işaret olmaz
  } else if (sel != null) {
    marker.visible = true;
    const [x, z] = people.focusPoint(sel);
    const y = people.visible[sel] ? people.positions[sel * 3 + 1] : world.groundY(x, z);
    marker.position.set(x, y, z);
    pin.position.y = 2.6 + Math.sin(real * 3) * 0.15;
    ring.scale.setScalar(1 + (real % 1.2) * 0.4);
    ring.visible = true;
  } else {
    // Seçili araç: işaret aracın üstünde (park halindeyse park yerinde).
    const vr = ui.selectedVehicle();
    const lv = vr?.key ? traffic.active.get(vr.key) : null;
    const at = lv ? lv.route.position(lv.s) : vr?.slot != null ? traffic.slots[vr.slot] : null;
    marker.visible = !!at;
    if (at) {
      const tall = { bus: 1.7, itfaiye: 1.5, cop: 1.5, ambulans: 1.0 }[vr.kind] ?? 0;
      marker.position.set(at.x, world.surfaceY(at.x, at.z) + 0.06 + tall, at.z);
      pin.position.y = 2.6 + Math.sin(real * 3) * 0.15;
      ring.visible = false;
    }
  }

  tryFollow();
  // Video kaydı (__etiket): izlenen sakinin etiketi seçiliymiş gibi önde, ama işaretsiz.
  nameTags.update(camera, controls.target, people, residents, globalThis.__etiket ?? ui.selected(), shoulder ? follower.target.i ?? null : null);
  mapUI.update(real);
  renderer.render(scene, camera);
  if (frame === 1) {
    console.info(`Driftwood ready: ${Math.round(performance.now())} ms`);
    ready();
  }
  adaptQuality(real);
  frame++;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ?bak=x,z,uzaklık: kamerayı bir noktaya çevirir (ekran görüntüsü ve paylaşım için).
const look = params.get("bak")?.split(",").map(Number);
if (look?.length >= 2 && look.every(Number.isFinite)) {
  const [lx, lz, ld = 60] = look;
  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.set(lx, world.groundY(lx, lz), lz);
  camera.position.copy(controls.target).addScaledVector(dir, ld);
}

const wanted = params.get("bul");
if (wanted) setTimeout(() => ui.find(wanted), 300);

// ?takip=yol|meydan|is|<hobi>[:sıra]: o anda bunu yapan (görünür) bir sakini seçer — denetim ve paylaşım için.
const follow = params.get("takip");
let followDone = !follow;
function tryFollow() {
  if (followDone || frame < 3) return;
  followDone = true;
  const [what, nth = "0"] = follow.split(":");
  const hits = [];
  for (let i = 0; i < residents.length; i++) {
    const a = people.activities[i];
    if (!people.visible[i] || !a) continue;
    if (a.ne === what || (a.ne === "hobi" && people.hobbies[i].id === what)) hits.push(i);
  }
  console.info(`follow ${what}: ${hits.length} residents`);
  if (hits.length) ui.select(hits[Number(nth) % hits.length]);
}
