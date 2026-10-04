/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN — Auth (регистрация / логин / логаут)               */
/* ═══════════════════════════════════════════════════════════════ */

const API_URL = ''; // тот же домен, что и сайт → /api/...

// ── Хранилище токена ──
const TOKEN_KEY = 'nv_token';
const USER_KEY = 'nv_user';

const Auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },
  save: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isAuth: () => !!localStorage.getItem(TOKEN_KEY),
};

// ── UI-состояние формы ──
let mode = 'register'; // 'register' | 'login'

function setStatus(el, msg, kind = '') {
  if (!el) return;
  el.textContent = msg;
  el.className = 'status ' + kind;
}

function switchMode() {
  mode = mode === 'register' ? 'login' : 'register';
  const btn = document.getElementById('auth-submit');
  const toggle = document.getElementById('toggle-auth');
  const header = document.querySelector('#auth-card h2');

  if (mode === 'register') {
    if (btn) btn.textContent = 'Создать аккаунт';
    if (toggle) toggle.textContent = 'Войти';
    if (header) header.textContent = 'Регистрация';
  } else {
    if (btn) btn.textContent = 'Войти';
    if (toggle) toggle.textContent = 'Создать аккаунт';
    if (header) header.textContent = 'Вход';
  }
}

// ── Инициализация ──
function initAuth() {
  const form = document.getElementById('auth-form');
  const statusEl = document.getElementById('auth-status');
  const toggle = document.getElementById('toggle-auth');
  const card = document.getElementById('auth-card');
  const vpnCard = document.getElementById('vpn-card');

  if (!form) return;

  // Если уже авторизован — скрываем форму, показываем VPN
  if (Auth.isAuth()) {
    if (card) card.style.display = 'none';
    if (vpnCard) vpnCard.style.display = 'block';
    return;
  }

  toggle?.addEventListener('click', (e) => {
    e.preventDefault();
    switchMode();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
      setStatus(statusEl, '❌ Email и пароль обязательны', 'err');
      return;
    }
    if (password.length < 8) {
      setStatus(statusEl, '❌ Пароль минимум 8 символов', 'err');
      return;
    }

    const endpoint = mode === 'register' ? '/api/register' : '/api/login';
    setStatus(statusEl, '⏳ Отправка...');

    try {
      const r = await fetch(API_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();

      if (!r.ok) throw new Error(j.error || j.detail || 'Ошибка');

      // При регистрации — сохраняем и автоматически логинимся
      if (mode === 'register') {
        setStatus(statusEl, '✅ Регистрация успешна. Входим...', 'ok');
        // Пробуем залогиниться
        const lr = await fetch(API_URL + '/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const lj = await lr.json();
        if (!lr.ok) throw new Error(lj.error || 'Ошибка входа после регистрации');
        Auth.save(lj.token, lj.user);
      } else {
        Auth.save(j.token, j.user);
      }

      setStatus(statusEl, '✅ Готово! Загружаем VPN...', 'ok');

      // Скрываем форму, показываем VPN-карточку
      if (card) card.style.display = 'none';
      if (vpnCard) vpnCard.style.display = 'block';

      // Запускаем получение VPN-ссылки
      if (typeof window.__nvLoadVpn === 'function') {
        window.__nvLoadVpn();
      }
    } catch (err) {
      setStatus(statusEl, '❌ ' + err.message, 'err');
    }
  });
}

document.addEventListener('DOMContentLoaded', initAuth);

// Экспорт для других скриптов
window.__nvAuth = Auth;
window.__nvSetStatus = setStatus;
