'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { TableMap, CellSelection } from '@tiptap/pm/tables';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface TableFillHandleProps {
  editor: Editor | null;
}

interface CellCoords {
  row: number;
  col: number;
}

interface HandlePosition {
  top: number;
  left: number;
  visible: boolean;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function normalizeDigits(str: string): { normalized: string; isArabicIndic: boolean } {
  const isArabicIndic = /[٠-٩]/.test(str);
  const normalized = str.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)));
  return { normalized, isArabicIndic };
}

function restoreDigits(str: string, useArabicIndic: boolean): string {
  if (!useArabicIndic) return str;
  return str.replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

/**
 * Infers next values based on source sequence with support for pure numbers,
 * text with numbers, zero padding, and Arabic numerals.
 */
export function inferNextValues(sourceValues: string[], count: number): string[] {
  if (count <= 0) return [];
  const cleanSources = sourceValues.map((v) => v.trim()).filter((v) => v.length > 0);
  if (cleanSources.length === 0) return Array(count).fill('');

  const hasArabicIndic = cleanSources.some((v) => /[٠-٩]/.test(v));
  const normalizedSources = cleanSources.map((v) => normalizeDigits(v).normalized);

  // 1. Pure numbers
  const numRegex = /^-?\d+(\.\d+)?$/;
  if (normalizedSources.every((v) => numRegex.test(v))) {
    const nums = normalizedSources.map((v) => parseFloat(v));
    let step = 1;
    if (nums.length > 1) {
      step = (nums[nums.length - 1] - nums[0]) / (nums.length - 1);
      if (step === 0) step = 1;
    }
    const hasDecimals = normalizedSources.some((v) => v.includes('.'));
    const decimalPlaces = hasDecimals
      ? Math.max(...normalizedSources.map((v) => (v.split('.')[1] || '').length))
      : 0;

    const firstStr = normalizedSources[0];
    const isZeroPadded = !hasDecimals && firstStr.length > 1 && firstStr.startsWith('0');
    const padLen = isZeroPadded ? firstStr.length : 0;

    let lastNum = nums[nums.length - 1];
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      lastNum += step;
      let outStr = hasDecimals ? lastNum.toFixed(decimalPlaces) : String(Math.round(lastNum));
      if (padLen > 0 && !hasDecimals && lastNum >= 0) {
        outStr = outStr.padStart(padLen, '0');
      }
      results.push(restoreDigits(outStr, hasArabicIndic));
    }
    return results;
  }

  // 2. Text + Number pattern (e.g., "Item 1", "Task-001", "BUG-05", "صورة-1", "صورة 1")
  const textNumRegex = /^(.*?)(\d+)(\D*)$/;
  const firstMatch = normalizedSources[0].match(textNumRegex);

  if (firstMatch) {
    const prefix = firstMatch[1];
    const suffix = firstMatch[3];
    const allMatch = normalizedSources.every((v) => {
      const m = v.match(textNumRegex);
      return m && m[1] === prefix && m[3] === suffix;
    });

    if (allMatch) {
      const numbers = normalizedSources.map((v) => parseInt(v.match(textNumRegex)![2], 10));
      const zeroPaddingLen = firstMatch[2].length;
      let step = 1;
      if (numbers.length > 1) {
        step = Math.round((numbers[numbers.length - 1] - numbers[0]) / (numbers.length - 1)) || 1;
      }

      let lastNum = numbers[numbers.length - 1];
      const results: string[] = [];
      for (let i = 0; i < count; i++) {
        lastNum += step;
        const numStr = String(lastNum).padStart(zeroPaddingLen, '0');
        const formatted = `${prefix}${restoreDigits(numStr, hasArabicIndic)}${suffix}`;
        results.push(formatted);
      }
      return results;
    }
  }

  // 3. Repeating / cyclic pattern fallback
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    results.push(cleanSources[i % cleanSources.length]);
  }
  return results;
}

