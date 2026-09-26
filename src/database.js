// ============================================
// База данных приложения (SQLite) + файлы теории
// ============================================

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// В продакшене (когда приложение упаковано в .exe) — данные в AppData\Lumen
// В разработке (npm start) — рядом с проектом
const isPackaged = __dirname.includes('app.asar');
const DATA_DIR = isPackaged
  ? path.join(process.env.APPDATA || process.env.HOME || '.', 'Lumen')
  : path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FILES_DIR = path.join(DATA_DIR, 'files');
if (!fs.existsSync(FILES_DIR)) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'app.db');

console.log('[DB] DATA_DIR =', DATA_DIR);
console.log('[DB] DB_PATH =', DB_PATH);
console.log('[DB] FILES_DIR =', FILES_DIR);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============================================
// СХЕМА
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    grade TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    favorite INTEGER DEFAULT 0,
    show_theory_to_students INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    text TEXT NOT NULL,
    mode TEXT DEFAULT 'buttons',
    timer INTEGER DEFAULT 0,
    keywords TEXT DEFAULT '',
    quiz_options TEXT DEFAULT '[]',
    quiz_correct INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS theory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,
    type TEXT NOT NULL,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    original_name TEXT DEFAULT '',
    size INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    grade TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    code TEXT,
    material_id INTEGER,
    class_id INTEGER,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    total_questions INTEGER DEFAULT 0,
    total_answers INTEGER DEFAULT 0,
    avg_green_pct REAL DEFAULT 0,
    FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL,
    question_text TEXT,
    student_name TEXT,
    anon_num INTEGER,
    color TEXT,
    text TEXT DEFAULT '',
    quiz_choice INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_questions_material ON questions(material_id);
  CREATE INDEX IF NOT EXISTS idx_theory_material ON theory_items(material_id);
  CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
  CREATE INDEX IF NOT EXISTS idx_answers_lesson ON answers(lesson_id);
  CREATE INDEX IF NOT EXISTS idx_lessons_started ON lessons(started_at DESC);
    CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER,
    student_name TEXT NOT NULL,
    activity INTEGER,
    test INTEGER,
    itog INTEGER,
    journal INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_grades_lesson ON grades(lesson_id);
`);

// ============================================
// МАТЕРИАЛЫ
// ============================================
function listMaterials() {
  return db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM questions q WHERE q.material_id = m.id) AS questions_count,
      (SELECT COUNT(*) FROM theory_items t WHERE t.material_id = m.id) AS theory_count
    FROM materials m
    ORDER BY m.favorite DESC, m.updated_at DESC
  `).all();
}

function getMaterial(id) {
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  if (!material) return null;
  const questions = db.prepare(
    'SELECT * FROM questions WHERE material_id = ? ORDER BY position, id'
  ).all(id);
  const theory = db.prepare(
    'SELECT * FROM theory_items WHERE material_id = ? ORDER BY position, id'
  ).all(id);
  return { ...material, questions, theory };
}

function createMaterial(data) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO materials (title, description, subject, grade, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title || 'Без названия',
    data.description || '',
    data.subject || '',
    data.grade || '',
    data.tags || '',
    now, now
  );
  return getMaterial(info.lastInsertRowid);
}

function updateMaterial(id, data) {
  const now = Date.now();
  const material = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  if (!material) return null;
  db.prepare(`
    UPDATE materials
    SET title=?, description=?, subject=?, grade=?, tags=?, favorite=?,
        show_theory_to_students=?, updated_at=?
    WHERE id=?
  `).run(
    data.title ?? material.title,
    data.description ?? material.description,
    data.subject ?? material.subject,
    data.grade ?? material.grade,
    data.tags ?? material.tags,
    data.favorite ?? material.favorite,
    data.show_theory_to_students !== undefined ? (data.show_theory_to_students ? 1 : 0) : material.show_theory_to_students,
    now, id
  );
  return getMaterial(id);
}

function deleteMaterial(id) {
  const items = db.prepare('SELECT * FROM theory_items WHERE material_id = ?').all(id);
  items.forEach(item => {
    if ((item.type === 'image' || item.type === 'file') && item.content) {
      const filePath = path.join(FILES_DIR, item.content);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
    }
  });
  db.prepare('DELETE FROM materials WHERE id = ?').run(id);
  return { ok: true };
}

