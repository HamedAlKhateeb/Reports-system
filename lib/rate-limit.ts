import { NextRequest, NextResponse } from 'next/server';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory rate limiting table (keyed by keyId or IP)
const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    rateLimitMap.forEach((record, key) => {
      if (record.resetAt < now) {
        rateLimitMap.delete(key);
      }
    });
  }, 5 * 60 * 1000);
  if (timer && typeof timer === 'object' && 'unref' in timer && typeof (timer as any).unref === 'function') {
    (timer as any).unref();
  }
}

/**
 * Checks request against sliding window rate limit
 * Defaults to 60 requests per minute
 */
export function checkRateLimit(
  identifier: string,
  limit: number = 60,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; reset: number; response?: NextResponse } {
  const now = Date.now();
  let record = rateLimitMap.get(identifier);

  if (!record || record.resetAt <= now) {
    record = { count: 1, resetAt: now + windowMs };
    rateLimitMap.set(identifier, record);
    return {
      allowed: true,
      remaining: limit - 1,
      reset: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  const resetSec = Math.ceil((record.resetAt - now) / 1000);
  const remaining = Math.max(0, limit - record.count);

  if (record.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      reset: resetSec,
      response: NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit of ${limit} requests per minute exceeded. Please try again in ${resetSec} seconds.`,
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(resetSec),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(record.resetAt),
          },
        }
      ),
    };
  }

  return {
    allowed: true,
    remaining,
    reset: resetSec,
  };
}
