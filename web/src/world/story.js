// Sakinlerin hikâyeleri: kişilik özellikleri, ilişkiler (en yakın arkadaş, komşular, iş arkadaşları),
// adaya gelişten bugüne olaylar ve günün akışı. Hepsi simülasyondan ve tohumdan türetilir; aynı kişiye
// bakan herkes aynı hikâyeyi okur.
import { ETKINLIK } from "./etkinlik.js";
import { prefOf } from "../tercih.js";
import * as sim from "../sim.js";
import { clockText, dateText } from "../fmt.js";

// Anahtarlar katalogdaki evcil türleri (evcil_hayvanlar).
const PET_NAMES = {
  Cat: ["Luna", "Pepper", "Mittens", "Oliver", "Cleo", "Biscuit", "Smokey", "Ginger"],
  Dog: ["Max", "Bailey", "Scout", "Daisy", "Cooper", "Rosie", "Buster", "Maple"],
  Parrot: ["Captain", "Kiwi", "Sunny", "Polly"],
  Turtle: ["Shelly", "Tank", "Pickles", "Mr. Slow"],
};

const HOBBY_TRAIT = {
  balik: "Patient", kitap: "Bookworm", satranc: "Strategist", resim: "Artistic", bisiklet: "Sporty",
  yuzme: "Ocean lover", ucurtma: "Young at heart", gitar: "Music lover", fotograf: "Keen observer", kosu: "Sporty",
  cornhole: "Competitive", yoga: "Calm seeker", mangal: "Backyard chef",
};
const JOB_TRAIT = {
  doktor: "Helpful", hemsire: "Caring", ogretmen: "Patient explainer", yazilimci: "Tech enthusiast",
  tasarimci: "Eye for detail", avukat: "Quick-witted", mimar: "Planner", barista: "Friendly", garson: "Friendly",
  asci: "Foodie", firinci: "Early bird", balikci: "Early bird", cankurtaran: "Brave", rehber: "Chatty",
  fener_bekcisi: "Loves solitude", bahcivan: "Nature lover", ciftci: "Down to earth", kutuphaneci: "Bookworm",
  seramikci: "Handy", marangoz: "Handy", yelkenci: "Handy", ressam: "Artistic", muhasebeci: "Meticulous", memur: "Organized",
  liman_iscisi: "Hard worker", gemi_ustasi: "Craftsman", kasiyer: "Punctual", resepsiyonist: "Polite",
  kahveci: "Early bird", lunapark: "Fun-loving", polis: "Fair-minded", futbolcu: "Team player",
  anakara: "Ferry regular", ogrenci: "Eager learner", uzaktan: "Independent", emekli: "Seen it all",
};
const EXTRA_TRAITS = ["Funny", "Social butterfly", "Easygoing", "Nostalgic", "Curious", "Punctual", "Daydreamer", "Generous", "Tea lover", "Coffee lover"];

const dateOf = dateText;
// Adını gizleyen sakin hikâyelerde de "Private neighbor" olarak geçer.
const atOf = (r) => (r.hidden ? "Private neighbor" : "@" + r.handle);

export class Stories {
  constructor(people) {
    this.people = people;
    const res = people.residents;
    // En yakın arkadaş: aynı hobiyi paylaşanlar sıra numarasına göre ikişer eşleşir (karşılıklı).
    this.friend = new Int32Array(res.length).fill(-1);
    const byHobby = new Map();
    res.forEach((r, i) => {
      const h = people.hobbies[i].id;
      if (!byHobby.has(h)) byHobby.set(h, []);
      byHobby.get(h).push(i);
    });
    for (const list of byHobby.values()) {
      list.sort((a, b) => res[a].slot - res[b].slot);
      for (let k = 0; k + 1 < list.length; k += 2) {
        this.friend[list[k]] = list[k + 1];
        this.friend[list[k + 1]] = list[k];
      }
    }
    // İş arkadaşları: aynı iş yeri.
    this.workmates = new Map();
    res.forEach((r, i) => {
      // Evde olanların (emekli, evden çalışan) ve anakaraya gidenlerin ortak iş yeri yok.
      if (["ev", "anakara", "zeplin"].includes(people.works[i].wp.kind)) return;
      const key = people.works[i].wp.kind + ":" + people.works[i].wp.index;
      if (!this.workmates.has(key)) this.workmates.set(key, []);
      this.workmates.get(key).push(i);
    });
  }

  traits(i) {
    const p = this.people;
    const r = p.residents[i];
    const out = [];
    const add = (t) => { if (t && !out.includes(t)) out.push(t); };
    add(HOBBY_TRAIT[p.hobbies[i].id]);
    add(JOB_TRAIT[p.works[i].job]);
    const day = p.day;
    if (sim.pet(r, day)) add("Animal lover");
    const plan = p.plans?.[i];
    if (plan) {
      // Erkenci: sabah erken uyanan (gece vardiyasından dönenler sayılmaz).
      const wake = plan[0]?.ne === "uyku" ? plan[0].son : 420;
      if (wake < 390) add("Early bird");
      if (plan[0]?.ne === "is") add("Night owl");
      const sleep = plan.findLast((s) => s.ne === "uyku")?.bas ?? 1380;
      if (sleep > 1400) add("Night owl");
    }
    add(EXTRA_TRAITS[sim.roll(r.seed, "huy") % EXTRA_TRAITS.length]);
    return out.slice(0, 4);
  }

