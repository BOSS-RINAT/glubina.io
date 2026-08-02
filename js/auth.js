// ============================================================
//  АУТЕНТИФИКАЦИЯ И РОЛИ
// ============================================================
//
// currentUser после входа выглядит так:
// { uid, login, displayName, role: 'admin'|'participant'|'guest', participantId }

let currentUser = null;
let authReadyCallbacks = [];

function onAuthReady(cb) {
  if (currentUser !== undefined && currentUser !== null) cb(currentUser);
  authReadyCallbacks.push(cb);
}

function renderLoginScreen(container) {
  const options = LOGIN_ACCOUNTS.map(a => `<option value="${a.login}">${a.displayName}</option>`).join('');
  container.innerHTML = `
    <div class="login-wrap">
      <div class="login-card glass">
        <div class="login-title">Мастермайнд</div>
        <div class="login-sub">Выберите своё имя и введите пароль</div>
        <label class="login-label">Имя</label>
        <select id="login-select" class="login-input">${options}</select>
        <label class="login-label">Пароль</label>
        <input id="login-password" class="login-input" type="password" autocomplete="current-password" placeholder="Пароль" />
        <button id="login-btn" class="login-btn">Войти</button>
        <div id="login-error" class="login-error"></div>
      </div>
    </div>
  `;

  const savedLogin = localStorage.getItem('mm_last_login');
  if (savedLogin) container.querySelector('#login-select').value = savedLogin;

  const doLogin = () => {
    const login = container.querySelector('#login-select').value;
    const password = container.querySelector('#login-password').value;
    const errorEl = container.querySelector('#login-error');
    errorEl.textContent = '';
    if (!password) {
      errorEl.textContent = 'Введите пароль';
      return;
    }
    auth.signInWithEmailAndPassword(loginIdToEmail(login), password)
      .then(() => {
        localStorage.setItem('mm_last_login', login);
      })
      .catch(err => {
        console.error(err);
        errorEl.textContent = 'Неверный пароль или аккаунт ещё не создан';
      });
  };

  container.querySelector('#login-btn').addEventListener('click', doLogin);
  container.querySelector('#login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
}

function logout() {
  auth.signOut();
}

// ---------- показ ошибки прямо на экране (вместо тихого console.error) ----------

function showFatalError(title, detail) {
  const gate = document.getElementById('auth-gate');
  const appRoot = document.getElementById('app-root');
  if (appRoot) appRoot.style.display = 'none';
  if (gate) {
    gate.style.display = 'block';
    gate.innerHTML = `<div class="login-wrap"><div class="login-card glass">
      <div class="login-title">⚠️ ${title}</div>
      <div class="login-sub" style="word-break:break-word">${detail || ''}</div>
      <button class="login-btn" id="fatal-retry-btn">Обновить страницу</button>
    </div></div>`;
    const btn = gate.querySelector('#fatal-retry-btn');
    if (btn) btn.addEventListener('click', () => location.reload());
  }
}

// Инициализация: слушаем состояние входа, подтягиваем роль из users/{uid}
function initAuth() {
  console.log('[mm] initAuth: старт');
  const gate = document.getElementById('auth-gate');
  const appRoot = document.getElementById('app-root');

  // Если за 10 секунд auth вообще не ответил (нет ни user, ни null) — показываем ошибку,
  // а не бесконечно пустой экран.
  const authTimeout = setTimeout(() => {
    console.error('[mm] onAuthStateChanged не ответил за 10с');
    showFatalError(
      'Не удалось связаться с Firebase',
      'Проверьте интернет-соединение и что домен сайта добавлен в Firebase → Authentication → Settings → Authorized domains.'
    );
  }, 10000);

  auth.onAuthStateChanged(user => {
    clearTimeout(authTimeout);
    console.log('[mm] onAuthStateChanged:', user ? user.uid : 'нет пользователя');
    if (!user) {
      currentUser = null;
      if (appRoot) appRoot.style.display = 'none';
      if (gate) {
        gate.style.display = 'block';
        renderLoginScreen(gate);
      }
      authReadyCallbacks.forEach(cb => cb(null));
      return;
    }

    db.collection('users').doc(user.uid).get().then(doc => {
      console.log('[mm] users/{uid} получен, exists =', doc.exists);
      if (!doc.exists) {
        currentUser = null;
        if (gate) {
          gate.style.display = 'block';
          gate.innerHTML = `<div class="login-wrap"><div class="login-card glass">
            <div class="login-title">Аккаунт не настроен</div>
            <div class="login-sub">Обратитесь к администратору — профиль ещё не создан в базе.</div>
            <button class="login-btn" id="relogin-btn">Выйти</button>
          </div></div>`;
          gate.querySelector('#relogin-btn').addEventListener('click', logout);
        }
        return;
      }
      const data = doc.data();
      currentUser = {
        uid: user.uid,
        login: data.login,
        displayName: data.displayName,
        role: data.role,
        participantId: data.participantId || null,
      };
      if (gate) gate.style.display = 'none';
      if (appRoot) appRoot.style.display = '';
      renderNav();
      authReadyCallbacks.forEach(cb => cb(currentUser));
    }).catch(err => {
      console.error('[mm] Не удалось получить профиль пользователя:', err);
      showFatalError('Не удалось загрузить профиль', `${err.code || ''} ${err.message || err}`);
    });
  }, err => {
    clearTimeout(authTimeout);
    console.error('[mm] onAuthStateChanged error:', err);
    showFatalError('Ошибка авторизации', `${err.code || ''} ${err.message || err}`);
  });
}

// ---------- общая навигация (шапка) для всех страниц ----------

function renderNav() {
  const nav = document.getElementById('top-nav-links');
  if (!nav || !currentUser) return;

  const links = [];
  // "Дашборд" не дублируем — на всех страницах, кроме index.html, эту роль
  // уже играет кнопка "← Дашборд" (.nav-back) слева.
  if (!document.querySelector('.nav-back')) {
    links.push(`<a href="index.html" class="nav-link">📊 Дашборд</a>`);
  }
  links.push(`<a href="charts.html" class="nav-link">📈 Графики</a>`);
  links.push(`<a href="points.html" class="nav-link">📜 Баллы</a>`);
  links.push(`<a href="badges.html" class="nav-link">🎖️ Награды</a>`);
  if (currentUser.role === 'admin') {
    links.push(`<a href="report.html" class="nav-link">📝 Отчёт дня</a>`);
    links.push(`<a href="journal.html" class="nav-link">📓 Журнал</a>`);
    links.push(`<a href="settings.html" class="nav-link">⚙️ Настройки</a>`);
  }
  links.push(`<a href="game.html" class="nav-link">🎮 Игра</a>`);
  links.push(`<button id="logout-btn" class="nav-link nav-link-btn">🚪 Выход (${currentUser.displayName})</button>`);
  nav.innerHTML = links.join('');
  const lb = document.getElementById('logout-btn');
  if (lb) lb.addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', initAuth);
