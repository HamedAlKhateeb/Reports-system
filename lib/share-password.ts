/**
 * Optional share-link passwords (deterrent-grade, not vault-grade).
 *
 * Model: the owner stores ONLY `sharePasswordHash` (SHA-256 hex) on the
 * report. The share page gates rendering behind the password; the export
 * API re-checks it server-side against the Firestore record (see
 * verifySharedReportInDb). The plaintext password is never persisted —
 * it lives in request bodies / component memory only.
 *
 * Honest limits (shown in UI): anyone holding the link can read the hash
 * from the public document and brute-force weak passwords offline. Use a
 * long password for sensitive reports; revoke the link when done.
 */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex of a password. Works in browsers, Node 18+, Workers. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input || '');
  const subtle: SubtleCrypto | undefined = (globalThis as any)?.crypto?.subtle;
  if (!subtle) {
    // Fallback (non-WebCrypto runtimes only): NOT constant-time, but the
    // hash still never equals a WebCrypto hash — fail closed server-side.
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < data.length; i++) {
      h1 = Math.imul(h1 ^ data[i], 16777619);
      h2 = Math.imul(h2 + data[i], 31);
    }
    return `fb${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
  }
  const digest = await subtle.digest('SHA-256', data as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

/** Constant-time hex comparison (avoids early-exit timing signal). */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface SharePasswordRule {
  id: 'length' | 'letterDigit' | 'noSpaces' | 'maxLength';
  ok: boolean;
  labelAr: string;
  labelEn: string;
}

export interface SharePasswordEvaluation {
  rules: SharePasswordRule[];
  /** 0-4: passed rules count. Enabling requires all rules (score 4). */
  score: number;
  passed: boolean;
  strengthAr: 'ضعيفة' | 'متوسطة' | 'قوية' | 'قوية جدًا';
  strengthEn: 'Weak' | 'Fair' | 'Strong' | 'Very strong';
}

/**
 * Password policy for optional share-link passwords (client + owner UI):
 * 8–64 chars, at least one letter (any script) AND one digit, no
 * leading/trailing whitespace. The hash stays the only persisted form.
 */
export function evaluateSharePassword(raw: string): SharePasswordEvaluation {
  const pwd = typeof raw === 'string' ? raw : '';
  const rules: SharePasswordRule[] = [
    {
      id: 'length',
      ok: pwd.length >= 8,
      labelAr: '8 أحرف على الأقل',
      labelEn: 'At least 8 characters',
    },
    {
      // Letters: Latin + Arabic blocks (ES5-safe ranges, no \p{}).
      // Digits: ASCII + Arabic-Indic (٠-٩) + Extended Arabic-Indic.
      id: 'letterDigit',
      ok: /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(pwd) &&
        /[0-9\u0660-\u0669\u06F0-\u06F9]/.test(pwd),
      labelAr: 'حرف + رقم على الأقل',
      labelEn: 'At least one letter and one digit',
    },
    {
      id: 'noSpaces',
      ok: pwd.length > 0 && pwd === pwd.trim() && !/\s/.test(pwd),
      labelAr: 'بدون مسافات',
      labelEn: 'No spaces',
    },
    {
      id: 'maxLength',
      ok: pwd.length > 0 && pwd.length <= 64,
      labelAr: 'بحد أقصى 64 حرفًا',
      labelEn: 'At most 64 characters',
    },
  ];
  const score = rules.filter((r) => r.ok).length;
  const passed = score === rules.length;
  const strengthAr = score <= 1 ? 'ضعيفة' : score === 2 ? 'متوسطة' : score === 3 ? 'قوية' : 'قوية جدًا';
  const strengthEn = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Strong' : 'Very strong';
  return { rules, score, passed, strengthAr, strengthEn };
}
