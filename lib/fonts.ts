/**
 * lib/fonts.ts — THE single source of truth for fonts across the app.
 *
 * Used by:
 * - components/editor/* (prose fontFamily mark + pickers)
 * - components/editor/grid/MiniSpreadsheet.tsx (smart-table cell fonts)
 * - components/editor/ReportDrawingView.tsx + components/boards/BoardCanvas.tsx (SVG)
 * - lib/drawing-export.ts + lib/mindmap-export.ts (canvas PNG snapshots)
 * - lib/pdf-export-client.ts + app/share/[token]/page.tsx (print/share HTML)
 * - lib/docx-builder.ts (Word runs)
 *
 * Every family listed here is loaded globally via the Google Fonts @import
 * in app/globals.css — keep both lists in sync.
 */

export interface EditorFont {
  /** Stable id, also the primary family name (e.g. 'Cairo'). */
  id: string;
  labelAr: string;
  labelEn: string;
  /** Full CSS font stack written into marks / formats. */
  stack: string;
}

export const GOOGLE_FONTS_STYLESHEET_URL =
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Readex+Pro:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Tajawal:wght@400;500;700;800&display=swap';

export const EDITOR_FONTS: EditorFont[] = [
  { id: 'Tajawal', labelAr: 'تجوال (افتراضي)', labelEn: 'Tajawal (Default)', stack: "'Tajawal', 'Cairo', sans-serif" },
  { id: 'Cairo', labelAr: 'القاهرة', labelEn: 'Cairo', stack: "'Cairo', 'Tajawal', sans-serif" },
  { id: 'Readex Pro', labelAr: 'ريدكس برو', labelEn: 'Readex Pro', stack: "'Readex Pro', 'Tajawal', sans-serif" },
  { id: 'Noto Sans Arabic', labelAr: 'نوتو عربي', labelEn: 'Noto Sans Arabic', stack: "'Noto Sans Arabic', 'Tajawal', sans-serif" },
  { id: 'IBM Plex Sans Arabic', labelAr: 'آي بي إم بلكس عربي', labelEn: 'IBM Plex Sans Arabic', stack: "'IBM Plex Sans Arabic', 'Tajawal', sans-serif" },
  { id: 'Amiri', labelAr: 'أميري (نسخي)', labelEn: 'Amiri (Serif)', stack: "'Amiri', serif" },
  { id: 'Aref Ruqaa', labelAr: 'عارف رقعة (عناوين)', labelEn: 'Aref Ruqaa (Headings)', stack: "'Aref Ruqaa', 'Amiri', serif" },
  { id: 'Inter', labelAr: 'إنتر (إنجليزي)', labelEn: 'Inter (Latin)', stack: "'Inter', 'Tajawal', sans-serif" },
  { id: 'Roboto', labelAr: 'روبوتو (حديث)', labelEn: 'Roboto (Modern)', stack: "'Roboto', 'Segoe UI', sans-serif" },
  { id: 'Arial', labelAr: 'أريال (قياسي)', labelEn: 'Arial (Standard)', stack: "Arial, Helvetica, sans-serif" },
  { id: 'Georgia', labelAr: 'جورجيا (أنيق)', labelEn: 'Georgia (Serif)', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'Times New Roman', labelAr: 'تايمز نيو رومان', labelEn: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'Courier New', labelAr: 'كود / أحادي العرض', labelEn: 'Courier New (Mono)', stack: "'Courier New', Courier, monospace" },
];

/** Stack applied when no explicit family is chosen (site default). */
export const DEFAULT_FONT_STACK = EDITOR_FONTS[0].stack;

/** Default stack for freeform drawing text + board/mindmap canvases. */
export const CANVAS_FONT_STACK =
  '"Tajawal","Cairo","Readex Pro","Noto Sans Arabic","IBM Plex Sans Arabic",Tahoma,"Segoe UI",sans-serif';

/** Same stack as a DOM/SVG font-family value. */
export const SITE_FONT_STACK =
  "'Tajawal','Cairo','Readex Pro','Noto Sans Arabic','IBM Plex Sans Arabic',Tahoma,'Segoe UI',sans-serif";

/**
 * Match a raw `font-family` CSS value (from a mark attr, cell format, or
 * pasted content) back to a known font. The PRIMARY (first) family decides —
 * stacks like `'Cairo', 'Tajawal', sans-serif` must match Cairo, not Tajawal.
 * Returns undefined for default/unknown.
 */
export function matchEditorFont(rawFamily: string | null | undefined): EditorFont | undefined {
  if (!rawFamily) return undefined;
  const first = String(rawFamily)
    .split(',')[0]
    ?.replace(/['"\s]/g, '')
    .toLowerCase();
  if (first) {
    const exact = EDITOR_FONTS.find((f) => f.id.toLowerCase() === first);
    if (exact) return exact;
  }
  const norm = String(rawFamily).toLowerCase();
  return EDITOR_FONTS.find((f) => norm.includes(f.id.toLowerCase()));
}

/**
 * Strip anything that could break out of an inline `style="font-family: ..."`
 * or `ctx.font` context (pasted Word content is untrusted). Keeps letters,
 * digits, spaces, commas, hyphens and quotes only.
 */
export function sanitizeFontStack(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[<>(){};/\\]/g, '')
    .replace(/["']/g, "'")
    .slice(0, 160)
    .trim();
}

/** Resolve an element/cell font value to a safe, non-empty CSS stack. */
export function resolveFontStack(raw: string | null | undefined, fallback: string = CANVAS_FONT_STACK): string {
  const clean = sanitizeFontStack(raw);
  return clean || fallback;
}

/**
 * Primary family name for Word (.docx) runs — e.g. stack
 * `'Cairo', 'Tajawal', sans-serif` → `Cairo`. Word falls back gracefully
 * when the font isn't installed on the reader's machine.
 */
export function docxPrimaryFont(stack: string | null | undefined, fallback = 'Arial'): string {
  const clean = sanitizeFontStack(stack);
  if (!clean) return fallback;
  const first = clean.split(',')[0]?.replace(/['"\s]/g, '').trim();
  if (!first || !/^[A-Za-z0-9][A-Za-z0-9 \-]*$/.test(first)) return fallback;
  return first;
}

/**
 * Best-effort: wait until the Google fonts are usable for canvas measurement
 * / painting. Without this, PNG snapshots (drawings, mindmaps) silently fall
 * back to a system font. No-op on the server.
 */
export async function ensureDocumentFontsLoaded(): Promise<void> {
  try {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    const loads: Promise<unknown>[] = [];
    for (const f of EDITOR_FONTS) {
      for (const weight of ['400', '700']) {
        try {
          loads.push((document as any).fonts.load(`${weight} 16px "${f.id}"`));
        } catch {}
      }
    }
    await Promise.allSettled(loads);
    try {
      await Promise.race([
        (document as any).fonts.ready,
        new Promise((res) => setTimeout(res, 1500)),
      ]);
    } catch {}
  } catch {}
}
