// ============================================
// LUMEN — Electron Renderer
// ============================================

// ============================================
// СОСТОЯНИЕ
// ============================================
let currentLessonClass = null;
let currentLessonMaterial = null;
let flaskRunning = false;
let cloudpubRunning = false;
let cloudpubUrl = '';
let currentView = 'lesson';
let currentMaterialTab = 'theory';
let currentMaterialForEdit = null;
let currentQuestions = [];
let editingQuestionId = null;
let editingQMode = 'buttons';
let currentClassForEdit = null;
let currentStudents = [];

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Lumen] renderer loaded');

  // Версия в бейдже и в About
  await updateAppVersion();

  // Проверить статус Flask
  const flask = await window.api.checkFlask();
  setFlaskStatus(flask.running);

  // Проверить CloudPub
  const cp = await window.api.checkCloudpubAuth();
  if (!cp.logged) {
    setTimeout(() => openCloudpubModal(), 1000);
  }

  // Загрузить материалы и классы
  await refreshMaterials();
  await refreshClasses();

  // Слушатели событий
  window.api.onFlaskStatus((data) => {
    setFlaskStatus(data.running);
  });
  window.api.onCloudpubStatus((data) => {
    cloudpubRunning = data.running;
    if (data.url) {
      cloudpubUrl = data.url;
      updateLinkBox();
    }
  });
});

// ============================================
// ВЕРСИЯ ПРИЛОЖЕНИЯ
// ============================================
async function updateAppVersion() {
  try {
    const version = await window.api.getAppVersion();
    const badge = document.getElementById('app-version');
    const about = document.getElementById('about-version');
    const about2 = document.getElementById('about-version-2');
    if (badge) badge.textContent = `Lumen v${version}`;
    if (about) about.textContent = version;
    if (about2) about2.textContent = version;
  } catch (e) {
    console.error('Не удалось получить версию', e);
  }
}

// ============================================
// ОБНОВЛЕНИЯ
// ============================================
async function checkUpdatesManual() {
  try {
    const btn = event?.target;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Проверка…';
    }

    const result = await window.api.checkForUpdates();

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Проверить обновления';
    }

    if (result.ok) {
      const current = await window.api.getAppVersion();
      if (result.version && result.version !== current) {
        alert(`✅ Доступна новая версия: ${result.version}\n\nОна скачается в фоне и установится при следующем запуске.`);
      } else {
        alert(`✅ У вас последняя версия: ${current}`);
      }
    } else {
      alert('❌ Не удалось проверить обновления:\n' + (result.msg || 'неизвестная ошибка'));
    }
  } catch (e) {
    alert('❌ Ошибка: ' + e.message);
  }
}

// ============================================
// ЛОГИ
// ============================================
async function openLogsFolder() {
  try {
    const result = await window.api.openLogsFolder();
    if (!result.ok) {
      alert('Не удалось открыть папку логов');
    }
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

async function openLogFile() {
  try {
    const result = await window.api.openLogFile();
    if (!result.ok) {
      alert('Не удалось открыть файл лога');
    }
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

// ============================================
// НАВИГАЦИЯ
// ============================================
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === 'view-' + view);
  });

  if (view === 'materials') refreshMaterials();
  if (view === 'classes') refreshClasses();
  if (view === 'history') refreshHistory();
}

// ============================================
// СТАТУС FLASK
// ============================================
function setFlaskStatus(running) {
  flaskRunning = running;
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnTeacher = document.getElementById('btn-teacher');
  const statusIcon = document.querySelector('.status-icon');
  const statusTitle = document.getElementById('status-title');
  const statusSub = document.getElementById('status-sub');

  if (dot) dot.classList.toggle('running', running);
  if (text) text.textContent = running ? 'Запущено' : 'Остановлено';
  if (btnStart) btnStart.disabled = running;
  if (btnStop) btnStop.disabled = !running;
  if (btnTeacher) btnTeacher.disabled = !running;

  if (statusIcon) statusIcon.textContent = running ? '▶️' : '⏸️';
  if (statusTitle) statusTitle.textContent = running ? 'Приложение запущено' : 'Готово к запуску';
  if (statusSub) statusSub.textContent = running
    ? 'Откройте панель учителя или отправьте ссылку ученикам'
    : 'Нажмите «Запустить приложение»';

  if (running) {
    updateLinkBox();
  } else {
    const lb = document.getElementById('link-box');
    if (lb) lb.style.display = 'none';
  }
}

