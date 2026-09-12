import { db, auth, isFirebaseConfigured } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  getComments,
  getFolders,
  getIssues,
  getReportImages,
  getReports,
  type ScopeOpts,
} from './db';
import type { CommentItem, FolderItem, IssueItem, ReportImageItem, ReportItem } from './types';

export const BACKUP_VERSION = 1;
export const BACKUP_KIND = 'review-reports-backup';

export interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  exportedByUid: string;
  counts: { reports: number; folders: number; issues: number; images: number; comments: number };
  reports: ReportItem[];
  folders: FolderItem[];
  issues: IssueItem[];
  images: ReportImageItem[];
  comments: Array<CommentItem & { issueId: string }>;
}

export interface BackupProgress {
  stage: string;
  done: number;
  total: number;
}

function isGuestUid(uid: string): boolean {
  return !uid || uid.startsWith('guest_') || uid === 'guest_user_session';
}

function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => sanitizeForFirestore(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return value;
}

function validateBackupFile(raw: unknown): BackupFile {
  if (!raw || typeof raw !== 'object') throw new Error('invalid-backup');
  const f = raw as Partial<BackupFile>;
  if (f.kind !== BACKUP_KIND) throw new Error('not-a-backup-file');
  if (typeof f.version !== 'number' || f.version < 1) throw new Error('unsupported-backup-version');
  if (!Array.isArray(f.reports) || !Array.isArray(f.folders) || !Array.isArray(f.issues)) {
    throw new Error('corrupt-backup');
  }
  return {
    kind: BACKUP_KIND,
    version: f.version,
    exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : new Date().toISOString(),
    exportedByUid: typeof f.exportedByUid === 'string' ? f.exportedByUid : '',
    counts: f.counts ?? {
      reports: f.reports.length,
      folders: f.folders!.length,
      issues: f.issues!.length,
      images: Array.isArray(f.images) ? f.images.length : 0,
      comments: Array.isArray(f.comments) ? f.comments.length : 0,
    },
    reports: f.reports,
    folders: f.folders,
    issues: f.issues,
    images: Array.isArray(f.images) ? f.images : [],
    comments: Array.isArray(f.comments) ? f.comments : [],
  };
}

export function parseBackupFile(jsonText: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('invalid-json');
  }
  return validateBackupFile(raw);
}

const LOCAL_REPORTS_KEY = 'review_app_mock_reports';
const LOCAL_ISSUES_KEY = 'review_app_mock_issues';
const LOCAL_FOLDERS_KEY = 'review_app_mock_folders';
const LOCAL_IMAGES_KEY = 'review_app_mock_images';

function getLocal<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setLocal(key: string, value: unknown): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** One-shot full export of everything the user owns. Progress callback is best-effort. */
export async function buildUserBackup(
  userUid: string,
  userEmail?: string,
  onProgress?: (p: BackupProgress) => void
): Promise<BackupFile> {
  if (!userUid) throw new Error('unauthenticated');
  const opts: ScopeOpts = { includeArchived: true };
  onProgress?.({ stage: 'reports', done: 0, total: 4 });
  const reports = await getReports(userUid, userEmail, opts);
  onProgress?.({ stage: 'folders', done: 1, total: 4 });
  const folders = await getFolders(userUid, userEmail);
  onProgress?.({ stage: 'issues', done: 2, total: 4 });
  const issues = await getIssues(userUid, userEmail, opts);
  onProgress?.({ stage: 'images', done: 3, total: 4 });
  const images: ReportImageItem[] = [];
  for (const r of reports) {
    try {
      const imgs = await getReportImages(r.id);
      images.push(...imgs);
    } catch {}
  }
  const comments: Array<CommentItem & { issueId: string }> = [];
  for (const iss of issues) {
    try {
      const list = await getComments(iss.id);
      list.forEach((c) => comments.push({ ...c, issueId: iss.id }));
    } catch {}
  }
  onProgress?.({ stage: 'done', done: 4, total: 4 });
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exportedByUid: userUid,
    counts: { reports: reports.length, folders: folders.length, issues: issues.length, images: images.length, comments: comments.length },
    reports,
    folders,
    issues,
    images,
    comments,
  };
}

export function backupFileName(lang: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return lang === 'ar' ? `نسخة-احتياطية-${stamp}.json` : `backup-${stamp}.json`;
}

