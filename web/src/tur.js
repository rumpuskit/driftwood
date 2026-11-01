// Ada turu: ilk gelen için kamerayla 30 saniyelik gezinti (meydan, mahalle, iskele, tepe ve fener, plaj, günün
// olayı, sıradaki şantiye). Her durakta gerçek bilgi; kullanıcı kamerayı tutunca ya da "Turu bitir"de biter.
import * as sim from "./sim.js";

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("tr-TR");

export function createTour({ world, people, residents, flyTo, cinema, vec }) {
  let timer = null, running = false;

  function stops() {
    const out = [];
    const N = residents.length;
    const out1 = people.activities.filter((a) => a && !["ev", "uyku", "is"].includes(a.ne)).length;
    out.push({ at: [0, 0], d: 90, t: "Meydan", s: N ? `Adada ${fmt.format(N)} kişi yaşıyor; şu an ${fmt.format(out1)} kişi dışarıda.` : "Ada ilk sakinini bekliyor." });
    const homes = world.buildings.filter((b) => b.daireler);
    if (homes.length) {
      const cx = homes.reduce((a, b) => a + b.x, 0) / homes.length, cz = homes.reduce((a, b) => a + b.z, 0) / homes.length;
      const lab = world.labels.find((l) => /Mahallesi$/.test(l.text));
      out.push({ at: [cx, cz], d: 120, t: lab?.text ?? "Evler", s: "Takip eden herkesin burada bir evi var. Arama çubuğuna @kullanıcıadını yaz, evini bul." });
    }
    const pier = world.ferryPier;
    if (pier) out.push({ at: [0, pier.z0 + 30], d: 80, t: "Vapur iskelesi", s: "Vapur 20 dakikada bir yanaşıyor. Yeni gelenler buradan iner, anakarada çalışanlar buradan gider." });
    if (world.places.tepe) out.push({ at: world.places.tepe.anchors[0], d: 110, t: "Tepe", s: "Yürüyüş patikası, piknik örtüleri, akşamları gün batımı." });
    if (world.fener) out.push({ at: [world.fener.x, world.fener.z], d: 70, t: "Fener", s: "Adanın en eski yapısı. Gece boyu yanar." });
    const plaj = world.places.plaj?.anchors;
    if (plaj?.length) out.push({ at: cinema?.spot ?? plaj[plaj.length >> 1], d: 90, t: "Plaj", s: "Kumsal yürüyüşleri, taş sektirenler; cumartesi akşamı açık hava sineması." });
    const th = people.theme;
    if (th) out.push({ at: th.yer === "plaj" && cinema ? cinema.spot : world.placeOf(th.yer).anchors[0], d: 100, t: "Bugün", s: th.ad });
    const ns = world.nextStage;
    if (ns?.at) out.push({ at: ns.at, d: 110, t: `Sırada: ${ns.name}`, s: `${fmt.format(Math.max(1, ns.nufus - N))} kişi daha gelince açılıyor. Takip et, adaya taşın.` });
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
    $("tur-yazi").textContent = "İlk kez mi geliyorsun?";
    const small = document.createElement("small");
    small.textContent = "30 saniyelik ada turu: meydan, evler, iskele, tepe, plaj ve bugünün olayı.";
    $("tur-yazi").append(small);
    $("tur-basla").hidden = false;
    $("tur-bitir").textContent = "Geç";
    $("tur").hidden = false;
    offerTimer = setTimeout(() => { if (!running) closeOffer(); }, 12000);
  }
  function closeOffer() {
    clearTimeout(offerTimer);
    $("tur-basla").hidden = true;
    $("tur-bitir").textContent = "Turu bitir";
    if (!running) $("tur").hidden = true;
  }
  $("tur-basla").addEventListener("click", () => { closeOffer(); start(); });
  $("tur-bitir").addEventListener("click", () => {
    if (!running) { closeOffer(); try { localStorage.setItem("tur", "1"); } catch {} return; }
    stop();
  });
  return { start, stop, offer, get running() { return running; }, seen: () => { try { return localStorage.getItem("tur") === "1"; } catch { return true; } } };
}
