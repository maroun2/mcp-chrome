import { initNativeHostListener } from './native-host';
import { initBridgeWebSocket } from './bridge-ws';

/**
 * Background script entry point.
 * Runs native host (stdio MCP bridge) + WebSocket approval bridge.
 */
export default defineBackground(() => {
  initNativeHostListener();
  initBridgeWebSocket();
});
