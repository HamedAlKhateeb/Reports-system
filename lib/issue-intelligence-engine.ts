import {
  IssueItem,
  ReportItem,
  ReportIssueItem,
  EvidenceItem,
  WidgetEntity,
  TableEntity,
} from './types';
import {
  getIssues,
  getReportById,
  createIssue,
  updateIssue,
  updateReport,
  getReportIssues,
  addReportIssueLink,
  removeReportIssueLink,
  getNextIssueKey,
  getWidgets,
  saveWidget,
  recordAuditEvent,
  DEFAULT_PROJECT_ID,
  addEvidence,
  getTablesByReportId,
} from './db';
import { extractIssuesFromContent } from './table-issue-scanner';
import { normalizeSeverity, normalizeStatus } from '@/lib/i18n/dictionary';

export interface CandidateIssue {
  tempId: string;
  reportId: string;
  projectId: string;
  title: string;
  description: string;
  category: string;
  severity: IssueItem['severity'];
  fingerprint: string;
  sourceSection?: string;
  sourceRowId?: string;
  sourceCellRange?: string;
  evidenceText?: string;
  matchType: 'new' | 'exact_match' | 'potential_duplicate' | 'needs_review';
  confidenceScore: number;
  matchedIssueId?: string;
  matchedIssueKey?: string;
  reviewReason?: string;
}

export interface CandidateScanResult {
  totalCandidates: number;
  newCount: number;
  exactMatchesCount: number;
  potentialDuplicatesCount: number;
  needsReviewCount: number;
  errorsCount: number;
  errors: string[];
  candidates: CandidateIssue[];
}

export interface CounterConsistencyReport {
  reportId: string;
  textIssuesCount: number;
  tableIssuesCount: number;
  reportIssueRelationsCount: number;
  kanbanActiveIssuesCount: number;
  widgetIssuesCount: number;
  isConsistent: boolean;
  discrepancies: Array<{
    type: 'unlinked' | 'duplicate_reference' | 'archived' | 'unscanned' | 'permission_or_missing';
    severity: 'warning' | 'error' | 'info';
    messageAr: string;
    messageEn: string;
    details?: any;
  }>;
}

// Arabic normalization helper
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآآ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // Remove tashkeel/diacritics
    .replace(/[\u0640]/g, '') // Remove tatweel
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))) // Normalize digits
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ') // Strip special punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract keywords ignoring common Arabic stop words
const ARABIC_STOP_WORDS = new Set([
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'تم', 'كان', 'ان', 'أن', 'هو', 'هي',
  'التي', 'الذي', 'كل', 'ذلك', 'بين', 'عند', 'حيث', 'او', 'أو', 'لا', 'ما', 'لم', 'لن',
  'the', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'a', 'an', 'is', 'are'
]);

export function extractEssentialKeywords(text: string): string[] {
  const normalized = normalizeArabicText(text);
  const words = normalized.split(' ');
  return words
    .filter((w) => w.length > 2 && !ARABIC_STOP_WORDS.has(w))
    .slice(0, 10);
}

/**
 * 6.1 FINGERPRINT GENERATION
 * Combines project_id, normalized title, normalized description, category, and essential keywords.
 */
