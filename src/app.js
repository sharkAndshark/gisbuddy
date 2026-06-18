/* global marked:readonly, L:readonly */
const DEFAULT_AVATAR = '🌍';
const AVATARS = ['🌍','🌎','🌏','🗺️','🏔️','🏖️','🏙️','🌄','🌅','🗾','🏝️','🌋','🏞️','🌲','🌸','🦅','🐉','🐼','🦊','🐬'];

const C = {
  MESSAGE: 'message',
  USER: 'user',
  AI: 'ai',
  SYSTEM: 'system',
  BUBBLE: 'bubble',
  THINKING_BLOCK: 'thinking-block',
  THINKING_CONTENT: 'thinking-content',
  TOOL_CALL: 'tool-call',
  TOOL_CALL_HEADER: 'tool-call-header',
  TOOL_CALL_ICON: 'tool-call-icon',
  TOOL_CALL_NAME: 'tool-call-name',
  TOOL_CALL_SUMMARY: 'tool-call-summary',
  TOOL_CALL_STATUS: 'tool-call-status',
  TOOL_CALL_TOGGLE: 'tool-call-toggle',
  TOOL_CALL_BODY: 'tool-call-body',
  TOOL_CALL_COMMAND: 'tool-call-command',
  TOOL_CALL_OUTPUT: 'tool-call-output',
  TOOL_CALL_ERROR: 'tool-call-output tool-call-error',
  SUCCESS: ' success',
  ERROR: ' error',
  HIDDEN: 'hidden',
};

const MAX_FILE_CACHE = 20;

const ERROR_PREFIXES = {
  LIVE: '错误:',
  HISTORY: '工具执行失败',
};

function isToolErrorOutput(output, success) {
  if (success) return false;
  return output.startsWith(ERROR_PREFIXES.LIVE) || output.startsWith(ERROR_PREFIXES.HISTORY);
}

const UI = {
  app: document.getElementById('app'),
  convList: document.getElementById('conv-list'),
  newConvBtn: document.getElementById('new-conv-btn'),
  chatContainer: document.getElementById('chat-container'),
  input: document.getElementById('input'),
  sendBtn: document.getElementById('send-btn'),
  welcome: document.getElementById('welcome'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsKeyInput: document.getElementById('settings-api-key'),
  settingsSave: document.getElementById('settings-save'),
  settingsCancel: document.getElementById('settings-cancel'),
  settingsClose: document.getElementById('settings-close'),
  avatarBtn: document.getElementById('avatar-btn'),
  profileModal: document.getElementById('profile-modal'),
  profileUsername: document.getElementById('profile-username'),
  profileSave: document.getElementById('profile-save'),
  profileCancel: document.getElementById('profile-cancel'),
  profileClose: document.getElementById('profile-close'),
  avatarPicker: document.getElementById('avatar-picker'),
  fileList: document.getElementById('file-list'),
  tabBar: document.getElementById('tab-bar'),
  fileView: document.getElementById('file-view'),
  inputArea: document.querySelector('.input-area'),
};

let userProfile = { username: '用户', avatar: DEFAULT_AVATAR };
let selectedAvatar = DEFAULT_AVATAR;

let state = {
  conversations: [],
  projects: [],
  currentConvId: null,
  isProcessing: false,
  cleanupListener: null,
  currentDir: null,
  tabs: [],
  activeTabId: null,
  fileContents: {},
};

let expandedProjects = JSON.parse(localStorage.getItem('gisbuddy_expanded_projects') || '{}');

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

UI.input.addEventListener('input', () => {
  autoResize(UI.input);
  UI.sendBtn.disabled = !UI.input.value.trim() || state.isProcessing || !state.currentConvId;
});

UI.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

UI.sendBtn.addEventListener('click', sendMessage);

function showSettings() {
  UI.settingsKeyInput.value = localStorage.getItem('gisbuddy_api_key') || '';
  UI.settingsModal.classList.remove('hidden');
  UI.settingsKeyInput.focus();
}

UI.settingsBtn.addEventListener('click', showSettings);

UI.settingsClose.addEventListener('click', () => {
  UI.settingsModal.classList.add('hidden');
});

UI.settingsCancel.addEventListener('click', () => {
  UI.settingsModal.classList.add('hidden');
});

UI.settingsModal.addEventListener('click', (e) => {
  if (e.target === UI.settingsModal || e.target.classList.contains('modal-backdrop')) {
    UI.settingsModal.classList.add('hidden');
  }
});

UI.settingsKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') UI.settingsSave.click();
});

UI.settingsSave.addEventListener('click', async () => {
  const key = UI.settingsKeyInput.value.trim();
  if (!key) return;

  UI.settingsSave.disabled = true;
  UI.settingsSave.textContent = '保存中...';

  try {
    await window.gisbuddy.configure(key);
    localStorage.setItem('gisbuddy_api_key', key);
    UI.settingsModal.classList.add('hidden');
  } catch (err) {
    alert('配置失败: ' + err.message);
  } finally {
    UI.settingsSave.disabled = false;
    UI.settingsSave.textContent = '保存';
  }
});

