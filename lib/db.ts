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
  runTransaction,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage, auth, isFirebaseConfigured } from './firebase';
import { ReportItem, ReportImageItem, IssueItem, CommentItem, AuthorizedUser, SeverityConfigItem, FolderItem, ApiKeyItem } from './types';
import { normalizeSeverity } from './i18n/dictionary';
import { t } from './i18n/dictionary';

// Default authorized users whitelist for demo / bootstrap
const DEFAULT_WHITELIST: string[] = [
  'admin@example.com',
  'reviewer@example.com',
  'team@example.com',
  'hamed@example.com',
  'guest@review-app.local',
];

// LocalStorage Fallback Keys for offline/demo operation
const LOCAL_REPORTS_KEY = 'review_app_mock_reports';
const LOCAL_ISSUES_KEY = 'review_app_mock_issues';
const LOCAL_COMMENTS_KEY = 'review_app_mock_comments';
const LOCAL_IMAGES_KEY = 'review_app_mock_images';
const LOCAL_COUNTER_KEY = 'review_app_mock_counter';
const LOCAL_WHITELIST_KEY = 'review_app_mock_whitelist';
const LOCAL_SEVERITY_CONFIG_KEY = 'review_app_severity_config';
const LOCAL_FOLDERS_KEY = 'review_app_mock_folders';
const LOCAL_API_KEYS_KEY = 'review_app_api_keys';

// Helper for localStorage
function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Data-loss guard: detects quota exhaustion (QuotaExceededError — common
 * when images are stored as data-URLs) instead of failing silently.
 * Returns false when the write did NOT persist. Callers on the local-only
 * path must surface this instead of reporting success.
 */
export function isQuotaExceededError(e: unknown): boolean {
  const err = e as any;
  if (!err) return false;
  if (err.code === 22 || err.code === 1014) return true;
  const name = String(err.name || '');
  const msg = String(err.message || '').toLowerCase();
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    msg.includes('quota') ||
    msg.includes('exceed') ||
    msg.includes('storage') && msg.includes('full')
  );
}

function setLocal<T>(key: string, val: T): boolean {
  if (typeof window === 'undefined') return true;
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    console.error('Failed to save to localStorage', e);
    try {
      window.dispatchEvent(
        new CustomEvent('local-storage-full', {
          detail: { key, quota: isQuotaExceededError(e) },
        })
      );
    } catch {}
    return false;
  }
}

/**
 * Scans this browser for reports stored under OTHER owner uids
 * (e.g. after signing in with a different account/method than the one
 * that created them). Used to warn instead of looking "deleted".
 */
export function findOrphanedReportOwners(currentUid: string | undefined): Array<{ ownerUid: string; count: number }> {
  const out = new Map<string, number>();
  if (typeof window === 'undefined' || !currentUid) return [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LOCAL_REPORTS_KEY)) continue;
      const list = getLocal<ReportItem[]>(key, []);
      for (const r of list) {
        if (r && r.ownerUid && r.ownerUid !== currentUid) {
          out.set(r.ownerUid, (out.get(r.ownerUid) || 0) + 1);
        }
      }
    }
  } catch {}
  return Array.from(out.entries()).map(([ownerUid, count]) => ({ ownerUid, count }));
}

export async function isUserAuthorized(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  // If Firebase is configured and user is signed in, check or register in Firestore
  // Bounded: auth checks must never hang the login flow on a slow network.
  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const userDocRef = doc(db, 'authorized_users', normalized);
      const snap = await Promise.race([
        getDoc(userDocRef),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('authorized_users timeout')), 8000)
        ),
      ]);
      if (snap.exists()) {
        return true;
      }
      // Auto-register authenticated user in Firestore
      await setDoc(
        userDocRef,
        {
          email: normalized,
          addedAt: new Date().toISOString(),
          autoApproved: true,
        },
        { merge: true }
      ).catch(() => {});
      return true;
    } catch (e) {
      console.warn('Could not query authorized_users collection in Firestore', e);
    }
  }

  // Check local whitelist
  const localList = getLocal<string[]>(LOCAL_WHITELIST_KEY, DEFAULT_WHITELIST);
  return localList.includes(normalized);
}

/**
 * Add an authorized user email (admin feature)
 */
export async function addAuthorizedUser(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (isFirebaseConfigured && db) {
    const userDocRef = doc(db, 'authorized_users', normalized);
    await setDoc(userDocRef, {
      email: normalized,
      addedAt: new Date().toISOString(),
    });
  }
  const current = getLocal<string[]>(LOCAL_WHITELIST_KEY, DEFAULT_WHITELIST);
  if (!current.includes(normalized)) {
    setLocal(LOCAL_WHITELIST_KEY, [...current, normalized]);
  }
}

// ==========================================
// REPORTS
// ==========================================

function parseReportNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/** Strict validation for manually edited report numbers (Phase 2.1/B7). */
export function isValidReportNumber(value: unknown): boolean {
  return parseReportNumber(value) !== null;
}

function userCounterStorageKey(userUid?: string): string {
  return `${LOCAL_COUNTER_KEY}_${userUid || 'global'}`;
}

function collectLocalNumbers(userUid?: string): number[] {
  const out: number[] = [];
  const push = (r: ReportItem) => {
    if (!userUid || r.ownerUid === userUid) {
      const n = parseReportNumber(r.reportNumber);
      if (n !== null) out.push(n);
    }
  };
  if (userUid) {
    getLocal<ReportItem[]>(`${LOCAL_REPORTS_KEY}_${userUid}`, []).forEach(push);
  }
  getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []).forEach(push);
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
          getLocal<ReportItem[]>(key, []).forEach(push);
        }
      }
    } catch {}
  }
  return out;
}

export async function getNextReportNumber(userUid?: string): Promise<number> {
  const allNumbers: number[] = [];

  // 1. Collect numbers from Firestore
  if (isFirebaseConfigured && db) {
    try {
      let snap;
      if (userUid) {
        try {
          const q = query(collection(db, 'reports'), where('ownerUid', '==', userUid));
          snap = await getDocs(q);
        } catch {
          snap = await getDocs(collection(db, 'reports'));
        }
      } else {
        snap = await getDocs(collection(db, 'reports'));
      }
      snap.docs.forEach((d) => {
        const parsed = parseReportNumber(d.data()?.reportNumber);
        if (parsed !== null) allNumbers.push(parsed);
      });
    } catch (e) {
      console.warn('Could not query reports collection to find next report number in Firestore', e);
    }
  }

  // 2. Collect numbers from LocalStorage
  collectLocalNumbers(userUid).forEach((n) => allNumbers.push(n));

  // Next number is (highest existing report number + 1) or 1 if empty.
  // NOTE (Phase 2.1/B7): this scan is NOT atomic — it is kept for
  // migration/validation reads only. Allocation must use
  // allocateReportNumber(). The old dead writes to LOCAL_COUNTER_KEY and
  // `counters/reports` were removed (never read back).
  const maxExisting = allNumbers.length > 0 ? Math.max(...allNumbers) : 0;
  return maxExisting > 0 ? maxExisting + 1 : 1;
}

/**
 * Phase 2.1 (B7) — single atomic allocator for report numbers.
 *
 * SCOPE DECISION (per plan §2.1): numbers are unique PER USER (ownerUid),
 * not globally. Rationale: every list/sort/display surface is per-user,
 * Phase-1 rules forbid cross-user listing, and a global counter would leak
 * existence/counts across users. Each user owns `counters/reports_{uid}`.
 *
 * Firestore path: a per-user counter document `counters/reports_{uid}` is
 * advanced inside a transaction together with an in-transaction max-scan of
 * the user's reports, so concurrent creators always get distinct numbers
 * and deleting the highest report never reuses its number (monotonic).
 * Local path: per-user monotonic counter merged with the local max
 * (atomic for a single tab; multi-tab races documented as residual).
 */
export async function allocateReportNumber(userUid?: string): Promise<number> {
  const isGuest = !userUid || userUid.startsWith('guest_') || userUid === 'guest_user_session';

  if (isFirebaseConfigured && db && userUid && !isGuest && auth?.currentUser) {
    // Capture narrowed Firestore instance for the transaction closure.
    const fdb = db;
    try {
      // Pre-transaction max-scan (transaction.get(query) is unsupported in
      // firebase v10, so the scan happens here; the +1 step itself stays
      // inside the serialized counter transaction below).
      let preMax = 0;
      try {
        const q = query(collection(fdb, 'reports'), where('ownerUid', '==', userUid));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const n = parseReportNumber(d.data()?.reportNumber);
          if (n !== null && n > preMax) preMax = n;
        });
      } catch {}
      collectLocalNumbers(userUid).forEach((n) => {
        if (n > preMax) preMax = n;
      });

      const counterRef = doc(fdb, 'counters', `reports_${userUid}`);
      const next = await runTransaction(fdb, async (tx) => {
        const cSnap = await tx.get(counterRef);
        const counterVal = cSnap.exists()
          ? parseReportNumber(cSnap.data()?.currentNumber) || 0
          : 0;
        // Serialized: concurrent creators queue here, each seeing the
        // previous allocation — always distinct, never reusing deleted highs.
        const allocated = Math.max(preMax, counterVal) + 1;
        tx.set(counterRef, { currentNumber: allocated, ownerUid: userUid }, { merge: true });
        return allocated;
      });
      return next;
    } catch (e) {
      console.warn('Atomic number allocation failed, falling back to local allocator', e);
    }
  }

  // Local fallback (guests, offline, or transaction failure).
  const key = userCounterStorageKey(userUid);
  const stored = getLocal<number>(key, 0);
  const localMax = collectLocalNumbers(userUid).reduce((m, n) => Math.max(m, n), 0);
  const next = Math.max(Number.isInteger(stored) ? stored : 0, localMax) + 1;
  setLocal(key, next);
  return next;
}

/**
 * Phase 2.1 (B7) — one-time/per-create migration: finds duplicate report
 * numbers within a user's scope and reassigns them to fresh unique values.
 * The earliest-created report keeps its number; later duplicates move up
 * past the current max. Runs best-effort (never throws).
 */
