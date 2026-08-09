#!/usr/bin/env bash
#
# check-app-links.sh — verifica leggera dei link esterni delle card del catalogo.
#
# Estrae gli URL http(s) presenti in index.html e progetti.html e ne controlla lo
# stato HTTP. Utile per intercettare in anticipo le app che finiscono in 404
# (es. una repo resa privata o un dominio non più raggiungibile) prima che un
# utente ci sbatta contro.
#
# Le card marcate con data-app-state (private / unavailable) usano <button> e non
# hanno href esterno: sono già gestite dalla modale e non vengono controllate.
#
# Uso:   bash tools/check-app-links.sh
# Exit:  0 se tutti gli URL rispondono 2xx/3xx, 1 se almeno uno è >=400 o irraggiungibile.
#
set -u
cd "$(dirname "$0")/.." || exit 2

files="index.html progetti.html"
fail=0

# Estrae gli href http(s), uno per riga, deduplicati.
urls=$(grep -hoE 'href="https?://[^"]+"' $files \
  | sed -E 's/^href="//; s/"$//' \
  | sort -u)

for url in $urls; do
  code=$(curl -s -o /dev/null -L --max-time 20 -w "%{http_code}" "$url" 2>/dev/null)
  # Un secondo tentativo per evitare falsi positivi da errori di rete temporanei.
  if [ "$code" = "000" ] || { [ "$code" -ge 400 ] 2>/dev/null; }; then
    sleep 1
    code=$(curl -s -o /dev/null -L --max-time 25 -w "%{http_code}" "$url" 2>/dev/null)
  fi

  if [ "$code" = "999" ] || [ "$code" = "429" ]; then
    # 999 (LinkedIn) e 429 sono risposte anti-bot, non link rotti.
    printf "SKIP %-3s         %s (anti-bot, non è un 404)\n" "$code" "$url"
  elif [ "$code" = "000" ]; then
    printf "IRRAGGIUNGIBILE  %s\n" "$url"
    fail=1
  elif [ "$code" -ge 400 ] 2>/dev/null; then
    printf "HTTP %-3s         %s\n" "$code" "$url"
    fail=1
  else
    printf "OK   %-3s         %s\n" "$code" "$url"
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "Tutti i link esterni rispondono correttamente."
else
  echo "Alcuni link non rispondono: valuta se marcare la card come private/unavailable in data-app-state."
fi
exit $fail
