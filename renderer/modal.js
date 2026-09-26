// ============================================
// КРАСИВЫЕ МОДАЛКИ В СТИЛЕ LUMEN
// ============================================

// Toast — всплывающее сообщение
window.showToast = function(message, type = 'info', duration = 3000) {
  let toast = document.getElementById('lumen-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'lumen-toast';
    toast.className = 'lumen-toast';
    document.body.appendChild(toast);
  }

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  toast.className = 'lumen-toast lumen-toast-' + type;
  toast.innerHTML = `
    <span class="lumen-toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="lumen-toast-text"></span>
  `;
  toast.querySelector('.lumen-toast-text').textContent = message;

  setTimeout(() => toast.classList.add('show'), 10);

  clearTimeout(window.__lumenToastTimeout);
  window.__lumenToastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
};

// Модалка — центральное окно
window.showModal = function({ title, content, buttons, width }) {
  // Удалить старую, если есть
  const oldOverlay = document.getElementById('lumen-modal-overlay');
  if (oldOverlay) oldOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'lumen-modal-overlay';
  overlay.id = 'lumen-modal-overlay';

  const buttonsList = buttons || [{ label: 'OK', class: 'primary', action: 'close' }];

  // Структура — через HTML без inline-обработчиков
  overlay.innerHTML = `
    <div class="lumen-modal-box" style="${width ? 'max-width:' + width + 'px;' : ''}">
      <div class="lumen-modal-header">
        <h2></h2>
        <button class="lumen-modal-close" type="button">✕</button>
      </div>
      <div class="lumen-modal-body"></div>
      <div class="lumen-modal-footer"></div>
    </div>
  `;

  // Заголовок и содержимое — через textContent
  overlay.querySelector('.lumen-modal-header h2').textContent = title || 'Сообщение';
  overlay.querySelector('.lumen-modal-body').textContent = content || '';

  // Кнопки через addEventListener
  const footer = overlay.querySelector('.lumen-modal-footer');
  buttonsList.forEach(b => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lumen-modal-btn ' + (b.class || '');
    btn.textContent = b.label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof b.onClick === 'function') {
       b.onClick();
      } else if (b.action === 'close' || b.action === 'closeModal' || !b.action) {
       window.closeModal();
      }
    });
    footer.appendChild(btn);
  });

  // Кнопка ✕ в шапке
  overlay.querySelector('.lumen-modal-close').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.closeModal();
  });

  // Клик по фону — закрыть
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) window.closeModal();
  });

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);
};

// Закрытие модалки
window.closeModal = function() {
  const overlay = document.getElementById('lumen-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 200);
};

// Экранирование HTML
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

// Закрытие по Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.closeModal();
});