export async function normalizeReportNumbers(
  userUid?: string
): Promise<{ fixed: number }> {
  try {
    if (!userUid) return { fixed: 0 };
    const merged = new Map<string, ReportItem>();

    if (isFirebaseConfigured && db && auth?.currentUser) {
      try {
        const q = query(collection(db, 'reports'), where('ownerUid', '==', userUid));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          merged.set(d.id, { id: d.id, ...(d.data() as object) } as ReportItem);
        });
      } catch {}
    }
    const pushLocal = (r: ReportItem) => {
      if (r.ownerUid === userUid && !merged.has(r.id)) merged.set(r.id, r);
    };
    getLocal<ReportItem[]>(`${LOCAL_REPORTS_KEY}_${userUid}`, []).forEach(pushLocal);
    getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []).forEach(pushLocal);

    const byNumber = new Map<number, ReportItem[]>();
    merged.forEach((r) => {
      const n = parseReportNumber(r.reportNumber);
      if (n !== null) {
        const list = byNumber.get(n) || [];
        list.push(r);
        byNumber.set(n, list);
      }
    });

    const dupes: ReportItem[] = [];
    byNumber.forEach((list) => {
      if (list.length > 1) {
        list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        dupes.push(...list.slice(1));
      }
    });
    if (dupes.length === 0) return { fixed: 0 };

    let maxSeen = 0;
    merged.forEach((r) => {
      const n = parseReportNumber(r.reportNumber);
      if (n !== null && n > maxSeen) maxSeen = n;
    });

    let batch: any = null;
    if (isFirebaseConfigured && db && auth?.currentUser) {
      try {
        batch = writeBatch(db);
      } catch {
        batch = null;
      }
    }

    for (const r of dupes) {
      maxSeen += 1;
      const now = new Date().toISOString();
      if (batch) {
        try {
          batch.update(doc(db as any, 'reports', r.id), { reportNumber: maxSeen, updatedAt: now });
        } catch {}
      }
      // Mirror into every local copy holding this report id.
      if (typeof window !== 'undefined') {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
              const list = getLocal<ReportItem[]>(key, []);
              const idx = list.findIndex((x) => x.id === r.id);
              if (idx !== -1) {
                list[idx] = { ...list[idx], reportNumber: maxSeen, updatedAt: now };
                setLocal(key, list);
              }
            }
          }
        } catch {}
      }
      const cur = merged.get(r.id);
      if (cur) merged.set(r.id, { ...cur, reportNumber: maxSeen, updatedAt: now });
    }

    if (batch) {
      try {
        await batch.commit();
      } catch (e) {
        console.warn('normalizeReportNumbers batch commit failed', e);
      }
    }
    return { fixed: dupes.length };
  } catch {
    return { fixed: 0 };
  }
}

/** Phase 2.1 (B7): uniqueness probe for manual number edits. */
export async function isReportNumberTaken(
  userUid: string | undefined,
  num: number,
  excludeId?: string
): Promise<boolean> {
  if (!userUid || !Number.isInteger(num) || num <= 0) return false;
  try {
    if (isFirebaseConfigured && db && auth?.currentUser) {
      try {
        const q = query(collection(db, 'reports'), where('ownerUid', '==', userUid));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          if (d.id !== excludeId && parseReportNumber(d.data()?.reportNumber) === num) return true;
        }
      } catch {}
    }
    const keys = [`${LOCAL_REPORTS_KEY}_${userUid}`, LOCAL_REPORTS_KEY];
    for (const key of keys) {
      const list = getLocal<ReportItem[]>(key, []);
      if (list.some((r) => r.id !== excludeId && r.ownerUid === userUid && parseReportNumber(r.reportNumber) === num)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Sort reports newest first (Report #5, #4, #3... highest reportNumber / newest timestamp first)
 */
export function sortReportsNewestFirst(list: ReportItem[]): ReportItem[] {
  return [...list].sort((a, b) => {
    const numA = typeof a.reportNumber === 'number' ? a.reportNumber : parseInt(String(a.reportNumber), 10) || 0;
    const numB = typeof b.reportNumber === 'number' ? b.reportNumber : parseInt(String(b.reportNumber), 10) || 0;
    if (numA > 0 && numB > 0 && numA !== numB) {
      return numB - numA; // Descending: latest report first
    }
    const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
    return timeB - timeA; // Descending: latest creation first
  });
}

export interface ScopeOpts {
  /** Include archived items (default false — archive leaves all lists). */
  includeArchived?: boolean;
}

export async function getReports(
  userUid?: string,
  userEmail?: string,
  opts?: ScopeOpts
): Promise<ReportItem[]> {
  // CRITICAL SECURITY FIX: Never return reports if userUid is missing!
  // An unauthenticated request must ALWAYS return an empty list []!
  if (!userUid || typeof userUid !== 'string' || !userUid.trim()) {
    return [];
  }
  const email = (userEmail || currentUserEmail() || '').trim().toLowerCase();
  // Archive lifecycle: archived reports leave default lists.
  const visible = (r: ReportItem): boolean =>
    !!opts?.includeArchived || !isArchivedReport(r);

  // Guest users are strictly local-storage isolated; never query or pollute Firestore!
  const isGuest = userUid.startsWith('guest_') || userUid === 'guest_user_session';
  if (isGuest) {
    const userReportsKey = `${LOCAL_REPORTS_KEY}_${userUid}`;
    const reports = getLocal<ReportItem[]>(userReportsKey, []);
    return sortReportsNewestFirst(reports.filter((r) => r.ownerUid === userUid && visible(r)));
  }

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      // Query STRICTLY user's reports by ownerUid
      const q = query(collection(db, 'reports'), where('ownerUid', '==', userUid));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ReportItem[];

      // Collaboration: reports shared directly + reports inside folders
      // the user owns or is invited to (current AND future reports —
      // resolved dynamically, no fan-out).
      if (email) {
        try {
          const sharedQ = query(
            collection(db, 'reports'),
            where('sharedWithEmails', 'array-contains', email)
          );
          const sharedSnap = await getDocs(sharedQ);
          sharedSnap.docs.forEach((d) => {
            list.push({ id: d.id, ...(d.data() as object) } as ReportItem);
          });
        } catch {}
        try {
          const folders = await getFolders(userUid, email);
          const extraFolderIds: string[] = [];
          folders.forEach((f) => {
            if (extraFolderIds.indexOf(f.id) === -1) extraFolderIds.push(f.id);
          });
          // Reports in others' shared folders AND reports collaborators
          // created inside our own folders.
          for (let i = 0; i < extraFolderIds.length; i += 30) {
            const chunk = extraFolderIds.slice(i, i + 30);
            if (chunk.length === 0) continue;
            const fq = query(collection(db, 'reports'), where('folderId', 'in', chunk));
            const fsnap = await getDocs(fq);
            fsnap.docs.forEach((d) => {
              list.push({ id: d.id, ...(d.data() as object) } as ReportItem);
            });
          }
        } catch {}
      }

      // Merge with user-isolated local cache (if any created offline/recently)
      const userReportsKey = `${LOCAL_REPORTS_KEY}_${userUid}`;
      const localReports = getLocal<ReportItem[]>(userReportsKey, []);
      const mergedMap = new Map<string, ReportItem>();
      list.forEach((r) => mergedMap.set(r.id, r));
      localReports.forEach((r) => {
        if (r.ownerUid === userUid && !mergedMap.has(r.id)) {
          mergedMap.set(r.id, r);
        }
      });

      return sortReportsNewestFirst(Array.from(mergedMap.values()).filter(visible));
    } catch (e) {
      console.warn('Firestore getReports failed, using isolated local storage fallback', e);
    }
  }

  // Isolated local storage strictly for this userUid (+ local shares by email
  // + folder inheritance: reports inside visible folders).
  const userReportsKey = `${LOCAL_REPORTS_KEY}_${userUid}`;
  const reports = getLocal<ReportItem[]>(userReportsKey, []);
  const globalReports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  const merged = new Map<string, ReportItem>();
  reports.forEach((r) => merged.set(r.id, r));
  let visibleFolderIds: Set<string> | null = null;
  if (email) {
    try {
      const folderList = await getFolders(userUid, email);
      visibleFolderIds = new Set(folderList.map((f) => f.id));
    } catch {
      visibleFolderIds = new Set();
    }
    globalReports.forEach((r) => {
      if (r.ownerUid !== userUid && isEmailInvited(r.sharedWithEmails, email)) merged.set(r.id, r);
      else if (
        r.ownerUid !== userUid &&
        r.folderId &&
        visibleFolderIds!.has(r.folderId) &&
        !merged.has(r.id)
      ) {
        merged.set(r.id, r);
      }
    });
  }
  return sortReportsNewestFirst(
    Array.from(merged.values()).filter(
      (r) =>
        visible(r) &&
        (r.ownerUid === userUid ||
          (email && isEmailInvited(r.sharedWithEmails, email)) ||
          (email && !!r.folderId && !!visibleFolderIds && visibleFolderIds.has(r.folderId)))
    )
  );
}

export async function getReportById(id: string, userUid?: string, userEmail?: string): Promise<ReportItem | null> {
  if (!id) return null;
  const email = (userEmail || currentUserEmail() || '').trim().toLowerCase();

  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'reports', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as ReportItem;
        // Check authorization: must be owned by userUid OR be a shared report (isShared: true)
        if (data.isShared || (userUid && data.ownerUid === userUid)) {
          return data;
        }
        // Collaboration: invited email on the report or on its folder.
        if (email && isEmailInvited(data.sharedWithEmails, email)) return data;
        if (email && data.folderId) {
          try {
            const folderSnap = await getDoc(doc(db, 'folders', data.folderId));
            if (folderSnap.exists()) {
              const folder = { id: folderSnap.id, ...folderSnap.data() } as FolderItem;
              if (isEmailInvited(folder.sharedWithEmails, email)) return data;
            }
          } catch {}
        }
        // If neither shared nor owned by userUid, forbid access!
        if (userUid && data.ownerUid && data.ownerUid !== userUid) {
          console.warn(`Access denied: Report ${id} owned by ${data.ownerUid} requested by ${userUid}`);
          return null;
        }
        if (!userUid && !data.isShared) {
          // Unauthenticated request for a private non-shared report
          return null;
        }
        return data;
      }
    } catch (e) {
      console.warn('Firestore getReportById failed, using local storage fallback', e);
    }
  }

  // Search user isolated cache first
  if (userUid) {
    const userReportsKey = `${LOCAL_REPORTS_KEY}_${userUid}`;
    const uReports = getLocal<ReportItem[]>(userReportsKey, []);
    const uFound = uReports.find((r) => r.id === id);
    if (uFound && (uFound.ownerUid === userUid || uFound.isShared)) return uFound;
    if (uFound && email && isEmailInvited(uFound.sharedWithEmails, email)) return uFound;
  }

  // Search global fallback strictly checking ownership or sharing
  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  const found = reports.find((r) => r.id === id);
  if (found) {
    if (found.isShared || (userUid && found.ownerUid === userUid)) {
      return found;
    }
    if (email && isEmailInvited(found.sharedWithEmails, email)) return found;
    // Collaboration: folder inheritance (local mode).
    if (email && userUid && found.folderId) {
      try {
        const folderList = await getFolders(userUid, email);
        if (folderList.some((f) => f.id === found.folderId)) return found;
      } catch {}
    }
    return null;
  }

  return null;
}

