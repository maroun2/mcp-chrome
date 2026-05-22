declare module 'ws' {
  import type { IncomingMessage } from 'node:http';
  import type { Socket } from 'node:net';
  import { EventEmitter } from 'node:events';

  export class WebSocket extends EventEmitter {
    static OPEN: number;
    readyState: number;
    send(data: string | Buffer): void;
    close(code?: number, reason?: string): void;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { noServer: boolean });
    handleUpgrade(
      request: IncomingMessage,
      socket: Socket,
      head: Buffer,
      callback: (ws: WebSocket) => void,
    ): void;
  }
}
