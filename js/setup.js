// ============================================================
//  ОДНОРАЗОВАЯ НАСТРОЙКА: создание аккаунтов + загрузка стартовых данных
//  Открывается один раз вручную (setup.html), после — можно не заходить.
// ============================================================

function log(msg) {
  const el = document.getElementById('setup-log');
  el.textContent += msg + '\n';
  el.scrollTop = el.scrollHeight;
}

async function runSetup() {
  const btn = document.getElementById('setup-btn');
  btn.disabled = true;
  document.getElementById('setup-log').textContent = '';

  const secondaryApp = firebase.apps.find(a => a.name === 'setup-secondary')
    || firebase.initializeApp(firebaseConfig, 'setup-secondary');
  const secAuth = secondaryApp.auth();
  const secDb = secondaryApp.firestore();

  try {
    // 1. Создаём всех админов первыми и сразу сеем данные под первым из них
    const admins = LOGIN_ACCOUNTS.filter(a => a.role === 'admin');
    let adminUid;
    for (const admin of admins) {
      log(`Создаю аккаунт: ${admin.login}…`);
      try {
        const cred = await secAuth.createUserWithEmailAndPassword(loginIdToEmail(admin.login), SETUP_PASSWORDS[admin.login]);
        adminUid = cred.user.uid;
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          log(`  уже существует, вхожу…`);
          const cred = await secAuth.signInWithEmailAndPassword(loginIdToEmail(admin.login), SETUP_PASSWORDS[admin.login]);
          adminUid = cred.user.uid;
        } else { log(`  ⚠ ошибка: ${e.message}`); continue; }
      }
      await secDb.collection('users').doc(adminUid).set({
        login: admin.login, displayName: admin.displayName, role: admin.role, participantId: admin.participantId,
      });
      try {
        await secDb.collection('publicLogins').doc(admin.login).set({ displayName: admin.displayName });
      } catch (e) { /* не критично — этот админ и так есть в LOGIN_ACCOUNTS для выпадающего списка */ }
      log(`  ✓ ${admin.displayName} готов`);
    }

    // 2. Сеем участников и настройки (сейчас мы авторизованы как админ)
    log('Загружаю список задач и настройки…');
    const settingsSnap = await secDb.collection('config').doc('settings').get();
    if (!settingsSnap.exists) {
      await secDb.collection('config').doc('settings').set(SEED_SETTINGS);
      log('  ✓ настройки созданы');
    } else {
      log('  настройки уже существуют — пропускаю');
    }
    const participantsSnap = await secDb.collection('participants').limit(1).get();
    if (participantsSnap.empty) {
      const batch = secDb.batch();
      SEED_PARTICIPANTS.forEach(p => batch.set(secDb.collection('participants').doc(p.id), p));
      SEED_PARTICIPANTS.forEach(p => batch.set(secDb.collection('progress').doc(p.id), { counts: {}, engagement: 0 }));
      await batch.commit();
      log('  ✓ задачи участников загружены');
    } else {
      log('  задачи уже загружены — пропускаю');
    }

    // 3. Создаём остальные аккаунты (участники + гость)
    await secAuth.signOut();
    const rest = LOGIN_ACCOUNTS.filter(a => a.role !== 'admin');
    for (const acc of rest) {
      log(`Создаю аккаунт: ${acc.login}…`);
      let uid;
      try {
        const cred = await secAuth.createUserWithEmailAndPassword(loginIdToEmail(acc.login), SETUP_PASSWORDS[acc.login]);
        uid = cred.user.uid;
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          log(`  уже существует, вхожу…`);
          const cred = await secAuth.signInWithEmailAndPassword(loginIdToEmail(acc.login), SETUP_PASSWORDS[acc.login]);
          uid = cred.user.uid;
        } else { log(`  ⚠ ошибка: ${e.message}`); continue; }
      }
      await secDb.collection('users').doc(uid).set({
        login: acc.login, displayName: acc.displayName, role: acc.role, participantId: acc.participantId,
      });
      await secAuth.signOut();
      log(`  ✓ ${acc.displayName} готов`);
    }

    log('\nГотово! Все аккаунты созданы, данные загружены.');
    log('Логины и пароли — см. таблицу выше на этой странице.');
  } catch (err) {
    console.error(err);
    log(`\n⚠ Ошибка: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

function renderCredentialsTable() {
  const el = document.getElementById('creds-table');
  const rows = LOGIN_ACCOUNTS.map(a => `
    <tr>
      <td>${a.displayName}</td>
      <td><code>${a.login}</code></td>
      <td><code>${SETUP_PASSWORDS[a.login]}</code></td>
    </tr>
  `).join('');
  el.innerHTML = `
    <table class="creds-table">
      <thead><tr><th>Кто</th><th>Логин (в выпадающем списке)</th><th>Пароль</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  renderCredentialsTable();
  document.getElementById('setup-btn').addEventListener('click', runSetup);
});
