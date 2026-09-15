'use client';

/**
 * Invite inbox: reports shared WITH me (I am not the owner).
 *
 * Delivery model: invites are access grants (sharedWithEmails) — nothing is
 * pushed. This module gives them a visible home: a navbar bell with an
 * unseen counter plus "shared with me" badges on report cards. Seen state
 * is per-user localStorage (ids), so the badge survives reloads but a new
 * share always re-surfaces.
 */

import { useCallback, useEffect, useState } from 'react';
import { getReports } from './db';
import type { ReportItem } from './types';

const seenKey = (uid: string) => `review_app_seen_invites_${uid}`;

function readSeen(uid: string): Set<string> {
  try {
    if (typeof window === 'undefined' || !uid) return new Set();
    const raw = localStorage.getItem(seenKey(uid));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Reports shared with me (excludes my own). Guests see none by design. */
export async function getInviteInbox(userUid: string, userEmail?: string): Promise<ReportItem[]> {
  try {
    if (!userUid || !userEmail || userUid.startsWith('guest_') || userUid === 'guest_user_session') return [];
    const all = await getReports(userUid, userEmail);
    return all.filter((r) => r.ownerUid !== userUid);
  } catch {
    return [];
  }
}

export function getUnseenInviteIds(userUid: string, inboxIds: string[]): string[] {
  if (!userUid) return [];
  const seen = readSeen(userUid);
  return inboxIds.filter((id) => !seen.has(id));
}

export function markInviteSeen(userUid: string, reportId: string): void {
  try {
    if (typeof window === 'undefined' || !userUid || !reportId) return;
    const seen = readSeen(userUid);
    if (seen.has(reportId)) return;
    seen.add(reportId);
    const arr = Array.from(seen).slice(-300);
    localStorage.setItem(seenKey(userUid), JSON.stringify(arr));
  } catch {}
}

export function markAllInvitesSeen(userUid: string, reportIds: string[]): void {
  try {
    if (typeof window === 'undefined' || !userUid) return;
    const seen = readSeen(userUid);
    reportIds.forEach((id) => seen.add(id));
    localStorage.setItem(seenKey(userUid), JSON.stringify(Array.from(seen).slice(-300)));
  } catch {}
}

/** Live inbox for the navbar bell (poll-free: refreshes on focus + interval). */
export function useInviteInbox(userUid?: string | null, userEmail?: string | null) {
  const [inbox, setInbox] = useState<ReportItem[]>([]);
  const [unseen, setUnseen] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!userUid || !userEmail) {
      setInbox([]);
      setUnseen([]);
      return;
    }
    const list = await getInviteInbox(userUid, userEmail);
    setInbox(list);
    try {
      const seen = readSeen(userUid);
      setUnseen(list.map((r) => r.id).filter((id) => !seen.has(id)));
    } catch {
      setUnseen([]);
    }
  }, [userUid, userEmail]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onInvite = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('report-updated', onInvite);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('report-updated', onInvite);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const markSeen = useCallback(
    (reportId: string) => {
      if (!userUid) return;
      markInviteSeen(userUid, reportId);
      setUnseen((prev) => prev.filter((id) => id !== reportId));
    },
    [userUid]
  );

  const markAllSeen = useCallback(() => {
    if (!userUid) return;
    markAllInvitesSeen(userUid, inbox.map((r) => r.id));
    setUnseen([]);
  }, [userUid, inbox]);

  return { inbox, unseen, unseenCount: unseen.length, refresh, markSeen, markAllSeen };
}
