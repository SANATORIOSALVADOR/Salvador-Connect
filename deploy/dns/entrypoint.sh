#!/bin/sh
# dnsmasq: SITE_NAME (y sus subnombres) → SERVER_IP; el resto se pregunta a DNS_UPSTREAM_1/2.
set -eu
: "${SITE_NAME:?Falta SITE_NAME en .env (ej.: sanatorio.salvador.connect)}"
: "${SERVER_IP:?Falta SERVER_IP en .env (IP fija del servidor)}"
UP1="${DNS_UPSTREAM_1:-8.8.8.8}"
UP2="${DNS_UPSTREAM_2:-1.1.1.1}"
echo "DNS interno: ${SITE_NAME} -> ${SERVER_IP} (resto: ${UP1}, ${UP2})"
exec dnsmasq --keep-in-foreground --log-facility=- \
  --no-resolv --no-hosts --domain-needed --bogus-priv --cache-size=1000 \
  --server="${UP1}" --server="${UP2}" \
  --address="/${SITE_NAME}/${SERVER_IP}"
