import { NextRequest, NextResponse } from 'next/server';
import {
  findApiKeyByHash,
  saveApiKeyRecord,
  revokeApiKeyRecord,
  getApiKeys,
  getAgentApiMasterStatus,
} from './db';
import { ApiKeyItem } from './types';

/**
 * Generates a high-entropy API key with prefix
 */
export function generateRawApiKey(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 24; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `rk_live_${hex}`;
}

/**
 * Computes SHA-256 hash using Web Crypto API (supported natively in Cloudflare Workers and Node 18+)
 */
export async function hashApiKey(rawKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Authenticates an incoming API request by validating the X-API-Key header,
 * checking owner registration, key pause/revocation, and the master kill-switch.
 */
export async function authenticateApiRequest(req: NextRequest): Promise<{
  authenticated: boolean;
  apiKey?: ApiKeyItem;
  errorResponse?: NextResponse;
}> {
  const keyHeader =
    req.headers.get('x-api-key') ||
    req.headers.get('X-API-Key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!keyHeader || !keyHeader.trim()) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing API Key. Please provide a valid X-API-Key header in your request.',
          },
        },
        { status: 401 }
      ),
    };
  }

  const cleanKey = keyHeader.trim();
  const keyHash = await hashApiKey(cleanKey);
  const foundKey = await findApiKeyByHash(keyHash);

  if (!foundKey) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid API Key. Please check your key or generate a new one in Settings > API Keys.',
          },
        },
        { status: 401 }
      ),
    };
  }

  // 1. Guard against unregistered / guest users having/using an API key
  if (
    !foundKey.ownerUid ||
    foundKey.ownerUid === 'guest_user_session' ||
    foundKey.ownerUid.startsWith('guest_')
  ) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'GUEST_RESTRICTED',
            message: 'Guest users are not allowed to hold or use external API keys. Please register a permanent account.',
          },
        },
        { status: 403 }
      ),
    };
  }

  // 2. Check if key is revoked
  if (foundKey.status === 'revoked') {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'REVOKED_KEY',
            message: 'This API Key has been permanently revoked.',
          },
        },
        { status: 401 }
      ),
    };
  }

  // 3. Check if key is temporarily paused
  if (foundKey.status === 'paused') {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'API_KEY_PAUSED',
            message: 'This API Key is temporarily paused by the account owner. Resume it in Settings > API Keys to allow requests.',
          },
        },
        { status: 403 }
      ),
    };
  }

  // 4. Master Kill-Switch: check if external Agent API is enabled
  const masterEnabled = await getAgentApiMasterStatus(foundKey.ownerUid);
  if (!masterEnabled) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: 'API_DISABLED',
            message: 'External Agent API access is currently paused/disabled by the account owner. You can re-enable it in Settings > API Keys.',
          },
        },
        { status: 503 }
      ),
    };
  }

  return { authenticated: true, apiKey: foundKey };
}

