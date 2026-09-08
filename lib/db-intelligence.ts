import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, isFirebaseConfigured, auth } from './firebase';
import {
  ProjectItem,
  ReportItem,
  IssueItem,
  ReportIssueItem,
  EvidenceItem,
  TableEntity,
  DashboardItem,
  WidgetEntity,
  InsightEntity,
  AuditEventItem,
  DashboardScopeType,
  OrganizationDefaultsItem,
} from './types';


// LocalStorage Keys for new entities
const LOCAL_PROJECTS_KEY = 'review_app_mock_projects';
const LOCAL_REPORT_ISSUES_KEY = 'review_app_mock_report_issues';
const LOCAL_EVIDENCES_KEY = 'review_app_mock_evidences';
const LOCAL_TABLES_KEY = 'review_app_mock_tables';
const LOCAL_DASHBOARDS_KEY = 'review_app_mock_dashboards';
const LOCAL_WIDGETS_KEY = 'review_app_mock_widgets';
const LOCAL_INSIGHTS_KEY = 'review_app_mock_insights';
const LOCAL_AUDIT_LOG_KEY = 'review_app_mock_audit_events';
const LOCAL_REPORTS_KEY = 'review_app_mock_reports';
const LOCAL_ISSUES_KEY = 'review_app_mock_issues';

function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

// ==========================================
// 1. PROJECTS
// ==========================================

export const DEFAULT_PROJECT_ID = 'proj_default';

export async function getProjects(userUid?: string): Promise<ProjectItem[]> {
  const currentUid = userUid || auth?.currentUser?.uid;
  if (!currentUid || typeof currentUid !== 'string' || !currentUid.trim()) {
    return [];
  }

  if (isFirebaseConfigured && db && currentUid) {
    try {
      const q = query(collection(db, 'projects'), where('owner_id', '==', currentUid));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectItem));
      }
    } catch (e) {
      console.warn('Firestore getProjects error', e);
    }
  }

  const uKey = `${LOCAL_PROJECTS_KEY}_${currentUid}`;
  const list = getLocal<ProjectItem[]>(uKey, []);
  if (list.length > 0) return list;

  // Fallback to user-scoped filter or return empty
  const globalList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
  return globalList.filter((p) => p.owner_id === currentUid || p.ownerUid === currentUid);
}

export async function getProjectById(projectId: string, userUid?: string): Promise<ProjectItem | null> {
  const currentUid = userUid || auth?.currentUser?.uid || 'guest';
  const projects = await getProjects(currentUid);
  const found = projects.find((p) => p.id === projectId);
  if (found) return found;
  if (projectId === DEFAULT_PROJECT_ID) {
    return getOrCreateDefaultProject(currentUid);
  }
  return null;
}