// ============================================
// ЗАПУСК / ОСТАНОВКА
// ============================================
async function startAll() {
  const btn = document.getElementById('btn-start');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Запускаю…';
  }

  try {
    const result = await window.api.startFlask();
    if (!result.ok) {
      alert('Ошибка запуска Flask: ' + result.msg);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '▶️ Запустить приложение';
      }
      return;
    }

    await new Promise(r => setTimeout(r, 2000));

    if (currentLessonMaterial) {
      await window.api.setLessonMaterial(currentLessonMaterial.material_id);
    }
    if (currentLessonClass) {
      await window.api.setLessonClass(currentLessonClass.class_id);
    }

    await new Promise(r => setTimeout(r, 1000));
    await window.api.startCloudpub();

    await new Promise(r => setTimeout(r, 3000));

    if (btn) btn.textContent = '▶️ Запустить приложение';
    setFlaskStatus(true);
    updateLinkBox();
  } catch (e) {
    alert('Ошибка: ' + e.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '▶️ Запустить приложение';
    }
  }
}

async function stopAll() {
  try {
    await window.api.stopCloudpub();
    await window.api.stopFlask();
    setFlaskStatus(false);
  } catch (e) {
    alert('Ошибка остановки: ' + e.message);
  }
}

// ============================================
// ССЫЛКА ДЛЯ УЧЕНИКОВ
// ============================================
function updateLinkBox() {
  const box = document.getElementById('link-box');
  const url = document.getElementById('link-url');
  if (!box || !url) return;

  if (cloudpubUrl) {
    url.textContent = cloudpubUrl + '/student';
    box.style.display = 'flex';
  } else if (flaskRunning) {
    url.textContent = 'http://localhost:5000/student';
    box.style.display = 'flex';
  } else {
    box.style.display = 'none';
  }
}

function copyLink() {
  const url = document.getElementById('link-url');
  if (!url) return;
  navigator.clipboard.writeText(url.textContent).then(() => {
    alert('Скопировано: ' + url.textContent);
  }).catch(() => {
    prompt('Скопируй вручную:', url.textContent);
  });
}

function openStudent() {
  const url = document.getElementById('link-url');
  if (url) window.api.openExternal(url.textContent);
}

function openTeacher() {
  window.api.openTeacher();
}

// ============================================
// ВЫБОР КЛАССА И МАТЕРИАЛА
// ============================================
async function openClassPicker() {
  const list = document.getElementById('pick-class-list');
  if (!list) return;
  const classes = await window.api.listClasses();

  if (!classes || classes.length === 0) {
    list.innerHTML = '<p class="sub" style="text-align:center; padding:20px;">Нет классов. Создайте в разделе «Классы».</p>';
  } else {
    list.innerHTML = classes.map(c => `
      <div class="pick-item" onclick="pickClass(${c.id})">
        <div class="pick-item-title">📚 ${escapeHtml(c.title)}</div>
        <div class="pick-item-sub">${c.students_count || 0} учеников</div>
      </div>
    `).join('');
  }

  document.getElementById('modal-pick-class').style.display = 'flex';
}

function closeClassPicker() {
  document.getElementById('modal-pick-class').style.display = 'none';
}

async function pickClass(id) {
  const result = await window.api.setLessonClass(id);
  if (result.ok) {
    currentLessonClass = result.class;
    updateLessonClassUI();
    closeClassPicker();
  } else {
    alert('Ошибка: ' + result.msg);
  }
}

