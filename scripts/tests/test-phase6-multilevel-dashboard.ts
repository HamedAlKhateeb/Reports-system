/**
 * Phase 6 Unit Tests: Multi-Level Dashboards & Scope Recalculation
 * Run: npx tsx scripts/tests/test-phase6-multilevel-dashboard.ts
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
  WidgetEntity,
  DashboardEntity,
  IssueItem,
  InsightEntity,
} from '../../lib/types';
import { recalculateDashboard } from '../../lib/issue-intelligence-engine';
import {
  saveDashboard,
  getDashboards,
  saveWidget,
  getWidgets,
  saveInsight,
  getInsights,
} from '../../lib/db';

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

async function runPhase6Tests() {
  console.log('\n=== RUNNING PHASE 6: MULTI-LEVEL DASHBOARD TESTS ===\n');

  const testUserA = 'user_alice';
  const testUserB = 'user_bob';

  const proj1 = 'proj_enterprise_erp';
  const proj2 = 'proj_mobile_app';

  const rep1 = 'rep_erp_audit_1';
  const rep2 = 'rep_erp_audit_2';
  const rep3 = 'rep_mobile_1';

  // Seed sample issues across projects, reports, and owners
  const sampleIssues: IssueItem[] = [
    {
      id: 'iss_mld_1',
      issue_key: 'ERP-001',
      title: 'بطء في حساب الرواتب الشهرية',
      description: 'استعلام الرواتب يستغرق 3 دقائق',
      status: 'open',
      severity: 'critical',
      project_id: proj1,
      linkedReportId: rep1,
      ownerUid: testUserA,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'iss_mld_2',
      issue_key: 'ERP-002',
      title: 'فشل في تصدير القيود المحاسبية',
      description: 'ملف CSV فارغ عند التصدير',
      status: 'in_progress',
      severity: 'major',
      project_id: proj1,
      linkedReportId: rep1,
      ownerUid: testUserB,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'iss_mld_3',
      issue_key: 'ERP-003',
      title: 'تكرار في أرقام الفواتير',
      description: 'فواتير تحمل نفس المعرف',
      status: 'open',
      severity: 'critical',
      project_id: proj1,
      linkedReportId: rep2,
      ownerUid: testUserA,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'iss_mld_4',
      issue_key: 'MOB-001',
      title: 'انهيار التطبيق عند تسجيل الدخول ببصمة الوجه',
      description: 'تطبيق iOS يتوقف فجأة',
      status: 'done',
      severity: 'minor',
      project_id: proj2,
      linkedReportId: rep3,
      ownerUid: testUserB,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  mockStorage.set(`review_app_mock_issues_${testUserA}`, JSON.stringify(sampleIssues));
  mockStorage.set('review_app_mock_issues_anonymous', JSON.stringify(sampleIssues));

  // 1. Organization Dashboard (aggregates everything)
  const orgDashId = 'dash_organization_org_main';
  const orgDashboard: DashboardEntity = {
    id: orgDashId,
    name: 'لوحة مؤشرات المؤسسة الشاملة',
    title: 'لوحة مؤشرات المؤسسة الشاملة',
    scope_type: 'organization',
    scope: 'organization',
    scope_id: 'org_main',
    layout_config: { columns: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveDashboard(orgDashboard);

  const orgKpiWidget: WidgetEntity = {
    id: 'wdg_org_kpi_total',
    dashboard_id: orgDashId,
    title: 'إجمالي مشاكل المؤسسة',
    type: 'kpi',
    visualization_type: 'kpi',
    source_type: 'project_issues',
    source_id: 'org_main',
    source_title: 'المؤسسة ككل',
    query_definition: 'SELECT COUNT(*) FROM issues',
    query_config: {
      source: { type: 'project_issues' },
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveWidget(orgKpiWidget);

  // 2. Project Dashboard (scoped to proj1: proj_enterprise_erp)
  const projDashId = `dash_project_${proj1}`;
  const projDashboard: DashboardEntity = {
    id: projDashId,
    name: 'لوحة مؤشرات مشروع ERP',
    title: 'لوحة مؤشرات مشروع ERP',
    scope_type: 'project',
    scope: 'project',
    scope_id: proj1,
    layout_config: { columns: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveDashboard(projDashboard);

  const projKpiWidget: WidgetEntity = {
    id: 'wdg_proj1_kpi',
    dashboard_id: projDashId,
    title: 'مشاكل مشروع ERP',
    type: 'kpi',
    visualization_type: 'kpi',
    source_type: 'project_issues',
    source_id: proj1,
    source_title: 'مشروع ERP',
    query_definition: `SELECT COUNT(*) FROM issues WHERE projectId = "${proj1}"`,
    query_config: {
      source: { type: 'project_issues', projectId: proj1 },
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveWidget(projKpiWidget);

  // 3. Report Dashboard (scoped to rep1: rep_erp_audit_1)
  const repDashId = `dash_report_${rep1}`;
  const repDashboard: DashboardEntity = {
    id: repDashId,
    name: 'لوحة مؤشرات تقرير التدقيق الأول',
    title: 'لوحة مؤشرات تقرير التدقيق الأول',
    scope_type: 'report',
    scope: 'report',
    scope_id: rep1,
    layout_config: { columns: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveDashboard(repDashboard);

  const repKpiWidget: WidgetEntity = {
    id: 'wdg_rep1_kpi',
    dashboard_id: repDashId,
    title: 'مشاكل تقرير التدقيق الأول',
    type: 'kpi',
    visualization_type: 'kpi',
    source_type: 'report_issues',
    source_id: rep1,
    source_title: 'تقرير التدقيق 1',
    query_definition: `SELECT COUNT(*) FROM issues WHERE reportId = "${rep1}"`,
    query_config: {
      source: { type: 'report_issues', reportId: rep1 },
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveWidget(repKpiWidget);

  // 4. Personal Dashboard (scoped to testUserA)
  const userDashId = `dash_personal_${testUserA}`;
  const userDashboard: DashboardEntity = {
    id: userDashId,
    name: 'لوحة مؤشرات أليس',
    title: 'لوحة مؤشرات أليس',
    scope_type: 'personal',
    scope: 'personal',
    scope_id: testUserA,
    layout_config: { columns: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveDashboard(userDashboard);

  const userKpiWidget: WidgetEntity = {
    id: 'wdg_user_kpi',
    dashboard_id: userDashId,
    title: 'المهام المسندة إلى أليس',
    type: 'kpi',
    visualization_type: 'kpi',
    source_type: 'project_issues',
    source_id: testUserA,
    source_title: 'المستخدم أليس',
    query_definition: `SELECT COUNT(*) FROM issues WHERE ownerUid = "${testUserA}"`,
    query_config: {
      source: { type: 'project_issues', ownerUid: testUserA },
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveWidget(userKpiWidget);

  // TEST 1: Retrieve Dashboards by Scope
  console.log('Test 1: Dashboard Retrieval by Scope & ID');
  const orgDashes = await getDashboards('organization', 'org_main', testUserA);
  assert(orgDashes.length > 0 && orgDashes[0].id === orgDashId, 'Organization dashboard successfully retrieved');

  const projDashes = await getDashboards('project', proj1, testUserA);
  assert(projDashes.length > 0 && projDashes[0].scope_id === proj1, 'Project dashboard successfully retrieved');

  const repDashes = await getDashboards('report', rep1, testUserA);
  assert(repDashes.length > 0 && repDashes[0].scope_id === rep1, 'Report dashboard successfully retrieved');

  const personalDashes = await getDashboards('personal', testUserA, testUserA);
  assert(personalDashes.length > 0 && personalDashes[0].scope_id === testUserA, 'Personal dashboard successfully retrieved');

  // TEST 2: Recalculate Organization Scope
  console.log('\nTest 2: Dynamic Recalculation for Organization Scope');
  const recalculatedOrg = await recalculateDashboard(orgDashId, testUserA);
  const orgKpi = recalculatedOrg.find((w) => w.id === 'wdg_org_kpi_total');
  assert(
    orgKpi?.cached_result === 4,
    `Organization widget correctly aggregates all 4 issues across projects. Got: ${orgKpi?.cached_result}`
  );

  // TEST 3: Recalculate Project Scope
  console.log('\nTest 3: Dynamic Recalculation for Project Scope (proj_enterprise_erp)');
  const recalculatedProj = await recalculateDashboard(projDashId, testUserA);
  const projKpi = recalculatedProj.find((w) => w.id === 'wdg_proj1_kpi');
  assert(
    projKpi?.cached_result === 3,
    `Project widget correctly isolates exactly 3 issues belonging to proj_enterprise_erp. Got: ${projKpi?.cached_result}`
  );

  // TEST 4: Recalculate Report Scope
  console.log('\nTest 4: Dynamic Recalculation for Report Scope (rep_erp_audit_1)');
  const recalculatedRep = await recalculateDashboard(repDashId, testUserA);
  const repKpi = recalculatedRep.find((w) => w.id === 'wdg_rep1_kpi');
  assert(
    repKpi?.cached_result === 2,
    `Report widget correctly isolates exactly 2 issues belonging to rep_erp_audit_1. Got: ${repKpi?.cached_result}`
  );

  // TEST 5: Recalculate Personal Scope
  console.log('\nTest 5: Dynamic Recalculation for Personal Scope (user_alice)');
  const recalculatedUser = await recalculateDashboard(userDashId, testUserA);
  const userKpi = recalculatedUser.find((w) => w.id === 'wdg_user_kpi');
  assert(
    userKpi?.cached_result === 2,
    `Personal widget correctly isolates exactly 2 issues owned by user_alice. Got: ${userKpi?.cached_result}`
  );

  // TEST 6: Automated Insights Generation & Retrieval
  console.log('\nTest 6: Insights Association and Retrieval');
  const testInsight: InsightEntity = {
    id: 'ins_p6_1',
    dashboard_id: projDashId,
    title: 'تركيز مشاكل حرجة في وحدة الرواتب',
    observation: 'يوجد مشكلتان حرجتان تؤثران على الحسابات والفواتير في هذا المشروع',
    summary: 'تركيز عالي للخطورة في الأنظمة المالية',
    type: 'risk_concentration',
    confidence: 'high',
    recommendations: ['إجراء مراجعة أمنية فورية', 'إعادة اختبار استعلامات الرواتب'],
    status: 'proposed',
    created_at: new Date().toISOString(),
  };
  await saveInsight(testInsight);

  const fetchedInsights = await getInsights(proj1);
  assert(
    fetchedInsights.length > 0 && fetchedInsights.some((i) => i.id === 'ins_p6_1'),
    'Automated insight successfully saved and linked to project scope'
  );

  // TEST 7: Lineage Metadata Verification
  console.log('\nTest 7: Traceability and Lineage Preservation');
  assert(
    repKpi?.source_type === 'report_issues' &&
    repKpi.source_id === rep1 &&
    repKpi.source_title === 'تقرير التدقيق 1',
    'Report widget preserves source lineage back to the originating report'
  );

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6Tests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
