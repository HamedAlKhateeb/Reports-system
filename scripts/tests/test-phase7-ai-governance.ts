/**
 * Phase 7 Unit Tests: AI Governance & Insights Engine
 * Run: npx tsx scripts/tests/test-phase7-ai-governance.ts
 */

// Mock browser environment for test runner
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
  createAiProposal,
  approveAiProposal,
  rejectAiProposal,
  getAiProposals,
  generateAutomatedInsights,
  getAuditLog,
} from '../../lib/ai-governance-engine';
import { getIssues, getAuditEvents, createIssue } from '../../lib/db';
import { IssueItem } from '../../lib/types';

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

async function runPhase7Tests() {
  console.log('\n=== RUNNING PHASE 7: AI GOVERNANCE & INSIGHTS TESTS ===\n');

  const testUser = 'user_lead_reviewer';
  const testReportId = 'rep_ai_gov_001';
  const testProjectId = 'proj_security';

  // 1. Setup an existing issue to be proposed for modification
  const initialIssue: IssueItem = await createIssue({
    issue_key: 'SEC-001',
    title: 'احتمالية تسريب في مفاتيح التشفير',
    description: 'تحذير غير مؤكد من المسح الأولي',
    status: 'open',
    severity: 'minor',
    linkedReportId: testReportId,
    project_id: testProjectId,
    ownerUid: testUser,
  });

  // TEST 1: Creation of AI Proposal (No silent edits)
  console.log('Test 1: AI Proposal Creation & Evidence Requirement');
  
  // Should reject proposal without rationale
  let threwWithoutRationale = false;
  try {
    await createAiProposal({
      entity_type: 'issue',
      entity_id: initialIssue.id,
      action: 'update',
      title: 'رفع درجة خطورة المشكلة إلى حرجة',
      description: 'تم اكتشاف تسريب حقيقي في ملفات الإعدادات',
      evidence: { rationale: '' }, // Empty rationale
      before_value: { severity: 'minor' },
      after_value: { severity: 'critical' },
      confidence: 'high',
    });
  } catch {
    threwWithoutRationale = true;
  }
  assert(threwWithoutRationale, 'Creating an AI proposal without evidence rationale is blocked');

  // Valid AI Proposal
  const validProposal = await createAiProposal({
    entity_type: 'issue',
    entity_id: initialIssue.id,
    action: 'update',
    title: 'رفع درجة خطورة المشكلة إلى حرجة',
    description: 'تم اكتشاف تسريب حقيقي في ملفات الإعدادات',
    evidence: {
      source_quotes: ['SECRET_KEY=12345 exposed in public client bundle'],
      rule_citation: 'OWASP-A02:2021 Cryptographic Failures',
      rationale: 'المفتاح الخاص ظهر بشكل صريح في حزمة الكود المفتوحة للعامة',
    },
    before_value: { severity: 'minor' },
    after_value: { severity: 'critical' },
    confidence: 'high',
  }, 'ai_security_bot');

  assert(
    validProposal.status === 'pending' && !!validProposal.id,
    'AI proposal created with status "pending" and valid ID'
  );

  // Verify that target issue in DB was NOT silently modified
  const issuesBeforeApproval = await getIssues(testUser);
  const targetBefore = issuesBeforeApproval.find((i) => i.id === initialIssue.id);
  assert(
    targetBefore?.severity === 'minor',
    'Target issue remains unchanged before explicit user approval (No Silent AI Change)'
  );

  // TEST 2: User Approval & Execution with Audit Logging
  console.log('\nTest 2: Explicit User Approval and Mutation Execution');
  const approvalResult = await approveAiProposal(
    validProposal.id,
    testUser,
    'موافق تماماً على رفع درجة الخطورة بناءً على تقرير OWASP'
  );

  assert(approvalResult.success === true, 'Proposal approval returns success');

  // Verify that target issue is now updated in DB
  const issuesAfterApproval = await getIssues(testUser);
  const targetAfter = issuesAfterApproval.find((i) => i.id === initialIssue.id);
  assert(
    targetAfter?.severity === 'critical',
    'Target issue successfully updated to critical after explicit approval'
  );

  // Verify Proposal state is applied
  const proposals = await getAiProposals();
  const updatedProp = proposals.find((p) => p.id === validProposal.id);
  assert(
    updatedProp?.status === 'applied' && updatedProp.decided_by === testUser,
    'Proposal marked as applied with decided_by user'
  );

  // TEST 3: Audit Trail for Proposal Approval
  console.log('\nTest 3: Audit Trail Verification');
  const auditLogs = await getAuditLog({ entityId: initialIssue.id });
  const approveLog = auditLogs.find((l) => l.metadata?.proposal_id === validProposal.id);
  assert(
    Boolean(
      approveLog &&
      approveLog.actor_id === testUser &&
      approveLog.after_value?.severity === 'critical' &&
      approveLog.reason?.includes('موافق تماماً')
    ),
    'Audit log accurately recorded with actor, before/after values, and user rationale'
  );

  // TEST 4: Double Approval Protection
  console.log('\nTest 4: Double-Approval Protection');
  let doubleApprovalBlocked = false;
  try {
    await approveAiProposal(validProposal.id, testUser);
  } catch {
    doubleApprovalBlocked = true;
  }
  assert(doubleApprovalBlocked, 'Re-approving an already applied proposal is strictly blocked');

  // TEST 5: User Rejection Flow
  console.log('\nTest 5: User Rejection Flow');
  const proposalToReject = await createAiProposal({
    entity_type: 'issue',
    action: 'create',
    title: 'افتراض مشكلة أداء في الشبكة',
    description: 'استجابة متأخرة بمقدار 50 مللي ثانية',
    evidence: {
      rationale: 'تأخر طفيف أثناء وقت التحميل المبدئي',
    },
    after_value: {
      title: 'بطء شبكة افتراضي',
      status: 'open',
      severity: 'minor',
    },
    confidence: 'low',
  }, 'ai_perf_bot');

  const rejectResult = await rejectAiProposal(
    proposalToReject.id,
    testUser,
    'تأخير طبيعي وضمن الحدود المقبولة ولا يستدعي تسجيل مشكلة'
  );
  assert(rejectResult.success === true, 'Proposal rejection succeeds');

  const rejectedProp = (await getAiProposals()).find((p) => p.id === proposalToReject.id);
  assert(
    rejectedProp?.status === 'rejected' && rejectedProp.decided_by === testUser,
    'Proposal correctly marked as rejected'
  );

  // TEST 6: Automated Insights Generation Engine
  console.log('\nTest 6: Automated Insights Engine');
  // Seed multiple critical issues to trigger risk_concentration insight
  await createIssue({
    issue_key: 'SEC-002',
    title: 'تخطي حواجز المصادقة',
    description: 'تخطي حواجز المصادقة عبر ثغرة JWT',
    status: 'open',
    severity: 'critical',
    linkedReportId: testReportId,
    project_id: testProjectId,
    ownerUid: testUser,
  });
  await createIssue({
    issue_key: 'SEC-003',
    title: 'حقن استعلامات SQL',
    description: 'حقن استعلامات SQL في معلمات البحث',
    status: 'open',
    severity: 'critical',
    linkedReportId: testReportId,
    project_id: testProjectId,
    ownerUid: testUser,
  });

  const generatedInsights = await generateAutomatedInsights(
    { projectId: testProjectId, reportId: testReportId },
    testUser
  );

  assert(
    generatedInsights.length > 0 &&
    generatedInsights.some((i) => i.type === 'risk_concentration' && i.severity === 'critical'),
    'Automated insights engine accurately detects critical risk concentration and generates structured insight'
  );

  const riskInsight = generatedInsights.find((i) => i.type === 'risk_concentration');
  assert(
    !!riskInsight &&
    Array.isArray(riskInsight.recommendations) &&
    riskInsight.recommendations.length > 0 &&
    riskInsight.status === 'proposed',
    'Insight provides actionable recommendations with status "proposed" for user review'
  );

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7Tests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