function loadProfile() {
  userProfile.username = localStorage.getItem('gisbuddy_username') || '用户';
  userProfile.avatar = localStorage.getItem('gisbuddy_avatar') || DEFAULT_AVATAR;
  UI.avatarBtn.textContent = userProfile.avatar;
  UI.avatarBtn.title = userProfile.username;
}

function saveProfile() {
  localStorage.setItem('gisbuddy_username', userProfile.username);
  localStorage.setItem('gisbuddy_avatar', userProfile.avatar);
  UI.avatarBtn.textContent = userProfile.avatar;
  UI.avatarBtn.title = userProfile.username;
}

function showProfile() {
  selectedAvatar = userProfile.avatar;
  UI.profileUsername.value = userProfile.username;

  const options = UI.avatarPicker.querySelectorAll('.avatar-option');
  options.forEach(el => {
    el.classList.toggle('selected', el.textContent === selectedAvatar);
  });

  UI.profileModal.classList.remove('hidden');
}

UI.avatarBtn.addEventListener('click', showProfile);

UI.profileClose.addEventListener('click', () => UI.profileModal.classList.add('hidden'));
UI.profileCancel.addEventListener('click', () => UI.profileModal.classList.add('hidden'));
UI.profileModal.addEventListener('click', (e) => {
  if (e.target === UI.profileModal || e.target.classList.contains('modal-backdrop')) {
    UI.profileModal.classList.add('hidden');
  }
});

UI.avatarPicker.addEventListener('click', (e) => {
  const btn = e.target.closest('.avatar-option');
  if (!btn) return;
  UI.avatarPicker.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
  btn.classList.add('selected');
  selectedAvatar = btn.textContent;
});

UI.profileSave.addEventListener('click', () => {
  const name = UI.profileUsername.value.trim();
  if (name) userProfile.username = name;
  userProfile.avatar = selectedAvatar;
  saveProfile();
  UI.profileModal.classList.add('hidden');
});

UI.profileUsername.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') UI.profileSave.click();
});

UI.newConvBtn.addEventListener('click', createProject);


document.querySelectorAll('.suggestion').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!state.currentConvId) return;
    UI.input.value = btn.dataset.msg;
    autoResize(UI.input);
    UI.sendBtn.disabled = false;
    sendMessage();
  });
});

async function loadConversations() {
  state.projects = await window.gisbuddy.getProjects();
  state.conversations = await window.gisbuddy.getConversations();
  renderConvList();

  if (state.conversations.length > 0) {
    switchConversation(state.conversations[0].id);
  }
}

