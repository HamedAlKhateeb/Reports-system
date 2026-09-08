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
  if (userUid) {
    const userReports = getLocal<ReportItem[]>(`${LOCAL_REPORTS_KEY}_${userUid}`, []);
    userReports.forEach((r) => {
      const parsed = typeof r.reportNumber === 'number' ? r.reportNumber : parseInt(String(r.reportNumber), 10);
      if (!isNaN(parsed) && parsed > 0) {
        allNumbers.push(parsed);
      }
    });
  }

  const globalReports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  globalReports.forEach((r) => {
    if (!userUid || r.ownerUid === userUid) {
      const parsed = typeof r.reportNumber === 'number' ? r.reportNumber : parseInt(String(r.reportNumber), 10);
      if (!isNaN(parsed) && parsed > 0) {
        allNumbers.push(parsed);
      }
    }
  });

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
          const uReports = getLocal<ReportItem[]>(key, []);
          uReports.forEach((r) => {
            if (!userUid || r.ownerUid === userUid) {
              const parsed = typeof r.reportNumber === 'number' ? r.reportNumber : parseInt(String(r.reportNumber), 10);
              if (!isNaN(parsed) && parsed > 0) {
                allNumbers.push(parsed);
              }
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

export async function getReports(userUid?: string): Promise<ReportItem[]> {
  // CRITICAL SECURITY FIX: Never return reports if userUid is missing!
  // An unauthenticated request must ALWAYS return an empty list []!
  if (!userUid || typeof userUid !== 'string' || !userUid.trim()) {
    return [];
  }

  // Guest users are strictly local-storage isolated; never query or pollute Firestore!
  const isGuest = userUid.startsWith('guest_') || userUid === 'guest_user_session';
  if (isGuest) {
    const userReportsKey = `${LOCAL_REPORTS_KEY}_${userUid}`;
    const reports = getLocal<ReportItem[]>(userReportsKey, []);
    return sortReportsNewestFirst(reports.filter((r) => r.ownerUid === userUid));
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

      return sortReportsNewestFirst(Array.from(mergedMap.values()));
    } catch (e) {
      console.warn('Firestore getReports failed, using isolated local storage fallback', e);
    }
  }

  // Isolated local storage strictly for this userUid
  const userReportsKey = `${LOCAL_REPORTS_KEY}_${userUid}`;
  const reports = getLocal<ReportItem[]>(userReportsKey, []);
  return sortReportsNewestFirst(reports.filter((r) => r.ownerUid === userUid));
}

export async function getReportById(id: string, userUid?: string): Promise<ReportItem | null> {
  if (!id) return null;

  if (isFirebaseConfigured && db) {
    try {
      const snap = await getDoc(doc(db, 'reports', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as ReportItem;
        // Check authorization: must be owned by userUid OR be a shared report (isShared: true)
        if (data.isShared || (userUid && data.ownerUid === userUid)) {
          return data;
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
  }

  // Search global fallback strictly checking ownership or sharing
  const reports = getLocal<ReportItem[]>(LOCAL_REPORTS_KEY, []);
  const found = reports.find((r) => r.id === id);
  if (found) {
    if (found.isShared || (userUid && found.ownerUid === userUid)) {
      return found;
    }
    return null;
  }

  return null;
}

export async function createReport(
  reportData: Omit<ReportItem, 'id' | 'reportNumber' | 'createdAt' | 'updatedAt'>
): Promise<ReportItem> {
  const reportNumber = await getNextReportNumber(reportData.ownerUid);
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

  // Save to user isolated storage
  if (reportData.ownerUid) {
    const userReportsKey = `${LOCAL_REPORTS_KEY}_${reportData.ownerUid}`;
    const userReports = getLocal<ReportItem[]>(userReportsKey, []);
    setLocal(userReportsKey, [newReport, ...userReports.filter((r) => r.id !== newReport.id)]);
  }
  return newReport;
}

export async function updateReport(id: string, partial: Partial<ReportItem>): Promise<void> {
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

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const docRef = doc(db, 'reports', id);
      await updateDoc(docRef, sanitizedPartial);
    } catch (e) {
      console.error('Failed to update report in Firestore', e);
    }
  }

  // Update in user isolated storage
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_REPORTS_KEY)) {
          const list = getLocal<ReportItem[]>(key, []);
          const idx = list.findIndex((r) => r.id === id);
          if (idx !== -1) {
            list[idx] = { ...list[idx], ...sanitizedPartial };
            setLocal(key, list);
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
    setLocal(LOCAL_REPORTS_KEY, reports);
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

export async function getIssues(userUid?: string): Promise<IssueItem[]> {
  // CRITICAL SECURITY FIX: Never return issues if userUid is missing!
  if (!userUid || typeof userUid !== 'string' || !userUid.trim()) {
    return [];
  }

  // Guest users are strictly local-storage isolated; never query or pollute Firestore!
  const isGuest = userUid.startsWith('guest_') || userUid === 'guest_user_session';
  if (isGuest) {
    const userIssuesKey = `${LOCAL_ISSUES_KEY}_${userUid}`;
    const issues = getLocal<IssueItem[]>(userIssuesKey, []);
    return sortIssuesByOrder(issues.filter((i) => i.ownerUid === userUid), userUid);
  }

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const q = query(collection(db, 'issues'), where('ownerUid', '==', userUid));
      const snap = await getDocs(q);
      const issues = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as IssueItem[];
      return sortIssuesByOrder(issues, userUid);
    } catch (e) {
      console.warn('Firestore getIssues failed, using local storage fallback', e);
    }
  }

  // Local storage strictly isolated per user UID
  const userIssuesKey = `${LOCAL_ISSUES_KEY}_${userUid}`;
  const issues = getLocal<IssueItem[]>(userIssuesKey, []);
  return sortIssuesByOrder(issues.filter((i) => i.ownerUid === userUid), userUid);
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

export async function getIssuesByReportId(reportId: string, userUid?: string): Promise<IssueItem[]> {
  const all = await getIssues(userUid);
  return all.filter((i) => i.linkedReportId === reportId || i.reportId === reportId);
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

export async function getFolders(userUid?: string): Promise<FolderItem[]> {
  // CRITICAL SECURITY FIX: Never return folders if userUid is missing!
  if (!userUid || typeof userUid !== 'string' || !userUid.trim()) {
    return [];
  }

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
      return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (e) {
      console.warn('Firestore getFolders failed, using local storage fallback', e);
    }
  }

  const userKey = `${LOCAL_FOLDERS_KEY}_${userUid}`;
  const folders = getLocal<FolderItem[]>(userKey, []);
  return [...folders.filter((f) => f.ownerUid === userUid)].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function getFolderById(id: string, userUid?: string): Promise<FolderItem | null> {
  if (!id) return null;

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      const snap = await getDoc(doc(db, 'folders', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as FolderItem;
        if (userUid && data.ownerUid && data.ownerUid !== userUid) {
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

/**
 * Checks whether moving folderId into targetParentId would create a circular reference.
 * Returns TRUE if a cycle would be created (ILLEGAL MOVE), FALSE if safe.
 */
export function wouldCreateFolderCycle(
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
