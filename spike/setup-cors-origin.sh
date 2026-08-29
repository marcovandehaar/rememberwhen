#!/bin/sh
# Maakt het A-record media.vandehaar.dev aan -- de tweede naam, met CORS-headers,
# voor configuratie 4 van de research.
#
# Draait OP DE NAS, als root. Reden: het Cloudflare-token staat daar in
# /volume1/acme.sh/account.conf en hoort de doos niet te verlaten.
# Het wildcard-certificaat *.vandehaar.dev dekt deze naam al, dus er hoeft
# geen nieuw certificaat aangevraagd te worden.
#
#   sudo -i
#   sh /volume1/web/spike/setup-cors-origin.sh
#
# De reverse proxy zelf gaat daarna met de hand in DSM -- zie het runbook.

set -e

NAME='media'
ZONE='369a92f64c6fc76c61d3424ae5232abd'
IP='192.168.0.137'
CONF='/volume1/acme.sh/account.conf'

[ -r "$CONF" ] || { echo "Kan $CONF niet lezen -- draai dit als root op de NAS."; exit 1; }
TOKEN=$(sed -n "s/^SAVED_CF_Token='\(.*\)'$/\1/p" "$CONF")
[ -n "$TOKEN" ] || { echo "Geen SAVED_CF_Token in $CONF gevonden."; exit 1; }

api() { curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' "$@"; }

echo "== Bestaat het record al? =="
EXISTING=$(api "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?type=A&name=$NAME.vandehaar.dev")
echo "$EXISTING" | grep -q '"count":0' || { echo "$EXISTING"; echo "Record bestaat al -- niets gedaan."; exit 0; }

echo "== Aanmaken =="
api -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  --data "{\"type\":\"A\",\"name\":\"$NAME\",\"content\":\"$IP\",\"ttl\":1,\"proxied\":false,\"comment\":\"rememberwhen spike -- CORS-origin, issue #5\"}"
echo

echo "== Verwacht: proxiable=false, net als bij nas.vandehaar.dev =="
