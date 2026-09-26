const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Flask
  startFlask: () => ipcRenderer.invoke('start-flask'),
  stopFlask: () => ipcRenderer.invoke('stop-flask'),
  checkFlask: () => ipcRenderer.invoke('check-flask'),

  // CloudPub
  startCloudpub: () => ipcRenderer.invoke('start-cloudpub'),
  stopCloudpub: () => ipcRenderer.invoke('stop-cloudpub'),
  getCloudpubUrl: () => ipcRenderer.invoke('get-cloudpub-url'),

  // CloudPub авторизация
  checkCloudpubAuth: () => ipcRenderer.invoke('cloudpub:check'),
  loginCloudpub: (email, password) => ipcRenderer.invoke('cloudpub:login', email, password),
  logoutCloudpub: () => ipcRenderer.invoke('cloudpub:logout'),

  // Ngrok
  startNgrok: () => ipcRenderer.invoke('start-ngrok'),
  stopNgrok: () => ipcRenderer.invoke('stop-ngrok'),

  // Утилиты
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openTeacher: () => ipcRenderer.invoke('open-teacher'),
  isTeacherOpen: () => ipcRenderer.invoke('is-teacher-open'),

  // Автообновления
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Урок — материал
  setLessonMaterial: (id) => ipcRenderer.invoke('set-lesson-material', id),
  getLessonMaterial: () => ipcRenderer.invoke('get-lesson-material'),

  // Урок — класс
  setLessonClass: (id) => ipcRenderer.invoke('set-lesson-class', id),
  getLessonClass: () => ipcRenderer.invoke('get-lesson-class'),

  // Классы
  listClasses: () => ipcRenderer.invoke('classes:list'),
  getClass: (id) => ipcRenderer.invoke('classes:get', id),
  createClass: (data) => ipcRenderer.invoke('classes:create', data),
  updateClass: (id, data) => ipcRenderer.invoke('classes:update', id, data),
  deleteClass: (id) => ipcRenderer.invoke('classes:delete', id),

  // Ученики
  addStudent: (classId, fullName) => ipcRenderer.invoke('students:add', classId, fullName),
  addStudentsBulk: (classId, text) => ipcRenderer.invoke('students:addBulk', classId, text),
  deleteStudent: (id) => ipcRenderer.invoke('students:delete', id),
  updateStudent: (id, fullName) => ipcRenderer.invoke('students:update', id, fullName),

  // Материалы
  listMaterials: () => ipcRenderer.invoke('materials:list'),
  getMaterial: (id) => ipcRenderer.invoke('materials:get', id),
  createMaterial: (data) => ipcRenderer.invoke('materials:create', data),
  updateMaterial: (id, data) => ipcRenderer.invoke('materials:update', id, data),
  deleteMaterial: (id) => ipcRenderer.invoke('materials:delete', id),
  toggleFavorite: (id) => ipcRenderer.invoke('materials:toggleFavorite', id),

  // Вопросы
  createQuestion: (materialId, data) => ipcRenderer.invoke('questions:create', materialId, data),
  updateQuestion: (id, data) => ipcRenderer.invoke('questions:update', id, data),
  deleteQuestion: (id) => ipcRenderer.invoke('questions:delete', id),

  // Теория
  listTheory: (materialId) => ipcRenderer.invoke('theory:list', materialId),
  createTheoryNote: (materialId, data) => ipcRenderer.invoke('theory:createNote', materialId, data),
  createTheoryLink: (materialId, data) => ipcRenderer.invoke('theory:createLink', materialId, data),
  createTheoryFile: (materialId, data) => ipcRenderer.invoke('theory:createFile', materialId, data),
  updateTheory: (id, data) => ipcRenderer.invoke('theory:update', id, data),
  deleteTheory: (id) => ipcRenderer.invoke('theory:delete', id),
  openTheoryFile: (id) => ipcRenderer.invoke('theory:openFile', id),
  pickFile: (fileType) => ipcRenderer.invoke('theory:pickFile', fileType),
  readFileBase64: (id) => ipcRenderer.invoke('theory:readFileBase64', id),

  // Уроки
  listLessons: (limit) => ipcRenderer.invoke('lessons:list', limit),
  getLesson: (id) => ipcRenderer.invoke('lessons:get', id),
  createLesson: (data) => ipcRenderer.invoke('lessons:create', data),
  finishLesson: (id, stats) => ipcRenderer.invoke('lessons:finish', id, stats),
  deleteLesson: (id) => ipcRenderer.invoke('lessons:delete', id),
  saveAnswer: (data) => ipcRenderer.invoke('answers:save', data),

  // Настройки
  getSetting: (key, def) => ipcRenderer.invoke('settings:get', key, def),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:all'),

  // События
  onFlaskStatus: (cb) => ipcRenderer.on('flask-status', (e, data) => cb(data)),
  onCloudpubStatus: (cb) => ipcRenderer.on('cloudpub-status', (e, data) => cb(data))
});