  petName(i) {
    const r = this.people.residents[i];
    const kind = sim.pet(r, this.people.day);
    if (!kind) return null;
    const names = PET_NAMES[kind] ?? ["Buddy"];
    // Doğrulanmış sakin evcilinin adını seçebilir (tercih.js).
    return { kind, name: prefOf(r.handle)?.evcil_ad ?? names[sim.roll(r.seed, "evcilAd") % names.length] };
  }

  neighbors(i) {
    const p = this.people;
    const slot = p.residents[i].slot;
    const per = sim.cap("daire_per_bina");
    const base = slot - (slot % per);
    const out = [];
    for (let s = base; s < base + per; s++) {
      const j = p.slotToIndex.get(s);
      if (j != null && j !== i) out.push(j);
    }
    return out;
  }

  coworkers(i) {
    const p = this.people;
    const key = p.works[i].wp.kind + ":" + p.works[i].wp.index;
    return (this.workmates.get(key) ?? []).filter((j) => j !== i);
  }

  /** Adaya gelişten bugüne olaylar (en yeniden eskiye). */
  timeline(i) {
    const p = this.people;
    const r = p.residents[i];
    const today = p.day;
    const events = [];
    events.push({ day: r.arrived_day, text: `Came over on the ferry and moved into ${sim.streetAddress(r.slot)}.` });
    const job = sim.job(r);
    const startText = { emekli: "Started enjoying retirement on the island.", uzaktan: "Turned a corner of the home into an office and works remotely from the island.", anakara: "Started taking the ferry to a job on the mainland.", ogrenci: "Started taking the ferry to college on the mainland." }[job.id] ?? `Started work at ${p.works[i].loc.name}.`;
    events.push({ day: r.arrived_day + 1, text: startText });
    // Terfiler: kıdem eşikleri (emeklilerde yok).
    for (let day = r.arrived_day + 1; !job.calismaz && day <= today; day++) {
      const before = sim.rank(r, day - 1), now = sim.rank(r, day);
      if (now > before) events.push({ day, text: `Got promoted to ${job.kademeler[Math.min(now, job.kademeler.length - 1)]}.` });
    }
    const pet = this.petName(i);
    if (pet) {
      const adopt = r.arrived_day + 5 + (sim.roll(r.seed, "evcil_gun") % 25);
      if (adopt <= today) events.push({ day: adopt, text: `Adopted a ${pet.kind.toLowerCase()} named ${pet.name}.` });
    }
    const f = this.friend[i];
    if (f >= 0) {
      const met = Math.max(r.arrived_day, p.residents[f].arrived_day) + 1 + (sim.roll(r.seed ^ p.residents[f].seed, "tanisma") % 9);
      if (met <= today) events.push({ day: met, text: `Met ${atOf(p.residents[f])} through ${p.hobbies[i].ad.toLowerCase()}; best friends ever since.` });
    }
    const first = r.arrived_day + 2 + (sim.roll(r.seed, "ilkHobi") % 5);
    if (first <= today) events.push({ day: first, text: `Tried ${p.hobbies[i].ad.toLowerCase()} on the island for the first time.` });
    return events.filter((e) => e.day <= today).sort((a, b) => b.day - a.day).map((e) => ({ ...e, date: dateOf(e.day) }));
  }

  /** Günün akışı: plan parçaları insan diliyle. */
  today(i, placeLabel, homeLabel) {
    const p = this.people;
    const plan = p.plans[i];
    const out = [];
    const f = this.friend[i];
    plan.forEach((seg, k) => {
      const at = clockText(seg.bas);
      if (seg.ne === "uyku") { if (k > 0) out.push([at, "Sleep"]); return; }
      if (seg.ne === "ev") { out.push([at, homeLabel(k)]); return; }
      if (seg.ne === "yol") {
        const trip = p.tripStore?.[i]?.get(k) ?? p._trip(i, seg, k);
        const how = { araba: "by car", otobus: "by bus", taksi: "by taxi", yaya: "on foot" }[trip?.mode];
        // Dışarı çıkışta gidilen gerçek yer (etkinliğin yeri), plandaki genel "meydan" değil.
        const to = seg.nereye === "meydan" || seg.nereye.startsWith("hobi:") ? p._placeOf(i, k + 1) ?? seg.nereye : seg.nereye;
        const dest = to === "ev" ? "Heading home" : `To ${placeLabel(to)}`;
        out.push([at, how ? `${dest} · ${how}` : dest]);
        return;
      }
      if (seg.ne === "is") { out.push([at, `At work · ${p.works[i].loc.name}`]); return; }
      const withFriend = f >= 0 && p.plans[f]?.some((q) => q.yer === seg.yer && q.bas < seg.son && q.son > seg.bas) ? ` (with ${atOf(p.residents[f])})` : "";
      const act = p.acts?.[i]?.get(k);
      if (act && ETKINLIK[act]) out.push([at, `${ETKINLIK[act].ad}${withFriend}`]);
      else if (seg.ne === "hobi") out.push([at, `${p.hobbies[i].ad} · ${placeLabel(seg.yer)}${withFriend}`]);
      else if (seg.ne === "meydan") out.push([at, `Out · ${placeLabel(p._placeOf(i, k) ?? "meydan")}${withFriend}`]);
    });
    return out;
  }
}
