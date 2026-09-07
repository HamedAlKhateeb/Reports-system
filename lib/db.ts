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
import { ReportItem, ReportImageItem, IssueItem, CommentItem, AuthorizedUser } from './types';
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

function setLocal<T>(key: string, val: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

export async function isUserAuthorized(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  // If Firebase is configured and user is signed in, check or register in Firestore
  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const userDocRef = doc(db, 'authorized_users', normalized);
      const snap = await getDoc(userDocRef);
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

  // Also auto-add to local whitelist
  const localList = getLocal<string[]>(LOCAL_WHITELIST_KEY, DEFAULT_WHITELIST);
  if (!localList.includes(normalized)) {
    setLocal(LOCAL_WHITELIST_KEY, [...localList, normalized]);
  }
  return true;
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

export async function getNextReportNumber(): Promise<number> {
  const allNumbers: number[] = [];

  // 1. Collect numbers from Firestore
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDocs(collection(db, 'reports'));
      snap.docs.forEach((d) => {
        const num = d.data()?.reportNumber;
        const parsed = typeof num === 'number' ? num : parseInt(String(num), 10);
        if (!isNaN(parsed) && parsed > 0) {
          allNumbers.push(parsed);
        }
      });
    } catch (e) {
      console.warn('Could not query reports collection to find next report number in Firestore', e);
    }
  }

  // 2. Collect numbers from LocalStorage
  const globalReports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  globalReports.forEach((r) => {
    const parsed = typeof r.reportNumber === 'number' ? r.reportNumber : parseInt(String(r.reportNumber), 10);
    if (!isNaN(parsed) && parsed > 0) {
      allNumbers.push(parsed);
    }
  });

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
          const uReports = getLocal<ReportItem[]>(key, []);
          uReports.forEach((r) => {
            const parsed = typeof r.reportNumber === 'number' ? r.reportNumber : parseInt(String(r.reportNumber), 10);
            if (!isNaN(parsed) && parsed > 0) {
              allNumbers.push(parsed);
            }
          });
        }
      }
    } catch {}
  }

  // Next number is (highest existing report number + 1) or 1 if empty
  const maxExisting = allNumbers.length > 0 ? Math.max(...allNumbers) : 0;
  const nextNum = maxExisting > 0 ? maxExisting + 1 : 1;

  // Keep local counter and Firestore counter synchronized
  setLocal(LOCAL_COUNTER_KEY, nextNum);
  if (isFirebaseConfigured && db) {
    try {
      const counterRef = doc(db, 'counters', 'reports');
      await setDoc(counterRef, { currentNumber: nextNum }, { merge: true });
    } catch {}
  }

  return nextNum;
}

/**
 * Sort reports oldest first (Report #1, #2, #3... or earliest createdAt)
 */
function sortReportsOldestFirst(list: ReportItem[]): ReportItem[] {
  return list.sort((a, b) => {
    const numA = typeof a.reportNumber === 'number' ? a.reportNumber : parseInt(String(a.reportNumber), 10) || 0;
    const numB = typeof b.reportNumber === 'number' ? b.reportNumber : parseInt(String(b.reportNumber), 10) || 0;
    if (numA > 0 && numB > 0 && numA !== numB) {
      return numA - numB;
    }
    const timeA = new Date(a.createdAt || a.updatedAt).getTime();
    const timeB = new Date(b.createdAt || b.updatedAt).getTime();
    return timeA - timeB;
  });
}

export async function getReports(userUid?: string): Promise<ReportItem[]> {
  if (isFirebaseConfigured && db) {
    try {
      let snap;
      if (userUid) {
        // Query user's reports and sort in memory to avoid requiring complex composite indexes in Firebase Console
        const q = query(collection(db, 'reports'), where('ownerUid', '==', userUid));
        snap = await getDocs(q);
      } else {
        const q = query(collection(db, 'reports'));
        snap = await getDocs(q);
      }
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ReportItem[];
      return sortReportsOldestFirst(list);
    } catch (e) {
      console.warn('Firestore getReports failed, using local storage fallback', e);
    }
  }

  // Local storage isolated per user UID
  const userReportsKey = userUid ? `${LOCAL_REPORTS_KEY}_${userUid}` : LOCAL_REPORTS_KEY;
  let reports = getLocal<ReportItem[]>(userReportsKey, []);
  
  // If empty and userUid is provided, check if global reports contain matching ownerUid
  if (reports.length === 0 && userUid) {
    const globalReports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
    const userMatches = globalReports.filter((r) => r.ownerUid === userUid);
    if (userMatches.length > 0) {
      reports = userMatches;
      setLocal(userReportsKey, reports);
    }
  }

  return sortReportsOldestFirst(reports);
}

