// Senaryonun seslendirmesini ElevenLabs'te üretir; cümle cümle zamanlamayı (altyazı için) ses.json'a yazar.
// Metin, ses ya da ayar değişmedikçe yeniden üretmez (kredi harcamaz).
//
//   ELEVENLABS_API_KEY=... node seslendir.mjs senaryolar/acilis.mjs
//
// Senaryoda: seslendirme: [{ ses: "Meydan bankları için beş kişi lazım.", yazi: "Meydan bankları için 5 kişi lazım." }, ...]
//   ses:  okunacak metin (sayılar yazıyla, yabancı kelime ve kullanıcı adı simgesi yok)
//   yazi: altyazı (yoksa ses metni); "\n" satır kırar. Satır başına ~28 karakter, en fazla 2 satır.
// Çıktı: cikti/<ad>/ses.mp3 (ham) ve ses.json { anahtar, sure, cumleler: [{ yazi, bas, son, kelimeler }] }
// (kelimeler: [[kelime, başlangıç sn], ...]; çekim geçişlerini kelimeye oturtmak için).
// Ses ve ayarlar anlatım standardından (video/cikti/ANLATIM-STANDARDI.md, bölüm 7): değişirse orada da değişir.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const SES = {
  voice: "vS90pb3uG7nu8BEGqcAk", // ElevenLabs kütüphanesi: "Olivia – Podcast Host"
  model_id: "eleven_v4",
  language_code: "tr",
  voice_settings: { stability: 0.7, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 1.08 },
};

export async function seslendir(S) {
  const out = resolve("cikti", S.ad);
  mkdirSync(out, { recursive: true });
  const parts = S.seslendirme.map((c) => c.ses.trim());
  const text = parts.join(" ");
  const anahtar = createHash("sha256").update(JSON.stringify({ text, ...SES })).digest("hex").slice(0, 16);
  const jsonPath = `${out}/ses.json`;
  if (existsSync(jsonPath) && existsSync(`${out}/ses.mp3`)) {
    const eski = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (eski.anahtar === anahtar) return eski;
  }
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY yok (seslendirme değişti, yeniden üretilmeli)");
  const { voice, ...body } = SES;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...body }),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  writeFileSync(`${out}/ses.mp3`, Buffer.from(data.audio_base64, "base64"));

  // Cümlelerin karakter aralığı → ilk karakterin başı, son karakterin sonu.
  const al = data.alignment;
  const chars = al.characters.join("");
  if (chars !== text) throw new Error("hizalama metni seslendirme metniyle aynı değil");
  let pos = 0;
  const cumleler = parts.map((p, k) => {
    const a = pos, b = pos + p.length - 1;
    pos += p.length + 1;
    const kelimeler = [];
    for (const m of p.matchAll(/[^\s]+/g)) kelimeler.push([m[0], al.character_start_times_seconds[a + m.index]]);
    return { yazi: S.seslendirme[k].yazi ?? p, bas: al.character_start_times_seconds[a], son: al.character_end_times_seconds[b], kelimeler };
  });
  const sure = al.character_end_times_seconds.at(-1);
  const result = { anahtar, sure, cumleler };
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = (await import(resolve(process.argv[2]))).default;
  const r = await seslendir(S);
  for (const c of r.cumleler) {
    console.log(`${c.bas.toFixed(2).padStart(6)}–${c.son.toFixed(2).padEnd(6)} ${c.yazi.replace(/\n/g, " / ")}`);
    console.log("         " + c.kelimeler.map(([w, t]) => `${w}@${t.toFixed(2)}`).join(" "));
  }
  console.log(`süre ${r.sure.toFixed(2)} sn`);
}