export function downloadBackup(file: BackupFile, lang: string): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(lang);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function restoreToFirestore(uid: string, file: BackupFile, onProgress?: (p: BackupProgress) => void): Promise<void> {
  const total = file.folders.length + file.reports.length + file.issues.length + file.images.length + file.comments.length;
  let done = 0;
  const tick = (stage: string) => {
    done++;
    onProgress?.({ stage, done, total });
  };
  for (const f of file.folders) {
    const id = String((f as FolderItem).id || '');
    if (!id) { tick('folders'); continue; }
    const payload = sanitizeForFirestore({ ...(f as object), ownerUid: uid, updatedAt: new Date().toISOString() });
    await setDoc(doc(db!, 'folders', id), payload, { merge: true });
    tick('folders');
  }
  for (const r of file.reports) {
    const id = String((r as ReportItem).id || '');
    if (!id) { tick('reports'); continue; }
    const payload = sanitizeForFirestore({ ...(r as object), ownerUid: uid, updatedAt: new Date().toISOString() });
    await setDoc(doc(db!, 'reports', id), payload, { merge: true });
    tick('reports');
  }
  for (const iss of file.issues) {
    const id = String((iss as IssueItem).id || '');
    if (!id) { tick('issues'); continue; }
    const payload = sanitizeForFirestore({ ...(iss as object), ownerUid: uid, updatedAt: new Date().toISOString() });
    await setDoc(doc(db!, 'issues', id), payload, { merge: true });
    tick('issues');
  }
  for (const img of file.images) {
    const id = String((img as ReportImageItem).id || '');
    const reportId = String((img as ReportImageItem).reportId || '');
    if (!id || !reportId) { tick('images'); continue; }
    // ReportImageItem is scoped by its parent report path — no ownerUid field.
    const payload = sanitizeForFirestore({ ...(img as object) });
    await setDoc(doc(db!, 'reports', reportId, 'images', id), payload, { merge: true });
    tick('images');
  }
  for (const c of file.comments) {
    const id = String((c as CommentItem).id || '');
    const issueId = String(c.issueId || '');
    if (!id || !issueId) { tick('comments'); continue; }
    const { issueId: _drop, ...rest } = c;
    // CommentItem keeps its original author fields (history) — no rewrite.
    const payload = sanitizeForFirestore({ ...rest });
    await setDoc(doc(db!, 'issues', issueId, 'comments', id), payload, { merge: true });
    tick('comments');
  }
}

function restoreToLocal(uid: string, file: BackupFile): void {
  const rKey = `${LOCAL_REPORTS_KEY}_${uid}`;
  const mergedReports = new Map<string, ReportItem>();
  getLocal<ReportItem[]>(rKey, []).forEach((r) => mergedReports.set(r.id, r));
  file.reports.forEach((r) => mergedReports.set(r.id, { ...r, ownerUid: uid }));
  if (!setLocal(rKey, Array.from(mergedReports.values()))) throw new Error('storage-full');

  const fKey = `${LOCAL_FOLDERS_KEY}_${uid}`;
  const mergedFolders = new Map<string, FolderItem>();
  getLocal<FolderItem[]>(fKey, []).forEach((f) => mergedFolders.set(f.id, f));
  file.folders.forEach((f) => mergedFolders.set(f.id, { ...f, ownerUid: uid }));
  if (!setLocal(fKey, Array.from(mergedFolders.values()))) throw new Error('storage-full');

  const iKey = `${LOCAL_ISSUES_KEY}_${uid}`;
  const mergedIssues = new Map<string, IssueItem>();
  getLocal<IssueItem[]>(iKey, []).forEach((i) => mergedIssues.set(i.id, i));
  file.issues.forEach((i) => mergedIssues.set(i.id, { ...i, ownerUid: uid }));
  if (!setLocal(iKey, Array.from(mergedIssues.values()))) throw new Error('storage-full');

  const imKey = `${LOCAL_IMAGES_KEY}_${uid}`;
  const mergedImages = new Map<string, ReportImageItem>();
  getLocal<ReportImageItem[]>(imKey, []).forEach((m) => mergedImages.set(m.id, m));
  file.images.forEach((m) => mergedImages.set(m.id, { ...m }));
  setLocal(imKey, Array.from(mergedImages.values()));
  // Comments live inside Firestore subcollections; on the local path they are
  // embedded in issue docs by the app — no separate restore needed.
}

/**
 * Merge-restore a backup into the current account. Existing docs with the same
 * id are overwritten (merge:true); nothing else is deleted. Ownership is
 * rewritten to the restoring user so cross-account restores stay isolated.
 */
export async function restoreUserBackup(
  userUid: string,
  file: BackupFile,
  onProgress?: (p: BackupProgress) => void
): Promise<void> {
  if (!userUid) throw new Error('unauthenticated');
  if (isGuestUid(userUid) || !isFirebaseConfigured || !db || !auth?.currentUser) {
    restoreToLocal(userUid, file);
    onProgress?.({ stage: 'done', done: 1, total: 1 });
    return;
  }
  await restoreToFirestore(userUid, file, onProgress);
}

/** Storage estimate for the settings card (best-effort, bytes). */
export async function estimateUserDataSize(userUid: string, userEmail?: string): Promise<number> {
  try {
    const [reports, folders, issues] = await Promise.all([
      getReports(userUid, userEmail, { includeArchived: true }),
      getFolders(userUid, userEmail),
      getIssues(userUid, userEmail, { includeArchived: true }),
    ]);
    return JSON.stringify({ reports, folders, issues }).length;
  } catch {
    return -1;
  }
}
