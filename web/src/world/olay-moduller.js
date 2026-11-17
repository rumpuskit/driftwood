// Olay modülleri (17 Kasım akşamı, kullanıcı: "olay çeşitliliği ve dikkat çekicilik çok önemli"): her yeni olay türü
// kendi dosyasında; olay.js bunları buradan alır. Tür adı olay-plan.js TURLER anahtarıyla aynı; adada çıkıp çıkmayacağı
// olay-ayar.js ADA_TURLERI / IKINCI.turler ile belirlenir (modül kayıtlıysa bile listede değilse olmaz).
//
// Arayüz: kur({ world, scene, group, traffic, zeplin, sky }) bir kez çağrılır (sayfa açılışı) ve şunu döndürür:
//   kur(o) → { odak: [x, z], odakY, kalabalik: [x, z] | null, kiyi: [x, z] | null, yon, yerAdi, zaman,
//            gitD?, gitEgim? ("Olaya git" kamerası), cekimOlcek?, cekimOlcekH? (video: hareketli hedefte kadraj ölçeği),
//            kalabalikArkadan? (video: kalabalık çekimi seyircilerin arkasından olaya doğru) } | null
//            o: plan { tur, ad, en, bas, son, tohum, day, yuva }; null: bugün kurulamadı (olay o gün olmaz).
//            Saf olmalı: aynı (o, dünya) hep aynı sonucu verir (video günün her dakikasını yeniden çizer).
//   update(o | null, evre | null, minute, real, env)  her karede; o: bu türün bugünkü planı (yoksa null → gizle).
//            Görünüm yalnız (minute, o.tohum, dünya) işlevi: Math.random ve kare arası birikim YOK.
//   yazi(o, S, minute, { saatYaz, saatte }) → { kisa, uzun } | null   üst panel/gazete metni (olgular videoya gider:
//            yalnız sitede gerçekten olanı yaz). S: yuva alanları (S.seyirci: gelen seyirci sayısı).
//   seyirci: { r0, r1, isR, uzak, kiyida, en, tavirlar } | null   seyirci yayı (null: kimse toplanmaz).
//   gorev?(people, day, S, plans) → [{ i, T0, T1, item, commute }]  görevli sakinler (item: durus'a gider; item.modul =
//            tür; commute: yürüme dakikası, 0 = araçla gelir/anında).
//   durus?(i, item, minute, t, p, ph, stand, { idleGesture }) → bool  özel duruş (item.modul = tür olan sakinler).
//   vehicles?(vehicles, real, minute, araclar, ses)  olay araçları (vehicles.add; araclar.set(ad, poz) video için).
//   gizle?(x, z, minute) → bool   gerçek trafikten gizlenecek araç.   kapali?(minute) → Set<düğüm> | null.
//   ses?(minute) → { siren, korna, kalabalik, ... }   canli?(minute) → [x, y, z] | null (hareketli hedef: video).
//   tahliye?(x, z, minute) → { x, z, heading, yuru } | null   boşaltılan alan: o anda (x, z)'de duracak sakinin yeni yeri
//            (yuru: yürüme evresi radyan, kenara yürürken; null: alan dışında). Saf işlev; people.js her karede çağırır.
//   ekstra?(crowd, minute, time)  sakin olmayan figürler (ör. kartopu oynayan çocuklar): crowd.add(-1, poz) (people.js).
//   durum?(o | null, minute) → nesne | null   olaya özgü durum (elektrik: main.js pencere/lamba ışıkları; olay.elektrik).
//   gunBasi?(day)  her gün başında (olay kurulmadan önce) çağrılır: modülün dünyaya taktığı kancaları sıfırlar (vapur gecikmesi).
// kur'a gelen yuzey: { terrain, roads, grounds, harbor, beach, fields, city, trees } (main.js; kar düşen yüzeyler).
//   anlik?(o, minute) → { odak?, yon?, odakY?, gitD?, gitEgim? } | null   hareketli olayın o anki yeri ("Olaya git" ve
//            video: düğün konvoyu, yarışın önü); api alanlarını o kare için ezer.
//   (ajan C modülleri sakin olmayan figürleri ekstra ile çizer; yardımcılar: olay-yardim.js.)
//   seyirciBas?(o) → dakika   seyircilerin gelmeye başladığı an (varsayılan o.bas; düğünde halay).
//   seyirci.ozel: true → seyirci kalemleri modul alanı taşır, duruşlarını modülün durus'u çizer (alkış, gülme…).
// Driftwood: düğün konvoyu (çevre yolu ister) ve dev gemi, elektrik kesintisi Mercanada'ya özgü; moose, köpekbalığı ve
// lobster boat race Driftwood'a özgü.
import { buildZeplinOlay } from "./olay-zeplin.js";
import { buildKarOlay } from "./olay-kar.js";
import { buildBalonOlay } from "./olay-balon.js";
import { buildUcurtmaOlay } from "./olay-ucurtma.js";
import { buildKusOlay } from "./olay-kus.js";
import { buildMooseOlay } from "./olay-moose.js";
import { buildVapurOlay } from "./olay-vapur.js";
import { buildBalikOlay } from "./olay-balik.js";
import { buildTekneYarisiOlay } from "./olay-tekne-yarisi.js";
import { buildFilmOlay } from "./olay-film.js";
import { buildYarisOlay } from "./olay-yaris.js";
import { buildMartiOlay } from "./olay-marti.js";
import { buildFokOlay } from "./olay-fok.js";
import { buildHortumOlay } from "./olay-hortum.js";
import { buildDalgaOlay } from "./olay-dalga.js";
import { buildKopekbaligiOlay } from "./olay-kopekbaligi.js";

export const MODULLER = {
  zeplin: buildZeplinOlay,
  kar: buildKarOlay,
  balon: buildBalonOlay,
  ucurtma: buildUcurtmaOlay,
  kus: buildKusOlay,
  moose: buildMooseOlay,
  vapur: buildVapurOlay,
  balik: buildBalikOlay,
  tekne_yarisi: buildTekneYarisiOlay,
  film: buildFilmOlay,
  yaris: buildYarisOlay,
  marti: buildMartiOlay,
  fok: buildFokOlay,
  hortum: buildHortumOlay,
  dalga: buildDalgaOlay,
  kopekbaligi: buildKopekbaligiOlay,
};
