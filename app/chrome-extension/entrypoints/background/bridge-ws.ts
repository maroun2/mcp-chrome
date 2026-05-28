import { BRIDGE_SERVER, STORAGE_KEYS } from '@/common/constants';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { handleCallTool } from './tools';

const RECONNECT_DELAY_MS = 3000;
const HISTORY_LIMIT = 10;

export interface ApprovalRequest {
  id: string;
  name: string;
  args: any;
  currentUrl: string;
  createdAt: number;
  expiresAt: number;
}

export interface ActionHistoryItem {
  id: string;
  name: string;
  status: 'approved' | 'auto-approved' | 'denied' | 'completed' | 'failed' | 'timeout';
  timestamp: number;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let bridgeUrl: string = BRIDGE_SERVER.DEFAULT_URL;
let bridgeToken = '';
let autoConnect = true;
const pendingApprovals = new Map<string, ApprovalRequest>();
const pendingPayloads = new Map<string, { name: string; args: any }>();
const history: ActionHistoryItem[] = [];
const trustedDomains = new Set<string>();
let connected = false;
let paused = false;

async function loadSettings() {
  const values = await chrome.storage.sync.get([
    STORAGE_KEYS.BRIDGE_SERVER_URL,
    STORAGE_KEYS.BRIDGE_TOKEN,
    STORAGE_KEYS.BRIDGE_AUTO_CONNECT,
    STORAGE_KEYS.TRUSTED_DOMAINS,
  ]);
  bridgeUrl = String(values[STORAGE_KEYS.BRIDGE_SERVER_URL] || BRIDGE_SERVER.DEFAULT_URL);
  bridgeToken = String(values[STORAGE_KEYS.BRIDGE_TOKEN] || '');
  autoConnect = values[STORAGE_KEYS.BRIDGE_AUTO_CONNECT] !== false;

  trustedDomains.clear();
  const stored = values[STORAGE_KEYS.TRUSTED_DOMAINS];
  if (Array.isArray(stored)) {
    for (const d of stored) trustedDomains.add(String(d));
  }
}

async function saveTrustedDomains() {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.TRUSTED_DOMAINS]: Array.from(trustedDomains),
  });
}

function broadcastState() {
  chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.BRIDGE_APPROVALS_CHANGED,
      payload: getBridgeState(),
    })
    .catch(() => {});
}

function broadcastStatus() {
  chrome.runtime
    .sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.BRIDGE_STATUS_CHANGED,
      payload: getBridgeState(),
    })
    .catch(() => {});
}

function getBridgeState() {
  return {
    connected,
    paused,
    serverUrl: bridgeUrl,
    pending: Array.from(pendingApprovals.values()),
    history: [...history],
    trustedDomains: Array.from(trustedDomains),
  };
}

function addHistory(item: ActionHistoryItem) {
  history.unshift(item);
  history.splice(HISTORY_LIMIT);
  broadcastState();
}

async function getCurrentPageUrl(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return String(tab?.url || '');
  } catch {
    return '';
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBridge().catch(() => scheduleReconnect());
  }, RECONNECT_DELAY_MS);
}

