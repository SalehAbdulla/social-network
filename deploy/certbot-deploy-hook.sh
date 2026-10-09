#!/usr/bin/env bash
# Copy the renewed Social Network (DuckDNS) certificate into beyond's nginx mount
# and reload nginx.
#
# Install on the VPS as:
#   /etc/letsencrypt/renewal-hooks/deploy/social-network-nginx.sh   (root, +x)
#
# Deploy hooks are GLOBAL — this runs on every renewal, including beyond's — so it
# exits quietly when our certificate is absent and never writes beyond's
# fullchain.pem / privkey.pem.
set -e

SRC=/etc/letsencrypt/live/salehsocial.duckdns.org
DST=/home/ubuntu/beyond/docker/nginx/ssl

[ -d "$SRC" ] || exit 0

cp "$SRC/fullchain.pem" "$DST/salehsocial-fullchain.pem"
cp "$SRC/privkey.pem"   "$DST/salehsocial-privkey.pem"

# 644, not the 600 certbot writes: the nginx container runs as a different uid and
# would otherwise fail with "cannot load certificate key ... Permission denied".
chmod 644 "$DST/salehsocial-fullchain.pem" "$DST/salehsocial-privkey.pem"
chown ubuntu:ubuntu "$DST/salehsocial-fullchain.pem" "$DST/salehsocial-privkey.pem"

docker exec beyond-nginx nginx -s reload 2>/dev/null || true
echo "[certbot-deploy] salehsocial certs copied and nginx reloaded at $(date)"
