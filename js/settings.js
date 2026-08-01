// ============================================================
//  НАСТРОЙКИ (только для админа)
// ============================================================

function renderSettingsPage(settings) {
  const root = document.getElementById('settings-root');
  if (!root) return;

  root.innerHTML = `
    <div class="settings-card glass">
      <label class="login-label">Название турнира</label>
      <input id="st-tournament" class="login-input" value="${settings.tournamentName || ''}" />

      <label class="login-label">Имя автора отчёта (строка "Имя ДД.ММ")</label>
      <input id="st-author" class="login-input" value="${settings.reportAuthorName || ''}" />

      <label class="login-label">Баллы за выполненную задачу</label>
      <input id="st-points-task" class="login-input" type="number" min="0" value="${settings.pointsPerTask}" />

      <label class="login-label">Баллы за одно вовлечение</label>
      <input id="st-points-eng" class="login-input" type="number" min="0" value="${settings.pointsPerEngagement}" />

      <label class="login-label">Количество участников (для среднего балла)</label>
      <input id="st-count" class="login-input" type="number" min="1" value="${settings.participantsCount}" />

      <label class="login-checkbox-row">
        <input id="st-locked" type="checkbox" ${settings.editLocked ? 'checked' : ''} />
        Запретить участникам редактировать свои задачи (только просмотр и отметки выполнения)
      </label>

      <button id="st-save" class="modal-btn modal-btn-primary">Сохранить настройки</button>
      <div id="st-msg" class="report-copy-msg"></div>
    </div>

    <h2 class="section-title">Управление доступом</h2>
    <div class="settings-card glass">
      <p class="task-note">Первоначальная настройка аккаунтов (создание логинов/паролей) выполняется один раз на странице <a href="setup.html">setup.html</a>.</p>
    </div>
  `;

  document.getElementById('st-save').addEventListener('click', async () => {
    const fields = {
      tournamentName: document.getElementById('st-tournament').value.trim(),
      reportAuthorName: document.getElementById('st-author').value.trim(),
      pointsPerTask: parseFloat(document.getElementById('st-points-task').value) || 0,
      pointsPerEngagement: parseFloat(document.getElementById('st-points-eng').value) || 0,
      participantsCount: parseInt(document.getElementById('st-count').value, 10) || 1,
      editLocked: document.getElementById('st-locked').checked,
    };
    await updateSettings(fields);
    const msg = document.getElementById('st-msg');
    msg.textContent = 'Сохранено ✓';
    setTimeout(() => msg.textContent = '', 2000);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    if (user.role !== 'admin') {
      const root = document.getElementById('settings-root');
      if (root) root.innerHTML = `<div class="loading-placeholder">Эта страница доступна только администратору.</div>`;
      return;
    }
    subscribeSettings(renderSettingsPage);
  });
});
