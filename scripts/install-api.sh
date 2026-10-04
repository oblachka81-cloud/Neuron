#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NEURON VPN — установка API (Node.js 20 + systemd service)
# Запускать: bash install-api.sh
# ═══════════════════════════════════════════════════════════════

set -e

APP_DIR="/var/www/neuron/api"
SERVICE_NAME="neuron-api"
NODE_MAJOR="20"

echo "🚀 NEURON VPN API — установка"

# ── 1. Проверка root ──
if [ "$EUID" -ne 0 ]; then
  echo "❌ Запусти от root: sudo bash install-api.sh"
  exit 1
fi

# ── 2. Node.js 20 ──
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt "$NODE_MAJOR" ]; then
  echo "📦 Устанавливаю Node.js ${NODE_MAJOR}..."
  apt update -qq
  apt install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt update -qq
  apt install -y nodejs
fi

echo "✅ Node.js: $(node -v)"
echo "✅ npm: $(npm -v)"

# ── 3. Папка + зависимости ──
echo "📦 Устанавливаю зависимости..."
cd "$APP_DIR"
npm install --omit=dev

# ── 4. Проверка .env ──
if [ ! -f "$APP_DIR/.env" ]; then
  echo "⚠️  .env не найден!"
  if [ -f "$APP_DIR/.env.example" ]; then
    echo "   Копирую из .env.example — ЗАПОЛНИ реальные значения!"
    cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  fi
  echo "❌ Отредактируй $APP_DIR/.env и запусти скрипт заново."
  exit 1
fi

# ── 5. Systemd service ──
echo "🔧 Создаю systemd-сервис..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=NEURON VPN API
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
EnvironmentFile=${APP_DIR}/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

sleep 2

# ── 6. Проверка ──
if systemctl is-active --quiet ${SERVICE_NAME}; then
  echo ""
  echo "✅ API запущен и работает!"
  echo ""
  echo "   Проверка:  curl http://127.0.0.1:3000/api/health"
  echo "   Логи:      journalctl -u ${SERVICE_NAME} -f"
  echo "   Статус:    systemctl status ${SERVICE_NAME}"
else
  echo ""
  echo "❌ API не запустился. Смотри логи:"
  echo "   journalctl -u ${SERVICE_NAME} -n 30 --no-pager"
  exit 1
fi