export function calculateFingerprint(data: {
  projectId: string;
  title: string;
  description?: string;
  category?: string;
}): string {
  const normTitle = normalizeArabicText(data.title);
  const normDesc = normalizeArabicText(data.description || '');
  const normCat = normalizeArabicText(data.category || 'عام');
  const keywords = extractEssentialKeywords(`${data.title} ${data.description || ''}`).sort().join('_');

  const raw = `${data.projectId}::${normCat}::${normTitle}::${keywords}`;

  // Deterministic 32-bit FNV-1a hash formatted as 16-hex string
  let h1 = 0x811c9dc5;
  let h2 = 0x9dc5811c;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch << 1), 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fp_${part1}${part2}`;
}

/**
 * String similarity ratio (Dice coefficient on character bigrams)
 */
export function calculateSimilarity(strA: string, strB: string): number {
  const a = normalizeArabicText(strA);
  const b = normalizeArabicText(strB);
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const kwA = extractEssentialKeywords(a);
  const kwB = extractEssentialKeywords(b);
  if (kwA.length === 0 || kwB.length === 0) return 0.0;

  let commonKeywords = 0;
  const setB = new Set(kwB);
  for (const k of kwA) {
    if (setB.has(k)) {
      commonKeywords++;
    } else {
      // Check partial stem / prefix match
      for (const kb of kwB) {
        if (k.length > 3 && kb.length > 3 && (k.startsWith(kb) || kb.startsWith(k))) {
          commonKeywords += 0.8;
          break;
        }
      }
    }
  }

  const keywordJaccard = (2 * commonKeywords) / (kwA.length + kwB.length);
  return Math.min(1.0, keywordJaccard);
}

/**
 * 6.2 EXTRACT CANDIDATES
 * Scans report content, extracts candidate issues, and compares them against existing issues.
 */
export async function extractCandidates(
  reportId: string,
  userUid?: string
): Promise<CandidateScanResult> {
  const errors: string[] = [];
  const candidates: CandidateIssue[] = [];

  const report = await getReportById(reportId, userUid);
  if (!report) {
    return {
      totalCandidates: 0,
      newCount: 0,
      exactMatchesCount: 0,
      potentialDuplicatesCount: 0,
      needsReviewCount: 0,
      errorsCount: 1,
      errors: ['التقرير غير موجود أو لا تملك صلاحية الوصول إليه.'],
      candidates: [],
    };
  }

  const projectId = report.project_id || report.projectId || DEFAULT_PROJECT_ID;

  // 1. Scan from document content
  const content = report.contentJson || (report as any).content || '';
  const extractedFromDoc = extractIssuesFromContent(content, reportId);

  // 2. Scan from report analysis rows if any
  const existingAnalysisRows = report.analysisRows || [];

  // Combine unique extracted items by title
  const rawCandidatePool: Array<{
    title: string;
    category: string;
    severity: IssueItem['severity'];
    description: string;
    aspect?: string;
    impact?: string;
    recommendation?: string;
    sourceRowId?: string;
  }> = [];

  const seenTitles = new Set<string>();

  for (const ext of extractedFromDoc) {
    const key = normalizeArabicText(ext.title);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      rawCandidatePool.push({
        title: ext.title,
        category: ext.category || 'عام',
        severity: ext.severity,
        description: ext.description || '',
        aspect: ext.aspect,
        impact: ext.impact,
        recommendation: ext.recommendation,
        sourceRowId: ext.id,
      });
    }
  }

  for (const row of existingAnalysisRows) {
    const key = normalizeArabicText(row.title);
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      rawCandidatePool.push({
        title: row.title,
        category: row.category || 'عام',
        severity: row.severity,
        description: `${row.impact ? `الأثر: ${row.impact}\n` : ''}${row.recommendation ? `التوصية: ${row.recommendation}` : ''}`,
        aspect: row.aspect,
        impact: row.impact,
        recommendation: row.recommendation,
        sourceRowId: row.id,
      });
    }
  }

  // Build Candidate objects with initial fingerprints
  for (let i = 0; i < rawCandidatePool.length; i++) {
    const item = rawCandidatePool[i];
    const fp = calculateFingerprint({
      projectId,
      title: item.title,
      description: item.description,
      category: item.category,
    });

    candidates.push({
      tempId: `cand_${reportId}_${i + 1}_${Date.now().toString(36)}`,
      reportId,
      projectId,
      title: item.title,
      description: item.description,
      category: item.category,
      severity: item.severity,
      fingerprint: fp,
      sourceSection: `تقرير #${report.reportNumber || 1}`,
      sourceRowId: item.sourceRowId,
      matchType: 'new',
      confidenceScore: 1.0,
    });
  }

  // Run candidate comparison
  return await compareCandidates(candidates, projectId, userUid);
}

/**
 * 6.2 COMPARE CANDIDATES
 * Compares candidate issues against active project issues.
 */
