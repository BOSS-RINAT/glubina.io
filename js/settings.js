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

      <label class="login-label">Баллы за каждый 1% прироста выполнения задач командой за день</label>
      <input id="st-points-percent" class="login-input" type="number" min="0" value="${settings.pointsPerPercent ?? 1}" />

      <label class="login-label">Количество участников (для среднего балла)</label>
      <input id="st-count" class="login-input" type="number" min="1" value="${settings.participantsCount}" />

      <label class="login-checkbox-row">
        <input id="st-locked" type="checkbox" ${settings.editLocked ? 'checked' : ''} />
        Запретить участникам редактировать свои задачи (только просмотр и отметки выполнения)
      </label>

      <label class="login-checkbox-row">
        <input id="st-partial-steps" type="checkbox" ${settings.allowPartialStepPoints ? 'checked' : ''} />
        Начислять баллы за частичное выполнение шаговых задач (например, 7 из 10 → 70% от баллов за задачу).
        Если выключено (по умолчанию) — баллы дают только полностью закрытые цели.
      </label>

      <label class="login-label">Ручная корректировка суммарного балла группы</label>
      <input id="st-baseline" class="login-input" type="number" value="${settings.scoreBaselineAdjustment || 0}" />
      <p class="task-note" style="margin:-4px 0 0">
        Прибавляется (или вычитается, если отрицательное) к общему баллу команды на дашборде и в истории баллов —
        удобно, если нужно сдвинуть точку отсчёта, не трогая сами задачи. На баллы конкретных участников
        в рейтинге не влияет.
      </p>

      <button id="st-save" class="modal-btn modal-btn-primary">Сохранить настройки</button>
      <div id="st-msg" class="report-copy-msg"></div>
    </div>

    <h2 class="section-title">Минимальная планка вовлечения</h2>
    <div class="settings-card glass" id="st-engagement-list">
      <p class="task-note">Загрузка участников…</p>
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
      pointsPerPercent: parseFloat(document.getElementById('st-points-percent').value) || 0,
      participantsCount: parseInt(document.getElementById('st-count').value, 10) || 1,
      editLocked: document.getElementById('st-locked').checked,
      allowPartialStepPoints: document.getElementById('st-partial-steps').checked,
      scoreBaselineAdjustment: parseFloat(document.getElementById('st-baseline').value) || 0,
    };
    await updateSettings(fields);
    const msg = document.getElementById('st-msg');
    msg.textContent = 'Сохранено ✓';
    setTimeout(() => msg.textContent = '', 2000);
  });

  subscribeParticipants(list => renderEngagementList(list));
}

function renderEngagementList(participants) {
  const box = document.getElementById('st-engagement-list');
  if (!box) return;
  box.innerHTML = participants.map(p => `
    <div class="settings-row-inline">
      <label class="login-label">${p.name}</label>
      <input class="login-input eng-min-input" type="number" min="0"
        data-pid="${p.id}" value="${p.engagementMin || 0}" />
    </div>
  `).join('') + `<div id="st-eng-msg" class="report-copy-msg"></div>`;

  box.querySelectorAll('.eng-min-input').forEach(input => {
    input.addEventListener('change', async () => {
      const val = Math.max(0, parseInt(input.value, 10) || 0);
      input.value = val;
      await updateEngagementMin(input.dataset.pid, val);
      const msg = document.getElementById('st-eng-msg');
      if (msg) { msg.textContent = 'Сохранено ✓'; setTimeout(() => msg.textContent = '', 1500); }
    });
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
