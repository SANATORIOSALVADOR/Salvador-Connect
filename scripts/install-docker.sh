#!/usr/bin/env bash
# Instala Docker Engine + Compose plugin en Debian/Ubuntu (server de prueba).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecutá con sudo: sudo bash scripts/install-docker.sh"
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  echo "Docker ya instalado: $(docker --version)"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
fi

# Detectar distro
. /etc/os-release
CODENAME="${VERSION_CODENAME:-jammy}"
ARCH="$(dpkg --print-architecture)"

echo \
  "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

# Permitir al usuario que invocó sudo usar docker sin root
if [ -n "${SUDO_USER:-}" ]; then
  usermod -aG docker "$SUDO_USER"
  echo "Usuario $SUDO_USER agregado al grupo docker (cerrar sesión y volver a entrar)."
fi

echo "Docker instalado: $(docker --version)"
docker compose version
