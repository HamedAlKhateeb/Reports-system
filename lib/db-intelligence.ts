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
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(val));
      return;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(val));
      return;
    }
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

// ==========================================
// 1. PROJECTS
// ==========================================

export const DEFAULT_PROJECT_ID = 'proj_default';

export async function getProjects(userUid?: string, userEmail?: string): Promise<ProjectItem[]> {
  const currentUid = userUid || auth?.currentUser?.uid;
  if (!currentUid || typeof currentUid !== 'string' || !currentUid.trim()) {
    return [];
  }
  const email = (userEmail || auth?.currentUser?.email || '').toLowerCase().trim();
  const projectMap = new Map<string, ProjectItem>();

  if (isFirebaseConfigured && db && currentUid) {
    try {
      const q = query(collection(db, 'projects'), where('owner_id', '==', currentUid));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        projectMap.set(d.id, { id: d.id, ...d.data() } as ProjectItem);
      });

      // Also query teams where user is a member
      if (email || currentUid) {
        try {
          const teamDocsMap = new Map<string, any>();
          if (currentUid) {
            try {
              const qUid = query(collection(db, 'teams'), where('memberUids', 'array-contains', currentUid));
              const snap = await getDocs(qUid);
              snap.docs.forEach((d) => teamDocsMap.set(d.id, d.data()));
            } catch {}
          }
          if (email) {
            try {
              const qEmail = query(collection(db, 'teams'), where('memberEmails', 'array-contains', email));
              const snap = await getDocs(qEmail);
              snap.docs.forEach((d) => teamDocsMap.set(d.id, d.data()));
            } catch {}
          }
          // Fallback if empty or legacy documents
          if (teamDocsMap.size === 0) {
            try {
              const teamsSnap = await getDocs(collection(db, 'teams'));
              teamsSnap.docs.forEach((d) => teamDocsMap.set(d.id, d.data()));
            } catch {}
          }

          const memberProjectIds = new Set<string>();
          teamDocsMap.forEach((team) => {
            const isMem = Array.isArray(team.members) && team.members.some(
              (m: any) => m.userId === currentUid || m.uid === currentUid || (email && m.email?.toLowerCase() === email)
            );
            if (isMem && team.projectId) {
              memberProjectIds.add(team.projectId);
            }
          });

          for (const pid of Array.from(memberProjectIds)) {
            if (!projectMap.has(pid)) {
              try {
                const pDoc = await getDoc(doc(db, 'projects', pid));
                if (pDoc.exists()) {
                  projectMap.set(pDoc.id, { id: pDoc.id, ...pDoc.data() } as ProjectItem);
                }
              } catch {}
            }
          }
        } catch {}
      }

      if (projectMap.size > 0) {
        return Array.from(projectMap.values());
      }
    } catch (e) {
      console.warn('Firestore getProjects error', e);
    }
  }

  const uKey = `${LOCAL_PROJECTS_KEY}_${currentUid}`;
  const list = getLocal<ProjectItem[]>(uKey, []);
  list.forEach((p) => projectMap.set(p.id, p));

  // Also check local teams
  const localTeams = getLocal<any[]>('review_app_teams', []);
  localTeams.forEach((team) => {
    const isMem = Array.isArray(team.members) && team.members.some(
      (m: any) => m.userId === currentUid || m.uid === currentUid || (email && m.email?.toLowerCase() === email)
    );
    if (isMem && team.projectId) {
      const globalList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
      const found = globalList.find((p) => p.id === team.projectId);
      if (found && !projectMap.has(found.id)) {
        projectMap.set(found.id, found);
      }
    }
  });

  const globalList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
  globalList
    .filter((p) => p.owner_id === currentUid || p.ownerUid === currentUid)
    .forEach((p) => {
      if (!projectMap.has(p.id)) projectMap.set(p.id, p);
    });

  return Array.from(projectMap.values());
}

