<template>
  <div class="panel">
    <!-- Status bar -->
    <div class="status-bar">
      <span
        :class="[
          'dot',
          bridgeState.connected ? (bridgeState.paused ? 'dot-pause' : 'dot-ok') : 'dot-bad',
        ]"
      ></span>
      <span class="status-label">{{
        bridgeState.connected ? (bridgeState.paused ? 'Paused' : 'Connected') : 'Disconnected'
      }}</span>
      <span class="server-url" :title="bridgeState.serverUrl">{{ bridgeState.serverUrl }}</span>
      <button
        :class="['btn-pause', bridgeState.paused ? 'btn-pause--resume' : '']"
        @click="togglePause"
      >
        {{ bridgeState.paused ? '▶ Resume' : '⏸ Pause' }}
      </button>
      <button class="btn-reconnect" @click="reconnect">Reconnect</button>
    </div>

    <!-- Pending approval cards -->
    <div v-for="approval in bridgeState.pending" :key="approval.id" class="approval-card">
      <div class="approval-header">
        <strong class="tool-name">{{ approval.name }}</strong>
        <span class="countdown">{{ countdown(approval.expiresAt) }}s</span>
      </div>
      <div class="approval-desc">{{ describe(approval.name, approval.args) }}</div>
      <div class="approval-url">{{ approval.currentUrl || 'Unknown page' }}</div>
      <pre class="approval-args">{{ pretty(approval.args) }}</pre>
      <div class="approval-actions">
        <button class="btn-approve" @click="approve(approval.id)">Approve</button>
        <button class="btn-deny" @click="deny(approval.id)">Deny</button>
      </div>
    </div>

    <!-- Action history -->
    <div v-if="bridgeState.history.length" class="section">
      <div class="section-title">Recent actions</div>
      <div v-for="item in bridgeState.history" :key="item.id" class="history-row">
        <span class="h-name">{{ item.name }}</span>
        <span :class="['h-status', 'h-status--' + item.status]">{{ item.status }}</span>
        <span class="h-time">{{ formatTime(item.timestamp) }}</span>
      </div>
    </div>

    <!-- Settings -->
    <details class="section settings-details">
      <summary class="section-title">Settings</summary>
      <div class="settings-body">
        <label class="field-label">
          Server URL
          <input
            class="field-input"
            v-model="settings.serverUrl"
            placeholder="ws://127.0.0.1:12306"
          />
        </label>
        <label class="field-label">
          Token
          <input
            class="field-input"
            type="password"
            v-model="settings.token"
            placeholder="Bearer token"
          />
        </label>
        <label class="field-check">
          <input type="checkbox" v-model="settings.autoConnect" />
          Auto-connect on startup
        </label>
        <div class="settings-row">
          <button class="btn-save" @click="saveSettings" :disabled="saving">Save</button>
          <span v-if="savedMsg" class="saved-msg">{{ savedMsg }}</span>
        </div>

        <!-- Trusted domains -->
        <div v-if="bridgeState.trustedDomains.length" class="trusted-section">
          <div class="trusted-title">Trusted domains (auto-approve)</div>
          <div v-for="domain in bridgeState.trustedDomains" :key="domain" class="trusted-row">
            <span class="trusted-domain">{{ domain }}</span>
            <button class="btn-remove" @click="removeTrustedDomain(domain)">Remove</button>
          </div>
        </div>
      </div>
    </details>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { BRIDGE_SERVER, STORAGE_KEYS } from '@/common/constants';

const now = ref(Date.now());
const saving = ref(false);
const savedMsg = ref('');

const bridgeState = ref<{
  connected: boolean;
  paused: boolean;
  serverUrl: string;
  pending: Array<{
    id: string;
    name: string;
    args: any;
    currentUrl: string;
    expiresAt: number;
  }>;
  history: Array<{
    id: string;
    name: string;
    status: string;
    timestamp: number;
  }>;
  trustedDomains: string[];
}>({
  connected: false,
  paused: false,
  serverUrl: '',
  pending: [],
  history: [],
  trustedDomains: [],
});

const settings = ref<{ serverUrl: string; token: string; autoConnect: boolean }>({
  serverUrl: BRIDGE_SERVER.DEFAULT_URL,
  token: '',
  autoConnect: true,
});

function pretty(value: any) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

const TOOL_LABELS: Record<string, string> = {
  chrome_click_element: 'Click element',
  chrome_fill_or_select: 'Fill / select field',
  chrome_keyboard: 'Keyboard input',
  chrome_javascript: 'Execute JavaScript',
  chrome_navigate: 'Navigate browser',
  chrome_close_tabs: 'Close tab(s)',
  chrome_handle_dialog: 'Handle dialog',
  chrome_computer: 'Mouse / keyboard action',
  chrome_screenshot: 'Take screenshot',
  chrome_read_page: 'Read page accessibility tree',
  chrome_network_request: 'Send network request',
  chrome_upload_file: 'Upload file',
  chrome_find: 'Find element',
  chrome_switch_tab: 'Switch tab',
  chrome_get_web_content: 'Fetch web content',
};

