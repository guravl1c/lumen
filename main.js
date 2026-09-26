const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const http = require('http');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const db = require('./src/database');

// ============================================
// ЛОГИРОВАНИЕ
// ============================================
log.transports.file.level = 'info';
log.transports.console.level = 'info';
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

log.info('=== Lumen запущен ===');
log.info('Версия:', app.getVersion());
log.info('Путь к логам:', log.transports.file.getFile().path);

// ============================================
// ПУТИ
// ============================================
const BIN_DIR = __dirname.includes('app.asar')
  ? path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin')
  : path.join(__dirname, 'bin');

const APP_EXE = path.join(BIN_DIR, 'app.exe');
const CLO_PATH = path.join(BIN_DIR, 'clo.exe');
const NGROK_PATH = path.join(BIN_DIR, 'ngrok.exe');

log.info('[Пути] BIN_DIR =', BIN_DIR);
log.info('[Пути] APP_EXE =', APP_EXE, fs.existsSync(APP_EXE) ? '✓' : '✗');
log.info('[Пути] CLO_PATH =', CLO_PATH, fs.existsSync(CLO_PATH) ? '✓' : '✗');
log.info('[Пути] NGROK_PATH =', NGROK_PATH, fs.existsSync(NGROK_PATH) ? '✓' : '✗');

// ============================================
// СОСТОЯНИЕ
// ============================================
let mainWindow = null;
let teacherWindow = null;
let flaskProcess = null;
let cloudpubProcess = null;
let ngrokProcess = null;

let currentLessonMaterial = null;
let currentLessonClass = null;
let currentCloudpubUrl = null;

// ============================================
// ОКНО
// ============================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 700,
    title: 'Lumen',
    backgroundColor: '#0f1220',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ============================================
// АВТООБНОВЛЕНИЯ
// ============================================
function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => log.info('[Update] Проверка...'));
  autoUpdater.on('update-available', (info) => log.info('[Update] Доступно:', info.version));
  autoUpdater.on('update-not-available', () => log.info('[Update] Нет обновлений'));
  autoUpdater.on('error', (err) => log.error('[Update] Ошибка:', err));
  autoUpdater.on('download-progress', (p) => {
    log.info(`[Update] Загрузка: ${Math.round(p.percent)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Update] Скачано:', info.version, '. Установится при перезапуске.');
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('[Update] Ошибка проверки:', err.message);
    });
  }, 5000);

  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn('[Update] Ошибка проверки:', err.message);
    });
  }, 2 * 60 * 60 * 1000);
}

// ============================================
// FLASK — утилиты
// ============================================
function killProcessOnPort5000() {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync('netstat -ano | findstr :5000', { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    const pids = new Set();
    for (const line of lines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        log.info(`[Flask] Убил старый процесс на порту 5000: PID ${pid}`);
      } catch (e) {}
    }
  } catch (e) {}
}

function killFlaskTree() {
  if (!flaskProcess) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${flaskProcess.pid} /T /F`, { stdio: 'ignore' });
    } else {
      flaskProcess.kill();
    }
  } catch (e) {}
  flaskProcess = null;
}

// ============================================
// FLASK — запуск/остановка
// ============================================
function startFlask() {
  killProcessOnPort5000();
  if (flaskProcess) return { ok: false, msg: 'Flask уже запущен' };
  if (!fs.existsSync(APP_EXE)) {
    log.error('[Flask] app.exe не найден:', APP_EXE);
    return { ok: false, msg: 'app.exe не найден' };
  }
  try {
    flaskProcess = spawn(APP_EXE, [], {
      cwd: path.dirname(APP_EXE), windowsHide: true
    });
    flaskProcess.stdout.on('data', (d) => log.info('[Flask]', d.toString().trim()));
    flaskProcess.stderr.on('data', (d) => log.warn('[Flask err]', d.toString().trim()));
    flaskProcess.on('close', (code) => {
      log.info('[Flask] код', code);
      flaskProcess = null;
      if (mainWindow) mainWindow.webContents.send('flask-status', { running: false });
    });
    waitForServer(10000).then((ok) => {
      if (mainWindow) mainWindow.webContents.send('flask-status', { running: ok });
      if (ok) {
        setTimeout(async () => {
          if (currentLessonMaterial) await sendMaterialToFlask();
          if (currentLessonClass) await sendClassToFlask();
          if (currentCloudpubUrl) await postJSON('/api/set-cloudpub-url', { url: currentCloudpubUrl });
        }, 500);
      }
    });
    return { ok: true, msg: 'Flask запускается' };
  } catch (e) { return { ok: false, msg: e.message }; }
}

