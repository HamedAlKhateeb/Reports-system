/**
 * Phase 5 Unit Tests: Selection to Widget Pipeline & Intelligence Dashboards
 * Run: npx tsx scripts/tests/test-phase5-widgets.ts
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
} from '../../lib/types';
import { recalculateDashboard } from '../../lib/issue-intelligence-engine';
import {
  saveDashboard,
  saveWidget,
  getWidgets,
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

async function runTests() {
  console.log('\n=== RUNNING PHASE 5 WIDGET PIPELINE & LINEAGE TESTS ===\n');

  const testUserUid = 'test_user_p5';
  const testReportId = 'rep_p5_test_001';
  const testDashboardId = `dash_${testReportId}`;
  const testProjectId = 'proj_alpha';

  // 1. Setup Mock Issues for testing
  const mockIssues: IssueItem[] = [
    {
      id: 'iss_p5_1',
      issue_key: 'PRB-001',
      title: 'بطء في الاستعلامات',
      description: 'استعلامات بطيئة في قاعدة البيانات',
      status: 'open',
      severity: 'critical',
      linkedReportId: testReportId,
      project_id: testProjectId,
      ownerUid: testUserUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'iss_p5_2',
      issue_key: 'PRB-002',
      title: 'فشل في رفع الملفات',
      description: 'الملفات الكبيرة تفشل عند الرفع',
      status: 'in_progress',
      severity: 'major',
      linkedReportId: testReportId,
      project_id: testProjectId,
      ownerUid: testUserUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'iss_p5_3',
      issue_key: 'PRB-003',
      title: 'خطأ إملائي في الواجهة',
      description: 'نص غير دقيق في الصفحة الرئيسية',
      status: 'done',
      severity: 'minor',
      linkedReportId: testReportId,
      project_id: testProjectId,
      ownerUid: testUserUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'iss_p5_4',
      issue_key: 'PRB-004',
      title: 'مشكلة مؤرشفة',
      description: 'تم أرشفتها ولا يجب أن تحتسب',
      status: 'done',
      severity: 'major',
      linkedReportId: testReportId,
      project_id: testProjectId,
      archived_at: new Date().toISOString(),
      ownerUid: testUserUid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // Seed issues into mock storage for both userUid and anonymous fallback
  mockStorage.set(`review_app_mock_issues_${testUserUid}`, JSON.stringify(mockIssues));
  mockStorage.set('review_app_mock_issues_anonymous', JSON.stringify(mockIssues));

  // 2. Setup Dashboard
  const dashboard: DashboardEntity = {
    id: testDashboardId,
    name: 'لوحة مؤشرات التقرير الاختباري',
    scope_type: 'report',
    scope: 'report',
    scope_id: testReportId,
    title: 'لوحة مؤشرات التقرير الاختباري',
    layout_config: { columns: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveDashboard(dashboard);

  // Test 1: Create Widget with complete Lineage Preservation
  const widgetWithLineage: WidgetEntity = {
    id: 'wdg_kpi_total',
    dashboard_id: testDashboardId,
    title: 'إجمالي المشاكل النشطة',
    type: 'kpi',
    visualization_type: 'kpi',
    source_type: 'report_issues',
    source_id: testReportId,
    source_title: 'تقرير التدقيق الأمني',
    query_definition: 'SELECT COUNT(*) FROM issues WHERE linkedReportId = "rep_p5_test_001" AND active = true',
    query_config: {
      source: {
        type: 'report_issues',
        reportId: testReportId,
      },
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveWidget(widgetWithLineage);

  const savedWidget = (await getWidgets(testDashboardId)).find((w) => w.id === 'wdg_kpi_total');
  assert(
    !!savedWidget &&
    savedWidget.source_type === 'report_issues' &&
    savedWidget.source_id === testReportId &&
    savedWidget.source_title === 'تقرير التدقيق الأمني' &&
    !!savedWidget.query_definition,
    'Widget successfully preserves source lineage and query definition'
  );

  // Test 2: Create Grouped Widget by Severity
  const widgetSeverityDonut: WidgetEntity = {
    id: 'wdg_sev_donut',
    dashboard_id: testDashboardId,
    title: 'توزيع المشاكل حسب الخطورة',
    type: 'donut',
    visualization_type: 'donut',
    source_type: 'report_table',
    source_id: 'tbl_rep_p5_1',
    source_title: 'جدول المشاكل الأمني',
    query_config: {
      source: {
        type: 'report_table',
        reportId: testReportId,
      },
      dimension: 'severity',
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveWidget(widgetSeverityDonut);

  // Test 3: Create Filtered Widget (Critical only)
  const widgetCriticalCount: WidgetEntity = {
    id: 'wdg_crit_kpi',
    dashboard_id: testDashboardId,
    title: 'المشاكل الحرجة فقط',
    type: 'kpi',
    visualization_type: 'kpi',
    source_type: 'report_issues',
    source_id: testReportId,
    query_config: {
      source: {
        type: 'report_issues',
        reportId: testReportId,
      },
      filters: [{ field: 'severity', operator: 'eq', value: 'critical' }],
      measure: 'count',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await saveWidget(widgetCriticalCount);

  // Test 4: Run Recalculate Dashboard
  const recalculated = await recalculateDashboard(testDashboardId, testUserUid);
  assert(recalculated.length === 3, 'All 3 widgets recalculated successfully');

  // Test 5: Verify Active Count Calculation (excluding archived)
  const kpiWidget = recalculated.find((w) => w.id === 'wdg_kpi_total');
  assert(
    kpiWidget?.cached_result === 3,
    `KPI widget calculates exactly 3 active issues (excluding archived issue). Got: ${kpiWidget?.cached_result}`
  );

  // Test 6: Verify Dimension Grouping (Severity Donut)
  const donutWidget = recalculated.find((w) => w.id === 'wdg_sev_donut');
  const severityResult = donutWidget?.cached_result;
  assert(
    typeof severityResult === 'object' &&
    severityResult.critical === 1 &&
    severityResult.major === 1 &&
    severityResult.minor === 1 &&
    !severityResult.closed,
    `Severity Donut correctly aggregates counts by dimension { critical: 1, major: 1, minor: 1 }. Got: ${JSON.stringify(severityResult)}`
  );

  // Test 7: Verify Filter Calculation (Critical only)
  const critWidget = recalculated.find((w) => w.id === 'wdg_crit_kpi');
  assert(
    critWidget?.cached_result === 1,
    `Filtered KPI widget counts exactly 1 critical issue. Got: ${critWidget?.cached_result}`
  );

  // Test 8: Verify Calculation Status and Timestamp
  assert(
    recalculated.every((w) => w.calculation_status === 'success' && !!w.last_calculated_at),
    'All widgets mark calculation_status as success with valid timestamp'
  );

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