function updateLessonClassUI() {
  const empty = document.getElementById('lesson-class-empty');
  const chosen = document.getElementById('lesson-class-chosen');
  if (!empty || !chosen) return;

  if (currentLessonClass) {
    empty.style.display = 'none';
    chosen.style.display = 'flex';
    document.getElementById('lesson-class-title').textContent = '📚 ' + currentLessonClass.title;
    document.getElementById('lesson-class-sub').textContent = currentLessonClass.students.length + ' учеников';
  } else {
    empty.style.display = 'flex';
    chosen.style.display = 'none';
  }
}

async function clearLessonClass() {
  await window.api.setLessonClass(null);
  currentLessonClass = null;
  updateLessonClassUI();
}

async function openMaterialPicker() {
  const list = document.getElementById('pick-list');
  if (!list) return;
  const materials = await window.api.listMaterials();

  if (!materials || materials.length === 0) {
    list.innerHTML = '<p class="sub" style="text-align:center; padding:20px;">Нет материалов. Создайте в разделе «Материалы».</p>';
  } else {
    list.innerHTML = materials.map(m => `
      <div class="pick-item" onclick="pickMaterial(${m.id})">
        <div class="pick-item-title">📁 ${escapeHtml(m.title)}</div>
        <div class="pick-item-sub">${m.questions_count || 0} вопросов</div>
      </div>
    `).join('');
  }

  document.getElementById('modal-pick-material').style.display = 'flex';
}

function closeMaterialPicker() {
  document.getElementById('modal-pick-material').style.display = 'none';
}

async function pickMaterial(id) {
  const result = await window.api.setLessonMaterial(id);
  if (result.ok) {
    currentLessonMaterial = result.material;
    updateLessonMaterialUI();
    closeMaterialPicker();
  } else {
    alert('Ошибка: ' + result.msg);
  }
}

function updateLessonMaterialUI() {
  const empty = document.getElementById('lesson-material-empty');
  const chosen = document.getElementById('lesson-material-chosen');
  if (!empty || !chosen) return;

  if (currentLessonMaterial) {
    empty.style.display = 'none';
    chosen.style.display = 'flex';
    document.getElementById('lesson-material-title').textContent = '📁 ' + currentLessonMaterial.title;
    document.getElementById('lesson-material-sub').textContent = (currentLessonMaterial.questions || []).length + ' вопросов';
  } else {
    empty.style.display = 'flex';
    chosen.style.display = 'none';
  }
}

async function clearLessonMaterial() {
  await window.api.setLessonMaterial(null);
  currentLessonMaterial = null;
  updateLessonMaterialUI();
}