function stopFlask() {
  if (!flaskProcess) return { ok: false };
  killFlaskTree();
  return { ok: true };
}

function waitForServer(timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    function check() {
      if (Date.now() - start > timeoutMs) return resolve(false);
      const req = http.get('http://localhost:5000/', (res) => { res.resume(); resolve(true); });
      req.on('error', () => setTimeout(check, 500));
      req.setTimeout(500, () => { req.destroy(); });
    }
    check();
  });
}

function checkFlaskRunning() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:5000/', (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}

function postJSON(pathStr, data) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data || {});
    const req = http.request({
      hostname: 'localhost', port: 5000, path: pathStr,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', (chunk) => { d += chunk; });
      res.on('end', () => { resolve(true); });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function sendMaterialToFlask() {
  const materialToSend = currentLessonMaterial ? {
    id: currentLessonMaterial.material_id,
    title: currentLessonMaterial.title,
    subject: currentLessonMaterial.subject || '',
    grade: currentLessonMaterial.grade || '',
    questions: currentLessonMaterial.questions || [],
    theory: currentLessonMaterial.theory || [],
    show_theory_to_students: currentLessonMaterial.show_theory_to_students || false,
  } : null;
  return postJSON('/api/set-lesson-material', materialToSend);
}

async function sendClassToFlask() {
  const classToSend = currentLessonClass ? {
    id: currentLessonClass.class_id,
    title: currentLessonClass.title,
    students: currentLessonClass.students || []
  } : null;
  return postJSON('/api/set-lesson-class', classToSend);
}

// ============================================
// CLOUDPUB
// ============================================
function checkCloudpubAuth() {
  return new Promise((resolve) => {
    if (!fs.existsSync(CLO_PATH)) return resolve({ logged: false, error: 'clo.exe не найден' });
    const proc = spawn(CLO_PATH, ['ls'], { cwd: path.dirname(CLO_PATH), windowsHide: true });
    let output = '', errOutput = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { errOutput += d.toString(); });
    proc.on('close', (code) => {
      const combined = (output + errOutput).toLowerCase();
      if (combined.includes('not logged') || combined.includes('unauthorized') || combined.includes('login required')) {
        resolve({ logged: false });
      } else {
        resolve({ logged: code === 0 });
      }
    });
    proc.on('error', () => resolve({ logged: false }));
    setTimeout(() => { try { proc.kill(); } catch(e){} resolve({ logged: false }); }, 5000);
  });
}

function loginCloudpub(email, password) {
  return new Promise((resolve) => {
    if (!fs.existsSync(CLO_PATH)) return resolve({ ok: false, msg: 'clo.exe не найден' });
    if (!email || !password) return resolve({ ok: false, msg: 'Введите email и пароль' });
    log.info('[CloudPub] Логин для', email);
    const proc = spawn(CLO_PATH, ['login', email, password], { cwd: path.dirname(CLO_PATH), windowsHide: true });
    let output = '', errOutput = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { errOutput += d.toString(); });
    proc.on('close', (code) => {
      const combined = output + errOutput;
      log.info('[CloudPub] Ответ:', combined);
      const success = code === 0 && !combined.toLowerCase().includes('error') && !combined.toLowerCase().includes('invalid');
      if (success) resolve({ ok: true, msg: 'Успешный вход' });
      else {
        let reason = 'Не удалось войти';
        if (combined.toLowerCase().includes('invalid credentials') || combined.toLowerCase().includes('wrong password')) reason = 'Неверный email или пароль';
        else if (combined.toLowerCase().includes('email')) reason = 'Проверьте email';
        resolve({ ok: false, msg: reason + ': ' + combined.trim().slice(0, 200) });
      }
    });
    proc.on('error', (err) => resolve({ ok: false, msg: 'Ошибка запуска: ' + err.message }));
    setTimeout(() => { try { proc.kill(); } catch(e){} resolve({ ok: false, msg: 'Таймаут' }); }, 15000);
  });
}

function logoutCloudpub() {
  return new Promise((resolve) => {
    if (!fs.existsSync(CLO_PATH)) return resolve({ ok: false, msg: 'clo.exe не найден' });
    const proc = spawn(CLO_PATH, ['logout'], { cwd: path.dirname(CLO_PATH), windowsHide: true });
    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); });
    proc.on('close', () => {
      log.info('[CloudPub] Logout:', output);
      currentCloudpubUrl = null;
      resolve({ ok: true });
    });
    proc.on('error', () => resolve({ ok: false }));
    setTimeout(() => { try { proc.kill(); } catch(e){} resolve({ ok: true }); }, 5000);
  });
}