export function TableFillHandle({ editor }: TableFillHandleProps) {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [handlePos, setHandlePos] = useState<HandlePosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragBox, setDragBox] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragPreviewText, setDragPreviewText] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeTableInfoRef = useRef<{
    tablePos: number;
    startCoords: CellCoords;
    endCoords: CellCoords;
    tableMap: any;
    tableNode: any;
    selectedCells: HTMLElement[];
    tableEl: HTMLTableElement;
  } | null>(null);

  const currentDragTargetRef = useRef<CellCoords | null>(null);

  // Measure and position the handle at the bottom-end corner of selection
  const updateHandlePosition = useCallback(() => {
    if (!editor || isDragging) return;

    const { state, view } = editor;
    const { selection } = state;

    // Check if within a table
    let tableNode: any = null;
    let tablePos: number = -1;

    for (let d = selection.$from.depth; d > 0; d--) {
      const node = selection.$from.node(d);
      if (node.type.name === 'table') {
        tableNode = node;
        tablePos = selection.$from.before(d);
        break;
      }
    }

    if (!tableNode || tablePos === -1) {
      setHandlePos(null);
      activeTableInfoRef.current = null;
      return;
    }

    const map = TableMap.get(tableNode);

    // Determine selected range
    let startCoords: CellCoords = { row: 0, col: 0 };
    let endCoords: CellCoords = { row: 0, col: 0 };
    const selectedCells: HTMLElement[] = [];

    if (selection instanceof CellSelection) {
      let minRow = Infinity,
        maxRow = -Infinity,
        minCol = Infinity,
        maxCol = -Infinity;

      selection.forEachCell((_cell, pos) => {
        const rect = map.findCell(pos - tablePos - 1);
        minRow = Math.min(minRow, rect.top);
        maxRow = Math.max(maxRow, rect.bottom - 1);
        minCol = Math.min(minCol, rect.left);
        maxCol = Math.max(maxCol, rect.right - 1);

        try {
          const domAt = view.domAtPos(pos + 1);
          const targetEl = domAt.node instanceof Element ? domAt.node : domAt.node.parentElement;
          const cellEl = (targetEl?.closest('td, th') as HTMLElement) || (view.nodeDOM(pos) as HTMLElement);
          if (cellEl) selectedCells.push(cellEl);
        } catch (_) {
          const domNode = view.nodeDOM(pos) as HTMLElement;
          if (domNode) selectedCells.push(domNode);
        }
      });

      startCoords = { row: minRow, col: minCol };
      endCoords = { row: maxRow, col: maxCol };
    } else {
      let cellPos = -1;
      for (let d = selection.$from.depth; d > 0; d--) {
        const node = selection.$from.node(d);
        if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
          cellPos = selection.$from.before(d);
          break;
        }
      }

      if (cellPos === -1) {
        setHandlePos(null);
        activeTableInfoRef.current = null;
        return;
      }

      const rect = map.findCell(cellPos - tablePos - 1);
      startCoords = { row: rect.top, col: rect.left };
      endCoords = { row: rect.bottom - 1, col: rect.right - 1 };

      try {
        const domAt = view.domAtPos(cellPos + 1);
        const targetEl = domAt.node instanceof Element ? domAt.node : domAt.node.parentElement;
        const cellEl = (targetEl?.closest('td, th') as HTMLElement) || (view.nodeDOM(cellPos) as HTMLElement);
        if (cellEl) selectedCells.push(cellEl);
      } catch (_) {
        const domNode = view.nodeDOM(cellPos) as HTMLElement;
        if (domNode) selectedCells.push(domNode);
      }
    }

    // Robust table element resolution
    let tableEl = selectedCells[0]?.closest('table') as HTMLTableElement | null;
    if (!tableEl) {
      try {
        const domAt = view.domAtPos(tablePos + 1);
        const targetEl = domAt.node instanceof Element ? domAt.node : domAt.node.parentElement;
        tableEl = targetEl?.closest('table') as HTMLTableElement | null;
      } catch (_) {
        tableEl = (view.nodeDOM(tablePos) as HTMLElement)?.querySelector('table') || null;
      }
    }

    if (!tableEl) {
      setHandlePos(null);
      activeTableInfoRef.current = null;
      return;
    }

    // Fallback if selectedCells couldn't be resolved from domAtPos
    if (selectedCells.length === 0) {
      const cellFromTable = tableEl.rows[startCoords.row]?.cells[startCoords.col] as HTMLElement;
      if (cellFromTable) selectedCells.push(cellFromTable);
    }

    if (selectedCells.length === 0) {
      setHandlePos(null);
      activeTableInfoRef.current = null;
      return;
    }

    activeTableInfoRef.current = {
      tablePos,
      startCoords,
      endCoords,
      tableMap: map,
      tableNode,
      selectedCells,
      tableEl,
    };

    const containerEl = containerRef.current || (view.dom.closest('.relative') as HTMLElement) || (view.dom.parentElement as HTMLElement);
    if (!containerEl) return;
    const containerRect = containerEl.getBoundingClientRect();

    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = Infinity;
    let maxBottom = -Infinity;

    selectedCells.forEach((el) => {
      const r = el.getBoundingClientRect();
      minLeft = Math.min(minLeft, r.left);
      maxRight = Math.max(maxRight, r.right);
      minTop = Math.min(minTop, r.top);
      maxBottom = Math.max(maxBottom, r.bottom);
    });

    const selTop = minTop - containerRect.top;
    const selLeft = minLeft - containerRect.left;
    const selWidth = maxRight - minLeft;
    const selHeight = maxBottom - minTop;

    // Check table text direction (computed)
    const isRtlTable = window.getComputedStyle(selectedCells[0]).direction === 'rtl';
    // 14px handle centered at the corner (offset 7px)
    const handleLeft = isRtlTable ? selLeft - 7 : selLeft + selWidth - 7;
    const handleTop = selTop + selHeight - 7;

    setHandlePos({
      top: handleTop,
      left: handleLeft,
      visible: true,
      rect: {
        top: selTop,
        left: selLeft,
        width: selWidth,
        height: selHeight,
      },
    });
  }, [editor, isDragging]);

  // Update on editor transaction, click, or scroll/resize
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      requestAnimationFrame(updateHandlePosition);
    };

    editor.on('transaction', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);
    editor.on('focus', handleUpdate);

    const editorDom = editor.view.dom;
    editorDom.addEventListener('click', handleUpdate);
    editorDom.addEventListener('keyup', handleUpdate);
    editorDom.addEventListener('mouseup', handleUpdate);

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    handleUpdate();

    return () => {
      editor.off('transaction', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
      editor.off('focus', handleUpdate);

      editorDom.removeEventListener('click', handleUpdate);
      editorDom.removeEventListener('keyup', handleUpdate);
      editorDom.removeEventListener('mouseup', handleUpdate);

      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [editor, updateHandlePosition]);

  // Pointer Down on Handle
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!activeTableInfoRef.current || !handlePos) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    currentDragTargetRef.current = { ...activeTableInfoRef.current.endCoords };

    // Initial drag outline
    setDragBox({ ...handlePos.rect });
    setDragPreviewText(null);
  };

  // Pointer Move during Drag
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !activeTableInfoRef.current || !editor || !containerRef.current) return;

    e.preventDefault();
    e.stopPropagation();

    const { tableMap, endCoords, tableEl, startCoords, tablePos, tableNode } = activeTableInfoRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    const tableRect = tableEl.getBoundingClientRect();
    const trList = Array.from(tableEl.querySelectorAll('tr'));

    const pointerY = e.clientY;
    let targetRow = endCoords.row;

    if (pointerY <= tableRect.bottom) {
      // Inside table: find which row the cursor is in
      for (let r = 0; r < trList.length; r++) {
        const trRect = trList[r].getBoundingClientRect();
        if (pointerY >= trRect.top && pointerY <= trRect.bottom) {
          targetRow = r;
          break;
        }
      }
    } else {
      // Below the table: calculate additional rows based on distance from the bottom of the table
      const deltaY = pointerY - tableRect.bottom;
      const lastTr = trList[trList.length - 1];
      const avgRowHeight = lastTr ? Math.max(30, lastTr.getBoundingClientRect().height) : 38;
      const extraRows = Math.max(1, Math.ceil(deltaY / avgRowHeight));
      targetRow = (tableMap.height - 1) + extraRows;
    }

    currentDragTargetRef.current = { row: targetRow, col: endCoords.col };

    // Calculate full-row visual drag outline
    const effectiveMaxRow = Math.max(endCoords.row, targetRow);
    const rowsToAdd = effectiveMaxRow - endCoords.row;

    const startRowIdx = Math.min(startCoords.row, trList.length - 1);
    const startTr = trList[startRowIdx];
    const startRowTop = startTr ? startTr.getBoundingClientRect().top : tableRect.top;

    const tableLeftOnContainer = tableRect.left - containerRect.left;
    const tableWidthOnContainer = tableRect.width;

    let previewTop = startRowTop - containerRect.top;
    let previewHeight = 0;

    const lastTr = trList[trList.length - 1];
    const avgRowHeight = lastTr ? Math.max(30, lastTr.getBoundingClientRect().height) : 38;

    if (effectiveMaxRow < trList.length) {
      const destTr = trList[effectiveMaxRow];
      const destBottom = destTr ? destTr.getBoundingClientRect().bottom : tableRect.bottom;
      previewHeight = destBottom - startRowTop;
    } else {
      const extraCount = effectiveMaxRow - (tableMap.height - 1);
      previewHeight = (tableRect.bottom - startRowTop) + extraCount * avgRowHeight;
    }

    setDragBox({
      top: previewTop,
      left: tableLeftOnContainer,
      width: tableWidthOnContainer,
      height: Math.max(20, previewHeight),
    });

    // Inferred preview badge text
    if (rowsToAdd > 0) {
      // Peek what value will be generated for the sequence column
      const sourceTexts: string[] = [];
      if (startCoords.row === endCoords.row && startCoords.row > 0) {
        const prevOffset = tableMap.positionAt(startCoords.row - 1, startCoords.col, tableNode);
        const prevNode = editor.state.doc.nodeAt(tablePos + prevOffset);
        if (prevNode && prevNode.textContent.trim()) {
          sourceTexts.push(prevNode.textContent.trim());
        }
      }
      for (let r = startCoords.row; r <= endCoords.row; r++) {
        const cellOffset = tableMap.positionAt(r, startCoords.col, tableNode);
        const cellNode = editor.state.doc.nodeAt(tablePos + cellOffset);
        sourceTexts.push(cellNode ? cellNode.textContent.trim() : '');
      }

      const generated = inferNextValues(sourceTexts, rowsToAdd);
      const nextSample = generated[0] || '';
      const rowLabel = rowsToAdd === 1 ? (isAr ? 'صف كامل جديد' : 'new full row') : (isAr ? `${rowsToAdd} صفوف جديدة` : `${rowsToAdd} new rows`);
      setDragPreviewText(`+${rowsToAdd === 1 ? '1 ' : ''}${rowLabel}${nextSample ? ` (${nextSample})` : ''}`);
    } else {
      setDragPreviewText(null);
    }
  };

  // Perform the actual row addition and sequence filling atomically inside the table
  const executeAutoFill = useCallback((targetRow: number) => {
    const info = activeTableInfoRef.current;
    if (!info || !editor) return;

    const { state } = editor;
    const { schema } = state;
    let { tablePos, startCoords, endCoords } = info;

    // Verify current table node
    let tableNode = state.doc.nodeAt(tablePos);
    if (!tableNode || tableNode.type.name !== 'table') {
      for (let d = state.selection.$from.depth; d > 0; d--) {
        const n = state.selection.$from.node(d);
        if (n.type.name === 'table') {
          tableNode = n;
          tablePos = state.selection.$from.before(d);
          break;
        }
      }
    }
    if (!tableNode || tableNode.type.name !== 'table') return;

    const tableMap = TableMap.get(tableNode);
    const numCols = tableMap.width;
    const currentNumRows = tableMap.height;

    const startRow = startCoords.row;
    const endRow = endCoords.row;
    const startCol = startCoords.col;
    const endCol = endCoords.col;

    const countToGenerate = targetRow - endRow;
    if (countToGenerate <= 0) return;

    // 1. Extract source texts and generate sequence for each selected column
    const generatedByCol = new Map<number, string[]>();

    for (let c = startCol; c <= endCol; c++) {
      const sourceTexts: string[] = [];
      // If single row is selected, check previous row to infer step if applicable
      if (startRow === endRow && startRow > 0) {
        const prevOffset = tableMap.positionAt(startRow - 1, c, tableNode);
        const prevCell = state.doc.nodeAt(tablePos + prevOffset);
        if (prevCell && prevCell.textContent.trim()) {
          sourceTexts.push(prevCell.textContent.trim());
        }
      }
      for (let r = startRow; r <= endRow; r++) {
        const cellOffset = tableMap.positionAt(r, c, tableNode);
        const cellNode = state.doc.nodeAt(tablePos + cellOffset);
        sourceTexts.push(cellNode ? cellNode.textContent.trim() : '');
      }

      const generated = inferNextValues(sourceTexts, countToGenerate);
      generatedByCol.set(c, generated);
    }

    const tr = state.tr;

    // 2. Update any existing rows inside the table (between endRow + 1 and currentNumRows - 1)
    const existingRowsToUpdate = Math.min(targetRow, currentNumRows - 1);
    for (let r = endRow + 1; r <= existingRowsToUpdate; r++) {
      const genIdx = r - endRow - 1;
      for (let c = startCol; c <= endCol; c++) {
        const val = generatedByCol.get(c)?.[genIdx];
        if (val !== undefined) {
          const origCellOffset = tableMap.positionAt(r, c, tableNode);
          const origCellPos = tablePos + origCellOffset;
          const mappedCellPos = tr.mapping.map(origCellPos);
          const cellNode = tr.doc.nodeAt(mappedCellPos);
          if (cellNode) {
            const textNode = val ? schema.text(val) : null;
            const pNode = schema.nodes.paragraph.create(null, textNode ? [textNode] : []);
            tr.replaceWith(mappedCellPos + 1, mappedCellPos + cellNode.nodeSize - 1, pNode);
          }
        }
      }
    }

    // 3. Append COMPLETE NEW ROWS if targetRow >= currentNumRows
    if (targetRow >= currentNumRows) {
      const newRowsCount = targetRow - currentNumRows + 1;
      const startIndex = currentNumRows - endRow - 1;

      const newRows: any[] = [];
      for (let i = 0; i < newRowsCount; i++) {
        const genIdx = startIndex + i;
        const cells: any[] = [];

        for (let c = 0; c < numCols; c++) {
          const val = generatedByCol.get(c)?.[genIdx];
          const textNode = val ? schema.text(val) : null;
          const pNode = schema.nodes.paragraph.create(null, textNode ? [textNode] : []);
          const cellNode = schema.nodes.tableCell.create(null, [pNode]);
          cells.push(cellNode);
        }

        const rowNode = schema.nodes.tableRow.create(null, cells);
        newRows.push(rowNode);
      }

      // Insert directly inside the table before the closing tag: strictly tablePos + tableNode.nodeSize - 1
      const mappedTablePos = tr.mapping.map(tablePos);
      const currentTableInTr = tr.doc.nodeAt(mappedTablePos);
      if (currentTableInTr && currentTableInTr.type.name === 'table') {
        const insertPos = mappedTablePos + currentTableInTr.nodeSize - 1;
        tr.insert(insertPos, newRows);
      }
    }

    // Single atomic transaction with full undo/redo support and autosave
    editor.view.dispatch(tr);
    requestAnimationFrame(updateHandlePosition);
  }, [editor, updateHandlePosition]);

  // Pointer Up - Execute Auto-Fill
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    setIsDragging(false);
    setDragBox(null);
    setDragPreviewText(null);

    const target = currentDragTargetRef.current;
    const info = activeTableInfoRef.current;

    if (info && target && target.row > info.endCoords.row) {
      executeAutoFill(target.row);
    }
  };

  // Double Click on Handle: Quick append 1 complete row with the next sequence
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const info = activeTableInfoRef.current;
    if (info) {
      executeAutoFill(info.endCoords.row + 1);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-30"
    >
      {handlePos && handlePos.visible && (
        <>
          {/* Excel-style Active Cell Outline Border */}
          <div
            style={{
              top: `${handlePos.rect.top}px`,
              left: `${handlePos.rect.left}px`,
              width: `${handlePos.rect.width}px`,
              height: `${handlePos.rect.height}px`,
            }}
            className="absolute border-2 border-[#2E4034] dark:border-olive-400 pointer-events-none z-30 transition-all duration-75"
          />

          {/* Draggable Excel-style Fill Handle */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            style={{
              top: `${handlePos.top}px`,
              left: `${handlePos.left}px`,
            }}
            className="group/handle absolute w-3.5 h-3.5 bg-[#2E4034] dark:bg-olive-500 border-2 border-white dark:border-[#161615] rounded-[2px] cursor-crosshair pointer-events-auto shadow-md hover:scale-125 transition-transform z-40 flex items-center justify-center"
            title={isAr ? 'مقبض التعبئة التلقائية (اسحب لأسفل لإضافة صفوف جديدة، أو انقر مرتين لإضافة صف فوري)' : 'Auto-Fill Handle (Drag down to add rows, or double-click to add 1 row)'}
          >
            {/* Tooltip hint on hover */}
            <span className="opacity-0 group-hover/handle:opacity-100 transition-opacity duration-150 pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2E4034] text-white text-[11px] font-bold px-2 py-0.5 shadow-xl border border-white/20 z-50">
              {isAr ? '+ سحب لإضافة صفوف' : '+ Drag to fill'}
            </span>
          </div>
        </>
      )}

      {/* Visual Dashed Drag Box preview covering full table rows */}
      {isDragging && dragBox && (
        <div
          style={{
            top: `${dragBox.top}px`,
            left: `${dragBox.left}px`,
            width: `${dragBox.width}px`,
            height: `${dragBox.height}px`,
          }}
          className="absolute border-2 border-dashed border-[#2E4034] dark:border-olive-400 bg-[#2E4034]/15 dark:bg-olive-500/15 pointer-events-none transition-all duration-75 z-35 flex items-end justify-center pb-2"
        >
          {dragPreviewText && (
            <span className="rounded-md bg-[#2E4034] dark:bg-olive-800 text-white dark:text-olive-100 px-2.5 py-1 text-xs font-semibold shadow-lg border border-white/20">
              {dragPreviewText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
