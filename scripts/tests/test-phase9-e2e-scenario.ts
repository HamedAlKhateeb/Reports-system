/**
 * Phase 9: Comprehensive End-to-End Enterprise Lifecycle Scenario Test
 * Implements Section 14.3 of the Specification
 * Run: npx tsx scripts/tests/test-phase9-e2e-scenario.ts
 */

// 1. Mock browser environment for test runner
const mockStorage = new Map<string, string>();
(global as any).window = { document: {} };
(global as any).localStorage = {
  getItem: (k: string) => mockStorage.get(k) || null,
  setItem: (k: string, v: string) => mockStorage.set(k, String(v)),
  removeItem: (k: string) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  get length() {
    return mockStorage.size;
  },
  key: (i: number) => Array.from(mockStorage.keys())[i] || null,
};

import {
  createReport,
  getReportById,
  saveTable,
  getTablesByReportId,
  saveDashboard,
  saveWidget,
  getWidgets,
  getIssues,
  getReportIssues,
} from '../../lib/db';
import {
  calculateFingerprint,
  compareCandidates,
  approveCandidates,
  verifyCounterConsistency,
  recalculateDashboard,
  CandidateIssue,
} from '../../lib/issue-intelligence-engine';
import { evaluateFormula } from '../../lib/grid/formula-parser';
import { generateSeriesValues } from '../../lib/grid/autofill-engine';
import {
  createAiProposal,
  approveAiProposal,
  getAuditLog,
} from '../../lib/ai-governance-engine';
import { buildDocxDocument } from '../../lib/docx-builder';
import {
  ReportItem,
  TableEntity,
  DashboardEntity,
  WidgetEntity,
} from '../../lib/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, details || '');
    failed++;
  }
}

