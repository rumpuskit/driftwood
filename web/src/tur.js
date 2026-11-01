// Ada turu: ilk gelen için kamerayla 30 saniyelik gezinti (meydan, mahalle, iskele, tepe ve fener, plaj, günün
// olayı, sıradaki şantiye). Her durakta gerçek bilgi; kullanıcı kamerayı tutunca ya da "Turu bitir"de biter.
import * as sim from "./sim.js";
import { FERRY } from "./world/ferry.js";
import { num, plural } from "./fmt.js";

const $ = (id) => document.getElementById(id);
const yerAdi = (kind, yedek) => sim.cat()?.isyerleri?.[kind]?.[0] ?? yedek;

export function createTour({ world, people, residents, flyTo, cinema, vec }) {
  let timer = null, running = false;

  function stops() {
    const out = [];
    const N = residents.length;
    const out1 = people.activities.filter((a) => a && !["ev", "uyku", "is"].includes(a.ne)).length;
    out.push({ at: [0, 0], d: 90, t: "Town Green", s: N ? `${plural(N, "resident")} live on the island; ${num(out1)} are out and about right now.` : "The island is waiting for its first resident." });
    const homes = world.buildings.filter((b) => b.daireler);
    if (homes.length) {
      const cx = homes.reduce((a, b) => a + b.x, 0) / homes.length, cz = homes.reduce((a, b) => a + b.z, 0) / homes.length;
      const mahalleler = new Set(sim.cat().mahalleler);
      const lab = world.labels.find((l) => mahalleler.has(l.text));
      out.push({ at: [cx, cz], d: 120, t: lab?.text ?? "Homes", s: "Every follower has a home here. Type your @username in the search bar to find yours." });
    }
    const pier = world.ferryPier;
    if (pier) out.push({ at: [0, pier.z0 + 30], d: 80, t: "Ferry Landing", s: `The ferry comes in every ${FERRY.period} minutes. Newcomers arrive here, and mainland commuters leave from here.` });
    if (world.places.tepe) out.push({ at: world.places.tepe.anchors[0], d: 110, t: "Bluff Head", s: "A hiking trail, picnic blankets and sunsets in the evening." });
    if (world.fener) out.push({ at: [world.fener.x, world.fener.z], d: 70, t: yerAdi("fener", "Gull Point Light"), s: "The oldest building on the island. It shines all night." });
    const plaj = world.places.plaj?.anchors;
    if (plaj?.length) out.push({ at: cinema?.spot ?? plaj[plaj.length >> 1], d: 90, t: yerAdi("plaj", "Ocean Beach"), s: "Beach walks and stone skipping; movie night on Saturday evenings." });
    const th = people.theme;
    if (th) out.push({ at: th.yer === "plaj" && cinema ? cinema.spot : world.placeOf(th.yer).anchors[0], d: 100, t: "Today", s: th.ad });
    const ns = world.nextStage;
    if (ns?.at) out.push({ at: ns.at, d: 110, t: `Next: ${ns.name}`, s: `Opens with ${plural(Math.max(1, ns.nufus - N), "more resident")}. Follow and move to the island.` });
    return out;
  }

  function show(st) {
    $("tur-yazi").innerHTML = "";
    $("tur-yazi").append(st.t);
    const small = document.createElement("small");
    small.textContent = st.s;
    $("tur-yazi").append(small);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearTimeout(timer);
    $("tur").hidden = true;
    document.body.classList.remove("tur");
    try { localStorage.setItem("tur", "1"); } catch {}
  }

  function start() {
    const list = stops();
    if (!list.length) return;
    running = true;
    $("tur").hidden = false;
    document.body.classList.add("tur");
    let n = 0;
    const step = () => {
      if (!running) return;
      if (n >= list.length) return stop();
      const st = list[n++];
      const [x, z] = st.at;
      const a = n * 0.9;
      flyTo(x, Math.max(0, world.height(x, z)), z, st.d, vec(Math.sin(a), 0.75, Math.cos(a)), 2.2);
      show(st);
      timer = setTimeout(step, 4300);
    };
    step();
  }

  /** İlk gelişte öneri: "Başla" turu açar, "Geç" bir daha sormaz. 12 sn sonra kendiliğinden kapanır. */
  let offerTimer = null;
  function offer() {
    if (running) return;
    $("tur-yazi").textContent = "First time here?";
    const small = document.createElement("small");
    small.textContent = "Take a 30-second tour of the island.";
    $("tur-yazi").append(small);
    $("tur-basla").hidden = false;
    $("tur-bitir").textContent = "Skip";
    $("tur").hidden = false;
    offerTimer = setTimeout(() => { if (!running) closeOffer(); }, 12000);
  }
  function closeOffer() {
    clearTimeout(offerTimer);
    $("tur-basla").hidden = true;
    $("tur-bitir").textContent = "End tour";
    if (!running) $("tur").hidden = true;
  }
  $("tur-basla").addEventListener("click", () => { closeOffer(); start(); });
  $("tur-bitir").addEventListener("click", () => {
    if (!running) { closeOffer(); try { localStorage.setItem("tur", "1"); } catch {} return; }
    stop();
  });
  return { start, stop, offer, get running() { return running; }, seen: () => { try { return localStorage.getItem("tur") === "1"; } catch { return true; } } };
}
