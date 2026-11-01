// Ekrandaki paneller: saat ve nüfus, zaman hızı, "Kendini bul" araması, sakin kartı ve ev içi görünümü.
import * as sim from "./sim.js";
import { HOME_LABELS, homeActivity } from "./world/life.js";
import { TIKTOK, TIKTOK_URL, ZEPLIN_REKLAM, hourText, nextMove } from "./config.js";
import { DAYS, clockText, feet, mph, num, ordinal, plural } from "./fmt.js";
import { svg, BINA_SIMGE, ARAC_SIMGE } from "./icons.js";
import { ETKINLIK } from "./world/etkinlik.js";
import { residentCard, shareCanvas } from "./paylas.js";

// Yer adları: iş yeri olanlar katalogdan (isyerleri), diğerleri Driftwood'un sabit yer adları (CLAUDE.md §13).
const yerAdi = (kind, yedek) => sim.cat()?.isyerleri?.[kind]?.[0] ?? yedek;
const PLACE_NAMES = {
  meydan: "Town Green", iskele: "Town Dock", park: "Kettle Pond Park", sahil_yolu: "Harbor Walk", plaj: "Ocean Beach",
  tepe: "Bluff Head", fener: "Gull Point Light", kahvehane: "Driftwood Diner", pazar: "Farmers Market", saha: "Gulls Field",
};
const OUT_LABELS = {
  meydan: "On the Town Green", park: "Strolling in the park", sahil_yolu: "Walking the Harbor Walk",
  kahvehane: "At the Diner", pazar: "Shopping at the Farmers Market", saha: "At Gulls Field",
};
const HOUSE_TYPES = { cottage: "Cottage", twofamily: "Two-family house", fourplex: "Fourplex", apartments: "Apartment building" };
// Unvan cümle içinde küçük harfle ("a baker"); kısaltmalar (JV) olduğu gibi kalır.
const lower = (t) => t.replace(/\b[A-Z](?=[a-z])/g, (c) => c.toLowerCase());
const aOrAn = (t) => (/^[aeiou]/i.test(t) ? "an " : "a ") + t;
// Buluşma yerinde ne yapıyor (yer anahtarına göre); yanında kimin olduğu ayrıca eklenir.
// Etkinliklerin yeri (etkinlik.js yer anahtarları) kart ve "Bugün" listesinde.
const EXTRA_PLACES = { iskele_vapur: "Ferry Landing", kiyi: "The shore", kapi: "Front porch", market: "The store", firin: "The bakery", cami: "The church", sahil_yolu: "Harbor Walk", sinema: "Beach movie night" };

// İş yeri adı olmayan binaların kartta görünen adı.
const BUILDING_NAMES = { cami: "Church", liman: "Ferry Landing", ambar: "Harbor warehouse", tersane: "Boatyard", kulube: "Fishing shack", ahir: "Farm", itfaiye: "Fire station", garaj: "Public works garage", bufe: "Snack bar", carsi: "Main Street shop" };

const $ = (id) => document.getElementById(id);
// Sakinin görünen adı: adını gizlemek isteyenler "Private neighbor" olarak görünür.
export const at = (r) => (r.hidden ? "Private neighbor" : "@" + r.handle);