export async function compareCandidates(
  candidates: CandidateIssue[],
  projectId: string = DEFAULT_PROJECT_ID,
  userUid?: string
): Promise<CandidateScanResult> {
  const allIssues = await getIssues(userUid);
  // Filter active issues (exclude archived)
  const activeProjectIssues = allIssues.filter(
    (i) =>
      !i.archived_at &&
      !i.archivedAt &&
      (i.project_id === projectId || i.projectId === projectId || !i.project_id)
  );

  let newCount = 0;
  let exactMatchesCount = 0;
  let potentialDuplicatesCount = 0;
  let needsReviewCount = 0;

  const evaluatedCandidates: CandidateIssue[] = candidates.map((cand) => {
    // 1. Exact Fingerprint match
    const exactMatch = activeProjectIssues.find(
      (iss) =>
        (iss.fingerprint && iss.fingerprint === cand.fingerprint) ||
        (normalizeArabicText(iss.title) === normalizeArabicText(cand.title) &&
          normalizeArabicText(iss.category || 'عام') === normalizeArabicText(cand.category || 'عام'))
    );

    if (exactMatch) {
      exactMatchesCount++;
      return {
        ...cand,
        matchType: 'exact_match',
        confidenceScore: 1.0,
        matchedIssueId: exactMatch.id,
        matchedIssueKey: exactMatch.issue_key || exactMatch.issueKey,
        reviewReason: 'تطابق تام مع مشكلة مسجلة مسبقاً في المشروع.',
      };
    }

    // 2. High Text Similarity check
    let highestSim = 0;
    let mostSimilarIssue: IssueItem | null = null;

    for (const iss of activeProjectIssues) {
      const sim = calculateSimilarity(cand.title, iss.title);
      if (sim > highestSim) {
        highestSim = sim;
        mostSimilarIssue = iss;
      }
    }

    if (highestSim >= 0.65 && mostSimilarIssue) {
      potentialDuplicatesCount++;
      return {
        ...cand,
        matchType: 'potential_duplicate',
        confidenceScore: highestSim,
        matchedIssueId: mostSimilarIssue.id,
        matchedIssueKey: mostSimilarIssue.issue_key || mostSimilarIssue.issueKey,
        reviewReason: `تشابه مرتفع (${Math.round(highestSim * 100)}%) مع المشكلة: "${mostSimilarIssue.title}"`,
      };
    }

    if (highestSim >= 0.45 && mostSimilarIssue) {
      needsReviewCount++;
      return {
        ...cand,
        matchType: 'needs_review',
        confidenceScore: highestSim,
        matchedIssueId: mostSimilarIssue.id,
        matchedIssueKey: mostSimilarIssue.issue_key || mostSimilarIssue.issueKey,
        reviewReason: `تشابه جزئي (${Math.round(highestSim * 100)}%) مع المشكلة: "${mostSimilarIssue.title}"`,
      };
    }

    // Completely new issue
    newCount++;
    return {
      ...cand,
      matchType: 'new',
      confidenceScore: 1.0,
    };
  });

  return {
    totalCandidates: candidates.length,
    newCount,
    exactMatchesCount,
    potentialDuplicatesCount,
    needsReviewCount,
    errorsCount: 0,
    errors: [],
    candidates: evaluatedCandidates,
  };
}

/**
 * 6.2 APPROVE CANDIDATES
 * Creates new issues or links existing matches ONLY upon explicit user approval.
 */
export async function approveCandidates(
  approvedCandidateIds: string[],
  allCandidates: CandidateIssue[],
  userUid?: string
): Promise<{ approved: IssueItem[]; linked: ReportIssueItem[]; errors: string[] }> {
  const approvedList: IssueItem[] = [];
  const linkedList: ReportIssueItem[] = [];
  const errors: string[] = [];

  const candidatesToProcess = allCandidates.filter((c) => approvedCandidateIds.includes(c.tempId));

  for (const cand of candidatesToProcess) {
    try {
      if (cand.matchType === 'exact_match' && cand.matchedIssueId) {
        // Link existing issue as reference without duplicate creation!
        const link = await addReportIssueLink({
          report_id: cand.reportId,
          issue_id: cand.matchedIssueId,
          source_section_id: cand.sourceSection,
          source_row_id: cand.sourceRowId,
          relation_type: 'reference',
          created_at: new Date().toISOString(),
        });
        linkedList.push(link);

        await recordAuditEvent({
          actor_id: userUid || 'unknown',
          entity_type: 'issue',
          entity_id: cand.matchedIssueId,
          action: 'approve',
          after_value: { linkId: link.id, reportId: cand.reportId, type: 'reference' },
          reason: 'تم ربط مرشح متطابق كـ Reference بالتقرير دون تكرار',
        });
      } else {
        // Create new unique issue
        const nextKey = await getNextIssueKey(cand.projectId, userUid);
        const newIssue = await createIssue({
          title: cand.title,
          description: cand.description,
          severity: cand.severity,
          category: cand.category,
          status: 'مفتوحة',
          linkedReportId: cand.reportId,
          reportId: cand.reportId,
          sourceSection: cand.sourceSection,
          ownerUid: userUid,
          issue_key: nextKey,
          issueKey: nextKey,
          project_id: cand.projectId,
          projectId: cand.projectId,
          fingerprint: cand.fingerprint,
          first_detected_at: new Date().toISOString(),
          firstDetectedAt: new Date().toISOString(),
        });

        approvedList.push(newIssue);

        // Add primary ReportIssue link
        const link = await addReportIssueLink({
          report_id: cand.reportId,
          issue_id: newIssue.id,
          source_section_id: cand.sourceSection,
          source_row_id: cand.sourceRowId,
          relation_type: 'primary',
          created_at: new Date().toISOString(),
        });
        linkedList.push(link);

        await recordAuditEvent({
          actor_id: userUid || 'unknown',
          entity_type: 'issue',
          entity_id: newIssue.id,
          action: 'create',
          after_value: newIssue,
          reason: 'تم اعتماد وإنشاء مشكلة جديدة بعد مراجعة المرشحين',
        });
      }
    } catch (err: any) {
      console.error('Failed to approve candidate', cand.title, err);
      errors.push(`فشل اعتماد المشكلة "${cand.title}": ${err.message || err}`);
    }
  }

  return { approved: approvedList, linked: linkedList, errors };
}

