# Driftwood

TikTok takipçilerinin sakin olarak yaşadığı, takipçi geldikçe büyüyen bir ada: https://driftwood.rumpuskit.com

## Temel ilke

Takip etmenin dışında hiçbir özellik kullanıcıdan işlem istemez. Sakinlerin hayatı (meslek, terfi, evcil hayvan, günlük plan) kullanıcı adından türetilen tohum değer ve günden **deterministik** olarak hesaplanır. Bu yüzden sunucu kimsenin hayatını saklamaz, sadece kimliği, sırayı (adres buradan hesaplanır) ve istekleri tutar. Bu yapı 10 milyon sakine kadar ölçeklenir.

## Sakinler nereden gelir?

TikTok takipçi listesini resmî arayüzünden vermez; resmî "Verilerini indir" dosyası da günler sürer. Bu yüzden liste, hesabın herkese açık takipçi listesinden, bağımsız bir profil görüntüleme sitesi (tik.ninja) üzerinden okunur. Bu iş bu depoda değil, ayrı bir yerel takip aracında (Mac'te, launchd ile) yapılır. Akış:

1. **Saatte bir** araç yalnız profildeki takipçi **sayısını** okuyup sunucuya yollar. Henüz taşınmamış olanlar vapur iskelesinde valizleriyle bekler.
2. **Günde üç kez** (09:00, 15:00, 21:00; `web/src/config.js` `TASINMA_SAATLERI` ve aracın `config.toml`'u) araç listeyi tarar. Aktif takipçilerin tamamını takip sırasıyla `ssh` ile sunucudaki `tasinma.py`'ye yollar. Bu ssh anahtarı yalnız o betiği çalıştırabilir (zorunlu komut).
3. `tasinma.py`, `import_followers.aktar()` ile listeyi işler: yeni gelenler takip sırasına göre önce boş evlere yerleşir, takibi bırakanlar ayrılır (evi 7 gün tutulur, sonra kaydı silinir), adadan çıkmak isteyenler bir daha taşınmaz. Liste aktif nüfusun %80'inden azsa işlenmez (yarım liste adayı boşaltmasın).
4. Aynı taşınmada araç, son 30 günün videolarından yorum sayısı değişenlerin yorumlarını okuyup listeden sonra yollar. `istekler.py` yorumları ayrıştırır (`meslek: balıkçı`, `hobi: tavla`, `evcil: kedi`, `adımı gizle`; yalnız katalogdaki seçenekler, kadrolu işler hariç). İstek yazanın kendisi için ve yalnız adada oturuyorsa sakinin `overrides` alanına işlenir; henüz taşınmamışsa 7 gün bekler. Yorum metni saklanmaz, istek kaydı 7 gün sonra silinir.
5. Güncel liste Cloudflare Worker'ına (`sayac/`) gider; site listeyi oradan okur. Ziyaretçi trafiği sunucuya gelmez.

TikTok bazı hesapları (ör. gizli hesapları) herkese açık takipçi listesinde göstermez; onlar taşınamaz ve iskelede bekleyen sayılmaz (profil sayısıyla nüfus farkı `durum.disarida`). tik.ninja kapanırsa resmî dışa aktarım dosyası `import_followers.py` ile elle işlenebilir.

## Ada nasıl büyür?

Ada boş başlar: vapur iskelesi, toprak patikalar, çeşmeli meydan ve bayrak direği, tepe, fener ve kumsal. Her şeyin yeri baştan bellidir ama yalnızca açılmış olanlar kurulur:

- **Evler** sakinlerle gelir: bir apartman, ilk dairesine biri taşınınca dikilir. Mahalle girişe en yakın sokaktan dışa doğru dolar; sokaklar evlerin önüne kadar uzanır.
- **Yerler** `data/catalog.json` içindeki `gelisim` tablosuna göre açılır: 5. sakinde meydan bankları, 10'da kahvehane, 20'de market, 30'da fırın... 200'de çevre yolu ile arabalar ve otobüs, 600'de yük limanı, 2.650'de son kafe. Sonraki mahallelerin camisi, çay bahçesi ve okulu, mahalle dolmaya başladıktan sonra aynı aralıklarla gelir; çarşı dükkânları 240. sakinden başlayarak tek tek açılır.
- Gelişim düzeyi adanın **ulaştığı en yüksek nüfustur** (`zirve`); takibi bırakanlar yüzünden açılmış bir yer kapanmaz.
- İş yeri henüz açılmamış bir mesleğin sahibi o yer açılana kadar **anakarada çalışır** (vapurla gider gelir); kartında "Driftwood Fırını açılınca fırın çırağı olacak (30. sakinde)" yazar. Açılınca asıl işine geçer.
- Sitede "Sıradaki: … · N sakin daha" satırı ve haritada sıradaki yapının şantiye çitli hayalet taslağı görünür. Taşınma çıktısındaki `acilan` listesi taşınma videolarının malzemesidir; takip aracı bir yer açılınca bildirim de gönderir.

## Yapı

```
data/catalog.json          meslekler, iş yerleri, hobiler, isim listeleri (web ve sunucu ortak)
web/                       tarayıcı istemcisi (Three.js + Vite), telefonda ve TikTok uygulama içi tarayıcısında açılır
  src/sim.js               deterministik simülasyon: hash, saat, adres, sakinin günü
  src/world/layout.js      adanın yerleşimi: nüfustan hücreler, mahalleler, çarşı, kıyı, yollar
  src/world/roads.js       asfalt, Arnavut kaldırımı, kaldırım, yaya geçidi, sokak lambaları
  src/world/city.js        apartmanlar, dükkânlar, kent eşyası (InstancedMesh)
  src/world/human.js       eklemli insan figürü, eşyalar, köpekler
  src/world/people.js      sokaktaki hayat: yürüyüş, oturma, sohbet, hobiler, iş
  src/world/life.js        evdeki hayat: uyku, yemek, televizyon...
  src/world/interior.js    ev içi (bebek evi) görünümü: seçilen kat kesilir, daireler eşyalı
  src/world/*.js           arazi, ağaçlar, gökyüzü, levhalar, dokular
  src/ui.js                saat, hız, "Kendini bul" araması ve sakin kartı
  tests/parity_vectors.mjs parite testi için JS çıktısı
server/
  driftwood_sim/sim.py     simülasyonun Python karşılığı (web ile bit bit aynı)
  schema.sql               Postgres şeması (sakinler, aktarimlar, istekler)
  tasinma.py               Mac'teki takip aracından gelen sayı/liste/yorumlar (ssh zorunlu komutu)
  istekler.py              yorumdan ya da DM'den gelen istekler (meslek, hobi, evcil, adı gizle)
  import_followers.py      takipçi listesini şehre işler, listeyi yayınlar (elle: dosyadan)
  cikar.py                 adadan çıkmak / adını gizlemek isteyenler (DM ile)
  ortak.py                 psql, listenin yayını (public/sakinler.json + Worker)
sayac/                     Cloudflare Worker: çevrimiçi sayacı, /sakinler.json, eski ada.rumpuskit.com adresinin yönlendirmesi
  tests/test_parity.py     JS ve Python aynı sonucu veriyor mu?
  tests/test_tasinma.py    taşınma ve yorum istekleri uçtan uca (gerçek Postgres ister, DRIFTWOOD_TEST_DB ile)
  tests/test_istekler.py   yorumdan istek ayrıştırma
```

## Komutlar

```sh
# Geliştirme sunucusu (http://localhost:5173)
cd web && npm install && npm run dev

# Adres çubuğu seçenekleri: ?nufus=12000 (gerçek liste yerine örnek nüfus), ?gelisim=500 (adayı o gelişim
# düzeyinde göster), ?bekleyen=40 (iskelede bekleyen),
# ?test (60×/600× düğmeleri), ?saat=21:30 (sabit saat, test/hiz ile), ?hiz=60 (zaman hızı),
# ?bul=sakin_0042 (sakini bulup göster), ?bak=x,z,uzaklık (kamera)

# Parite ve plan testleri (Node gerekir)
cd server && python3 -m unittest -v

# Sunucuya yükle ($SUNUCU: ssh takma adı; sadece /opt/driftwood)
rsync -a --delete --exclude __pycache__ --relative server/ data/catalog.json $SUNUCU:/opt/driftwood/app/
ssh $SUNUCU 'chown -R driftwood:driftwood /opt/driftwood/app'

# Taşınma testleri (geçici Postgres; asıl veritabanına dokunmaz)
docker run -d --rm --name driftwood-deneme -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54391:5432 postgres:17-alpine
cd server && PGHOST=127.0.0.1 PGPORT=54391 PGUSER=postgres DRIFTWOOD_TEST_DB=driftwood_deneme python3 -m unittest tests.test_tasinma

# Bir listeyi elle işle (sunucuda; önce --dry-run ile bak). Normalde takip aracı günde 3 kez kendisi yollar.
cd /opt/driftwood/app/server
sudo -u driftwood python3 import_followers.py liste.json --dry-run
sudo -u driftwood python3 import_followers.py tiktok-export.zip

# Adadan çıkma / adı gizleme isteği (DM)
sudo -u driftwood python3 cikar.py kullaniciadi
sudo -u driftwood python3 cikar.py --gizle kullaniciadi

# İstekler: ayrıştırmayı dene, DM/canlı yayından gelen isteği işle, son haftanın dökümü (istekler videosu)
sudo -u driftwood python3 istekler.py dene "mesleğim balıkçı olsun"
sudo -u driftwood python3 istekler.py ekle kullaniciadi meslek balıkçı
sudo -u driftwood python3 istekler.py liste

# Worker (sayaç + liste + yönlendirme)
cd sayac && npx wrangler@4 deploy
```

## Sunucu kuralları

Sunucuda başka servisler de çalışıyor. Driftwood sadece `driftwood` Linux kullanıcısı, `/opt/driftwood` klasörü ve `driftwood` Postgres veritabanını kullanır. nginx, Redis ve diğer servislere dokunulmaz.

## Yayın

`main` dalına her push'ta GitHub Actions parite testlerini çalıştırır, web istemcisini derler ve GitHub Pages'a yayınlar: https://driftwood.rumpuskit.com (Cloudflare üzerinden; eski ada.rumpuskit.com oraya yönlenir).

## Simülasyon kuralı değişirse

`web/src/sim.js` ile `server/driftwood_sim/sim.py` birlikte değişir ve parite testi çalıştırılır. Kural değişikliği bütün sakinlerin hayatını geriye dönük olarak değiştirir. Yayından sonra bunu bilinçli bir "şehir olayı" olarak yap.