function startCloudpub() {
  if (cloudpubProcess) return { ok: false };
  if (!fs.existsSync(CLO_PATH)) {
    log.error('[CloudPub] clo.exe не найден:', CLO_PATH);
    return { ok: false, msg: 'clo.exe не найден' };
  }
  try {
    cloudpubProcess = spawn(CLO_PATH, ['publish', 'http', '5000'], { cwd: path.dirname(CLO_PATH), windowsHide: true });
    const handleOutput = (data) => {
      const text = data.toString();
      log.info('[CloudPub]', text.trim());
      const match = text.match(/https:\/\/[a-z0-9-]+\.cloudpub\.ru/i);
      if (match) {
        const cleanUrl = match[0].replace(/:\d+$/, '');
        if (cleanUrl !== currentCloudpubUrl) {
          currentCloudpubUrl = cleanUrl;
          log.info('[CloudPub] Найден URL:', currentCloudpubUrl);
          if (mainWindow) mainWindow.webContents.send('cloudpub-status', { running: true, url: currentCloudpubUrl });
          postJSON('/api/set-cloudpub-url', { url: currentCloudpubUrl });
        }
      }
    };
    cloudpubProcess.stdout.on('data', handleOutput);
    cloudpubProcess.stderr.on('data', handleOutput);
    cloudpubProcess.on('close', (code) => {
      log.info('[CloudPub] код', code);
      cloudpubProcess = null;
      currentCloudpubUrl = null;
      if (mainWindow) mainWindow.webContents.send('cloudpub-status', { running: false });
    });
    return { ok: true };
  } catch (e) { return { ok: false }; }
}

function stopCloudpub() {
  if (!cloudpubProcess) return { ok: false };
  try { cloudpubProcess.kill(); cloudpubProcess = null; currentCloudpubUrl = null; return { ok: true }; }
  catch (e) { return { ok: false }; }
}

