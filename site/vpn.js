/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN — VPN (ссылка, копирование, QR, deeplink Hiddify)   */
/* ═══════════════════════════════════════════════════════════════ */

const WS_PATH = '/ws-5f847e4871c4f2cb';

// ── Загрузка VPN-ссылки с API ──
async function loadVpn() {
  const user = window.__nvAuth?.getUser?.();
  if (!user) return;

  const userEl = document.getElementById('vpn-user');
  const linkInput = document.getElementById('vpn-link');
  const copyBtn = document.getElementById('vpn-copy');
  const hiddifyBtn = document.getElementById('vpn-hiddify');
  const qrBtn = document.getElementById('vpn-qr');
  const qrBox = document.getElementById('vpn-qr-box');

  if (userEl) {
    userEl.textContent = `Аккаунт: ${user.email} · UUID: ${user.uuid ? user.uuid.slice(0, 8) + '…' : '—'}`;
  }

  // Запрашиваем ссылку у API
  try {
    const token = window.__nvAuth.getToken();
    const r = await fetch('/api/get-vpn-config', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const j = await r.json();

    if (!r.ok) throw new Error(j.error || 'Не удалось получить ссылку');

    const link = j.config_link;
    if (linkInput) linkInput.value = link;

    // Copy
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        copyBtn.textContent = '✅ Скопировано';
        setTimeout(() => copyBtn.textContent = '📋 Скопировать ссылку', 2000);
      } catch {
        // Fallback — выделяем текст
        linkInput?.select();
        document.execCommand('copy');
        copyBtn.textContent = '✅ Скопировано';
        setTimeout(() => copyBtn.textContent = '📋 Скопировать ссылку', 2000);
      }
    });

    // Deeplink Hiddify
    hiddifyBtn?.addEventListener('click', () => {
      const deeplink = `hiddify://import/${encodeURIComponent(link)}#NEURON`;
      window.location.href = deeplink;
    });

    // QR-код (использует внешний API, никаких библиотек не нужно)
    qrBtn?.addEventListener('click', () => {
      if (!qrBox) return;
      if (qrBox.style.display === 'block') {
        qrBox.style.display = 'none';
        return;
      }
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(link)}`;
      qrBox.innerHTML = `<img src="${qrUrl}" alt="QR" style="border-radius:12px;border:2px solid #caa64e;max-width:90%"/>`;
      qrBox.style.display = 'block';
    });

  } catch (err) {
    if (userEl) userEl.textContent = '❌ ' + err.message;
  }
}

// Экспорт
window.__nvLoadVpn = loadVpn;
