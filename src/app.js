const DEFAULT_AVATAR = '🌍';
const AVATARS = ['🌍','🌎','🌏','🗺️','🏔️','🏖️','🏙️','🌄','🌅','🗾','🏝️','🌋','🏞️','🌲','🌸','🦅','🐉','🐼','🦊','🐬'];

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
  fileRefreshBtn: document.getElementById('file-refresh-btn'),
  tabBar: document.getElementById('tab-bar'),
  fileView: document.getElementById('file-view'),
  inputArea: document.querySelector('.input-area'),
};

let userProfile = { username: '用户', avatar: DEFAULT_AVATAR };
let selectedAvatar = DEFAULT_AVATAR;

let state = {
  conversations: [],
  currentConvId: null,
  isProcessing: false,
  cleanupListener: null,
  currentDir: null,
  tabs: [],
  activeTabId: null,
  fileContents: {},
};

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

UI.newConvBtn.addEventListener('click', async () => {
  const conv = await window.gisbuddy.createConversation();
  if (!conv) return;
  state.conversations.unshift({ id: conv.id, title: conv.title, folderPath: conv.folderPath });
  renderConvList();
  switchConversation(conv.id);
});


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
  state.conversations = await window.gisbuddy.getConversations();
  renderConvList();

  if (state.conversations.length > 0) {
    switchConversation(state.conversations[0].id);
  }
}

function renderConvList() {
  UI.convList.innerHTML = '';

  if (state.conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'conv-empty';
    empty.textContent = '暂无对话';
    UI.convList.appendChild(empty);
    return;
  }

  for (const conv of state.conversations) {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === state.currentConvId ? ' active' : '');
    item.dataset.convId = conv.id;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'conv-item-info';

    const titleSpan = document.createElement('div');
    titleSpan.className = 'conv-item-title';
    titleSpan.textContent = conv.title;

    const folderSpan = document.createElement('div');
    folderSpan.className = 'conv-item-folder';
    folderSpan.textContent = '📁 ' + conv.folderPath;

    infoDiv.appendChild(titleSpan);
    infoDiv.appendChild(folderSpan);

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

    UI.convList.appendChild(item);
  }
}

function showNoConversation() {
  switchTab('chat');
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

async function refreshFileList() {
  const conv = state.conversations.find(c => c.id === state.currentConvId);
  if (!conv) { UI.fileList.innerHTML = ''; return; }
  if (!state.currentDir) state.currentDir = conv.folderPath;
  try {
    const entries = await window.gisbuddy.listDirectory(state.currentDir);
    renderFileList(entries);
  } catch {
    UI.fileList.innerHTML = '<div class="file-entry" style="color:var(--text-muted);padding:16px;text-align:center">无法读取目录</div>';
  }
}

function renderFileList(entries) {
  const rootDir = state.conversations.find(c => c.id === state.currentConvId)?.folderPath;
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

UI.fileRefreshBtn.addEventListener('click', refreshFileList);

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
  UI.chatContainer.classList.remove('hidden');
  UI.fileView.classList.add('hidden');
  UI.inputArea.classList.remove('hidden');
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
  if (data.type === 'text') {
    UI.fileView.classList.remove('map-active');
    UI.fileView.innerHTML = '<pre>' + escHtml(data.content) + '</pre>';
  } else if (data.type === 'image') {
    UI.fileView.classList.remove('map-active');
    UI.fileView.innerHTML = '<img src="' + data.content + '" alt="' + escAttr(data.name) + '">';
  } else if (data.type === 'geojson') {
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
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
  if (state.activeTabId === tabId) {
    switchTab('chat');
  } else {
    renderTabs();
  }
}

async function switchConversation(convId) {
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
    state.currentDir = conv.folderPath;
    refreshFileList();
  }

  const messages = await window.gisbuddy.getMessages(convId);
  if (messages.length > 0) {
    UI.welcome.style.display = 'none';
    for (const msg of messages) {
      if (msg.role === 'user') {
        addUserMessage(msg.content);
      } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
        addAiMessage(msg.content);
      }
    }
  }

  renderConvList();
}

