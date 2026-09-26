'use client';

import type { DrawingElement } from './drawing/types';
import { elementsBounds, wrapTextLines } from './drawing/geometry';
import { CANVAS_FONT_STACK, ensureDocumentFontsLoaded, resolveFontStack } from './fonts';

/** Font stack for one element: its own choice, else the unified site stack. */
function elementFont(el: DrawingElement): string {
  return resolveFontStack(el.fontFamily, CANVAS_FONT_STACK);
}

export interface DrawingDocEntry {
  id: string;
  title: string;
  caption: string;
  elements: DrawingElement[];
}

export function collectDrawings(contentJson: any): DrawingDocEntry[] {
  const out: DrawingDocEntry[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'reportDrawing' && node.attrs?.drawingId) {
      const els = Array.isArray(node.attrs.elements) ? node.attrs.elements : [];
      out.push({
        id: String(node.attrs.drawingId),
        title: String(node.attrs.title || ''),
        caption: String(node.attrs.caption || ''),
        elements: els,
      });
    }
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(contentJson);
  return out.filter((d) => d.elements.length > 0);
}

function drawElements(ctx: CanvasRenderingContext2D, elements: DrawingElement[], ox: number, oy: number) {
  for (const el of elements || []) {
    const stroke = el.strokeColor || '#1e1e1e';
    const lw = Number(el.strokeWidth) || 2;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.fillStyle = el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : 'transparent';
    ctx.lineWidth = lw;
    if (el.strokeStyle === 'dashed') ctx.setLineDash([7, 6]);
    else if (el.strokeStyle === 'dotted') ctx.setLineDash([2, 5]);
    else ctx.setLineDash([]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const x = Number(el.x) || 0;
    const y = Number(el.y) || 0;
    const w = Number(el.width) || 0;
    const h = Number(el.height) || 0;
    if (el.rotation) {
      const cx = ox + x + w / 2;
      const cy = oy + y + h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    if (el.type === 'rectangle' || el.type === 'note') {
      const x0 = Math.min(x, x + w); const y0 = Math.min(y, y + h);
      const ww = Math.abs(w); const hh = Math.abs(h);
      if (ctx.fillStyle !== 'transparent') ctx.fillRect(ox + x0, oy + y0, ww, hh);
      ctx.strokeRect(ox + x0, oy + y0, ww, hh);
      if (el.text) {
        const tColor = el.textColor || stroke;
        const tFs = Number(el.fontSize) || 18;
        const pad = 12;
        const maxW = Math.max(20, ww - pad * 2);
        ctx.font = `700 ${tFs}px ${elementFont(el)}`;
        const lines = wrapTextLines(el.text, maxW, tFs, (txt) => ctx.measureText(txt).width);
        const lineH = Math.ceil(tFs * 1.35);
        const totalH = lines.length * lineH;
        let tY = oy + y0 + (hh - totalH) / 2 + tFs * 0.85;
        const tCx = ox + x0 + ww / 2;
        ctx.fillStyle = tColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        for (const line of lines) {
          ctx.fillText(line || ' ', tCx, tY, maxW);
          tY += lineH;
        }
      }
    } else if (el.type === 'ellipse') {
      const cx = Math.min(x, x + w) + Math.abs(w) / 2;
      const cy = Math.min(y, y + h) + Math.abs(h) / 2;
      ctx.beginPath();
      ctx.ellipse(ox + cx, oy + cy, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
      if (ctx.fillStyle !== 'transparent') ctx.fill();
      ctx.stroke();
      if (el.text) {
        const tColor = el.textColor || stroke;
        const tFs = Number(el.fontSize) || 18;
        const maxW = Math.max(20, (Math.abs(w) - 20) * 0.82);
        ctx.font = `700 ${tFs}px ${elementFont(el)}`;
        const lines = wrapTextLines(el.text, maxW, tFs, (txt) => ctx.measureText(txt).width);
        const lineH = Math.ceil(tFs * 1.35);
        const totalH = lines.length * lineH;
        let tY = oy + cy - totalH / 2 + tFs * 0.85;
        const tCx = ox + cx;
        ctx.fillStyle = tColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        for (const line of lines) {
          ctx.fillText(line || ' ', tCx, tY, maxW);
          tY += lineH;
        }
      }
    } else if (el.type === 'diamond') {
      const x0 = Math.min(x, x + w); const y0 = Math.min(y, y + h);
      const ww = Math.abs(w); const hh = Math.abs(h);
      ctx.beginPath();
      ctx.moveTo(ox + x0 + ww / 2, oy + y0);
      ctx.lineTo(ox + x0 + ww, oy + y0 + hh / 2);
      ctx.lineTo(ox + x0 + ww / 2, oy + y0 + hh);
      ctx.lineTo(ox + x0, oy + y0 + hh / 2);
      ctx.closePath();
      if (ctx.fillStyle !== 'transparent') ctx.fill();
      ctx.stroke();
      if (el.text) {
        const tColor = el.textColor || stroke;
        const tFs = Number(el.fontSize) || 18;
        const maxW = Math.max(20, (ww - 20) * 0.65);
        ctx.font = `700 ${tFs}px ${elementFont(el)}`;
        const lines = wrapTextLines(el.text, maxW, tFs, (txt) => ctx.measureText(txt).width);
        const lineH = Math.ceil(tFs * 1.35);
        const totalH = lines.length * lineH;
        let tY = oy + y0 + (hh - totalH) / 2 + tFs * 0.85;
        const tCx = ox + x0 + ww / 2;
        ctx.fillStyle = tColor;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        for (const line of lines) {
          ctx.fillText(line || ' ', tCx, tY, maxW);
          tY += lineH;
        }
      }
    } else if (el.type === 'text') {
      const tFs = Number(el.fontSize) || 18;
      const tColor = el.textColor || stroke;
      const maxW = Math.max(40, Math.abs(w || 180));
      ctx.font = `700 ${tFs}px ${elementFont(el)}`;
      const lines = wrapTextLines(el.text || '', maxW, tFs, (txt) => ctx.measureText(txt).width);
      const tLineH = Math.ceil(tFs * 1.35);
      const tBlockH = Math.max(1, lines.length) * tLineH;
      const tCx = ox + x + w / 2;
      let tY = oy + y + (h - tBlockH) / 2 + tFs * 0.85;
      ctx.fillStyle = tColor;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      for (const line of lines) {
        ctx.fillText(line || ' ', tCx, tY, maxW);
        tY += tLineH;
      }
    } else if (el.type === 'freedraw') {
      const pts = Array.isArray(el.points) ? el.points : [];
      if (pts.length > 1) {
        ctx.beginPath();
        pts.forEach((p: any, i: number) => {
          const px = ox + (Number(p.x) || 0); const py = oy + (Number(p.y) || 0);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    } else if (el.type === 'arrow' || el.type === 'line') {
      const pts = Array.isArray(el.points) && el.points.length >= 2
        ? el.points
        : [{ x, y }, { x: x + w, y: y + h }];
      const p1 = pts[0]; const p2 = pts[pts.length - 1];
      ctx.beginPath();
      ctx.moveTo(ox + Number(p1.x), oy + Number(p1.y));
      ctx.lineTo(ox + Number(p2.x), oy + Number(p2.y));
      ctx.stroke();
      if (el.type === 'arrow') {
        const ang = Math.atan2(Number(p2.y) - Number(p1.y), Number(p2.x) - Number(p1.x));
        const hl = 12;
        ctx.save();
        ctx.translate(ox + Number(p2.x), oy + Number(p2.y));
        ctx.rotate(ang);
        ctx.fillStyle = stroke;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-hl, -hl / 2.4); ctx.lineTo(-hl, hl / 2.4);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

export interface DrawingSnapshot { dataUrl: string; width: number; height: number }

export async function snapshotDrawings(contentJson: any): Promise<Record<string, DrawingSnapshot>> {
  const out: Record<string, DrawingSnapshot> = {};
  if (typeof document === 'undefined') return out;
  // Paint with the real Google fonts, not a silent system-font fallback.
  await ensureDocumentFontsLoaded();
  const entries = collectDrawings(contentJson);
  for (const entry of entries) {
    try {
      const bounds = elementsBounds(entry.elements);
      if (!bounds) continue;
      const { minX, minY, maxX, maxY } = bounds;
      const PAD = 24; const SCALE = 2;
      const W = Math.ceil(maxX - minX + PAD * 2); const H = Math.ceil(maxY - minY + PAD * 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, W * SCALE); canvas.height = Math.max(2, H * SCALE);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.scale(SCALE, SCALE);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      drawElements(ctx, entry.elements, -minX + PAD, -minY + PAD);
      const dataUrl = canvas.toDataURL('image/png');
      out[entry.id] = { dataUrl, width: canvas.width, height: canvas.height };
    } catch (err) {
      console.warn('Drawing snapshot failed for', entry.id, err);
    }
  }
  return out;
}
