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
  status: 'approved' | 'denied' | 'completed' | 'failed' | 'timeout';
  timestamp: number;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let bridgeUrl = BRIDGE_SERVER.DEFAULT_URL;
let bridgeToken = '';
const pendingApprovals = new Map<string, ApprovalRequest>();
const pendingPayloads = new Map<string, { name: string; args: any }>();
const history: ActionHistoryItem[] = [];
let connected = false;

async function loadSettings() {
  const values = await chrome.storage.sync.get([
    STORAGE_KEYS.BRIDGE_SERVER_URL,
    STORAGE_KEYS.BRIDGE_TOKEN,
  ]);
  bridgeUrl = String(values[STORAGE_KEYS.BRIDGE_SERVER_URL] || BRIDGE_SERVER.DEFAULT_URL);
  bridgeToken = String(values[STORAGE_KEYS.BRIDGE_TOKEN] || '');
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
    serverUrl: bridgeUrl,
    pending: Array.from(pendingApprovals.values()),
    history: [...history],
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
  if (!bridgeToken || !bridgeUrl) {
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
    pendingPayloads.set(id, { name: message.name, args: message.args });
    const now = Date.now();
    pendingApprovals.set(id, {
      id,
      name: String(message.name),
      args: message.args,
      currentUrl: await getCurrentPageUrl(),
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
  addHistory({ id, name: pending.name, status: 'approved', timestamp: Date.now() });
  broadcastState();
  await executeAndRespond(id, pending.name, pending.args);
  return !!approval;
}

function deny(id: string) {
  const pending = pendingPayloads.get(id);
  pendingPayloads.delete(id);
  pendingApprovals.delete(id);
  send({ type: 'denied', id });
  addHistory({ id, name: pending?.name || 'unknown', status: 'denied', timestamp: Date.now() });
  broadcastState();
  return !!pending;
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
    if (!changes[STORAGE_KEYS.BRIDGE_SERVER_URL] && !changes[STORAGE_KEYS.BRIDGE_TOKEN]) return;
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
      sendResponse({ success: deny(String(message.id)) });
      return true;
    }
    return false;
  });
}