async function connectBridge() {
  await loadSettings();
  if (!autoConnect || !bridgeToken || !bridgeUrl) {
    connected = false;
    broadcastStatus();
    return;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(bridgeUrl);
  ws.onopen = () => {
    ws?.send(JSON.stringify({ type: 'auth', token: bridgeToken }));
  };
  ws.onmessage = (event) => {
    handleBridgeMessage(event.data).catch((error) =>
      console.warn('[BridgeWS] message failed', error),
    );
  };
  ws.onclose = () => {
    connected = false;
    broadcastStatus();
    scheduleReconnect();
  };
  ws.onerror = () => {
    connected = false;
    broadcastStatus();
  };
}

async function handleBridgeMessage(raw: unknown) {
  const message = JSON.parse(String(raw));
  if (message.type === 'auth_ok') {
    connected = true;
    broadcastStatus();
    return;
  }

  if (message.type === 'call_tool') {
    await executeAndRespond(message.id, message.name, message.args);
    return;
  }

  if (message.type === 'approval_request') {
    const id = String(message.id);

    // Auto-deny when paused
    if (paused) {
      send({ type: 'denied', id });
      addHistory({ id, name: String(message.name), status: 'denied', timestamp: Date.now() });
      return;
    }

    const currentUrl = await getCurrentPageUrl();

    // Check if this page's hostname is trusted — auto-approve silently
    let hostname = '';
    try {
      hostname = new URL(currentUrl).hostname;
    } catch {}

    if (hostname && trustedDomains.has(hostname)) {
      pendingPayloads.set(id, { name: message.name, args: message.args });
      send({ type: 'approved', id });
      await executeAndRespond(id, message.name, message.args);
      addHistory({
        id,
        name: String(message.name),
        status: 'auto-approved',
        timestamp: Date.now(),
      });
      pendingPayloads.delete(id);
      return;
    }

    // Normal approval flow — show card in side panel
    pendingPayloads.set(id, { name: message.name, args: message.args });
    const now = Date.now();
    pendingApprovals.set(id, {
      id,
      name: String(message.name),
      args: message.args,
      currentUrl,
      createdAt: now,
      expiresAt: now + 60_000,
    });
    broadcastState();
  }
}

async function executeAndRespond(id: string, name: string, args: any) {
  try {
    const result = await handleCallTool({ name, args });
    send({ type: 'tool_result', id, payload: { status: 'success', data: result } });
    addHistory({ id, name, status: 'completed', timestamp: Date.now() });
  } catch (error) {
    send({
      type: 'tool_result',
      id,
      payload: {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      },
    });
    addHistory({ id, name, status: 'failed', timestamp: Date.now() });
  }
}

function send(message: any) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

async function approve(id: string) {
  const pending = pendingPayloads.get(id);
  const approval = pendingApprovals.get(id);
  if (!pending) return false;
  pendingPayloads.delete(id);
  pendingApprovals.delete(id);

  // Remember the domain as trusted
  if (approval?.currentUrl) {
    try {
      const hostname = new URL(approval.currentUrl).hostname;
      if (hostname) {
        trustedDomains.add(hostname);
        await saveTrustedDomains();
      }
    } catch {}
  }

  addHistory({ id, name: pending.name, status: 'approved', timestamp: Date.now() });
  broadcastState();
  send({ type: 'approved', id });
  await executeAndRespond(id, pending.name, pending.args);
  return !!approval;
}

async function deny(id: string) {
  const pending = pendingPayloads.get(id);
  const approval = pendingApprovals.get(id);
  pendingPayloads.delete(id);
  pendingApprovals.delete(id);

  // Remove from trusted domains if present (deny revokes trust)
  if (approval?.currentUrl) {
    try {
      const hostname = new URL(approval.currentUrl).hostname;
      if (hostname && trustedDomains.has(hostname)) {
        trustedDomains.delete(hostname);
        await saveTrustedDomains();
      }
    } catch {}
  }

  send({ type: 'denied', id });
  addHistory({ id, name: pending?.name || 'unknown', status: 'denied', timestamp: Date.now() });
  broadcastState();
  return !!pending;
}

async function removeTrustedDomain(domain: string) {
  trustedDomains.delete(domain);
  await saveTrustedDomains();
  broadcastState();
}

function expireApprovals() {
  const now = Date.now();
  for (const approval of pendingApprovals.values()) {
    if (approval.expiresAt > now) continue;
    pendingApprovals.delete(approval.id);
    pendingPayloads.delete(approval.id);
    addHistory({ id: approval.id, name: approval.name, status: 'timeout', timestamp: now });
  }
  broadcastState();
}

export function initBridgeWebSocket() {
  connectBridge().catch(() => scheduleReconnect());
  setInterval(expireApprovals, 1000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const bridgeKeyChanged =
      changes[STORAGE_KEYS.BRIDGE_SERVER_URL] ||
      changes[STORAGE_KEYS.BRIDGE_TOKEN] ||
      changes[STORAGE_KEYS.BRIDGE_AUTO_CONNECT];
    if (!bridgeKeyChanged) return;
    try {
      ws?.close();
    } catch {}
    ws = null;
    connectBridge().catch(() => scheduleReconnect());
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === BACKGROUND_MESSAGE_TYPES.GET_BRIDGE_STATUS) {
      sendResponse({ success: true, state: getBridgeState() });
      return true;
    }
    if (message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_APPROVE_ACTION) {
      approve(String(message.id)).then((ok) => sendResponse({ success: ok }));
      return true;
    }
    if (message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_DENY_ACTION) {
      deny(String(message.id)).then((ok) => sendResponse({ success: ok }));
      return true;
    }
    if (message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_RECONNECT) {
      try {
        ws?.close();
      } catch {}
      ws = null;
      connectBridge().catch(() => scheduleReconnect());
      sendResponse({ success: true });
      return true;
    }
    if (message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_REMOVE_TRUSTED_DOMAIN) {
      removeTrustedDomain(String(message.domain)).then(() => sendResponse({ success: true }));
      return true;
    }
    if (message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_PAUSE) {
      paused = true;
      broadcastState();
      sendResponse({ success: true });
      return true;
    }
    if (message?.type === BACKGROUND_MESSAGE_TYPES.BRIDGE_RESUME) {
      paused = false;
      broadcastState();
      sendResponse({ success: true });
      return true;
    }
    return false;
  });
}
