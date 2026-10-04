/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN — Cabinet (личный кабинет: статус, трафик, логаут)  */
/* ═══════════════════════════════════════════════════════════════ */

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function daysLeft(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  } catch { return null; }
}

// ── Загрузка кабинета ──
async function loadCabinet() {
  const box = document.getElementById('cabinet-info');
  if (!box) return;

  const user = window.__nvAuth?.getUser?.();
  const token = window.__nvAuth?.getToken?.();

  if (!user || !token) {
    box.innerHTML = '<p class="hint">Войдите, чтобы увидеть статус.</p>';
    return;
  }

  box.innerHTML = '<p class="hint">Загрузка...</p>';

  try {
    const r = await fetch('/api/get-vpn-config', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const j = await r.json();

    if (!r.ok) throw new Error(j.error || 'Ошибка');

    const info = j.info || {};
    const limit = info.traffic_limit_gb || 0;
    const expires = info.expires_at;
    const days = daysLeft(expires);

    box.innerHTML = `
      <div class="cabinet-grid">
        <div class="stat-box">
          <div class="stat-label">Статус</div>
          <div class="stat-value" style="color:#4ade80">Активен</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Лимит</div>
          <div class="stat-value">${limit} GB</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Осталось дней</div>
          <div class="stat-value">${days ?? '—'}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Истекает</div>
          <div class="stat-value" style="font-size:14px">${formatDate(expires)}</div>
        </div>
      </div>

      <div class="hint" style="margin-top:14px">
        Аккаунт: <b>${user.email}</b><br>
        UUID: <code>${user.uuid || '—'}</code>
      </div>

      <button type="button" id="cabinet-logout" style="margin-top:16px;background:linear-gradient(180deg,#5a2020,#2a0a0a);border-color:#ff6b6b;color:#ffb8b8">
        🚪 Выйти из аккаунта
      </button>
    `;

    // Logout
    document.getElementById('cabinet-logout')?.addEventListener('click', () => {
      window.__nvAuth.clear();
      location.reload();
    });

  } catch (err) {
    box.innerHTML = `<p class="hint" style="color:#ff6b6b">❌ ${err.message}</p>`;
  }
}

// Экспорт для табов
window.__nvRefreshCabinet = loadCabinet;

// Запускаем при загрузке
document.addEventListener('DOMContentLoaded', () => {
  if (window.__nvAuth?.isAuth?.()) {
    // Если уже авторизован — покажем VPN-карточку и скроем форму
    const card = document.getElementById('auth-card');
    const vpnCard = document.getElementById('vpn-card');
    if (card) card.style.display = 'none';
    if (vpnCard) vpnCard.style.display = 'block';
  }
});
