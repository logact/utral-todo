import http2 from 'http2';
import crypto from 'crypto';
import fs from 'fs';

const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID;
const APNS_KEY_PATH = process.env.APNS_KEY_PATH;
const APNS_SANDBOX = process.env.APNS_SANDBOX === 'true';

let privateKey: crypto.KeyObject | null = null;
let cachedJWT: string | null = null;
let jwtExpiresAt = 0;

function loadPrivateKey(): crypto.KeyObject | null {
  if (privateKey) return privateKey;
  if (!APNS_KEY_PATH || !fs.existsSync(APNS_KEY_PATH)) return null;
  try {
    const pem = fs.readFileSync(APNS_KEY_PATH, 'utf8');
    privateKey = crypto.createPrivateKey(pem);
    return privateKey;
  } catch (err) {
    console.error('[apns] Failed to load private key:', err);
    return null;
  }
}

function generateJWT(): string | null {
  const key = loadPrivateKey();
  if (!key || !APNS_KEY_ID || !APNS_TEAM_ID) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: APNS_TEAM_ID, iat: now })).toString('base64url');
  const signingInput = `${header}.${claims}`;

  try {
    const signature = crypto.sign('sha256', Buffer.from(signingInput), key);
    return `${signingInput}.${signature.toString('base64url')}`;
  } catch (err) {
    console.error('[apns] Failed to sign JWT:', err);
    return null;
  }
}

function getJWT(): string | null {
  const now = Math.floor(Date.now() / 1000);
  // JWT is valid for 1 hour, refresh after 50 minutes
  if (cachedJWT && jwtExpiresAt > now + 600) {
    return cachedJWT;
  }
  const jwt = generateJWT();
  if (jwt) {
    cachedJWT = jwt;
    jwtExpiresAt = now + 3600;
  }
  return jwt;
}

function getAPNSHost(): string {
  return APNS_SANDBOX ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
}

export type ApnsPushType = 'background' | 'alert' | 'liveactivity';

export interface ApnsNotification {
  deviceToken: string;
  payload: Record<string, unknown>;
  priority?: number;
  pushType?: ApnsPushType;
  apnsExpiration?: number;
  apnsCollapseId?: string;
}

let http2Client: http2.ClientHttp2Session | null = null;
let http2ClientHost: string | null = null;

function getClient(): http2.ClientHttp2Session | null {
  const host = getAPNSHost();
  if (http2Client && !http2Client.closed && !http2Client.destroyed && http2ClientHost === host) {
    return http2Client;
  }

  if (http2Client) {
    try { http2Client.close(); } catch { /* ignore */ }
  }

  try {
    http2Client = http2.connect(`https://${host}`);
    http2ClientHost = host;
    http2Client.on('error', (err) => {
      console.error('[apns] HTTP/2 client error:', err);
      http2Client = null;
    });
    http2Client.on('goaway', () => {
      http2Client = null;
    });
    return http2Client;
  } catch (err) {
    console.error('[apns] Failed to connect:', err);
    return null;
  }
}

export function isApnsConfigured(): boolean {
  return !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_BUNDLE_ID && APNS_KEY_PATH && fs.existsSync(APNS_KEY_PATH));
}

export async function sendNotification(notification: ApnsNotification): Promise<{ success: boolean; status?: number; reason?: string }> {
  if (!isApnsConfigured()) {
    return { success: false, reason: 'APNS not configured' };
  }

  const jwt = getJWT();
  if (!jwt) {
    return { success: false, reason: 'Failed to generate JWT' };
  }

  const client = getClient();
  if (!client) {
    return { success: false, reason: 'HTTP/2 client not available' };
  }

  return new Promise((resolve) => {
    const headers: Record<string, string> = {
      ':method': 'POST',
      ':path': `/3/device/${notification.deviceToken}`,
      ':authority': getAPNSHost(),
      'authorization': `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID!,
      'apns-push-type': notification.pushType ?? 'background',
      'apns-priority': String(notification.priority ?? 5),
      'content-type': 'application/json',
    };

    if (notification.apnsExpiration !== undefined) {
      headers['apns-expiration'] = String(notification.apnsExpiration);
    }
    if (notification.apnsCollapseId) {
      headers['apns-collapse-id'] = notification.apnsCollapseId;
    }

    const req = client.request(headers);

    let responseData = '';
    req.on('response', (headers) => {
      const status = headers[':status'] as number;
      if (status === 200) {
        resolve({ success: true, status });
      } else {
        req.on('data', (chunk) => { responseData += chunk; });
        req.on('end', () => {
          const reason = responseData ? JSON.parse(responseData)?.reason : undefined;
          resolve({ success: false, status, reason });
        });
      }
    });

    req.on('error', (err) => {
      console.error('[apns] Request error:', err);
      resolve({ success: false, reason: String(err) });
    });

    req.write(JSON.stringify(notification.payload));
    req.end();
  });
}

export async function sendNotifications(notifications: ApnsNotification[]): Promise<void> {
  for (const n of notifications) {
    const result = await sendNotification(n);
    if (!result.success) {
      console.error(`[apns] Failed to send to ${n.deviceToken.slice(0, 16)}...: ${result.reason}`);
    }
  }
}