function renderConvList() {
  UI.convList.innerHTML = '';

  const convsByProject = {};
  for (const conv of state.conversations) {
    const pid = conv.projectId;
    if (!convsByProject[pid]) convsByProject[pid] = [];
    convsByProject[pid].push(conv);
  }

  const activeProjects = state.projects.filter(p => !p.archived);
  const archivedProjects = state.projects.filter(p => p.archived);

  if (state.projects.length === 0 && state.conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'conv-empty';
    empty.textContent = '暂无项目，请点击 [+项目] 创建';
    UI.convList.appendChild(empty);
    return;
  }

  for (const project of activeProjects) {
    const isExpanded = expandedProjects[project.id] !== false;
    const convs = convsByProject[project.id] || [];

    // ── Project header ──
    const header = document.createElement('div');
    header.className = 'project-header';
    header.dataset.projectId = project.id;

    const toggle = document.createElement('span');
    toggle.className = 'project-toggle';
    toggle.textContent = isExpanded ? '▼' : '▶';

    const title = document.createElement('span');
    title.className = 'project-title';
    title.textContent = project.title;

    const folder = document.createElement('span');
    folder.className = 'project-folder';
    const fname = getFolderBasename(project.folderPath);
    folder.textContent = fname ? '📁 ' + fname : '';
    folder.title = project.folderPath || '';

    const info = document.createElement('div');
    info.className = 'project-info';
    info.appendChild(title);
    info.appendChild(folder);

    const addBtn = document.createElement('button');
    addBtn.className = 'project-add-btn';
    addBtn.textContent = '+';
    addBtn.title = '在此项目下新建对话';
    addBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await createConvInProject(project.id);
    });

    header.appendChild(toggle);
    header.appendChild(info);
    header.appendChild(addBtn);

    header.addEventListener('click', () => toggleProject(project.id));
    header.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      renameProjectInline(header, project);
    });
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showProjectContextMenu(e.clientX, e.clientY, project);
    });

    UI.convList.appendChild(header);

    // ── Conversations ──
    if (isExpanded) {
      for (const conv of convs) {
        renderConvItem(conv);
      }
    }
  }

  // ── Archived projects section ──
  if (archivedProjects.length > 0) {
    const archiveHeader = document.createElement('div');
    archiveHeader.className = 'archive-header';
    archiveHeader.textContent = '▶ 已归档 (' + archivedProjects.length + ')';
    let archivedExpanded = false;
    archiveHeader.addEventListener('click', () => {
      archivedExpanded = !archivedExpanded;
      const section = document.getElementById('archived-section');
      if (section) {
        if (archivedExpanded) {
          section.classList.remove('hidden');
          archiveHeader.textContent = '▼ 已归档 (' + archivedProjects.length + ')';
        } else {
          section.classList.add('hidden');
          archiveHeader.textContent = '▶ 已归档 (' + archivedProjects.length + ')';
        }
      }
    });
    UI.convList.appendChild(archiveHeader);

    const archiveSection = document.createElement('div');
    archiveSection.id = 'archived-section';
    archiveSection.className = 'archived-section hidden';

    for (const project of archivedProjects) {
      const convs = convsByProject[project.id] || [];
      const projExpanded = expandedProjects['archived_' + project.id] !== false;

      const header = document.createElement('div');
      header.className = 'project-header archived';
      header.dataset.projectId = project.id;

      const toggle = document.createElement('span');
      toggle.className = 'project-toggle';
      toggle.textContent = projExpanded ? '▼' : '▶';

      const title = document.createElement('span');
      title.className = 'project-title';
      title.textContent = project.title;

      const folder = document.createElement('span');
      folder.className = 'project-folder';
      const fname2 = getFolderBasename(project.folderPath);
      folder.textContent = fname2 ? '📁 ' + fname2 : '';
      folder.title = project.folderPath || '';

      const info2 = document.createElement('div');
      info2.className = 'project-info';
      info2.appendChild(title);
      info2.appendChild(folder);

      header.appendChild(toggle);
      header.appendChild(info2);

      header.addEventListener('click', () => {
        const key = 'archived_' + project.id;
        expandedProjects[key] = expandedProjects[key] !== false ? false : true;
        saveExpandedProjects();
        renderConvList();
      });
      header.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showProjectContextMenu(e.clientX, e.clientY, project);
      });

      archiveSection.appendChild(header);

      if (projExpanded) {
        for (const conv of convs) {
          renderConvItem(conv);
        }
      }
    }

    UI.convList.appendChild(archiveSection);
  }
}

function renderConvItem(conv) {
  const item = document.createElement('div');
  item.className = 'conv-item' + (conv.id === state.currentConvId ? ' active' : '');
  item.dataset.convId = conv.id;

  const infoDiv = document.createElement('div');
  infoDiv.className = 'conv-item-info';

  const titleSpan = document.createElement('div');
  titleSpan.className = 'conv-item-title';
  titleSpan.textContent = conv.title;

  infoDiv.appendChild(titleSpan);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'conv-del-btn';
  deleteBtn.textContent = '×';
  deleteBtn.title = '删除对话';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('确定删除对话 "' + conv.title + '"？（不会删除文件夹内容）')) return;
    await window.gisbuddy.deleteConversation(conv.id);
    state.conversations = state.conversations.filter(c => c.id !== conv.id);
    if (state.currentConvId === conv.id) {
      state.currentConvId = null;
      if (state.conversations.length > 0) {
        switchConversation(state.conversations[0].id);
      } else {
        showNoConversation();
      }
    }
    renderConvList();
  });

  item.appendChild(infoDiv);
  item.appendChild(deleteBtn);
  item.addEventListener('click', () => switchConversation(conv.id));

  item.addEventListener('dblclick', () => {
    const input = document.createElement('input');
    input.className = 'conv-rename-input';
    input.value = conv.title;
    input.addEventListener('blur', async () => {
      const newTitle = input.value.trim() || conv.title;
      await window.gisbuddy.renameConversation(conv.id, newTitle);
      conv.title = newTitle;
      renderConvList();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = conv.title; input.blur(); }
    });
    titleSpan.textContent = '';
    titleSpan.appendChild(input);
    input.focus();
    input.select();
  });

  // Context menu for conversation
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showConvContextMenu(e.clientX, e.clientY, conv);
  });

  UI.convList.appendChild(item);
  return item;
}

async function createProject() {
  const project = await window.gisbuddy.createProject();
  if (!project) return;
  state.projects.push(project);
  expandedProjects[project.id] = true;
  saveExpandedProjects();
  renderConvList();
}

function toggleProject(projectId) {
  expandedProjects[projectId] = expandedProjects[projectId] !== false ? false : true;
  saveExpandedProjects();
  renderConvList();
}

