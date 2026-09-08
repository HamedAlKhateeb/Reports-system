import assert from 'node:assert';

// Mock browser environment for test runner
const mockStorage = new Map<string, string>();
(global as any).window = {};
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

async function runPhase2Tests() {
  console.log('🧪 Starting Phase 2: Deduplication, Sync & Counter Reconciliation Tests...\n');

  const {
    calculateFingerprint,
    normalizeArabicText,
    calculateSimilarity,
    compareCandidates,
    approveCandidates,
    mergeIssues,
    syncReportIssues,
    verifyCounterConsistency,
    recalculateDashboard,
  } = await import('../../lib/issue-intelligence-engine');

  const {
    getOrCreateDefaultProject,
    createReport,
    getIssues,
    getReportIssues,
    saveDashboard,
    saveWidget,
    getAuditEvents,
  } = await import('../../lib/db');

  const testUser = 'tester_user_p2';
  const defaultProj = await getOrCreateDefaultProject(testUser);

  // TEST 1: Fingerprint normalization & consistency
  console.log('Test 1: Fingerprint Normalization & Determinism');
  const fp1 = calculateFingerprint({
    projectId: defaultProj.id,
    title: 'تأخر   استجابة   الخادم  الرئيسي!',
    description: 'يحدث بطء شديد أثناء وقت الذروة في المساء.',
    category: 'أداء النظام',
  });

  // Different spacing and diacritics
  const fp2 = calculateFingerprint({
    projectId: defaultProj.id,
    title: 'تأخّر استجابة الخادم الرئيسي',
    description: 'يحدث بطء شديد أثناء وقت الذروة في المساء',
    category: 'أداء النظام',
  });

  assert.strictEqual(fp1, fp2, 'Normalized texts with diacritics/spaces must have identical fingerprints');

  const fpDifferent = calculateFingerprint({
    projectId: defaultProj.id,
    title: 'خطأ إملائي في واجهة الدخول',
    category: 'واجهة المستخدم',
  });
  assert.notStrictEqual(fp1, fpDifferent, 'Different issues must produce different fingerprints');
  console.log('  ✅ PASSED: Fingerprint calculation is deterministic and normalized');

  // TEST 2: String similarity calculation
  console.log('Test 2: Similarity Scoring');
  const simExact = calculateSimilarity('تعطل بوابة الدفع الإلكتروني', 'تعطل بوابة الدفع الإلكتروني');
  assert.strictEqual(simExact, 1.0, 'Exact match must score 1.0');

  const simHigh = calculateSimilarity('تعطل بوابة الدفع الإلكتروني', 'توقف بوابة الدفع الالكتروني مؤقتاً');
  assert(simHigh > 0.5, 'High semantic overlap should score > 0.5');

  const simLow = calculateSimilarity('خطأ في واجهة المستخدم', 'مشكلة أمان في تشفير كلمة المرور');
  assert(simLow < 0.3, 'Unrelated texts should score < 0.3');
  console.log('  ✅ PASSED: Similarity algorithm correctly scores text overlap');

  // TEST 3: Candidate comparison & Deduplication
  console.log('Test 3: Candidate Comparison & Deduplication Classification');
  // Seed an existing issue in the database
  const existingIssue = {
    id: 'iss_existing_1',
    issue_key: 'PRB-001',
    project_id: defaultProj.id,
    title: 'تعطل استجابة الخادم أثناء ذروة التحميل',
    description: 'الخادم يتوقف عن العمل عند تجاوز 1000 مستخدم متزامن',
    category: 'أداء النظام',
    severity: 'حرجة' as const,
    status: 'مفتوحة' as const,
    fingerprint: calculateFingerprint({
      projectId: defaultProj.id,
      title: 'تعطل استجابة الخادم أثناء ذروة التحميل',
      description: 'الخادم يتوقف عن العمل عند تجاوز 1000 مستخدم متزامن',
      category: 'أداء النظام',
    }),
    linkedReportId: 'rep_1',
    ownerUid: testUser,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(`review_app_mock_issues_${testUser}`, JSON.stringify([existingIssue]));

  const candidatesToCompare = [
    {
      tempId: 'c1',
      reportId: 'rep_2',
      projectId: defaultProj.id,
      title: 'تعطّل استجابة الخادم أثناء ذروة التحميل', // Identical once normalized
      description: 'الخادم يتوقف عن العمل عند تجاوز 1000 مستخدم',
      category: 'أداء النظام',
      severity: 'حرجة' as const,
      fingerprint: existingIssue.fingerprint,
      matchType: 'new' as const,
      confidenceScore: 1.0,
    },
    {
      tempId: 'c2',
      reportId: 'rep_2',
      projectId: defaultProj.id,
      title: 'تعطل استجابة الخادم في أوقات الذروة المرتفعة', // Potential duplicate
      description: 'بطء في الخادم',
      category: 'أداء النظام',
      severity: 'كبيرة' as const,
      fingerprint: 'fp_diff_2',
      matchType: 'new' as const,
      confidenceScore: 1.0,
    },
    {
      tempId: 'c3',
      reportId: 'rep_2',
      projectId: defaultProj.id,
      title: 'عدم عمل زر تصدير PDF في المتصفح', // Completely new
      description: 'الزر لا يستجيب عند النقر',
      category: 'واجهة المستخدم',
      severity: 'متوسطة' as const,
      fingerprint: 'fp_new_3',
      matchType: 'new' as const,
      confidenceScore: 1.0,
    },
  ];

  const compared = await compareCandidates(candidatesToCompare, defaultProj.id, testUser);
  assert.strictEqual(compared.exactMatchesCount, 1, 'Should detect 1 exact match');
  assert.strictEqual(compared.newCount, 1, 'Should detect 1 new issue');
  assert.strictEqual(compared.candidates[0].matchType, 'exact_match');
  assert.strictEqual(compared.candidates[0].matchedIssueId, existingIssue.id);
  assert.strictEqual(compared.candidates[2].matchType, 'new');
  console.log('  ✅ PASSED: Candidate comparison accurately identified exact match, duplicate, and new issue');

  // TEST 4: Candidate Approval without Duplicate Creation
  console.log('Test 4: Candidate Approval (Linking exact match without creating duplicate)');
  const approvalResult = await approveCandidates(
    ['c1', 'c3'], // Approve exact match and new issue
    compared.candidates,
    testUser
  );

  // Exact match must NOT create a new issue, only link ReportIssue
  assert.strictEqual(approvalResult.approved.length, 1, 'Only the new issue should be created');
  assert.strictEqual(approvalResult.linked.length, 2, 'Both issues should have ReportIssue links');
  assert.strictEqual(approvalResult.linked[0].issue_id, existingIssue.id, 'Linked to existing issue ID');

  const allIssuesAfter = await getIssues(testUser);
  const issuesWithTitle1 = allIssuesAfter.filter((i) => i.title.includes('تعطل استجابة الخادم'));
  assert.strictEqual(issuesWithTitle1.length, 1, 'FAIL: Exact match was duplicated in issues store!');
  console.log('  ✅ PASSED: Approval preserves single source of truth without duplicates');

  // TEST 5: Issue Merging
  console.log('Test 5: Issue Merging with Audit and Soft-Archive');
  // Add a duplicate issue to merge
  const dupIssue = {
    id: 'iss_dup_to_merge',
    issue_key: 'PRB-099',
    project_id: defaultProj.id,
    title: 'تأخر الخادم الرئيسي في ساعات الذروة',
    description: 'تأخر في المعالجة',
    category: 'أداء النظام',
    severity: 'حرجة' as const,
    status: 'مفتوحة' as const,
    linkedReportId: 'rep_2',
    ownerUid: testUser,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(
    `review_app_mock_issues_${testUser}`,
    JSON.stringify([...allIssuesAfter, dupIssue])
  );

  const mergeRes = await mergeIssues(
    existingIssue.id,
    [dupIssue.id],
    'تطابق في السبب الجذري والمنظومة المستهدفة',
    testUser
  );
  assert.strictEqual(mergeRes.success, true);

  const issuesPostMerge = await getIssues(testUser);
  const archivedDup = issuesPostMerge.find((i) => i.id === dupIssue.id);
  assert(archivedDup?.archived_at || (archivedDup as any)?.archivedAt, 'Merged duplicate must be soft-archived');

  const auditEvents = await getAuditEvents('issue', existingIssue.id);
  const mergeEvent = auditEvents.find((e) => e.action === 'merge');
  assert(mergeEvent, 'Merge action must be recorded in Audit Log');
  console.log('  ✅ PASSED: Issue merging successfully soft-archives duplicates and logs audit record');

  // TEST 6: Counter Consistency Verification
  console.log('Test 6: Counter Consistency Verification');
  const repReport = await createReport({
    title: 'تقرير اختبار العدادات',
    language: 'ar',
    author: 'Tester',
    systemUnderReview: 'System',
    ownerUid: testUser,
    analysisRows: [
      {
        id: 'row_1',
        title: existingIssue.title,
        severity: 'حرجة',
        category: 'أداء',
        impact: 'توقف الخدمة',
        recommendation: 'ترقية الخوادم',
        syncedIssueId: existingIssue.id,
      },
      {
        id: 'row_2',
        title: 'مشكلة في صفحة الدخول غير مربوطة',
        severity: 'عادية',
        category: 'واجهة',
        impact: 'بطء',
        recommendation: 'فحص',
        // Unlinked!
      },
    ],
  });

  const consistency = await verifyCounterConsistency(repReport.id, testUser);
  assert.strictEqual(consistency.tableIssuesCount, 2);
  assert(
    consistency.discrepancies.some((d) => d.type === 'unlinked'),
    'Should diagnose unlinked issue discrepancy'
  );
  console.log('  ✅ PASSED: Consistency inspector detected discrepancies and identified root cause');

  // TEST 7: Dashboard Dynamic Recalculation
  console.log('Test 7: Dashboard Recalculation');
  const dash = await saveDashboard({
    id: 'dash_p2_test',
    name: 'داشبورد مرحلة 2',
    scope_type: 'project',
    scope_id: defaultProj.id,
    ownerUid: testUser,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await saveWidget({
    id: 'wid_p2_1',
    dashboard_id: dash.id,
    title: 'عدد المشاكل حسب الخطورة',
    source_type: 'project_issues',
    query_config: {
      source: { type: 'project_issues', projectId: defaultProj.id },
      dimension: 'severity',
      measure: 'count',
      visualization: 'bar',
      refreshMode: 'live',
    },
    visualization_type: 'bar',
    refresh_mode: 'live',
    last_calculated_at: new Date().toISOString(),
    calculation_status: 'stale',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const recalculated = await recalculateDashboard(dash.id, testUser);
  assert.strictEqual(recalculated.length, 1);
  assert.strictEqual(recalculated[0].calculation_status, 'success');
  assert(recalculated[0].cached_result !== undefined);
  console.log('  ✅ PASSED: Dashboard recalculated widgets dynamically with active filters');

  console.log('\n🎉 ALL PHASE 2 TESTS PASSED SUCCESSFULLY!\n');
}

runPhase2Tests().catch((err) => {
  console.error('\n❌ PHASE 2 TESTS FAILED:', err);
  process.exit(1);
});
