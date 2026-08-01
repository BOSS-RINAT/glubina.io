// ============================================================
//  ИНИЦИАЛИЗАЦИЯ FIREBASE (один раз, для всех страниц)
// ============================================================

const FIREBASE_ENABLED =
  typeof firebaseConfig !== 'undefined' &&
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'YOUR_API_KEY';

let db = null;
let auth = null;

if (FIREBASE_ENABLED) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
  // LOCAL persistence — сессия сохраняется на устройстве (важно для
  // телефонов: не нужно вводить пароль заново при каждом визите).
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
    console.error('Не удалось установить persistence:', err);
  });
} else {
  console.error('Firebase не настроен (проверьте js/firebase-config.js)');
}

function loginIdToEmail(login) {
  return `${login}@mastermind.local`;
}