export async function createReport(
  reportData: Omit<ReportItem, 'id' | 'reportNumber' | 'createdAt' | 'updatedAt'>
): Promise<ReportItem> {
  // Phase 2.1 (B7): heal any pre-existing duplicates first, then allocate
  // atomically. Both are best-effort — creation must never fail because of
  // numbering.
  try {
    await normalizeReportNumbers(reportData.ownerUid);
  } catch {}
  let reportNumber: number;
  try {
    reportNumber = await allocateReportNumber(reportData.ownerUid);
  } catch {
    reportNumber = await getNextReportNumber(reportData.ownerUid);
  }
  const now = new Date().toISOString();

  // Strip undefined values so Firestore addDoc never throws an invalid argument error
  const sanitizedData: any = {
    ...reportData,
    folderId: reportData.folderId || null,
    reportNumber,
    createdAt: now,
    updatedAt: now,
  };
  Object.keys(sanitizedData).forEach((key) => {
    if (sanitizedData[key] === undefined) {
      delete sanitizedData[key];
    }
  });

  const isGuest = !reportData.ownerUid || reportData.ownerUid.startsWith('guest_') || reportData.ownerUid === 'guest_user_session';

  if (isFirebaseConfigured && db && !isGuest && auth?.currentUser) {
    try {
      const colRef = collection(db, 'reports');
      const docRef = await addDoc(colRef, sanitizedData);
      const createdItem: ReportItem = {
        id: docRef.id,
        ...sanitizedData,
      };

      // Also cache in user-scoped local storage
      if (reportData.ownerUid) {
        const uKey = `${LOCAL_REPORTS_KEY}_${reportData.ownerUid}`;
        const uReports = getLocal<ReportItem[]>(uKey, []);
        setLocal(uKey, [createdItem, ...uReports.filter((r) => r.id !== createdItem.id)]);
      }
      return createdItem;
    } catch (e) {
      console.error('Failed to create report in Firestore, saving locally', e);
    }
  }

  const newReport: ReportItem = {
    id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    ...sanitizedData,
  };

  // Save to user isolated storage — this IS the source of truth on the
  // local-only path, so a failed persist must throw loudly (otherwise the
  // report exists only in memory and "disappears" on refresh).
  if (reportData.ownerUid) {
    const userReportsKey = `${LOCAL_REPORTS_KEY}_${reportData.ownerUid}`;
    const userReports = getLocal<ReportItem[]>(userReportsKey, []);
    const persisted = setLocal(userReportsKey, [newReport, ...userReports.filter((r) => r.id !== newReport.id)]);
    if (!persisted) {
      const err: any = new Error('Local storage is full — the report could not be saved on this browser.');
      err.code = 'storage-full';
      throw err;
    }
  }
  return newReport;
}

export async function updateReport(id: string, partial: Partial<ReportItem>): Promise<boolean> {
  const now = new Date().toISOString();
  const sanitizedPartial: any = {
    ...partial,
    updatedAt: now,
  };
  Object.keys(sanitizedPartial).forEach((key) => {
    if (sanitizedPartial[key] === undefined) {
      delete sanitizedPartial[key];
    }
  });

  // Phase 2.1 (B7): strict guard — an invalid manual number (0, negative,
  // fractional, non-numeric) is never persisted. Returns false so callers
  // can surface it instead of showing false success.
  let valid = true;
  if ('reportNumber' in sanitizedPartial) {
    const n = parseReportNumber(sanitizedPartial.reportNumber);
    if (n === null) {
      console.warn(`updateReport: rejected invalid reportNumber for ${id}`, sanitizedPartial.reportNumber);
      delete sanitizedPartial.reportNumber;
      valid = false;
    } else {
      sanitizedPartial.reportNumber = n;
    }
  }

  let firestoreOk = true;
  const fdb = isFirebaseConfigured && db && auth?.currentUser ? db : undefined;
  const usedFirestore = !!fdb;
  if (fdb) {
    try {
      const docRef = doc(fdb, 'reports', id);
      await updateDoc(docRef, sanitizedPartial);
    } catch (e) {
      console.error('Failed to update report in Firestore', e);
      firestoreOk = false;
    }
  }

  // Update in user isolated storage (track success: on the local-only path
  // this IS the source of truth — a failed persist must report failure).
  let localOk = true;
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
          const list = getLocal<ReportItem[]>(key, []);
          const idx = list.findIndex((r) => r.id === id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...sanitizedPartial };
            if (!setLocal(key, list)) localOk = false;
          }
        }
      }
    } catch {}
  }

  // Update in global and user-specific stores
  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  const index = reports.findIndex((r) => r.id === id);
  let ownerUid = partial.ownerUid;
  if (index !== -1) {
    ownerUid = ownerUid || reports[index].ownerUid;
    reports[index] = { ...reports[index], ...sanitizedPartial, updatedAt: now };
    if (!setLocal(LOCAL_REPORTS_KEY, reports)) localOk = false;
  }

  // Directly update user-specific store
  if (typeof window !== 'undefined') {
    const targetUid = ownerUid || auth?.currentUser?.uid;
    if (targetUid) {
      const userKey = `${LOCAL_REPORTS_KEY}_${targetUid}`;
      const uReports = getLocal<ReportItem[]>(userKey, []);
      const uIdx = uReports.findIndex((r) => r.id === id);
      if (uIdx !== -1) {
        uReports[uIdx] = { ...uReports[uIdx], ...sanitizedPartial, updatedAt: now };
        if (!setLocal(userKey, uReports)) localOk = false;
      }
    }
  }

  // Phase 2.2 (B8): report persistence truthfully — false when the number
  // was rejected, the Firestore write failed, or (local-only path) the
  // local persist failed. Never report success for memory-only state.
  return valid && (usedFirestore ? firestoreOk : localOk);
}

/**
 * Delete a report.
 * Archive lifecycle: permanent delete is allowed only when NO ACTIVE linked
 * issues remain (archive the report first — archiving cascades to open
 * issues). ARCHIVED linked issues are cascade-deleted with their report.
 */