function saveExpandedProjects() {
  localStorage.setItem('gisbuddy_expanded_projects', JSON.stringify(expandedProjects));
}

async function createConvInProject(projectId) {
  try {
    const conv = await window.gisbuddy.createConversation(projectId);
    if (!conv) return;
    state.conversations.unshift({ id: conv.id, title: conv.title, projectId: conv.projectId });
    expandedProjects[projectId] = true;
    saveExpandedProjects();
    renderConvList();
    await switchConversation(conv.id);
  } catch (e) {
    console.error('创建对话失败:', e);
    addSystemMessage('创建对话失败: ' + e.message);
  }
}

function renameProjectInline(headerEl, project) {
  const titleEl = headerEl.querySelector('.project-title');
  if (!titleEl) return;
  const oldTitle = project.title;
  const input = document.createElement('input');
  input.className = 'conv-rename-input';
  input.value = oldTitle;
  titleEl.textContent = '';
  titleEl.appendChild(input);
  input.focus();
  input.select();
  input.addEventListener('blur', async () => {
    const newTitle = input.value.trim() || oldTitle;
    project.title = newTitle;
    await window.gisbuddy.renameProject(project.id, newTitle);
    renderConvList();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { project.title = oldTitle; renderConvList(); }
  });
}

function showProjectContextMenu(x, y, project) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  if (project.archived) {
    addCtxItem(menu, '恢复项目', () => unarchiveProject(project.id));
  } else {
    addCtxItem(menu, '归档项目', () => archiveProject(project.id));
    addCtxItem(menu, '重命名', () => {
      const header = document.querySelector('.project-header[data-project-id="' + project.id + '"]');
      if (header) renameProjectInline(header, project);
    });
  }

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', removeContextMenu, { once: true }), 0);
}

function showConvContextMenu(x, y, conv) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.id = 'ctx-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const projects = state.projects.filter(p => p.id !== conv.projectId);
  if (projects.length > 0) {
    const subLabel = document.createElement('div');
    subLabel.className = 'ctx-item ctx-label';
    subLabel.textContent = '移动到...';
    menu.appendChild(subLabel);
    for (const p of projects) {
      addCtxItem(menu, '  ' + p.title, () => moveConversationTo(conv.id, p.id));
    }
  }

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', removeContextMenu, { once: true }), 0);
}

function addCtxItem(menu, label, onClick) {
  const item = document.createElement('div');
  item.className = 'ctx-item';
  item.textContent = label;
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    removeContextMenu();
    onClick();
  });
  menu.appendChild(item);
}

function removeContextMenu() {
  const existing = document.getElementById('ctx-menu');
  if (existing) existing.remove();
}

async function moveConversationTo(convId, projectId) {
  await window.gisbuddy.moveConversation(convId, projectId);
  const conv = state.conversations.find(c => c.id === convId);
  if (conv) conv.projectId = projectId;
  renderConvList();
}

async function archiveProject(projectId) {
  if (!confirm('确定归档此项目？对话不会被删除。')) return;
  await window.gisbuddy.archiveProject(projectId);
  const project = state.projects.find(p => p.id === projectId);
  if (project) project.archived = true;
  renderConvList();
}

async function unarchiveProject(projectId) {
  await window.gisbuddy.unarchiveProject(projectId);
  const project = state.projects.find(p => p.id === projectId);
  if (project) project.archived = false;
  expandedProjects[projectId] = true;
  saveExpandedProjects();
  renderConvList();
}

function showNoConversation() {
  switchTab('chat');
  state.tabs = [{ id: 'chat', label: '💬 对话', closable: false }];
  state.activeTabId = 'chat';
  renderTabs();
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  UI.welcome.style.display = '';
  while (UI.chatContainer.children.length > 1) {
    const last = UI.chatContainer.lastElementChild;
    if (last && last !== UI.welcome) last.remove();
  }
  UI.input.disabled = true;
  UI.input.placeholder = '选择一个对话后开始...';
  UI.sendBtn.disabled = true;
  UI.fileList.innerHTML = '';
}

const FILE_ICONS = {
  '.tif': '🖼️', '.tiff': '🖼️', '.shp': '🗺️', '.geojson': '📋',
  '.json': '📋', '.gpkg': '🗄️', '.csv': '📊', '.xml': '📄',
  '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️',
};

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getFolderBasename(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
}

async function refreshFileList() {
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (!conv) { UI.fileList.innerHTML = ''; return; }
  if (!state.currentDir) {
    const project = state.projects.find(p => p.id === conv.projectId);
    if (project) state.currentDir = project.folderPath;
  }
  if (!state.currentDir) { UI.fileList.innerHTML = ''; return; }
  try {
    const entries = await window.gisbuddy.listDirectory(state.currentDir);
    renderFileList(entries);
  } catch {
    UI.fileList.innerHTML = '<div class="file-entry" style="color:var(--text-muted);padding:16px;text-align:center">无法读取目录</div>';
  }
}

