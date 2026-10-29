#!/bin/bash
# Einrichtung des frisch installierten WorkFlow-VPS (Ubuntu 24.04). Idempotent.
# Aufruf (vom Entwickler-PC): ssh -i ~/.ssh/workflow_vps_ed25519 root@<VPS_HOST> 'bash -s' < scripts/vps-setup.sh
# Danach: npm run deploy-vps
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

SSLIP=217-154-200-72.sslip.io

echo "== System-Updates"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
apt-get -y -q install nginx certbot python3-certbot-nginx ufw unattended-upgrades

echo "== Automatische Sicherheitsupdates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "== SSH: nur Key-Login"
# 00- wird vor cloud-init's 50-cloud-init.conf gelesen; bei sshd gilt der erste Treffer.
cat > /etc/ssh/sshd_config.d/00-workflow.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh

echo "== Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "== Verzeichnisse"
mkdir -p /var/www/app/download/assets /var/www/landing/assets
chown -R www-data:www-data /var/www/app /var/www/landing

echo "== Nginx"
cat > /etc/nginx/snippets/workflow-app.conf <<'EOF'
root /var/www/app;
index index.html;

# Service Worker und HTML nie cachen, sonst bleiben Clients auf altem Stand haengen.
location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }
location = /index.html { add_header Cache-Control "no-cache"; }

# Gehashte Vite-Bundles duerfen lange gecacht werden.
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }

# APK direkt ueber den App-Host (Uebergang, solange workflow-app.de nicht auf den VPS zeigt).
location = /workflow.apk {
    alias /var/www/app/download/assets/workflow.apk;
    default_type application/vnd.android.package-archive;
    add_header Content-Disposition 'attachment; filename="WorkFlow-v1.5.0.apk"';
}

# SPA-Fallback fuer React-Router.
location / { try_files $uri $uri/ /index.html; }
EOF

cat > /etc/nginx/sites-available/$SSLIP.conf <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SSLIP;
    include snippets/workflow-app.conf;
}
EOF

# Vorbereitet fuer die echte Domain; Zertifikate folgen per certbot, sobald DNS steht.
cat > /etc/nginx/sites-available/app.workflow-app.de.conf <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name app.workflow-app.de;
    include snippets/workflow-app.conf;
}
EOF

cat > /etc/nginx/sites-available/workflow-app.de.conf <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name workflow-app.de www.workflow-app.de;
    root /var/www/landing;
    index index.html;
    location = /assets/workflow.apk {
        default_type application/vnd.android.package-archive;
    }
    location / { try_files $uri $uri/ =404; }
}
EOF

cat > /etc/nginx/conf.d/gzip-workflow.conf <<'EOF'
gzip_vary on;
gzip_proxied any;
gzip_types text/css application/javascript application/json image/svg+xml application/manifest+json;
EOF

rm -f /etc/nginx/sites-enabled/default
for s in $SSLIP.conf app.workflow-app.de.conf workflow-app.de.conf; do
  ln -sf /etc/nginx/sites-available/$s /etc/nginx/sites-enabled/$s
done

# Platzhalter, bis der erste Deploy kommt.
[ -f /var/www/app/index.html ] || echo '<!doctype html><title>WorkFlow</title><p>Deploy folgt.' > /var/www/app/index.html

nginx -t
systemctl reload nginx

echo "== Let's Encrypt"
certbot --nginx -d $SSLIP --non-interactive --agree-tos --register-unsafely-without-email --redirect
systemctl list-timers certbot.timer --no-pager | head -3

echo "== Fertig"