export async function getOrCreateDefaultProject(userUid?: string): Promise<ProjectItem> {
  const currentUid = userUid || auth?.currentUser?.uid || 'guest';
  const projects = await getProjects(currentUid);
  const found = projects.find((p) => p.id === DEFAULT_PROJECT_ID || p.name === 'المشروع الرئيسي');
  if (found) return found;

  const now = new Date().toISOString();
  const defaultProj: ProjectItem = {
    id: DEFAULT_PROJECT_ID,
    name: 'المشروع الرئيسي',
    description: 'المشروع الافتراضي الموحد لتقارير ومشاكل المنظومة',
    owner_id: currentUid,
    ownerUid: currentUid,
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  if (isFirebaseConfigured && db && currentUid && currentUid !== 'guest') {
    try {
      await setDoc(doc(db, 'projects', DEFAULT_PROJECT_ID), defaultProj, { merge: true });
    } catch {}
  }

  const uKey = `${LOCAL_PROJECTS_KEY}_${currentUid}`;
  const uList = getLocal<ProjectItem[]>(uKey, []);
  setLocal(uKey, [defaultProj, ...uList.filter((p) => p.id !== defaultProj.id)]);
  const globalList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
  setLocal(LOCAL_PROJECTS_KEY, [defaultProj, ...globalList.filter((p) => p.id !== defaultProj.id)]);

  return defaultProj;
}

export async function createProject(data: {
  name: string;
  description?: string;
  ownerUid?: string;
}): Promise<ProjectItem> {
  const now = new Date().toISOString();
  const currentUid = data.ownerUid || auth?.currentUser?.uid || 'guest';
  const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

  const newProj: ProjectItem = {
    id,
    name: data.name.trim(),
    description: data.description?.trim() || '',
    owner_id: currentUid,
    ownerUid: currentUid,
    status: 'active',
    created_at: now,
    updated_at: now,
  };

  if (isFirebaseConfigured && db && currentUid && currentUid !== 'guest') {
    try {
      await setDoc(doc(db, 'projects', id), newProj);
    } catch (e) {
      console.warn('Firestore createProject failed', e);
    }
  }

  const uKey = `${LOCAL_PROJECTS_KEY}_${currentUid}`;
  const uList = getLocal<ProjectItem[]>(uKey, []);
  setLocal(uKey, [newProj, ...uList]);
  const gList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
  setLocal(LOCAL_PROJECTS_KEY, [newProj, ...gList]);

  await recordAuditEvent({
    actor_id: currentUid,
    entity_type: 'project',
    entity_id: id,
    action: 'create',
    after_value: newProj,
  });

  return newProj;
}

// ==========================================
// 2. ISSUE KEY GENERATION (PRB-001, PRB-002...)
// ==========================================

export async function getNextIssueKey(projectId: string = DEFAULT_PROJECT_ID, userUid?: string): Promise<string> {
  const currentUid = userUid || auth?.currentUser?.uid;
  const numbers: number[] = [];

  // Check local issues
  const allIssues: IssueItem[] = [];
  if (currentUid) {
    const uIssues = getLocal<IssueItem[]>(`${LOCAL_ISSUES_KEY}_${currentUid}`, []);
    allIssues.push(...uIssues);
  }
  const globalIssues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  allIssues.push(...globalIssues);

  allIssues.forEach((iss) => {
    const key = iss.issue_key || iss.issueKey;
    if (key && typeof key === 'string') {
      const match = key.match(/PRB-(\d+)/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n)) numbers.push(n);
      }
    }
  });

  // Query Firestore if configured
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'issues'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const key = d.data()?.issue_key || d.data()?.issueKey;
        if (key && typeof key === 'string') {
          const match = key.match(/PRB-(\d+)/i);
          if (match) {
            const n = parseInt(match[1], 10);
            if (!isNaN(n)) numbers.push(n);
          }
        }
      });
    } catch {}
  }

  const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(3, '0');
  return `PRB-${padded}`;
}

// ==========================================
// 3. REPORT-ISSUE RELATIONSHIPS
// ==========================================

export async function getReportIssues(reportId: string): Promise<ReportIssueItem[]> {
  if (!reportId) return [];

  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'report_issues'), where('report_id', '==', reportId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ReportIssueItem));
      }
    } catch (e) {
      console.warn('Firestore getReportIssues error', e);
    }
  }

  const all = getLocal<ReportIssueItem[]>(LOCAL_REPORT_ISSUES_KEY, []);
  return all.filter((ri) => ri.report_id === reportId || ri.reportId === reportId);
}

export async function addReportIssueLink(link: ReportIssueItem): Promise<ReportIssueItem> {
  const now = new Date().toISOString();
  const id = link.id || 'ri_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const record: ReportIssueItem = {
    ...link,
    id,
    report_id: link.report_id || link.reportId || '',
    issue_id: link.issue_id || link.issueId || '',
    created_at: link.created_at || now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'report_issues', id), record, { merge: true });
    } catch (e) {
      console.warn('Firestore addReportIssueLink error', e);
    }
  }

  const current = getLocal<ReportIssueItem[]>(LOCAL_REPORT_ISSUES_KEY, []);
  const existingIdx = current.findIndex(
    (x) => x.report_id === record.report_id && x.issue_id === record.issue_id
  );
  if (existingIdx !== -1) {
    current[existingIdx] = record;
    setLocal(LOCAL_REPORT_ISSUES_KEY, current);
  } else {
    setLocal(LOCAL_REPORT_ISSUES_KEY, [record, ...current]);
  }

  return record;
}