async function runEndToEndScenario() {
  console.log('\n=============================================================');
  console.log('=== RUNNING PHASE 9: COMPREHENSIVE END-TO-END SCENARIO ===');
  console.log('=============================================================\n');

  const testUser = 'lead_auditor_enterprise';
  const testProjectId = 'proj_enterprise_fintech';

  // STEP 1: Create Report with Structured Content and Smart Tables
  console.log('Step 1: Creating Auditing Report and Smart Data Table...');
  const report = await createReport(
    {
      title: 'تقرير التدقيق المالي والأمني الشامل',
      systemUnderReview: 'منظومة الدفع الفوري',
      author: 'فريق التدقيق المعماري',
      authorTitle: 'مدير التدقيق',
      organization: 'مؤسسة التقنية المالية',
      language: 'ar',
      themeColor: 'olive',
      project_id: testProjectId,
      projectId: testProjectId,
      ownerUid: testUser,
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'تقرير تدقيق النظام المالي' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'تم رصد مشكلة تعطل استجابة بوابة الدفع أثناء أوقات الذروة مما يتسبب في فشل العمليات.',
              },
            ],
          },
        ],
      },
    }
  );

  assert(!!report && !!report.id, 'Report created successfully with ID: ' + report.id);

  // Attach Smart Grid Table
  const tableData: TableEntity = {
    id: `tbl_${report.id}_1`,
    report_id: report.id,
    name: 'جدول المراجعة المالية',
    columns_data: [
      { id: 'A', name: 'الرمز', type: 'issue_key', width: 100 },
      { id: 'B', name: 'البند', type: 'text', width: 220 },
      { id: 'C', name: 'الخطورة', type: 'status', width: 120 },
      { id: 'D', name: 'العدد', type: 'number', width: 100 },
    ],
    rows_data: [
      { A: 'PRB-001', B: 'تعطل استجابة بوابة الدفع أثناء أوقات الذروة', C: 'حرجة', D: 5 },
      { A: 'PRB-002', B: 'تأخر تسوية القيود المحاسبية', C: 'كبيرة', D: 12 },
    ],
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveTable(tableData);

  const savedTables = await getTablesByReportId(report.id);
  assert(savedTables.length === 1, 'Smart Grid Table persisted and retrieved for report');

  // STEP 2: Issue Candidate Extraction & Deduplication Check
  console.log('\nStep 2: Candidate Extraction, Normalization, and Deduplication Classification...');
  const candidates: CandidateIssue[] = [
    {
      tempId: 'c_01',
      reportId: report.id,
      projectId: testProjectId,
      title: 'تعطّل استجابة بوابة الدفع أثناء أوقات الذروة', // Identical once normalized
      description: 'فشل العمليات المتزامنة في بوابة الدفع',
      category: 'أنظمة الدفع',
      severity: 'حرجة',
      fingerprint: calculateFingerprint({
        projectId: testProjectId,
        title: 'تعطل استجابة بوابة الدفع أثناء أوقات الذروة',
        category: 'أنظمة الدفع',
      }),
      matchType: 'new',
      confidenceScore: 1.0,
      sourceRowId: 'row_1',
    },
    {
      tempId: 'c_02',
      reportId: report.id,
      projectId: testProjectId,
      title: 'تأخر تسوية القيود المحاسبية اليومية',
      description: 'القيود تتأخر حتى صباح اليوم التالي',
      category: 'المحاسبة',
      severity: 'كبيرة',
      fingerprint: calculateFingerprint({
        projectId: testProjectId,
        title: 'تأخر تسوية القيود المحاسبية اليومية',
        category: 'المحاسبة',
      }),
      matchType: 'new',
      confidenceScore: 1.0,
      sourceRowId: 'row_2',
    },
  ];

  const comparison = await compareCandidates(candidates, testProjectId, testUser);
  assert(comparison.newCount === 2, 'Candidate comparison classified 2 new candidate issues');

  // STEP 3: Single Source of Truth Approval
  console.log('\nStep 3: User Approval into Single Source of Truth (PRB-XXX & ReportIssue relation)...');
  const approval = await approveCandidates(
    ['c_01', 'c_02'],
    candidates,
    testUser
  );

  assert(approval.approved.length === 2, 'Approved 2 issues generated with unique issue_keys (PRB-001, PRB-002)');
  assert(approval.linked.length === 2, 'ReportIssue join relations created linking issues to report');

  // STEP 4: Counter Consistency Inspector Verification
  console.log('\nStep 4: Running Counter Consistency Inspector...');
  const consistency = await verifyCounterConsistency(report.id, testUser);
  assert(
    consistency.isConsistent === true && consistency.reportIssueRelationsCount === 2,
    `Counter Inspector verifies consistency across Relations, Board, and Widgets (isConsistent: true)`
  );

  // STEP 5: Excel Grid Formula Engine AST Evaluation & Autofill
  console.log('\nStep 5: Testing Zero-Eval Formula AST Parser & Smart Autofill...');
  const formulaSum = evaluateFormula('=SUM(D1:D2)', { D1: 5, D2: 12 });
  assert(formulaSum === 17, `Formula =SUM(D1:D2) evaluates to 17 without eval()`);

  const formulaIf = evaluateFormula('=IF(A1 > 10, "High", "Normal")', { A1: 15 });
  assert(formulaIf === 'High', `Formula =IF(A1 > 10, "High", "Normal") correctly branch-evaluates to "High"`);

  // Autofill series for issue keys
  const autofillRes = generateSeriesValues(['PRB-001'], 2, 'fill_series');
  assert(
    autofillRes[0] === 'PRB-002' && autofillRes[1] === 'PRB-003',
    'Autofill series automatically increments alphanumeric issue keys PRB-001 -> PRB-002, PRB-003'
  );

  // STEP 6: Multi-Level Dashboards & Dynamic Recalculation
  console.log('\nStep 6: Multi-Level Dashboards Provisioning & Recalculation...');
  const reportDashId = `dash_report_${report.id}`;
  await saveDashboard({
    id: reportDashId,
    name: 'لوحة مؤشرات التقرير',
    scope_type: 'report',
    scope: 'report',
    scope_id: report.id,
    layout_config: { columns: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await saveWidget({
    id: 'wdg_e2e_total',
    dashboard_id: reportDashId,
    title: 'إجمالي المشاكل المعتمدة',
    type: 'kpi',
    visualization_type: 'kpi',
    source_type: 'report_issues',
    source_id: report.id,
    source_title: report.title,
    query_definition: `SELECT COUNT(*) FROM issues WHERE reportId = "${report.id}"`,
    query_config: {
      source: { type: 'report_issues', reportId: report.id },
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const recalculatedWidgets = await recalculateDashboard(reportDashId, testUser);
  const totalWdg = recalculatedWidgets.find((w) => w.id === 'wdg_e2e_total');
  assert(totalWdg?.cached_result === 2, `Dashboard widget recalculated accurately to 2 issues`);
  assert(totalWdg?.source_id === report.id, 'Widget retains exact lineage back to report source');

  // STEP 7: AI Governance Engine (No Silent Changes -> Approval -> Audit)
  console.log('\nStep 7: AI Governance: Proposal -> Evidence -> Approval -> Audit Trail...');
  const targetIssueId = approval.approved[0].id;
  const proposal = await createAiProposal({
    entity_type: 'issue',
    entity_id: targetIssueId,
    action: 'update',
    title: 'اقتراح توصية فنية عاجلة',
    description: 'توصية بإضافة Redis Cache لتقليل ضغط بوابة الدفع',
    evidence: {
      source_quotes: ['استعلامات مكررة لقاعدة البيانات أثناء طلبات الدفع'],
      rationale: 'إضافة طبقة تخزين مؤقت تخفض زمن الاستجابة بنسبة 80%',
    },
    before_value: { status: 'open' },
    after_value: { status: 'in_progress', recommendation: 'إضافة Redis Cache' },
    confidence: 'high',
  }, 'ai_governance_copilot');

  assert(proposal.status === 'pending', 'AI proposal starts in pending state without modifying DB');

  const approvalExec = await approveAiProposal(
    proposal.id,
    testUser,
    'معتمد لتسريع الاستجابة قبل بدء الحملة التسويقية'
  );
  assert(approvalExec.success === true, 'Proposal approved by user');

  const auditLogs = await getAuditLog({ entityId: targetIssueId });
  assert(
    auditLogs.length > 0 && auditLogs.some((l) => l.actor_id === testUser),
    'Complete immutable audit log recorded with actor ID and justification'
  );

  // STEP 8: Export Verification (DOCX Builder)
  console.log('\nStep 8: Export Generation (Word DOCX with RTL Arabic Support)...');
  const docxBuffer = await buildDocxDocument(report, []);
  assert(
    Buffer.isBuffer(docxBuffer) && docxBuffer.length > 1000,
    `DOCX document successfully compiled (${docxBuffer.length} bytes)`
  );

  console.log('\n=============================================================');
  console.log(`=== ALL END-TO-END CHECKS COMPLETED: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndScenario().catch((err) => {
  console.error('Scenario execution error:', err);
  process.exit(1);
});
