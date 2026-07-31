// ============================================================
//  ДАННЫЕ УЧАСТНИКОВ МАСТЕРМАЙНДА
//  Год для дедлайнов без явного года — 2026.
//  qty  — сколько единиц нужно выполнить (1 = обычная задача)
//  deadline — 'YYYY-MM-DD' или null (без срока)
//  note — доп. пояснение к задаче (необязательно)
// ============================================================

const YEAR = 2026;

// Минимальная планка по вовлечённым людям для каждого участника.
// За каждое выполненное вовлечение начисляется 3 балла, максимума нет —
// планка это лишь минимум, который нужно выполнить.

const PARTICIPANTS = [
  {
    id: 'irina',
    name: 'Ирина',
    fullName: 'Власенко Ирина',
    color: '#FF6B6B',
    engagementMin: 1,
    tasks: [
      { id: 'i1', text: 'Финансовая модель по своему и крымскому отелю', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'i2', text: 'Финансовая модель, где Ирина зарабатывает от 1 млн руб./мес', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'i3', text: 'Корректировка динамического ценообразования', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'i4', text: 'Книга «От самооценки к самоценности»', qty: 1, deadline: `${YEAR}-08-05` },
      { id: 'i5', text: '5 экскурсий в отели / апарт-отели', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'i6', text: '5 собеседований на позицию управляющего', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'i7', text: 'Критерии и репрезентативные показатели рынка', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'i8', text: '2 узла', qty: 2, deadline: `${YEAR}-09-01` },
      { id: 'i9', text: 'Продать 2 консультации', qty: 2, deadline: `${YEAR}-09-01` },
      { id: 'i10', text: '10 писем в стол', qty: 10, deadline: `${YEAR}-09-10` },
      { id: 'i11', text: '3 сеанса с психологом', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'i12', text: 'Ежедневно: «Где я выбрала не себя?»', qty: 1, deadline: null },
      { id: 'i13', text: '4 звонка папе', qty: 4, deadline: `${YEAR}-07-20` },
    ]
  },
  {
    id: 'evgeniy',
    name: 'Евгений',
    fullName: 'Талдыкин Евгений',
    color: '#4D96FF',
    engagementMin: 5,
    tasks: [
      { id: 'e1', text: 'Сделать 1 продажу на 700 тыс.', qty: 1, deadline: `${YEAR}-09-03` },
      { id: 'e2', text: 'Провести 3 онлайн-сессии', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'e3', text: 'Оцифровать кейсы и сформировать УТП', qty: 1, deadline: `${YEAR}-08-04` },
      { id: 'e4', text: 'Сделать продажу с премией', qty: 1, deadline: `${YEAR}-08-31` },
      { id: 'e5', text: 'Скорректировать видение жизни 1-3-10', qty: 1, deadline: `${YEAR}-07-27` },
      { id: 'e6', text: 'Список хотелок, реализовать 20', qty: 20, deadline: `${YEAR}-09-01`, note: 'Список составить до 01.08' },
      { id: 'e7', text: 'Книга «От самооценки к самоценности»', qty: 1, deadline: `${YEAR}-08-20` },
      { id: 'e8', text: 'Психолог: 4 терапии', qty: 4, deadline: `${YEAR}-09-10` },
      { id: 'e9', text: 'Аскеза на мастурбацию', qty: 1, deadline: null },
      { id: 'e10', text: '10 свиданий', qty: 10, deadline: null, note: 'Из них: 4 повторных, 2 с финалом' },
      { id: 'e11', text: 'Секс раз в неделю', qty: 1, deadline: null },
      { id: 'e12', text: 'Заработать 1 млн руб.', qty: 1, deadline: `${YEAR}-09-10` },
    ]
  },
  {
    id: 'igor',
    name: 'Игорь',
    fullName: 'Помазкин Игорь',
    color: '#6BCB77',
    engagementMin: 1,
    tasks: [
      { id: 'g1', text: '10 свиданий', qty: 10, deadline: `${YEAR}-09-10`, note: 'Этапы: 05.08, 10.08, 15.08, 20.08' },
      { id: 'g2', text: '20 тренировок по боксу', qty: 20, deadline: `${YEAR}-09-10` },
      { id: 'g3', text: 'Личная стратегия на 10 лет', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g4', text: 'Тусоваться 1 раз в неделю', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'g5', text: '3 сессии с психологом', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'g6', text: 'Краш-комната', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'g7', text: 'Эндокринолог', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g8', text: 'Налоговый и финансовый аудит', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g9', text: 'Аудит товарных остатков', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g10', text: 'Матрица бизнес-процессов', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'g11', text: 'Стратегическая сессия', qty: 1, deadline: `${YEAR}-09-01` },
      { id: 'g12', text: '3 собеседования с операционными директорами', qty: 3, deadline: `${YEAR}-09-01` },
      { id: 'g13', text: '3 собеседования с РОПами', qty: 3, deadline: `${YEAR}-09-01` },
      { id: 'g14', text: '5 экскурсий к бизнесам', qty: 5, deadline: `${YEAR}-09-01` },
      { id: 'g15', text: '3 экскурсии к себе', qty: 3, deadline: `${YEAR}-09-01` },
      { id: 'g16', text: 'Партнерское соглашение', qty: 1, deadline: `${YEAR}-09-01` },
    ]
  },
  {
    id: 'victoria',
    name: 'Виктория',
    fullName: 'Чередниченко Виктория',
    color: '#C77DFF',
    engagementMin: 1,
    tasks: [
      { id: 'v1', text: 'Отправлять 100 ₽ за уклонение', qty: 1, deadline: null },
      { id: 'v2', text: 'Рефлексия', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'v3', text: '50 единиц контента', qty: 50, deadline: `${YEAR}-09-10` },
      { id: 'v4', text: 'Пересмотреть разбор 5 раз', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'v5', text: 'Нанять операционного управляющего', qty: 1, deadline: `${YEAR}-09-01` },
      { id: 'v6', text: 'Аудит всех направлений бизнеса', qty: 1, deadline: `${YEAR}-08-04` },
      { id: 'v7', text: '2 узла', qty: 2, deadline: `${YEAR}-09-10` },
      { id: 'v8', text: 'Анализ товарных остатков', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'v9', text: '7 встреч с папой', qty: 7, deadline: `${YEAR}-09-10`, note: '1 раз в неделю' },
      { id: 'v10', text: '3 сессии с психологом', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'v11', text: '10 экскурсий к WB', qty: 10, deadline: `${YEAR}-08-30` },
      { id: 'v12', text: '3 экскурсии к себе', qty: 3, deadline: `${YEAR}-09-10` },
      { id: 'v13', text: 'Уровень энергии 10/10', qty: 1, deadline: null },
      { id: 'v14', text: 'Книга «От самооценки к самоценности»', qty: 1, deadline: null },
    ]
  },
  {
    id: 'nursultan',
    name: 'Нурсултан',
    fullName: 'Мухаметов Нурсултан',
    color: '#FFB84D',
    engagementMin: 1,
    tasks: [
      { id: 'n1', text: 'План слива товара', qty: 1, deadline: `${YEAR}-07-25` },
      { id: 'n2', text: 'Финансовый учет', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'n3', text: 'Финансово-экономическая модель', qty: 1, deadline: `${YEAR}-08-01` },
      { id: 'n4', text: 'Карта запуска зимы', qty: 1, deadline: `${YEAR}-08-15` },
      { id: 'n5', text: 'Книги «Нескучные финансы» и «Самый богатый человек в Вавилоне»', qty: 2, deadline: `${YEAR}-08-05` },
      { id: 'n6', text: '5 экскурсий с людьми с долгами', qty: 5, deadline: `${YEAR}-08-15` },
      { id: 'n7', text: '2 узла', qty: 2, deadline: `${YEAR}-08-20` },
      { id: 'n8', text: '12 тренировок по боксу', qty: 12, deadline: `${YEAR}-09-10` },
      { id: 'n9', text: '5 экскурсий к WB', qty: 5, deadline: `${YEAR}-08-10` },
      { id: 'n10', text: 'Реестр из 10 цехов', qty: 10, deadline: `${YEAR}-09-01` },
      { id: 'n11', text: 'Продать M5 при условии', qty: 1, deadline: `${YEAR}-08-20` },
      { id: 'n12', text: 'Слить 60% остатков', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 'n13', text: 'Закрыть 10 млн долга', qty: 1, deadline: `${YEAR}-09-10` },
    ]
  },
  {
    id: 'tagir',
    name: 'Тагир',
    fullName: 'Рахмангулов Тагир',
    color: '#4ECDC4',
    engagementMin: 1,
    tasks: [
      { id: 't1', text: 'Книга «От самооценки к самоценности»', qty: 1, deadline: `${YEAR}-08-10` },
      { id: 't2', text: 'Консультация с Марией Шимшуриной', qty: 1, deadline: `${YEAR}-08-05` },
      { id: 't3', text: 'Ревизия активов', qty: 1, deadline: `${YEAR}-08-10` },
      { id: 't4', text: 'Передоговориться/уволить 4 человек', qty: 4, deadline: `${YEAR}-08-15` },
      { id: 't5', text: '5 экскурсий к WB-селлерам', qty: 5, deadline: `${YEAR}-08-15` },
      { id: 't6', text: 'Личная стратегия', qty: 1, deadline: `${YEAR}-08-20` },
      { id: 't7', text: 'Пассивный доход 360 000 ₽/мес', qty: 1, deadline: null },
      { id: 't8', text: '12 тренировок по боксу', qty: 12, deadline: `${YEAR}-09-10` },
      { id: 't9', text: 'Протокол «Романтика»', qty: 1, deadline: `${YEAR}-09-10` },
      { id: 't10', text: 'Развязать 2 узла', qty: 2, deadline: `${YEAR}-09-10` },
      { id: 't11', text: '6 тренировок по паделу', qty: 6, deadline: `${YEAR}-09-10` },
    ]
  },
];

// Начисление баллов
const POINTS_PER_TASK = 2;         // за каждую полностью выполненную задачу
const POINTS_PER_ENGAGEMENT = 3;   // за каждого вовлечённого человека