/**
 * 6.2 MERGE ISSUES
 * Merges duplicate issues into a primary issue.
 * Preserves merge history, re-parents links, and soft-archives duplicates.
 */
export async function mergeIssues(
  primaryIssueId: string,
  duplicateIssueIds: string[],
  reason: string,
  actorId: string = 'system'
): Promise<{ success: boolean; primaryIssue: IssueItem; error?: string }> {
  const allIssues = await getIssues(actorId);
  const primary = allIssues.find((i) => i.id === primaryIssueId);
  if (!primary) {
    return { success: false, primaryIssue: null as any, error: 'المشكلة الأساسية غير موجودة' };
  }

  const now = new Date().toISOString();
  const validDuplicates = allIssues.filter(
    (i) => duplicateIssueIds.includes(i.id) && i.id !== primaryIssueId
  );

  if (validDuplicates.length === 0) {
    return { success: false, primaryIssue: primary, error: 'لا توجد مشاكل مكررة صالحة للدمج' };
  }

  // 1. Reparent all ReportIssue links from duplicates to primary
  for (const dup of validDuplicates) {
    const dupLinks = await getReportIssues(dup.linkedReportId || (dup as any).reportId || '');
    const relevantLinks = dupLinks.filter((l) => l.issue_id === dup.id || l.issueId === dup.id);
    for (const link of relevantLinks) {
      await removeReportIssueLink(link.report_id, dup.id);
      await addReportIssueLink({
        ...link,
        issue_id: primaryIssueId,
        issueId: primaryIssueId,
        relation_type: 'reference',
      });
    }

    // 2. Soft-delete duplicate issue with merge metadata
    await updateIssue(dup.id, {
      archived_at: now,
      archivedAt: now,
      description: `${dup.description || ''}\n\n[تم دمج هذه المشكلة في: ${primary.issue_key || primary.id} - السبب: ${reason}]`,
    });
  }

  // 3. Record AuditEvent with before and after state
  await recordAuditEvent({
    actor_id: actorId,
    entity_type: 'issue',
    entity_id: primaryIssueId,
    action: 'merge',
    before_value: { duplicateIds: duplicateIssueIds },
    after_value: { mergedInto: primaryIssueId, duplicatesCount: validDuplicates.length },
    reason,
  });

  return { success: true, primaryIssue: primary };
}

/**
 * 6.2 SYNC REPORT ISSUES
 * Syncs the report's structured rows with ReportIssue links and active issues.
 */
export async function syncReportIssues(
  reportId: string,
  userUid?: string
): Promise<{ totalLinked: number; reconciledRows: any[] }> {
  const report = await getReportById(reportId, userUid);
  if (!report) return { totalLinked: 0, reconciledRows: [] };

  const links = await getReportIssues(reportId);
  const issues = await getIssues(userUid);
  const now = new Date().toISOString();

  // Match analysisRows with ReportIssue links
  const existingRows = report.analysisRows || [];
  const updatedRows = existingRows.map((row) => {
    // If row already has syncedIssueId, verify it exists
    if (row.syncedIssueId) {
      const matchIssue = issues.find((i) => i.id === row.syncedIssueId);
      if (matchIssue) return row;
    }

    // Find link matching row title or ID
    const matchingLink = links.find((l) => {
      const targetIssue = issues.find((i) => i.id === (l.issue_id || l.issueId));
      if (!targetIssue) return false;
      return (
        normalizeArabicText(targetIssue.title) === normalizeArabicText(row.title) ||
        l.source_row_id === row.id
      );
    });

    if (matchingLink) {
      return {
        ...row,
        syncedIssueId: matchingLink.issue_id || matchingLink.issueId,
      };
    }

    return row;
  });

  await updateReport(reportId, {
    analysisRows: updatedRows,
    last_sync_at: now,
    lastSyncAt: now,
  });

  return { totalLinked: links.length, reconciledRows: updatedRows };
}