export async function removeReportIssueLink(reportId: string, issueId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'report_issues'),
        where('report_id', '==', reportId),
        where('issue_id', '==', issueId)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    } catch {}
  }

  const current = getLocal<ReportIssueItem[]>(LOCAL_REPORT_ISSUES_KEY, []);
  const filtered = current.filter(
    (x) =>
      !(
        (x.report_id === reportId || x.reportId === reportId) &&
        (x.issue_id === issueId || x.issueId === issueId)
      )
  );
  setLocal(LOCAL_REPORT_ISSUES_KEY, filtered);
}

// ==========================================
// 4. EVIDENCE
// ==========================================

export async function getEvidences(reportId?: string, issueId?: string): Promise<EvidenceItem[]> {
  const current = getLocal<EvidenceItem[]>(LOCAL_EVIDENCES_KEY, []);
  let filtered = current;
  if (reportId) {
    filtered = filtered.filter((e) => e.report_id === reportId || e.reportId === reportId);
  }
  if (issueId) {
    filtered = filtered.filter((e) => e.issue_id === issueId || e.issueId === issueId);
  }
  return filtered;
}

export async function addEvidence(evidence: Omit<EvidenceItem, 'id' | 'created_at'>): Promise<EvidenceItem> {
  const now = new Date().toISOString();
  const id = 'ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const record: EvidenceItem = {
    ...evidence,
    id,
    created_at: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'evidences', id), record);
    } catch {}
  }

  const current = getLocal<EvidenceItem[]>(LOCAL_EVIDENCES_KEY, []);
  setLocal(LOCAL_EVIDENCES_KEY, [record, ...current]);
  return record;
}

// ==========================================
// 5. STRUCTURED TABLES
// ==========================================

export async function getTablesByReportId(reportId: string): Promise<TableEntity[]> {
  if (!reportId) return [];

  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'tables'), where('report_id', '==', reportId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TableEntity));
      }
    } catch {}
  }

  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  return all.filter((t) => t.report_id === reportId || t.reportId === reportId);
}

export async function saveTable(table: TableEntity): Promise<TableEntity> {
  const now = new Date().toISOString();
  const record: TableEntity = {
    ...table,
    updated_at: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'tables', record.id), record, { merge: true });
    } catch {}
  }

  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  const idx = all.findIndex((t) => t.id === record.id);
  if (idx !== -1) {
    all[idx] = record;
    setLocal(LOCAL_TABLES_KEY, all);
  } else {
    setLocal(LOCAL_TABLES_KEY, [record, ...all]);
  }

  return record;
}

export async function getTableById(tableId: string): Promise<TableEntity | null> {
  if (!tableId) return null;

  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'tables', tableId));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as TableEntity;
      }
    } catch {}
  }

  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  return all.find((t) => t.id === tableId) || null;
}

/**
 * Removes a table entity and all its metadata (rows, columns, formulas,
 * cell formats, merges, direction) from both Firestore and localStorage.
 * Used when a report (or a table node) is permanently removed.
 */
export async function deleteTableEntity(tableId: string): Promise<void> {
  if (!tableId) return;

  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'tables', tableId));
    } catch {}
  }

  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  setLocal(
    LOCAL_TABLES_KEY,
    all.filter((t) => t.id !== tableId)
  );
}

/**
 * Removes every table entity attached to a report (metadata cleanup).
 */
