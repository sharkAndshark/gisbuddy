const UI = {
  configOverlay: document.getElementById('config-overlay'),
  app: document.getElementById('app'),
  sidebar: document.querySelector('.sidebar'),
  convList: document.getElementById('conv-list'),
  newConvBtn: document.getElementById('new-conv-btn'),
  chatContainer: document.getElementById('chat-container'),
  input: document.getElementById('input'),
  sendBtn: document.getElementById('send-btn'),
  welcome: document.getElementById('welcome'),
  convTitle: document.getElementById('conv-title'),
  convFolderBadge: document.getElementById('conv-folder-badge'),

  apiKeyInput: document.getElementById('api-key'),
  saveKeyBtn: document.getElementById('save-key'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsKeyInput: document.getElementById('settings-api-key'),
  settingsSave: document.getElementById('settings-save'),
  settingsCancel: document.getElementById('settings-cancel'),
  settingsClose: document.getElementById('settings-close'),
};

let state = {
  conversations: [],
  currentConvId: null,
  isProcessing: false,
  cleanupListener: null,
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

UI.saveKeyBtn.addEventListener('click', initApp);

UI.apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') initApp();
});

async function initApp() {
  const key = UI.apiKeyInput.value.trim();
  if (!key) return;

  UI.saveKeyBtn.disabled = true;
  UI.saveKeyBtn.textContent = '验证中...';

  try {
    await window.gisbuddy.configure(key);
    UI.configOverlay.classList.add('hidden');
    UI.app.classList.remove('hidden');
    localStorage.setItem('gisbuddy_api_key', key);
    await loadConversations();
  } catch (err) {
    alert('配置失败: ' + err.message);
  } finally {
    UI.saveKeyBtn.disabled = false;
    UI.saveKeyBtn.textContent = '开始使用';
  }
}

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
    UI.apiKeyInput.value = key;
    UI.settingsModal.classList.add('hidden');
  } catch (err) {
    alert('配置失败: ' + err.message);
  } finally {
    UI.settingsSave.disabled = false;
    UI.settingsSave.textContent = '保存';
  }
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

    const titleSpan = document.createElement('span');
    titleSpan.className = 'conv-item-title';
    titleSpan.textContent = conv.title;

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

    item.appendChild(titleSpan);
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
        if (state.currentConvId === conv.id) {
          UI.convTitle.textContent = newTitle;
        }
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
  UI.welcome.style.display = '';
  while (UI.chatContainer.children.length > 1) {
    const last = UI.chatContainer.lastElementChild;
    if (last && last !== UI.welcome) last.remove();
  }
  UI.convTitle.textContent = 'GISBuddy';
  UI.convFolderBadge.classList.add('hidden');
  UI.input.disabled = true;
  UI.input.placeholder = '选择一个对话后开始...';
  UI.sendBtn.disabled = true;
}

async function switchConversation(convId) {
  state.currentConvId = convId;

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
    UI.convTitle.textContent = conv.title;
    UI.convFolderBadge.textContent = '📁 ' + conv.folderPath;
    UI.convFolderBadge.classList.remove('hidden');
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
        UI.convTitle.textContent = result.updatedTitle;
        renderConvList();
      }
    }
  } catch (err) {
    addSystemMessage('错误: ' + err.message);
  } finally {
    state.isProcessing = false;
    UI.sendBtn.disabled = !UI.input.value.trim();
  }
}

function handleAgentEvent(event) {
  switch (event.type) {
    case 'status':
      break;
    case 'tool_start':
      addToolCall(event.data.name, event.data.args);
      break;
    case 'tool_result':
      updateToolResult(event.data.name, event.data.success);
      break;
    case 'text':
      addAiMessage(event.data);
      break;
    case 'error':
      addSystemMessage('错误: ' + event.data);
      break;
  }
}

let currentToolEl = null;

function addToolCall(name, args) {
  const el = document.createElement('div');
  el.className = 'tool-call';
  el.dataset.toolName = name;
  el.textContent = '🔧 ' + name;
  UI.chatContainer.appendChild(el);
  scrollToBottom();
  currentToolEl = el;
}

function updateToolResult(name, success) {
  if (currentToolEl && currentToolEl.dataset.toolName === name) {
    currentToolEl.textContent = '🔧 ' + name + '  ' + (success ? '✓' : '✗');
    currentToolEl.className = 'tool-call ' + (success ? 'success' : 'error');
    scrollToBottom();
  }
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = '<div class="avatar">👤</div><div class="bubble">' + escHtml(text) + '</div>';
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

  div.innerHTML = '<div class="avatar">🤖</div><div class="bubble">' + rendered + '</div>';
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

const observer = new MutationObserver(() => {
  if (!UI.app.classList.contains('hidden') && state.currentConvId) {
    UI.input.focus();
  }
});
observer.observe(UI.app, { attributes: true, attributeFilter: ['class'] });

const savedKey = localStorage.getItem('gisbuddy_api_key');
if (savedKey) {
  UI.apiKeyInput.value = savedKey;
}