export async function getReportById(id: string): Promise<ReportItem | null> {
  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'reports', id));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as ReportItem;
      }
    } catch (e) {
      console.warn('Firestore getReportById failed, using local storage fallback', e);
    }
  }

  // Search across global and any user cache
  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  const found = reports.find((r) => r.id === id);
  if (found) return found;

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
          const uReports = getLocal<ReportItem[]>(key, []);
          const uFound = uReports.find((r) => r.id === id);
          if (uFound) return uFound;
        }
      }
    } catch {}
  }
  return null;
}

export async function createReport(
  reportData: Omit<ReportItem, 'id' | 'reportNumber' | 'createdAt' | 'updatedAt'>
): Promise<ReportItem> {
  const reportNumber = await getNextReportNumber();
  const now = new Date().toISOString();

  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'reports');
      const docRef = await addDoc(colRef, {
        ...reportData,
        reportNumber,
        createdAt: now,
        updatedAt: now,
      });
      const createdItem: ReportItem = {
        id: docRef.id,
        ...reportData,
        reportNumber,
        createdAt: now,
        updatedAt: now,
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
    ...reportData,
    reportNumber,
    createdAt: now,
    updatedAt: now,
  };

  // Save to user isolated storage
  if (reportData.ownerUid) {
    const userReportsKey = `${LOCAL_REPORTS_KEY}_${reportData.ownerUid}`;
    const userReports = getLocal<ReportItem[]>(userReportsKey, []);
    setLocal(userReportsKey, [newReport, ...userReports]);
  }
  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  setLocal(LOCAL_REPORTS_KEY, [newReport, ...reports]);
  return newReport;
}

export async function updateReport(id: string, partial: Partial<ReportItem>): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseConfigured && db) {
    try {
      const docRef = doc(db, 'reports', id);
      await updateDoc(docRef, {
        ...partial,
        updatedAt: now,
      });
    } catch (e) {
      console.error('Failed to update report in Firestore', e);
    }
  }

  // Update in global and user-specific stores
  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  const index = reports.findIndex((r) => r.id === id);
  let ownerUid = partial.ownerUid;
  if (index !== -1) {
    ownerUid = ownerUid || reports[index].ownerUid;
    reports[index] = { ...reports[index], ...partial, updatedAt: now };
    setLocal(LOCAL_REPORTS_KEY, reports);
  }

  // Directly update user-specific store without scanning entire localStorage on every save
  if (typeof window !== 'undefined') {
    const targetUid = ownerUid || auth?.currentUser?.uid;
    if (targetUid) {
      const userKey = `${LOCAL_REPORTS_KEY}_${targetUid}`;
      const uReports = getLocal<ReportItem[]>(userKey, []);
      const uIdx = uReports.findIndex((r) => r.id === id);
      if (uIdx !== -1) {
        uReports[uIdx] = { ...uReports[uIdx], ...partial, updatedAt: now };
        setLocal(userKey, uReports);
      }
    }
  }
}

/**
 * Delete a report.
 * IMPORTANT: Enforces manual relationship integrity check.
 * If any issue is linked to this report, deletion is prevented!
 */