function describe(name: string, args: any): string {
  switch (name) {
    case 'chrome_navigate': {
      if (args?.refresh) return 'Refresh current page';
      if (args?.direction) return `Navigate ${args.direction}`;
      const url = String(args?.url || '');
      return url ? (url.length > 70 ? url.slice(0, 70) + '…' : url) : 'Navigate to URL';
    }
    case 'chrome_click_element': {
      const target = args?.ref || args?.selector || args?.description || '';
      return target ? `Click: ${String(target).slice(0, 60)}` : 'Click element';
    }
    case 'chrome_fill_or_select': {
      const val = String(args?.value ?? '');
      const target = args?.ref || args?.selector || 'field';
      return `Fill "${val.slice(0, 40)}"  →  ${String(target).slice(0, 40)}`;
    }
    case 'chrome_keyboard': {
      const keys = args?.key;
      if (Array.isArray(keys)) return `Press: ${keys.join(' + ')}`;
      return keys ? `Press: ${String(keys).slice(0, 40)}` : 'Keyboard input';
    }
    case 'chrome_javascript': {
      const code = String(args?.code ?? '')
        .trim()
        .replace(/\s+/g, ' ');
      return code.length > 80 ? code.slice(0, 80) + '…' : code || 'Execute JS';
    }
    case 'chrome_close_tabs': {
      const ids = args?.tabIds;
      return Array.isArray(ids) ? `Close ${ids.length} tab(s)` : 'Close tab(s)';
    }
    case 'chrome_handle_dialog': {
      const action = args?.action || '';
      const text = args?.text ? ` "${String(args.text).slice(0, 30)}"` : '';
      return action ? `${action} dialog${text}` : 'Handle dialog';
    }
    case 'chrome_computer': {
      const action = String(args?.action || '');
      const coord = Array.isArray(args?.coordinate)
        ? ` at (${args.coordinate[0]}, ${args.coordinate[1]})`
        : '';
      const text = args?.text ? ` "${String(args.text).slice(0, 30)}"` : '';
      return action ? `${action}${coord}${text}` : 'Browser interaction';
    }
    default:
      return TOOL_LABELS[name] || '';
  }
}

function countdown(expiresAt: number) {
  return Math.max(0, Math.ceil((expiresAt - now.value) / 1000));
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

async function loadBridgeState() {
  const res: any = await chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.GET_BRIDGE_STATUS,
  });
  if (res?.success && res.state) {
    bridgeState.value = { trustedDomains: [], paused: false, ...res.state };
  }
}

async function loadSettings() {
  const values = await chrome.storage.sync.get([
    STORAGE_KEYS.BRIDGE_SERVER_URL,
    STORAGE_KEYS.BRIDGE_TOKEN,
    STORAGE_KEYS.BRIDGE_AUTO_CONNECT,
  ]);
  settings.value.serverUrl = String(
    values[STORAGE_KEYS.BRIDGE_SERVER_URL] || BRIDGE_SERVER.DEFAULT_URL,
  );
  settings.value.token = String(values[STORAGE_KEYS.BRIDGE_TOKEN] || '');
  settings.value.autoConnect = values[STORAGE_KEYS.BRIDGE_AUTO_CONNECT] !== false;
}

async function saveSettings() {
  saving.value = true;
  savedMsg.value = '';
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.BRIDGE_SERVER_URL]:
        settings.value.serverUrl.trim() || BRIDGE_SERVER.DEFAULT_URL,
      [STORAGE_KEYS.BRIDGE_TOKEN]: settings.value.token.trim(),
      [STORAGE_KEYS.BRIDGE_AUTO_CONNECT]: settings.value.autoConnect,
    });
    savedMsg.value = 'Saved';
    setTimeout(() => {
      savedMsg.value = '';
    }, 2000);
  } finally {
    saving.value = false;
  }
}

async function reconnect() {
  await chrome.runtime.sendMessage({ type: BACKGROUND_MESSAGE_TYPES.BRIDGE_RECONNECT });
}

async function togglePause() {
  const type = bridgeState.value.paused
    ? BACKGROUND_MESSAGE_TYPES.BRIDGE_RESUME
    : BACKGROUND_MESSAGE_TYPES.BRIDGE_PAUSE;
  await chrome.runtime.sendMessage({ type });
}

async function approve(id: string) {
  await chrome.runtime.sendMessage({ type: BACKGROUND_MESSAGE_TYPES.BRIDGE_APPROVE_ACTION, id });
}

async function deny(id: string) {
  await chrome.runtime.sendMessage({ type: BACKGROUND_MESSAGE_TYPES.BRIDGE_DENY_ACTION, id });
}

