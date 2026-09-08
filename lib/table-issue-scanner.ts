/**
 * Table Issue Scanner & Parser Engine
 * Extracts structured issue rows from TipTap JSON, HTML, or Markdown document tables.
 */

import { IssueItem } from './types';

export interface ExtractedReportIssue {
  id: string;
  reportId: string;
  title: string;
  severity: 'حرجة' | 'كبيرة' | 'متوسطة' | 'عادية' | 'طفيفة';
  category: string;
  aspect?: string;
  impact?: string;
  recommendation?: string;
  attachment?: string;
  description: string;
  isSynced: boolean;
  syncedIssueId?: string;
}

/**
 * Normalizes any text to canonical Arabic severity values
 */
export function normalizeSeverity(val: string): 'حرجة' | 'كبيرة' | 'متوسطة' | 'عادية' | 'طفيفة' {
  const clean = (val || '').trim().toLowerCase();

  if (
    clean.includes('حرجة') ||
    clean.includes('critical') ||
    clean.includes('حرج') ||
    clean.includes('خطيرة')
  ) {
    return 'حرجة';
  }
  if (
    clean.includes('كبيرة') ||
    clean.includes('major') ||
    clean.includes('كبير') ||
    clean.includes('عالية')
  ) {
    return 'كبيرة';
  }
  if (
    clean.includes('متوسطة') ||
    clean.includes('medium') ||
    clean.includes('متوسط') ||
    clean.includes('معتدلة')
  ) {
    return 'متوسطة';
  }
  if (
    clean.includes('عادية') ||
    clean.includes('normal') ||
    clean.includes('عادي')
  ) {
    return 'عادية';
  }
  if (
    clean.includes('طفيفة') ||
    clean.includes('minor') ||
    clean.includes('طفيف') ||
    clean.includes('منخفضة') ||
    clean.includes('بسيطة')
  ) {
    return 'طفيفة';
  }

  return 'متوسطة';
}

/**
 * SAFEGUARD #1: TipTap Deep Text Extraction
 * Recursively extracts all inner text from node and its children (paragraphs, bold, italic, marks).
 */
export function extractNodeText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.text !== undefined) return node.text;

  if (Array.isArray(node.content)) {
    const isCellOrHeader = node.type === 'tableCell' || node.type === 'tableHeader';
    const sep = isCellOrHeader ? ' ' : '';
    return node.content.map(extractNodeText).join(sep).trim();
  }
  if (Array.isArray(node)) {
    return node.map(extractNodeText).join('');
  }
  return '';
}

/**
 * Cleans and normalizes header strings for reliable fuzzy matching
 */