// ============================================
// NGROK
// ============================================
function startNgrok() {
  if (ngrokProcess) return { ok: false };
  if (!fs.existsSync(NGROK_PATH)) return { ok: false };
  try {
    ngrokProcess = spawn(NGROK_PATH, ['http', '5000'], { windowsHide: true });
    ngrokProcess.stdout.on('data', (d) => log.info('[Ngrok]', d.toString().trim()));
    ngrokProcess.stderr.on('data', (d) => log.info('[Ngrok err]', d.toString().trim()));
    ngrokProcess.on('close', () => { ngrokProcess = null; });
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
function stopNgrok() {
  if (!ngrokProcess) return { ok: false };
  try { ngrokProcess.kill(); ngrokProcess = null; return { ok: true }; } catch (e) { return { ok: false }; }
}

// ============================================
// IPC — CLOUDPUB
// ============================================
ipcMain.handle('cloudpub:check', () => checkCloudpubAuth());
ipcMain.handle('cloudpub:login', (e, email, password) => loginCloudpub(email, password));
ipcMain.handle('cloudpub:logout', () => logoutCloudpub());

// ============================================
// IPC — ОСНОВНОЕ
// ============================================
ipcMain.handle('start-flask', () => startFlask());
ipcMain.handle('stop-flask', () => stopFlask());
ipcMain.handle('check-flask', async () => ({ running: await checkFlaskRunning() }));
ipcMain.handle('start-cloudpub', () => startCloudpub());
ipcMain.handle('stop-cloudpub', () => stopCloudpub());
ipcMain.handle('start-ngrok', () => startNgrok());
ipcMain.handle('stop-ngrok', () => stopNgrok());
ipcMain.handle('get-cloudpub-url', () => currentCloudpubUrl || '');
ipcMain.handle('open-external', (e, url) => shell.openExternal(url));

// ============================================
// IPC — ОБНОВЛЕНИЯ И ЛОГИ
// ============================================
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('open-logs-folder', () => {
  const logPath = path.dirname(log.transports.file.getFile().path);
  shell.openPath(logPath);
  return { ok: true, path: logPath };
});
ipcMain.handle('open-log-file', () => {
  const logFile = log.transports.file.getFile().path;
  shell.openPath(logFile);
  return { ok: true, path: logFile };
});

// ============================================
// IPC — МАТЕРИАЛ УРОКА
// ============================================
ipcMain.handle('set-lesson-material', async (e, materialId) => {
  if (materialId === null) {
    currentLessonMaterial = null;
    await sendMaterialToFlask();
    return { ok: true, material: null };
  }
  const material = db.getMaterial(materialId);
  if (!material) return { ok: false, msg: 'Материал не найден' };
  currentLessonMaterial = {
    material_id: material.id,
    title: material.title,
    subject: material.subject || '',
    grade: material.grade || '',
    questions: material.questions || [],
    theory: material.theory || [],
    show_theory_to_students: material.show_theory_to_students ? true : false,
  };
  const ok = await checkFlaskRunning();
  if (ok) await sendMaterialToFlask();
  return { ok: true, material: currentLessonMaterial };
});
ipcMain.handle('get-lesson-material', () => currentLessonMaterial);

// ============================================
// IPC — КЛАСС УРОКА
// ============================================
ipcMain.handle('set-lesson-class', async (e, classId) => {
  if (classId === null) {
    currentLessonClass = null;
    await sendClassToFlask();
    return { ok: true, class: null };
  }
  const cls = db.getClass(classId);
  if (!cls) return { ok: false, msg: 'Класс не найден' };
  currentLessonClass = {
    class_id: cls.id,
    title: cls.title,
    students: (cls.students || []).map(s => s.full_name)
  };
  const ok = await checkFlaskRunning();
  if (ok) await sendClassToFlask();
  return { ok: true, class: currentLessonClass };
});
ipcMain.handle('get-lesson-class', () => currentLessonClass);

// ============================================
// IPC — КЛАССЫ, УЧЕНИКИ
// ============================================
ipcMain.handle('classes:list', () => db.listClasses());
ipcMain.handle('classes:get', (e, id) => db.getClass(id));
ipcMain.handle('classes:create', (e, data) => db.createClass(data));
ipcMain.handle('classes:update', (e, id, data) => db.updateClass(id, data));
ipcMain.handle('classes:delete', (e, id) => db.deleteClass(id));
ipcMain.handle('students:add', (e, classId, fullName) => db.addStudentToClass(classId, fullName));
ipcMain.handle('students:addBulk', (e, classId, namesText) => db.addStudentsBulk(classId, namesText));
ipcMain.handle('students:delete', (e, id) => db.deleteStudent(id));
ipcMain.handle('students:update', (e, id, fullName) => db.updateStudent(id, fullName));

// ============================================
// IPC — МАТЕРИАЛЫ
// ============================================
ipcMain.handle('materials:list', () => db.listMaterials());
ipcMain.handle('materials:get', (e, id) => db.getMaterial(id));
ipcMain.handle('materials:create', (e, data) => db.createMaterial(data));
ipcMain.handle('materials:update', (e, id, data) => db.updateMaterial(id, data));
ipcMain.handle('materials:delete', (e, id) => db.deleteMaterial(id));
ipcMain.handle('materials:toggleFavorite', (e, id) => db.toggleFavorite(id));

// ============================================
// IPC — ВОПРОСЫ (с правильными полями)
// ============================================
ipcMain.handle('questions:create', (e, materialId, data) => {
  // Приводим данные к формату database.js
  const prepared = {
    text: data.text || '',
    mode: data.mode || 'buttons',
    timer: data.timer || 0,
    keywords: Array.isArray(data.keywords) ? data.keywords.join(', ') : (data.keywords || ''),
    quiz_options: data.quiz_options || [],
    quiz_correct: data.quiz_correct ?? null,
  };
  return db.createQuestion(materialId, prepared);
});
ipcMain.handle('questions:update', (e, id, data) => {
  const prepared = {
    text: data.text,
    mode: data.mode,
    timer: data.timer,
    keywords: Array.isArray(data.keywords) ? data.keywords.join(', ') : data.keywords,
    quiz_options: data.quiz_options,
    quiz_correct: data.quiz_correct,
  };
  return db.updateQuestion(id, prepared);
});
ipcMain.handle('questions:delete', (e, id) => db.deleteQuestion(id));

// ============================================
// IPC — ТЕОРИЯ (правильные поля для database.js)
// ============================================
ipcMain.handle('theory:list', (e, materialId) => db.listTheory(materialId));

ipcMain.handle('theory:createNote', (e, materialId, data) => {
  return db.createTheoryNote(materialId, {
    title: data.title || 'Заметка',
    content: data.content || '',
  });
});

ipcMain.handle('theory:createLink', (e, materialId, data) => {
  return db.createTheoryLink(materialId, {
    title: data.title || 'Ссылка',
    content: data.url || data.content || '',
  });
});

ipcMain.handle('theory:createFile', async (e, materialId, data) => {
  try {
    if (!data || !data.filePath) {
      return { ok: false, msg: 'Нет данных файла' };
    }
    if (!fs.existsSync(data.filePath)) {
      return { ok: false, msg: 'Файл не найден: ' + data.filePath };
    }

    // Передаём в database.js правильные поля:
    // sourcePath — путь к исходнику (он сам скопирует)
    // original_name — имя файла
    // type — 'image' или 'file'
    const result = db.createTheoryFile(materialId, {
      sourcePath: data.filePath,
      original_name: data.fileName || path.basename(data.filePath),
      title: data.title || data.fileName || path.basename(data.filePath),
      type: data.fileType || 'file',
    });

    log.info('[Theory] Сохранено:', JSON.stringify(result));
    return result || { ok: false, msg: 'Не удалось сохранить' };
  } catch (err) {
    log.error('[Theory] Ошибка:', err);
    return { ok: false, msg: err.message };
  }
});

ipcMain.handle('theory:update', (e, id, data) => db.updateTheory(id, data));
ipcMain.handle('theory:delete', (e, id) => db.deleteTheory(id));
ipcMain.handle('theory:openFile', (e, id) => {
  const info = db.getTheoryFilePath(id);
  if (!info) return { ok: false };
  shell.openPath(info.path);
  return { ok: true };
});
ipcMain.handle('theory:pickFile', async (e, fileType) => {
  const filters = fileType === 'image'
    ? [{ name: 'Картинки', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
    : [{ name: 'Документы', extensions: ['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'txt', 'zip'] }];
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);
  return { ok: true, filePath, fileName, size: stats.size };
});
ipcMain.handle('theory:readFileBase64', (e, id) => {
  const info = db.getTheoryFilePath(id);
  if (!info) return null;
  try {
    const data = fs.readFileSync(info.path);
    const ext = path.extname(info.path).toLowerCase().replace('.', '');
    const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf' };
    const mime = mimeTypes[ext] || 'application/octet-stream';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch (e) { return null; }
});

// ============================================
// IPC — УРОКИ, НАСТРОЙКИ
// ============================================
ipcMain.handle('lessons:list', (e, limit) => db.listLessons(limit || 50));
ipcMain.handle('lessons:get', (e, id) => db.getLesson(id));
ipcMain.handle('lessons:create', (e, data) => db.createLesson(data));
ipcMain.handle('lessons:finish', (e, id, stats) => db.finishLesson(id, stats));
ipcMain.handle('lessons:delete', (e, id) => db.deleteLesson(id));
ipcMain.handle('answers:save', (e, data) => db.saveAnswer(data));
ipcMain.handle('settings:get', (e, key, def) => db.getSetting(key, def));
ipcMain.handle('settings:set', (e, key, value) => db.setSetting(key, value));
ipcMain.handle('settings:all', () => db.getAllSettings());

// ============================================
// IPC — ПАНЕЛЬ УЧИТЕЛЯ
// ============================================
ipcMain.handle('open-teacher', () => {
  if (teacherWindow && !teacherWindow.isDestroyed()) {
    teacherWindow.focus();
    return { ok: true };
  }
  teacherWindow = new BrowserWindow({
    width: 1400, height: 900,
    title: 'Lumen — Панель учителя',
    backgroundColor: '#0f1220',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  teacherWindow.loadURL('http://localhost:5000/teacher');
  teacherWindow.on('closed', () => { teacherWindow = null; });
  return { ok: true };
});
ipcMain.handle('is-teacher-open', () => teacherWindow && !teacherWindow.isDestroyed());
ipcMain.handle('close-teacher', () => {
  if (teacherWindow && !teacherWindow.isDestroyed()) {
    teacherWindow.close();
    return { ok: true };
  }
  return { ok: false };
});

// ============================================
// APP
// ============================================
app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killFlaskTree();
  if (cloudpubProcess) { try { cloudpubProcess.kill(); } catch(e){} cloudpubProcess = null; }
  if (ngrokProcess) { try { ngrokProcess.kill(); } catch(e){} ngrokProcess = null; }
  killProcessOnPort5000();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killFlaskTree();
  if (cloudpubProcess) { try { cloudpubProcess.kill(); } catch(e){} }
  if (ngrokProcess) { try { ngrokProcess.kill(); } catch(e){} }
});