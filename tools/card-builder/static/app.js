const $ = (selector) => document.querySelector(selector);

const elements = {
  dropZone: $('#dropZone'),
  filePicker: $('#filePicker'),
  folderPicker: $('#folderPicker'),
  chooseFilesButton: $('#chooseFilesButton'),
  chooseFolderButton: $('#chooseFolderButton'),
  emptyChooseButton: $('#emptyChooseButton'),
  uploadProgress: $('#uploadProgress'),
  uploadProgressText: $('#uploadProgressText'),
  uploadProgressBar: $('#uploadProgressBar'),
  groupMode: $('#groupMode'),
  statusFilter: $('#statusFilter'),
  searchInput: $('#searchInput'),
  groupList: $('#groupList'),
  totalCount: $('#totalCount'),
  pendingCount: $('#pendingCount'),
  doneCount: $('#doneCount'),
  skippedCount: $('#skippedCount'),
  refreshButton: $('#refreshButton'),
  resetButton: $('#resetButton'),
  emptyState: $('#emptyState'),
  editor: $('#editor'),
  groupSource: $('#groupSource'),
  groupHeading: $('#groupHeading'),
  groupStatusText: $('#groupStatusText'),
  positionText: $('#positionText'),
  previousButton: $('#previousButton'),
  nextButton: $('#nextButton'),
  incompleteBanner: $('#incompleteBanner'),
  previewGrid: $('#previewGrid'),
  autoAssignButton: $('#autoAssignButton'),
  rotateRolesButton: $('#rotateRolesButton'),
  folderNameInput: $('#folderNameInput'),
  titleInput: $('#titleInput'),
  descriptionInput: $('#descriptionInput'),
  descriptionLanguage: $('#descriptionLanguage'),
  generateDescriptionButton: $('#generateDescriptionButton'),
  tagsInput: $('#tagsInput'),
  featuredInput: $('#featuredInput'),
  moveFilesInput: $('#moveFilesInput'),
  conflictInput: $('#conflictInput'),
  skipButton: $('#skipButton'),
  saveButton: $('#saveButton'),
  openInboxButton: $('#openInboxButton'),
  openOutputButton: $('#openOutputButton'),
  buildButton: $('#buildButton'),
  consoleDialog: $('#consoleDialog'),
  consoleTitle: $('#consoleTitle'),
  consoleSubtitle: $('#consoleSubtitle'),
  consoleOutput: $('#consoleOutput'),
  closeConsoleButton: $('#closeConsoleButton'),
  toastRegion: $('#toastRegion'),
};

const ROLE_LABELS = {
  output: 'Output',
  object: 'Object gốc',
  background: 'Background',
};
const ROLE_ORDER = ['output', 'object', 'background'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'svg'];

const state = {
  groups: [],
  selectedId: null,
  drafts: new Map(),
  loading: false,
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = { error: `HTTP ${response.status}` };
  }
  if (!response.ok) throw new Error(payload.error || payload.stderr || `HTTP ${response.status}`);
  return payload;
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  elements.toastRegion.append(item);
  window.setTimeout(() => item.remove(), 3400);
}

