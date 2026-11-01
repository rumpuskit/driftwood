#!/bin/zsh
# launchd her saat :12'de çalıştırır; ABD Doğu saatine (ET) göre yalnız 09-10 (sabah: 09:00 taşınmasından sonra),
# 11 (öğle) ve 21-22 (akşam: 21:00 taşınmasından sonra) iş yapar (Mac'in saat dilimi ve yaz saati fark etmez).
# gunluk.mjs takipçi sayısına bakar; o yuva bugün gerekmiyorsa ya da zaten üretildiyse hiçbir şey yapmaz.
# ElevenLabs anahtarı depoda değil: cikti/ayar.env içindeki ANAHTAR_DOSYASI'ndan okunur (install.sh yazar).
cd "${0:A:h}/.." || exit 1
# Sabah ve akşam önce taşınmanın işlenmesini bekler (--bekle); bir saat sonra (10, 22) beklemeden üretir.
case $(TZ=America/New_York date +%H) in
  09) YUVA=sabah; BEKLE=--bekle ;;
  10) YUVA=sabah ;;
  11) YUVA=ogle ;;
  21) YUVA=aksam; BEKLE=--bekle ;;
  22) YUVA=aksam ;;
  *) exit 0 ;;
esac
mkdir -p cikti/gunluk/log
LOG=cikti/gunluk/log/$(date +%Y-%m).log
find cikti/gunluk/log -name '*.log' -mtime +62 -delete 2>/dev/null
exec >>$LOG 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="
source cikti/ayar.env 2>/dev/null
export ELEVENLABS_API_KEY=$(sed -nE 's/.*(sk_[A-Za-z0-9]+).*/\1/p' "$ANAHTAR_DOSYASI" 2>/dev/null | head -1)
if ! node gunluk.mjs --yuva $YUVA --uret --bildir $BEKLE; then
  osascript -e "display notification \"$YUVA videosu üretilemedi. Kayıt: video/$LOG\" with title \"Driftwood\""
  exit 1
fi
