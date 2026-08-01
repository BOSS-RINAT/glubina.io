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

// Инициализация: слушаем состояние входа, подтягиваем роль из users/{uid}
function initAuth() {
  const gate = document.getElementById('auth-gate');
  const appRoot = document.getElementById('app-root');

  auth.onAuthStateChanged(user => {
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
      console.error('Не удалось получить профиль пользователя:', err);
    });
  });
}

// ---------- общая навигация (шапка) для всех страниц ----------

function renderNav() {
  const nav = document.getElementById('top-nav-links');
  if (!nav || !currentUser) return;

  const links = [];
  links.push(`<a href="index.html" class="nav-link">Дашборд</a>`);
  if (currentUser.role === 'admin') {
    links.push(`<a href="report.html" class="nav-link">Отчёт дня</a>`);
    links.push(`<a href="settings.html" class="nav-link">Настройки</a>`);
  }
  links.push(`<button id="logout-btn" class="nav-link nav-link-btn">Выход (${currentUser.displayName})</button>`);
  nav.innerHTML = links.join('');
  const lb = document.getElementById('logout-btn');
  if (lb) lb.addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', initAuth);
