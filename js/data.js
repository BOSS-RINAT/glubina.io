// ============================================================
//  СТАРТОВЫЕ (СЕМЯ) ДАННЫЕ
//  Используются только один раз — при первом запуске сайта они
//  копируются в Firestore. Дальше редактирование задач происходит
//  на самом сайте, и этот файл на работу сайта уже не влияет.
//  Год для дедлайнов без явного года — 2026.
// ============================================================

const YEAR = 2026;

const SEED_PARTICIPANTS = [
  {
    id: 'irina',
    name: 'Ирина',
    fullName: 'Власенко Ирина',
    color: '#FF6B6B',
    engagementMin: 1,
    order: 1,
    tasks: [
      { id: 'i1', text: 'Цель 1: Финансовая модель по своему и крымскому отелю', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'i2', text: 'Цель 2: Финансовая модель, где Ирина зарабатывает от 1 млн руб./мес', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'i3', text: 'Цель 3: Корректировка динамического ценообразования', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'i4', text: 'Цель 4: Книга «От самооценки к самоценности»', qty: 1, deadline: `${YEAR}-08-05` },
      { id: 'i5', text: 'Цель 5: 5 экскурсий в отели / апарт-отели', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'i6', text: 'Цель 6: 5 собеседований на позицию управляющего', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'i7', text: 'Цель 7: Критерии и репрезентативные показатели рынка', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'i8', text: 'Цель 8: 2 узла', qty: 2, deadline: `${YEAR}-09-01` },
      { id: 'i9', text: 'Цель 9: Продать 2 консультации', qty: 2, deadline: `${YEAR}-09-01` },
      { id: 'i10', text: 'Цель 10: 10 писем в стол', qty: 10, deadline: `${YEAR}-09-10` },
      { id: 'i11', text: 'Цель 11: 3 сеанса с психологом', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'i12', text: 'Цель 12: Ежедневно: где я выбрала не себя?', qty: 1, deadline: null },
      { id: 'i13', text: 'Цель 13: 4 звонка папе', qty: 4, deadline: `${YEAR}-07-20` },
    ]
  },
  {
    id: 'evgeniy',
    name: 'Евгений',
    fullName: 'Талдыкин Евгений',
    color: '#4D96FF',
    engagementMin: 5,
    order: 2,
    tasks: [
      { id: 'e1', text: 'Цель 1: Сделать 1 продажу на 700 тыс.', qty: 1, deadline: `${YEAR}-09-03` },
      { id: 'e2', text: 'Цель 2: Провести 3 онлайн-сессии', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'e3', text: 'Цель 3: Оцифровать кейсы и сформировать УТП', qty: 1, deadline: `${YEAR}-08-04` },
      { id: 'e4', text: 'Цель 4: Сделать продажу с премией', qty: 1, deadline: `${YEAR}-08-31` },
      { id: 'e5', text: 'Цель 5: Скорректировать видение жизни 1-3-10', qty: 1, deadline: `${YEAR}-07-27` },
      { id: 'e6', text: 'Цель 6: Список хотелок, реализовать 20', qty: 20, deadline: `${YEAR}-09-01`, note: 'Список составить до 01.08' },
      { id: 'e7', text: 'Цель 7: Книга «От самооценки к самоценности»', qty: 1, deadline: `${YEAR}-08-20` },
      { id: 'e8', text: 'Цель 8: Психолог и 4 терапии', qty: 4, deadline: `${YEAR}-09-10` },
      { id: 'e9', text: 'Цель 9: Аскеза на мастурбацию', qty: 1, deadline: null },
      { id: 'e10', text: 'Цель 10: 10 свиданий, 4 повторных, 2 с финалом', qty: 10, deadline: null },
      { id: 'e11', text: 'Цель 11: Секс раз в неделю', qty: 1, deadline: null },
      { id: 'e12', text: 'Цель 12: Заработать 1 млн руб.', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'e13', text: 'Цель 13: 2 вовлечения', qty: 2, deadline: `${YEAR}-09-10` },
    ]
  },
  {
    id: 'igor',
    name: 'Игорь',
    fullName: 'Помазкин Игорь',
    color: '#6BCB77',
    engagementMin: 1,
    order: 3,
    tasks: [
      { id: 'g1', text: 'Цель 1: 10 свиданий', qty: 10, deadline: `${YEAR}-09-10`, note: 'Этапы: 05.08, 10.08, 15.08, 20.08' },
      { id: 'g2', text: 'Цель 2: 20 тренировок по боксу', qty: 20, deadline: `${YEAR}-09-10` },
      { id: 'g3', text: 'Цель 3: Личная стратегия на 10 лет', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g4', text: 'Цель 4: Тусоваться 1 раз в неделю', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'g5', text: 'Цель 5: 3 сессии с психологом', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'g6', text: 'Цель 6: Краш-комната', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'g7', text: 'Цель 7: Эндокринолог', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g8', text: 'Цель 8: Налоговый и финансовый аудит', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g9', text: 'Цель 9: Аудит товарных остатков', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g10', text: 'Цель 10: Матрица бизнес-процессов', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g11', text: 'Цель 11: Стратегическая сессия', qty: 1, deadline: `${YEAR}-09-01` },
      { id: 'g12', text: 'Цель 12: 3 собеседования с операционными директорами', qty: 3, deadline: `${YEAR}-09-01` },
      { id: 'g13', text: 'Цель 13: 3 собеседования с РОПами', qty: 3, deadline: `${YEAR}-09-01` },
      { id: 'g14', text: 'Цель 14: 5 экскурсий к бизнесам', qty: 5, deadline: `${YEAR}-09-01` },
      { id: 'g15', text: 'Цель 15: 3 экскурсии к себе', qty: 3, deadline: `${YEAR}-09-01` },
      { id: 'g16', text: 'Цель 16: Партнерское соглашение', qty: 1, deadline: `${YEAR}-09-01` },
    ]
  },
  {
    id: 'victoria',
    name: 'Виктория',
    fullName: 'Чередниченко Виктория',
    color: '#C77DFF',
    engagementMin: 1,
    order: 4,
    tasks: [
      { id: 'v1', text: 'Цель 1: Отправлять 100 ₽ за уклонение', qty: 1, deadline: null },
      { id: 'v2', text: 'Цель 2: Рефлексия', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'v3', text: 'Цель 3: 50 единиц контента', qty: 50, deadline: `${YEAR}-09-10` },
      { id: 'v4', text: 'Цель 4: Пересмотреть разбор 5 раз', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'v5', text: 'Цель 5: Нанять операционного управляющего', qty: 1, deadline: `${YEAR}-09-01` },
      { id: 'v6', text: 'Цель 6: Аудит всех направлений бизнеса', qty: 1, deadline: `${YEAR}-08-04` },
      { id: 'v7', text: 'Цель 7: 2 узла', qty: 2, deadline: `${YEAR}-09-10` },
      { id: 'v8', text: 'Цель 8: Анализ товарных остатков', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'v9', text: 'Цель 9: 7 встреч с папой', qty: 7, deadline: `${YEAR}-09-10`, note: '1 раз в неделю' },
      { id: 'v10', text: 'Цель 10: 3 сессии с психологом', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'v11', text: 'Цель 11: 10 экскурсий к WB', qty: 10, deadline: `${YEAR}-08-30` },
      { id: 'v12', text: 'Цель 12: 3 экскурсии к себе', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'v13', text: 'Цель 13: Уровень энергии 10/10', qty: 1, deadline: null },
      { id: 'v14', text: 'Цель 14: Книга «От самооценки к самоценности»', qty: 1, deadline: null },
    ]
  },
  {
    id: 'nursultan',
    name: 'Нурсултан',
    fullName: 'Мухаметов Нурсултан',
    color: '#FFB84D',
    engagementMin: 1,
    order: 5,
    tasks: [
      { id: 'n1', text: 'Цель 1: План слива товара', qty: 1, deadline: `${YEAR}-07-25` },
      { id: 'n2', text: 'Цель 2: Финансовый учет', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'n3', text: 'Цель 3: Финансово-экономическая модель', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'n4', text: 'Цель 4: Карта запуска зимы', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'n5', text: 'Цель 5: Книги «Нескучные финансы» и «Самый богатый человек в Вавилоне»', qty: 2, deadline: `${YEAR}-08-05` },
      { id: 'n6', text: 'Цель 6: 5 экскурсий с людьми с долгами', qty: 5, deadline: `${YEAR}-08-15` },
      { id: 'n7', text: 'Цель 7: 2 узла', qty: 2, deadline: `${YEAR}-08-20` },
      { id: 'n8', text: 'Цель 8: 12 тренировок по боксу', qty: 12, deadline: `${YEAR}-09-10` },
      { id: 'n9', text: 'Цель 9: 5 экскурсий к WB', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'n10', text: 'Цель 10: Реестр из 10 цехов', qty: 10, deadline: `${YEAR}-09-01` },
      { id: 'n11', text: 'Цель 11: Продать M5 при условии', qty: 1, deadline: `${YEAR}-08-20` },
      { id: 'n12', text: 'Цель 12: Слить 60% остатков', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'n13', text: 'Цель 13: Закрыть 10 млн долга', qty: 1, deadline: `${YEAR}-09-10` },
    ]
  },
  {
    id: 'tagir',
    name: 'Тагир',
    fullName: 'Рахмангулов Тагир',
    color: '#4ECDC4',
    engagementMin: 1,
    order: 6,
    tasks: [
      { id: 't1', text: 'Цель 1: Книга «От самооценки к самоценности»', qty: 1, deadline: `${YEAR}-08-10` },
      { id: 't2', text: 'Цель 2: Консультация с Марией Шимшуриной', qty: 1, deadline: `${YEAR}-08-05` },
      { id: 't3', text: 'Цель 3: Ревизия активов', qty: 1, deadline: `${YEAR}-08-10` },
      { id: 't4', text: 'Цель 4: Передоговориться/уволить 4 человек', qty: 4, deadline: `${YEAR}-08-15` },
      { id: 't5', text: 'Цель 5: 5 экскурсий к WB-селлерам', qty: 5, deadline: `${YEAR}-08-15` },
      { id: 't6', text: 'Цель 6: Личная стратегия', qty: 1, deadline: `${YEAR}-08-20` },
      { id: 't7', text: 'Цель 7: Пассивный доход 360 000 ₽/мес', qty: 1, deadline: null },
      { id: 't8', text: 'Цель 8: 12 тренировок по боксу', qty: 12, deadline: `${YEAR}-09-10` },
      { id: 't9', text: 'Цель 9: Протокол «Романтика»', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 't10', text: 'Цель 10: Развязать 2 узла', qty: 2, deadline: `${YEAR}-09-10` },
      { id: 't11', text: 'Цель 11: 6 тренировок по паделу', qty: 6, deadline: `${YEAR}-09-10` },
    ]
  },
];

// Настройки по умолчанию (создаются один раз в Firestore config/settings,
// дальше редактируются админом на странице settings.html)
const SEED_SETTINGS = {
  tournamentName: 'Базовый лагерь',
  pointsPerTask: 2,
  pointsPerEngagement: 3,
  participantsCount: 6,
  editLocked: false,       // true = участники не могут редактировать свои задачи
  roleToday: '',           // "Роль на сегодня" в отчёте — редактируется на странице отчёта
  reportAuthorName: 'Ринат', // имя автора отчёта (строка "Ринат 01.08")
  reportTitleTemplate: 'Отчёт по турниру "{tournament}"',
};

// Логины для входа (используются только на странице setup.html для
// одноразового создания аккаунтов, и в auth.js для выпадающего списка).
// technical email = `${login}@mastermind.local`
const LOGIN_ACCOUNTS = [
  { login: 'admin', displayName: 'Админ (Ринат)', role: 'admin', participantId: null },
  { login: 'irina', displayName: 'Ирина', role: 'participant', participantId: 'irina' },
  { login: 'evgeniy', displayName: 'Евгений', role: 'participant', participantId: 'evgeniy' },
  { login: 'igor', displayName: 'Игорь', role: 'participant', participantId: 'igor' },
  { login: 'victoria', displayName: 'Виктория', role: 'participant', participantId: 'victoria' },
  { login: 'nursultan', displayName: 'Нурсултан', role: 'participant', participantId: 'nursultan' },
  { login: 'tagir', displayName: 'Тагир', role: 'participant', participantId: 'tagir' },
  { login: 'guest', displayName: 'Гость (только просмотр)', role: 'guest', participantId: null },
];