function renderFileList(entries) {
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  const project = conv ? state.projects.find(p => p.id === conv.projectId) : null;
  const rootDir = project?.folderPath;
  const isRoot = state.currentDir === rootDir;

  let html = '';
  if (!isRoot) {
    html += '<div class="file-entry nav-up" data-nav-up="1"><span class="file-icon">⬆️</span><span class="file-name">..</span></div>';
  }
  for (const e of entries) {
    html += '<div class="file-entry' + (e.isDirectory ? ' folder' : '') + '" data-path="' + escAttr(e.path) + '">'
      + '<span class="file-icon">' + (e.isDirectory ? '📁' : (FILE_ICONS[e.ext] || '📄')) + '</span>'
      + '<span class="file-name">' + escHtml(e.name) + '</span>'
      + (e.isDirectory ? '' : '<span class="file-size">' + formatSize(e.size) + '</span>')
      + '</div>';
  }
  UI.fileList.innerHTML = html;

  UI.fileList.querySelectorAll('.file-entry.nav-up').forEach(el => {
    el.addEventListener('click', () => {
      state.currentDir = pathDirname(state.currentDir);
      refreshFileList();
    });
  });
  UI.fileList.querySelectorAll('.file-entry.folder').forEach(el => {
    el.addEventListener('click', () => {
      state.currentDir = el.dataset.path;
      refreshFileList();
    });
  });
  UI.fileList.querySelectorAll('.file-entry:not(.folder):not(.nav-up)').forEach(el => {
    el.addEventListener('click', () => {
      openFileTab(el.dataset.path);
    });
  });
}

function pathDirname(p) {
  const idx = p.lastIndexOf('/');
  if (idx <= 0) return '/';
  return p.slice(0, idx);
}

/* === Tabs === */
function initTabs() {
  state.tabs = [{ id: 'chat', label: '💬 对话', closable: false }];
  state.activeTabId = 'chat';
  renderTabs();
  showChatView();
}

function renderTabs() {
  UI.tabBar.innerHTML = state.tabs.map(t =>
    '<div class="tab-item' + (t.id === state.activeTabId ? ' active' : '') + '" data-tab-id="' + t.id + '">'
      + escHtml(t.label)
      + (t.closable ? '<span class="tab-close" data-tab-close="' + t.id + '">✕</span>' : '')
    + '</div>'
  ).join('');

  UI.tabBar.querySelectorAll('.tab-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.tabClose) return;
      switchTab(el.dataset.tabId);
    });
  });
  UI.tabBar.querySelectorAll('[data-tab-close]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(el.dataset.tabClose);
    });
  });
}

function switchTab(tabId) {
  if (tabId === state.activeTabId) return;
  state.activeTabId = tabId;
  renderTabs();
  if (tabId === 'chat') {
    showChatView();
  } else {
    showFileView(tabId);
  }
}

function showChatView() {
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  UI.chatContainer.classList.remove(C.HIDDEN);
  UI.fileView.classList.add(C.HIDDEN);
  UI.inputArea.classList.remove(C.HIDDEN);
  if (!state.currentConvId) {
    UI.input.disabled = true;
    UI.input.placeholder = '选择一个对话后开始...';
  } else {
    UI.input.disabled = false;
    UI.input.placeholder = '输入你的 GIS 数据处理需求...';
  }
  UI.sendBtn.disabled = !UI.input.value.trim() || state.isProcessing || !state.currentConvId;
}

function showFileView(filePath) {
  UI.chatContainer.classList.add('hidden');
  UI.inputArea.classList.add('hidden');
  UI.fileView.classList.remove('hidden');

  const cached = state.fileContents[filePath];
  if (cached) {
    renderFileInView(cached);
    return;
  }
  UI.fileView.innerHTML = '<div class="file-view-content" style="text-align:center;padding:48px;color:var(--text-muted)">加载中...</div>';
  loadFileContent(filePath);
}

async function loadFileContent(filePath) {
  try {
    const result = await window.gisbuddy.readFile(filePath);
    const keys = Object.keys(state.fileContents);
    if (keys.length >= MAX_FILE_CACHE) {
      delete state.fileContents[keys[0]];
    }
    state.fileContents[filePath] = result;
    if (state.activeTabId === filePath) {
      renderFileInView(result);
    }
  } catch (e) {
    const errResult = { type: 'error', message: '读取失败: ' + e.message };
    state.fileContents[filePath] = errResult;
    if (state.activeTabId === filePath) renderFileInView(errResult);
  }
}

let mapInstance = null;