/**
 * 6.2 RECALCULATE DASHBOARD
 * Recalculates all query widgets in the specified dashboard.
 */
export async function recalculateDashboard(
  dashboardId: string,
  userUid?: string
): Promise<WidgetEntity[]> {
  const widgets = await getWidgets(dashboardId);
  let allIssues = await getIssues(userUid);
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const issueMap = new Map<string, IssueItem>();
      allIssues.forEach((i) => issueMap.set(i.id, i));
      for (let idx = 0; idx < localStorage.length; idx++) {
        const k = localStorage.key(idx);
        if (k && k.startsWith('review_app_mock_issues')) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) {
              list.forEach((i) => {
                if (i && i.id) issueMap.set(i.id, i);
              });
            }
          }
        }
      }
      allIssues = Array.from(issueMap.values());
    } catch {}
  }
  const now = new Date().toISOString();
  const recalculated: WidgetEntity[] = [];

  for (const w of widgets) {
    let result: any = null;
    let status: WidgetEntity['calculation_status'] = 'success';

    try {
      const source = w.query_config?.source;
      let dataset = allIssues.filter((i) => !i.archived_at && !i.archivedAt);

      if (source?.reportId) {
        dataset = dataset.filter(
          (i) => i.linkedReportId === source.reportId || i.reportId === source.reportId
        );
      } else if (source?.projectId) {
        dataset = dataset.filter(
          (i) => i.project_id === source.projectId || (i as any).projectId === source.projectId
        );
      } else if (source?.ownerUid) {
        dataset = dataset.filter(
          (i) => i.ownerUid === source.ownerUid || (i as any).assignee === source.ownerUid
        );
      }

      if (w.query_config?.filters && w.query_config.filters.length > 0) {
        for (const filter of w.query_config.filters) {
          dataset = dataset.filter((item: any) => {
            let val = item[filter.field];
            let filterVal = filter.value;
            if (filter.field === 'severity') {
              val = normalizeSeverity(val);
              filterVal = Array.isArray(filterVal)
                ? filterVal.map((v) => normalizeSeverity(v))
                : normalizeSeverity(filterVal);
            } else if (filter.field === 'status') {
              val = normalizeStatus(val);
              filterVal = Array.isArray(filterVal)
                ? filterVal.map((v) => normalizeStatus(v))
                : normalizeStatus(filterVal);
            }
            if (filter.operator === 'eq') return val === filterVal;
            if (filter.operator === 'neq') return val !== filterVal;
            if (filter.operator === 'in') return Array.isArray(filterVal) && filterVal.includes(val);
            return true;
          });
        }
      }

      if (w.query_config?.measure === 'count') {
        if (w.query_config.dimension) {
          const counts: Record<string, number> = {};
          const dim = w.query_config.dimension!;
          dataset.forEach((item: any) => {
            let dimVal = item[dim] || 'غير محدد';
            // Normalize to canonical key to prevent Arabic/English duplicates
            if (dim === 'severity') {
              dimVal = normalizeSeverity(dimVal);
            } else if (dim === 'status') {
              dimVal = normalizeStatus(dimVal);
            }
            counts[dimVal] = (counts[dimVal] || 0) + 1;
          });
          result = counts;
        } else {
          result = dataset.length;
        }
      } else {
        result = dataset.length;
      }
    } catch (err) {
      status = 'error';
      result = null;
    }

    const updatedWidget = await saveWidget({
      ...w,
      cached_result: result,
      last_calculated_at: now,
      calculation_status: status,
    });
    recalculated.push(updatedWidget);
  }

  return recalculated;
}

/**
 * 6.3 VERIFY COUNTER CONSISTENCY
 * Compares issues across:
 * 1. Text content in report.
 * 2. Structured table rows.
 * 3. ReportIssue relationships.
 * 4. Active issues on Kanban board.
 * 5. Issues used in Dashboard widgets.
 */