async function removeTrustedDomain(domain: string) {
  await chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.BRIDGE_REMOVE_TRUSTED_DOMAIN,
    domain,
  });
}

onMounted(async () => {
  await loadBridgeState();
  await loadSettings();

  const clock = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  (window as any).__bridgeClock = clock;

  const onMessage = (message: any) => {
    if (
      message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_APPROVALS_CHANGED ||
      message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_STATUS_CHANGED
    ) {
      bridgeState.value = { trustedDomains: [], paused: false, ...message.payload };
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  (window as any).__bridgeListener = onMessage;
});

onUnmounted(() => {
  clearInterval((window as any).__bridgeClock);
  chrome.runtime.onMessage.removeListener((window as any).__bridgeListener);
});
</script>

<style scoped>
.panel {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  color: #1e293b;
  background: #f8fafc;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Status bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 10;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-ok {
  background: #22c55e;
}
.dot-bad {
  background: #ef4444;
}
.dot-pause {
  background: #f59e0b;
}

.status-label {
  font-weight: 600;
  white-space: nowrap;
}

.server-url {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.btn-reconnect {
  background: #e2e8f0;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-reconnect:hover {
  background: #cbd5e1;
}

.btn-pause {
  background: #fef3c7;
  color: #92400e;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-pause:hover {
  background: #fde68a;
}
.btn-pause--resume {
  background: #dcfce7;
  color: #166534;
}
.btn-pause--resume:hover {
  background: #bbf7d0;
}

/* Approval card */
.approval-card {
  margin: 8px 10px 0;
  border: 1.5px solid #f59e0b;
  background: #fffbeb;
  border-radius: 10px;
  padding: 10px;
}

.approval-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.tool-name {
  font-size: 14px;
}

.countdown {
  font-size: 12px;
  color: #92400e;
  font-weight: 600;
}

.approval-desc {
  font-size: 12px;
  font-weight: 500;
  color: #1e293b;
  background: #f1f5f9;
  border-radius: 5px;
  padding: 4px 7px;
  margin-bottom: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Menlo', 'Monaco', monospace;
}

.approval-url {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6px;
}

.approval-args {
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 8px;
  font-size: 11px;
  max-height: 120px;
  overflow: auto;
  margin: 0 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.approval-actions {
  display: flex;
  gap: 8px;
}

.btn-approve,
.btn-deny {
  flex: 1;
  border: none;
  border-radius: 8px;
  color: #fff;
  padding: 7px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn-approve {
  background: #16a34a;
}
.btn-approve:hover {
  background: #15803d;
}
.btn-deny {
  background: #dc2626;
}
.btn-deny:hover {
  background: #b91c1c;
}

/* Section / history */
.section {
  margin: 10px 10px 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
  margin-bottom: 6px;
}

.history-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-top: 1px solid #f1f5f9;
  font-size: 11px;
}

.h-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.h-status {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
  white-space: nowrap;
}
.h-status--completed {
  background: #dcfce7;
  color: #166534;
}
.h-status--approved {
  background: #dcfce7;
  color: #166534;
}
.h-status--auto-approved {
  background: #d1fae5;
  color: #065f46;
}
.h-status--denied {
  background: #fee2e2;
  color: #991b1b;
}
.h-status--failed {
  background: #fee2e2;
  color: #991b1b;
}
.h-status--timeout {
  background: #fef3c7;
  color: #92400e;
}

.h-time {
  color: #94a3b8;
  font-size: 10px;
  white-space: nowrap;
}

/* Settings */
.settings-details {
  cursor: default;
}

.settings-details summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 0;
}

.settings-details[open] summary {
  margin-bottom: 10px;
}

.settings-details summary::before {
  content: '▶';
  font-size: 9px;
  transition: transform 0.15s;
}

.settings-details[open] summary::before {
  transform: rotate(90deg);
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: #475569;
}

.field-input {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  outline: none;
  background: #f8fafc;
  color: #1e293b;
}
.field-input:focus {
  border-color: #3b82f6;
  background: #fff;
}

.field-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
  cursor: pointer;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-save {
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.btn-save:hover {
  background: #2563eb;
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: default;
}

.saved-msg {
  color: #16a34a;
  font-size: 12px;
  font-weight: 500;
}

/* Trusted domains */
.trusted-section {
  border-top: 1px solid #e2e8f0;
  padding-top: 8px;
  margin-top: 4px;
}

.trusted-title {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.trusted-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-top: 1px solid #f1f5f9;
}

.trusted-domain {
  flex: 1;
  font-size: 12px;
  font-family: 'Menlo', 'Monaco', monospace;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-remove {
  background: #fee2e2;
  color: #991b1b;
  border: none;
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-remove:hover {
  background: #fecaca;
}
</style>