function renderFileInView(data) {
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  if (data.type === 'text') {
    UI.fileView.classList.remove('map-active');
    UI.fileView.innerHTML = '<pre>' + escHtml(data.content) + '</pre>';
  } else if (data.type === 'image') {
    UI.fileView.classList.remove('map-active');
    UI.fileView.innerHTML = '<img src="' + data.content + '" alt="' + escAttr(data.name) + '">';
  } else if (data.type === 'geojson') {
    UI.fileView.classList.add('map-active');
    UI.fileView.innerHTML = '<div id="map"></div>';

    const map = L.map('map', { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const geojsonLayer = L.geoJSON(data.content, {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 6,
        fillColor: '#3388ff',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.8,
      }),
    }).addTo(map);

    if (geojsonLayer.getLayers().length === 0) {
      map.setView([0, 0], 2);
    } else {
      const bounds = geojsonLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      } else {
        map.setView([0, 0], 2);
      }
    }

    setTimeout(() => map.invalidateSize(), 0);
    mapInstance = map;
  } else {
    UI.fileView.classList.remove('map-active');
    UI.fileView.innerHTML = '<div class="file-view-error">' + escHtml(data.message) + '</div>';
  }
}

function openFileTab(filePath) {
  const exist = state.tabs.find(t => t.id === filePath);
  if (exist) {
    switchTab(filePath);
    return;
  }
  const name = filePath.split('/').pop() || filePath;
  state.tabs.push({ id: filePath, label: '📄 ' + name, closable: true });
  switchTab(filePath);
}

function closeTab(tabId) {
  if (tabId === 'chat') return;
  state.tabs = state.tabs.filter(t => t.id !== tabId);
  delete state.fileContents[tabId];
  if (mapInstance && state.activeTabId === tabId) { mapInstance.remove(); mapInstance = null; }
  if (state.activeTabId === tabId) {
    switchTab('chat');
  } else {
    renderTabs();
  }
}

async function switchConversation(convId) {
  console.log('[switchConversation] switching from', state.currentConvId, 'to', convId);

  // ★ 停止旧对话的 IPC 事件监听，防止交叉污染
  if (state.cleanupListener) {
    console.log('[switchConversation] removing old agent listener');
    state.cleanupListener();
    state.cleanupListener = null;
  }
  // ★ 通知主进程中止旧对话的后台处理（仅在有进行中的请求时）
  if (state.currentConvId && state.isProcessing) {
    window.gisbuddy.cancelChat(state.currentConvId).catch(() => {});
  }

  // ★ 重置流式渲染状态
  streamThinkingEl = null;
  streamTextEl = null;
  currentToolEl = null;

  // ★ 标记不再处理中（旧对话的 sendMessage 在 finally 也会重置，但先做更安全）
  state.isProcessing = false;

  state.currentConvId = convId;

  switchTab('chat');

  while (UI.chatContainer.children.length > 1) {
    const last = UI.chatContainer.lastElementChild;
    if (last && last !== UI.welcome) last.remove();
  }

  UI.welcome.style.display = '';
  UI.input.disabled = false;
  UI.input.placeholder = '输入你的 GIS 数据处理需求...';
  UI.input.focus();

  const conv = state.conversations.find(c => c.id === convId);
  if (conv) {
    const project = state.projects.find(p => p.id === conv.projectId);
    if (project && project.folderPath) {
      state.currentDir = project.folderPath;
      refreshFileList();
    } else {
      state.currentDir = null;
      UI.fileList.innerHTML = '';
    }
  }

  const messages = await window.gisbuddy.getMessages(convId);
  if (messages.length > 0) {
    UI.welcome.style.display = 'none';
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'user') {
        addUserMessage(getTextContent(msg));
      } else if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'thinking' && block.thinking) {
              addThinkingBlock(block.thinking);
            } else if (block.type === 'text' && block.text) {
              addAiMessage(block.text);
            } else if (block.type === 'toolCall') {
              let args = {};
              try { args = JSON.parse(block.function?.arguments || '{}'); } catch { /* ignore */ }
              const nextMsg = messages[i + 1];
              const hasResult = nextMsg?.role === 'toolResult' && nextMsg.toolCallId === block.id;
              const isError = hasResult ? !!nextMsg.isError : false;
              const output = hasResult ? getTextContent(nextMsg) : '';
              addToolCall(block.function?.name || 'unknown', args, { success: !isError, output });
              if (hasResult) i++;
            }
          }
        } else if (typeof msg.content === 'string') {
          addAiMessage(msg.content);
        }
      }
    }
  }

  renderConvList();
}

