import { NextRequest, NextResponse } from 'next/server';
import { generateRawApiKey, hashApiKey } from '@/lib/api-auth';
import { getVerifiedSessionUid } from '@/lib/server-auth';
import {
  getApiKeys,
  saveApiKeyRecord,
  revokeApiKeyRecord,
  toggleApiKeyStatusRecord,
  getAgentApiMasterStatus,
  setAgentApiMasterStatus,
} from '@/lib/db';
import { ApiKeyItem } from '@/lib/types';

// Phase 1.4 (B1): the uid ALWAYS comes from the verified server session.
// A `userUid` supplied in query/body is only accepted when it equals the
// session uid, otherwise 403 — it is never trusted on its own.
async function requireSessionUid(req: NextRequest): Promise<
  { uid: string } | { error: NextResponse }
> {
  const uid = await getVerifiedSessionUid(req);
  if (!uid) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Valid sign-in session required.' },
        },
        { status: 401 }
      ),
    };
  }
  if (uid === 'guest_user_session' || uid.startsWith('guest_')) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: {
            code: 'GUEST_RESTRICTED',
            message: 'Guest users cannot manage API keys.',
          },
        },
        { status: 403 }
      ),
    };
  }
  return { uid };
}

function uidMismatchResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'The supplied userUid does not match the signed-in session.',
      },
    },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionUid(req);
    if ('error' in session) return session.error;
    const userUid = session.uid;

    // Compatibility: clients may still send ?userUid — it must match.
    const claimed = req.nextUrl.searchParams.get('userUid');
    if (claimed && claimed !== userUid) return uidMismatchResponse();

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
    const session = await requireSessionUid(req);
    if ('error' in session) return session.error;
    const userUid = session.uid;

    const body = await req.json().catch(() => ({}));
    const name = (body.name || 'AI Agent Key').trim();
    // Compatibility: body.userUid must match the session when present.
    if (body.userUid && body.userUid !== userUid) return uidMismatchResponse();

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
    const session = await requireSessionUid(req);
    if ('error' in session) return session.error;
    const userUid = session.uid;

    const body = await req.json().catch(() => ({}));
    const { action, id, status, enabled, userUid: claimedUid } = body;

    // Compatibility: body.userUid must match the session when present.
    if (claimedUid && claimedUid !== userUid) return uidMismatchResponse();

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
    const session = await requireSessionUid(req);
    if ('error' in session) return session.error;
    const userUid = session.uid;

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');
    // Compatibility: ?userUid must match the session when present.
    const claimed = searchParams.get('userUid');
    if (claimed && claimed !== userUid) return uidMismatchResponse();

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