function toggleFavorite(id) {
  const m = db.prepare('SELECT favorite FROM materials WHERE id = ?').get(id);
  if (!m) return null;
  const newVal = m.favorite ? 0 : 1;
  db.prepare('UPDATE materials SET favorite=?, updated_at=? WHERE id=?').run(newVal, Date.now(), id);
  return { ok: true, favorite: newVal };
}

// ============================================
// ВОПРОСЫ
// ============================================
function createQuestion(materialId, data) {
  const now = Date.now();
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS p FROM questions WHERE material_id = ?'
  ).get(materialId).p;
  const info = db.prepare(`
    INSERT INTO questions
      (material_id, position, text, mode, timer, keywords, quiz_options, quiz_correct, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    materialId,
    maxPos + 1,
    data.text || '',
    data.mode || 'buttons',
    data.timer || 0,
    typeof data.keywords === 'string' ? data.keywords : (Array.isArray(data.keywords) ? data.keywords.join(', ') : ''),
    JSON.stringify(data.quiz_options || []),
    data.quiz_correct ?? null,
    now
  );
  return db.prepare('SELECT * FROM questions WHERE id = ?').get(info.lastInsertRowid);
}

function updateQuestion(id, data) {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
  if (!q) return null;
  db.prepare(`
    UPDATE questions SET text=?, mode=?, timer=?, keywords=?, quiz_options=?, quiz_correct=? WHERE id=?
  `).run(
    data.text ?? q.text,
    data.mode ?? q.mode,
    data.timer ?? q.timer,
    data.keywords !== undefined
      ? (typeof data.keywords === 'string' ? data.keywords : (Array.isArray(data.keywords) ? data.keywords.join(', ') : q.keywords))
      : q.keywords,
    JSON.stringify(data.quiz_options ?? JSON.parse(q.quiz_options || '[]')),
    data.quiz_correct !== undefined ? data.quiz_correct : q.quiz_correct,
    id
  );
  return db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
}

function deleteQuestion(id) {
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  return { ok: true };
}

// ============================================
// ТЕОРИЯ
// ============================================
function listTheory(materialId) {
  return db.prepare(
    'SELECT * FROM theory_items WHERE material_id = ? ORDER BY position, id'
  ).all(materialId);
}

function createTheoryNote(materialId, data) {
  const now = Date.now();
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS p FROM theory_items WHERE material_id = ?'
  ).get(materialId).p;
  const info = db.prepare(`
    INSERT INTO theory_items (material_id, position, type, title, content, created_at)
    VALUES (?, ?, 'note', ?, ?, ?)
  `).run(materialId, maxPos + 1, data.title || 'Заметка', data.content || '', now);
  return db.prepare('SELECT * FROM theory_items WHERE id = ?').get(info.lastInsertRowid);
}

function createTheoryLink(materialId, data) {
  const now = Date.now();
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS p FROM theory_items WHERE material_id = ?'
  ).get(materialId).p;
  const info = db.prepare(`
    INSERT INTO theory_items (material_id, position, type, title, content, created_at)
    VALUES (?, ?, 'link', ?, ?, ?)
  `).run(materialId, maxPos + 1, data.title || 'Ссылка', data.content || '', now);
  return db.prepare('SELECT * FROM theory_items WHERE id = ?').get(info.lastInsertRowid);
}

function createTheoryFile(materialId, data) {
  const now = Date.now();
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS p FROM theory_items WHERE material_id = ?'
  ).get(materialId).p;

  const originalName = data.original_name || '';
  const ext = path.extname(originalName);
  const savedName = `mat${materialId}_${now}${ext}`;
  const destPath = path.join(FILES_DIR, savedName);

  try {
    if (data.fileBase64) {
      const base64Data = data.fileBase64.replace(/^data:[^;]+;base64,/, '');
      fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
    } else if (data.sourcePath) {
      fs.copyFileSync(data.sourcePath, destPath);
    } else {
      return { ok: false, msg: 'Нет данных файла' };
    }
  } catch (e) {
    return { ok: false, msg: 'Ошибка сохранения файла: ' + e.message };
  }

  const size = fs.statSync(destPath).size;

  const info = db.prepare(`
    INSERT INTO theory_items (material_id, position, type, title, content, original_name, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    materialId,
    maxPos + 1,
    data.type || 'file',
    data.title || originalName || 'Файл',
    savedName,
    originalName,
    size,
    now
  );

  return db.prepare('SELECT * FROM theory_items WHERE id = ?').get(info.lastInsertRowid);
}