function cleanHeaderString(header: string): string {
  return (header || '')
    .trim()
    .replace(/[\/\\:*?"<>|\(\)\[\]\-—_]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * SAFEGUARD #2: Dynamic Header-to-Index Mapping
 * Maps column header text to recognized field keys dynamically based on fuzzy match
 */
interface ResolvedHeaderMap {
  title?: number;
  severity?: number;
  category?: number;
  aspect?: number;
  impact?: number;
  recommendation?: number;
  attachment?: number;
  id?: number;
}

function resolveHeaderIndices(headers: string[]): ResolvedHeaderMap {
  const map: ResolvedHeaderMap = {};

  headers.forEach((h, idx) => {
    const clean = cleanHeaderString(h);

    // 1. Severity check (check before title to avoid 'درجة المشكلة' matching 'المشكلة')
    if (
      clean.includes('درجة المشكلة') ||
      clean.includes('درجة الخطورة') ||
      clean.includes('مستوى الخطورة') ||
      clean.includes('الخطورة') ||
      clean.includes('درجة الأهمية') ||
      clean.includes('severity') ||
      clean.includes('priority')
    ) {
      if (map.severity === undefined) map.severity = idx;
      return;
    }

    // 2. ID column
    if (
      clean.includes('رقم المشكلة') ||
      clean.includes('معرف المشكلة') ||
      clean.includes('رمز المشكلة') ||
      clean.includes('issue id') ||
      clean.includes('bug id')
    ) {
      if (map.id === undefined) map.id = idx;
      return;
    }

    // 3. Aspect / Scope column
    if (
      clean.includes('الجانب الخاضع للمراجعة') ||
      clean.includes('الجانب') ||
      clean.includes('جانب المراجعة') ||
      clean.includes('المجال') ||
      clean.includes('aspect') ||
      clean.includes('scope') ||
      clean.includes('domain') ||
      clean.includes('area')
    ) {
      if (map.aspect === undefined) map.aspect = idx;
      return;
    }

    // 4. Category / Component column
    if (
      clean.includes('التصنيف') ||
      clean.includes('المكون') ||
      clean.includes('النظام المتأثر') ||
      clean.includes('القسم') ||
      clean.includes('الوحدة') ||
      clean.includes('category') ||
      clean.includes('component') ||
      clean.includes('module') ||
      clean.includes('system')
    ) {
      if (map.category === undefined) map.category = idx;
      return;
    }

    // 5. Impact column
    if (
      clean.includes('الأثر على المستخدم') ||
      clean.includes('الأثر على الجودة') ||
      clean.includes('الأثر') ||
      clean.includes('التأثير') ||
      clean.includes('الضرر') ||
      clean.includes('impact') ||
      clean.includes('consequence') ||
      clean.includes('effect')
    ) {
      if (map.impact === undefined) map.impact = idx;
      return;
    }

    // 6. Recommendation / Action column
    if (
      clean.includes('التوصية المقترحة') ||
      clean.includes('التوصية') ||
      clean.includes('التوصيات') ||
      clean.includes('الإجراء التصحيحي') ||
      clean.includes('الحل المقترح') ||
      clean.includes('المعالجة') ||
      clean.includes('recommendation') ||
      clean.includes('action') ||
      clean.includes('solution') ||
      clean.includes('remediation')
    ) {
      if (map.recommendation === undefined) map.recommendation = idx;
      return;
    }

    // 7. Attachment / Figure column
    if (
      clean.includes('الشكل') ||
      clean.includes('المرفق') ||
      clean.includes('الصورة') ||
      clean.includes('لقطة الشاشة') ||
      clean.includes('رقم الشكل') ||
      clean.includes('figure') ||
      clean.includes('attachment') ||
      clean.includes('image') ||
      clean.includes('screenshot')
    ) {
      if (map.attachment === undefined) map.attachment = idx;
      return;
    }

    // 8. Title / Problem description column
    if (
      clean.includes('المشكلة') ||
      clean.includes('الحالة المرصودة') ||
      clean.includes('وصف المشكلة') ||
      clean.includes('العطل') ||
      clean.includes('الخلل') ||
      clean.includes('problem') ||
      clean.includes('issue') ||
      clean.includes('defect') ||
      clean.includes('title')
    ) {
      if (map.title === undefined) map.title = idx;
      return;
    }
  });

  return map;
}

/**
 * Computes deterministic unique ID for each extracted row
 */
export function generateDeterministicIssueId(
  reportId: string,
  rowIndex: number,
  title: string
): string {
  const normTitle = (title || '').trim().toLowerCase().slice(0, 40);
  let hash = 0;
  const str = `${reportId}_${rowIndex}_${normTitle}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const cleanId = Math.abs(hash).toString(36);
  return `iss_${reportId || 'rep'}_r${rowIndex}_${cleanId}`;
}

/**
 * Builds structured description from extracted fields
 */
function buildDescription(aspect?: string, impact?: string, recommendation?: string, attachment?: string): string {
  const parts: string[] = [];

  if (aspect && aspect.trim()) {
    parts.push(`**الجانب الخاضع للمراجعة:** ${aspect.trim()}`);
  }
  if (impact && impact.trim()) {
    parts.push(`**الأثر:** ${impact.trim()}`);
  }
  if (recommendation && recommendation.trim()) {
    parts.push(`**التوصية:** ${recommendation.trim()}`);
  }
  if (attachment && attachment.trim()) {
    parts.push(`**الشكل / المرفق:** ${attachment.trim()}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : '**الأثر:** غير محدد\n\n**التوصية:** غير محدد';
}

/**
 * Extracts issues from TipTap Document JSON AST
 */
function extractFromTipTapJson(docJson: any, reportId: string): ExtractedReportIssue[] {
  const issues: ExtractedReportIssue[] = [];
  if (!docJson || typeof docJson !== 'object') return issues;

  // Find all table nodes in the AST
  const tableNodes: any[] = [];
  function findTables(node: any) {
    if (!node) return;
    if (node.type === 'table' && Array.isArray(node.content)) {
      tableNodes.push(node);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(findTables);
    }
  }

  findTables(docJson);

  let globalRowCounter = 0;

  for (const tableNode of tableNodes) {
    const rows = tableNode.content;
    if (!Array.isArray(rows) || rows.length < 2) continue;

    // Header row is typically the first row
    const firstRowCells = Array.isArray(rows[0]?.content) ? rows[0].content : [];
    const headerTexts = firstRowCells.map((cell: any) => extractNodeText(cell));

    // Dynamic Header-to-Index Mapping
    const headerMap = resolveHeaderIndices(headerTexts);

    // If title was not explicitly identified by header text, fallback if at least 2 columns exist
    if (headerMap.title === undefined) {
      if (headerMap.severity !== undefined) {
        // Use first column that is not severity or ID as title
        for (let i = 0; i < headerTexts.length; i++) {
          if (i !== headerMap.severity && i !== headerMap.id) {
            headerMap.title = i;
            break;
          }
        }
      } else if (headerTexts.length >= 3) {
        // Fallback: col 0 is category/id, col 1 is title, col 2 is severity
        headerMap.category = 0;
        headerMap.title = 1;
        headerMap.severity = 2;
      }
    }

    // Process data rows
    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const rowNode = rows[rIdx];
      const cells = Array.isArray(rowNode?.content) ? rowNode.content : [];
      if (cells.length === 0) continue;

      const cellTexts = cells.map((c: any) => extractNodeText(c).trim());

      const title = headerMap.title !== undefined ? cellTexts[headerMap.title] || '' : '';
      if (!title) continue;

      const severityRaw = headerMap.severity !== undefined ? cellTexts[headerMap.severity] || '' : '';
      const category = (headerMap.category !== undefined ? cellTexts[headerMap.category] : '') || 'عام';
      const aspect = headerMap.aspect !== undefined ? cellTexts[headerMap.aspect] : '';
      const impact = headerMap.impact !== undefined ? cellTexts[headerMap.impact] : '';
      const recommendation = headerMap.recommendation !== undefined ? cellTexts[headerMap.recommendation] : '';
      const attachment = headerMap.attachment !== undefined ? cellTexts[headerMap.attachment] : '';

      globalRowCounter++;
      const id = generateDeterministicIssueId(reportId, globalRowCounter, title);

      issues.push({
        id,
        reportId,
        title,
        severity: normalizeSeverity(severityRaw),
        category,
        aspect: aspect || undefined,
        impact: impact || undefined,
        recommendation: recommendation || undefined,
        attachment: attachment || undefined,
        description: buildDescription(aspect, impact, recommendation, attachment),
        isSynced: false,
      });
    }
  }

  return issues;
}

/**
 * Extracts issues from HTML string
 */
function extractFromHtmlString(html: string, reportId: string): ExtractedReportIssue[] {
  const issues: ExtractedReportIssue[] = [];
  if (!html || typeof html !== 'string') return issues;

  // Simple HTML table parser that works in both browser and server runtime
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  let globalRowCounter = 0;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableBody = tableMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[][] = [];

    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableBody)) !== null) {
      const rowContent = rowMatch[1];
      const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
      const cells: string[] = [];

      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        // Strip HTML tags and decode basic entities
        const text = cellMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .trim();
        cells.push(text);
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length < 2) continue;

    const headers = rows[0];
    const headerMap = resolveHeaderIndices(headers);

    if (headerMap.title === undefined && headerMap.severity !== undefined) {
      for (let i = 0; i < headers.length; i++) {
        if (i !== headerMap.severity && i !== headerMap.id) {
          headerMap.title = i;
          break;
        }
      }
    }

    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const cells = rows[rIdx];
      const title = headerMap.title !== undefined ? cells[headerMap.title] || '' : '';
      if (!title) continue;

      const severityRaw = headerMap.severity !== undefined ? cells[headerMap.severity] || '' : '';
      const category = (headerMap.category !== undefined ? cells[headerMap.category] : '') || 'عام';
      const aspect = headerMap.aspect !== undefined ? cells[headerMap.aspect] : '';
      const impact = headerMap.impact !== undefined ? cells[headerMap.impact] : '';
      const recommendation = headerMap.recommendation !== undefined ? cells[headerMap.recommendation] : '';
      const attachment = headerMap.attachment !== undefined ? cells[headerMap.attachment] : '';

      globalRowCounter++;
      const id = generateDeterministicIssueId(reportId, globalRowCounter, title);

      issues.push({
        id,
        reportId,
        title,
        severity: normalizeSeverity(severityRaw),
        category,
        aspect: aspect || undefined,
        impact: impact || undefined,
        recommendation: recommendation || undefined,
        attachment: attachment || undefined,
        description: buildDescription(aspect, impact, recommendation, attachment),
        isSynced: false,
      });
    }
  }

  return issues;
}