export async function deleteReport(id: string): Promise<{ success: boolean; error?: string }> {
  // Check linked issues INCLUDING archived (needed for the cascade).
  // NOTE: resolved with the current session uid so the check is real.
  // Local/demo fallback: linkage is by report id (not owner), so scan every
  // local issues store — otherwise the protection silently returns [].
  let currentUid: string | undefined;
  try {
    currentUid = auth?.currentUser?.uid || undefined;
  } catch {}
  const linkedByScope = await getIssuesByReportId(id, currentUid, { includeArchived: true });
  const linkedMap = new Map<string, IssueItem>();
  linkedByScope.forEach((i) => linkedMap.set(i.id, i));
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_ISSUES_KEY)) {
          getLocal<IssueItem[]>(key, []).forEach((iss) => {
            const linked = iss.linkedReportId || (iss as any).reportId;
            if (linked === id && !linkedMap.has(iss.id)) linkedMap.set(iss.id, iss);
          });
        }
      }
    } catch {}
  }
  const linkedIssues = Array.from(linkedMap.values());
  const activeLinked = linkedIssues.filter((i) => !isArchivedIssue(i));
  if (activeLinked.length > 0) {
    return {
      success: false,
      error: 'reportCannotBeDeletedHasIssues',
    };
  }

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      await deleteDoc(doc(db, 'reports', id));
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  setLocal(
    LOCAL_REPORTS_KEY,
    reports.filter((r) => r.id !== id)
  );

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${LOCAL_REPORTS_KEY}_`)) {
          const uReports = getLocal<ReportItem[]>(key, []);
          setLocal(
            key,
            uReports.filter((r) => r.id !== id)
          );
        }
      }
    } catch {}
  }

  // Clean up every table entity (values, formulas, formats, merges) owned by
  // this report so no orphan metadata is left behind.
  try {
    const { deleteTablesByReportId } = await import('./db-intelligence');
    await deleteTablesByReportId(id);
  } catch (e) {
    console.warn('Table metadata cleanup failed for report', id, e);
  }

  // Cascade: permanently delete ARCHIVED linked issues (active ones block
  // above, so anything left here is archived and belongs to this report).
  for (const iss of linkedIssues) {
    try {
      await deleteIssue(iss.id);
    } catch (e) {
      console.warn('Cascade issue delete failed for', iss.id, e);
    }
  }

  return { success: true };
}

// ==========================================
// ARCHIVE LIFECYCLE
// ==========================================
//
// Methodology (reports AND issues share it):
//   active → archived (soft, reversible, timestamped) → restore | delete.
// - Archived items leave every default list/board/count (opt-in to view).
// - Archiving a report optionally archives its OPEN linked issues too.
// - Restoring never cascades (explicit per-item restore only).
// - Permanent delete is allowed only when NO active linked issues remain;
//   archived linked issues are cascade-deleted with their report.
// - Archive/restore/delete stay OWNER-ONLY (collaborators edit + comment).
// - Report numbers are never reused (Phase-2 counters are monotonic).

export function isArchivedReport(r: ReportItem | null | undefined): boolean {
  if (!r) return false;
  return r.status === 'archived' || !!r.archived_at || !!r.archivedAt;
}

export function isArchivedIssue(i: IssueItem | null | undefined): boolean {
  if (!i) return false;
  return !!(i.archived_at || i.archivedAt);
}

export async function archiveReport(
  id: string,
  userUid: string,
  opts?: { archiveIssues?: boolean }
): Promise<{ ok: boolean; error?: string; archivedIssues?: number }> {
  const rep = await getReportById(id, userUid);
  if (!rep) return { ok: false, error: 'not-found' };
  if (rep.ownerUid !== userUid) return { ok: false, error: 'forbidden' };
  if (isArchivedReport(rep)) return { ok: true, archivedIssues: 0 };

  const now = new Date().toISOString();
  const ok = await updateReport(id, {
    status: 'archived',
    statusBeforeArchive: rep.status && rep.status !== 'archived' ? rep.status : undefined,
    archived_at: now,
    archivedAt: now,
  } as Partial<ReportItem>);
  if (!ok) return { ok: false, error: 'save-failed' };

  // Optionally archive OPEN linked issues with their report (reversible).
  let archivedIssues = 0;
  if (opts?.archiveIssues !== false) {
    try {
      const linked = await getIssuesByReportId(id, userUid);
      const { archiveIssue } = await import('./db-intelligence');
      for (const iss of linked) {
        if (isArchivedIssue(iss)) continue;
        try {
          await archiveIssue(iss.id, userUid, 'Archived with parent report');
          archivedIssues++;
        } catch {}
      }
    } catch {}
  }
  return { ok: true, archivedIssues };
}

export async function unarchiveReport(
  id: string,
  userUid: string
): Promise<{ ok: boolean; error?: string }> {
  const rep = await getReportById(id, userUid, undefined);
  // NOTE: archived reports are hidden from default getReports; fetch
  // directly so restore works from the archive view. getReportById has no
  // archive filter, so this resolves regardless of status.
  if (!rep) return { ok: false, error: 'not-found' };
  if (rep.ownerUid !== userUid) return { ok: false, error: 'forbidden' };
  if (!isArchivedReport(rep)) return { ok: true };

  const ok = await updateReport(id, {
    status: rep.statusBeforeArchive && rep.statusBeforeArchive !== 'archived' ? rep.statusBeforeArchive : 'draft',
    statusBeforeArchive: null,
    archived_at: null,
    archivedAt: null,
  } as Partial<ReportItem>);
  return ok ? { ok: true } : { ok: false, error: 'save-failed' };
}

export async function unarchiveIssue(id: string, userUid: string): Promise<{ ok: boolean; error?: string }> {
  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const snap = await getDoc(doc(db, 'issues', id));
      if (!snap.exists()) return { ok: false, error: 'not-found' };
      const data = snap.data() as IssueItem;
      if (data.ownerUid !== userUid) return { ok: false, error: 'forbidden' };
      await updateDoc(doc(db, 'issues', id), {
        archived_at: null,
        archivedAt: null,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      return { ok: false, error: 'save-failed' };
    }
  }
  // Local mirrors: verify existence + ownership (fail closed).
  let found = false;
  let owned = false;
  const now = new Date().toISOString();
  try {
    const global = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
    const gIdx = global.findIndex((x) => x.id === id);
    if (gIdx !== -1) {
      found = true;
      if (global[gIdx].ownerUid === userUid) {
        owned = true;
        global[gIdx] = { ...global[gIdx], archived_at: null, archivedAt: null, updatedAt: now };
        setLocal(LOCAL_ISSUES_KEY, global);
      }
    }
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${LOCAL_ISSUES_KEY}_`)) {
          const list = getLocal<IssueItem[]>(key, []);
          const uIdx = list.findIndex((x) => x.id === id);
          if (uIdx !== -1) {
            found = true;
            if (list[uIdx].ownerUid === userUid) {
              owned = true;
              list[uIdx] = { ...list[uIdx], archived_at: null, archivedAt: null, updatedAt: now };
              setLocal(key, list);
            }
          }
        }
      }
    }
  } catch {}
  if (!found) return { ok: false, error: 'not-found' };
  if (!owned) return { ok: false, error: 'forbidden' };
  return { ok: true };
}

// ==========================================
// REPORT IMAGES
// ==========================================

export async function getReportImages(reportId: string): Promise<ReportImageItem[]> {
  let firestoreImages: ReportImageItem[] = [];
  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'reports', reportId, 'images');
      const snap = await getDocs(colRef);
      firestoreImages = snap.docs.map((d) => ({
        id: d.id,
        reportId,
        ...d.data(),
      })) as ReportImageItem[];
    } catch (e) {
      console.warn('Firestore getReportImages failed, falling back to local storage', e);
    }
  }

  // Always merge with local storage cache so items are never lost or ignored
  const localImages = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, [])
    .filter((img) => img.reportId === reportId);

  const map = new Map<string, ReportImageItem>();
  for (const img of localImages) {
    map.set(img.id, img);
  }
  for (const img of firestoreImages) {
    map.set(img.id, img);
  }

  return Array.from(map.values()).sort((a, b) => (a.sequenceNumber || 1) - (b.sequenceNumber || 1));
}

/**
 * Helper to compress and optimize image for local storage to prevent QuotaExceededError
 */
export async function createOptimizedDataUrl(file: File | Blob): Promise<string> {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (typeof window === 'undefined' || !rawDataUrl) {
        resolve(rawDataUrl || '');
        return;
      }
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 2560;
        const isPng = file.type === 'image/png';

        // If file is under 3MB and dimensions fit within 2560, preserve original lossless data
        if (file.size < 3 * 1024 * 1024 && img.width <= MAX_DIM && img.height <= MAX_DIM) {
          resolve(rawDataUrl);
          return;
        }

        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        // Use high quality image smoothing for crystal-clear screenshots and text
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const optimized = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.95);
        resolve(optimized);
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export async function uploadReportImage(
  reportId: string,
  file: File | Blob,
  caption: string = '',
  reportLanguage: 'ar' | 'en' = 'ar',
  forcedSequenceNumber?: number,
  forcedId?: string,
  index?: number
): Promise<ReportImageItem> {
  // 1. Calculate next sequenceNumber for this report
  const existingImages = await getReportImages(reportId);
  const maxExistingSeq = existingImages.length > 0 ? Math.max(...existingImages.map((i) => i.sequenceNumber || 0)) : 0;
  const nextSeq = forcedSequenceNumber && forcedSequenceNumber > 0
    ? forcedSequenceNumber
    : (maxExistingSeq > 0 ? maxExistingSeq + 1 : 1);

  // File naming: sequenceNumber is fixed/immutable!
  const prefix = reportLanguage === 'ar' ? 'صورة-' : 'image-';
  const fileName = `${prefix}${nextSeq}.png`;
  const storagePath = `reports/${reportId}/images/${fileName}`;
  const now = new Date().toISOString();
  const effectiveId = forcedId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : ('img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)));

  let downloadUrl = '';

  // Only attempt Firebase Storage if user is actually authenticated to avoid permission loops
  if (isFirebaseConfigured && storage && db && auth?.currentUser) {
    try {
      const storageRef = ref(storage, storagePath);
      // Timeout after 4 seconds to never keep user hanging
      const uploadPromise = uploadBytes(storageRef, file);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Firebase Storage timeout')), 4000)
      );
      await Promise.race([uploadPromise, timeoutPromise]);
      downloadUrl = await getDownloadURL(storageRef);

      const imagesCol = collection(db, 'reports', reportId, 'images');
      const docRef = await addDoc(imagesCol, {
        reportId,
        sequenceNumber: nextSeq,
        index: typeof index === 'number' ? index : nextSeq - 1,
        fileName,
        storagePath,
        downloadUrl,
        caption,
        createdAt: now,
      });

      const uploadedImage: ReportImageItem = {
        id: docRef.id,
        reportId,
        sequenceNumber: nextSeq,
        index: typeof index === 'number' ? index : nextSeq - 1,
        fileName,
        storagePath,
        downloadUrl,
        caption,
        createdAt: now,
      };

      // Also cache in local storage
      const images = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, []);
      setLocal(LOCAL_IMAGES_KEY, [...images, uploadedImage]);

      return uploadedImage;
    } catch (e) {
      console.warn('Firebase storage upload skipped or failed, using optimized local storage', e);
    }
  }

  // Fast & reliable local fallback with canvas compression
  downloadUrl = await createOptimizedDataUrl(file);

  const newImage: ReportImageItem = {
    id: effectiveId,
    reportId,
    sequenceNumber: nextSeq,
    index: typeof index === 'number' ? index : nextSeq - 1,
    fileName,
    storagePath,
    downloadUrl,
    caption,
    createdAt: now,
  };

  const images = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, []);
  setLocal(LOCAL_IMAGES_KEY, [...images, newImage]);
  return newImage;
}

export async function updateImageCaption(
  reportId: string,
  imageId: string,
  caption: string
): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const imageDoc = doc(db, 'reports', reportId, 'images', imageId);
      await updateDoc(imageDoc, { caption });
      return;
    } catch (e) {
      console.warn('Failed to update image caption in Firestore', e);
    }
  }

  const images = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, []);
  const idx = images.findIndex((img) => img.id === imageId);
  if (idx !== -1) {
    images[idx].caption = caption;
    setLocal(LOCAL_IMAGES_KEY, images);
  }
}

