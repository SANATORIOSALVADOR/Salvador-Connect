# Servidor de nombres interno (opcional): hace que SITE_NAME apunte al servidor dentro de la red
# y reenvía todo lo demás a los DNS de internet. Se activa con COMPOSE_PROFILES=dns (ver docs/NOMBRE_LOCAL.md).
FROM alpine:3.20
RUN apk add --no-cache dnsmasq
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 53/udp 53/tcp
ENTRYPOINT ["/entrypoint.sh"]
