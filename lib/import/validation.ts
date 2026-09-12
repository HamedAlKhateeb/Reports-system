/**
 * Shared validation for DOCX / XLSX import.
 *
 * Security posture:
 * - Never trust extension or MIME type alone: verify OOXML magic bytes (PK\x03\x04).
 * - Enforce a size cap before reading/parsing so a bad file can't freeze the app.
 * - All parsing happens locally in the browser; the file is never uploaded.
 */

export const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_IMPORT_SHEETS = 10;
export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_COLS = 50;

/**
 * Phase 3.4 (B14) — two-tier column caps, single source of truth.
 * MAX_IMPORT_COLS (50) is the PARSE cap: plain TipTap tables keep up to 50
 * columns. The Smart Table STORE caps at TABLE_LIMITS.MAX_COLS (26) via
 * normalizeColumns. xlsx-import warns with the exact dropped count instead
 * of slicing silently — never raise one cap without the other + its warning.
 */
export { TABLE_LIMITS } from '../grid/table-guards';

export type ImportKind = 'docx' | 'xlsx';

export interface ImportValidationResult {
  ok: boolean;
  kind?: ImportKind;
  errorAr?: string;
  errorEn?: string;
}

const OOXML_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK..

export function detectKindByName(fileName: string): ImportKind | null {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return null;
}

export async function hasOoxmlSignature(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head.length < 4) return false;
    return OOXML_MAGIC.every((b, i) => head[i] === b);
  } catch {
    return false;
  }
}

/**
 * Validate an import candidate file. Reads only the first 4 bytes for the
 * magic-byte check, so this stays cheap even for large files.
 */
export async function validateImportFile(file: File | null | undefined): Promise<ImportValidationResult> {
  if (!file) {
    return { ok: false, errorAr: 'لم يتم اختيار أي ملف.', errorEn: 'No file selected.' };
  }
  const kind = detectKindByName(file.name);
  if (!kind) {
    return {
      ok: false,
      errorAr: 'صيغة غير مدعومة. المسموح فقط: .docx و .xlsx',
      errorEn: 'Unsupported format. Only .docx and .xlsx are allowed.',
    };
  }
  if (file.size === 0) {
    return { ok: false, errorAr: 'الملف فارغ.', errorEn: 'The file is empty.' };
  }
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return {
      ok: false,
      errorAr: `حجم الملف كبير جدًا (الحد الأقصى ${Math.round(MAX_IMPORT_FILE_SIZE / 1024 / 1024)}MB).`,
      errorEn: `File is too large (max ${Math.round(MAX_IMPORT_FILE_SIZE / 1024 / 1024)}MB).`,
    };
  }
  const signatureOk = await hasOoxmlSignature(file);
  if (!signatureOk) {
    return {
      ok: false,
      errorAr: 'الملف تالف أو ليس مستند Office حقيقي (تحقق التوقيع فشل).',
      errorEn: 'File is corrupted or not a genuine Office document (signature check failed).',
    };
  }
  return { ok: true, kind };
}