export async function updateImageFileName(
  reportId: string,
  imageId: string,
  fileName: string
): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const imageDoc = doc(db, 'reports', reportId, 'images', imageId);
      // Keep storagePath stable and untouched to avoid breaking stored file references
      await updateDoc(imageDoc, { fileName });
      return;
    } catch (e) {
      console.warn('Failed to update image fileName in Firestore', e);
    }
  }

  const images = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, []);
  const idx = images.findIndex((img) => img.id === imageId);
  if (idx !== -1) {
    images[idx].fileName = fileName;
    setLocal(LOCAL_IMAGES_KEY, images);
  }

  // Phase 4.3 (B16): propagate the new fileName into embedded reportImage
  // nodes so every matching key (id/src/fileName/seq) stays consistent
  // after a rename — otherwise the appendix could list the image again.
  // Best-effort: a rename must never fail because of this sync.
  try {
    const uid = auth?.currentUser?.uid;
    const rep = await getReportById(reportId, uid);
    if (rep?.contentJson) {
      let changed = false;
      const visit = (node: any): void => {
        if (!node) return;
        if (
          node.type === 'reportImage' &&
          node.attrs &&
          String(node.attrs.imageId || '') === imageId &&
          node.attrs.fileName !== fileName
        ) {
          node.attrs = { ...node.attrs, fileName };
          changed = true;
        }
        if (Array.isArray(node.content)) node.content.forEach(visit);
      };
      visit(rep.contentJson);
      if (changed) await updateReport(reportId, { contentJson: rep.contentJson });
    }
  } catch {}
}

export async function deleteReportImage(
  reportId: string,
  imageId: string
): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      const imageDoc = doc(db, 'reports', reportId, 'images', imageId);
      await deleteDoc(imageDoc);
    } catch (e) {
      console.warn('Failed to delete image in Firestore', e);
    }
  }

  const images = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, []);
  const filtered = images.filter((img) => img.id !== imageId);
  setLocal(LOCAL_IMAGES_KEY, filtered);
}

// ==========================================
// ISSUES & DEFECTS
// ==========================================

export const DEFAULT_SEVERITY_CONFIG: SeverityConfigItem[] = [
  { id: 'critical', order: 1, labelAr: 'حرجة جداً', labelEn: 'Critical' },
  { id: 'major', order: 2, labelAr: 'كبيرة / مرتفعة', labelEn: 'Major' },
  { id: 'medium', order: 3, labelAr: 'متوسطة الخطورة', labelEn: 'Medium' },
  { id: 'normal', order: 4, labelAr: 'عادية', labelEn: 'Normal' },
  { id: 'minor', order: 5, labelAr: 'طفيفة / منخفضة', labelEn: 'Minor' },
];

export function getSeverityConfig(userUid?: string): SeverityConfigItem[] {
  const key = userUid ? `${LOCAL_SEVERITY_CONFIG_KEY}_${userUid}` : LOCAL_SEVERITY_CONFIG_KEY;
  const stored = getLocal<SeverityConfigItem[]>(key, []);
  if (stored && stored.length > 0) {
    return [...stored].sort((a, b) => a.order - b.order);
  }
  return DEFAULT_SEVERITY_CONFIG;
}

export async function saveSeverityConfig(config: SeverityConfigItem[], userUid?: string): Promise<void> {
  const sorted = config.map((item, idx) => ({
    ...item,
    order: idx + 1,
  }));
  const key = userUid ? `${LOCAL_SEVERITY_CONFIG_KEY}_${userUid}` : LOCAL_SEVERITY_CONFIG_KEY;
  setLocal(key, sorted);
  setLocal(LOCAL_SEVERITY_CONFIG_KEY, sorted);

  if (isFirebaseConfigured && db && (userUid || auth?.currentUser?.uid)) {
    try {
      const uid = userUid || auth?.currentUser?.uid;
      if (uid) {
        const docRef = doc(db, 'user_settings', uid);
        await setDoc(docRef, { severityConfig: sorted, updatedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (e) {
      console.warn('Failed to save severity config to Firestore', e);
    }
  }
}

export function normalizeSeverityId(s: string): string {
  return normalizeSeverity(s);
}

export function getSeverityNumericRank(severity: string, userUid?: string): number {
  const norm = normalizeSeverityId(severity);
  const config = getSeverityConfig(userUid);
  const found = config.find((c) => c.id === norm || c.id === severity);
  return found ? found.order : 99;
}

function sortIssuesByOrder(list: IssueItem[], userUid?: string): IssueItem[] {
  const config = getSeverityConfig(userUid);
  const rankMap = new Map<string, number>(config.map((c) => [c.id, c.order]));

  return list.sort((a, b) => {
    // If explicit order index exists on both, sort by it
    if (typeof a.order === 'number' && typeof b.order === 'number') {
      return a.order - b.order;
    }
    if (typeof a.order === 'number') return -1;
    if (typeof b.order === 'number') return 1;

    // Otherwise default by severity numeric rank (1 to 5)
    const normA = normalizeSeverityId(a.severity);
    const normB = normalizeSeverityId(b.severity);
    const rankA = rankMap.get(normA) ?? rankMap.get(a.severity) ?? 99;
    const rankB = rankMap.get(normB) ?? rankMap.get(b.severity) ?? 99;
    if (rankA !== rankB) return rankA - rankB;

    return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime();
  });
}

export async function getIssues(userUid?: string, userEmail?: string, opts?: ScopeOpts): Promise<IssueItem[]> {
  // CRITICAL SECURITY FIX: Never return issues if userUid is missing!
  if (!userUid || typeof userUid !== 'string' || !userUid.trim()) {
    return [];
  }
  const email = (userEmail || currentUserEmail() || '').trim().toLowerCase();
  // Archive lifecycle: archived issues leave the board by default.
  const visibleIssue = (i: IssueItem): boolean =>
    !!opts?.includeArchived || !isArchivedIssue(i);

  // Guest users are strictly local-storage isolated; never query or pollute Firestore!
  const isGuest = userUid.startsWith('guest_') || userUid === 'guest_user_session';
  if (isGuest) {
    const userIssuesKey = `${LOCAL_ISSUES_KEY}_${userUid}`;
    const issues = getLocal<IssueItem[]>(userIssuesKey, []);
    return sortIssuesByOrder(issues.filter((i) => i.ownerUid === userUid && visibleIssue(i)), userUid);
  }

  // Collaboration: ids of reports this user may see (owned + shared).
  // Used to include issues linked to shared reports (any owner).
  // NOTE: access resolution always includes archived reports (checks, not lists).
  let accessibleReportIds: Set<string> | null = null;
  const resolveAccessibleIds = async (): Promise<Set<string>> => {
    if (accessibleReportIds) return accessibleReportIds;
    accessibleReportIds = new Set<string>();
    try {
      const reports = await getReports(userUid, email, { includeArchived: true });
      reports.forEach((r) => accessibleReportIds!.add(r.id));
    } catch {}
    return accessibleReportIds;
  };
  const isLinkedAccessible = (i: IssueItem, ids: Set<string>): boolean => {
    const linked = i.linkedReportId || (i as any).reportId;
    return !!linked && ids.has(linked);
  };

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const q = query(collection(db, 'issues'), where('ownerUid', '==', userUid));
      const snap = await getDocs(q);
      const issues = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as IssueItem[];
      // Collaboration: issues on shared reports (any owner).
      if (email) {
        try {
          const ids = await resolveAccessibleIds();
          const linkedIds = Array.from(ids);
          for (let i = 0; i < linkedIds.length; i += 30) {
            const chunk = linkedIds.slice(i, i + 30);
            if (chunk.length === 0) continue;
            const lq = query(collection(db, 'issues'), where('linkedReportId', 'in', chunk));
            const lsnap = await getDocs(lq);
            lsnap.docs.forEach((d) => {
              issues.push({ id: d.id, ...(d.data() as object) } as IssueItem);
            });
          }
        } catch {}
      }
      // De-duplicate by id, then keep own + linked-accessible only.
      const seen = new Map<string, IssueItem>();
      issues.forEach((iss) => seen.set(iss.id, iss));
      const ids = await resolveAccessibleIds();
      const scoped = Array.from(seen.values()).filter(
        (iss) => visibleIssue(iss) && (iss.ownerUid === userUid || isLinkedAccessible(iss, ids))
      );
      return sortIssuesByOrder(scoped, userUid);
    } catch (e) {
      console.warn('Firestore getIssues failed, using local storage fallback', e);
    }
  }

  // Local storage strictly isolated per user UID (+ shared by link)
  const userIssuesKey = `${LOCAL_ISSUES_KEY}_${userUid}`;
  const issues = getLocal<IssueItem[]>(userIssuesKey, []);
  const globalIssues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  const merged = new Map<string, IssueItem>();
  issues.forEach((i) => merged.set(i.id, i));
  if (email) {
    const ids = await resolveAccessibleIds();
    globalIssues.forEach((i) => {
      if (i.ownerUid !== userUid && isLinkedAccessible(i, ids)) merged.set(i.id, i);
    });
  }
  const ids = await resolveAccessibleIds();
  return sortIssuesByOrder(
    Array.from(merged.values()).filter(
      (i) => visibleIssue(i) && (i.ownerUid === userUid || isLinkedAccessible(i, ids))
    ),
    userUid
  );
}

export async function reorderIssues(
  updates: Array<{ id: string; order: number; status?: IssueItem['status'] }>
): Promise<void> {
  const now = new Date().toISOString();

  if (isFirebaseConfigured && db && auth?.currentUser) {
    const firestore = db;
    try {
      const batch = writeBatch(firestore);
      updates.forEach((u) => {
        const docRef = doc(firestore, 'issues', u.id);
        const patch: any = { order: u.order, updatedAt: now };
        if (u.status) patch.status = u.status;
        batch.update(docRef, patch);
      });
      await batch.commit();
    } catch (e) {
      console.warn('Batch update reorder issues failed in Firestore, using sequential fallback', e);
      for (const u of updates) {
        try {
          const docRef = doc(firestore, 'issues', u.id);
          const patch: any = { order: u.order, updatedAt: now };
          if (u.status) patch.status = u.status;
          await updateDoc(docRef, patch);
        } catch {}
      }
    }
  }

  // Update in localStorage
  const updateMap = new Map(updates.map((u) => [u.id, u]));
  const globalIssues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  const updatedGlobal = globalIssues.map((iss) => {
    const up = updateMap.get(iss.id);
    if (up) {
      return {
        ...iss,
        order: up.order,
        ...(up.status ? { status: up.status } : {}),
        updatedAt: now,
      };
    }
    return iss;
  });
  setLocal(LOCAL_ISSUES_KEY, updatedGlobal);

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${LOCAL_ISSUES_KEY}_`)) {
          const uIssues = getLocal<IssueItem[]>(key, []);
          const updatedUser = uIssues.map((iss) => {
            const up = updateMap.get(iss.id);
            if (up) {
              return {
                ...iss,
                order: up.order,
                ...(up.status ? { status: up.status } : {}),
                updatedAt: now,
              };
            }
            return iss;
          });
          setLocal(key, updatedUser);
        }
      }
    } catch {}
  }
}

export async function getIssuesByReportId(
  reportId: string,
  userUid?: string,
  opts?: ScopeOpts
): Promise<IssueItem[]> {
  const all = await getIssues(userUid, undefined, opts);
  return all.filter((i) => i.linkedReportId === reportId || (i as any).reportId === reportId);
}

export async function createIssue(
  data: Omit<IssueItem, 'id' | 'createdAt' | 'updatedAt' | 'commentsCount'>
): Promise<IssueItem> {
  const now = new Date().toISOString();
  const linkedReportId = data.linkedReportId || data.reportId || null;
  const payloadData = {
    ...data,
    linkedReportId,
    ...(data.reportId ? { reportId: data.reportId } : (linkedReportId ? { reportId: linkedReportId } : {})),
  };

  let resultIssue: IssueItem | null = null;
  const isGuest = !payloadData.ownerUid || payloadData.ownerUid.startsWith('guest_') || payloadData.ownerUid === 'guest_user_session';

  if (isFirebaseConfigured && db && !isGuest && auth?.currentUser) {
    try {
      const docRef = await addDoc(collection(db, 'issues'), {
        ...payloadData,
        createdAt: now,
        updatedAt: now,
        commentsCount: 0,
      });
      const createdItem: IssueItem = {
        id: docRef.id,
        ...payloadData,
        createdAt: now,
        updatedAt: now,
        commentsCount: 0,
      };

      if (payloadData.ownerUid) {
        const uKey = `${LOCAL_ISSUES_KEY}_${payloadData.ownerUid}`;
        const uIssues = getLocal<IssueItem[]>(uKey, []);
        setLocal(uKey, [createdItem, ...uIssues.filter((i) => i.id !== createdItem.id)]);
      }
      resultIssue = createdItem;
    } catch (e) {
      console.error('Failed to create issue in Firestore', e);
    }
  }

  if (!resultIssue) {
    const newIssue: IssueItem = {
      id: 'iss_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      ...payloadData,
      createdAt: now,
      updatedAt: now,
      commentsCount: 0,
    };

    if (payloadData.ownerUid) {
      const userIssuesKey = `${LOCAL_ISSUES_KEY}_${payloadData.ownerUid}`;
      const userIssues = getLocal<IssueItem[]>(userIssuesKey, []);
      setLocal(userIssuesKey, [newIssue, ...userIssues]);
    }
    const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
    setLocal(LOCAL_ISSUES_KEY, [newIssue, ...issues]);
    resultIssue = newIssue;
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('issue-created', {
        detail: { count: 1, issue: resultIssue },
      })
    );
  }

  return resultIssue;
}

export async function updateIssue(id: string, partial: Partial<IssueItem>): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const docRef = doc(db, 'issues', id);
      await updateDoc(docRef, {
        ...partial,
        updatedAt: now,
      });
    } catch (e) {
      console.error('Failed to update issue in Firestore', e);
    }
  }

  const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  const idx = issues.findIndex((i) => i.id === id);
  if (idx !== -1) {
    issues[idx] = { ...issues[idx], ...partial, updatedAt: now };
    setLocal(LOCAL_ISSUES_KEY, issues);
  }

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${LOCAL_ISSUES_KEY}_`)) {
          const uIssues = getLocal<IssueItem[]>(key, []);
          const uIdx = uIssues.findIndex((i) => i.id === id);
          if (uIdx !== -1) {
            uIssues[uIdx] = { ...uIssues[uIdx], ...partial, updatedAt: now };
            setLocal(key, uIssues);
          }
        }
      }
    } catch {}
  }
}