async function sendMessage() {
  const text = UI.input.value.trim();
  if (!text || state.isProcessing || !state.currentConvId) return;

  UI.input.value = '';
  UI.sendBtn.disabled = true;
  autoResize(UI.input);
  state.isProcessing = true;

  UI.welcome.style.display = 'none';
  addUserMessage(text);

  try {
    if (state.cleanupListener) state.cleanupListener();
    state.cleanupListener = window.gisbuddy.onAgentEvent(handleAgentEvent);

    const result = await window.gisbuddy.chat(state.currentConvId, text);

    if (result.updatedTitle !== undefined) {
      const conv = state.conversations.find(c => c.id === state.currentConvId);
      if (conv && conv.title !== result.updatedTitle) {
        conv.title = result.updatedTitle;
        renderConvList();
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('API Key')) {
      addSystemMessage('请先在左下角 ⚙️ 设置中配置 DeepSeek API Key');
      showSettings();
    } else {
      addSystemMessage('错误: ' + err.message);
    }
  } finally {
    state.isProcessing = false;
    UI.sendBtn.disabled = !UI.input.value.trim();
  }
}

let streamThinkingEl = null;
let streamTextEl = null;

function handleAgentEvent(event) {
  switch (event.type) {
    case 'status':
      break;
    case 'thinking':
      if (!streamThinkingEl) {
        const el = document.createElement('div');
        el.className = 'thinking-block';
        el.innerHTML = '<div class="thinking-header">🧠 思考过程</div><div class="thinking-body"></div>';
        const insertBefore = streamTextEl || UI.chatContainer.lastChild;
        if (insertBefore && insertBefore !== UI.welcome) {
          UI.chatContainer.insertBefore(el, insertBefore.nextSibling);
        } else {
          UI.chatContainer.appendChild(el);
        }
        streamThinkingEl = el.querySelector('.thinking-body');
        scrollToBottom();
      }
      streamThinkingEl.textContent += event.data;
      scrollToBottom();
      break;
    case 'text_delta':
      if (!streamTextEl) {
        const div = document.createElement('div');
        div.className = 'message ai';
        div.innerHTML = '<div class="bubble"></div>';
        UI.chatContainer.appendChild(div);
        streamTextEl = div.querySelector('.bubble');
        scrollToBottom();
      }
      streamTextEl.textContent += event.data;
      scrollToBottom();
      break;
    case 'tool_start':
      streamThinkingEl = null;
      streamTextEl = null;
      addToolCall(event.data.name, event.data.args);
      break;
    case 'tool_result':
      updateToolResult(event.data.name, event.data.success, event.data.output);
      refreshFileList();
      break;
    case 'text':
      streamThinkingEl = null;
      streamTextEl = null;
      addAiMessage(event.data);
      break;
    case 'error':
      streamThinkingEl = null;
      streamTextEl = null;
      addSystemMessage('错误: ' + event.data);
      break;
  }
}

let currentToolEl = null;

function addToolCall(name, args) {
  const card = document.createElement('div');
  card.className = 'tool-call';
  card.dataset.toolName = name;

  const header = document.createElement('div');
  header.className = 'tool-call-header';

  const icon = document.createElement('span');
  icon.className = 'tool-call-icon';
  icon.textContent = '🔧';

  const nameEl = document.createElement('span');
  nameEl.className = 'tool-call-name';
  nameEl.textContent = name;

  const summary = document.createElement('span');
  summary.className = 'tool-call-summary';
  if (name === 'bash' && args.command) {
    summary.textContent = args.command;
  } else if (args && args.path) {
    summary.textContent = args.path;
  } else if (args && args.content) {
    const s = args.content;
    summary.textContent = s.length > 60 ? s.slice(0, 60) + '...' : s;
  }

  const status = document.createElement('span');
  status.className = 'tool-call-status';

  const toggle = document.createElement('span');
  toggle.className = 'tool-call-toggle';
  toggle.textContent = '▶';

  header.appendChild(icon);
  header.appendChild(nameEl);
  header.appendChild(summary);
  header.appendChild(status);
  header.appendChild(toggle);

  const body = document.createElement('div');
  body.className = 'tool-call-body hidden';

  const cmdLine = document.createElement('div');
  cmdLine.className = 'tool-call-command';
  if (name === 'bash' && args.command) {
    cmdLine.textContent = '$ ' + args.command;
  } else {
    cmdLine.textContent = JSON.stringify(args, null, 2);
  }
  body.appendChild(cmdLine);

  const output = document.createElement('div');
  output.className = 'tool-call-output';
  body.appendChild(output);

  header.addEventListener('click', () => {
    const hidden = body.classList.toggle('hidden');
    toggle.textContent = hidden ? '▶' : '▼';
  });

  card.appendChild(header);
  card.appendChild(body);
  UI.chatContainer.appendChild(card);
  scrollToBottom();
  currentToolEl = card;
}

function updateToolResult(name, success, output) {
  if (currentToolEl && currentToolEl.dataset.toolName === name) {
    currentToolEl.className = 'tool-call' + (success ? ' success' : ' error');

    const statusEl = currentToolEl.querySelector('.tool-call-status');
    statusEl.textContent = success ? '✓' : '✗';

    const outputEl = currentToolEl.querySelector('.tool-call-output');
    if (output) {
      const isError = !success && output.startsWith('错误:');
      if (isError) {
        outputEl.className = 'tool-call-output tool-call-error';
        outputEl.textContent = output;
      } else {
        outputEl.className = 'tool-call-output';
        outputEl.textContent = output;
      }
    }

    scrollToBottom();
  }
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = '<div class="bubble">' + escHtml(text) + '</div>';
  UI.chatContainer.appendChild(div);
  scrollToBottom();
}

function addAiMessage(html) {
  const div = document.createElement('div');
  div.className = 'message ai';

  let rendered;
  try {
    rendered = marked.parse(html, { breaks: true });
  } catch {
    rendered = escHtml(html).replace(/\n/g, '<br>');
  }

  div.innerHTML = '<div class="bubble">' + rendered + '</div>';
  UI.chatContainer.appendChild(div);
  scrollToBottom();
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message system';
  div.innerHTML = '<div class="bubble">' + escHtml(text) + '</div>';
  UI.chatContainer.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    UI.chatContainer.scrollTop = UI.chatContainer.scrollHeight;
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