async function sendMessage() {
  const text = UI.input.value.trim();
  if (!text || state.isProcessing || !state.currentConvId) return;

  const myConvId = state.currentConvId;
  console.log('[sendMessage] conv=' + myConvId + ' text=' + text.slice(0, 50));

  UI.input.value = '';
  UI.sendBtn.disabled = true;
  autoResize(UI.input);
  state.isProcessing = true;

  UI.welcome.style.display = 'none';
  addUserMessage(text);

  try {
    if (state.cleanupListener) state.cleanupListener();
    state.cleanupListener = window.gisbuddy.onAgentEvent(handleAgentEvent);

    const result = await window.gisbuddy.chat(myConvId, text);

    console.log('[sendMessage] chat finished, updatedTitle:', result?.updatedTitle);

    // 同步项目状态（发消息可能触发自动取消归档）
    state.projects = await window.gisbuddy.getProjects();

    if (result.updatedTitle !== undefined && state.currentConvId === myConvId) {
      const conv = state.conversations.find(c => c.id === myConvId);
      if (conv && conv.title !== result.updatedTitle) {
        conv.title = result.updatedTitle;
        renderConvList();
      }
    }
  } catch (err) {
    if (state.currentConvId === myConvId) {
      if (err.message && err.message.includes('API Key')) {
        addSystemMessage('请先在左下角 ⚙️ 设置中配置 DeepSeek API Key');
        showSettings();
      } else {
        addSystemMessage('错误: ' + err.message);
      }
    } else {
      console.warn('[sendMessage] error on abandoned conv:', myConvId, err);
    }
  } finally {
    if (state.currentConvId === myConvId) {
      state.isProcessing = false;
      UI.sendBtn.disabled = !UI.input.value.trim();
    }
  }
}

let streamThinkingEl = null;
let streamTextEl = null;

function getTextContent(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');
  }
  return String(msg.content || '');
}

function handleAgentEvent(event) {
  if (!state.isProcessing) {
    console.log('[agent-event] IGNORED (not processing):', event.type);
    return;
  }

  console.log('[agent-event]', event.type,
    event.toolName || (event.assistantMessageEvent?.delta?.length > 50
      ? event.assistantMessageEvent.delta.slice(0, 50) + '...'
      : ''));

  switch (event.type) {
    case 'message_start':
      if (event.message?.role === 'assistant') {
        streamThinkingEl = null;
        streamTextEl = null;
      }
      break;

    case 'message_update': {
      const ame = event.assistantMessageEvent;
      if (!ame) break;

      if (ame.type === 'thinking_delta') {
        if (!streamThinkingEl) {
          const el = document.createElement('div');
          el.className = C.THINKING_BLOCK;
          el.innerHTML = '<div class="' + C.THINKING_CONTENT + '"></div>';
          UI.chatContainer.appendChild(el);
          streamThinkingEl = el.querySelector('.' + C.THINKING_CONTENT);
          scrollToBottom();
        }
        streamThinkingEl.textContent += ame.delta;
        scrollToBottom();
      } else if (ame.type === 'text_delta') {
        if (!streamTextEl) {
          const div = document.createElement('div');
          div.className = C.MESSAGE + ' ' + C.AI;
          div.innerHTML = '<div class="' + C.BUBBLE + '"></div>';
          UI.chatContainer.appendChild(div);
          streamTextEl = div.querySelector('.' + C.BUBBLE);
          scrollToBottom();
        }
        streamTextEl.textContent += ame.delta;
        scrollToBottom();
      }
      break;
    }

    case 'message_end':
      if (event.message?.role === 'assistant') {
        if (streamTextEl) {
          const text = streamTextEl.textContent || getTextContent(event.message);
          let rendered;
          try {
            rendered = marked.parse(text, { breaks: true });
          } catch {
            rendered = escHtml(text).replace(/\n/g, '<br>');
          }
          streamTextEl.innerHTML = rendered;
        } else {
          const text = getTextContent(event.message);
          if (text) {
            addAiMessage(text);
          }
        }
        if (event.message.errorMessage) {
          addSystemMessage('错误: ' + event.message.errorMessage);
        }
      }
      streamThinkingEl = null;
      streamTextEl = null;
      break;

    case 'tool_execution_start':
      console.log('[agent-event] tool_execution_start:', event.toolName);
      streamThinkingEl = null;
      streamTextEl = null;
      addToolCall(event.toolName, event.args);
      break;

    case 'tool_execution_end':
      console.log('[agent-event] tool_execution_end:', event.toolName, !event.isError);
      updateToolResult(event.toolName, event.isError, getTextContent({ content: event.result?.content }));
      refreshFileList();
      break;

    case 'turn_end':
      streamThinkingEl = null;
      streamTextEl = null;
      break;

    case 'agent_end':
      streamThinkingEl = null;
      streamTextEl = null;
      break;
  }
}

let currentToolEl = null;