export async function deleteReport(id: string): Promise<{ success: boolean; error?: string }> {
  // Check if any issues are linked to this report
  const linkedIssues = await getIssuesByReportId(id);
  if (linkedIssues.length > 0) {
    return {
      success: false,
      error: 'reportCannotBeDeletedHasIssues',
    };
  }

  if (isFirebaseConfigured && db) {
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
  return { success: true };
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
  forcedSequenceNumber?: number
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
    id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    reportId,
    sequenceNumber: nextSeq,
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
  const newStoragePath = `reports/${reportId}/images/${fileName}`;

  if (isFirebaseConfigured && db) {
    try {
      const imageDoc = doc(db, 'reports', reportId, 'images', imageId);
      await updateDoc(imageDoc, { fileName, storagePath: newStoragePath });
      return;
    } catch (e) {
      console.warn('Failed to update image fileName in Firestore', e);
    }
  }

  const images = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, []);
  const idx = images.findIndex((img) => img.id === imageId);
  if (idx !== -1) {
    images[idx].fileName = fileName;
    images[idx].storagePath = newStoragePath;
    setLocal(LOCAL_IMAGES_KEY, images);
  }
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

const SEVERITY_NUMERIC_RANK: Record<string, number> = {
  critical: 1,
  major: 2,
  medium: 3,
  normal: 4,
  minor: 5,
};

function sortIssuesByOrder(list: IssueItem[]): IssueItem[] {
  return list.sort((a, b) => {
    // If explicit order index exists on both, sort by it
    if (typeof a.order === 'number' && typeof b.order === 'number') {
      return a.order - b.order;
    }
    if (typeof a.order === 'number') return -1;
    if (typeof b.order === 'number') return 1;

    // Otherwise default by severity rank (1 to 5)
    const rankA = SEVERITY_NUMERIC_RANK[a.severity] ?? 99;
    const rankB = SEVERITY_NUMERIC_RANK[b.severity] ?? 99;
    if (rankA !== rankB) return rankA - rankB;

    return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime();
  });
}

export async function getIssues(userUid?: string): Promise<IssueItem[]> {
  if (isFirebaseConfigured && db) {
    try {
      let snap;
      if (userUid) {
        const q = query(collection(db, 'issues'), where('ownerUid', '==', userUid));
        snap = await getDocs(q);
      } else {
        const q = query(collection(db, 'issues'));
        snap = await getDocs(q);
      }
      const issues = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as IssueItem[];
      return sortIssuesByOrder(issues);
    } catch (e) {
      console.warn('Firestore getIssues failed, using local storage fallback', e);
    }
  }

  // Local storage isolated per user UID
  const userIssuesKey = userUid ? `${LOCAL_ISSUES_KEY}_${userUid}` : LOCAL_ISSUES_KEY;
  let issues = getLocal<IssueItem[]>(userIssuesKey, []);

  if (issues.length === 0 && userUid) {
    const globalIssues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
    const userMatches = globalIssues.filter((i) => i.ownerUid === userUid);
    if (userMatches.length > 0) {
      issues = userMatches;
      setLocal(userIssuesKey, issues);
    }
  }

  return sortIssuesByOrder(issues);
}

export async function reorderIssues(
  updates: Array<{ id: string; order: number; status?: IssueItem['status'] }>
): Promise<void> {
  const now = new Date().toISOString();

  if (isFirebaseConfigured && db) {
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

export async function getIssuesByReportId(reportId: string, userUid?: string): Promise<IssueItem[]> {
  const all = await getIssues(userUid);
  return all.filter((i) => i.linkedReportId === reportId);
}

export async function createIssue(
  data: Omit<IssueItem, 'id' | 'createdAt' | 'updatedAt' | 'commentsCount'>
): Promise<IssueItem> {
  const now = new Date().toISOString();

  if (isFirebaseConfigured && db) {
    try {
      const docRef = await addDoc(collection(db, 'issues'), {
        ...data,
        createdAt: now,
        updatedAt: now,
        commentsCount: 0,
      });
      const createdItem: IssueItem = {
        id: docRef.id,
        ...data,
        createdAt: now,
        updatedAt: now,
        commentsCount: 0,
      };

      if (data.ownerUid) {
        const uKey = `${LOCAL_ISSUES_KEY}_${data.ownerUid}`;
        const uIssues = getLocal<IssueItem[]>(uKey, []);
        setLocal(uKey, [createdItem, ...uIssues.filter((i) => i.id !== createdItem.id)]);
      }
      return createdItem;
    } catch (e) {
      console.error('Failed to create issue in Firestore', e);
    }
  }

  const newIssue: IssueItem = {
    id: 'iss_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    ...data,
    createdAt: now,
    updatedAt: now,
    commentsCount: 0,
  };

  if (data.ownerUid) {
    const userIssuesKey = `${LOCAL_ISSUES_KEY}_${data.ownerUid}`;
    const userIssues = getLocal<IssueItem[]>(userIssuesKey, []);
    setLocal(userIssuesKey, [newIssue, ...userIssues]);
  }
  const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  setLocal(LOCAL_ISSUES_KEY, [newIssue, ...issues]);
  return newIssue;
}

export async function updateIssue(id: string, partial: Partial<IssueItem>): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseConfigured && db) {
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
  if (isFirebaseConfigured && db) {
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
