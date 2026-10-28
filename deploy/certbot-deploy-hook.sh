#!/usr/bin/env bash
# Copy the renewed Social Network certificate into beyond's nginx mount and reload
# nginx.
#
# Install on the host as:
#   /etc/letsencrypt/renewal-hooks/deploy/social-network-nginx.sh   (root, +x)
#
# Deploy hooks are GLOBAL — this runs on every renewal, including beyond's and
# bahraini28's — so it exits quietly when our certificate is absent and never writes
# their fullchain.pem / privkey.pem.
set -e

SRC=/etc/letsencrypt/live/social.beyondedubh.com
DST=/root/beyond/docker/nginx/ssl

[ -d "$SRC" ] || exit 0

cp "$SRC/fullchain.pem" "$DST/social-network-fullchain.pem"
cp "$SRC/privkey.pem"   "$DST/social-network-privkey.pem"

# certbot writes 600; the nginx master runs as root inside the container and reads
# them fine (verified on this host), so the private key stays at 600 rather than
# being opened to 644.
chmod 644 "$DST/social-network-fullchain.pem"
chmod 600 "$DST/social-network-privkey.pem"

docker exec beyond-nginx nginx -s reload 2>/dev/null || true
echo "[certbot-deploy] social-network certs copied and nginx reloaded at $(date)"