function addToolCall(name, args, result = null) {
  const card = document.createElement('div');
  card.className = C.TOOL_CALL + (result ? (result.success ? C.SUCCESS : C.ERROR) : '');
  card.dataset.toolName = name;

  const header = document.createElement('div');
  header.className = C.TOOL_CALL_HEADER;

  const icon = document.createElement('span');
  icon.className = C.TOOL_CALL_ICON;
  icon.textContent = '🔧';

  const nameEl = document.createElement('span');
  nameEl.className = C.TOOL_CALL_NAME;
  nameEl.textContent = name;

  const summary = document.createElement('span');
  summary.className = C.TOOL_CALL_SUMMARY;
  if (name === 'bash' && args.command) {
    summary.textContent = args.command;
  } else if (args && args.path) {
    summary.textContent = args.path;
  } else if (args && (args.content || Object.keys(args).length > 0)) {
    const s = args.content || JSON.stringify(args);
    summary.textContent = s.length > 60 ? s.slice(0, 60) + '...' : s;
  }

  const status = document.createElement('span');
  status.className = C.TOOL_CALL_STATUS;
  if (result) {
    status.textContent = result.success ? '✓' : '✗';
  }

  const toggle = document.createElement('span');
  toggle.className = C.TOOL_CALL_TOGGLE;
  toggle.textContent = '▶';

  header.appendChild(icon);
  header.appendChild(nameEl);
  header.appendChild(summary);
  header.appendChild(status);
  header.appendChild(toggle);

  const body = document.createElement('div');
  body.className = C.TOOL_CALL_BODY + ' ' + C.HIDDEN;

  const cmdLine = document.createElement('div');
  cmdLine.className = C.TOOL_CALL_COMMAND;
  if (name === 'bash' && args.command) {
    cmdLine.textContent = '$ ' + args.command;
  } else {
    cmdLine.textContent = JSON.stringify(args, null, 2);
  }
  body.appendChild(cmdLine);

  const outputEl = document.createElement('div');
  outputEl.className = C.TOOL_CALL_OUTPUT;
  if (result && result.output) {
    outputEl.textContent = result.output;
    if (isToolErrorOutput(result.output, result.success)) {
      outputEl.className = C.TOOL_CALL_ERROR;
    }
  }
  body.appendChild(outputEl);

  header.addEventListener('click', () => {
    const hidden = body.classList.toggle(C.HIDDEN);
    toggle.textContent = hidden ? '▶' : '▼';
  });

  card.appendChild(header);
  card.appendChild(body);
  UI.chatContainer.appendChild(card);
  scrollToBottom();

  if (!result) {
    currentToolEl = card;
  }
}

function updateToolResult(name, isError, output) {
  if (currentToolEl && currentToolEl.dataset.toolName === name) {
    currentToolEl.className = C.TOOL_CALL + (isError ? C.ERROR : C.SUCCESS);

    const statusEl = currentToolEl.querySelector('.' + C.TOOL_CALL_STATUS);
    statusEl.textContent = isError ? '✗' : '✓';

    const outputEl = currentToolEl.querySelector('.' + C.TOOL_CALL_OUTPUT);
    if (output) {
      outputEl.className = isError ? C.TOOL_CALL_ERROR : C.TOOL_CALL_OUTPUT;
      outputEl.textContent = output;
    }

    scrollToBottom();
  }
}

function addThinkingBlock(content) {
  const el = document.createElement('div');
  el.className = C.THINKING_BLOCK;
  el.innerHTML = '<div class="' + C.THINKING_CONTENT + '">' + escHtml(content) + '</div>';
  UI.chatContainer.appendChild(el);
  scrollToBottom();
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = C.MESSAGE + ' ' + C.USER;
  div.innerHTML = '<div class="' + C.BUBBLE + '">' + escHtml(text) + '</div>';
  UI.chatContainer.appendChild(div);
  scrollToBottom();
}

function addAiMessage(html) {
  const div = document.createElement('div');
  div.className = C.MESSAGE + ' ' + C.AI;

  let rendered;
  try {
    rendered = marked.parse(html, { breaks: true });
  } catch {
    rendered = escHtml(html).replace(/\n/g, '<br>');
  }

  div.innerHTML = '<div class="' + C.BUBBLE + '">' + rendered + '</div>';
  UI.chatContainer.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = C.MESSAGE + ' ' + C.SYSTEM;
  div.innerHTML = '<div class="' + C.BUBBLE + '">' + escHtml(text) + '</div>';
  UI.chatContainer.appendChild(div);
  scrollToBottom();
}

let scrollPending = false;
function scrollToBottom() {
  if (scrollPending) return;
  scrollPending = true;
  requestAnimationFrame(() => {
    UI.chatContainer.scrollTop = UI.chatContainer.scrollHeight;
    scrollPending = false;
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// 启动
(async () => {
  loadProfile();
  const savedKey = localStorage.getItem('gisbuddy_api_key');
  if (savedKey) {
    try {
      await window.gisbuddy.configure(savedKey);
    } catch {
      localStorage.removeItem('gisbuddy_api_key');
    }
  }
  initTabs();
  await loadConversations();
  UI.input.focus();
})();