export async function deleteTablesByReportId(reportId: string): Promise<void> {
  if (!reportId) return;
  const tables = await getTablesByReportId(reportId);
  for (const t of tables) {
    await deleteTableEntity(t.id);
  }
}

// ==========================================
// 5.1 INSTITUTIONAL & ORGANIZATION DEFAULTS
// ==========================================

export const LOCAL_ORG_DEFAULTS_KEY = 'review_reports_org_defaults';

export async function getOrganizationDefaults(userUid?: string): Promise<OrganizationDefaultsItem | null> {
  const key = userUid ? `${LOCAL_ORG_DEFAULTS_KEY}_${userUid}` : LOCAL_ORG_DEFAULTS_KEY;
  if (isFirebaseConfigured && db && userUid) {
    try {
      const snap = await getDoc(doc(db, 'organization_defaults', userUid));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as OrganizationDefaultsItem;
      }
    } catch {}
  }
  const local = getLocal<OrganizationDefaultsItem | null>(key, null);
  if (local) return local;
  const global = getLocal<OrganizationDefaultsItem | null>(LOCAL_ORG_DEFAULTS_KEY, null);
  return global;
}

export async function saveOrganizationDefaults(
  defaults: OrganizationDefaultsItem,
  userUid?: string
): Promise<OrganizationDefaultsItem> {
  const now = new Date().toISOString();
  const record: OrganizationDefaultsItem = {
    ...defaults,
    updatedAt: now,
  };
  const key = userUid ? `${LOCAL_ORG_DEFAULTS_KEY}_${userUid}` : LOCAL_ORG_DEFAULTS_KEY;

  if (isFirebaseConfigured && db && userUid) {
    try {
      await setDoc(doc(db, 'organization_defaults', userUid), record, { merge: true });
    } catch {}
  }

  setLocal(key, record);
  setLocal(LOCAL_ORG_DEFAULTS_KEY, record);
  return record;
}

// ==========================================
// 6. DASHBOARDS & WIDGETS
// ==========================================

export async function getDashboards(
  scopeType?: DashboardScopeType,
  scopeId?: string,
  userUid?: string
): Promise<DashboardItem[]> {
  const all = getLocal<DashboardItem[]>(LOCAL_DASHBOARDS_KEY, []);
  let filtered = all;
  if (scopeType) {
    filtered = filtered.filter((d) => d.scope_type === scopeType);
  }
  if (scopeId) {
    filtered = filtered.filter((d) => d.scope_id === scopeId);
  }
  if (userUid) {
    filtered = filtered.filter((d) => !d.ownerUid || d.ownerUid === userUid);
  }
  return filtered;
}

export async function getDashboardById(id: string): Promise<DashboardItem | null> {
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'dashboards', id));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as DashboardItem;
      }
    } catch {}
  }

  const all = getLocal<DashboardItem[]>(LOCAL_DASHBOARDS_KEY, []);
  return all.find((d) => d.id === id) || null;
}

export async function saveDashboard(dashboard: DashboardItem): Promise<DashboardItem> {
  const now = new Date().toISOString();
  const record: DashboardItem = {
    ...dashboard,
    updated_at: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'dashboards', record.id), record, { merge: true });
    } catch {}
  }

  const all = getLocal<DashboardItem[]>(LOCAL_DASHBOARDS_KEY, []);
  const idx = all.findIndex((d) => d.id === record.id);
  if (idx !== -1) {
    all[idx] = record;
    setLocal(LOCAL_DASHBOARDS_KEY, all);
  } else {
    setLocal(LOCAL_DASHBOARDS_KEY, [record, ...all]);
  }

  return record;
}

export async function getWidgets(dashboardId: string): Promise<WidgetEntity[]> {
  if (!dashboardId) return [];

  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'widgets'), where('dashboard_id', '==', dashboardId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WidgetEntity));
      }
    } catch {}
  }

  const all = getLocal<WidgetEntity[]>(LOCAL_WIDGETS_KEY, []);
  return all.filter((w) => w.dashboard_id === dashboardId || w.dashboardId === dashboardId);
}

