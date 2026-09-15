/**
 * Account password policy (signup + local accounts).
 *
 * Standards (good practice, bilingual):
 * - 8–64 characters
 * - lower + upper (Latin or Arabic-script letters accepted for "letter",
 *   but upper/lower specifically checks Latin case; Arabic-only passwords
 *   must still meet digit + special to compensate — see below)
 * - at least one digit (ASCII or Arabic-Indic)
 * - at least one special character
 * - no whitespace
 * - not in the common-password blocklist
 *
 * Score 0-6 (passed rules). Enabling requires ALL rules (score 6).
 */

export interface AccountPasswordRule {
  id: 'length' | 'case' | 'digit' | 'special' | 'noSpaces' | 'notCommon';
  ok: boolean;
  labelAr: string;
  labelEn: string;
}

export interface AccountPasswordEvaluation {
  rules: AccountPasswordRule[];
  score: number;
  passed: boolean;
  strengthAr: 'ضعيفة' | 'متوسطة' | 'قوية' | 'قوية جدًا';
  strengthEn: 'Weak' | 'Fair' | 'Strong' | 'Very strong';
}

const COMMON = new Set(
  [
    '123456',
    '12345678',
    '123456789',
    'password',
    'password1',
    'password123',
    'qwerty',
    'qwerty123',
    'abc123',
    'letmein',
    'welcome',
    'admin123',
    '123123',
    '111111',
    '1234567',
    'sunshine',
    'princess',
    'football',
    'monkey',
    'dragon',
    'master',
    'shadow',
    'superman',
    'michael',
    'qwertyuiop',
    '1q2w3e4r',
    'password!',
    'p@ssw0rd',
    'passw0rd',
    'test123',
    'demo1234',
    'reviewer1',
    'review123',
  ].map((s) => s.toLowerCase())
);

export function evaluateAccountPassword(raw: string): AccountPasswordEvaluation {
  const pwd = typeof raw === 'string' ? raw : '';
  const lower = pwd.toLowerCase();
  const hasLower = /[a-z\u00e0-\u00f6\u00f8-\u024f\u0370-\u03ff\u0600-\u06ff]/.test(pwd);
  const hasUpper = /[A-Z\u00c0-\u00de\u0391-\u03ab]/.test(pwd);
  // Arabic-script passwords have no case: require digit+special instead of
  // forcing Latin. Mixed scripts still pass naturally.
  const hasArabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(pwd);
  const caseOk = hasArabic ? hasLower || hasUpper : hasLower && hasUpper;
  const rules: AccountPasswordRule[] = [
    {
      id: 'length',
      ok: pwd.length >= 8 && pwd.length <= 64,
      labelAr: 'من 8 إلى 64 حرفًا',
      labelEn: '8–64 characters',
    },
    {
      id: 'case',
      ok: caseOk,
      labelAr: hasArabic && !/[A-Za-z]/.test(pwd) ? 'حرف عربي + رقم + رمز' : 'حرف كبير + حرف صغير (A-Z / a-z)',
      labelEn: hasArabic && !/[A-Za-z]/.test(pwd) ? 'Arabic letter + digit + symbol' : 'Upper + lower case (A-Z / a-z)',
    },
    {
      id: 'digit',
      ok: /[0-9\u0660-\u0669\u06f0-\u06f9]/.test(pwd),
      labelAr: 'رقم واحد على الأقل (0-9)',
      labelEn: 'At least one digit (0-9)',
    },
    {
      id: 'special',
      ok: /[^A-Za-z0-9\u00c0-\u024f\u0370-\u03ff\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\u0660-\u0669\u06f0-\u06f9\s]/.test(pwd),
      labelAr: 'رمز واحد على الأقل (! @ # ...)',
      labelEn: 'At least one symbol (! @ # ...)',
    },
    {
      id: 'noSpaces',
      ok: pwd.length > 0 && !/\s/.test(pwd),
      labelAr: 'بدون مسافات',
      labelEn: 'No spaces',
    },
    {
      id: 'notCommon',
      ok: pwd.length > 0 && !COMMON.has(lower),
      labelAr: 'ليست كلمة شائعة (مثل password123)',
      labelEn: 'Not a common password (e.g. password123)',
    },
  ];
  const score = rules.filter((r) => r.ok).length;
  const passed = score === rules.length;
  const strengthAr = score <= 2 ? 'ضعيفة' : score <= 4 ? 'متوسطة' : score === 5 ? 'قوية' : 'قوية جدًا';
  const strengthEn = score <= 2 ? 'Weak' : score <= 4 ? 'Fair' : score === 5 ? 'Strong' : 'Very strong';
  return { rules, score, passed, strengthAr, strengthEn };
}

/** First failing rule as a bilingual message (for toasts / form errors). */
export function firstPasswordFailure(raw: string, lang: 'ar' | 'en'): string | null {
  const ev = evaluateAccountPassword(raw);
  if (ev.passed) return null;
  const bad = ev.rules.find((r) => !r.ok);
  if (!bad) return null;
  return lang === 'ar' ? `كلمة السر: ${bad.labelAr}.` : `Password: ${bad.labelEn}.`;
}
