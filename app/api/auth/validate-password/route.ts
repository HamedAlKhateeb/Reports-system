import { NextRequest, NextResponse } from 'next/server';
import { evaluateAccountPassword, firstPasswordFailure } from '@/lib/password-policy';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anon';
    const rateLimit = checkRateLimit(`pwd_val_${ip}`, 30, 60 * 1000);
    if (!rateLimit.allowed) {
      return rateLimit.response!;
    }

    const body = (await req.json().catch(() => ({}))) as {
      password?: unknown;
      lang?: unknown;
    };

    const password = typeof body.password === 'string' ? body.password : '';
    const lang = body.lang === 'en' ? 'en' : 'ar';

    if (password.length > 256) {
      return NextResponse.json(
        {
          valid: false,
          error: lang === 'ar' ? 'كلمة المرور طويلة جداً (الحد الأقصى 256 حرف).' : 'Password is too long (max 256 characters).',
          score: 0,
          rules: [],
        },
        { status: 400 }
      );
    }

    const evaluation = evaluateAccountPassword(password);
    const failure = firstPasswordFailure(password, lang);

    if (!evaluation.passed) {
      return NextResponse.json(
        {
          valid: false,
          error: failure || (lang === 'ar' ? 'كلمة المرور لا تلبي معايير الأمان المطلوبة.' : 'Password does not meet security requirements.'),
          score: evaluation.score,
          rules: evaluation.rules,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        valid: true,
        error: null,
        score: evaluation.score,
        rules: evaluation.rules,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        valid: false,
        error: err?.message || 'Password validation failed.',
      },
      { status: 500 }
    );
  }
}
