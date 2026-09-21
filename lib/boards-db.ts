/**
 * BOARDS PERSISTENCE SERVICE
 *
 * Provides dedicated Firestore and LocalStorage persistence for Boards.
 * Architecturally isolated from Report persistence.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import type { Board, BoardSession } from './boards-types';

const LOCAL_BOARDS_PREFIX = 'review_app_boards';
const LOCAL_BOARDS_SESSION_PREFIX = 'review_app_boards_session';

function getStorageKey(ownerUid?: string): string {
  return `${LOCAL_BOARDS_PREFIX}_${ownerUid || 'guest'}`;
}

function getSessionStorageKey(ownerUid?: string, projectId?: string): string {
  return `${LOCAL_BOARDS_SESSION_PREFIX}_${ownerUid || 'guest'}_${projectId || 'default'}`;
}

const memoryStore = new Map<string, string>();

function getLocal<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    const mem = memoryStore.get(key);
    return mem ? JSON.parse(mem) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): boolean {
  try {
    const str = JSON.stringify(val);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, str);
      return true;
    }
    memoryStore.set(key, str);
    return true;
  } catch (e) {
    console.error('Failed to save boards to storage', e);
    return false;
  }
}

export const TRASH_RETENTION_DAYS = 10;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function isTrashExpired(b: Board): boolean {
  if (!b.deletedAt && !b.archivedAt) return false;
  const delTime = new Date(b.deletedAt || b.archivedAt!).getTime();
  if (isNaN(delTime)) return false;
  return Date.now() - delTime >= TRASH_RETENTION_MS;
}

export function getRemainingDaysInTrash(b: Board): number {
  if (!b.deletedAt && !b.archivedAt) return TRASH_RETENTION_DAYS;
  const delTime = new Date(b.deletedAt || b.archivedAt!).getTime();
  if (isNaN(delTime)) return TRASH_RETENTION_DAYS;
  const elapsedMs = Date.now() - delTime;
  const remainingMs = Math.max(0, TRASH_RETENTION_MS - elapsedMs);
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

/**
 * Fetch all unarchived / non-deleted boards for the given user.
 */
