import { NextRequest, NextResponse } from 'next/server';
import { generateRawApiKey, hashApiKey } from '@/lib/api-auth';
import {
  getApiKeys,
  saveApiKeyRecord,
  revokeApiKeyRecord,
  toggleApiKeyStatusRecord,
  getAgentApiMasterStatus,
  setAgentApiMasterStatus,
} from '@/lib/db';
import { ApiKeyItem } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const userUid = req.nextUrl.searchParams.get('userUid') || undefined;

    // Guest users have no API access
    if (userUid === 'guest_user_session' || (userUid && userUid.startsWith('guest_'))) {
      return NextResponse.json({
        success: true,
        data: [],
        masterEnabled: false,
        isGuest: true,
      });
    }

    const [keys, masterEnabled] = await Promise.all([
      getApiKeys(userUid),
      getAgentApiMasterStatus(userUid),
    ]);

    // Never expose keyHash in the response
    const safeKeys = keys.map(({ keyHash, ...rest }) => rest);
    return NextResponse.json({
      success: true,
      data: safeKeys,
      masterEnabled,
      isGuest: false,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = (body.name || 'AI Agent Key').trim();
    const userUid = body.userUid || '';

    // Strictly prevent guest users from creating API keys
    if (!userUid || userUid === 'guest_user_session' || userUid.startsWith('guest_')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'GUEST_RESTRICTED',
            message: 'Guest users cannot generate API keys. Please register a permanent account.',
            messageAr: 'غير مسموح لحسابات الضيوف بإنشاء مفاتيح API. يرجى تسجيل حساب دائم أولاً.',
          },
        },
        { status: 403 }
      );
    }

    const rawKey = generateRawApiKey();
    const keyHash = await hashApiKey(rawKey);
    const keyPrefix = `${rawKey.substring(0, 11)}...${rawKey.substring(rawKey.length - 4)}`;
    const now = new Date().toISOString();

    const keyRecord: ApiKeyItem = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      keyPrefix,
      keyHash,
      ownerUid: userUid,
      createdAt: now,
      lastUsedAt: null,
      status: 'active',
    };

    await saveApiKeyRecord(keyRecord);

    // Return the raw key ONCE so the user can copy it
    return NextResponse.json(
      {
        success: true,
        data: {
          id: keyRecord.id,
          name: keyRecord.name,
          keyPrefix: keyRecord.keyPrefix,
          rawKey, // Only revealed here!
          createdAt: keyRecord.createdAt,
          status: keyRecord.status,
          message: 'Copy and save this API key securely now. It will not be shown again.',
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, id, status, enabled, userUid } = body;

    // Prevent guest users from modifying API controls
    if (userUid === 'guest_user_session' || (userUid && userUid.startsWith('guest_'))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'GUEST_RESTRICTED',
            message: 'Guest users cannot modify API configurations.',
          },
        },
        { status: 403 }
      );
    }

    // Toggle master kill switch
    if (action === 'toggle_master') {
      if (typeof enabled !== 'boolean') {
        return NextResponse.json(
          { success: false, error: { code: 'BAD_REQUEST', message: 'Missing enabled boolean parameter' } },
          { status: 400 }
        );
      }
      await setAgentApiMasterStatus(enabled, userUid);
      return NextResponse.json({
        success: true,
        masterEnabled: enabled,
        message: enabled ? 'External Agent API enabled' : 'External Agent API paused',
      });
    }

    // Toggle individual key status (pause / resume)
    if (action === 'toggle_key_status') {
      if (!id || (status !== 'active' && status !== 'paused')) {
        return NextResponse.json(
          { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid key ID or status' } },
          { status: 400 }
        );
      }
      await toggleApiKeyStatusRecord(id, status, userUid);
      return NextResponse.json({
        success: true,
        id,
        status,
        message: status === 'paused' ? 'API key paused' : 'API key resumed',
      });
    }

    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Unknown action' } },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');
    const userUid = searchParams.get('userUid') || undefined;

    if (!keyId) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Missing key id' } },
        { status: 400 }
      );
    }

    await revokeApiKeyRecord(keyId, userUid);
    return NextResponse.json({ success: true, message: 'API key revoked successfully' });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}

