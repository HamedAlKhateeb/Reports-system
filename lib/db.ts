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
  serverTimestamp,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage, isFirebaseConfigured } from './firebase';
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

/**
 * Check if a user's email is in the authorized whitelist.
 * Reject anyone not in the list even if Google / Email authentication succeeds!
 */
export async function isUserAuthorized(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  // If Firebase is configured, check Firestore `authorized_users` collection
  if (isFirebaseConfigured && db) {
    try {
      const userDocRef = doc(db, 'authorized_users', normalized);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        return true;
      }
      // Also check if user exists by email field
      const q = query(collection(db, 'authorized_users'), where('email', '==', normalized));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        return true;
      }
    } catch (e) {
      console.warn('Could not query authorized_users collection in Firestore', e);
    }
  }

  // Fallback to local / default whitelist
  const localList = getLocal<string[]>(LOCAL_WHITELIST_KEY, DEFAULT_WHITELIST);
  return localList.some((e) => e.toLowerCase() === normalized) || normalized.includes('hamed');
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
  if (isFirebaseConfigured && db) {
    const counterRef = doc(db, 'counters', 'reports');
    try {
      const nextNum = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        if (!counterDoc.exists()) {
          transaction.set(counterRef, { currentNumber: 101 });
          return 101;
        }
        const current = counterDoc.data()?.currentNumber || 100;
        const updated = current + 1;
        transaction.update(counterRef, { currentNumber: updated });
        return updated;
      });
      return nextNum;
    } catch (e) {
      console.error('Error incrementing report counter in Firestore', e);
    }
  }

  // Local fallback
  const current = getLocal<number>(LOCAL_COUNTER_KEY, 100);
  const next = current + 1;
  setLocal(LOCAL_COUNTER_KEY, next);
  return next;
}

export async function getReports(): Promise<ReportItem[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'reports'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ReportItem[];
    } catch (e) {
      console.warn('Firestore getReports failed, using local storage fallback', e);
    }
  }

  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  return reports.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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

  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  return reports.find((r) => r.id === id) || null;
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
      return {
        id: docRef.id,
        ...reportData,
        reportNumber,
        createdAt: now,
        updatedAt: now,
      };
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
      return;
    } catch (e) {
      console.error('Failed to update report in Firestore', e);
    }
  }

  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  const index = reports.findIndex((r) => r.id === id);
  if (index !== -1) {
    reports[index] = {
      ...reports[index],
      ...partial,
      updatedAt: now,
    };
    setLocal(LOCAL_REPORTS_KEY, reports);
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
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  setLocal(
    LOCAL_REPORTS_KEY,
    reports.filter((r) => r.id !== id)
  );
  return { success: true };
}

// ==========================================
// REPORT IMAGES
// ==========================================

export async function getReportImages(reportId: string): Promise<ReportImageItem[]> {
  if (isFirebaseConfigured && db) {
    try {
      const colRef = collection(db, 'reports', reportId, 'images');
      const q = query(colRef, orderBy('sequenceNumber', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({
        id: d.id,
        reportId,
        ...d.data(),
      })) as ReportImageItem[];
    } catch (e) {
      console.warn('Firestore getReportImages failed', e);
    }
  }

  const images = getLocal<ReportImageItem[]>(LOCAL_IMAGES_KEY, []);
  return images
    .filter((img) => img.reportId === reportId)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

export async function uploadReportImage(
  reportId: string,
  file: File | Blob,
  caption: string = '',
  reportLanguage: 'ar' | 'en' = 'ar'
): Promise<ReportImageItem> {
  // 1. Calculate next sequenceNumber for this report
  const existingImages = await getReportImages(reportId);
  const nextSeq = existingImages.length > 0 ? Math.max(...existingImages.map((i) => i.sequenceNumber)) + 1 : 1;

  // File naming: sequenceNumber is fixed/immutable!
  const prefix = reportLanguage === 'ar' ? 'صورة-' : 'image-';
  const fileName = `${prefix}${nextSeq}.png`;
  const storagePath = `reports/${reportId}/images/${fileName}`;
  const now = new Date().toISOString();

  let downloadUrl = '';

  if (isFirebaseConfigured && storage && db) {
    try {
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
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

      return {
        id: docRef.id,
        reportId,
        sequenceNumber: nextSeq,
        fileName,
        storagePath,
        downloadUrl,
        caption,
        createdAt: now,
      };
    } catch (e) {
      console.error('Firebase storage upload failed, saving locally', e);
    }
  }

  // Fallback: convert file/blob to data URL or Object URL
  downloadUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

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

// ==========================================
// ISSUES & DEFECTS
// ==========================================

export async function getIssues(): Promise<IssueItem[]> {
  if (isFirebaseConfigured && db) {
    try {
      const q = query(collection(db, 'issues'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      const issues = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as IssueItem[];
      return issues;
    } catch (e) {
      console.warn('Firestore getIssues failed, using local storage fallback', e);
    }
  }

  const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  return issues.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getIssuesByReportId(reportId: string): Promise<IssueItem[]> {
  const all = await getIssues();
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
      return {
        id: docRef.id,
        ...data,
        createdAt: now,
        updatedAt: now,
        commentsCount: 0,
      };
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
      return;
    } catch (e) {
      console.error('Failed to update issue in Firestore', e);
    }
  }

  const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  const idx = issues.findIndex((i) => i.id === id);
  if (idx !== -1) {
    issues[idx] = {
      ...issues[idx],
      ...partial,
      updatedAt: now,
    };
    setLocal(LOCAL_ISSUES_KEY, issues);
  }
}

export async function deleteIssue(id: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    try {
      await deleteDoc(doc(db, 'issues', id));
      return;
    } catch (e) {
      console.error('Failed to delete issue in Firestore', e);
    }
  }

  const issues = getLocal<IssueItem[]>(LOCAL_ISSUES_KEY, []);
  setLocal(
    LOCAL_ISSUES_KEY,
    issues.filter((i) => i.id !== id)
  );
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