export async function getBoards(ownerUid?: string, projectId?: string): Promise<Board[]> {
  let remoteBoards: Board[] = [];

  if (isFirebaseConfigured && db && ownerUid) {
    try {
      const q = query(
        collection(db, 'boards'),
        where('ownerUid', '==', ownerUid)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => {
        remoteBoards.push({ id: d.id, ...(d.data() as any) });
      });
    } catch (err) {
      console.warn('getBoards: Firestore query failed, falling back to local', err);
    }
  }

  const localBoards = getLocal<Board[]>(getStorageKey(ownerUid), []);

  // Merge remote and local by ID, picking newest updatedAt
  const map = new Map<string, Board>();
  localBoards.forEach((b) => map.set(b.id, b));
  remoteBoards.forEach((b) => {
    const existing = map.get(b.id);
    if (!existing || new Date(b.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      map.set(b.id, b);
    }
  });

  const all = Array.from(map.values());
  // Save synced cache back to local
  setLocal(getStorageKey(ownerUid), all);

  // Auto-purge any boards whose 10-day retention has expired
  const expired = all.filter(isTrashExpired);
  if (expired.length > 0) {
    for (const b of expired) {
      void deleteBoardPermanently(b.id, ownerUid);
    }
  }

  return all.filter((b) => {
    if (b.archivedAt || b.deletedAt) return false;
    if (projectId) {
      return b.projectId === projectId || (!b.projectId && projectId === 'proj_default');
    }
    return true;
  });
}

/**
 * Fetch all boards currently in Trash (soft-deleted), purging any that exceeded 10 days.
 */
export async function getTrashBoards(ownerUid?: string, projectId?: string): Promise<Board[]> {
  const key = getStorageKey(ownerUid);
  const all = getLocal<Board[]>(key, []);

  // Purge expired items (>10 days)
  const expired = all.filter(isTrashExpired);
  if (expired.length > 0) {
    for (const b of expired) {
      await deleteBoardPermanently(b.id, ownerUid);
    }
  }

  const refreshed = getLocal<Board[]>(key, []);
  return refreshed.filter((b) => {
    if (!b.archivedAt && !b.deletedAt) return false;
    if (projectId) {
      return b.projectId === projectId || (!b.projectId && projectId === 'proj_default');
    }
    return true;
  });
}

/**
 * Backwards compatibility alias for getTrashBoards.
 */
export async function getArchivedBoards(ownerUid?: string, projectId?: string): Promise<Board[]> {
  return getTrashBoards(ownerUid, projectId);
}

/**
 * Move board to trash (soft-delete with 10-day expiration window).
 */
export async function moveToTrash(id: string, ownerUid?: string): Promise<void> {
  const board = await getBoardById(id, ownerUid);
  if (!board) return;
  const now = new Date();
  const expires = new Date(now.getTime() + TRASH_RETENTION_MS);
  board.deletedAt = now.toISOString();
  board.trashExpiresAt = expires.toISOString();
  board.archivedAt = board.deletedAt; // backwards compatibility
  await saveBoard(board);
}

/**
 * Backwards compatibility alias for moveToTrash.
 */
export async function archiveBoard(id: string, ownerUid?: string): Promise<void> {
  await moveToTrash(id, ownerUid);
}

/**
 * Restore board from trash.
 */
export async function restoreBoardFromTrash(id: string, ownerUid?: string): Promise<Board | null> {
  const board = await getBoardById(id, ownerUid);
  if (!board) return null;
  delete board.deletedAt;
  delete board.trashExpiresAt;
  delete board.archivedAt;
  return await saveBoard(board);
}

/**
 * Backwards compatibility alias for restoreBoardFromTrash.
 */
export async function restoreBoard(id: string, ownerUid?: string): Promise<Board | null> {
  return restoreBoardFromTrash(id, ownerUid);
}

/**
 * Get a specific board by ID.
 */
export async function getBoardById(id: string, ownerUid?: string): Promise<Board | null> {
  if (!id) return null;

  if (isFirebaseConfigured && db && ownerUid) {
    try {
      const snap = await getDoc(doc(db, 'boards', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...(snap.data() as any) } as Board;
        if (data.ownerUid === ownerUid) return data;
      }
    } catch {}
  }

  const localBoards = getLocal<Board[]>(getStorageKey(ownerUid), []);
  return localBoards.find((b) => b.id === id) || null;
}

/**
 * Save or update a board.
 */
export async function saveBoard(board: Board): Promise<Board> {
  const now = new Date().toISOString();
  const updated: Board = {
    ...board,
    updatedAt: now,
  };

  // Remote save if Firestore available
  if (isFirebaseConfigured && db && updated.ownerUid) {
    try {
      await setDoc(doc(db, 'boards', updated.id), updated, { merge: true });
    } catch (e) {
      console.warn('saveBoard: Firestore write failed, stored locally', e);
    }
  }

  // Local storage save
  const key = getStorageKey(updated.ownerUid);
  const all = getLocal<Board[]>(key, []);
  const idx = all.findIndex((b) => b.id === updated.id);
  if (idx !== -1) {
    all[idx] = updated;
    setLocal(key, all);
  } else {
    setLocal(key, [updated, ...all]);
  }

  return updated;
}

/**
 * Permanently delete a board.
 */
export async function deleteBoardPermanently(id: string, ownerUid?: string): Promise<void> {
  if (!id) return;

  if (isFirebaseConfigured && db && ownerUid) {
    try {
      await deleteDoc(doc(db, 'boards', id));
    } catch (e) {
      console.warn('deleteBoardPermanently: remote delete failed', e);
    }
  }

  const key = getStorageKey(ownerUid);
  const all = getLocal<Board[]>(key, []);
  setLocal(
    key,
    all.filter((b) => b.id !== id)
  );

  // Clean up session tabs if active
  const session = getBoardSession(ownerUid);
  const nextOpen = session.openBoardIds.filter((bid) => bid !== id);
  const nextActive = session.activeBoardId === id ? (nextOpen[0] || null) : session.activeBoardId;
  saveBoardSession({ openBoardIds: nextOpen, activeBoardId: nextActive }, ownerUid);
}

/**
 * Get active tab session (open tabs and active board).
 */
export function getBoardSession(ownerUid?: string, projectId?: string): BoardSession {
  return getLocal<BoardSession>(getSessionStorageKey(ownerUid, projectId), {
    openBoardIds: [],
    activeBoardId: null,
  });
}

/**
 * Save active tab session.
 */
export function saveBoardSession(session: BoardSession, ownerUid?: string, projectId?: string): void {
  setLocal(getSessionStorageKey(ownerUid, projectId), session);
}

/**
 * Helper to generate unique IDs for boards and widgets.
 */
export function generateBoardId(prefix = 'board'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a shareable public token for a board.
 */
export async function createBoardShareLink(boardId: string): Promise<string> {
  const rand1 = Math.random().toString(36).slice(2, 10);
  const rand2 = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  const token = `bsh_${rand1}${rand2}${time}`;
  const now = new Date().toISOString();

  const board = await getBoardById(boardId);
  if (!board) throw new Error('Board not found');

  const updated: Board = {
    ...board,
    isShared: true,
    shareToken: token,
    sharedAt: now,
  };
  await saveBoard(updated);
  return token;
}

/**
 * Revoke public sharing for a board.
 */
export async function revokeBoardShareLink(boardId: string): Promise<void> {
  const board = await getBoardById(boardId);
  if (!board) return;

  const updated: Board = {
    ...board,
    isShared: false,
    shareToken: null,
    sharedAt: null,
  };
  await saveBoard(updated);
}

/**
 * Fetch a shared board using its unguessable public share token.
 */
export async function getBoardByShareToken(token: string): Promise<Board | null> {
  if (!token || typeof token !== 'string') return null;

  // 1. Search in Firestore
  if (isFirebaseConfigured && db) {
    try {
      const q = query(
        collection(db, 'boards'),
        where('shareToken', '==', token),
        where('isShared', '==', true)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        return { id: docSnap.id, ...(docSnap.data() as any) } as Board;
      }
    } catch (e) {
      console.warn('Firestore getBoardByShareToken query error:', e);
    }
  }

  // 2. Search in LocalStorage Fallback
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_BOARDS_PREFIX)) {
          const list = getLocal<Board[]>(key, []);
          const match = list.find((b) => b.shareToken === token && b.isShared === true);
          if (match) return match;
        }
      }
    } catch {}
  }

  return null;
}
