// ============================================
// СОСТОЯНИЕ
// ============================================
let cloudpubUrl = '';
let flaskRunning = false;
let currentView = 'lesson';
let currentMaterialId = null;
let currentMaterial = null;
let currentQuestionId = null;
let currentQMode = 'buttons';
let currentMaterialTab = 'theory';
let currentTheoryEditId = null;
let currentTheoryEditType = null;
let currentClassId = null;
let currentClass = null;
let lessonMaterial = null;
let lessonClass = null;

// ============================================
// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
// ============================================
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  const btn = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (el) el.classList.add('active');
  if (btn) btn.classList.add('active');

  if (view === 'materials') renderMaterials();
  if (view === 'classes') renderClasses();
  if (view === 'history') renderHistory();
  if (view === 'settings') loadSettings();
}

// ============================================
// УРОК — СТАТУС
// ============================================
function setStatus(title, sub, cls) {
  const card = document.getElementById('status-card');
  const t = document.getElementById('status-title');
  const s = document.getElementById('status-sub');
  const icon = card.querySelector('.status-icon');
  card.className = 'status-card' + (cls ? ' ' + cls : '');
  t.textContent = title;
  s.textContent = sub;
  if (cls === 'running') icon.textContent = '✅';
  else if (cls === 'error') icon.textContent = '❌';
  else icon.textContent = '⏸️';
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if (cls === 'running') { dot.classList.add('running'); txt.textContent = 'Работает'; }
  else if (cls === 'error') { dot.classList.remove('running'); txt.textContent = 'Ошибка'; }
  else { dot.classList.remove('running'); txt.textContent = 'Остановлено'; }
}

function setButton(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = disabled;
}

