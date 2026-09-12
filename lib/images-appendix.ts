import type { ReportImageItem } from './types';

/**
 * Phase 4.3 (B16) — single source of truth for "which images are already
 * placed in the body, so the appendix must NOT repeat them".
 *
 * Match priority is strict id-first:
 *   1. imageId  (stable across renames — the authoritative key)
 *   2. src / downloadUrl (stable: renames keep storagePath + URL)
 *   3. fileName (legacy fallback — STALE after rename, kept only so old
 *      content without imageId/src still excludes correctly)
 *   4. seq_N (legacy fallback, same caveat)
 *
 * updateImageFileName() now also propagates the new fileName into the
 * report contentJson, so even the legacy keys stay consistent after a
 * rename and the image can never appear twice.
 */
export function collectEmbeddedImageKeys(contentJson: unknown): Set<string> {
  const keys = new Set<string>();
  const visit = (node: any) => {
    if (!node) return;
    if (node.type === 'reportImage') {
      if (node.attrs?.imageId) keys.add(String(node.attrs.imageId));
      if (node.attrs?.src) keys.add(String(node.attrs.src));
      if (node.attrs?.fileName) keys.add(String(node.attrs.fileName));
      if (node.attrs?.sequenceNumber !== undefined) {
        keys.add(`seq_${node.attrs.sequenceNumber}`);
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(contentJson);
  return keys;
}

export function filterUnplacedImages(
  contentJson: unknown,
  images: ReportImageItem[]
): ReportImageItem[] {
  const embedded = collectEmbeddedImageKeys(contentJson);
  return (images || []).filter((img) => {
    if (!img) return false;
    if (embedded.has(img.id)) return false;
    if (img.downloadUrl && embedded.has(img.downloadUrl)) return false;
    if (img.fileName && embedded.has(img.fileName)) return false;
    if (img.sequenceNumber !== undefined && embedded.has(`seq_${img.sequenceNumber}`)) {
      return false;
    }
    return true;
  });
}

/**
 * Fit dimensions inside a max box preserving aspect ratio.
 * Returns integer DOCX pixel sizes.
 */
export function fitImageBox(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = 520,
  maxHeight = 320
): { width: number; height: number } {
  const w = Number.isFinite(naturalWidth) && naturalWidth > 0 ? naturalWidth : maxWidth;
  const h = Number.isFinite(naturalHeight) && naturalHeight > 0 ? naturalHeight : maxHeight;
  const scale = Math.min(maxWidth / w, maxHeight / h, 1);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
