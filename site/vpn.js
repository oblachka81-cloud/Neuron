/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN — VPN (ссылка, копирование, QR, deeplink Hiddify)   */
/* ═══════════════════════════════════════════════════════════════ */

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

    // ── Copy ──
    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        linkInput?.select();
        document.execCommand('copy');
      }
      copyBtn.textContent = '✅ Скопировано';
      setTimeout(() => copyBtn.textContent = '📋 Скопировать ссылку', 2000);
    });

    // ── Deeplink Hiddify через redirect.html ──
    // Chrome блокирует hiddify:// из JS, но если это прямой клик по ссылке
    // на HTML-странице — переход срабатывает. Поэтому открываем redirect.html.
    hiddifyBtn?.addEventListener('click', () => {
      const target = `hiddify://import/${encodeURIComponent(subUrl)}#NEURON`;
      const redirect = `./redirect.html?to=${encodeURIComponent(target)}`;
      window.open(redirect, '_blank');
    });

    // ── QR-код ──
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

window.__nvLoadVpn = loadVpn;