function updateTheory(id, data) {
  const item = db.prepare('SELECT * FROM theory_items WHERE id = ?').get(id);
  if (!item) return null;
  db.prepare(`
    UPDATE theory_items SET title=?, content=? WHERE id=?
  `).run(
    data.title ?? item.title,
    data.content ?? item.content,
    id
  );
  return db.prepare('SELECT * FROM theory_items WHERE id = ?').get(id);
}

function deleteTheory(id) {
  const item = db.prepare('SELECT * FROM theory_items WHERE id = ?').get(id);
  if (!item) return { ok: false };
  if ((item.type === 'image' || item.type === 'file') && item.content) {
    const filePath = path.join(FILES_DIR, item.content);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
  db.prepare('DELETE FROM theory_items WHERE id = ?').run(id);
  return { ok: true };
}

function getTheoryFilePath(id) {
  const item = db.prepare('SELECT * FROM theory_items WHERE id = ?').get(id);
  if (!item || !item.content) return null;
  const filePath = path.join(FILES_DIR, item.content);
  if (!fs.existsSync(filePath)) return null;
  return { path: filePath, name: item.original_name || item.title };
}

// ============================================
// КЛАССЫ
// ============================================
function listClasses() {
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS students_count
    FROM classes c
    ORDER BY c.updated_at DESC
  `).all();
}

function getClass(id) {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
  if (!cls) return null;
  const students = db.prepare(
    'SELECT * FROM students WHERE class_id = ? ORDER BY position, id'
  ).all(id);
  return { ...cls, students };
}

function createClass(data) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO classes (title, grade, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.title || 'Новый класс', data.grade || '', data.description || '', now, now);
  return getClass(info.lastInsertRowid);
}

function updateClass(id, data) {
  const now = Date.now();
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(id);
  if (!cls) return null;
  db.prepare(`
    UPDATE classes SET title=?, grade=?, description=?, updated_at=? WHERE id=?
  `).run(
    data.title ?? cls.title,
    data.grade ?? cls.grade,
    data.description ?? cls.description,
    now, id
  );
  return getClass(id);
}

function deleteClass(id) {
  db.prepare('DELETE FROM classes WHERE id = ?').run(id);
  return { ok: true };
}

function addStudentToClass(classId, fullName) {
  const now = Date.now();
  const maxPos = db.prepare(
    'SELECT COALESCE(MAX(position), -1) AS p FROM students WHERE class_id = ?'
  ).get(classId).p;
  const info = db.prepare(`
    INSERT INTO students (class_id, full_name, position, created_at)
    VALUES (?, ?, ?, ?)
  `).run(classId, fullName.trim(), maxPos + 1, now);
  return db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid);
}

function addStudentsBulk(classId, namesText) {
  const lines = namesText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const inserted = [];
  const transaction = db.transaction(() => {
    for (const line of lines) {
      inserted.push(addStudentToClass(classId, line));
    }
  });
  transaction();
  return { ok: true, count: inserted.length };
}

function deleteStudent(id) {
  db.prepare('DELETE FROM students WHERE id = ?').run(id);
  return { ok: true };
}

function updateStudent(id, fullName) {
  db.prepare('UPDATE students SET full_name=? WHERE id=?').run(fullName.trim(), id);
  return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
}

// ============================================
// УРОКИ
// ============================================
function createLesson(data) {
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO lessons (title, code, material_id, class_id, started_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.title || 'Урок', data.code || '',
    data.material_id || null, data.class_id || null, now
  );
  return db.prepare('SELECT * FROM lessons WHERE id = ?').get(info.lastInsertRowid);
}

function finishLesson(id, stats) {
  db.prepare(`
    UPDATE lessons SET ended_at=?, total_questions=?, total_answers=?, avg_green_pct=? WHERE id=?
  `).run(
    Date.now(),
    stats.total_questions || 0,
    stats.total_answers || 0,
    stats.avg_green_pct || 0,
    id
  );
  return db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);
}

function listLessons(limit = 50) {
  return db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM answers a WHERE a.lesson_id = l.id) AS answers_count,
      m.title AS material_title,
      c.title AS class_title
    FROM lessons l
    LEFT JOIN materials m ON m.id = l.material_id
    LEFT JOIN classes c ON c.id = l.class_id
    ORDER BY l.started_at DESC
    LIMIT ?
  `).all(limit);
}