export async function getProjectById(projectId: string, userUid?: string): Promise<ProjectItem | null> {
  const currentUid = userUid || auth?.currentUser?.uid || 'guest';
  const projects = await getProjects(currentUid);
  const found = projects.find((p) => p.id === projectId);
  if (found) return found;

  // Search global project registry if not found in user-specific key
  const globalList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
  const gFound = globalList.find((p) => p.id === projectId);
  if (gFound) return gFound;

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

export async function saveProject(proj: ProjectItem, userUid?: string): Promise<void> {
  const currentUid = userUid || proj.owner_id || proj.ownerUid || auth?.currentUser?.uid || 'guest';
  if (isFirebaseConfigured && db && currentUid && currentUid !== 'guest') {
    try {
      await setDoc(doc(db, 'projects', proj.id), proj, { merge: true });
    } catch (e) {
      console.warn('Firestore saveProject error', e);
    }
  }

  const uKey = `${LOCAL_PROJECTS_KEY}_${currentUid}`;
  const uList = getLocal<ProjectItem[]>(uKey, []);
  setLocal(uKey, [proj, ...uList.filter((p) => p.id !== proj.id)]);
  const gList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
  setLocal(LOCAL_PROJECTS_KEY, [proj, ...gList.filter((p) => p.id !== proj.id)]);
}

export async function updateProject(
  projectId: string,
  updates: { name?: string; description?: string },
  userUid?: string
): Promise<ProjectItem> {
  const currentUid = userUid || auth?.currentUser?.uid || 'guest';
  const existing = await getProjectById(projectId, currentUid);
  if (!existing) {
    throw new Error('Project not found');
  }

  const updated: ProjectItem = {
    ...existing,
    ...(updates.name ? { name: updates.name.trim() } : {}),
    ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
    updated_at: new Date().toISOString(),
  };

  await saveProject(updated, currentUid);

  await recordAuditEvent({
    actor_id: currentUid,
    entity_type: 'project',
    entity_id: projectId,
    action: 'update',
    after_value: updated,
  });

  return updated;
}

export async function deleteProject(projectId: string, userUid?: string): Promise<boolean> {
  if (projectId === DEFAULT_PROJECT_ID) {
    throw new Error('لا يمكن حذف المشروع الرئيسي الافتراضي');
  }
  const currentUid = userUid || auth?.currentUser?.uid || 'guest';

  // 1. Delete from Firestore if configured
  if (isFirebaseConfigured && db && currentUid && currentUid !== 'guest') {
    try {
      await deleteDoc(doc(db, 'projects', projectId));
      // Also delete associated team
      await deleteDoc(doc(db, 'teams', `team_${projectId}`));
    } catch (e) {
      console.warn('Firestore deleteProject warning:', e);
    }
  }

  // 2. Delete from LocalStorage
  const uKey = `${LOCAL_PROJECTS_KEY}_${currentUid}`;
  const uList = getLocal<ProjectItem[]>(uKey, []);
  setLocal(uKey, uList.filter((p) => p.id !== projectId));

  const gList = getLocal<ProjectItem[]>(LOCAL_PROJECTS_KEY, []);
  setLocal(LOCAL_PROJECTS_KEY, gList.filter((p) => p.id !== projectId));

  // Also remove local team
  const localTeams = getLocal<any[]>('review_app_teams', []);
  setLocal('review_app_teams', localTeams.filter((t) => t.projectId !== projectId && t.id !== `team_${projectId}`));

  await recordAuditEvent({
    actor_id: currentUid,
    entity_type: 'project',
    entity_id: projectId,
    action: 'delete',
  });

  return true;
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

/**
 * Bounds any Firestore await: the sheet init path must never hang on a
 * slow/denied network (was: unbounded awaits → intermittent eternal
 * loading). On timeout the local mirror (sidecar-included) answers.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('firestore-timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export async function getTablesByReportId(reportId: string): Promise<TableEntity[]> {
  if (!reportId) return [];

  const merged = new Map<string, TableEntity>();
  const putLocal = (t: TableEntity) => {
    if (!t || !t.id) return;
    if (isTombed(t.id, tableUpdatedAt(t))) return;
    const prev = merged.get(t.id) || null;
    merged.set(t.id, pickFreshestTable(prev, t) as TableEntity);
  };

  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'tables'), where('report_id', '==', reportId));
      const snap = await withTimeout(getDocs(q), 8000);
      if (!snap.empty) {
        snap.docs.forEach((d) => {
          const rec = { id: d.id, ...d.data() } as TableEntity;
          if (!isTombed(rec.id, tableUpdatedAt(rec))) merged.set(rec.id, rec);
        });
      }
    } catch {}
  }

  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  all
    .filter((t) => t.report_id === reportId || t.reportId === reportId)
    .forEach((t) => putLocal({ ...t }));

  return Array.from(merged.values());
}

// Univer snapshots live in a sidecar key per table so one large sheet can
// never blow the localStorage quota for the whole tables array (which used
// to silently drop saves). Firestore keeps the full record; the sidecar is
// the local-only fallback.
function slimRecord(record: TableEntity): TableEntity {
  const { univerSnapshot: _drop, ...rest } = record as any;
  void _drop;
  return rest as TableEntity;
}

/**
 * Freshest-wins: a failed/slow Firestore write must never resurrect stale
 * server state over a newer local edit. Tombstones make deletes stick when
 * the remote delete silently fails.
 */
function tableUpdatedAt(t: TableEntity | null | undefined): number {
  try {
    const v = (t as any)?.updated_at || (t as any)?.updatedAt || 0;
    const n = new Date(v).getTime();
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function pickFreshestTable(a: TableEntity | null, b: TableEntity | null): TableEntity | null {
  if (!a) return b;
  if (!b) return a;
  return tableUpdatedAt(b) > tableUpdatedAt(a) ? b : a;
}

const LOCAL_TABLE_TOMBS_KEY = 'review_app_mock_tables_deleted';

/** Session-level delete guard: prevents late flushes from resurrecting deleted tables. */
const sessionDeletedTables = new Set<string>();

/** True when this session deleted the table — any further save must be skipped. */
export function isTableDeletedInSession(tableId: string): boolean {
  return !!tableId && sessionDeletedTables.has(tableId);
}

/** Clears the session delete guard (explicit re-create with the same id). */
export function clearTableTombForRecreate(tableId: string): void {
  try {
    sessionDeletedTables.delete(tableId);
    if (typeof localStorage !== 'undefined') {
      const tombs = readTombs();
      if (tombs[tableId] !== undefined) {
        delete tombs[tableId];
        localStorage.setItem(LOCAL_TABLE_TOMBS_KEY, JSON.stringify(tombs));
      }
    }
  } catch {}
}

function readTombs(): Record<string, number> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(LOCAL_TABLE_TOMBS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeTomb(tableId: string): void {
  try {
    if (typeof localStorage === 'undefined' || !tableId) return;
    const tombs = readTombs();
    tombs[tableId] = Date.now();
    const keys = Object.keys(tombs);
    // Cap: keep the newest 200 tombstones.
    if (keys.length > 200) {
      keys
        .sort((x, y) => (tombs[x] || 0) - (tombs[y] || 0))
        .slice(0, keys.length - 200)
        .forEach((k) => delete tombs[k]);
    }
    localStorage.setItem(LOCAL_TABLE_TOMBS_KEY, JSON.stringify(tombs));
  } catch {}
}

function isTombed(tableId: string, remoteUpdatedAt: number): boolean {
  try {
    const t = readTombs()[tableId];
    return typeof t === 'number' && t >= remoteUpdatedAt;
  } catch {
    return false;
  }
}

export function clearTableSnapshot(_tableId: string): void {
  // Legacy stub — snapshots removed
}

export async function saveTable(table: TableEntity): Promise<TableEntity> {
  if (table && (table as any).id && sessionDeletedTables.has((table as any).id)) {
    return table as TableEntity;
  }
  const now = new Date().toISOString();
  const record: TableEntity = {
    ...table,
    updated_at: now,
  };

  if (isFirebaseConfigured && db) {
    try {
      await withTimeout(setDoc(doc(db, 'tables', record.id), slimRecord(record), { merge: true }), 10000);
    } catch {}
  }

  const slim = slimRecord(record);
  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  const idx = all.findIndex((t) => t.id === slim.id);
  if (idx !== -1) {
    all[idx] = slim;
    setLocal(LOCAL_TABLES_KEY, all);
  } else {
    setLocal(LOCAL_TABLES_KEY, [slim, ...all]);
  }

  return record;
}

export async function getTableById(tableId: string): Promise<TableEntity | null> {
  if (!tableId) return null;

  let remote: TableEntity | null = null;
  if (isFirebaseConfigured && db) {
    try {
      const snap = await withTimeout(getDoc(doc(db, 'tables', tableId)), 8000);
      if (snap.exists()) {
        remote = { id: snap.id, ...snap.data() } as TableEntity;
      }
    } catch {}
  }

  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  const local = all.find((t) => t.id === tableId) || null;

  const best = pickFreshestTable(remote, local);
  if (best && isTombed(best.id, tableUpdatedAt(best))) return null;
  return best;
}

/**
 * Removes a table entity and all its metadata (rows, columns, formulas,
 * cell formats, merges, direction) from both Firestore and localStorage.
 * Used when a report (or a table node) is permanently removed.
 */
export async function deleteTableEntity(tableId: string): Promise<boolean> {
  if (!tableId) return false;
  // Mark first: any in-flight Univer flush after this point is dropped
  // by saveTable's session guard instead of resurrecting the table.
  sessionDeletedTables.add(tableId);

  if (isFirebaseConfigured && db) {
    try {
      await withTimeout(deleteDoc(doc(db, 'tables', tableId)), 8000);
    } catch (e) {
      // Remote delete failed — the tombstone below still hides it locally;
      // it resurrects only if the server copy becomes NEWER (re-created).
      console.warn('deleteTableEntity: remote delete failed, tombstoned locally', tableId);
    }
  }

  // Tombstone first: even if the remote delete above failed silently, the
  // table stays deleted locally and never resurrects from stale reads.
  writeTomb(tableId);
  const all = getLocal<TableEntity[]>(LOCAL_TABLES_KEY, []);
  setLocal(LOCAL_TABLES_KEY, all.filter((t) => t.id !== tableId));
  return true;
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

/** Public tombstone probe (Univer flush paths skip saves for deleted tables). */
export function isTableTombed(tableId: string): boolean {
  if (!tableId) return false;
  if (sessionDeletedTables.has(tableId)) return true;
  try {
    return readTombs()[tableId] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Clears ALL values inside a smart table (headers + cells + merges) while
 * keeping the table itself. Used by the "مسح القيم" action — the user asked
 * for an explicit way to empty a sheet whose values kept coming back.
 * The session delete-guard is cleared so the emptied table saves normally.
 */
export async function clearTableValues(tableId: string): Promise<boolean> {
  if (!tableId) return false;
  try {
    sessionDeletedTables.delete(tableId);
    try {
      if (typeof window !== 'undefined') {
        const tombs = readTombs();
        if (tombs[tableId] !== undefined) {
          delete tombs[tableId];
          localStorage.setItem(LOCAL_TABLE_TOMBS_KEY, JSON.stringify(tombs));
        }
      }
    } catch {}
    const existing = await getTableById(tableId);
    const now = new Date().toISOString();
    const base: any = existing || { id: tableId };
    const cols = Array.isArray(base.columns_data) && base.columns_data.length > 0
      ? base.columns_data
      : [
          { id: 'A', name: 'A', type: 'text', width: 140 },
          { id: 'B', name: 'B', type: 'text', width: 140 },
          { id: 'C', name: 'C', type: 'text', width: 140 },
        ];
    const emptyRow: Record<string, any> = {};
    cols.forEach((c: any) => { emptyRow[c.id] = ''; });

    const cleared: TableEntity = {
      ...(base as TableEntity),
      id: tableId,
      name: typeof base.name === 'string' ? base.name : 'Table',
      columns_data: cols,
      rows_data: [emptyRow],
      cell_formats: {},
      merged_cells: [],
      updated_at: now,
    };
    await saveTable(cleared);
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('smart-table-cleared', { detail: { tableId } }));
        window.dispatchEvent(new CustomEvent('smart-table-updated', { detail: { tableId } }));
        window.dispatchEvent(new CustomEvent('smart-table-rebuild', { detail: { tableId } }));
      }
    } catch {}
    return true;
  } catch (e) {
    console.warn('clearTableValues failed', tableId, e);
    return false;
  }
}

/** Current sheet direction ('rtl' default — Arabic reports). */
export function getTableDirection(t: TableEntity | null | undefined): 'rtl' | 'ltr' {
  return (t as any)?.direction === 'ltr' ? 'ltr' : 'rtl';
}

/**
 * Mirror table columns stub for backwards-compatibility.
 */
export async function mirrorTableColumns(_tableId: string): Promise<boolean> {
  return true;
}

/**
 * Flips a smart table's direction (RTL ⇄ LTR).
 */
export async function toggleTableDirection(tableId: string): Promise<'rtl' | 'ltr' | null> {
  if (!tableId) return null;
  try {
    if (sessionDeletedTables.has(tableId) || isTableTombed(tableId)) return null;
    const existing = await getTableById(tableId);
    if (!existing) return null;
    const next: 'rtl' | 'ltr' = getTableDirection(existing) === 'rtl' ? 'ltr' : 'rtl';
    const now = new Date().toISOString();
    await saveTable({
      ...(existing as TableEntity),
      direction: next,
      updated_at: now,
    });
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('smart-table-updated', { detail: { tableId } }));
        window.dispatchEvent(new CustomEvent('smart-table-rebuild', { detail: { tableId } }));
      }
    } catch {}
    return next;
  } catch (e) {
    console.warn('toggleTableDirection failed', tableId, e);
    return null;
  }
}

/**
 * Direction repair stub for backwards-compatibility.
 */
export async function repairTableDirection(entity: TableEntity): Promise<{ fixed: boolean; record: TableEntity }> {
  return { fixed: false, record: entity };
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