export async function deleteIssue(id: string): Promise<void> {
  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      await deleteDoc(doc(db, 'issues', id));
    } catch (e) {
      console.error('Failed to delete issue in Firestore', e);
    }
  }

  const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  setLocal(
    LOCAL_ISSUES_KEY,
    issues.filter((i) => i.id !== id)
  );

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${LOCAL_ISSUES_KEY}_`)) {
          const uIssues = getLocal<IssueItem[]>(key, []);
          setLocal(
            key,
            uIssues.filter((i) => i.id !== id)
          );
        }
      }
    } catch {}
  }
}

// ==========================================
// COMMENTS
// ==========================================

export async function getComments(issueId: string): Promise<CommentItem[]> {
  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'issues', issueId, 'comments');
      const q = query(colRef, orderBy('createdAt', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.id,
        issueId,
        ...d.data(),
      })) as CommentItem[];
    } catch (e) {
      console.warn('Firestore getComments failed', e);
    }
  }

  const comments = getLocal<CommentItem[]>(LOCAL_COMMENTS_KEY, []);
  return comments
    .filter((c) => c.issueId === issueId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export async function addComment(
  issueId: string,
  data: Omit<CommentItem, 'id' | 'issueId' | 'createdAt'>
): Promise<CommentItem> {
  const now = new Date().toISOString();

  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'issues', issueId, 'comments');
      const docRef = await addDoc(colRef, {
        ...data,
        createdAt: now,
      });

      // Update issue updatedAt and commentsCount
      const issueDoc = doc(db, 'issues', issueId);
      const comments = await getComments(issueId);
      await updateDoc(issueDoc, {
        updatedAt: now,
        commentsCount: comments.length,
      });

      return {
        id: docRef.id,
        issueId,
        ...data,
        createdAt: now,
      };
    } catch (e) {
      console.error('Firestore addComment failed', e);
    }
  }

  const newComment: CommentItem = {
    id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    issueId,
    ...data,
    createdAt: now,
  };

  const comments = getLocal<CommentItem[]>(LOCAL_COMMENTS_KEY, []);
  setLocal(LOCAL_COMMENTS_KEY, [...comments, newComment]);

  // Update issue
  const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx !== -1) {
    issues[idx].updatedAt = now;
    issues[idx].commentsCount = (issues[idx].commentsCount || 0) + 1;
    setLocal(LOCAL_ISSUES_KEY, issues);
  }

  return newComment;
}

// ==========================================
// REPORT SHARING (PUBLIC READ-ONLY LINKS)
// ==========================================

export async function createOrUpdateShareToken(reportId: string): Promise<string> {
  const rand1 = Math.random().toString(36).substring(2, 12);
  const rand2 = Math.random().toString(36).substring(2, 12);
  const time = Date.now().toString(36);
  const token = `sh_${rand1}${rand2}${time}`;
  const now = new Date().toISOString();

  await updateReport(reportId, {
    shareToken: token,
    isShared: true,
    sharedAt: now,
  });

  return token;
}

export async function revokeShareToken(reportId: string): Promise<void> {
  await updateReport(reportId, {
    shareToken: null,
    isShared: false,
    sharedAt: null,
  });
}

export async function getReportByShareToken(
  token: string
): Promise<{ report: ReportItem; images: ReportImageItem[] } | null> {
  if (!token || typeof token !== 'string') return null;

  // 1. Search in Firestore
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'reports'),
        where('shareToken', '==', token),
        where('isShared', '==', true)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const rep = { id: docSnap.id, ...docSnap.data() } as ReportItem;
        if (rep.isShared === true && rep.shareToken === token) {
          const images = await getReportImages(rep.id);
          return { report: rep, images };
        }
      }
    } catch (e) {
      console.warn('Firestore getReportByShareToken query error', e);
    }
  }

  // 2. Search in LocalStorage Fallback
  const allReports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  let found = allReports.find((r) => r.shareToken === token && r.isShared === true);

  if (!found && typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
          const list = getLocal<ReportItem[]>(key, []);
          const match = list.find((r) => r.shareToken === token && r.isShared === true);
          if (match) {
            found = match;
            break;
          }
        }
      }
    } catch {}
  }

  if (found) {
    const images = await getReportImages(found.id);
    return { report: found, images };
  }

  return null;
}

// ==========================================
// FOLDERS MANAGEMENT
// ==========================================

export async function getFolders(userUid?: string, userEmail?: string): Promise<FolderItem[]> {
  // CRITICAL SECURITY FIX: Never return folders if userUid is missing!
  if (!userUid || typeof userUid !== 'string' || !userUid.trim()) {
    return [];
  }
  const email = (userEmail || currentUserEmail() || '').trim().toLowerCase();

  // Guest users are strictly local-storage isolated; never query or pollute Firestore!
  const isGuest = userUid.startsWith('guest_') || userUid === 'guest_user_session';
  if (isGuest) {
    const userKey = `${LOCAL_FOLDERS_KEY}_${userUid}`;
    const folders = getLocal<FolderItem[]>(userKey, []);
    return [...folders.filter((f) => f.ownerUid === userUid)].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const q = query(collection(db, 'folders'), where('ownerUid', '==', userUid));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as FolderItem[];
      // Collaboration: folders shared with this user (email).
      if (email) {
        try {
          const sharedQ = query(
            collection(db, 'folders'),
            where('sharedWithEmails', 'array-contains', email)
          );
          const sharedSnap = await getDocs(sharedQ);
          const seen = new Set(list.map((f) => f.id));
          sharedSnap.docs.forEach((d) => {
            if (!seen.has(d.id)) {
              seen.add(d.id);
              list.push({ id: d.id, ...(d.data() as object) } as FolderItem);
            }
          });
        } catch {}
      }
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (e) {
      console.warn('Firestore getFolders failed, using local storage fallback', e);
    }
  }

  const userKey = `${LOCAL_FOLDERS_KEY}_${userUid}`;
  const folders = getLocal<FolderItem[]>(userKey, []);
  const globalFolders = getLocal<FolderItem[]>(LOCAL_FOLDERS_KEY, []);
  const merged = new Map<string, FolderItem>();
  folders.forEach((f) => merged.set(f.id, f));
  if (email) {
    globalFolders.forEach((f) => {
      if (f.ownerUid !== userUid && isEmailInvited(f.sharedWithEmails, email)) merged.set(f.id, f);
    });
  }
  return Array.from(merged.values())
    .filter((f) => f.ownerUid === userUid || (email && isEmailInvited(f.sharedWithEmails, email)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getFolderById(id: string, userUid?: string, userEmail?: string): Promise<FolderItem | null> {
  if (!id) return null;
  const email = (userEmail || currentUserEmail() || '').trim().toLowerCase();

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const snap = await getDoc(doc(db, 'folders', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as FolderItem;
        if (userUid && data.ownerUid && data.ownerUid !== userUid) {
          // Collaboration: invited email may still read.
          if (email && isEmailInvited(data.sharedWithEmails, email)) return data;
          return null;
        }
        return data;
      }
    } catch (e) {
      console.warn('Firestore getFolderById failed', e);
    }
  }

  if (userUid) {
    const folders = getLocal<FolderItem[]>(`${LOCAL_FOLDERS_KEY}_${userUid}`, []);
    const found = folders.find((f) => f.id === id && f.ownerUid === userUid);
    if (found) return found;
  }
  if (email) {
    const globalFolders = getLocal<FolderItem[]>(LOCAL_FOLDERS_KEY, []);
    const shared = globalFolders.find((f) => f.id === id && isEmailInvited(f.sharedWithEmails, email));
    if (shared) return shared;
  }

  return null;
}

export async function createFolder(data: {
  name: string;
  parentId: string | null;
  color?: string;
  ownerUid?: string;
}): Promise<FolderItem> {
  const now = new Date().toISOString();
  const folderName = data.name.trim();
  const isGuest = !data.ownerUid || data.ownerUid.startsWith('guest_') || data.ownerUid === 'guest_user_session';

  if (isFirebaseConfigured && db && !isGuest && auth?.currentUser) {
    try {
      const colRef = collection(db, 'folders');
      const docRef = await addDoc(colRef, {
        name: folderName,
        parentId: data.parentId || null,
        color: data.color || null,
        ownerUid: data.ownerUid || '',
        createdAt: now,
        updatedAt: now,
      });

      const created: FolderItem = {
        id: docRef.id,
        name: folderName,
        parentId: data.parentId || null,
        color: data.color,
        ownerUid: data.ownerUid || '',
        createdAt: now,
        updatedAt: now,
      };

      if (data.ownerUid) {
        const uKey = `${LOCAL_FOLDERS_KEY}_${data.ownerUid}`;
        const uFolders = getLocal<FolderItem[]>(uKey, []);
        setLocal(uKey, [...uFolders, created]);
      }

      return created;
    } catch (e) {
      console.error('Failed to create folder in Firestore', e);
    }
  }

  const newFolder: FolderItem = {
    id: 'fld_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    name: folderName,
    parentId: data.parentId || null,
    color: data.color,
    ownerUid: data.ownerUid || '',
    createdAt: now,
    updatedAt: now,
  };

  if (data.ownerUid) {
    const uKey = `${LOCAL_FOLDERS_KEY}_${data.ownerUid}`;
    const uFolders = getLocal<FolderItem[]>(uKey, []);
    setLocal(uKey, [...uFolders, newFolder]);
  }

  return newFolder;
}

export async function updateFolder(id: string, partial: Partial<FolderItem>): Promise<void> {
  const now = new Date().toISOString();

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const docRef = doc(db, 'folders', id);
      await updateDoc(docRef, {
        ...partial,
        updatedAt: now,
      });
    } catch (e) {
      console.error('Failed to update folder in Firestore', e);
    }
  }

  const globalFolders = getLocal<FolderItem[]>(LOCAL_FOLDERS_KEY, []);
  const idx = globalFolders.findIndex((f) => f.id === id);
  if (idx !== -1) {
    globalFolders[idx] = { ...globalFolders[idx], ...partial, updatedAt: now };
    setLocal(LOCAL_FOLDERS_KEY, globalFolders);
  }

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_FOLDERS_KEY)) {
          const uFolders = getLocal<FolderItem[]>(key, []);
          const uIdx = uFolders.findIndex((f) => f.id === id);
          if (uIdx !== -1) {
            uFolders[uIdx] = { ...uFolders[uIdx], ...partial, updatedAt: now };
            setLocal(key, uFolders);
          }
        }
      }
    } catch {}
  }
}

// ==========================================
// COLLABORATION (INVITES BY EMAIL)
// ==========================================
//
// Sharing key = the collaborator's lowercase account EMAIL (no users
// directory exists; Firestore rules match request.auth.token.email).
// - Report invite  → access to that one report (read/write, no delete,
//   no share-management).
// - Folder invite  → access to every report directly inside the folder,
//   current AND future (resolved dynamically at read time — subfolders
//   are NOT included).
// - Issues/comments/images/tables follow the report: collaborators see
//   and edit only what is linked to reports they can access.

const LOCAL_AUTH_USER_KEY = 'review_app_auth_user';

/** Normalize + validate an invite email. Returns null when invalid. */
export function normalizeShareEmail(email: unknown): string | null {
  const v = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

/** Best-effort current user email (Firebase, else the stored session). */
export function currentUserEmail(): string {
  try {
    const fb = auth?.currentUser?.email;
    if (fb && fb.trim()) return fb.trim().toLowerCase();
  } catch {}
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_AUTH_USER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.email) return String(parsed.email).trim().toLowerCase();
      }
    } catch {}
  }
  return '';
}

export function isEmailInvited(
  sharedWithEmails: string[] | undefined,
  email: string
): boolean {
  if (!email || !Array.isArray(sharedWithEmails)) return false;
  const norm = email.trim().toLowerCase();
  return sharedWithEmails.some((e) => String(e || '').trim().toLowerCase() === norm);
}

/**
 * Pure access check for a report when the (optional) folder is already
 * loaded. Owner always passes. Shared-link (isShared) is intentionally
 * NOT access here — it is anonymous, not collaboration.
 */
export function canAccessReport(
  report: ReportItem | null | undefined,
  userUid: string | undefined,
  userEmail: string,
  folder?: FolderItem | null
): boolean {
  if (!report || !userUid) return false;
  if (report.ownerUid === userUid) return true;
  if (isEmailInvited(report.sharedWithEmails, userEmail)) return true;
  if (report.folderId && folder && folder.id === report.folderId) {
    if (folder.ownerUid === userUid) return true;
    if (isEmailInvited(folder.sharedWithEmails, userEmail)) return true;
  }
  return false;
}

/** Owner-only gate for managing invites on a report/folder. */
function isShareManager(ownerUid: string | undefined, requesterUid: string | undefined): boolean {
  return !!ownerUid && !!requesterUid && ownerUid === requesterUid;
}

async function writeReportShares(reportId: string, emails: string[]): Promise<boolean> {
  const clean = Array.from(new Set(emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)));
  return updateReport(reportId, { sharedWithEmails: clean });
}

async function writeFolderShares(folderId: string, emails: string[]): Promise<boolean> {
  const clean = Array.from(new Set(emails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)));
  try {
    await updateFolder(folderId, { sharedWithEmails: clean });
    return true;
  } catch {
    return false;
  }
}

export async function inviteToReport(
  reportId: string,
  email: unknown,
  requesterUid: string
): Promise<{ ok: boolean; error?: string }> {
  const norm = normalizeShareEmail(email);
  if (!norm) return { ok: false, error: 'invalid-email' };
  if (norm === currentUserEmail()) return { ok: false, error: 'cannot-invite-self' };
  const rep = await getReportById(reportId, requesterUid);
  if (!rep || !isShareManager(rep.ownerUid, requesterUid)) return { ok: false, error: 'forbidden' };
  const ok = await writeReportShares(reportId, [...(rep.sharedWithEmails || []), norm]);
  return ok ? { ok: true } : { ok: false, error: 'save-failed' };
}

export async function revokeReportInvite(
  reportId: string,
  email: unknown,
  requesterUid: string
): Promise<{ ok: boolean; error?: string }> {
  const norm = normalizeShareEmail(email);
  if (!norm) return { ok: false, error: 'invalid-email' };
  const rep = await getReportById(reportId, requesterUid);
  if (!rep || !isShareManager(rep.ownerUid, requesterUid)) return { ok: false, error: 'forbidden' };
  const ok = await writeReportShares(
    reportId,
    (rep.sharedWithEmails || []).filter((e) => e !== norm)
  );
  return ok ? { ok: true } : { ok: false, error: 'save-failed' };
}

export async function inviteToFolder(
  folderId: string,
  email: unknown,
  requesterUid: string
): Promise<{ ok: boolean; error?: string }> {
  const norm = normalizeShareEmail(email);
  if (!norm) return { ok: false, error: 'invalid-email' };
  if (norm === currentUserEmail()) return { ok: false, error: 'cannot-invite-self' };
  const folder = await getFolderById(folderId, requesterUid);
  if (!folder || !isShareManager(folder.ownerUid, requesterUid)) return { ok: false, error: 'forbidden' };
  const ok = await writeFolderShares(folderId, [...(folder.sharedWithEmails || []), norm]);
  return ok ? { ok: true } : { ok: false, error: 'save-failed' };
}

export async function revokeFolderInvite(
  folderId: string,
  email: unknown,
  requesterUid: string
): Promise<{ ok: boolean; error?: string }> {
  const norm = normalizeShareEmail(email);
  if (!norm) return { ok: false, error: 'invalid-email' };
  const folder = await getFolderById(folderId, requesterUid);
  if (!folder || !isShareManager(folder.ownerUid, requesterUid)) return { ok: false, error: 'forbidden' };
  const ok = await writeFolderShares(
    folderId,
    (folder.sharedWithEmails || []).filter((e) => e !== norm)
  );
  return ok ? { ok: true } : { ok: false, error: 'save-failed' };
}

/**
 * Checks whether moving folderId into targetParentId would create a circular reference.
 * Returns TRUE if a cycle would be created (ILLEGAL MOVE), FALSE if safe.
 */export function wouldCreateFolderCycle(
  folderId: string,
  targetParentId: string | null,
  allFolders: FolderItem[]
): boolean {
  if (!targetParentId) return false; // Moving to root is always safe
  if (folderId === targetParentId) return true; // Cannot be parent of itself

  const folderMap = new Map<string, FolderItem>();
  allFolders.forEach((f) => folderMap.set(f.id, f));

  let currentId: string | null = targetParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === folderId) {
      return true; // Target parent is a descendant of folderId!
    }
    if (visited.has(currentId)) {
      return true; // Existing loop detected
    }
    visited.add(currentId);
    const parentFolder = folderMap.get(currentId);
    currentId = parentFolder?.parentId || null;
  }

  return false;
}

/**
 * Safely delete a folder:
 * Any reports or subfolders in this folder are reparented to this folder's parent (or root),
 * ensuring NO data is deleted or orphaned.
 */
export async function deleteFolderSafe(
  id: string,
  userUid?: string
): Promise<{ success: boolean; movedReportsCount: number; movedFoldersCount: number }> {
  const allFolders = await getFolders(userUid);
  const targetFolder = allFolders.find((f) => f.id === id);
  const newParentId = targetFolder?.parentId || null;

  // 1. Reparent reports
  const allReports = await getReports(userUid);
  const affectedReports = allReports.filter((r) => r.folderId === id);
  for (const rep of affectedReports) {
    await updateReport(rep.id, { folderId: newParentId });
  }

  // 2. Reparent child folders
  const affectedSubfolders = allFolders.filter((f) => f.parentId === id);
  for (const sub of affectedSubfolders) {
    await updateFolder(sub.id, { parentId: newParentId });
  }

  // 3. Delete the folder itself
  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      await deleteDoc(doc(db, 'folders', id));
    } catch (e) {
      console.warn('Firestore deleteFolder failed', e);
    }
  }

  const globalFolders = getLocal<FolderItem[]>(LOCAL_FOLDERS_KEY, []);
  setLocal(
    LOCAL_FOLDERS_KEY,
    globalFolders.filter((f) => f.id !== id)
  );

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_FOLDERS_KEY)) {
          const uFolders = getLocal<FolderItem[]>(key, []);
          setLocal(
            key,
            uFolders.filter((f) => f.id !== id)
          );
        }
      }
    } catch {}
  }

  return {
    success: true,
    movedReportsCount: affectedReports.length,
    movedFoldersCount: affectedSubfolders.length,
  };
}

export async function moveReportToFolder(
  reportId: string,
  folderId: string | null
): Promise<void> {
  await updateReport(reportId, { folderId: folderId || null });
}

/**
 * Returns or creates the default dedicated folder for AI Agent reports.
 */
export async function getOrCreateAiReportsFolder(userUid?: string): Promise<FolderItem> {
  const folders = await getFolders(userUid);
  const existing = folders.find(
    (f) =>
      f.parentId === null &&
      (f.name.trim() === 'تقارير الوكيل الذكي' ||
        f.name.trim().toLowerCase() === 'ai agent reports')
  );

  if (existing) return existing;

  return await createFolder({
    name: 'تقارير الوكيل الذكي',
    parentId: null,
    ownerUid: userUid,
  });
}

// ==========================================
// API KEYS MANAGEMENT (FOR AI AGENT REST API)
// ==========================================

export async function getApiKeys(userUid?: string): Promise<ApiKeyItem[]> {
  if (isFirebaseConfigured && db) {
    try {
      let snap;
      if (userUid) {
        const q = query(collection(db, 'api_keys'), where('ownerUid', '==', userUid));
        snap = await getDocs(q);
      } else {
        snap = await getDocs(collection(db, 'api_keys'));
      }
      return snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ApiKeyItem[];
    } catch (e) {
      console.warn('Firestore getApiKeys failed', e);
    }
  }

  const userKey = userUid ? `${LOCAL_API_KEYS_KEY}_${userUid}` : LOCAL_API_KEYS_KEY;
  let keys = getLocal<ApiKeyItem[]>(userKey, []);

  if (keys.length === 0 && userUid) {
    const globalKeys = getLocal<ApiKeyItem[]>(LOCAL_API_KEYS_KEY, []);
    const userMatches = globalKeys.filter((k) => k.ownerUid === userUid);
    if (userMatches.length > 0) {
      keys = userMatches;
      setLocal(userKey, keys);
    }
  }

  return keys;
}

export async function saveApiKeyRecord(keyItem: ApiKeyItem): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await setDoc(doc(db, 'api_keys', keyItem.id), keyItem);
    } catch (e) {
      console.warn('Firestore saveApiKeyRecord failed', e);
    }
  }

  if (keyItem.ownerUid) {
    const uKey = `${LOCAL_API_KEYS_KEY}_${keyItem.ownerUid}`;
    const uKeys = getLocal<ApiKeyItem[]>(uKey, []);
    setLocal(uKey, [keyItem, ...uKeys.filter((k) => k.id !== keyItem.id)]);
  }

  const globalKeys = getLocal<ApiKeyItem[]>(LOCAL_API_KEYS_KEY, []);
  setLocal(LOCAL_API_KEYS_KEY, [keyItem, ...globalKeys.filter((k) => k.id !== keyItem.id)]);
}

export async function revokeApiKeyRecord(id: string, userUid?: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'api_keys', id), {
        status: 'revoked',
        revokedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Firestore revokeApiKeyRecord failed', e);
    }
  }

  const globalKeys = getLocal<ApiKeyItem[]>(LOCAL_API_KEYS_KEY, []);
  const idx = globalKeys.findIndex((k) => k.id === id);
  if (idx !== -1) {
    globalKeys[idx].status = 'revoked';
    setLocal(LOCAL_API_KEYS_KEY, globalKeys);
  }

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_API_KEYS_KEY)) {
          const list = getLocal<ApiKeyItem[]>(key, []);
          const uIdx = list.findIndex((k) => k.id === id);
          if (uIdx !== -1) {
            list[uIdx].status = 'revoked';
            setLocal(key, list);
          }
        }
      }
    } catch {}
  }
}

export async function toggleApiKeyStatusRecord(
  id: string,
  newStatus: 'active' | 'paused',
  userUid?: string
): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await updateDoc(doc(db, 'api_keys', id), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Firestore toggleApiKeyStatusRecord failed', e);
    }
  }

  const globalKeys = getLocal<ApiKeyItem[]>(LOCAL_API_KEYS_KEY, []);
  const idx = globalKeys.findIndex((k) => k.id === id);
  if (idx !== -1) {
    globalKeys[idx].status = newStatus;
    setLocal(LOCAL_API_KEYS_KEY, globalKeys);
  }

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_API_KEYS_KEY)) {
          const list = getLocal<ApiKeyItem[]>(key, []);
          const uIdx = list.findIndex((k) => k.id === id);
          if (uIdx !== -1) {
            list[uIdx].status = newStatus;
            setLocal(key, list);
          }
        }
      }
    } catch {}
  }
}

export const AGENT_API_ENABLED_KEY = 'agent_api_enabled';

export async function getAgentApiMasterStatus(userUid?: string): Promise<boolean> {
  if (isFirebaseConfigured && db) {
    try {
      if (userUid) {
        const userDoc = await getDoc(doc(db, 'user_settings', userUid));
        if (userDoc.exists() && typeof userDoc.data()?.agentApiEnabled === 'boolean') {
          return userDoc.data().agentApiEnabled;
        }
      }
      const sysDoc = await getDoc(doc(db, 'system_settings', 'agent_api'));
      if (sysDoc.exists() && typeof sysDoc.data()?.enabled === 'boolean') {
        return sysDoc.data().enabled;
      }
    } catch (e) {
      console.warn('Firestore getAgentApiMasterStatus failed', e);
    }
  }

  const uKey = userUid ? `${AGENT_API_ENABLED_KEY}_${userUid}` : AGENT_API_ENABLED_KEY;
  const localVal = getLocal<boolean | null>(uKey, null);
  if (localVal !== null) return localVal;

  const globalVal = getLocal<boolean | null>(AGENT_API_ENABLED_KEY, null);
  if (globalVal !== null) return globalVal;

  return true;
}

export async function setAgentApiMasterStatus(enabled: boolean, userUid?: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      if (userUid) {
        await setDoc(doc(db, 'user_settings', userUid), { agentApiEnabled: enabled }, { merge: true });
      }
      await setDoc(doc(db, 'system_settings', 'agent_api'), { enabled, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('Firestore setAgentApiMasterStatus failed', e);
    }
  }

  if (userUid) {
    setLocal(`${AGENT_API_ENABLED_KEY}_${userUid}`, enabled);
  }
  setLocal(AGENT_API_ENABLED_KEY, enabled);
}

export async function findApiKeyByHash(keyHash: string): Promise<ApiKeyItem | null> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'api_keys'),
        where('keyHash', '==', keyHash)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as ApiKeyItem;
      }
    } catch (e) {
      console.warn('Firestore findApiKeyByHash failed', e);
    }
  }

  const globalKeys = getLocal<ApiKeyItem[]>(LOCAL_API_KEYS_KEY, []);
  const found = globalKeys.find((k) => k.keyHash === keyHash);
  if (found) return found;

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_API_KEYS_KEY)) {
          const list = getLocal<ApiKeyItem[]>(key, []);
          const m = list.find((k) => k.keyHash === keyHash);
          if (m) return m;
        }
      }
    } catch {}
  }

  return null;
}

// ==========================================
// UNIFIED INTELLIGENCE ENTITIES & RELATIONS
// ==========================================
export * from './db-intelligence';
