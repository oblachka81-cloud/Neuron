/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN — VPN (ссылка, копирование, QR, Hiddify, выйти)     */
/* ═══════════════════════════════════════════════════════════════ */

async function loadVpn() {
  const user = window.__nvAuth?.getUser?.();
  if (!user) return;

  const userEl = document.getElementById('vpn-user');
  const linkInput = document.getElementById('vpn-link');
  const copyBtn = document.getElementById('vpn-copy');
  const hiddifyBtn = document.getElementById('vpn-hiddify');
  const qrBtn = document.getElementById('vpn-qr');
  const qrBox = document.getElementById('vpn-qr-box');
  const logoutBtn = document.getElementById('vpn-logout');

  if (userEl) {
    userEl.textContent = `Аккаунт: ${user.email} · UUID: ${user.uuid ? user.uuid.slice(0, 8) + '…' : '—'}`;
  }

  // Показываем карточку, скрываем форму
  const card = document.getElementById('auth-card');
  const vpnCard = document.getElementById('vpn-card');
  if (card) card.style.display = 'none';
  if (vpnCard) vpnCard.style.display = 'block';

  // ── Получаем ссылку с API ──
  try {
    const token = window.__nvAuth.getToken();
    const r = await fetch('/api/get-vpn-config', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const j = await r.json();

    if (!r.ok) throw new Error(j.error || 'Не удалось получить ссылку');

    const link = j.config_link;
    const subUrl = j.subscription_url || link;

    if (linkInput) linkInput.value = link;

    // ── Copy (вешаем один раз) ──
    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = '1';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(linkInput.value);
        } catch {
          linkInput?.select();
          document.execCommand('copy');
        }
        copyBtn.textContent = '✅ Скопировано';
        setTimeout(() => copyBtn.textContent = '📋 Скопировать', 2000);
      });
    }

    // ── Deeplink Hiddify через redirect.html ──
    if (hiddifyBtn && !hiddifyBtn.dataset.bound) {
      hiddifyBtn.dataset.bound = '1';
      hiddifyBtn.addEventListener('click', () => {
        const target = `hiddify://import/${encodeURIComponent(subUrl)}#NEURON`;
        const redirect = `./redirect.html?to=${encodeURIComponent(target)}`;
        window.open(redirect, '_blank');
      });
    }

    // ── QR-код ──
    if (qrBtn && !qrBtn.dataset.bound) {
      qrBtn.dataset.bound = '1';
      qrBtn.addEventListener('click', () => {
        if (!qrBox) return;
        if (qrBox.style.display === 'block') {
          qrBox.style.display = 'none';
          return;
        }
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(linkInput.value)}`;
        qrBox.innerHTML = `<img src="${qrUrl}" alt="QR" style="border-radius:12px;border:2px solid #caa64e;max-width:90%"/>`;
        qrBox.style.display = 'block';
      });
    }

    // ── Выйти из аккаунта ──
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', () => {
        if (confirm('Выйти из аккаунта?')) {
          window.__nvAuth.clear();
          location.reload();
        }
      });
    }

  } catch (err) {
    if (userEl) userEl.textContent = '❌ ' + err.message;
  }
}

// ── Автозапуск при загрузке, если пользователь уже авторизован ──
document.addEventListener('DOMContentLoaded', () => {
  if (window.__nvAuth?.isAuth?.()) {
    // Небольшая задержка, чтобы все скрипты (auth.js, cabinet.js) успели загрузиться
    setTimeout(() => {
      if (typeof window.__nvLoadVpn === 'function') {
        window.__nvLoadVpn();
      }
    }, 100);
  }
});

// Экспорт
window.__nvLoadVpn = loadVpn;
