/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN — Cabinet (личный кабинет: статус, трафик, срок)    */
/* Кнопка «Выйти» убрана — она теперь на главной в VPN-карточке   */
/* ═══════════════════════════════════════════════════════════════ */

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n || n < 1024) return `${n} B`;
  const kb = n / 1024;
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
    const used = info.traffic_used_bytes || 0;
    const expires = info.expires_at;
    const days = daysLeft(expires);
    const uuid = info.uuid || user.uuid || '—';

    // Процент использованного трафика
    const usedGB = used / (1024 * 1024 * 1024);
    const pct = limit > 0 ? Math.min(100, Math.round((usedGB / limit) * 100)) : 0;

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
          <div class="stat-label">Использовано</div>
          <div class="stat-value">${formatBytes(used)}</div>
          <div class="stat-sub" style="color:#4ade80">${pct}%</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Осталось дней</div>
          <div class="stat-value">${days ?? '—'}</div>
        </div>
      </div>

      <div class="hint" style="margin-top:16px">
        <div>Истекает: <b>${formatDate(expires)}</b></div>
        <div>Аккаунт: <b>${user.email}</b></div>
        <div style="word-break:break-all">UUID: <code>${uuid}</code></div>
      </div>
    `;

  } catch (err) {
    box.innerHTML = `<p class="hint" style="color:#ff6b6b">❌ ${err.message}</p>`;
  }
}

window.__nvRefreshCabinet = loadCabinet;

// Автозагрузка при переходе на таб «Мой кабинет»
document.addEventListener('DOMContentLoaded', () => {
  if (window.__nvAuth?.isAuth?.()) {
    loadCabinet();
  }
});