/**
 * Extracts issues from Markdown table string
 */
function extractFromMarkdownString(md: string, reportId: string): ExtractedReportIssue[] {
  const issues: ExtractedReportIssue[] = [];
  if (!md || typeof md !== 'string') return issues;

  const lines = md.split('\n').map((l) => l.trim());
  let inTable = false;
  let headers: string[] = [];
  let headerMap: ResolvedHeaderMap = {};
  let globalRowCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      // If line is separator (e.g. |---|---|)
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        inTable = true;
        continue;
      }

      if (!inTable) {
        // This is a candidate header row
        headers = cells;
        headerMap = resolveHeaderIndices(headers);
      } else {
        // This is a data row
        const title = headerMap.title !== undefined ? cells[headerMap.title] || '' : '';
        if (!title) continue;

        const severityRaw = headerMap.severity !== undefined ? cells[headerMap.severity] || '' : '';
        const category = (headerMap.category !== undefined ? cells[headerMap.category] : '') || 'عام';
        const aspect = headerMap.aspect !== undefined ? cells[headerMap.aspect] : '';
        const impact = headerMap.impact !== undefined ? cells[headerMap.impact] : '';
        const recommendation = headerMap.recommendation !== undefined ? cells[headerMap.recommendation] : '';
        const attachment = headerMap.attachment !== undefined ? cells[headerMap.attachment] : '';

        globalRowCounter++;
        const id = generateDeterministicIssueId(reportId, globalRowCounter, title);

        issues.push({
          id,
          reportId,
          title,
          severity: normalizeSeverity(severityRaw),
          category,
          aspect: aspect || undefined,
          impact: impact || undefined,
          recommendation: recommendation || undefined,
          attachment: attachment || undefined,
          description: buildDescription(aspect, impact, recommendation, attachment),
          isSynced: false,
        });
      }
    } else {
      inTable = false;
    }
  }

  return issues;
}

