/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN API — Marzban integration                            */
/*                                                                  */
/* Что делает:                                                      */
/*   - Автологин в Marzban (токен обновляется сам)                  */
/*   - Создание нового VPN-юзера                                    */
/*   - Получение subscription URL и прямой VLESS-ссылки             */
/*   - Обновление лимитов, удаление                                 */
/* ═══════════════════════════════════════════════════════════════ */

require('dotenv').config();
const axios = require('axios');

const MARZBAN_URL = (process.env.MARZBAN_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const MARZBAN_USERNAME = process.env.MARZBAN_USERNAME;
const MARZBAN_PASSWORD = process.env.MARZBAN_PASSWORD;

const VPN_DOMAIN = process.env.VPN_DOMAIN;
const VPN_WS_PATH = process.env.VPN_WS_PATH || '/ws-5f847e4871c4f2cb';

const DEFAULT_TRAFFIC_GB = Number(process.env.DEFAULT_TRAFFIC_GB || 10);
const DEFAULT_EXPIRE_DAYS = Number(process.env.DEFAULT_EXPIRE_DAYS || 7);

// ── Клиент HTTP ──
const http = axios.create({
  baseURL: MARZBAN_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Токен + срок истечения ──
let _token = null;
let _tokenExp = 0; // unix-время (сек)

async function login() {
  const body = new URLSearchParams({
    username: MARZBAN_USERNAME,
    password: MARZBAN_PASSWORD,
  });

  const r = await http.post('/api/admin/token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  _token = r.data.access_token;
  // Marzban выдаёт exp в JWT, но проще поставить TTL 20 часов
  _tokenExp = Math.floor(Date.now() / 1000) + 20 * 3600;
  console.log('🔐 Marzban: получен токен, действует ~20 часов');
  return _token;
}

async function authHeader() {
  const now = Math.floor(Date.now() / 1000);
  if (!_token || now >= _tokenExp - 60) {
    await login();
  }
  return { Authorization: `Bearer ${_token}` };
}

// ── Хелпер: генерим username для Marzban из email ──
function sanitizeUsername(email) {
  // Marzban требует 3-32 символа, [a-z0-9_]
  let base = String(email || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (base.length < 3) base = `user_${Math.random().toString(36).slice(2, 8)}`;
  if (base.length > 30) base = base.slice(0, 30);

  // Добавим короткий суффикс для уникальности
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}_${suffix}`;
}

// ── Хелпер: строим VLESS-ссылку по username ──
function buildVlessLink(marzbanUser) {
  // Берём UUID и subscription-путь из данных Marzban
  const uuid = marzbanUser?.proxies?.vless?.id;
  if (!uuid) throw new Error('Marzban: UUID не найден у юзера');

  const params = new URLSearchParams({
    security: 'tls',
    type: 'ws',
    host: VPN_DOMAIN,
    sni: VPN_DOMAIN,
    path: VPN_WS_PATH,
    fp: 'chrome',
    alpn: 'h2,http/1.1',
  });

  const label = encodeURIComponent(`🚀 NEURON ${marzbanUser.username}`);
  return `vless://${uuid}@${VPN_DOMAIN}:443?${params.toString()}#${label}`;
}

// ── Публичные методы ──

/**
 * Создаёт нового юзера в Marzban.
 * @param {string} email — для username
 * @param {object} opts — { trafficGB, expireDays }
 */
async function createUser(email, opts = {}) {
  const headers = await authHeader();

  const trafficGB = Number(opts.trafficGB ?? DEFAULT_TRAFFIC_GB);
  const expireDays = Number(opts.expireDays ?? DEFAULT_EXPIRE_DAYS);

  const username = sanitizeUsername(email);
  const expireAt = new Date(Date.now() + expireDays * 86400 * 1000).toISOString();

  const payload = {
    username,
    proxies: { vless: {} },
    inbounds: { vless: ['VLESS WS'] },
    expire: Math.floor(new Date(expireAt).getTime() / 1000),
    data_limit: trafficGB * 1024 * 1024 * 1024, // в байтах
    data_limit_reset_strategy: 'no_reset',
    status: 'active',
    note: `site:${email}`,
  };

  try {
    const r = await http.post('/api/user', payload, { headers });
    console.log(`✅ Marzban: создан юзер ${username}`);
    return r.data;
  } catch (err) {
    const msg = err.response?.data?.detail || err.message;
    console.error(`❌ Marzban: ошибка создания юзера ${username}:`, msg);
    throw new Error(`Marzban: ${msg}`);
  }
}

/**
 * Получает юзера из Marzban по username.
 */
async function getUser(username) {
  const headers = await authHeader();
  try {
    const r = await http.get(`/api/user/${encodeURIComponent(username)}`, { headers });
    return r.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Удаляет юзера из Marzban.
 */
async function deleteUser(username) {
  const headers = await authHeader();
  try {
    await http.delete(`/api/user/${encodeURIComponent(username)}`, { headers });
    return true;
  } catch (err) {
    if (err.response?.status === 404) return false;
    throw err;
  }
}

/**
 * Обновляет лимиты/срок юзера.
 */
async function updateUser(username, updates) {
  const headers = await authHeader();
  const r = await http.put(`/api/user/${encodeURIComponent(username)}`, updates, { headers });
  return r.data;
}

/**
 * Возвращает subscription URL и прямую VLESS-ссылку.
 */
async function getLinks(username) {
  const user = await getUser(username);
  if (!user) throw new Error('Marzban: юзер не найден');

  const subscriptionUrl = user.subscription_url
    ? `${MARZBAN_URL}${user.subscription_url}`
    : null;

  const vlessLink = buildVlessLink(user);

  return {
    uuid: user.proxies?.vless?.id,
    subscription_url: subscriptionUrl,
    vless_link: vlessLink,
    expire: user.expire,
    data_limit: user.data_limit,
    used_traffic: user.used_traffic,
    status: user.status,
  };
}

/**
 * Полная сводка по юзеру — для личного кабинета.
 */
async function getUserInfo(username) {
  const user = await getUser(username);
  if (!user) return null;

  const expireAt = user.expire ? new Date(user.expire * 1000).toISOString() : null;
  const limitGB = user.data_limit ? Math.round(user.data_limit / (1024 * 1024 * 1024)) : 0;
  const usedBytes = Number(user.used_traffic || 0);

  return {
    username: user.username,
    status: user.status,
    expire: expireAt,
    traffic_limit_gb: limitGB,
    traffic_used_bytes: usedBytes,
    uuid: user.proxies?.vless?.id || null,
  };
}

module.exports = {
  createUser,
  getUser,
  deleteUser,
  updateUser,
  getLinks,
  getUserInfo,
  buildVlessLink,
};
