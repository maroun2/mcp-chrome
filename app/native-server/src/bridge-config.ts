import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { NATIVE_SERVER_PORT } from './constant';

const TOKEN_PATH = join(homedir(), '.agor', 'browser-bridge.token');

function readTokenFromFile(): string | undefined {
  try {
    if (!existsSync(TOKEN_PATH)) return undefined;
    const token = readFileSync(TOKEN_PATH, 'utf8').trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function writeTokenToFile(token: string): void {
  try {
    mkdirSync(dirname(TOKEN_PATH), { recursive: true, mode: 0o700 });
    writeFileSync(TOKEN_PATH, `${token}\n`, { mode: 0o600 });
  } catch {
    // Server can still run with in-memory/env token if file write fails.
  }
}

export function getBridgeHost(): string {
  return process.env.BRIDGE_HOST || '127.0.0.1';
}

export function getBridgePort(fallback = NATIVE_SERVER_PORT): number {
  const raw = process.env.BRIDGE_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

let cachedToken: string | undefined;

export function getBridgeToken(): string {
  if (cachedToken) return cachedToken;

  const envToken = process.env.BRIDGE_TOKEN?.trim();
  if (envToken) {
    cachedToken = envToken;
    writeTokenToFile(envToken);
    return envToken;
  }

  const fileToken = readTokenFromFile();
  if (fileToken) {
    cachedToken = fileToken;
    return fileToken;
  }

  cachedToken = randomBytes(32).toString('hex');
  writeTokenToFile(cachedToken);
  return cachedToken;
}

export function isValidBearerAuth(header: unknown): boolean {
  if (typeof header !== 'string') return false;
  const expected = getBridgeToken();
  return header === `Bearer ${expected}`;
}