export function createUI({ residents, people, world, dollhouse, stories, traffic, zeplin = null, capture = null, claim = null, follow, setSpeed, flyTo, speed, today, minute, waiting = 0, listError = null, secim = null }) {
  const byHandle = new Map(residents.map((r, i) => [r.handle, i]));
  $("cta").href = TIKTOK_URL;
  // İskelede bekleyenler: takip etmiş, sıradaki taşınmayı bekleyenler. Dokununca iskeleye uçar.
  if (waiting > 0 && world.ferryPier) {
    const btn = $("waiting");
    btn.hidden = false;
    btn.innerHTML = svg("valiz");
    btn.append(`${num(waiting)} waiting at the Ferry Landing · move-in ${nextMove()}`);
    btn.addEventListener("click", () => {
      const P0 = world.ferryPier;
      flyTo(0, P0.top, P0.z0 + 14, 45);
    });
  }
  // Belediye başkanlığı seçimi (açıkken): kalan süre ve önde giden; dokununca belediyeye gider, kart adayları gösterir.
  const belediye = () => Object.values(world.workplaces.belediye ?? []).find(Boolean)?.building;
  if (secim?.durum === "acik") {
    const btn = $("secim");
    const kalan = Math.max(0, secim.bitis - Date.now() / 1000);
    const sure = kalan > 86400 ? `${plural(Math.ceil(kalan / 86400), "day")} left` : kalan > 3600 ? `${plural(Math.ceil(kalan / 3600), "hour")} left` : "final hour";
    const lider = secim.adaylar?.find(([h]) => h);
    btn.hidden = false;
    btn.innerHTML = svg("sandik");
    btn.append(`Mayoral election · ${sure}` + (lider ? ` · @${lider[0]} leads` : " · to run, comment “I'm running”"));
    btn.addEventListener("click", () => { const b = belediye(); if (b) openBuilding(b); });
  }

  // Sıradaki gelişim adımı: kaç sakin daha gelince ne açılacak; çubuk bir önceki adımdan bu yana ilerleme.
  // Dokununca yerine (şantiyeye) uçar.
  const ns = world.nextStage;
  if (ns) {
    const btn = $("next");
    const need = Math.max(1, ns.nufus - residents.length);
    const prev = Math.max(0, ...sim.cat().gelisim.map((g) => g.nufus).filter((n) => n < ns.nufus));
    btn.hidden = false;
    $("next-name").textContent = ns.name;
    $("next-need").textContent = waiting >= need ? `at the ${nextMove()} move-in` : `${plural(need, "more resident")}`;
    // Adımın başında da çubuk görünsün (en az %4).
    $("next-bar").style.width = `${Math.round(Math.min(1, Math.max(0.04, (residents.length - prev) / (ns.nufus - prev))) * 100)}%`;
    if (ns.at) btn.addEventListener("click", () => flyTo(ns.at[0], world.groundY(ns.at[0], ns.at[1]), ns.at[1], 110));
  }
  let selected = null;
  let mode = null; // "sakin" | "bina" | "arac"
  let vehicle = null; // seçili aracın kaydı
  let tab = "simdi";
  for (const btn of document.querySelectorAll("#card-tabs button")) {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      for (const b of document.querySelectorAll("#card-tabs button")) b.classList.toggle("on", b === btn);
      render();
    });
  }

  for (const btn of document.querySelectorAll("#speed button")) {
    btn.classList.toggle("on", Number(btn.dataset.speed) === speed);
    btn.addEventListener("click", () => {
      setSpeed(Number(btn.dataset.speed));
      for (const b of document.querySelectorAll("#speed button")) b.classList.toggle("on", b === btn);
    });
  }

  function placeLabel(i, yer) {
    if (yer === "ev") return "Home";
    if (yer === "is") return people.works[i].loc.name;
    if (yer.startsWith("mahalle:")) return sim.isOpen(`cay:${yer.slice(8)}`) ? "Neighborhood ice cream parlor" : "Neighborhood";
    const key = yer.replace("hobi:", "");
    if (key === "iskele" && !world.places.iskele) return "The shore"; // balık iskelesi açılana kadar kıyıdan balık tutulur
    if (PLACE_NAMES[key] && !world.places[key]) return PLACE_NAMES.meydan; // yeri henüz açılmamış hobi meydanda geçer
    if (key === "kahvehane" || key === "saha" || key === "fener" || key === "plaj") return yerAdi(key, PLACE_NAMES[key]);
    return PLACE_NAMES[key] ?? EXTRA_PLACES[key] ?? yer;
  }

  /** Yolculuğun gerçek varış yeri: "meydan" planı saate göre farklı yerlere dağılır. */
  function destOf(i, seg) {
    if (seg.nereye !== "meydan" && !seg.nereye.startsWith("hobi:")) return seg.nereye;
    const k = people.plans[i].findIndex((q) => q.bas === seg.son);
    return k >= 0 ? people._placeOf(i, k) ?? "meydan" : "meydan";
  }

  function nowText(i) {
    const seg = people.activities[i];
    if (!seg) return "";
    switch (seg.ne) {
      case "uyku":
      case "ev": {
        const act = homeActivity(residents[i].seed, seg, minute(), today(), people.hobbies[i].id, people.homeWork?.[i]);
        return (seg.ne === "ev" ? "At home · " : "") + HOME_LABELS[act];
      }
      case "is": {
        const j = people.works[i].job;
        if (j === "ogrenci") return "On the mainland, at college";
        if (j === "anakara") return "On the mainland, at work";
        if (j === "zeplin_pilotu") return zeplin?.pose.visible ? "Flying the blimp" : "On the mainland, at the blimp base";
        return `At work · ${people.works[i].loc.name}`;
      }
      case "yol": {
        const d = destOf(i, seg);
        // Yolculuk varışa yetişecek saatte başlar; o ana kadar evinde bekler (görünmez).
        const leg = people.travelCache[i]?.legs.find((l) => minute() < l.t1);
        if (!people.visible[i] && leg?.kind === "before" && seg.nereden === "ev") return `At home, heading out soon → ${placeLabel(i, d)}`;
        if (d === "is" && (people.works[i].wp.kind === "anakara" || people.works[i].wp.kind === "zeplin")) return seg.nereden === "ev" ? "Heading out to catch the ferry" : "Off the ferry, heading home";
        return d === "ev" ? "Heading home" : `On the way → ${placeLabel(i, d)}`;
      }
      case "hobi":
      case "meydan": {
        // Günün etkinliği (etkinlik.js): kartta ne yaptığı; sosyal etkinlikte yanında kimin olduğu.
        const act = people.currentAct[i];
        if (act && ETKINLIK[act]) {
          const near = company(i);
          const e = ETKINLIK[act];
          if (!e.sosyal) return e.ad;
          return `${e.ad}, ${near.length === 0 ? "alone" : near.length === 1 ? `with ${at(residents[near[0]])}` : act === "kapi_onu" ? "with the neighbors" : "with friends"}`;
        }
        if (seg.ne === "hobi") return `${people.hobbies[i].ad} · ${placeLabel(i, seg.yer)}`;
        const pl = people.currentPlace[i] ?? "meydan";
        const yer = pl.startsWith("mahalle:") ? (sim.isOpen(`cay:${pl.slice(8)}`) ? "At the neighborhood ice cream parlor" : "Around the neighborhood")
          : OUT_LABELS[pl] ?? "On Main Street";
        // Yalnız gerçekten yanında biri varsa "arkadaşlarıyla" (12 m içinde dışarıda vakit geçiren sakinler).
        const near = company(i);
        const kim = pl.startsWith("mahalle:") ? "with the neighbors" : "with friends";
        return `${yer}, ${near.length === 0 ? "alone" : near.length === 1 ? `with ${at(residents[near[0]])}` : kim}`;
      }
      default: return seg.ne;
    }
  }

  /** i'nin yakınında (12 m) dışarıda vakit geçiren diğer sakinler. */
  function company(i) {
    const P = people.positions, out = [];
    for (let j = 0; j < residents.length; j++) {
      if (j === i || !people.visible[j] || !["meydan", "hobi"].includes(people.activities[j]?.ne)) continue;
      if (Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 2] - P[i * 3 + 2]) < 12) out.push(j);
    }
    return out;
  }

  function facts(rows) {
    $("card-facts").replaceChildren(...rows.flatMap(([k, v, onClick]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      if (onClick) { dd.classList.add("link"); dd.addEventListener("click", onClick); }
      return [dt, dd];
    }));
  }

  const link = (j) => [at(residents[j]), () => select(j)];

  /** Kişinin kendisi için: yorumla seçtikleri ve henüz seçebilecekleri (istekler sonraki taşınmada işlenir). */
  function senMisin(r, unvan) {
    const o = r.overrides ?? {};
    const secti = [o.meslek && `your job (${unvan})`, o.hobi && "your hobby", o.evcil && "your pet"].filter(Boolean);
    const oneri = [!o.meslek && "“job: fisherman”", !o.hobi && "“hobby: chess”", !o.evcil && "“pet: cat”"].filter(Boolean);
    const bas = secti.length ? `You picked ${secti.join(", ").replace(/, ([^,]*)$/, " and $1")}. ` : "";
    const ne = oneri.length ? `Comment ${oneri.join(", ")} or “hide my name” on one of our videos` : "To change it, comment again on one of our videos (e.g. “job: baker”) or “hide my name”";
    return `${bas}${ne}; it takes effect at the next move-in.`;
  }

  function renderPerson() {
    const r = residents[selected];
    const day = today();
    const t = sim.tenure(r, day);
    $("card-handle").textContent = at(r);
    icon(r.hidden ? "?" : r.handle[0].toUpperCase(), `hsl(${r.seed % 360} 62% 58%)`);
    // İş yerinin adı yalnızca gerçek bir iş yeri varsa (emekli ve evden çalışanlarda yok).
    const wk = people.works[selected];
    // Asıl mesleğinin iş yeri adada henüz yoksa mesleğini anakarada yapar (vapurla gidip gelir).
    const dream = sim.dreamJob(r);
    const dreamTitle = dream.kademeler[Math.min(sim.rank(r, day), dream.kademeler.length - 1)];
    $("card-title").textContent = wk.wp.kind === "ev" ? (wk.job === "emekli" ? "Retired" : `${sim.title(r, day)} · works from home`)
      : dream.id !== wk.job ? `${dreamTitle} · works on the mainland, takes the ferry`
      : wk.job === "ogrenci" ? `${sim.title(r, day)} · takes the ferry to college`
      : wk.wp.kind === "anakara" ? `${sim.title(r, day)} · works on the mainland, takes the ferry` : `${sim.title(r, day)} · ${wk.loc.name}`;
    $("card-dream").hidden = dream.id === wk.job;
    if (dream.id !== wk.job) {
      const opens = sim.cat().isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((a, b) => a[0] - b[0])[0];
      $("card-dream").innerHTML = svg("vinc");
      $("card-dream").append(dream.yer === "zeplin" ? `Will fly the ${opens[1]} when it arrives (${plural(opens[0], "resident")})`
        : `Will be ${aOrAn(lower(dreamTitle))} when ${opens[1]} opens (${plural(opens[0], "resident")})`);
    }
    $("card-now").textContent = nowText(selected);
    $("card-tabs").hidden = false;
    $("card-traits").replaceChildren();
    const f = follow.get();
    followActions(f?.kind === "sakin" && f.i === selected ? f.view : null, { kind: "sakin", i: selected }, ["goz", "Over the shoulder"]);
    // Kendini bulan için davet: "This is me" doğrulamaya (My home) adı dolu götürür; doğrulanmışsa "Decorate my home".
    if (!r.hidden && claim?.open) action(["ev", claim.me?.() === r.handle ? "Decorate my home" : "This is me"], () => claim.open(r.handle));
    // Paylaş en sonda: My home'daki "Share my card" son düğmeye basar.
    if (!r.hidden && capture) action(["paylas", "Share"], () => shareResident(selected));
    if (tab === "bugun") {
      const homeLabel = (k) => {
        const seg = people.plans[selected][k];
        const act = homeActivity(r.seed, seg, seg.bas + 1, day, people.hobbies[selected].id, people.homeWork?.[selected]);
        return "At home · " + HOME_LABELS[act].toLowerCase();
      };
      const placeName = (yer) => placeLabel(selected, yer);
      facts(stories.today(selected, placeName, homeLabel));
      return;
    }
    if (tab === "hikaye") {
      $("card-traits").replaceChildren(...stories.traits(selected).map((x) => {
        const span = document.createElement("span");
        span.textContent = x;
        return span;
      }));
      const rows = [];
      const f = stories.friend[selected];
      if (f >= 0) rows.push(["Best friend", ...link(f)]);
      const pet = stories.petName(selected);
      if (pet) rows.push(["Pet", `${pet.kind} · ${pet.name}`]);
      const nb = stories.neighbors(selected).slice(0, 3);
      nb.forEach((j, n) => rows.push([n === 0 ? "Neighbors" : "", ...link(j)]));
      const cw = stories.coworkers(selected).slice(0, 3);
      cw.forEach((j, n) => rows.push([n === 0 ? "Coworkers" : "", ...link(j)]));
      for (const e of stories.timeline(selected).slice(0, 8)) rows.push([e.date, e.text]);
      facts(rows);
      return;
    }
    const pet = sim.pet(r, day);
    facts([
      ["Address", sim.addressText(r.slot)],
      ["Hobby", people.hobbies[selected].ad],
      ["Pet", pet || "None yet"],
      ["On the island", t === 0 ? "Arrived today" : t === 1 ? "Arrived yesterday" : plural(t, "day")],
      ["Getting around", (people.hasCar[selected] ? "Own car" : world.vehicles ? "Bus and on foot" : "On foot (no cars on the island yet)") + (["anakara", "zeplin"].includes(people.works[selected].wp.kind) ? " · ferry to work" : "")],
      // İstekler videolarımızın yorumlarından okunur (sunucuda istekler.py; biçim orada).
      ...(!r.hidden ? [["Is this you?", senMisin(r, dreamTitle)]] : []),
    ]);
  }

  function renderBuilding() {
    $("card-dream").hidden = true; // sakin kartından kalan "açılınca adada çalışacak" satırı binada/araçta görünmesin
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const b = dollhouse.building;
    if (!b.daireler) {
      icon(svg(BINA_SIMGE[b.kind] ?? "bina"), null, true);
      $("card-handle").textContent = dollhouse.workName ?? b.isim ?? (/Fener|Gull Point/.test(b.address ?? "") ? "Lighthouse keeper's house" : BUILDING_NAMES[b.kind] ?? "Shop");
      $("card-title").textContent = `${b.address ?? ""} · ${ordinal(dollhouse.floor + 1)} floor`;
      // Yalnızca şu an bu katta çalışanlar (izinli, yolda ya da evde olanlar listelenmez).
      const rows = [];
      let total = 0;
      for (const [i] of dollhouse.workSpots) {
        total++;
        if (people.activities[i]?.ne !== "is") continue;
        rows.push([sim.title(residents[i], today()), at(residents[i]), () => select(i)]);
      }
      $("card-now").textContent = rows.length ? `${plural(rows.length, "person", "people")} working now (staff of ${num(total)} on this floor)` : total ? `Nobody is working right now (staff of ${num(total)})`
        : b.kind === "muhtarlik" ? "No association president yet. The first to ask gets the seat: comment “job: association president” on one of our videos." : "Nobody works on this floor";
      if (b.kind === "belediye" && secim) {
        // Seçim: açıkken adaylar ve oyları, bittiyse başkan. Adını gizleyenler "Gizli aday".
        const ad = (h) => (h ? "@" + h : "Private candidate");
        const sec = secim.durum === "acik"
          ? [["Election", "To run, comment “I'm running” on one of our videos; to vote, comment “vote: @handle” (island residents only)"],
             ...(secim.adaylar ?? []).map(([h, n], k) => [k === 0 ? "Candidates" : "", `${ad(h)} · ${plural(n, "vote")}`])]
          : [["Mayor", secim.kazanan ? "@" + secim.kazanan : "Private neighbor"]];
        facts([...sec, ...rows.slice(0, 10)]);
        return;
      }
      facts(rows.slice(0, 12));
      if (rows.length > 12) facts([...rows.slice(0, 12), ["", `and ${num(rows.length - 12)} more`]]);
      return;
    }
    icon(svg("ev"), null, true);
    const p = sim.addressParts(b.slot0), house = sim.houseOf(b.slot0);
    $("card-handle").textContent = `${house.ev + 1} ${sim.sokakName(p.mahalle, p.sokak)}`;
    $("card-title").textContent = `${sim.mahalleName(p.mahalle)}, ${sim.adaName(p.ada)} · ${HOUSE_TYPES[house.tip] ?? "Home"}`;
    $("card-now").textContent = `${ordinal(dollhouse.floor + 1)} floor`;
    const rows = [];
    for (let c = 0; c < b.perFloor; c++) {
      const k = dollhouse.floor * b.perFloor + c;
      if (k >= b.daireler) continue;
      const i = people.slotToIndex.get(b.slot0 + k);
      const h = sim.houseOf(b.slot0 + k), unit = h.apt ? `Apt ${h.apt}` : `No. ${h.ev + 1}`;
      if (i == null) rows.push([unit, "Empty, waiting for a new resident"]);
      else rows.push([unit, `${at(residents[i])} · ${nowText(i)}`, () => select(i)]);
    }
    facts(rows);
  }

  function render() {
    $("floorbar").hidden = !dollhouse.isOpen();
    if (dollhouse.isOpen()) $("floor-label").textContent = `${ordinal(dollhouse.floor + 1)} floor`;
    pending = [];
    if (mode === "sakin" && selected != null) renderPerson();
    else if (mode === "bina" && dollhouse.isOpen()) renderBuilding();
    else if (mode === "arac" && vehicle) renderVehicle();
    flushActions();
  }

  const KIND_NAMES = { car: "Car", taxi: "Taxi", bus: "Bus", ambulans: "Ambulance", itfaiye: "Fire truck", cop: "Garbage truck", zeplin: "Blimp" };

  // Kart birkaç karede bir yeniden çizilir; düğmeler değişmediyse yerinde kalır (yoksa basılırken
  // DOM'dan kopar ve dokunuş boşa gider). Yalnızca tıklama işlevleri tazelenir.
  let pending = [];
  function action(label, onClick, primary = false) {
    pending.push({ label, onClick, primary });
  }

  function flushActions() {
    const box = $("card-actions");
    const sig = pending.map((a) => String(a.label) + (a.primary ? "*" : "")).join("|");
    if (box.dataset.sig === sig) {
      [...box.children].forEach((b, n) => { b._onClick = pending[n].onClick; });
      return;
    }
    box.dataset.sig = sig;
    box.replaceChildren(...pending.map((a) => {
      const b = document.createElement("button");
      // Etiket: düz metin ya da [simge, metin].
      if (Array.isArray(a.label)) { b.innerHTML = svg(a.label[0]); b.append(a.label[1]); } else b.textContent = a.label;
      if (a.primary) b.classList.add("primary");
      b._onClick = a.onClick;
      b.addEventListener("click", () => b._onClick());
      return b;
    }));
  }

  function renderVehicle() {
    $("card-dream").hidden = true; // sakin kartından kalan "açılınca adada çalışacak" satırı binada/araçta görünmesin
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const r = vehicle;
    const live = r.key ? traffic.active.get(r.key) : null;
    $("card-handle").textContent = KIND_NAMES[r.kind] ?? "Vehicle";
    icon(svg(ARAC_SIMGE[r.kind] ?? "araba"), null, true);
    const rows = [];
    if (r.kind === "zeplin") {
      const z = zeplin.pose;
      $("card-title").textContent = yerAdi("zeplin", "Driftwood Blimp");
      const m = minute();
      $("card-now").textContent = z.visible
        ? { gelis: "Flying in from the mainland", tur: "Circling over the island", donus: "Heading back to the mainland" }[z.phase]
        : m < 540 ? `On the mainland, flies in at ${hourText(9)}` : `On the mainland, back tomorrow at ${hourText(9)}`;
      if (z.visible) rows.push(["Speed", mph(z.speed)], ["Altitude", feet(z.y)]);
      rows.push(["Flights", `Daily, ${hourText(9)}–${hourText(22)}`]);
      // Pilotlar: mesleği zeplin pilotu olan sakinler (kartından açılır).
      for (let i = 0; i < residents.length; i++) if (sim.dreamJob(residents[i]).id === "zeplin_pilotu") rows.push(["Pilot", at(residents[i]), () => select(i)]);
      if (ZEPLIN_REKLAM.ad) rows.push(["Sponsored", ZEPLIN_REKLAM.ad]);
      facts(rows);
      const f = follow.get();
      if (z.visible) followActions(f?.kind === "zeplin" ? f.view : null, { kind: "zeplin" }, ["kamera", "Follow alongside"]);
      return;
    }
    if (r.kind === "bus") {
      const line = traffic.lines[r.line];
      $("card-title").textContent = `${line.name} · trip ${r.dep + 1}`;
      const n = live ? people.busSeat.get(live) ?? 0 : 0;
      $("card-now").textContent = live ? (live.v < 0.3 ? "Waiting at a stop or a light" : mph(live.v)) : "Finished its run";
      rows.push(["Riders", plural(n, "person", "people")], ["Stops", `${plural(line.stops.length, "stop")}, every ${line.headway} minutes`]);
    } else if (r.kind === "car" || r.kind === "taxi") {
      const owner = r.owner != null ? residents[r.owner] : null;
      $("card-title").textContent = r.kind === "taxi" ? "Driftwood Taxi" : owner ? `${at(owner)}'s car` : "Car";
      const done = r.key && !live; // yolculuk bitti, araç park yerinde
      $("card-now").textContent = r.parked ? "Parked" : live ? (live.parked ? "Just parked" : live.v < 0.3 ? "Waiting" : mph(live.v)) : done ? (r.kind === "taxi" ? "Dropped off a passenger" : "Just parked") : "Waiting for a fare";
      if (owner) rows.push([r.kind === "taxi" ? "Passenger" : "Owner", at(owner), () => select(r.owner)]);
    } else {
      $("card-title").textContent = { ambulans: yerAdi("saglik", "Driftwood Medical Center"), itfaiye: "Driftwood Fire Department", cop: "Driftwood Public Works" }[r.kind] ?? "";
      $("card-now").textContent = live ? ({ out: "Heading to a call", wait: "On a call", back: "Heading back" }[live.phase] ?? (live.v < 0.3 ? "Emptying a dumpster" : "On its pickup route")) : "Done for now";
    }
    facts(rows);
    const f = follow.get();
    const on = f?.kind === "arac" && f.key === r.key;
    if (live && (!live.parked || on)) followActions(on ? f.view : null, { kind: "arac", key: r.key }, ["kamera", "Follow behind"]);
  }

  /** Dokununca takip kendiliğinden başlar; kartta yalnız bakış açısı seçilir (haritadan ya da gözünden). */
  function followActions(view, target, shoulderLabel) {
    if (view === "omuz") action(["harita", "Back to map"], () => { follow.set(target, "harita"); render(); });
    else action(shoulderLabel, () => { follow.set(target, "omuz"); render(); });
  }

  /** Kart başlığındaki yuvarlak simge: harf (sakin) ya da çizgi simge (html: true). */
  function icon(text, color = null, html = false) {
    const el = $("card-icon");
    if (html) el.innerHTML = text; else el.textContent = text;
    el.style.background = color ?? "";
  }

  /** Araca dokununca: yoldaysa takip edilir, park halindeyse ona odaklanılır. */
  function selectVehicle(record) {
    if (!record) return;
    selected = null;
    mode = "arac";
    vehicle = record;
    dollhouse.close();
    const live = record.key ? traffic.active.get(record.key) : null;
    if (record.kind === "zeplin") follow.set({ kind: "zeplin" }, "harita");
    else if (live && !live.parked) follow.set({ kind: "arac", key: record.key }, "harita");
    else {
      follow.set(null);
      const at = record.slot != null ? traffic.slots[record.slot] : live?.route.position(live.s);
      if (at) flyTo(at.x, world.groundY(at.x, at.z), at.z, 45);
    }
    showCard();
  }

  $("gunun").addEventListener("click", () => {
    const th = people.theme;
    if (!th) return;
    const at = th.yer === "cami" ? world.workplaces.cami?.find(Boolean)?.door
      : th.id === "sinema" && people.cinema ? people.cinema.spot : world.placeOf(th.yer).anchors[0];
    if (at) { close(); flyTo(at[0], Math.max(0, world.height(at[0], at[1])), at[1], th.id === "sinema" ? 45 : 90); }
  });

  /** Kısa bildirim. */
  let toastTimer = null;
  function toast(text, ms = 3200) {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  /** Sakin kartını görsel olarak paylaşır: sahnede kendisi (evdeyse evi), altında kartı. */
  async function shareResident(i) {
    const r = residents[i];
    const day = today();
    // Kadraj: sakin görünüyorsa yakından (masada oturuyorsa tentenin altından, alçak açıyla); görünmüyorsa
    // bulunduğu yer (evdeyse evi, değilse iş yeri/durak çevresi).
    let frame = null;
    const ne = people.activities[i]?.ne;
    if (people.visible[i]) {
      const role = people.roles[i]?.[people.plans[i].findIndex((q) => q === people.activities[i] || (q.bas === people.activities[i]?.bas && q.ne === ne))];
      const table = role?.item?.table;
      frame = { target: [people.positions[i * 3], people.positions[i * 3 + 1] + 1.0, people.positions[i * 3 + 2]], dist: table ? 8 : 12, up: table ? 0.14 : 0.55, inside: !!people.poses[i].indoor };
    } else if (ne === "ev" || ne === "uyku" || (ne === "yol" && people.activities[i].nereden === "ev" && people.travelCache[i]?.legs.find((l) => minute() < l.t1)?.kind === "before")) {
      const b = homeOf(i);
      if (b) frame = { target: [b.x, b.floors * 3.2 * 0.45, b.z], dist: Math.max(b.w, b.d, b.floors * 3.2) * 3.2, up: 0.45 };
    } else {
      const [x, z] = people.focusPoint(i);
      frame = { target: [x, world.groundY(x, z) + 2, z], dist: 45, up: 0.7 };
    }
    const shot = capture(frame);
    const pet = stories.petName(i);
    const t = sim.tenure(r, day);
    const card = residentCard(shot, {
      handle: at(r), letter: r.handle[0].toUpperCase(), color: `hsl(${r.seed % 360} 62% 58%)`,
      title: $("card-title").textContent, now: nowText(i),
      rows: [
        ["Home", sim.streetAddress(r.slot)],
        ["Neighborhood", sim.mahalleName(sim.addressParts(r.slot).mahalle)],
        ["Hobby", people.hobbies[i].ad],
        ["Pet", pet ? `${pet.kind} · ${pet.name}` : "None yet"],
        ["On the island", t === 0 ? "Arrived today" : t === 1 ? "Arrived yesterday" : plural(t, "day")],
      ],
      link: `https://driftwood.rumpuskit.com/?bul=${encodeURIComponent(r.handle)}`,
    });
    const res = await shareCanvas(card, { name: `driftwood-${r.handle}`, text: `I live on Driftwood Island: ${$("card-title").textContent}.`, url: `https://driftwood.rumpuskit.com/?bul=${encodeURIComponent(r.handle)}` });
    if (res === "indirildi-kopyalandi") toast("Card downloaded, link copied");
    else if (res === "indirildi") toast("Card downloaded");
  }

  function showCard() {
    $("card").hidden = false;
    document.body.classList.add("kart-acik");
    render();
  }

  function flyToFloor() {
    const { target, front } = dollhouse.focus();
    const dir = front.clone().multiplyScalar(0.72).setY(0.7).normalize();
    const size = Math.max(dollhouse.building.w, dollhouse.building.d);
    flyTo(target.x, target.y, target.z, Math.max(innerWidth < innerHeight ? 34 : 19, size * (innerWidth < innerHeight ? 2.0 : 1.15)), dir);
  }

  function homeOf(i) {
    const slot = residents[i].slot;
    return world.buildings.find((b) => b.daireler && slot >= b.slot0 && slot < b.slot0 + b.daireler);
  }

  /** Sakini seçer; evdeyse evinin içini açar. */
  /** Sakini seçer ve takip eder (takip: false, takipteki kişi bir binaya girip çıkınca yalnız kartı tazelemek için). */
  function select(i, fly = true, takip = true) {
    selected = i;
    mode = "sakin";
    // Evdeyse ya da işteyse iç mekâna uçulur (takip yine sürer, yaklaşma uçuştan gelir); dışarıdaysa takip kamerayı getirir.
    if (takip) follow.set({ kind: "sakin", i }, "harita", { yaklas: false });
    const seg = people.activities[i];
    const atHome = seg && (seg.ne === "ev" || seg.ne === "uyku");
    const home = homeOf(i);
    const workB = seg?.ne === "is" && !people.works[i].loc.outdoor ? people.works[i].loc.building : null;
    if (workB && !["liman", "tersane"].includes(workB.kind)) {
      const floor = sim.roll(residents[i].seed, "kat") % workB.floors;
      if (dollhouse.building !== workB || dollhouse.floor !== floor) dollhouse.open(workB, floor);
      if (fly) flyToFloor();
    } else if (atHome && home) {
      const floor = Math.floor((residents[i].slot - home.slot0) / home.perFloor);
      if (dollhouse.building !== home || dollhouse.floor !== floor) dollhouse.open(home, floor);
      if (fly) flyToFloor();
    } else {
      dollhouse.close();
      if (takip) follow.set({ kind: "sakin", i }, "harita");
      else if (fly) {
        const [x, z] = people.focusPoint(i);
        flyTo(x, world.groundY(x, z), z, innerWidth < innerHeight ? 30 : 18);
      }
    }
    showCard();
  }

  /** Bir binaya dokununca: içini aç (her binanın iç mekânı var: konut, iş yeri, kamu binası). Takip biter. */
  function openBuilding(b) {
    if (!b) return;
    follow.set(null);
    selected = null;
    mode = "bina";
    dollhouse.open(b, dollhouse.building === b ? dollhouse.floor : 0);
    flyToFloor();
    showCard();
  }

  function changeFloor(delta) {
    if (!dollhouse.isOpen()) return;
    dollhouse.setFloor(dollhouse.floor + delta);
    mode = "bina";
    selected = null;
    flyToFloor();
    showCard();
  }

  function find(text) {
    const handle = sim.normalizeHandle(text);
    if (!handle) return;
    const i = byHandle.get(handle);
    if (i == null) {
      selected = null;
      mode = null;
      dollhouse.close();
      $("card").hidden = false;
      $("floorbar").hidden = true;
      $("card-handle").textContent = "@" + handle;
      $("card-title").textContent = "This username isn't on the island yet.";
      $("card-now").textContent = `If you follow @${TIKTOK} on TikTok, you're waiting at the Ferry Landing until the next move-in (${nextMove()}). ` +
        "If not, follow and move in too. (TikTok leaves some accounts, such as private ones, out of the follower list; those can't move in.)";
      $("card-facts").replaceChildren();
      $("card-tabs").hidden = true;
      $("card-traits").replaceChildren();
      return;
    }
    select(i);
  }

  function close() {
    selected = null;
    mode = null;
    vehicle = null;
    follow.set(null);
    dollhouse.close();
    $("card").hidden = true;
    document.body.classList.remove("kart-acik");
    $("floorbar").hidden = true;
  }

  $("card-close").addEventListener("click", close);
  $("floor-up").addEventListener("click", () => changeFloor(1));
  $("floor-down").addEventListener("click", () => changeFloor(-1));
  $("floor-exit").addEventListener("click", close);

  return {
    select,
    find,
    toast,
    openBuilding,
    selectVehicle,
    close,
    selected: () => (mode === "sakin" ? selected : null),
    selectedVehicle: () => (mode === "arac" && !$("card").hidden ? vehicle : null),
    tick(unix, minuteNow, day, times) {
      // Gün doğumu/batımı sığarsa (uzun gün adlarında ve telefonda gizlenir; tam metin ipucunda).
      const sunText = times?.rise != null ? ` · ${clockText(times.rise)}–${clockText(times.set)}` : "";
      const clock = $("clock"), text = `${clockText(minuteNow)} · ${DAYS[sim.weekday(day)]}`;
      if (clock.dataset.text !== text + sunText) {
        clock.dataset.text = text + sunText;
        clock.title = text + sunText;
        clock.innerHTML = `${text}<span class="sun">${sunText ? " · " + svg("gunes") + sunText.slice(3) : ""}</span>`;
        clock.classList.remove("dar");
        if (clock.scrollWidth > clock.clientWidth + 1) clock.classList.add("dar");
      }
      // Döküm benzetimden: işte, evde (uyuyanlar dahil) ve dışarıda (yolda, çarşıda, hobisinde).
      let work = 0, home = 0;
      for (const seg of people.activities) {
        if (!seg) continue;
        if (seg.ne === "is") work++;
        else if (seg.ne === "ev" || seg.ne === "uyku") home++;
      }
      const out = residents.length - work - home;
      // Toplam, dar ekranda gizlenir (satır kesilmesin).
      if (!residents.length) {
        $("stats").innerHTML = `<span class="bos"></span>`;
        $("stats").firstChild.textContent = listError === "none" ? "Couldn't load the resident list right now" : waiting ? "The island is waiting for its first residents" : "The island is waiting for its first resident";
      } else {
        const chip = (ic, n, t, cls = "") => `<span class="chip ${cls}"><b>${svg(ic)}${num(n)}</b><small>${t}</small></span>`;
        $("stats").innerHTML = chip("sakinler", residents.length, residents.length === 1 ? "resident" : "residents", "ana") + chip("is", work, "at work") + chip("ev", home, "at home") + chip("yurur", out, "out");
      }
      // Günün olayı (etkinlik.js): üst panelde tek satır; dokununca kamera olayın yerine gider.
      const th = people.theme, gun = $("gunun");
      gun.hidden = !th || !residents.length;
      if (th) {
        const key = `${th.id}|${th.ad}`;
        if (gun.dataset.key !== key) {
          gun.dataset.key = key;
          const ic = { cuma: "cami", sinema: "kamera", pazar: "sepet", ucurtma: "dag", gunbatimi: "gunes", balik: "balik", temizlik: "dalga", yildiz: "ampul", tavla: "fincan", komsuluk: "mahalle" }[th.id] ?? "gunes";
          gun.innerHTML = svg(ic);
          gun.append(`Today: ${th.ad}${th.bas != null ? ` · ${clockText(th.bas)}` : ""}`);
          gun.title = gun.textContent;
        }
      }
      if (!$("card").hidden) render();
    },
  };
}