// ============================================
// МАТЕРИАЛЫ
// ============================================
async function refreshMaterials() {
  const list = document.getElementById('materials-list');
  if (!list) return;
  const materials = await window.api.listMaterials();

  if (!materials || materials.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-title">Пока нет материалов</div>
        <div class="empty-sub">Создайте первый материал — набор вопросов для урока</div>
      </div>
    `;
  } else {
    list.innerHTML = materials.map(m => `
      <div class="material-card" onclick="openEditMaterial(${m.id})">
        <div class="material-icon">📁</div>
        <div class="material-content">
          <div class="material-title">${escapeHtml(m.title)}</div>
          <div class="material-sub">${m.subject || ''} ${m.grade ? '· ' + m.grade : ''}</div>
        </div>
        <div class="material-stats">
          <span class="material-badge">${m.questions_count || 0} вопр.</span>
        </div>
      </div>
    `).join('');
  }
}

function createMaterial() {
  document.getElementById('new-material-title').value = '';
  document.getElementById('new-material-desc').value = '';
  document.getElementById('new-material-subject').value = '';
  document.getElementById('new-material-grade').value = '';
  document.getElementById('modal-create-material').style.display = 'flex';
}

function closeCreateModal() {
  document.getElementById('modal-create-material').style.display = 'none';
}

async function confirmCreateMaterial() {
  const title = document.getElementById('new-material-title').value.trim();
  if (!title) {
    alert('Введите название');
    return;
  }
  const data = {
    title: title,
    description: document.getElementById('new-material-desc').value.trim(),
    subject: document.getElementById('new-material-subject').value.trim(),
    grade: document.getElementById('new-material-grade').value.trim(),
  };
  const result = await window.api.createMaterial(data);
  if (result && result.id) {
    closeCreateModal();
    await refreshMaterials();
    await openEditMaterial(result.id);
  } else {
    alert('Ошибка создания материала');
  }
}

async function openEditMaterial(id) {
  const material = await window.api.getMaterial(id);
  if (!material) {
    alert('Материал не найден');
    return;
  }
  currentMaterialForEdit = material;
  currentQuestions = material.questions || [];

  document.getElementById('edit-material-title-header').textContent = '📝 ' + material.title;
  document.getElementById('edit-material-title').value = material.title || '';
  document.getElementById('edit-material-subject').value = material.subject || '';
  document.getElementById('edit-material-desc').value = material.description || '';
  document.getElementById('edit-material-grade').value = material.grade || '';
  document.getElementById('edit-material-show-theory').checked = !!material.show_theory_to_students;

  switchMaterialTab('theory');
  await refreshTheory();
  renderEditQuestions();

  document.getElementById('modal-edit-material').style.display = 'flex';
}

function closeEditMaterial() {
  document.getElementById('modal-edit-material').style.display = 'none';
  currentMaterialForEdit = null;
  currentQuestions = [];
  refreshMaterials();
}

function switchMaterialTab(tab) {
  currentMaterialTab = tab;
  document.querySelectorAll('#material-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.material-tab-content').forEach(c => {
    c.classList.toggle('active', c.id === 'tab-' + tab);
  });
}

async function saveMaterialChanges() {
  if (!currentMaterialForEdit) return;
  const data = {
    title: document.getElementById('edit-material-title').value.trim(),
    subject: document.getElementById('edit-material-subject').value.trim(),
    description: document.getElementById('edit-material-desc').value.trim(),
    grade: document.getElementById('edit-material-grade').value.trim(),
    show_theory_to_students: document.getElementById('edit-material-show-theory').checked,
  };
  if (!data.title) {
    alert('Введите название');
    return;
  }
  await window.api.updateMaterial(currentMaterialForEdit.id, data);
  alert('Сохранено');
  closeEditMaterial();
}

async function deleteCurrentMaterial() {
  if (!currentMaterialForEdit) return;
  if (!confirm('Удалить материал «' + currentMaterialForEdit.title + '»?')) return;
  await window.api.deleteMaterial(currentMaterialForEdit.id);
  closeEditMaterial();
}

// ============================================
// ВОПРОСЫ
// ============================================
function renderEditQuestions() {
  const list = document.getElementById('edit-questions-list');
  const count = document.getElementById('edit-questions-count');
  const tabCount = document.getElementById('questions-tab-count');
  if (count) count.textContent = currentQuestions.length;
  if (tabCount) tabCount.textContent = currentQuestions.length;
  if (!list) return;

  if (currentQuestions.length === 0) {
    list.innerHTML = `
      <div class="empty-questions">
        <div class="empty-icon-small">📋</div>
        <div>Пока нет вопросов</div>
        <div class="sub-small">Нажмите «Добавить вопрос»</div>
      </div>
    `;
    return;
  }

  list.innerHTML = currentQuestions.map((q, i) => `
    <div class="question-card">
      <div class="question-num">${i + 1}</div>
      <div class="question-content">
        <div class="question-text">${escapeHtml(q.text || '')}</div>
        <div class="question-meta">
          <span>${modeLabel(q.mode)}</span>
          ${q.timer ? '<span>· ⏱ ' + q.timer + 'с</span>' : ''}
        </div>
      </div>
      <div class="question-actions">
        <button class="btn-small" onclick="editQuestion(${q.id})">✏️</button>
        <button class="btn-small btn-danger" onclick="deleteQuestion(${q.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

function modeLabel(mode) {
  return { buttons: '🎨 Кнопки', text: '✍️ Текст', quiz: '🎲 Квиз' }[mode] || '🎨 Кнопки';
}

function addQuestion() {
  editingQuestionId = null;
  editingQMode = 'buttons';
  document.getElementById('question-modal-title').textContent = '📌 Новый вопрос';
  document.getElementById('q-text').value = '';
  document.getElementById('q-timer').value = '30';
  document.getElementById('q-keywords').value = '';
  document.getElementById('q-opt-0').value = '';
  document.getElementById('q-opt-1').value = '';
  document.getElementById('q-opt-2').value = '';
  document.getElementById('q-opt-3').value = '';
  document.getElementById('q-correct').value = '';
  setQMode('buttons');
  document.getElementById('modal-edit-question').style.display = 'flex';
}

async function editQuestion(id) {
  const q = currentQuestions.find(x => x.id === id);
  if (!q) return;
  editingQuestionId = id;
  editingQMode = q.mode || 'buttons';
  document.getElementById('question-modal-title').textContent = '✏️ Редактирование';
  document.getElementById('q-text').value = q.text || '';
  document.getElementById('q-timer').value = q.timer || 30;
  document.getElementById('q-keywords').value = (q.keywords || []).join(', ');
  document.getElementById('q-opt-0').value = q.quiz_options?.[0] || '';
  document.getElementById('q-opt-1').value = q.quiz_options?.[1] || '';
  document.getElementById('q-opt-2').value = q.quiz_options?.[2] || '';
  document.getElementById('q-opt-3').value = q.quiz_options?.[3] || '';
  document.getElementById('q-correct').value = q.quiz_correct ?? '';
  setQMode(editingQMode);
  document.getElementById('modal-edit-question').style.display = 'flex';
}

function setQMode(mode) {
  editingQMode = mode;
  document.querySelectorAll('#q-mode-tabs .mode-tab-sm').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const quiz = document.getElementById('q-quiz-block');
  const kw = document.getElementById('q-keywords-row');
  if (quiz) quiz.style.display = mode === 'quiz' ? 'block' : 'none';
  if (kw) kw.style.display = mode === 'text' ? 'block' : 'none';
}

function closeQuestionModal() {
  document.getElementById('modal-edit-question').style.display = 'none';
}

async function confirmQuestion() {
  const text = document.getElementById('q-text').value.trim();
  if (!text) { alert('Введите текст вопроса'); return; }
  if (!currentMaterialForEdit) return;

  const data = {
    text: text,
    mode: editingQMode,
    timer: parseInt(document.getElementById('q-timer').value) || 0,
    keywords: document.getElementById('q-keywords').value.split(',').map(s => s.trim()).filter(Boolean),
    quiz_options: [
      document.getElementById('q-opt-0').value.trim(),
      document.getElementById('q-opt-1').value.trim(),
      document.getElementById('q-opt-2').value.trim(),
      document.getElementById('q-opt-3').value.trim(),
    ].filter(Boolean),
    quiz_correct: document.getElementById('q-correct').value === '' ? null : parseInt(document.getElementById('q-correct').value),
  };

  if (editingQuestionId) {
    await window.api.updateQuestion(editingQuestionId, data);
  } else {
    await window.api.createQuestion(currentMaterialForEdit.id, data);
  }

  const material = await window.api.getMaterial(currentMaterialForEdit.id);
  currentQuestions = material.questions || [];
  renderEditQuestions();
  closeQuestionModal();
}

async function deleteQuestion(id) {
  if (!confirm('Удалить вопрос?')) return;
  await window.api.deleteQuestion(id);
  const material = await window.api.getMaterial(currentMaterialForEdit.id);
  currentQuestions = material.questions || [];
  renderEditQuestions();
}

// ============================================
// ТЕОРИЯ
// ============================================
async function refreshTheory() {
  if (!currentMaterialForEdit) return;
  const list = document.getElementById('theory-list');
  const tabCount = document.getElementById('theory-tab-count');
  if (!list) return;
  const theory = await window.api.listTheory(currentMaterialForEdit.id);

  if (tabCount) tabCount.textContent = (theory || []).length;

  if (!theory || theory.length === 0) {
    list.innerHTML = `
      <div class="empty-questions">
        <div class="empty-icon-small">📖</div>
        <div>Пока нет теории</div>
        <div class="sub-small">Добавьте заметки, картинки, файлы или ссылки</div>
      </div>
    `;
    return;
  }

  list.innerHTML = theory.map(t => `
    <div class="theory-item">
      <div class="theory-item-icon">${theoryIcon(t.type)}</div>
      <div class="theory-item-content">
        <div class="theory-item-title">${escapeHtml(t.title || '')}</div>
        ${t.type === 'note' ? '<div class="theory-item-sub">' + escapeHtml((t.content || '').slice(0, 100)) + '</div>' : ''}
        ${t.type === 'link' ? '<div class="theory-item-sub">' + escapeHtml(t.url || '') + '</div>' : ''}
      </div>
      <div class="theory-item-actions">
        ${t.type === 'file' || t.type === 'image' ? `<button class="btn-small" onclick="openTheoryFile(${t.id})">👁</button>` : ''}
        <button class="btn-small btn-danger" onclick="deleteTheoryItem(${t.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

function theoryIcon(type) {
  return { note: '📄', link: '🔗', image: '🖼️', file: '📎' }[type] || '📄';
}

async function deleteTheoryItem(id) {
  if (!confirm('Удалить?')) return;
  await window.api.deleteTheory(id);
  refreshTheory();
}

function openTheoryFile(id) {
  window.api.openTheoryFile(id);
}

function addTheoryNote() {
  document.getElementById('theory-note-modal-title').textContent = '📄 Новая заметка';
  document.getElementById('theory-note-title').value = '';
  document.getElementById('theory-note-content').value = '';
  document.getElementById('modal-theory-note').dataset.editId = '';
  document.getElementById('modal-theory-note').style.display = 'flex';
}

function closeTheoryNoteModal() {
  document.getElementById('modal-theory-note').style.display = 'none';
}

async function saveTheoryNote() {
  const title = document.getElementById('theory-note-title').value.trim();
  const content = document.getElementById('theory-note-content').value.trim();
  if (!title && !content) { alert('Заполните заголовок или содержимое'); return; }
  await window.api.createTheoryNote(currentMaterialForEdit.id, { title, content });
  closeTheoryNoteModal();
  refreshTheory();
}

function addTheoryLink() {
  document.getElementById('theory-link-title').value = '';
  document.getElementById('theory-link-url').value = '';
  document.getElementById('modal-theory-link').style.display = 'flex';
}

function closeTheoryLinkModal() {
  document.getElementById('modal-theory-link').style.display = 'none';
}

async function saveTheoryLink() {
  const title = document.getElementById('theory-link-title').value.trim();
  const url = document.getElementById('theory-link-url').value.trim();
  if (!url) { alert('Введите URL'); return; }
  await window.api.createTheoryLink(currentMaterialForEdit.id, { title, url });
  closeTheoryLinkModal();
  refreshTheory();
}

async function addTheoryImage() {
  const result = await window.api.pickFile('image');
  if (!result || !result.ok) return;
  await window.api.createTheoryFile(currentMaterialForEdit.id, {
    title: result.fileName, filePath: result.filePath, fileType: 'image', size: result.size
  });
  refreshTheory();
}

async function addTheoryFile() {
  const result = await window.api.pickFile('document');
  if (!result || !result.ok) return;
  await window.api.createTheoryFile(currentMaterialForEdit.id, {
    title: result.fileName, filePath: result.filePath, fileType: 'file', size: result.size
  });
  refreshTheory();
}

// ============================================
// КЛАССЫ
// ============================================
async function refreshClasses() {
  const list = document.getElementById('classes-list');
  if (!list) return;
  const classes = await window.api.listClasses();

  if (!classes || classes.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-title">Пока нет классов</div>
        <div class="empty-sub">Создайте класс — список учеников для урока</div>
      </div>
    `;
  } else {
    list.innerHTML = classes.map(c => `
      <div class="material-card" onclick="openEditClass(${c.id})">
        <div class="material-icon">📚</div>
        <div class="material-content">
          <div class="material-title">${escapeHtml(c.title)}</div>
          <div class="material-sub">${c.description || ''}</div>
        </div>
        <div class="material-stats">
          <span class="material-badge">${c.students_count || 0} уч.</span>
        </div>
      </div>
    `).join('');
  }
}

function createClass() {
  document.getElementById('new-class-title').value = '';
  document.getElementById('new-class-desc').value = '';
  document.getElementById('modal-create-class').style.display = 'flex';
}

function closeCreateClass() {
  document.getElementById('modal-create-class').style.display = 'none';
}

async function confirmCreateClass() {
  const title = document.getElementById('new-class-title').value.trim();
  if (!title) { alert('Введите название'); return; }
  const result = await window.api.createClass({
    title: title,
    description: document.getElementById('new-class-desc').value.trim(),
  });
  if (result && result.id) {
    closeCreateClass();
    await refreshClasses();
    await openEditClass(result.id);
  }
}

async function openEditClass(id) {
  const cls = await window.api.getClass(id);
  if (!cls) return;
  currentClassForEdit = cls;
  currentStudents = cls.students || [];

  document.getElementById('edit-class-title-header').textContent = '📚 ' + cls.title;
  document.getElementById('edit-class-title').value = cls.title || '';
  document.getElementById('edit-class-desc').value = cls.description || '';
  renderEditStudents();

  document.getElementById('modal-edit-class').style.display = 'flex';
}

function closeEditClass() {
  document.getElementById('modal-edit-class').style.display = 'none';
  currentClassForEdit = null;
  refreshClasses();
}

function renderEditStudents() {
  const list = document.getElementById('edit-students-list');
  const count = document.getElementById('edit-students-count');
  if (count) count.textContent = currentStudents.length;
  if (!list) return;

  if (currentStudents.length === 0) {
    list.innerHTML = `
      <div class="empty-questions">
        <div class="empty-icon-small">👥</div>
        <div>Пока нет учеников</div>
      </div>
    `;
    return;
  }

  list.innerHTML = currentStudents.map(s => `
    <div class="student-row">
      <span>${escapeHtml(s.full_name)}</span>
      <button class="btn-small btn-danger" onclick="removeStudent(${s.id})">✕</button>
    </div>
  `).join('');
}

async function removeStudent(id) {
  if (!confirm('Удалить ученика?')) return;
  await window.api.deleteStudent(id);
  const cls = await window.api.getClass(currentClassForEdit.id);
  currentStudents = cls.students || [];
  renderEditStudents();
}

async function saveClassChanges() {
  if (!currentClassForEdit) return;
  const title = document.getElementById('edit-class-title').value.trim();
  if (!title) { alert('Введите название'); return; }
  await window.api.updateClass(currentClassForEdit.id, {
    title: title,
    description: document.getElementById('edit-class-desc').value.trim(),
  });
  alert('Сохранено');
  closeEditClass();
}

async function deleteCurrentClass() {
  if (!currentClassForEdit) return;
  if (!confirm('Удалить класс «' + currentClassForEdit.title + '»?')) return;
  await window.api.deleteClass(currentClassForEdit.id);
  closeEditClass();
}

function openAddStudents() {
  document.getElementById('bulk-students-text').value = '';
  document.getElementById('modal-add-students').style.display = 'flex';
}

function closeAddStudents() {
  document.getElementById('modal-add-students').style.display = 'none';
}

async function confirmAddStudents() {
  const text = document.getElementById('bulk-students-text').value.trim();
  if (!text) { alert('Введите список'); return; }
  await window.api.addStudentsBulk(currentClassForEdit.id, text);
  const cls = await window.api.getClass(currentClassForEdit.id);
  currentStudents = cls.students || [];
  renderEditStudents();
  closeAddStudents();
}

// ============================================
// ИСТОРИЯ
// ============================================
async function refreshHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const lessons = await window.api.listLessons(50);

  if (!lessons || lessons.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-title">Пока нет уроков</div>
        <div class="empty-sub">Проведите первый урок — он появится здесь</div>
      </div>
    `;
    return;
  }

  list.innerHTML = lessons.map(l => `
    <div class="material-card">
      <div class="material-icon">📊</div>
      <div class="material-content">
        <div class="material-title">${escapeHtml(l.material_title || 'Урок')}</div>
        <div class="material-sub">${escapeHtml(l.class_title || '')} · ${formatDate(l.created_at)}</div>
      </div>
      <div class="material-stats">
        <span class="material-badge">${l.avg_green_pct || 0}%</span>
      </div>
    </div>
  `).join('');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// CLOUDPUB
// ============================================
function openCloudpubModal() {
  document.getElementById('cloudpub-email').value = '';
  document.getElementById('cloudpub-password').value = '';
  document.getElementById('cloudpub-status').textContent = '';
  document.getElementById('modal-cloudpub-setup').style.display = 'flex';
}

function closeCloudpubModal() {
  document.getElementById('modal-cloudpub-setup').style.display = 'none';
}

function skipCloudpubSetup() {
  closeCloudpubModal();
}

async function doCloudpubLogin() {
  const email = document.getElementById('cloudpub-email').value.trim();
  const password = document.getElementById('cloudpub-password').value;
  if (!email || !password) {
    document.getElementById('cloudpub-status').textContent = '⚠️ Введите email и пароль';
    return;
  }
  const btn = document.getElementById('cloudpub-login-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Вход…';
  document.getElementById('cloudpub-status').textContent = 'Подключение к CloudPub…';

  const result = await window.api.loginCloudpub(email, password);

  btn.disabled = false;
  btn.textContent = 'Войти';

  if (result.ok) {
    document.getElementById('cloudpub-status').innerHTML = '<span style="color:#7dffb0;">✅ Успешно! Можно закрыть окно.</span>';
    setTimeout(() => closeCloudpubModal(), 2000);
  } else {
    document.getElementById('cloudpub-status').innerHTML = '<span style="color:#ff7b7b;">❌ ' + (result.msg || 'Ошибка входа') + '</span>';
  }
}

async function openCloudpubManage() {
  document.getElementById('modal-cloudpub-manage').style.display = 'flex';
  document.getElementById('cloudpub-manage-status').textContent = 'Проверка статуса…';
  document.getElementById('cloudpub-manage-link').style.display = 'none';
  document.getElementById('cloudpub-logout-btn').style.display = 'none';

  const result = await window.api.checkCloudpubAuth();
  const status = document.getElementById('cloudpub-manage-status');

  if (result.logged) {
    status.innerHTML = '<span style="color:#7dffb0;">✅ Авторизован</span><br><span style="color:#9aa0b4; font-size:13px;">Ученики могут подключаться через интернет</span>';
    document.getElementById('cloudpub-logout-btn').style.display = 'inline-block';
  } else {
    status.innerHTML = '<span style="color:#f5c06b;">⚠️ Не авторизован</span><br><span style="color:#9aa0b4; font-size:13px;">Нажмите «Управление CloudPub» в настройках, чтобы войти</span>';
  }
}

function closeCloudpubManage() {
  document.getElementById('modal-cloudpub-manage').style.display = 'none';
}

async function doCloudpubLogout() {
  if (!confirm('Выйти из CloudPub?')) return;
  await window.api.logoutCloudpub();
  closeCloudpubManage();
}

// ============================================
// ПОМОЩЬ
// ============================================
function openHelp() {
  document.getElementById('modal-help').style.display = 'flex';
}

function closeHelp() {
  document.getElementById('modal-help').style.display = 'none';
}

function scrollHelpTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// ТЕМА
// ============================================
function toggleTheme(checked) {
  document.body.classList.toggle('light', checked);
  localStorage.setItem('theme', checked ? 'light' : 'dark');
}

if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light');
  const el = document.getElementById('set-theme');
  if (el) el.checked = true;
}

// ============================================
// УТИЛИТЫ
// ============================================
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============================================
// ЗАКРЫТИЕ МОДАЛОК ПО ESC
// ============================================
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  }
});

// Закрытие модалок по клику на фон
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});