function getLesson(id) {
  const lesson = db.prepare(`
    SELECT l.*, m.title AS material_title, c.title AS class_title
    FROM lessons l
    LEFT JOIN materials m ON m.id = l.material_id
    LEFT JOIN classes c ON c.id = l.class_id
    WHERE l.id = ?
  `).get(id);
  if (!lesson) return null;
  const answers = db.prepare('SELECT * FROM answers WHERE lesson_id = ? ORDER BY id').all(id);
  return { ...lesson, answers };
}

function saveAnswer(data) {
  db.prepare(`
    INSERT INTO answers
      (lesson_id, question_text, student_name, anon_num, color, text, quiz_choice, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.lesson_id, data.question_text || '', data.student_name || '',
    data.anon_num || 0, data.color || null, data.text || '',
    data.quiz_choice ?? null, Date.now()
  );
  return { ok: true };
}

function deleteLesson(id) {
  db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
  return { ok: true };
}

// ============================================
// НАСТРОЙКИ
// ============================================
function getSetting(key, defaultValue = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
  return { ok: true };
}

function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}

// ============================================
// ЭКСПОРТ
// ============================================
// ============================================
// ОЦЕНКИ
// ============================================
function saveGrade(lessonId, studentName, grades) {
  // Удаляем старую запись для этого ученика и урока
  db.prepare('DELETE FROM grades WHERE lesson_id = ? AND student_name = ?')
    .run(lessonId, studentName);
  const info = db.prepare(`
    INSERT INTO grades (lesson_id, student_name, activity, test, itog, journal, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    lessonId,
    studentName,
    grades.activity ?? null,
    grades.test ?? null,
    grades.itog ?? null,
    grades.journal ?? null,
    Date.now()
  );
  return { ok: true, id: info.lastInsertRowid };
}

function saveGradesBulk(lessonId, gradesMap) {
  // gradesMap = { "иванов петр": { activity: 5, test: 4, itog: 5, journal: 5 }, ... }
  const transaction = db.transaction(() => {
    // Удаляем старые для этого урока
    db.prepare('DELETE FROM grades WHERE lesson_id = ?').run(lessonId);
    // Вставляем новые
    for (const [studentName, grades] of Object.entries(gradesMap)) {
      db.prepare(`
        INSERT INTO grades (lesson_id, student_name, activity, test, itog, journal, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        lessonId,
        studentName,
        grades.activity ?? null,
        grades.test ?? null,
        grades.itog ?? null,
        grades.journal ?? null,
        Date.now()
      );
    }
  });
  transaction();
  return { ok: true };
}

function getGradesForLesson(lessonId) {
  return db.prepare('SELECT * FROM grades WHERE lesson_id = ? ORDER BY student_name').all(lessonId);
}

function getGradesForStudent(studentName, limit = 20) {
  return db.prepare(`
    SELECT g.*, l.started_at, l.title AS lesson_title,
           m.title AS material_title, c.title AS class_title
    FROM grades g
    LEFT JOIN lessons l ON l.id = g.lesson_id
    LEFT JOIN materials m ON m.id = l.material_id
    LEFT JOIN classes c ON c.id = l.class_id
    WHERE LOWER(g.student_name) = LOWER(?)
    ORDER BY g.created_at DESC
    LIMIT ?
  `).all(studentName, limit);
}
module.exports = {
  listMaterials, getMaterial, createMaterial, updateMaterial, deleteMaterial, toggleFavorite,
  createQuestion, updateQuestion, deleteQuestion,
  listTheory, createTheoryNote, createTheoryLink, createTheoryFile, updateTheory, deleteTheory, getTheoryFilePath,
  listClasses, getClass, createClass, updateClass, deleteClass,
  addStudentToClass, addStudentsBulk, deleteStudent, updateStudent,
  createLesson, finishLesson, listLessons, getLesson, saveAnswer, deleteLesson,
  getSetting, setSetting, getAllSettings, saveGrade, saveGradesBulk, getGradesForLesson, getGradesForStudent,
  db, DB_PATH, FILES_DIR
};