import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { getBridgeToken } from './bridge-config';

const APPROVAL_TIMEOUT_MS = 60_000;
const DEFAULT_TOOL_TIMEOUT_MS = 120_000;

export interface BrowserToolResponse {
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
  message?: string;
}

interface PendingRequest {
  resolve: (value: BrowserToolResponse) => void;
  reject: (reason?: unknown) => void;
  timeoutId: NodeJS.Timeout;
  awaitingApproval: boolean;
}

export class BridgeWebSocketManager {
  private readonly wss = new WebSocketServer({ noServer: true });
  private client: WebSocket | null = null;
  private authed = new WeakSet<WebSocket>();
  private pending = new Map<string, PendingRequest>();

  handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): boolean {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname !== '/' && url.pathname !== '/ws') return false;

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit('connection', ws, request);
    });
    return true;
  }

  start(): void {
    this.wss.on('connection', (ws) => {
      let authTimer: NodeJS.Timeout | null = setTimeout(() => ws.close(1008, 'Auth timeout'), 5000);

      ws.on('message', (raw: Buffer) => {
        let message: any;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          ws.close(1003, 'Invalid JSON');
          return;
        }

        if (!this.authed.has(ws)) {
          if (message?.type !== 'auth' || message?.token !== getBridgeToken()) {
            ws.close(1008, 'Auth failed');
            return;
          }
          if (authTimer) clearTimeout(authTimer);
          authTimer = null;
          this.authed.add(ws);
          this.client = ws;
          ws.send(JSON.stringify({ type: 'auth_ok' }));
          return;
        }

        this.handleClientMessage(message);
      });

      ws.on('close', () => {
        if (authTimer) clearTimeout(authTimer);
        if (this.client === ws) this.client = null;
      });
    });
  }

  hasClient(): boolean {
    return !!this.client && this.client.readyState === WebSocket.OPEN;
  }

  async callTool(name: string, args: any, requiresApproval: boolean): Promise<BrowserToolResponse> {
    const client = this.client;
    if (!client || client.readyState !== WebSocket.OPEN) {
      throw new Error('No authenticated browser extension WebSocket client connected');
    }

    const id = randomUUID();
    const timeoutMs = requiresApproval ? APPROVAL_TIMEOUT_MS : DEFAULT_TOOL_TIMEOUT_MS;

    return new Promise<BrowserToolResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(requiresApproval ? 'Approval timeout' : 'Request timed out'));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeoutId, awaitingApproval: requiresApproval });
      const type = requiresApproval ? 'approval_request' : 'call_tool';
      client.send(JSON.stringify({ type, id, name, args, timeoutMs }));
    });
  }

  private handleClientMessage(message: any): void {
    const id = String(message?.id || '');
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;

    if (message.type === 'approved') {
      if (pending.awaitingApproval) {
        clearTimeout(pending.timeoutId);
        pending.awaitingApproval = false;
        pending.timeoutId = setTimeout(() => {
          this.pending.delete(id);
          pending.reject(new Error('Request timed out'));
        }, DEFAULT_TOOL_TIMEOUT_MS);
      }
      return;
    }

    if (message.type === 'denied') {
      this.finish(id, () => pending.reject(new Error('Action denied by user')));
      return;
    }

    if (message.type === 'tool_result') {
      const payload = message.payload as BrowserToolResponse;
      this.finish(id, () => pending.resolve(payload));
    }
  }

  private finish(id: string, complete: () => void): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    this.pending.delete(id);
    complete();
  }
}

export const bridgeWsManager = new BridgeWebSocketManager();
