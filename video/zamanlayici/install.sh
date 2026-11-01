#!/bin/zsh
# Günlük video zamanlayıcısını kurar (macOS launchd, kullanıcı oturumu).
#   zsh video/zamanlayici/install.sh /yol/elevenlabs/anahtar-dosyasi
#   zsh video/zamanlayici/install.sh --remove
set -e
ROOT="${0:A:h:h:h}"
LABEL=com.driftwood.gunluk
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
if [[ $1 == --remove ]]; then rm -f "$PLIST"; echo "Kaldırıldı."; exit 0; fi
[[ -f $1 ]] || { echo "ElevenLabs anahtar dosyası verilmeli"; exit 1; }
mkdir -p "$ROOT/video/cikti"
print -r -- "ANAHTAR_DOSYASI=${1:A}" > "$ROOT/video/cikti/ayar.env"
mkdir -p "$HOME/Library/LaunchAgents"
sed -e "s|__ROOT__|$ROOT|g" "$ROOT/video/zamanlayici/$LABEL.plist" > "$PLIST"
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Kuruldu: Türkiye saatiyle 09:12, 11:12, 21:12 (o yuva gerekiyorsa). Kayıt: video/cikti/gunluk/log/"