export async function verifyCounterConsistency(
  reportId: string,
  userUid?: string
): Promise<CounterConsistencyReport> {
  const report = await getReportById(reportId, userUid);
  const discrepancies: CounterConsistencyReport['discrepancies'] = [];

  if (!report) {
    return {
      reportId,
      textIssuesCount: 0,
      tableIssuesCount: 0,
      reportIssueRelationsCount: 0,
      kanbanActiveIssuesCount: 0,
      widgetIssuesCount: 0,
      isConsistent: false,
      discrepancies: [
        {
          type: 'permission_or_missing',
          severity: 'error',
          messageAr: 'التقرير غير موجود أو لا تملك صلاحية الوصول إليه.',
          messageEn: 'Report not found or permission denied.',
        },
      ],
    };
  }

  // 1. Text content issues
  const docContent = report.contentJson || (report as any).content || '';
  const textIssues = extractIssuesFromContent(docContent, reportId);
  const textCount = textIssues.length;

  // 2. Table rows issues
  const tableRows = report.analysisRows || [];
  const tableCount = tableRows.length;

  // 3. ReportIssue join table relations
  const reportIssues = await getReportIssues(reportId);
  const relationsCount = reportIssues.length;

  // 4. Kanban active issues for this report
  const allIssues = await getIssues(userUid);
  const activeKanbanIssues = allIssues.filter(
    (i) =>
      !i.archived_at &&
      !i.archivedAt &&
      (i.linkedReportId === reportId || i.reportId === reportId)
  );
  const kanbanCount = activeKanbanIssues.length;

  // 5. Widgets issue count
  const widgets = await getWidgets(`dash_${reportId}`);
  const widgetCount = activeKanbanIssues.length; // baseline active issues for report

  // Check discrepancies
  if (textCount > tableCount) {
    discrepancies.push({
      type: 'unscanned',
      severity: 'info',
      messageAr: `يوجد ${textCount - tableCount} مشاكل مرصودة في نص التقرير لم يتم استخراجها إلى جدول التحليل بعد.`,
      messageEn: `${textCount - tableCount} issues in text have not been extracted into the analysis table.`,
      details: { textCount, tableCount },
    });
  }

  const unsyncedTableRows = tableRows.filter((r) => !r.syncedIssueId);
  if (unsyncedTableRows.length > 0) {
    discrepancies.push({
      type: 'unlinked',
      severity: 'warning',
      messageAr: `يوجد ${unsyncedTableRows.length} مشكلة في جدول التحليل غير مربوطة بسجل المشاكل الموحد.`,
      messageEn: `${unsyncedTableRows.length} rows in the analysis table are not linked to unified issues.`,
      details: unsyncedTableRows.map((r) => r.title),
    });
  }

  // Check for duplicate links pointing to the same issue
  const issueIdCounts: Record<string, number> = {};
  reportIssues.forEach((ri) => {
    const id = ri.issue_id || ri.issueId;
    if (id) {
      issueIdCounts[id] = (issueIdCounts[id] || 0) + 1;
    }
  });
  const duplicateIds = Object.entries(issueIdCounts).filter(([_, count]) => count > 1);
  if (duplicateIds.length > 0) {
    discrepancies.push({
      type: 'duplicate_reference',
      severity: 'warning',
      messageAr: `توجد علاقات مكررة لنفس المشكلة (${duplicateIds.length} مشاكل مكررة في التقرير).`,
      messageEn: `Duplicate references detected for ${duplicateIds.length} issues in report.`,
      details: duplicateIds,
    });
  }

  // Archived issues check
  const archivedIssues = allIssues.filter(
    (i) =>
      (i.archived_at || i.archivedAt) &&
      (i.linkedReportId === reportId || i.reportId === reportId)
  );
  if (archivedIssues.length > 0) {
    discrepancies.push({
      type: 'archived',
      severity: 'info',
      messageAr: `توجد ${archivedIssues.length} مشكلة مؤرشفة (مدمجة أو ملغاة) مستثناة من العداد الفعال.`,
      messageEn: `${archivedIssues.length} archived issues are excluded from active counts.`,
      details: archivedIssues.map((i) => i.title),
    });
  }

  const isConsistent = discrepancies.filter((d) => d.severity === 'error' || d.severity === 'warning').length === 0;

  return {
    reportId,
    textIssuesCount: textCount,
    tableIssuesCount: tableCount,
    reportIssueRelationsCount: relationsCount,
    kanbanActiveIssuesCount: kanbanCount,
    widgetIssuesCount: widgetCount,
    isConsistent,
    discrepancies,
  };
}