export async function saveWidget(widget: WidgetEntity): Promise<WidgetEntity> {
  const now = new Date().toISOString();
  const record: WidgetEntity = {
    ...widget,
    updated_at: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'widgets', record.id), record, { merge: true });
    } catch {}
  }

  const all = getLocal<WidgetEntity[]>(LOCAL_WIDGETS_KEY, []);
  const idx = all.findIndex((w) => w.id === record.id);
  if (idx !== -1) {
    all[idx] = record;
    setLocal(LOCAL_WIDGETS_KEY, all);
  } else {
    setLocal(LOCAL_WIDGETS_KEY, [record, ...all]);
  }

  return record;
}

export async function deleteWidget(id: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'widgets', id));
    } catch {}
  }

  const all = getLocal<WidgetEntity[]>(LOCAL_WIDGETS_KEY, []);
  setLocal(
    LOCAL_WIDGETS_KEY,
    all.filter((w) => w.id !== id)
  );
}

export async function archiveIssue(
  issueId: string,
  actorId?: string,
  reason?: string
): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'issues', issueId), {
        archived_at: now,
        archivedAt: now,
        updatedAt: now,
      });
    } catch {}
  }

  // Update in local storage across all issue stores
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LOCAL_ISSUES_KEY)) {
          const list = getLocal<IssueItem[]>(k, []);
          const idx = list.findIndex((x) => x.id === issueId);
          if (idx !== -1) {
            list[idx].archived_at = now;
            list[idx].archivedAt = now;
            list[idx].updatedAt = now;
            setLocal(k, list);
          }
        }
      }
    } catch {}
  }

  if (actorId) {
    await recordAuditEvent({
      actor_id: actorId,
      entity_type: 'issue',
      entity_id: issueId,
      action: 'archive',
      reason: reason || 'Issue soft-deleted / archived',
    });
  }
}

// ==========================================
// 7. INSIGHTS
// ==========================================

export async function getInsights(dashboardId?: string): Promise<InsightEntity[]> {
  const all = getLocal<InsightEntity[]>(LOCAL_INSIGHTS_KEY, []);
  if (dashboardId) {
    return all.filter(
      (i) =>
        i.dashboard_id === dashboardId ||
        i.dashboardId === dashboardId ||
        (i as any).scope_id === dashboardId ||
        i.dashboard_id?.includes(dashboardId)
    );
  }
  return all;
}

export async function saveInsight(insight: InsightEntity): Promise<InsightEntity> {
  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'insights', insight.id), insight, { merge: true });
    } catch {}
  }

  const all = getLocal<InsightEntity[]>(LOCAL_INSIGHTS_KEY, []);
  const idx = all.findIndex((i) => i.id === insight.id);
  if (idx !== -1) {
    all[idx] = insight;
    setLocal(LOCAL_INSIGHTS_KEY, all);
  } else {
    setLocal(LOCAL_INSIGHTS_KEY, [insight, ...all]);
  }

  return insight;
}

// ==========================================
// 8. AUDIT LOGGING
// ==========================================

export async function recordAuditEvent(
  event: Omit<AuditEventItem, 'id' | 'created_at'>
): Promise<AuditEventItem> {
  const now = new Date().toISOString();
  const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const record: AuditEventItem = {
    ...event,
    id,
    created_at: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'audit_events', id), record);
    } catch {}
  }

  const all = getLocal<AuditEventItem[]>(LOCAL_AUDIT_LOG_KEY, []);
  // Keep up to 2000 events in local storage
  const trimmed = [record, ...all].slice(0, 2000);
  setLocal(LOCAL_AUDIT_LOG_KEY, trimmed);

  return record;
}

