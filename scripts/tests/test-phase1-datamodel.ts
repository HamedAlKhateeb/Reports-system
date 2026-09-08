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

async function runPhase1Tests() {
  console.log('🧪 Starting Phase 1: Unified Data Model & Migration Tests...\n');

  const {
    getOrCreateDefaultProject,
    createProject,
    getProjects,
    getNextIssueKey,
    addReportIssueLink,
    getReportIssues,
    removeReportIssueLink,
    saveTable,
    getTablesByReportId,
    saveDashboard,
    saveWidget,
    getWidgets,
    recordAuditEvent,
    getAuditEvents,
    migrateLegacyDataToUnifiedModel,
  } = await import('../../lib/db-intelligence');

  const testUser = 'tester_uid_999';

  // 1. Default Project Test
  console.log('Test 1: Default Project Creation');
  const defaultProj = await getOrCreateDefaultProject(testUser);
  assert.strictEqual(defaultProj.id, 'proj_default');
  assert.strictEqual(defaultProj.name, 'المشروع الرئيسي');
  console.log('  ✅ PASSED: Default project created successfully');

  // 2. Custom Project Test
  console.log('Test 2: Custom Project Creation');
  const customProj = await createProject({
    name: 'مشروع تدقيق ترجمة الأنظمة',
    description: 'مشروع مخصص للمراجعات',
    ownerUid: testUser,
  });
  assert(customProj.id.startsWith('proj_'));
  assert.strictEqual(customProj.name, 'مشروع تدقيق ترجمة الأنظمة');
  const projectsList = await getProjects(testUser);
  assert(projectsList.length >= 2);
  console.log('  ✅ PASSED: Custom project created and retrieved');

  // 3. Issue Key Generation Test (PRB-001, PRB-002...)
  console.log('Test 3: Sequential Issue Key Generation');
  const key1 = await getNextIssueKey(defaultProj.id, testUser);
  assert.strictEqual(key1, 'PRB-001', 'First key must be PRB-001');

  // Seed an issue with PRB-005
  localStorage.setItem(
    `review_app_mock_issues_${testUser}`,
    JSON.stringify([
      { id: 'iss_1', issue_key: 'PRB-005', title: 'Issue 5', ownerUid: testUser },
    ])
  );
  const keyNext = await getNextIssueKey(defaultProj.id, testUser);
  assert.strictEqual(keyNext, 'PRB-006', 'Next key after PRB-005 must be PRB-006');
  console.log('  ✅ PASSED: Sequential issue key generation handles gaps and padding (PRB-001, PRB-006)');

  // 4. ReportIssue Linking Test
  console.log('Test 4: ReportIssue Linking & Single Source of Truth');
  const reportLink = await addReportIssueLink({
    report_id: 'rep_101',
    issue_id: 'iss_1',
    relation_type: 'primary',
    created_at: new Date().toISOString(),
  });
  assert.strictEqual(reportLink.report_id, 'rep_101');
  const links = await getReportIssues('rep_101');
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].issue_id, 'iss_1');

  await removeReportIssueLink('rep_101', 'iss_1');
  const linksAfterRemove = await getReportIssues('rep_101');
  assert.strictEqual(linksAfterRemove.length, 0);
  console.log('  ✅ PASSED: ReportIssue link added and removed cleanly');

  // 5. Structured Table Entity Test
  console.log('Test 5: Table Entity Persistence');
  const table = await saveTable({
    id: 'tbl_101',
    report_id: 'rep_101',
    name: 'جدول العيوب اللغوية',
    columns_data: [
      { id: 'col_0', name: 'الرمز', type: 'issue_key' },
      { id: 'col_1', name: 'الوصف', type: 'text' },
      { id: 'col_2', name: 'الدرجة', type: 'status' },
    ],
    rows_data: [
      { col_0: 'PRB-001', col_1: 'خطأ إملائي في العنوان', col_2: 'حرجة' },
    ],
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert.strictEqual(table.id, 'tbl_101');
  const tables = await getTablesByReportId('rep_101');
  assert.strictEqual(tables.length, 1);
  assert.strictEqual(tables[0].columns_data.length, 3);
  console.log('  ✅ PASSED: Table entity persisted with schema and rows');

  // 6. Dashboard & Widget Persistence Test
  console.log('Test 6: Dashboard & Widget Query Config Persistence');
  const dash = await saveDashboard({
    id: 'dash_rep_101',
    name: 'داشبورد تقرير #101',
    scope_type: 'report',
    scope_id: 'rep_101',
    ownerUid: testUser,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert.strictEqual(dash.scope_type, 'report');

  const widget = await saveWidget({
    id: 'wid_1',
    dashboard_id: dash.id,
    title: 'توزيع المشاكل حسب الخطورة',
    source_type: 'report_issues',
    query_config: {
      source: { type: 'report_issues', reportId: 'rep_101' },
      dimension: 'severity',
      measure: 'count',
      visualization: 'bar',
      refreshMode: 'live',
    },
    visualization_type: 'bar',
    refresh_mode: 'live',
    last_calculated_at: new Date().toISOString(),
    calculation_status: 'success',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  assert.strictEqual(widget.dashboard_id, dash.id);
  const widgets = await getWidgets(dash.id);
  assert.strictEqual(widgets.length, 1);
  assert.strictEqual(widgets[0].query_config.dimension, 'severity');
  console.log('  ✅ PASSED: Dashboard and query-configured widget persisted');

  // 7. Audit Event Logging Test
  console.log('Test 7: Audit Event Logging');
  await recordAuditEvent({
    actor_id: testUser,
    entity_type: 'issue',
    entity_id: 'iss_1',
    action: 'approve',
    before_value: { status: 'draft' },
    after_value: { status: 'approved' },
    reason: 'تم اعتماد المشكلة بعد فحص التقرير',
  });
  const auditLogs = await getAuditEvents('issue', 'iss_1');
  assert(auditLogs.length >= 1);
  assert.strictEqual(auditLogs[0].action, 'approve');
  assert.strictEqual(auditLogs[0].reason, 'تم اعتماد المشكلة بعد فحص التقرير');
  console.log('  ✅ PASSED: Audit event logged with before/after and actor');

  // 8. Safe Migration Test
  console.log('Test 8: Safe Migration of Legacy Reports and Issues');
  // Seed legacy report without project_id, version, or status
  localStorage.setItem(
    `review_app_mock_reports_${testUser}`,
    JSON.stringify([
      {
        id: 'rep_legacy_1',
        title: 'Legacy Report',
        reportNumber: 1,
        language: 'ar',
        author: 'Reviewer',
        ownerUid: testUser,
        createdAt: new Date().toISOString(),
      },
    ])
  );
  // Seed legacy issue without project_id or issue_key
  localStorage.setItem(
    `review_app_mock_issues_${testUser}`,
    JSON.stringify([
      {
        id: 'iss_legacy_1',
        title: 'Legacy Issue',
        description: 'Old issue description',
        severity: 'حرجة',
        status: 'مفتوحة',
        linkedReportId: 'rep_legacy_1',
        ownerUid: testUser,
        createdAt: new Date().toISOString(),
      },
    ])
  );

  const migrationRes = await migrateLegacyDataToUnifiedModel(testUser);
  assert(migrationRes.migratedReports >= 1, 'Legacy report must be migrated');
  assert(migrationRes.migratedIssues >= 1, 'Legacy issue must be migrated');

  const migratedIssues = JSON.parse(
    localStorage.getItem(`review_app_mock_issues_${testUser}`) || '[]'
  );
  const iss = migratedIssues.find((i: any) => i.id === 'iss_legacy_1');
  assert(iss.issue_key && iss.issue_key.startsWith('PRB-'), 'Must assign issue_key');
  assert.strictEqual(iss.project_id, 'proj_default', 'Must assign default project_id');

  const migratedReportIssues = await getReportIssues('rep_legacy_1');
  assert(migratedReportIssues.some((ri) => ri.issue_id === 'iss_legacy_1'), 'Must create ReportIssue join record');
  console.log('  ✅ PASSED: Legacy data safely migrated without data loss');

  console.log('\n🎉 ALL PHASE 1 TESTS PASSED SUCCESSFULLY!\n');
}

runPhase1Tests().catch((err) => {
  console.error('\n❌ PHASE 1 TESTS FAILED:', err);
  process.exit(1);
});
