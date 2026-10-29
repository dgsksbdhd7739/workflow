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
# Nginx kennt .mjs nicht (sonst application/octet-stream) -- der PDF-Worker
# (pdfjs) wird als Modul geladen und vom Browser dann blockiert.
location ~ ^/assets/.+\.mjs$ {
    types { }
    default_type text/javascript;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}

# APK direkt ueber den App-Host (Uebergang, solange workflow-app.de nicht auf den VPS zeigt).
location = /workflow.apk {
    alias /var/www/app/download/assets/workflow.apk;
    default_type application/vnd.android.package-archive;
    add_header Content-Disposition 'attachment; filename="WorkFlow-v2.3.0.apk"';
}

# Backend (server/, systemd-Dienst workflow-server). Uploads bis 100 MB wie im Backend.
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 100m;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
}

# Chat-Echtzeit (WebSocket).
location = /api/live {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 1h;
}

# Live-Update-Bundles der Android-App (scripts/publish-update.mjs). Das Manifest
# fragt die App per fetch() aus dem WebView ab (Ursprung capacitor://localhost),
# daher CORS; nie cachen, sonst sehen Geraete neue Versionen verspaetet.
location /updates/ {
    alias /var/www/updates/;
    add_header Access-Control-Allow-Origin "*";
    location = /updates/latest.json {
        alias /var/www/updates/latest.json;
        add_header Access-Control-Allow-Origin "*";
        add_header Cache-Control "no-store";
    }
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

echo "== PostgreSQL 17 (nur localhost)"
apt-get -y -q install postgresql-common
/usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get -y -q install postgresql-17
sudo -u postgres psql -tAc "select 1 from pg_database where datname = 'workflow'" | grep -q 1 \
  || sudo -u postgres psql -qc "create database workflow"
# Schema: server/db/migrationen/*.sql (spielt das Backend beim Start ein).

echo "== Datenverzeichnisse"
mkdir -p /var/lib/workflow/dateien /var/backups/workflow
chmod 700 /var/lib/workflow /var/backups/workflow

echo "== Naechtliche Sicherung (DB + Dateien, 14 Tage)"
cat > /usr/local/sbin/workflow-backup <<'EOF'
#!/bin/bash
# Sichert die WorkFlow-Datenbank und alle hochgeladenen Dateien nach
# /var/backups/workflow. Liegt auf demselben Server -- schuetzt vor
# Bedienfehlern/Datenverlust in der App, nicht vor Verlust des Servers.
set -euo pipefail
ziel=/var/backups/workflow
stempel=$(date +%Y-%m-%d_%H%M)
# Ergebnis fuer die Seite Serverzustand (liest das Backend, daher 644).
status=/var/lib/workflow/sicherung.json
melden() {
  printf '{"zeit":"%s","ok":%s,"db_bytes":%s,"dateien_bytes":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${2:-null}" "${3:-null}" > "$status.neu"
  chmod 644 "$status.neu" && mv "$status.neu" "$status"
}
trap 'melden false' ERR
sudo -u postgres pg_dump -Fc -d workflow > "$ziel/db_$stempel.dump"
tar -czf "$ziel/dateien_$stempel.tar.gz" -C /var/lib/workflow dateien
find "$ziel" -type f -mtime +14 -delete
melden true "$(stat -c %s "$ziel/db_$stempel.dump")" "$(stat -c %s "$ziel/dateien_$stempel.tar.gz")"
EOF
chmod 700 /usr/local/sbin/workflow-backup

cat > /etc/systemd/system/workflow-backup.service <<'EOF'
[Unit]
Description=WorkFlow Sicherung (Datenbank + Dateien)

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/workflow-backup
EOF

cat > /etc/systemd/system/workflow-backup.timer <<'EOF'
[Unit]
Description=WorkFlow Sicherung naechtlich

[Timer]
OnCalendar=*-*-* 03:15
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now workflow-backup.timer

echo "== Node.js 24 (Backend)"
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get -y -q install nodejs
fi

echo "== Backend-Dienst workflow-server"
# Eigener Systembenutzer ohne Login; darf nur die Dateiablage beschreiben.
id workflow >/dev/null 2>&1 || useradd --system --home /opt/workflow --shell /usr/sbin/nologin workflow
mkdir -p /opt/workflow/server /var/www/updates
chmod 711 /var/lib/workflow
chown -R workflow:workflow /var/lib/workflow/dateien
chown www-data:www-data /var/www/updates
mkdir -p /etc/workflow
if [ ! -f /etc/workflow/server.env ]; then
  PW=$(openssl rand -hex 24)
  sudo -u postgres psql -qc "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'workflow_api') then create role workflow_api login noinherit; end if; end \$\$"
  sudo -u postgres psql -qc "alter role workflow_api password '$PW'"
  cat > /etc/workflow/server.env <<EOF
DATABASE_URL=postgresql://workflow_api:$PW@127.0.0.1:5432/workflow
JWT_SECRET=$(openssl rand -hex 48)
PORT=3000
ERLAUBTE_URSPRUENGE=https://$SSLIP,https://app.workflow-app.de,capacitor://localhost,https://localhost,http://localhost,tauri://localhost,http://tauri.localhost
EOF
fi
chown root:workflow /etc/workflow /etc/workflow/*
chmod 750 /etc/workflow
chmod 640 /etc/workflow/*

cat > /etc/systemd/system/workflow-server.service <<'EOF'
[Unit]
Description=WorkFlow Backend (server/)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=workflow
Group=workflow
WorkingDirectory=/opt/workflow/server
EnvironmentFile=/etc/workflow/server.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.ts
Restart=always
RestartSec=3
# Haertung: nur die Dateiablage ist beschreibbar.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/workflow/dateien

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable workflow-server
# Gestartet wird der Dienst vom ersten "npm run deploy-server" (Code + Migrationen).

echo "== Fertig"