function mediaUrl(relativePath) {
  return `/media/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'card';
}

function titleFromSlug(value) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || 'Untitled Card';
}

function fileName(path) {
  return path.split('/').pop();
}

function inferRole(path) {
  const name = fileName(path).toLowerCase();
  const tokens = new Set(name.replace(/\.[^.]+$/, '').split(/[^a-z0-9]+/).filter(Boolean));
  const groups = {
    output: ['output', 'result', 'final', 'generated', 'camouflage', 'render'],
    object: ['object', 'subject', 'animal', 'input', 'original', 'foreground', 'fg'],
    background: ['background', 'bg', 'scene', 'texture', 'backdrop'],
  };
  const matches = Object.entries(groups).filter(([, words]) => words.some((word) => tokens.has(word)));
  return matches.length === 1 ? matches[0][0] : null;
}

function defaultDraft(group) {
  return {
    folderName: group.folderName,
    title: group.title,
    description: '',
    tags: ['camouflage'],
    featured: false,
    moveFiles: false,
    conflict: 'increment',
    files: group.files.map((file) => ({ ...file })),
  };
}

function getSelectedGroup() {
  return state.groups.find((group) => group.id === state.selectedId) || null;
}

function getDraft(group = getSelectedGroup()) {
  if (!group) return null;
  if (!state.drafts.has(group.id)) state.drafts.set(group.id, defaultDraft(group));
  return state.drafts.get(group.id);
}

function captureDraft() {
  const group = getSelectedGroup();
  const draft = group && state.drafts.get(group.id);
  if (!draft || elements.editor.hidden) return;
  draft.folderName = elements.folderNameInput.value;
  draft.title = elements.titleInput.value;
  draft.description = elements.descriptionInput.value;
  draft.tags = elements.tagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean);
  draft.featured = elements.featuredInput.checked;
  draft.moveFiles = elements.moveFilesInput.checked;
  draft.conflict = elements.conflictInput.value;
}

function filteredGroups() {
  const filter = elements.statusFilter.value;
  const query = elements.searchInput.value.trim().toLowerCase();
  return state.groups.filter((group) => {
    const statusMatch = filter === 'all'
      || (filter === 'incomplete' ? !group.complete : group.status === filter);
    const queryMatch = !query
      || group.label.toLowerCase().includes(query)
      || group.folderName.toLowerCase().includes(query)
      || group.files.some((file) => file.path.toLowerCase().includes(query));
    return statusMatch && queryMatch;
  });
}

function updateCounts(counts = {}) {
  elements.totalCount.textContent = counts.total ?? state.groups.length;
  elements.pendingCount.textContent = counts.pending ?? state.groups.filter((g) => g.status === 'pending').length;
  elements.doneCount.textContent = counts.done ?? state.groups.filter((g) => g.status === 'done').length;
  elements.skippedCount.textContent = counts.skipped ?? state.groups.filter((g) => g.status === 'skipped').length;
}

function renderGroupList() {
  const groups = filteredGroups();
  elements.groupList.replaceChildren();

  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'group-list-empty';
    empty.textContent = state.groups.length ? 'Không có group phù hợp bộ lọc.' : 'Chưa tìm thấy ảnh trong inbox.';
    elements.groupList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  groups.forEach((group) => {
    const overallIndex = state.groups.indexOf(group) + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `group-item${group.id === state.selectedId ? ' active' : ''}`;
    const dotClass = !group.complete ? 'incomplete' : group.status;
    button.innerHTML = `
      <span class="group-index">${String(overallIndex).padStart(2, '0')}</span>
      <span class="group-copy">
        <strong>${escapeHtml(group.label)}</strong>
        <small>${group.complete ? group.files.map((file) => fileName(file.path)).join(' · ') : `${group.files.length}/3 ảnh`}</small>
      </span>
      <i class="status-dot ${dotClass}" aria-label="${dotClass}"></i>
    `;
    button.addEventListener('click', () => selectGroup(group.id));
    fragment.append(button);
  });
  elements.groupList.append(fragment);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function renderPreview(group, draft) {
  elements.previewGrid.replaceChildren();
  draft.files.forEach((file, index) => {
    const card = document.createElement('article');
    card.className = 'preview-card';
    card.dataset.role = file.role || '';

    const imageBox = document.createElement('div');
    imageBox.className = 'preview-image';
    const image = document.createElement('img');
    image.src = mediaUrl(file.path);
    image.alt = `${ROLE_LABELS[file.role] || 'Ảnh'}: ${fileName(file.path)}`;
    image.loading = 'eager';
    const fileLabel = document.createElement('span');
    fileLabel.className = 'preview-file';
    fileLabel.textContent = fileName(file.path);
    imageBox.append(image, fileLabel);

    const roleWrap = document.createElement('div');
    roleWrap.className = 'role-select-wrap';
    const select = document.createElement('select');
    select.className = 'role-badge';
    select.setAttribute('aria-label', `Vai trò của ${fileName(file.path)}`);
    ROLE_ORDER.forEach((role) => {
      const option = new Option(ROLE_LABELS[role], role, false, file.role === role);
      select.add(option);
    });
    select.addEventListener('change', () => changeRole(index, select.value));
    roleWrap.append(select);
    card.append(imageBox, roleWrap);
    elements.previewGrid.append(card);
  });
}

function changeRole(fileIndex, newRole) {
  const draft = getDraft();
  if (!draft) return;
  const currentRole = draft.files[fileIndex].role;
  if (currentRole === newRole) return;
  const other = draft.files.find((file, index) => index !== fileIndex && file.role === newRole);
  if (other) other.role = currentRole;
  draft.files[fileIndex].role = newRole;
  renderEditor();
}

function renderEditor() {
  const group = getSelectedGroup();
  const hasGroups = state.groups.length > 0;
  elements.emptyState.hidden = hasGroups;
  elements.editor.hidden = !hasGroups || !group;
  if (!group) return;

  const draft = getDraft(group);
  const index = state.groups.indexOf(group);
  elements.groupSource.textContent = group.sourceKind.replaceAll('-', ' ').toUpperCase();
  elements.groupHeading.textContent = group.label;
  elements.positionText.textContent = `${index + 1} / ${state.groups.length}`;
  elements.previousButton.disabled = index <= 0;
  elements.nextButton.disabled = index >= state.groups.length - 1;
  elements.incompleteBanner.hidden = group.complete;
  elements.saveButton.disabled = !group.complete || state.loading;

  if (group.status === 'done') {
    elements.groupStatusText.textContent = `Đã lưu vào public/gallery/${group.savedFolder || group.folderName}. Bạn vẫn có thể lưu thêm một bản mới.`;
    elements.skipButton.textContent = 'Đặt lại trạng thái';
  } else if (group.status === 'skipped') {
    elements.groupStatusText.textContent = 'Nhóm này đang được đánh dấu bỏ qua.';
    elements.skipButton.textContent = 'Xử lý lại';
  } else {
    elements.groupStatusText.textContent = 'Kiểm tra vai trò của ba ảnh, nhập metadata rồi lưu.';
    elements.skipButton.textContent = 'Bỏ qua';
  }

  renderPreview(group, draft);
  elements.folderNameInput.value = draft.folderName;
  elements.titleInput.value = draft.title;
  elements.descriptionInput.value = draft.description;
  elements.tagsInput.value = draft.tags.join(', ');
  elements.featuredInput.checked = draft.featured;
  elements.moveFilesInput.checked = draft.moveFiles;
  elements.conflictInput.value = draft.conflict;
  renderGroupList();
}

function selectGroup(id) {
  captureDraft();
  state.selectedId = id;
  renderEditor();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nextGroupId(fromId, predicate = () => true) {
  const start = state.groups.findIndex((group) => group.id === fromId);
  for (let offset = 1; offset <= state.groups.length; offset += 1) {
    const group = state.groups[(start + offset) % state.groups.length];
    if (predicate(group)) return group.id;
  }
  return null;
}

async function scan({ selectId = null, selectPending = false } = {}) {
  captureDraft();
  const payload = await api(`/api/scan?mode=${encodeURIComponent(elements.groupMode.value)}`);
  state.groups = payload.groups;
  updateCounts(payload.counts);

  let desired = selectId && state.groups.some((group) => group.id === selectId) ? selectId : null;
  if (!desired && selectPending) desired = state.groups.find((group) => group.status === 'pending' && group.complete)?.id || null;
  if (!desired && state.selectedId && state.groups.some((group) => group.id === state.selectedId)) desired = state.selectedId;
  if (!desired) desired = state.groups.find((group) => group.status === 'pending')?.id || state.groups[0]?.id || null;
  state.selectedId = desired;

  renderGroupList();
  renderEditor();
}

function autoAssignRoles() {
  const draft = getDraft();
  if (!draft) return;
  const used = new Set();
  const unresolved = [];
  draft.files.forEach((file) => {
    const guessed = inferRole(file.path);
    if (guessed && !used.has(guessed)) {
      file.role = guessed;
      used.add(guessed);
    } else {
      unresolved.push(file);
    }
  });
  const remaining = ROLE_ORDER.filter((role) => !used.has(role));
  unresolved.forEach((file, index) => { file.role = remaining[index] || ROLE_ORDER[index % 3]; });
  renderEditor();
  toast('Đã tự gán vai trò theo tên file.');
}

function rotateRoles() {
  const draft = getDraft();
  if (!draft) return;
  const current = draft.files.map((file) => file.role);
  draft.files.forEach((file, index) => { file.role = current[(index + current.length - 1) % current.length]; });
  renderEditor();
}

function generateDescription() {
  captureDraft();
  const draft = getDraft();
  if (!draft) return;
  const title = draft.title.trim() || titleFromSlug(draft.folderName);
  const subjectTag = draft.tags.find((tag) => !['camouflage', 'result', 'output'].includes(tag.toLowerCase()));
  const subject = subjectTag ? ` “${subjectTag}”` : '';
  if (elements.descriptionLanguage.value === 'en') {
    draft.description = `${title} shows the${subject} subject blended into its source background, balancing background preservation, subtle recognizability and smooth visual integration.`;
  } else {
    draft.description = `${title} thể hiện chủ thể${subject} được hòa trộn vào ảnh nền gốc, tập trung vào khả năng bảo toàn background, mức độ nhận diện vừa phải và sự chuyển tiếp tự nhiên.`;
  }
  elements.descriptionInput.value = draft.description;
}

async function saveCurrent() {
  if (state.loading) return;
  captureDraft();
  const group = getSelectedGroup();
  const draft = getDraft(group);
  if (!group || !draft || !group.complete) return;

  const roles = draft.files.map((file) => file.role);
  if (new Set(roles).size !== 3 || !ROLE_ORDER.every((role) => roles.includes(role))) {
    toast('Mỗi card phải có đúng một Output, Object và Background.', 'error');
    return;
  }
  if (!draft.folderName.trim() || !draft.title.trim()) {
    toast('Hãy nhập tên folder và tiêu đề card.', 'error');
    return;
  }

  const nextId = nextGroupId(group.id, (candidate) => candidate.status === 'pending' && candidate.complete);
  state.loading = true;
  elements.saveButton.disabled = true;
  elements.saveButton.querySelector('span').textContent = 'Đang lưu...';

  try {
    const result = await api('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: draft.files.map(({ path, role }) => ({ path, role })),
        folderName: slugify(draft.folderName),
        title: draft.title,
        description: draft.description,
        tags: draft.tags,
        featured: draft.featured,
        moveFiles: draft.moveFiles,
        conflict: draft.conflict,
      }),
    });
    state.drafts.delete(group.id);
    toast(`Đã tạo public/gallery/${result.folder}`);
    await scan({ selectId: nextId, selectPending: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.loading = false;
    elements.saveButton.querySelector('span').textContent = 'Lưu & tiếp theo';
    renderEditor();
  }
}

async function toggleSkip() {
  const group = getSelectedGroup();
  if (!group) return;
  const status = group.status === 'pending' ? 'skipped' : 'pending';
  const nextId = nextGroupId(group.id, (candidate) => candidate.status === 'pending');
  try {
    await api('/api/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: group.id, status }),
    });
    toast(status === 'skipped' ? 'Đã bỏ qua group.' : 'Đã đưa group về hàng chờ.');
    await scan({ selectId: nextId, selectPending: true });
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function uploadFiles(fileList) {
  const files = [...fileList].filter((file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(ext);
  });
  if (!files.length) {
    toast('Không tìm thấy file ảnh hợp lệ.', 'error');
    return;
  }

  elements.uploadProgress.hidden = false;
  elements.chooseFilesButton.disabled = true;
  elements.chooseFolderButton.disabled = true;
  let completed = 0;
  let cursor = 0;

  const updateProgress = () => {
    const percent = Math.round((completed / files.length) * 100);
    elements.uploadProgressText.textContent = `Đã thêm ${completed}/${files.length} ảnh`;
    elements.uploadProgressBar.style.width = `${percent}%`;
  };
  updateProgress();

  async function worker() {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      const relative = file.webkitRelativePath || file.name;
      try {
        await api(`/api/upload?path=${encodeURIComponent(relative)}`, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
      } catch (error) {
        toast(`Không tải được ${file.name}: ${error.message}`, 'error');
      }
      completed += 1;
      updateProgress();
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  await scan({ selectPending: true });
  window.setTimeout(() => {
    elements.uploadProgress.hidden = true;
    elements.uploadProgressBar.style.width = '0%';
  }, 800);
  elements.chooseFilesButton.disabled = false;
  elements.chooseFolderButton.disabled = false;
  toast(`Đã quét ${files.length} ảnh.`);
}

async function openFolder(kind) {
  try {
    const result = await api('/api/open-folder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }),
    });
    toast(`Đã mở ${result.path}`);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function buildGallery() {
  elements.consoleTitle.textContent = 'Build website';
  elements.consoleSubtitle.textContent = 'Đang chạy npm run build...';
  elements.consoleOutput.textContent = 'Đang xử lý...';
  elements.consoleDialog.showModal();
  elements.buildButton.disabled = true;
  try {
    const result = await api('/api/build-gallery', { method: 'POST' });
    elements.consoleSubtitle.textContent = result.ok ? 'Build thành công.' : 'Build thất bại.';
    elements.consoleOutput.textContent = [result.stdout, result.stderr].filter(Boolean).join('\n') || 'Build completed.';
    toast('Website đã được build lại.');
  } catch (error) {
    elements.consoleSubtitle.textContent = 'Build thất bại.';
    elements.consoleOutput.textContent = error.message;
    toast(error.message, 'error');
  } finally {
    elements.buildButton.disabled = false;
  }
}

function navigate(delta) {
  captureDraft();
  const index = state.groups.findIndex((group) => group.id === state.selectedId);
  const target = state.groups[index + delta];
  if (target) selectGroup(target.id);
}

function bindEvents() {
  elements.chooseFilesButton.addEventListener('click', (event) => { event.stopPropagation(); elements.filePicker.click(); });
  elements.chooseFolderButton.addEventListener('click', (event) => { event.stopPropagation(); elements.folderPicker.click(); });
  elements.emptyChooseButton.addEventListener('click', () => elements.filePicker.click());
  elements.filePicker.addEventListener('change', () => uploadFiles(elements.filePicker.files).finally(() => { elements.filePicker.value = ''; }));
  elements.folderPicker.addEventListener('change', () => uploadFiles(elements.folderPicker.files).finally(() => { elements.folderPicker.value = ''; }));

  ['dragenter', 'dragover'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault(); elements.dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault(); elements.dropZone.classList.remove('dragging');
  }));
  elements.dropZone.addEventListener('drop', (event) => uploadFiles(event.dataTransfer.files));

  elements.groupMode.addEventListener('change', () => { state.drafts.clear(); scan({ selectPending: true }); });
  elements.statusFilter.addEventListener('change', renderGroupList);
  elements.searchInput.addEventListener('input', renderGroupList);
  elements.refreshButton.addEventListener('click', () => scan({ selectId: state.selectedId }));
  elements.resetButton.addEventListener('click', async () => {
    if (!window.confirm('Xóa toàn bộ trạng thái đã lưu/bỏ qua? Các folder output không bị xóa.')) return;
    await api('/api/reset-state', { method: 'POST' });
    state.drafts.clear();
    await scan({ selectPending: true });
    toast('Đã đặt lại tiến độ.');
  });

  elements.previousButton.addEventListener('click', () => navigate(-1));
  elements.nextButton.addEventListener('click', () => navigate(1));
  elements.autoAssignButton.addEventListener('click', autoAssignRoles);
  elements.rotateRolesButton.addEventListener('click', rotateRoles);
  elements.folderNameInput.addEventListener('blur', () => {
    elements.folderNameInput.value = slugify(elements.folderNameInput.value);
    const draft = getDraft();
    if (draft) draft.folderName = elements.folderNameInput.value;
  });
  elements.folderNameInput.addEventListener('input', () => {
    const draft = getDraft();
    if (!draft) return;
    const oldAutoTitle = titleFromSlug(draft.folderName);
    draft.folderName = elements.folderNameInput.value;
    if (!elements.titleInput.value.trim() || elements.titleInput.value === oldAutoTitle) {
      elements.titleInput.value = titleFromSlug(elements.folderNameInput.value);
    }
  });
  elements.generateDescriptionButton.addEventListener('click', generateDescription);
  elements.saveButton.addEventListener('click', saveCurrent);
  elements.skipButton.addEventListener('click', toggleSkip);
  elements.openInboxButton.addEventListener('click', () => openFolder('inbox'));
  elements.openOutputButton.addEventListener('click', () => openFolder('output'));
  elements.buildButton.addEventListener('click', buildGallery);
  elements.closeConsoleButton.addEventListener('click', () => elements.consoleDialog.close());

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault(); saveCurrent();
    } else if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault(); navigate(-1);
    } else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault(); navigate(1);
    }
  });
}

async function init() {
  bindEvents();
  try {
    await scan({ selectPending: true });
  } catch (error) {
    toast(`Không khởi động được tool: ${error.message}`, 'error');
  }
}

init();
