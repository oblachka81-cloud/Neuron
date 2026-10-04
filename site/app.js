/* ═══════════════════════════════════════════════════════════════ */
/* NEURON VPN — App (табы + музыка + проверка статуса)            */
/* ═══════════════════════════════════════════════════════════════ */

// ── Музыка ──
(function initMusic() {
  const btn = document.getElementById('music-btn');
  const audio = document.getElementById('bg-music');
  if (!btn || !audio) return;

  let enabled = false;
  const render = () => { btn.textContent = enabled ? '🔊' : '🔇'; };
  const apply = () => {
    if (enabled) audio.play().catch(() => {});
    else audio.pause();
  };

  btn.addEventListener('click', () => {
    enabled = !enabled;
    render();
    apply();
  });

  // Первый жест — попытка старта (браузеры блокируют автоплей)
  const onFirstGesture = () => {
    if (enabled) apply();
    window.removeEventListener('pointerdown', onFirstGesture);
  };
  window.addEventListener('pointerdown', onFirstGesture);

  render();
})();

// ── Табы ──
(function initTabs() {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Активный таб
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Активная панель
      document.querySelectorAll('[data-panel]').forEach((p) => p.classList.remove('active'));
      const panel = document.querySelector(`[data-panel="${tab}"]`);
      if (panel) panel.classList.add('active');

      // Обновляем данные при заходе на таб кабинета
      if (tab === 'cabinet' && typeof window.__nvRefreshCabinet === 'function') {
        window.__nvRefreshCabinet();
      }
    });
  });
})();

// ── Проверка статуса (позже — реальный API) ──
(async function initStatus() {
  const el = document.getElementById('pill-status');
  if (!el) return;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (r.ok) {
      el.textContent = 'ONLINE ✓';
      el.style.background = '#1d4d2b';
      el.style.color = '#fff';
      el.style.borderColor = '#4ade80';
    } else {
      throw new Error('offline');
    }
  } catch {
    el.textContent = 'OFFLINE';
    el.style.background = '#6b2b2b';
    el.style.color = '#fff';
    el.style.borderColor = '#ff6b6b';
  }
})();

// ── Кнопка «Инструкции» (открытие бота/канала, если нужно) ──
document.getElementById('btn-ecosystem')?.addEventListener('click', () => {
  const url = 'https://t.me/NeuronEcosystemBot?startapp=neuron';
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank');
});
