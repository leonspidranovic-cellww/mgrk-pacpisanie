/* ============================================================
   server.js — Сервер расписания МГРК
   Локальный запуск: npm install && npm start
   Деплой: RelaxDev / любой хостинг Node.js
============================================================ */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

/* ============================================================
   НАСТРОЙКИ — МЕНЯЙ ЗДЕСЬ ИЛИ ЧЕРЕЗ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ
============================================================ */
const PORT = process.env.PORT || 3000;

// Секрет для подписи JWT. Обязательно поменяй в проде!
const JWT_SECRET = process.env.JWT_SECRET || 'mgrk-secret-2025-change-me-in-prod';

// Пароль администратора
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'qiwurouqwgrbs-2123';

// Путь к базе данных (можно вынести на постоянный диск, если хостинг поддерживает)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'mgrk.db');

/* ============================================================
   БАЗА ДАННЫХ
============================================================ */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  fio TEXT NOT NULL,
  group_name TEXT,
  claimed_group TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  role TEXT NOT NULL DEFAULT 'student',
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS groups_list (name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, dept TEXT, subjects TEXT
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL, day TEXT NOT NULL,
  pair_num INTEGER NOT NULL, subject TEXT NOT NULL,
  teacher TEXT, room TEXT
);
CREATE INDEX IF NOT EXISTS idx_sched ON schedules(group_name, day);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
`);

/* ============================================================
   СТАРТОВЫЕ ДАННЫЕ (SEED)
   Если база уже есть — этот блок не выполняется.
   Чтобы применить изменения — удали файл mgrk.db и перезапусти сервер.
============================================================ */
function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM groups_list').get().c > 0) return;

  /* ---------- ГРУППЫ ---------- */
  const groups = [
    'ИС-1-1','ИС-1-2','ИС-2-1','ИС-2-2','ИС-3-1','ИС-4-1',
    'ГС-1-1','ГС-2-1','ГС-3-1',
    'ГГ-1-1','ГГ-2-1','ГГ-3-1','ГГ-4-1',
    'ЗМ-1-1','ЗМ-2-1','ЗМ-3-1',
    'ГР-1-1','МЦ-1-1','МС-1-1',
    'ПР-1-1','ПР-2-1','ПР-3-1',
    'ПК-1-1','ПВ-1-1','СР-1-1',
    'СТ-1-1','ТР-1-1','УП-1-1',
  ];
  const insG = db.prepare('INSERT OR IGNORE INTO groups_list(name) VALUES(?)');
  db.transaction(() => groups.forEach(g => insG.run(g)))();

  /* ---------- ПРЕПОДАВАТЕЛИ ----------
     ⚠️ СПИСОК СОБРАН ИЗ ОТКРЫТЫХ ИСТОЧНИКОВ. ПРОВЕРЬ И ОТРЕДАКТИРУЙ!
     Формат: [id, ФИО, отделение/ПЦК, [предметы]]
  ------------------------------------- */
  const teachers = [
    // ===== Геологические дисциплины =====
    ['t1',  'Хвалько О.А.',         'ПЦК геологических дисциплин', ['Геология', 'Минералогия', 'Петрография']],
    ['t2',  'Егорова И.А.',         'ПЦК геологических дисциплин', ['Полезные ископаемые', 'Минералогия', 'Петрография']],
    ['t3',  'Матвеева Г.Р.',        'ПЦК геологических дисциплин', ['Гидрогеология', 'Инженерная геология']],
    ['t4',  'Тютева В.М.',          'ПЦК геологических дисциплин', ['Геологическая съёмка', 'Поиски и разведка МПИ']],
    ['t5',  'Рогова О.Ю.',          'ПЦК геологических дисциплин', ['Геология', 'Поиски и разведка МПИ']],
    ['t6',  'Ермолаева В.В.',       'ПЦК геологических дисциплин', ['Гидрогеология', 'Полевые исследования']],
    ['t7',  'Стахеева Т.Н.',        'ПЦК геологических дисциплин', ['Химия', 'Аналитическая химия']],

    // ===== Информационные технологии =====
    ['t8',  'Халезина М.Б.',        'ПЦК информационных технологий', ['Информатика и ИКТ', 'Информационные технологии']],
    ['t9',  'Первухина Е.А.',       'ПЦК информационных технологий', ['Информатика']],
    ['t10', 'Родикова С.Л.',        'ПЦК информационных технологий', ['Информатика', 'СПД']],
    ['t11', 'Горожанина С.С.',      'ПЦК информационных технологий', ['Математика', 'Информатика']],
    ['t12', 'Медвецкий И.Е.',       'ПЦК информационных технологий', ['Специальные дисциплины', 'Русский язык']],
    ['t13', 'Щепеткина Г.В.',       'ПЦК информационных технологий', ['Специальные дисциплины']],
    ['t14', 'Крапивко Л.П.',        'ПЦК информационных технологий', ['Математика', 'Программирование']],
    ['t15', 'Фролов В.С.',          'ПЦК информационных технологий', ['Информатика', 'ИКТ']],
    ['t16', 'Сысолятин С.Ю.',       'ПЦК информационных технологий', ['Программирование', 'Web-разработка']],
    ['t17', 'Дударев В.П.',         'ПЦК информационных технологий', ['Программирование']],
    ['t18', 'Макарова Н.И.',        'ПЦК информационных технологий', ['Основы философии', 'Информационные системы']],
    ['t19', 'Павлова В.В.',         'ПЦК информационных технологий', ['Специальные дисциплины', 'Информационные системы']],
    ['t20', 'Александрова Н.В.',    'ПЦК информационных технологий', ['Информатика', 'Программирование']],

    // ===== Математика =====
    ['t21', 'Айбатова А.Н.',        'ПЦК математических дисциплин', ['Математика']],
    ['t22', 'Гусельникова С.А.',    'ПЦК математических дисциплин', ['Математика', 'ИКТ']],
    ['t23', 'Бондаренко Л.П.',      'ПЦК математических дисциплин', ['Математика']],
    ['t24', 'Шишкина В.В.',         'ПЦК математических дисциплин', ['Математика']],

    // ===== Естественные науки =====
    ['t25', 'Лосенкова И.Г.',       'ПЦК естественнонаучных дисциплин', ['Химия']],
    ['t26', 'Михайлова Е.А.',       'ПЦК естественнонаучных дисциплин', ['Химия']],
    ['t27', 'Грин А.О.',            'ПЦК естественнонаучных дисциплин', ['Физика']],

    // ===== Гуманитарные дисциплины =====
    ['t28', 'Святкин И.В.',         'ПЦК социально-экономических дисциплин', ['История', 'Обществознание']],
    ['t29', 'Елина А.А.',           'ПЦК гуманитарных дисциплин', ['Русский язык', 'Литература']],
    ['t30', 'Патюкова Т.Е.',        'ПЦК гуманитарных дисциплин', ['Русский язык', 'Литература']],
    ['t31', 'Мокрышева И.В.',       'ПЦК гуманитарных дисциплин', ['Русский язык', 'Литература']],
    ['t32', 'Галиахметова С.А.',    'ПЦК гуманитарных дисциплин', ['Русский язык']],

    // ===== Иностранные языки =====
    ['t33', 'Богатырёва Н.А.',      'ПЦК иностранных языков', ['Иностранный язык']],
    ['t34', 'Яковлева Е.С.',        'ПЦК иностранных языков', ['Иностранный язык']],
    ['t35', 'Чикова Д.А.',          'ПЦК иностранных языков', ['Иностранный язык']],

    // ===== Физическая культура и ОБЖ =====
    ['t36', 'Орлов В.С.',           'ПЦК физической культуры', ['Физическая культура']],
    ['t37', 'Быстров И.Г.',         'ПЦК физической культуры', ['ОБЖ', 'БЖД', 'Физическая культура']],
    ['t38', 'Кидрасов Д.Р.',        'ПЦК общеобразовательных дисциплин', ['ОБЖ', 'БЖД']],
    ['t39', 'Хисаметдинова М.С.',   'ПЦК общеобразовательных дисциплин', ['ОБЖ', 'БЖД']],
    ['t40', 'Латыпов Р.Ш.',         'ПЦК общеобразовательных дисциплин', ['ОБЖ', 'БЖД']],

    // ===== Землеустройство =====
    ['t41', 'Давыдова Т.Ф.',        'ПЦК землеустройства', ['Землеустройство']],
    ['t42', 'Боронина Т.К.',        'ПЦК землеустройства', ['Геодезия', 'Землеустройство']],
    ['t43', 'Галиева Г.Ж.',         'ПЦК землеустройства', ['Землеустройство']],

    // ===== Экономика и управление =====
    ['t44', 'Маханек Г.Ю.',         'ПЦК экономических дисциплин', ['Управление персоналом', 'Экономика']],
    ['t45', 'Валеева Н.Н.',         'ПЦК экономических дисциплин', ['Экономика организации', 'Технология розничной торговли']],
    ['t46', 'Патракова Т.И.',       'ПЦК экономических дисциплин', ['Специальные дисциплины', 'Строительство']],
    ['t47', 'Морозова Н.И.',        'ПЦК экономических дисциплин', ['Экономика организации']],

    // ===== Строительство и мастер производственного обучения =====
    ['t48', 'Путрина Т.Ю.',         'ПЦК строительных дисциплин', ['Строительство зданий']],
    ['t49', 'Зимницкая Н.В.',       'Мастер производственного обучения', ['Поварское дело', 'Кондитерское дело']],
    ['t50', 'Степичева С.Н.',       'Мастер производственного обучения', ['Отделочные работы']],
    ['t51', 'Богданова Л.П.',       'Мастер производственного обучения', ['Профориентация']],
    ['t52', 'Суханова Р.В.',        'Мастер производственного обучения', ['Поварское дело']],

    // ===== Прочие =====
    ['t53', 'Романова Л.С.',        'Советник директора по воспитанию', ['Разговоры о важном', 'Воспитательная работа']],
    ['t54', 'Шиклеина Е.В.',        'ПЦК правовых дисциплин', ['Право', 'Основы исследовательской деятельности']],
    ['t55', 'Сундеева Г.В.',        'ПЦК общеобразовательных дисциплин', ['Литература']],
    ['t56', 'Сердитых Н.А.',        'ПЦК общеобразовательных дисциплин', ['Основы безопасности жизнедеятельности']],
  ];

  const insT = db.prepare('INSERT OR IGNORE INTO teachers VALUES(?,?,?,?)');
  db.transaction(() => {
    teachers.forEach(t => insT.run(t[0], t[1], t[2], JSON.stringify(t[3])));
  })();

  /* ---------- РАСПИСАНИЕ (пример для ИС-2-1) ---------- */
  const sched = [
    ['ИС-2-1','ПН',1,'Информатика',      'Халезина М.Б.', '36'],
    ['ИС-2-1','ПН',2,'Математика',       'Айбатова А.Н.', '42'],
    ['ИС-2-1','ПН',3,'Русский язык',     'Елина А.А.',    '21'],
    ['ИС-2-1','ПН',4,'История',          'Святкин И.В.',  '18'],
    ['ИС-2-1','ВТ',1,'Физика',           'Грин А.О.',     '15'],
    ['ИС-2-1','ВТ',2,'Базы данных',      'Медвецкий И.Е.','40'],
    ['ИС-2-1','ВТ',3,'Английский язык',  'Богатырёва Н.А.','28'],
    ['ИС-2-1','СР',1,'Программирование', 'Сысолятин С.Ю.','40'],
    ['ИС-2-1','СР',2,'Математика',       'Айбатова А.Н.', '42'],
    ['ИС-2-1','ЧТ',1,'Web-разработка',   'Сысолятин С.Ю.','40'],
    ['ИС-2-1','ЧТ',2,'Физкультура',      'Орлов В.С.',    'Спортзал'],
    ['ИС-2-1','ПТ',1,'Информатика',      'Халезина М.Б.', '36'],
    ['ИС-2-1','ПТ',2,'Базы данных',      'Медвецкий И.Е.','40'],
  ];
  const insS = db.prepare('INSERT INTO schedules(group_name,day,pair_num,subject,teacher,room) VALUES(?,?,?,?,?,?)');
  db.transaction(() => sched.forEach(s => insS.run(...s)))();

  /* ---------- КОНФИГ ---------- */
  db.prepare('INSERT OR IGNORE INTO config VALUES(?,?)').run('maintenance', 'false');
  db.prepare('INSERT OR IGNORE INTO config VALUES(?,?)').run('maintenanceBy', '');
  db.prepare('INSERT OR IGNORE INTO config VALUES(?,?)').run('maintenanceAt', '0');
}
seed();

/* ============================================================
   ХЕЛПЕРЫ
============================================================ */
const getCfg = (k, d = '') => {
  const r = db.prepare('SELECT value FROM config WHERE key=?').get(k);
  return r ? r.value : d;
};
const setCfg = (k, v) => db.prepare(
  'INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?'
).run(k, v, v);

function nextId() {
  const year = new Date().getFullYear();
  let n = db.prepare('SELECT COUNT(*) c FROM students').get().c + 1;
  let id = `MGRK-${year}-${String(n).padStart(4, '0')}`;
  while (db.prepare('SELECT 1 FROM students WHERE id=?').get(id)) {
    n++;
    id = `MGRK-${year}-${String(n).padStart(4, '0')}`;
  }
  return id;
}

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'Нет токена' });
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен' });
  }
}

function requireEditor(req, res, next) {
  if (!['editor', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Нет прав' });
  }
  next();
}

/* ============================================================
   ПРИЛОЖЕНИЕ
============================================================ */
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

/* ---------- ПУБЛИЧНЫЕ ---------- */
app.post('/api/register', (req, res) => {
  const { fio, group, password } = req.body || {};
  if (!fio || fio.split(' ').length < 2) {
    return res.status(400).json({ error: 'Введите ФИО полностью' });
  }
  if (!group) return res.status(400).json({ error: 'Выберите группу' });
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  }
  const id = nextId();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO students(id,fio,claimed_group,group_name,status,role,password_hash,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(id, fio.trim(), group, null, 'pending', 'student', hash, Date.now());
  const token = jwt.sign({ sub: id, role: 'student' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, id });
});

app.post('/api/login', (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ error: 'Введите ID и пароль' });
  const s = db.prepare('SELECT * FROM students WHERE UPPER(id)=UPPER(?)').get(id.trim());
  if (!s) return res.status(404).json({ error: 'ID не найден' });
  if (!bcrypt.compareSync(password, s.password_hash)) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const token = jwt.sign({ sub: s.id, role: s.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token });
});

app.post('/api/admin-login', (req, res) => {
  if ((req.body || {}).password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const token = jwt.sign({ sub: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

/* ---------- SYNC ---------- */
app.get('/api/sync', auth, (req, res) => {
  const students = db.prepare(
    'SELECT id,fio,group_name,claimed_group,status,role,created_at FROM students'
  ).all();

  const groups = db.prepare('SELECT name FROM groups_list ORDER BY name').all()
    .map(r => r.name);

  const teachers = db.prepare('SELECT * FROM teachers').all().map(t => ({
    id: t.id,
    name: t.name,
    dept: t.dept,
    subjects: JSON.parse(t.subjects || '[]'),
  }));

  const rows = db.prepare('SELECT * FROM schedules ORDER BY pair_num').all();
  const schedules = {};
  rows.forEach(r => {
    (schedules[r.group_name] ||= {});
    (schedules[r.group_name][r.day] ||= []).push({
      n: r.pair_num,
      subject: r.subject,
      teacher: r.teacher,
      room: r.room,
    });
  });

  let currentStudent = null;
  if (req.user.role !== 'admin') {
    currentStudent = students.find(s => s.id === req.user.sub) || null;
  }

  res.json({
    students,
    groups,
    teachers,
    schedules,
    currentStudent,
    role: req.user.role,
    maintenance: getCfg('maintenance') === 'true',
    maintenanceBy: getCfg('maintenanceBy'),
    maintenanceAt: parseInt(getCfg('maintenanceAt', '0')) || 0,
  });
});

/* ---------- СМЕНА СВОЕГО ПАРОЛЯ ---------- */
app.post('/api/change-password', auth, (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(400).json({ error: 'Для админа недоступно' });
  }
  const { oldPwd, newPwd } = req.body || {};
  if (!newPwd || newPwd.length < 4) {
    return res.status(400).json({ error: 'Минимум 4 символа' });
  }
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(req.user.sub);
  if (!bcrypt.compareSync(oldPwd, s.password_hash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }
  db.prepare('UPDATE students SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(newPwd, 10), s.id);
  res.json({ ok: true });
});

/* ---------- СТУДЕНТЫ (editor/admin) ---------- */
app.post('/api/students/:id/approve', auth, requireEditor, (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Не найден' });
  const group = (req.body || {}).group || s.group_name || s.claimed_group;
  db.prepare('UPDATE students SET status=?, group_name=? WHERE id=?')
    .run('approved', group, s.id);
  res.json({ ok: true });
});

app.post('/api/students/:id/reject', auth, requireEditor, (req, res) => {
  db.prepare('UPDATE students SET status=? WHERE id=?').run('rejected', req.params.id);
  res.json({ ok: true });
});

app.post('/api/students/:id/pending', auth, requireEditor, (req, res) => {
  db.prepare('UPDATE students SET status=? WHERE id=?').run('pending', req.params.id);
  res.json({ ok: true });
});

app.post('/api/students/:id/role', auth, requireEditor, (req, res) => {
  const role = (req.body || {}).role;
  if (!['student', 'editor'].includes(role)) {
    return res.status(400).json({ error: 'Неверная роль' });
  }
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Не найден' });
  if (role === 'editor') {
    db.prepare('UPDATE students SET role=?, status=?, group_name=COALESCE(group_name,claimed_group) WHERE id=?')
      .run('editor', 'approved', s.id);
  } else {
    db.prepare('UPDATE students SET role=? WHERE id=?').run('student', s.id);
  }
  res.json({ ok: true });
});

app.post('/api/students/:id/group', auth, requireEditor, (req, res) => {
  const group = (req.body || {}).group;
  if (!group) return res.status(400).json({ error: 'Нет группы' });
  db.prepare('UPDATE students SET group_name=?, claimed_group=?, status=? WHERE id=?')
    .run(group, group, 'approved', req.params.id);
  res.json({ ok: true });
});

app.put('/api/students/:id', auth, requireEditor, (req, res) => {
  const { fio, group, status, role } = req.body || {};
  if (!fio || fio.split(' ').length < 2) {
    return res.status(400).json({ error: 'ФИО' });
  }
  db.prepare('UPDATE students SET fio=?, group_name=?, claimed_group=?, status=?, role=? WHERE id=?')
    .run(fio, group, group, status, role, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/students/:id', auth, requireEditor, (req, res) => {
  db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/students/:id/reset-password', auth, requireEditor, (req, res) => {
  const p = (req.body || {}).password;
  if (!p || p.length < 4) return res.status(400).json({ error: 'Минимум 4 символа' });
  db.prepare('UPDATE students SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(p, 10), req.params.id);
  res.json({ ok: true });
});

/* ---------- ГРУППЫ ---------- */
app.post('/api/groups', auth, requireEditor, (req, res) => {
  const name = ((req.body || {}).name || '').trim().toUpperCase();
  if (!name) return res.status(400).json({ error: 'Название обязательно' });
  if (db.prepare('SELECT 1 FROM groups_list WHERE name=?').get(name)) {
    return res.status(409).json({ error: 'Такая группа уже есть' });
  }
  db.prepare('INSERT INTO groups_list(name) VALUES(?)').run(name);
  res.json({ ok: true });
});

app.put('/api/groups/:name', auth, requireEditor, (req, res) => {
  const oldName = req.params.name;
  const newName = ((req.body || {}).newName || '').trim().toUpperCase();
  if (!newName) return res.status(400).json({ error: 'Название обязательно' });
  if (newName !== oldName && db.prepare('SELECT 1 FROM groups_list WHERE name=?').get(newName)) {
    return res.status(409).json({ error: 'Уже существует' });
  }
  db.transaction(() => {
    db.prepare('UPDATE groups_list SET name=? WHERE name=?').run(newName, oldName);
    db.prepare('UPDATE schedules SET group_name=? WHERE group_name=?').run(newName, oldName);
    db.prepare('UPDATE students SET group_name=? WHERE group_name=?').run(newName, oldName);
    db.prepare('UPDATE students SET claimed_group=? WHERE claimed_group=?').run(newName, oldName);
  })();
  res.json({ ok: true });
});

app.delete('/api/groups/:name', auth, requireEditor, (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM groups_list WHERE name=?').run(req.params.name);
    db.prepare('DELETE FROM schedules WHERE group_name=?').run(req.params.name);
  })();
  res.json({ ok: true });
});

/* ---------- УЧИТЕЛЯ ---------- */
app.post('/api/teachers', auth, requireEditor, (req, res) => {
  const { name, dept, subjects } = req.body || {};
  if (!name) return res.status(400).json({ error: 'ФИО обязательно' });
  const id = 'id_' + Math.random().toString(36).slice(2, 10);
  db.prepare('INSERT INTO teachers(id,name,dept,subjects) VALUES(?,?,?,?)')
    .run(id, name, dept || '', JSON.stringify(subjects || []));
  res.json({ ok: true, id });
});

app.put('/api/teachers/:id', auth, requireEditor, (req, res) => {
  const { name, dept, subjects } = req.body || {};
  db.prepare('UPDATE teachers SET name=?, dept=?, subjects=? WHERE id=?')
    .run(name, dept || '', JSON.stringify(subjects || []), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/teachers/:id', auth, requireEditor, (req, res) => {
  db.prepare('DELETE FROM teachers WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- РАСПИСАНИЕ ---------- */
app.post('/api/schedule/:group/:day', auth, requireEditor, (req, res) => {
  const { n, subject, teacher, room } = req.body || {};
  if (!subject) return res.status(400).json({ error: 'Предмет обязателен' });
  db.prepare('INSERT INTO schedules(group_name,day,pair_num,subject,teacher,room) VALUES(?,?,?,?,?,?)')
    .run(req.params.group, req.params.day, n || 1, subject, teacher || '', room || '');
  res.json({ ok: true });
});

app.post('/api/schedule/:group/:day/clear', auth, requireEditor, (req, res) => {
  db.prepare('DELETE FROM schedules WHERE group_name=? AND day=?')
    .run(req.params.group, req.params.day);
  res.json({ ok: true });
});

app.put('/api/schedule/:group/:day/:idx', auth, requireEditor, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM schedules WHERE group_name=? AND day=? ORDER BY pair_num'
  ).all(req.params.group, req.params.day);
  const row = rows[parseInt(req.params.idx, 10)];
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  const { n, subject, teacher, room } = req.body || {};
  db.prepare('UPDATE schedules SET pair_num=?, subject=?, teacher=?, room=? WHERE id=?')
    .run(n || 1, subject, teacher || '', room || '', row.id);
  res.json({ ok: true });
});

app.delete('/api/schedule/:group/:day/:idx', auth, requireEditor, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM schedules WHERE group_name=? AND day=? ORDER BY pair_num'
  ).all(req.params.group, req.params.day);
  const row = rows[parseInt(req.params.idx, 10)];
  if (!row) return res.status(404).json({ error: 'Не найдено' });
  db.prepare('DELETE FROM schedules WHERE id=?').run(row.id);
  res.json({ ok: true });
});

/* ---------- РЕЖИМ РЕДАКТИРОВАНИЯ ---------- */
app.post('/api/maintenance', auth, requireEditor, (req, res) => {
  const on = !!(req.body || {}).on;
  setCfg('maintenance', on ? 'true' : 'false');
  setCfg('maintenanceBy', (req.body || {}).by || '');
  setCfg('maintenanceAt', String(Date.now()));
  res.json({ ok: true });
});

/* ---------- HEALTH ---------- */
app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ============================================================
   ЗАПУСК
   ВАЖНО: 0.0.0.0 нужен для хостинга (RelaxDev, Railway, и т.д.)
============================================================ */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Сервер: http://localhost:${PORT}`);
  console.log(`   Пароль админа: ${ADMIN_PASSWORD}`);
  console.log(`   База данных: ${DB_PATH}\n`);
});