// ============================================
// ВЫБОР МАТЕРИАЛА ДЛЯ УРОКА
// ============================================
async function openMaterialPicker() {
  document.getElementById('pick-search').value = '';
  document.getElementById('modal-pick-material').style.display = 'flex';
  await renderPickList();
}
function closeMaterialPicker() {
  document.getElementById('modal-pick-material').style.display = 'none';
}
async function renderPickList() {
  const list = document.getElementById('pick-list');
  const search = (document.getElementById('pick-search')?.value || '').toLowerCase();
  try {
    const materials = await window.api.listMaterials();
    const filtered = search ? materials.filter(m => (m.title || '').toLowerCase().includes(search)) : materials;
    if (!filtered.length) {
      list.innerHTML = '<p class="sub" style="text-align:center;padding:20px;">Материалов пока нет.</p>';
      return;
    }
    list.innerHTML = '';
    filtered.forEach(m => {
      const item = document.createElement('div');
      item.className = 'pick-item';
      item.onclick = () => pickMaterial(m);
      item.innerHTML = `
        <div class="pick-item-icon">📁</div>
        <div class="pick-item-content">
          <div class="pick-item-title">${escapeHtml(m.title || 'Без названия')}</div>
          <div class="pick-item-sub">
            ${m.question_count || 0} вопросов · ${m.theory_count || 0} теории
          </div>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) { list.innerHTML = '<p class="err">Ошибка: ' + e.message + '</p>'; }
}
async function pickMaterial(material) {
  const full = await window.api.getMaterial(material.id);
  if (!full) return;
  lessonMaterial = full;
  await window.api.setLessonMaterial(full.id);
  closeMaterialPicker();
  renderLessonMaterial();
  showToast('Материал выбран: ' + full.title, 'success');
}
async function clearLessonMaterial() {
  lessonMaterial = null;
  await window.api.setLessonMaterial(null);
  renderLessonMaterial();
}
function renderLessonMaterial() {
  const empty = document.getElementById('lesson-material-empty');
  const chosen = document.getElementById('lesson-material-chosen');
  if (!lessonMaterial) {
    empty.style.display = 'flex';
    chosen.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  chosen.style.display = 'flex';
  document.getElementById('lesson-material-title').textContent = lessonMaterial.title;
  const parts = [];
  parts.push((lessonMaterial.questions?.length || 0) + ' вопросов');
  if (lessonMaterial.theory?.length) parts.push((lessonMaterial.theory.length) + ' теории');
  if (lessonMaterial.subject) parts.push(lessonMaterial.subject);
  document.getElementById('lesson-material-sub').textContent = parts.join(' · ');
}

// ============================================
// ВЫБОР КЛАССА ДЛЯ УРОКА
// ============================================
async function openClassPicker() {
  document.getElementById('pick-class-search').value = '';
  document.getElementById('modal-pick-class').style.display = 'flex';
  await renderPickClassList();
}
function closeClassPicker() {
  document.getElementById('modal-pick-class').style.display = 'none';
}
async function renderPickClassList() {
  const list = document.getElementById('pick-class-list');
  const search = (document.getElementById('pick-class-search')?.value || '').toLowerCase();
  try {
    const classes = await window.api.listClasses();
    const filtered = search ? classes.filter(c => (c.title || '').toLowerCase().includes(search)) : classes;
    if (!filtered.length) {
      list.innerHTML = '<p class="sub" style="text-align:center;padding:20px;">Классов пока нет.</p>';
      return;
    }
    list.innerHTML = '';
    filtered.forEach(c => {
      const item = document.createElement('div');
      item.className = 'pick-item';
      item.onclick = () => pickClass(c);
      item.innerHTML = `
        <div class="pick-item-icon">📚</div>
        <div class="pick-item-content">
          <div class="pick-item-title">${escapeHtml(c.title || 'Без названия')}</div>
          <div class="pick-item-sub">${c.students_count || 0} учеников</div>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) { list.innerHTML = '<p class="err">Ошибка: ' + e.message + '</p>'; }
}
async function pickClass(cls) {
  const full = await window.api.getClass(cls.id);
  if (!full) return;
  lessonClass = full;
  await window.api.setLessonClass(full.id);
  closeClassPicker();
  renderLessonClass();
  showToast('Класс выбран: ' + full.title, 'success');
}
async function clearLessonClass() {
  lessonClass = null;
  await window.api.setLessonClass(null);
  renderLessonClass();
}
function renderLessonClass() {
  const empty = document.getElementById('lesson-class-empty');
  const chosen = document.getElementById('lesson-class-chosen');
  if (!lessonClass) {
    empty.style.display = 'flex';
    chosen.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  chosen.style.display = 'flex';
  document.getElementById('lesson-class-title').textContent = lessonClass.title;
  const count = (lessonClass.students?.length || 0);
  document.getElementById('lesson-class-sub').textContent = count + ' учеников';
}

// ============================================
// ЗАПУСК
// ============================================
async function startAll() {
  setStatus('Запускаю Flask…', 'Это займёт пару секунд', '');
  setButton('btn-start', true);
  await window.api.startFlask();
  setTimeout(async () => {
    const check = await window.api.checkFlask();
    if (check.running) {
      flaskRunning = true;
      setStatus('Flask работает', 'Поднимаю CloudPub…', 'running');
      await window.api.startCloudpub();
      setTimeout(async () => {
        cloudpubUrl = await window.api.getCloudpubUrl();
        document.getElementById('link-url').textContent = cloudpubUrl;
        document.getElementById('link-box').style.display = 'flex';
        setStatus('Всё работает!', 'Можно проводить урок', 'running');
        setButton('btn-teacher', false);
        setButton('btn-stop', false);
        setButton('btn-start', true);
      }, 3000);
    } else {
      setStatus('Flask не запустился', 'Проверь путь к BrainDetector', 'error');
      setButton('btn-start', false);
    }
  }, 3500);
}
async function stopAll() {
  setStatus('Останавливаю…', '', '');
  await window.api.stopCloudpub();
  await window.api.stopFlask();
  flaskRunning = false;
  document.getElementById('link-box').style.display = 'none';
  setStatus('Готово к запуску', 'Нажмите «Запустить приложение»', '');
  setButton('btn-start', false);
  setButton('btn-teacher', true);
  setButton('btn-stop', true);
}
async function openTeacher() { await window.api.openTeacher(); }
function copyLink() {
  if (!cloudpubUrl) return;
  navigator.clipboard.writeText(cloudpubUrl).then(() => showToast('Ссылка скопирована!', 'success'));
}
function openStudent() {
  if (!cloudpubUrl) return;
  window.api.openExternal(cloudpubUrl + '/student');
}

// ============================================
// МАТЕРИАЛЫ — СОЗДАНИЕ
// ============================================
function createMaterial() {
  document.getElementById('new-material-title').value = '';
  document.getElementById('new-material-desc').value = '';
  document.getElementById('new-material-subject').value = '';
  document.getElementById('new-material-grade').value = '';
  document.getElementById('modal-create-material').style.display = 'flex';
  setTimeout(() => document.getElementById('new-material-title').focus(), 100);
}
function closeCreateModal() {
  document.getElementById('modal-create-material').style.display = 'none';
}
async function confirmCreateMaterial() {
  const title = document.getElementById('new-material-title').value.trim();
  if (!title) { showToast('Введи название материала', 'error'); return; }
  const data = {
    title: title,
    description: document.getElementById('new-material-desc').value.trim(),
    subject: document.getElementById('new-material-subject').value.trim(),
    grade: document.getElementById('new-material-grade').value.trim()
  };
  try {
    const mat = await window.api.createMaterial(data);
    closeCreateModal();
    showToast('Материал создан!', 'success');
    renderMaterials();
    if (mat && mat.id) setTimeout(() => openMaterial(mat.id), 300);
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}

// ============================================
// МАТЕРИАЛЫ — СПИСОК
// ============================================
async function renderMaterials() {
  const list = document.getElementById('materials-list');
  const search = (document.getElementById('materials-search')?.value || '').toLowerCase();
  try {
    const materials = await window.api.listMaterials();
    const filtered = search ? materials.filter(m => (m.title || '').toLowerCase().includes(search)) : materials;
    const badge = document.getElementById('materials-badge');
    if (badge) {
      badge.textContent = materials.length;
      badge.style.display = materials.length > 0 ? 'inline-flex' : 'none';
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">${search ? 'Ничего не найдено' : 'Пока нет материалов'}</div><div class="empty-sub">${search ? 'Попробуй другой запрос' : 'Создайте первый материал'}</div></div>`;
      return;
    }
    list.innerHTML = '';
    filtered.forEach(m => {
      const card = document.createElement('div');
      card.className = 'material-card' + (m.favorite ? ' favorite' : '');
      card.onclick = () => openMaterial(m.id);
      card.innerHTML = `
        <button class="material-fav-btn" onclick="event.stopPropagation(); toggleFav(${m.id})">${m.favorite ? '⭐' : '☆'}</button>
        <div class="material-title">${escapeHtml(m.title || 'Без названия')}</div>
        <div class="material-desc">${escapeHtml(m.description || 'Без описания')}</div>
        <div class="material-meta">
          <span class="material-count">${m.question_count || 0} вопросов</span>
          ${m.theory_count ? `<span class="material-tag" style="background: rgba(123,60,255,.2); color:#b19dff;">📖 ${m.theory_count}</span>` : ''}
          ${m.subject ? `<span class="material-tag">${escapeHtml(m.subject)}</span>` : ''}
        </div>
      `;
      list.appendChild(card);
    });
  } catch (e) { console.error(e); }
}
async function toggleFav(id) {
  await window.api.toggleFavorite(id);
  renderMaterials();
}

// ============================================
// РЕДАКТОР МАТЕРИАЛА
// ============================================
async function openMaterial(id) {
  try {
    const material = await window.api.getMaterial(id);
    if (!material) { showToast('Материал не найден', 'error'); return; }
    currentMaterialId = id;
    currentMaterial = material;
    document.getElementById('edit-material-title-header').textContent = '📝 ' + (material.title || 'Материал');
    document.getElementById('edit-material-title').value = material.title || '';
    document.getElementById('edit-material-desc').value = material.description || '';
    document.getElementById('edit-material-subject').value = material.subject || '';
    document.getElementById('edit-material-grade').value = material.grade || '';
    document.getElementById('edit-material-show-theory').checked = !!material.show_theory_to_students;
    renderTheoryInEditor();
    renderQuestionsInEditor();
    switchMaterialTab(currentMaterialTab);
    document.getElementById('modal-edit-material').style.display = 'flex';
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
function closeEditMaterial() {
  document.getElementById('modal-edit-material').style.display = 'none';
  currentMaterialId = null;
  currentMaterial = null;
}
function switchMaterialTab(tab) {
  currentMaterialTab = tab;
  document.querySelectorAll('#material-tabs .tab-btn').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.material-tab-content').forEach(c => c.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.classList.add('active');
}

// ============================================
// ТЕОРИЯ
// ============================================
function renderTheoryInEditor() {
  const list = document.getElementById('theory-list');
  const theory = (currentMaterial && currentMaterial.theory) || [];
  document.getElementById('theory-tab-count').textContent = theory.length;
  if (!theory.length) {
    list.innerHTML = `<div class="empty-questions"><div class="empty-icon-small">📖</div><div>Пока нет теории</div><div class="sub-small">Добавьте заметки, картинки, файлы или ссылки</div></div>`;
    return;
  }
  list.innerHTML = '';
  theory.forEach(item => {
    const el = document.createElement('div');
    el.className = 'theory-item';
    el.dataset.id = item.id;
    let typeBadge, bodyHtml = '';
    if (item.type === 'note') {
      typeBadge = '<span class="theory-type-badge note">📄 Заметка</span>';
      bodyHtml = `<div class="theory-content">${renderMarkdown(item.content || '')}</div>`;
    } else if (item.type === 'link') {
      typeBadge = '<span class="theory-type-badge link">🔗 Ссылка</span>';
      bodyHtml = `<a class="theory-link-url" onclick="openTheoryLink('${escapeHtml(item.content)}')">${escapeHtml(item.content)}</a>`;
    } else if (item.type === 'image') {
      typeBadge = '<span class="theory-type-badge image">🖼️ Картинка</span>';
      bodyHtml = `<img class="theory-image-preview" data-image-id="${item.id}" src="" alt="${escapeHtml(item.title)}" onclick="openTheoryFile(${item.id})">`;
    } else if (item.type === 'file') {
      typeBadge = '<span class="theory-type-badge file">📎 Файл</span>';
      const sizeStr = formatSize(item.size || 0);
      bodyHtml = `<div class="theory-file-info" onclick="openTheoryFile(${item.id})"><span class="theory-file-icon">📎</span><div class="theory-file-info-text"><div class="theory-file-name">${escapeHtml(item.original_name || item.title)}</div><div class="theory-file-size">${sizeStr}</div></div></div>`;
    }
    el.innerHTML = `
      <div class="theory-header">
        ${typeBadge}
        <div class="theory-title">${escapeHtml(item.title || 'Без названия')}</div>
        <div class="theory-actions">
          <button class="theory-action-btn" onclick="editTheoryItem(${item.id})" title="Редактировать">✏️</button>
          <button class="theory-action-btn delete" onclick="deleteTheoryItem(${item.id})" title="Удалить">🗑</button>
        </div>
      </div>
      ${bodyHtml}
    `;
    list.appendChild(el);
  });
  theory.filter(t => t.type === 'image').forEach(async (item) => {
    const imgEl = list.querySelector(`img[data-image-id="${item.id}"]`);
    if (!imgEl) return;
    const dataUrl = await window.api.readFileBase64(item.id);
    if (dataUrl) imgEl.src = dataUrl;
  });
}
function formatSize(bytes) {
  if (!bytes) return '0 Б';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = html.split('\n');
  const result = [];
  let inUl = false;
  for (let line of lines) {
    const ulMatch = line.match(/^[\-\*] (.+)/);
    if (ulMatch) {
      if (!inUl) { result.push('<ul>'); inUl = true; }
      result.push('<li>' + ulMatch[1] + '</li>');
    } else {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (line.trim()) result.push('<p>' + line + '</p>');
    }
  }
  if (inUl) result.push('</ul>');
  return result.join('');
}

function addTheoryNote() {
  currentTheoryEditId = null;
  currentTheoryEditType = 'note';
  document.getElementById('theory-note-modal-title').textContent = '📄 Новая заметка';
  document.getElementById('theory-note-title').value = '';
  document.getElementById('theory-note-content').value = '';
  document.getElementById('modal-theory-note').style.display = 'flex';
}
function closeTheoryNoteModal() {
  document.getElementById('modal-theory-note').style.display = 'none';
  currentTheoryEditId = null;
}
async function saveTheoryNote() {
  const title = document.getElementById('theory-note-title').value.trim() || 'Заметка';
  const content = document.getElementById('theory-note-content').value;
  if (!content.trim()) { showToast('Введи содержимое', 'error'); return; }
  try {
    if (currentTheoryEditId) {
      await window.api.updateTheory(currentTheoryEditId, { title, content });
    } else {
      await window.api.createTheoryNote(currentMaterialId, { title, content });
    }
    closeTheoryNoteModal();
    currentMaterial = await window.api.getMaterial(currentMaterialId);
    renderTheoryInEditor();
    renderMaterials();
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
function addTheoryLink() {
  currentTheoryEditId = null;
  currentTheoryEditType = 'link';
  document.getElementById('theory-link-title').value = '';
  document.getElementById('theory-link-url').value = '';
  document.getElementById('modal-theory-link').style.display = 'flex';
}
function closeTheoryLinkModal() {
  document.getElementById('modal-theory-link').style.display = 'none';
  currentTheoryEditId = null;
}
async function saveTheoryLink() {
  const title = document.getElementById('theory-link-title').value.trim() || 'Ссылка';
  const url = document.getElementById('theory-link-url').value.trim();
  if (!url) { showToast('Введи URL', 'error'); return; }
  try {
    if (currentTheoryEditId) {
      await window.api.updateTheory(currentTheoryEditId, { title, content: url });
    } else {
      await window.api.createTheoryLink(currentMaterialId, { title, content: url });
    }
    closeTheoryLinkModal();
    currentMaterial = await window.api.getMaterial(currentMaterialId);
    renderTheoryInEditor();
    renderMaterials();
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
async function addTheoryImage() {
  const result = await window.api.pickFile('image');
  if (!result || !result.ok) return;
  await saveFileAsTheory('image', result);
}
async function addTheoryFile() {
  const result = await window.api.pickFile('file');
  if (!result || !result.ok) return;
  await saveFileAsTheory('file', result);
}
async function saveFileAsTheory(type, fileInfo) {
  try {
    await window.api.createTheoryFile(currentMaterialId, {
      type: type, title: fileInfo.fileName,
      original_name: fileInfo.fileName, sourcePath: fileInfo.filePath
    });
    showToast(type === 'image' ? 'Картинка добавлена' : 'Файл добавлен', 'success');
    currentMaterial = await window.api.getMaterial(currentMaterialId);
    renderTheoryInEditor();
    renderMaterials();
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
async function editTheoryItem(id) {
  const item = currentMaterial.theory.find(t => t.id === id);
  if (!item) return;
  if (item.type === 'note') {
    currentTheoryEditId = id;
    document.getElementById('theory-note-modal-title').textContent = '📄 Редактирование';
    document.getElementById('theory-note-title').value = item.title;
    document.getElementById('theory-note-content').value = item.content;
    document.getElementById('modal-theory-note').style.display = 'flex';
  } else if (item.type === 'link') {
    currentTheoryEditId = id;
    document.getElementById('theory-link-title').value = item.title;
    document.getElementById('theory-link-url').value = item.content;
    document.getElementById('modal-theory-link').style.display = 'flex';
  } else {
    showToast('Файлы редактировать нельзя', '');
  }
}
async function deleteTheoryItem(id) {
  if (!confirm('Удалить этот элемент теории?')) return;
  await window.api.deleteTheory(id);
  currentMaterial = await window.api.getMaterial(currentMaterialId);
  renderTheoryInEditor();
  renderMaterials();
}
async function openTheoryFile(id) { await window.api.openTheoryFile(id); }
function openTheoryLink(url) { window.api.openExternal(url); }

// ============================================
// ВОПРОСЫ
// ============================================
function renderQuestionsInEditor() {
  const list = document.getElementById('edit-questions-list');
  const countEl = document.getElementById('edit-questions-count');
  const questions = (currentMaterial && currentMaterial.questions) || [];
  countEl.textContent = questions.length;
  document.getElementById('questions-tab-count').textContent = questions.length;
  if (!questions.length) {
    list.innerHTML = `<div class="empty-questions"><div class="empty-icon-small">📋</div><div>Пока нет вопросов</div></div>`;
    return;
  }
  list.innerHTML = '';
  questions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'question-editor-item';
    const modeLabels = { buttons: '🎨 Кнопки', text: '✍️ Текст', quiz: '🎲 Квиз' };
    const modeCls = q.mode || 'buttons';
    let optionsPreview = '';
    if (q.mode === 'quiz') {
      try {
        const opts = JSON.parse(q.quiz_options || '[]');
        const letters = ['A', 'B', 'C', 'D'];
        optionsPreview = `<div class="q-options-preview">` + opts.map((o, i) => {
          const isCorrect = (q.quiz_correct !== null && q.quiz_correct !== undefined && i === q.quiz_correct);
          return `<span class="q-opt-preview${isCorrect ? ' correct' : ''}">${letters[i]}. ${escapeHtml(o)}${isCorrect ? ' ✓' : ''}</span>`;
        }).join('') + `</div>`;
      } catch (e) {}
    }
    const metaChips = [];
    metaChips.push(`<span class="q-meta-chip ${modeCls}">${modeLabels[modeCls] || 'Кнопки'}</span>`);
    if (q.timer > 0) metaChips.push(`<span class="q-meta-chip">⏱ ${q.timer}с</span>`);
    if (q.mode === 'text' && q.keywords) metaChips.push(`<span class="q-meta-chip">🔑 ${escapeHtml(q.keywords)}</span>`);
    item.innerHTML = `
      <div class="q-position">${idx + 1}</div>
      <div class="q-body">
        <div class="q-text-line">${escapeHtml(q.text || '')}</div>
        <div class="q-meta-line">${metaChips.join('')}</div>
        ${optionsPreview}
      </div>
      <div class="q-actions">
        <button class="q-action-btn" onclick="editQuestion(${q.id})">✏️</button>
        <button class="q-action-btn delete" onclick="deleteQuestion(${q.id})">🗑</button>
      </div>
    `;
    list.appendChild(item);
  });
}
async function saveMaterialChanges() {
  if (!currentMaterialId) return;
  const data = {
    title: document.getElementById('edit-material-title').value.trim(),
    description: document.getElementById('edit-material-desc').value.trim(),
    subject: document.getElementById('edit-material-subject').value.trim(),
    grade: document.getElementById('edit-material-grade').value.trim(),
    show_theory_to_students: document.getElementById('edit-material-show-theory').checked
  };
  if (!data.title) { showToast('Название не может быть пустым', 'error'); return; }
  await window.api.updateMaterial(currentMaterialId, data);
  showToast('Сохранено!', 'success');
  currentMaterial = await window.api.getMaterial(currentMaterialId);
  document.getElementById('edit-material-title-header').textContent = '📝 ' + currentMaterial.title;
  renderMaterials();
}
async function deleteCurrentMaterial() {
  if (!currentMaterialId) return;
  if (!confirm('Удалить материал?')) return;
  await window.api.deleteMaterial(currentMaterialId);
  showToast('Материал удалён', 'success');
  closeEditMaterial();
  renderMaterials();
}
async function addQuestion() {
  if (!currentMaterialId) return;
  currentQuestionId = null;
  document.getElementById('question-modal-title').textContent = '📌 Новый вопрос';
  document.getElementById('q-text').value = '';
  document.getElementById('q-timer').value = '30';
  document.getElementById('q-keywords').value = '';
  for (let i = 0; i < 4; i++) document.getElementById('q-opt-' + i).value = '';
  document.getElementById('q-correct').value = '';
  setQMode('buttons');
  document.getElementById('modal-edit-question').style.display = 'flex';
}
async function editQuestion(id) {
  if (!currentMaterial) return;
  const q = currentMaterial.questions.find(x => x.id === id);
  if (!q) return;
  currentQuestionId = id;
  document.getElementById('question-modal-title').textContent = '📌 Редактирование';
  document.getElementById('q-text').value = q.text || '';
  document.getElementById('q-timer').value = String(q.timer || 0);
  document.getElementById('q-keywords').value = q.keywords || '';
  const opts = JSON.parse(q.quiz_options || '[]');
  for (let i = 0; i < 4; i++) document.getElementById('q-opt-' + i).value = opts[i] || '';
  document.getElementById('q-correct').value = (q.quiz_correct !== null && q.quiz_correct !== undefined) ? String(q.quiz_correct) : '';
  setQMode(q.mode || 'buttons');
  document.getElementById('modal-edit-question').style.display = 'flex';
}
function setQMode(mode) {
  currentQMode = mode;
  document.querySelectorAll('#q-mode-tabs .mode-tab-sm').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
  });
  document.getElementById('q-quiz-block').style.display = mode === 'quiz' ? 'block' : 'none';
  document.getElementById('q-keywords-row').style.display = mode === 'text' ? 'flex' : 'none';
}
function closeQuestionModal() {
  document.getElementById('modal-edit-question').style.display = 'none';
  currentQuestionId = null;
}
async function confirmQuestion() {
  const text = document.getElementById('q-text').value.trim();
  if (!text) { showToast('Введи текст вопроса', 'error'); return; }
  const data = {
    text: text, mode: currentQMode,
    timer: parseInt(document.getElementById('q-timer').value) || 0,
    keywords: document.getElementById('q-keywords').value.trim(),
    quiz_options: [], quiz_correct: null
  };
  if (currentQMode === 'quiz') {
    const opts = [];
    for (let i = 0; i < 4; i++) {
      const v = document.getElementById('q-opt-' + i).value.trim();
      if (v) opts.push(v);
    }
    if (opts.length < 2) { showToast('Заполни хотя бы 2 варианта', 'error'); return; }
    data.quiz_options = opts;
    const corr = document.getElementById('q-correct').value;
    data.quiz_correct = corr !== '' ? parseInt(corr) : null;
  }
  try {
    if (currentQuestionId) {
      await window.api.updateQuestion(currentQuestionId, data);
    } else {
      await window.api.createQuestion(currentMaterialId, data);
    }
    closeQuestionModal();
    currentMaterial = await window.api.getMaterial(currentMaterialId);
    renderQuestionsInEditor();
    renderMaterials();
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
async function deleteQuestion(id) {
  if (!confirm('Удалить этот вопрос?')) return;
  await window.api.deleteQuestion(id);
  currentMaterial = await window.api.getMaterial(currentMaterialId);
  renderQuestionsInEditor();
  renderMaterials();
}

// ============================================
// КЛАССЫ
// ============================================
function createClass() {
  document.getElementById('new-class-title').value = '';
  document.getElementById('new-class-desc').value = '';
  document.getElementById('modal-create-class').style.display = 'flex';
}
function closeCreateClass() { document.getElementById('modal-create-class').style.display = 'none'; }
async function confirmCreateClass() {
  const title = document.getElementById('new-class-title').value.trim();
  if (!title) { showToast('Введи название класса', 'error'); return; }
  const data = { title, description: document.getElementById('new-class-desc').value.trim() };
  try {
    const cls = await window.api.createClass(data);
    closeCreateClass();
    renderClasses();
    if (cls && cls.id) setTimeout(() => openClass(cls.id), 300);
  } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
async function renderClasses() {
  const list = document.getElementById('classes-list');
  const search = (document.getElementById('classes-search')?.value || '').toLowerCase();
  try {
    const classes = await window.api.listClasses();
    const filtered = search ? classes.filter(c => (c.title || '').toLowerCase().includes(search)) : classes;
    const badge = document.getElementById('classes-badge');
    if (badge) {
      badge.textContent = classes.length;
      badge.style.display = classes.length > 0 ? 'inline-flex' : 'none';
    }
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-title">${search ? 'Ничего не найдено' : 'Пока нет классов'}</div><div class="empty-sub">${search ? 'Попробуй другой запрос' : 'Создайте первый класс'}</div></div>`;
      return;
    }
    list.innerHTML = '';
    filtered.forEach(c => {
      const card = document.createElement('div');
      card.className = 'material-card';
      card.onclick = () => openClass(c.id);
      card.innerHTML = `
        <div class="material-title">📚 ${escapeHtml(c.title || 'Без названия')}</div>
        <div class="material-desc">${escapeHtml(c.description || 'Без описания')}</div>
        <div class="material-meta"><span class="material-count">${c.students_count || 0} учеников</span></div>
      `;
      list.appendChild(card);
    });
  } catch (e) { console.error(e); }
}
async function openClass(id) {
  const cls = await window.api.getClass(id);
  if (!cls) return;
  currentClassId = id;
  currentClass = cls;
  document.getElementById('edit-class-title-header').textContent = '📚 ' + (cls.title || 'Класс');
  document.getElementById('edit-class-title').value = cls.title || '';
  document.getElementById('edit-class-desc').value = cls.description || '';
  renderStudentsInEditor();
  document.getElementById('modal-edit-class').style.display = 'flex';
}
function closeEditClass() {
  document.getElementById('modal-edit-class').style.display = 'none';
  currentClassId = null;
  currentClass = null;
}
function renderStudentsInEditor() {
  const list = document.getElementById('edit-students-list');
  const countEl = document.getElementById('edit-students-count');
  const students = (currentClass && currentClass.students) || [];
  countEl.textContent = students.length;
  if (!students.length) {
    list.innerHTML = `<div class="empty-questions"><div class="empty-icon-small">👥</div><div>Пока нет учеников</div></div>`;
    return;
  }
  list.innerHTML = '';
  students.forEach((s, idx) => {
    const row = document.createElement('div');
    row.className = 'student-row';
    row.innerHTML = `
      <div class="student-num">${idx + 1}</div>
      <div class="student-name">${escapeHtml(s.full_name)}</div>
      <div class="student-actions">
        <button class="student-action-btn" onclick="editStudentName(${s.id})">✏️</button>
        <button class="student-action-btn delete" onclick="deleteStudentInline(${s.id})">🗑</button>
      </div>
    `;
    list.appendChild(row);
  });
}
async function editStudentName(id) {
  const student = currentClass.students.find(s => s.id === id);
  if (!student) return;
  const newName = prompt('Новое имя:', student.full_name);
  if (!newName || !newName.trim()) return;
  if (!newName.includes(' ')) { showToast('Формат: Фамилия Имя', 'error'); return; }
  await window.api.updateStudent(id, newName.trim());
  currentClass = await window.api.getClass(currentClassId);
  renderStudentsInEditor();
  renderClasses();
}
async function deleteStudentInline(id) {
  if (!confirm('Удалить ученика?')) return;
  await window.api.deleteStudent(id);
  currentClass = await window.api.getClass(currentClassId);
  renderStudentsInEditor();
  renderClasses();
}
async function saveClassChanges() {
  if (!currentClassId) return;
  const data = {
    title: document.getElementById('edit-class-title').value.trim(),
    description: document.getElementById('edit-class-desc').value.trim()
  };
  if (!data.title) { showToast('Название не может быть пустым', 'error'); return; }
  await window.api.updateClass(currentClassId, data);
  showToast('Сохранено!', 'success');
  currentClass = await window.api.getClass(currentClassId);
  document.getElementById('edit-class-title-header').textContent = '📚 ' + currentClass.title;
  renderClasses();
}
async function deleteCurrentClass() {
  if (!currentClassId) return;
  if (!confirm('Удалить класс?')) return;
  await window.api.deleteClass(currentClassId);
  closeEditClass();
  renderClasses();
}
function openAddStudents() {
  document.getElementById('bulk-students-text').value = '';
  document.getElementById('modal-add-students').style.display = 'flex';
}
function closeAddStudents() { document.getElementById('modal-add-students').style.display = 'none'; }
async function confirmAddStudents() {
  const text = document.getElementById('bulk-students-text').value;
  if (!text.trim()) { showToast('Введи хотя бы одного', 'error'); return; }
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const bad = lines.filter(l => !l.includes(' '));
  if (bad.length) { showToast('Каждое имя — «Фамилия Имя»', 'error'); return; }
  const result = await window.api.addStudentsBulk(currentClassId, text);
  closeAddStudents();
  showToast(`Добавлено ${result.count} учеников`, 'success');
  currentClass = await window.api.getClass(currentClassId);
  renderStudentsInEditor();
  renderClasses();
}

// ============================================
// ИСТОРИЯ
// ============================================
async function renderHistory() {
  const list = document.getElementById('history-list');
  try {
    const lessons = await window.api.listLessons(50);
    if (!lessons.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">Пока нет уроков</div></div>`;
      return;
    }
    list.innerHTML = '';
    lessons.forEach(l => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const date = new Date(l.started_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      item.innerHTML = `
        <div class="history-date">${date}</div>
        <div class="history-title">${escapeHtml(l.title || 'Урок')}${l.class_title ? ' · ' + escapeHtml(l.class_title) : ''}</div>
        <div class="history-stats"><span class="green">✅ ${l.total_answers || 0}</span></div>
      `;
      list.appendChild(item);
    });
  } catch (e) { console.error(e); }
}

// ============================================
// НАСТРОЙКИ
// ============================================
async function loadSettings() {
  try {
    const s = await window.api.getAllSettings();
    document.getElementById('set-theme').checked = s.theme === 'light';
  } catch (e) {}
}
async function saveSetting(key, value) { await window.api.setSetting(key, value); }
function toggleTheme(isLight) {
  document.body.classList.toggle('light', isLight);
  saveSetting('theme', isLight ? 'light' : 'dark');
}

// ============================================
// УТИЛИТЫ
// ============================================
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function showToast(text, type) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ============================================
// СОБЫТИЯ
// ============================================
window.api.onFlaskStatus((data) => { flaskRunning = data.running; });
window.api.onCloudpubStatus((data) => {});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modals = ['modal-create-material', 'modal-edit-material', 'modal-edit-question',
                    'modal-pick-material', 'modal-pick-class', 'modal-create-class',
                    'modal-edit-class', 'modal-add-students', 'modal-theory-note', 'modal-theory-link'];
    for (const m of modals) {
      const el = document.getElementById(m);
      if (el && el.style.display === 'flex') { el.style.display = 'none'; return; }
    }
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  const check = await window.api.checkFlask();
  if (check.running) {
    flaskRunning = true;
    setStatus('Flask уже запущен', 'Можно проводить урок', 'running');
    setButton('btn-teacher', false);
    setButton('btn-stop', false);
    cloudpubUrl = await window.api.getCloudpubUrl();
    document.getElementById('link-url').textContent = cloudpubUrl;
    document.getElementById('link-box').style.display = 'flex';
  }
  renderMaterials();
  renderClasses();
  renderLessonMaterial();
  renderLessonClass();
  const s = await window.api.getAllSettings();
  if (s.theme === 'light') {
    document.body.classList.add('light');
    const el = document.getElementById('set-theme');
    if (el) el.checked = true;
  }
});