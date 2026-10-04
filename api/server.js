/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN API — главный сервер (Express + JWT + MySQL)         */
/*                                                                  */
/* Эндпоинты:                                                       */
/*   GET  /api/health          — проверка живости                   */
/*   POST /api/register        — регистрация                        */
/*   POST /api/login           — вход, выдаёт JWT                   */
/*   GET  /api/me              — профиль (JWT)                      */
/*   GET  /api/get-vpn-config  — VLESS-ссылка + лимиты (JWT)        */
/* ═══════════════════════════════════════════════════════════════ */

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { testConnection, migrate, Users, Audit } = require('./db');
const marzban = require('./marzban');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: JWT_SECRET не задан или короче 32 символов!');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// ── CORS (простой, без библиотеки) ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Логирование запросов ──
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Хелперы ──
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    null
  );
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ── Middleware JWT ──
function authRequired(req, res, next) {
  const hdr = req.headers['authorization'] || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Токен не передан' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(403).json({ error: 'Неверный или истёкший токен' });
  }
}

// ═══════════════════════════════════════════════════════════════
// ЭНДПОИНТЫ
// ═══════════════════════════════════════════════════════════════

// ── Health ──
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'neuron-vpn-api', ts: Date.now() });
});

// ── Регистрация ──
app.post('/api/register', async (req, res) => {
  const ip = clientIp(req);
  try {
    const { email, password } = req.body || {};

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Неверный email' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Пароль минимум 8 символов' });
    }

    const existing = await Users.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    // 1. Хешируем пароль
    const passwordHash = await bcrypt.hash(password, 12);

    // 2. Создаём в Marzban
    let marzbanUser;
    try {
      marzbanUser = await marzban.createUser(email);
    } catch (err) {
      console.error('Ошибка Marzban при регистрации:', err.message);
      return res.status(502).json({ error: 'VPN-сервис временно недоступен' });
    }

    // 3. Сохраняем в БД
    const userId = await Users.create({
      email,
      passwordHash,
      marzbanUsername: marzbanUser.username,
      marzbanUuid: marzbanUser.proxies?.vless?.id,
    });

    await Audit.log({
      userId,
      action: 'register',
      details: `marzban:${marzbanUser.username}`,
      ip,
    });

    console.log(`✅ Регистрация: ${email} → ${marzbanUser.username}`);

    res.status(201).json({
      message: 'Регистрация успешна',
      user: { id: userId, email },
    });
  } catch (err) {
    console.error('Ошибка /api/register:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── Логин ──
app.post('/api/login', async (req, res) => {
  const ip = clientIp(req);
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    const user = await Users.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await Audit.log({ userId: user.id, action: 'login_fail', ip });
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = signToken(user);
    await Audit.log({ userId: user.id, action: 'login', ip });

    console.log(`✅ Логин: ${email}`);

    res.json({
      message: 'Вход выполнен успешно',
      token,
      user: {
        id: user.id,
        email: user.email,
        uuid: user.marzban_uuid,
      },
    });
  } catch (err) {
    console.error('Ошибка /api/login:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── Профиль ──
app.get('/api/me', authRequired, async (req, res) => {
  try {
    const user = await Users.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    res.json({
      id: user.id,
      email: user.email,
      uuid: user.marzban_uuid,
      created_at: user.created_at,
    });
  } catch (err) {
    console.error('Ошибка /api/me:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ── VPN-конфиг ──
app.get('/api/get-vpn-config', authRequired, async (req, res) => {
  const ip = clientIp(req);
  try {
    const user = await Users.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    if (!user.marzban_username) {
      return res.status(500).json({ error: 'Marzban-аккаунт не привязан' });
    }

    // Получаем ссылку и статус из Marzban
    const [links, info] = await Promise.all([
      marzban.getLinks(user.marzban_username),
      marzban.getUserInfo(user.marzban_username),
    ]);

    await Audit.log({
      userId: user.id,
      action: 'get_vpn_config',
      details: `status:${info?.status}`,
      ip,
    });

    res.json({
      status: 'success',
      config_link: links.vless_link,
      subscription_url: links.subscription_url,
      info: {
        traffic_limit_gb: info?.traffic_limit_gb ?? 0,
        traffic_used_bytes: info?.traffic_used_bytes ?? 0,
        expires_at: info?.expire ?? null,
        account_status: info?.status ?? 'unknown',
        uuid: links.uuid,
      },
    });
  } catch (err) {
    console.error('Ошибка /api/get-vpn-config:', err);
    res.status(500).json({ error: 'Не удалось получить VPN-конфиг' });
  }
});

// ── 404 ──
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Глобальный обработчик ошибок ──
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ═══════════════════════════════════════════════════════════════
// СТАРТ
// ═══════════════════════════════════════════════════════════════

(async () => {
  console.log('🚀 NEURON VPN API — запуск...');

  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('❌ Не удалось подключиться к MySQL. Проверь .env');
    process.exit(1);
  }

  await migrate();

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ API слушает http://127.0.0.1:${PORT}`);
    console.log(`   Эндпоинты: /api/health /api/register /api/login /api/me /api/get-vpn-config`);
  });
})();