export async function getAuditEvents(entityType?: string, entityId?: string): Promise<AuditEventItem[]> {
  const all = getLocal<AuditEventItem[]>(LOCAL_AUDIT_LOG_KEY, []);
  let filtered = all;
  if (entityType) {
    filtered = filtered.filter((e) => e.entity_type === entityType);
  }
  if (entityId) {
    filtered = filtered.filter((e) => e.entity_id === entityId);
  }
  return filtered;
}

// ==========================================
// 9. SAFE BACKWARD-COMPATIBLE MIGRATION
// ==========================================

export async function migrateLegacyDataToUnifiedModel(
  userUid?: string
): Promise<{ migratedReports: number; migratedIssues: number }> {
  const defaultProj = await getOrCreateDefaultProject(userUid);
  let migratedReports = 0;
  let migratedIssues = 0;

  // 1. Migrate Reports
  const uReportsKey = userUid ? `${LOCAL_REPORTS_KEY}_${userUid}` : LOCAL_REPORTS_KEY;
  const reports = getLocal<ReportItem[]>(uReportsKey, []);
  const updatedReports = reports.map((rep) => {
    let modified = false;
    const patched: ReportItem = { ...rep };
    if (!patched.project_id && !patched.projectId) {
      patched.project_id = defaultProj.id;
      patched.projectId = defaultProj.id;
      modified = true;
    }
    if (!patched.version) {
      patched.version = 1;
      modified = true;
    }
    if (!patched.status) {
      patched.status = 'published';
      modified = true;
    }
    if (!patched.extraction_status && !patched.extractionStatus) {
      patched.extraction_status = 'idle';
      patched.extractionStatus = 'idle';
      modified = true;
    }
    if (modified) migratedReports++;
    return patched;
  });
  if (migratedReports > 0) {
    setLocal(uReportsKey, updatedReports);
  }

  // 2. Migrate Issues & assign issue_key and ReportIssue links
  const uIssuesKey = userUid ? `${LOCAL_ISSUES_KEY}_${userUid}` : LOCAL_ISSUES_KEY;
  const issues = getLocal<IssueItem[]>(uIssuesKey, []);
  let counter = 1;

  const existingReportIssues = getLocal<ReportIssueItem[]>(LOCAL_REPORT_ISSUES_KEY, []);
  const newReportIssues: ReportIssueItem[] = [...existingReportIssues];

  const updatedIssues = issues.map((iss) => {
    let modified = false;
    const patched: IssueItem = { ...iss };
    if (!patched.project_id && !patched.projectId) {
      patched.project_id = defaultProj.id;
      patched.projectId = defaultProj.id;
      modified = true;
    }
    if (!patched.issue_key && !patched.issueKey) {
      patched.issue_key = `PRB-${String(counter).padStart(3, '0')}`;
      patched.issueKey = patched.issue_key;
      counter++;
      modified = true;
    }
    if (!patched.first_detected_at && !patched.firstDetectedAt) {
      patched.first_detected_at = iss.createdAt || new Date().toISOString();
      patched.firstDetectedAt = patched.first_detected_at;
      modified = true;
    }

    // Ensure ReportIssue link exists if linked to a report
    const targetReportId = patched.linkedReportId || patched.reportId;
    if (targetReportId) {
      const exists = newReportIssues.some(
        (ri) =>
          (ri.report_id === targetReportId || ri.reportId === targetReportId) &&
          (ri.issue_id === patched.id || ri.issueId === patched.id)
      );
      if (!exists) {
        newReportIssues.push({
          id: 'ri_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          report_id: targetReportId,
          reportId: targetReportId,
          issue_id: patched.id,
          issueId: patched.id,
          relation_type: 'primary',
          created_at: patched.createdAt || new Date().toISOString(),
        });
      }
    }

    if (modified) migratedIssues++;
    return patched;
  });

  if (migratedIssues > 0) {
    setLocal(uIssuesKey, updatedIssues);
    setLocal(LOCAL_REPORT_ISSUES_KEY, newReportIssues);
  }

  return { migratedReports, migratedIssues };
}