/**
 * Main parser entrypoint: extracts structured issue rows from any content format
 * (TipTap JSON AST, HTML string, or Markdown table).
 */
export function extractIssuesFromContent(content: any, reportId: string = ''): ExtractedReportIssue[] {
  if (!content) return [];

  // 1. If it's a TipTap JSON object
  if (typeof content === 'object') {
    const jsonIssues = extractFromTipTapJson(content, reportId);
    if (jsonIssues.length > 0) return jsonIssues;
  }

  // 2. If it's a string, determine whether it's JSON, HTML, or Markdown
  if (typeof content === 'string') {
    const trimmed = content.trim();

    // Check if JSON string
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        const jsonIssues = extractFromTipTapJson(parsed, reportId);
        if (jsonIssues.length > 0) return jsonIssues;
      } catch {}
    }

    // Check if HTML
    if (trimmed.includes('<table') || trimmed.includes('<tr')) {
      const htmlIssues = extractFromHtmlString(trimmed, reportId);
      if (htmlIssues.length > 0) return htmlIssues;
    }

    // Check if Markdown table
    if (trimmed.includes('|') && trimmed.includes('\n')) {
      const mdIssues = extractFromMarkdownString(trimmed, reportId);
      if (mdIssues.length > 0) return mdIssues;
    }
  }

  return [];
}

/**
 * Cross-references extracted report issues with active Kanban board issues
 * to assign `isSynced: true` and `syncedIssueId`.
 */
export function reconcileWithKanbanStore(
  extractedIssues: ExtractedReportIssue[],
  kanbanIssues: IssueItem[]
): ExtractedReportIssue[] {
  if (!extractedIssues || extractedIssues.length === 0) return [];
  if (!kanbanIssues || kanbanIssues.length === 0) return extractedIssues;

  return extractedIssues.map((issue) => {
    const matched = kanbanIssues.find((k) => {
      const matchReport =
        !k.linkedReportId ||
        !issue.reportId ||
        k.linkedReportId === issue.reportId ||
        (k as any).reportId === issue.reportId;

      const titleA = (k.title || '').trim().toLowerCase();
      const titleB = (issue.title || '').trim().toLowerCase();
      return matchReport && (titleA === titleB || titleA.includes(titleB) || titleB.includes(titleA));
    });

    if (matched) {
      return {
        ...issue,
        isSynced: true,
        syncedIssueId: matched.id,
      };
    }
    return issue;
  });
}
