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

      <label class="login-label">Ручная корректировка баллов за Цели</label>
      <input id="st-baseline-goals" class="login-input" type="number" value="${settings.scoreBaselineAdjustmentGoals || 0}" />

      <label class="login-label">Ручная корректировка баллов за %</label>
      <input id="st-baseline-percent" class="login-input" type="number" value="${settings.scoreBaselineAdjustmentPercent || 0}" />
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
    ${renderAccessPanelHtml()}
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
      scoreBaselineAdjustmentGoals: parseFloat(document.getElementById('st-baseline-goals').value) || 0,
      scoreBaselineAdjustmentPercent: parseFloat(document.getElementById('st-baseline-percent').value) || 0,
    };
    await updateSettings(fields);
    const msg = document.getElementById('st-msg');
    msg.textContent = 'Сохранено ✓';
    setTimeout(() => msg.textContent = '', 2000);
  });

  subscribeParticipants(list => renderEngagementList(list));

  if (currentUser.isSuperAdmin) {
    subscribeManagedAccounts(list => renderAccessPanelList(list));
    wireAccessPanelForm();
  }
}

function renderAccessPanelHtml() {
  if (!currentUser.isSuperAdmin) {
    return `
      <div class="settings-card glass">
        <p class="task-note">Создание и деактивация профилей доступны только супер-админу (это вы увидите под своим логином).</p>
      </div>
    `;
  }
  return `
    <div class="settings-card glass">
      <p class="task-note" style="margin-bottom:12px">
        Создать новый вход (админ или гость). Пароль показывается один раз сразу после создания — сохраните его,
        Firebase не позволяет посмотреть чужой пароль повторно.
      </p>
      <label class="login-label">Роль</label>
      <select id="ap-role" class="login-input">
        <option value="admin">Админ</option>
        <option value="guest">Гость</option>
      </select>
      <label class="login-label">Логин (латиницей, без пробелов)</label>
      <input id="ap-login" class="login-input" placeholder="например: admin2" />
      <label class="login-label">Имя (отображается в списке при входе)</label>
      <input id="ap-name" class="login-input" placeholder="например: Ксения" />
      <label class="login-label">Пароль</label>
      <div style="display:flex;gap:8px">
        <input id="ap-password" class="login-input" placeholder="пароль" />
        <button id="ap-gen-pass" class="modal-btn modal-btn-secondary" style="flex-shrink:0;margin:0">Сгенерировать</button>
      </div>
      <button id="ap-create-btn" class="modal-btn modal-btn-primary" style="margin-top:14px">Создать профиль</button>
      <div id="ap-create-msg" class="report-copy-msg"></div>
    </div>

    <h3 style="font-size:15px;font-weight:700;margin:18px 0 8px">Существующие профили</h3>
    <div class="settings-card glass" id="ap-list">
      <p class="task-note">Загрузка…</p>
    </div>
  `;
}

function apRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function renderAccessPanelList(accounts) {
  const box = document.getElementById('ap-list');
  if (!box) return;
  if (!accounts.length) { box.innerHTML = `<p class="task-note">Пока никого нет.</p>`; return; }
  box.innerHTML = accounts.map(a => `
    <div class="report-controls-row" style="align-items:center;justify-content:space-between">
      <div>
        <div style="font-weight:600">${a.displayName} <span class="readonly-tag">${a.role === 'admin' ? 'админ' : 'гость'}</span></div>
        <div class="task-note" style="margin:0">логин: ${a.login}</div>
      </div>
      ${a.login === 'admin'
        ? `<span class="task-note">это вы</span>`
        : `<button class="modal-btn modal-btn-danger ap-deactivate-btn" data-uid="${a.uid}" data-login="${a.login}" data-name="${a.displayName}">Деактивировать</button>`}
    </div>
  `).join('');

  box.querySelectorAll('.ap-deactivate-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Деактивировать вход «${btn.dataset.name}»? Он сразу потеряет доступ. Можно будет создать новый профиль взамен.`)) return;
      btn.disabled = true;
      try {
        await deactivateManagedAccount(btn.dataset.uid, btn.dataset.login);
      } catch (err) {
        alert('Не удалось деактивировать: ' + err.message);
        btn.disabled = false;
      }
    });
  });
}

function wireAccessPanelForm() {
  const genBtn = document.getElementById('ap-gen-pass');
  const passInput = document.getElementById('ap-password');
  if (genBtn && passInput) {
    genBtn.addEventListener('click', () => { passInput.value = apRandomPassword(); });
    passInput.value = apRandomPassword();
  }

  const createBtn = document.getElementById('ap-create-btn');
  if (!createBtn) return;
  createBtn.addEventListener('click', async () => {
    const msg = document.getElementById('ap-create-msg');
    const role = document.getElementById('ap-role').value;
    const login = document.getElementById('ap-login').value.trim().toLowerCase();
    const displayName = document.getElementById('ap-name').value.trim();
    const password = document.getElementById('ap-password').value.trim();

    if (!/^[a-z0-9_]{3,20}$/.test(login)) {
      msg.innerHTML = `<span style="color:#D70015">Логин — латиницей/цифрами, 3–20 символов, без пробелов</span>`;
      return;
    }
    if (!displayName) { msg.innerHTML = `<span style="color:#D70015">Укажите имя</span>`; return; }
    if (password.length < 6) { msg.innerHTML = `<span style="color:#D70015">Пароль минимум 6 символов</span>`; return; }

    createBtn.disabled = true;
    msg.textContent = 'Создаю…';
    try {
      await createManagedAccount({ login, displayName, role, password });
      msg.innerHTML = `✅ Готово! Логин: <code>${login}</code>, пароль: <code>${password}</code> — сохраните это, повторно пароль не показать.`;
      document.getElementById('ap-login').value = '';
      document.getElementById('ap-name').value = '';
      document.getElementById('ap-password').value = apRandomPassword();
    } catch (err) {
      msg.innerHTML = `<span style="color:#D70015">⚠ ${err.message}</span>`;
    } finally {
      createBtn.disabled = false;
    }
  });
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
