'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from './firebase';
import { isUserAuthorized } from './db';

export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  emailVerified?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isGuest: boolean;
  loading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<void>;
  /** Password reset: sends a reset link via Firebase, or local guidance. */
  sendPasswordReset: (email: string) => Promise<{ ok: boolean; code: string }>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_AUTH_USER_KEY = 'review_app_auth_user';
const LOCAL_REGISTERED_USERS_KEY = 'review_app_registered_users';
const SESSION_COOKIE_NAME = '__session';
// Non-HttpOnly page-gating marker for guest/local/demo users. Value is the
// constant 'guest' (no identity). API routes reject it with 401 — identity
// for these accounts lives only in this browser's localStorage.
const LOCAL_SESSION_COOKIE = '__session_local';

function isServerVerifiableUid(uid: string): boolean {
  return (
    !uid.startsWith('guest_') &&
    uid !== 'guest_user_session' &&
    !uid.startsWith('usr_') &&
    !uid.startsWith('user_') &&
    uid !== 'google_demo_user'
  );
}

async function mintServerSession(getToken: () => Promise<string>): Promise<void> {
  try {
    const idToken = await getToken();
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  } catch {
    // Offline / server unreachable: client keeps working from localStorage,
    // server routes will return 401 until the next successful mint.
  }
}

async function clearServerSession(): Promise<void> {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch {
    // Best effort — HttpOnly cookie can only be cleared by the server.
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${LOCAL_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync session cookie for Next.js Middleware + API routes (Phase 1.1/B3).
  // Firebase users: the server mints an HttpOnly cookie holding the verified
  // ID token (short-lived, refreshed periodically). Legacy raw-uid cookies
  // are rejected server-side, so we proactively expire any stale one.
  // Guest/local/demo users: marker cookie only (page shell gating);
  // every privileged API route returns 401 for them by design.
  const syncSessionCookie = (
    userObj: AuthUser | null,
    getToken?: () => Promise<string>
  ) => {
    if (typeof document === 'undefined') return;
    if (!userObj) {
      void clearServerSession();
      return;
    }
    if (
      getToken &&
      isServerVerifiableUid(userObj.uid) &&
      isFirebaseConfigured
    ) {
      void mintServerSession(getToken);
      document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
      document.cookie = `${LOCAL_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      return;
    }
    document.cookie = `${LOCAL_SESSION_COOKIE}=guest; path=/; max-age=604800; SameSite=Lax`;
    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  };

  // Periodic ID-token refresh so the HttpOnly `__session` cookie never goes
  // stale while a Firebase user is active (tokens live ~1h).
  useEffect(() => {
    if (!user || !isFirebaseConfigured || !auth) return;
    if (!isServerVerifiableUid(user.uid)) return;
    const timer = setInterval(() => {
      const current = auth?.currentUser;
      if (current && current.uid === user.uid) {
        void mintServerSession(() => current.getIdToken());
      }
    }, 50 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      // Check if arriving from a redirect sign-in
      getRedirectResult(auth)
        .then(async (result) => {
          if (result && result.user && result.user.email) {
            await isUserAuthorized(result.user.email);
            const currentAuthUser: AuthUser = {
              uid: result.user.uid,
              email: result.user.email,
              displayName: result.user.displayName || result.user.email.split('@')[0],
              photoURL: result.user.photoURL,
              emailVerified: result.user.emailVerified,
            };
            setUser(currentAuthUser);
            syncSessionCookie(currentAuthUser, () => result.user.getIdToken());
          }
        })
        .catch((e) => {
          console.warn('Redirect auth result notice:', e);
        });

      const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        if (fbUser && fbUser.email) {
          // Auto-authorize user
          await isUserAuthorized(fbUser.email);

          const currentAuthUser: AuthUser = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email.split('@')[0],
            photoURL: fbUser.photoURL,
            emailVerified: fbUser.emailVerified,
          };
          setUser(currentAuthUser);
          syncSessionCookie(currentAuthUser, () => fbUser.getIdToken());
          if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(currentAuthUser));
          }
        } else {
          // Firebase has no session — check if there's a local/guest session in localStorage
          try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_AUTH_USER_KEY) : null;
            if (saved) {
              const parsed = JSON.parse(saved) as AuthUser;
              // Restore local/guest user session instead of wiping it
              setUser(parsed);
              syncSessionCookie(parsed);
            } else {
              setUser(null);
              syncSessionCookie(null);
            }
          } catch {
            setUser(null);
            syncSessionCookie(null);
          }
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      // Local demo auth check
      try {
        const saved = localStorage.getItem(LOCAL_AUTH_USER_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setUser(parsed);
          syncSessionCookie(parsed);
        }
      } catch (e) {
        console.warn('Could not read mock auth user', e);
      }
      setLoading(false);
    }
  }, []);

  const getRegisteredUsers = (): Record<string, { uid: string; email: string; displayName?: string; pass: string }> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(LOCAL_REGISTERED_USERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saveRegisteredUser = (userRec: { uid: string; email: string; displayName?: string; pass: string }) => {
    if (typeof window === 'undefined') return;
    const users = getRegisteredUsers();
    users[userRec.email.toLowerCase()] = userRec;
    localStorage.setItem(LOCAL_REGISTERED_USERS_KEY, JSON.stringify(users));
  };

  const signUpWithEmail = async (email: string, pass: string, displayName?: string) => {
    setError(null);
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      await isUserAuthorized(normalizedEmail);

      if (isFirebaseConfigured && auth) {
        try {
          const creds = await createUserWithEmailAndPassword(auth, normalizedEmail, pass);
          const fbUser = creds.user;
          if (displayName && auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName }).catch(() => {});
          }
          // Send verification email
          try {
            await sendEmailVerification(fbUser);
          } catch (verifErr) {
            console.warn('sendEmailVerification notice:', verifErr);
          }
          const currentAuthUser: AuthUser = {
            uid: fbUser.uid,
            email: fbUser.email || normalizedEmail,
            displayName: displayName || fbUser.displayName || normalizedEmail.split('@')[0],
            photoURL: fbUser.photoURL,
            emailVerified: fbUser.emailVerified, // false until clicked
          };
          setUser(currentAuthUser);
          syncSessionCookie(currentAuthUser, () => fbUser.getIdToken());
          if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(currentAuthUser));
          }
          // Also register locally for fast offline access
          saveRegisteredUser({
            uid: fbUser.uid,
            email: normalizedEmail,
            displayName: currentAuthUser.displayName || undefined,
            pass,
          });
          setLoading(false);
          return;
        } catch (firebaseErr: any) {
          console.warn('Firebase createUser failed, falling back to secure isolated local account', firebaseErr);
          // If error is already-in-use, throw to user
          if (firebaseErr.code === 'auth/email-already-in-use') {
            throw firebaseErr;
          }
          // If unauthorized-domain or network, proceed to isolated local account creation
        }
      }

      // Fallback: Isolated local account creation
      const localUsers = getRegisteredUsers();
      if (localUsers[normalizedEmail]) {
        const err: any = new Error('Email already registered');
        err.code = 'auth/email-already-in-use';
        throw err;
      }

      const generatedUid = 'usr_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      const newAuthUser: AuthUser = {
        uid: generatedUid,
        email: normalizedEmail,
        displayName: displayName?.trim() || normalizedEmail.split('@')[0],
        photoURL: null,
        emailVerified: false,
      };

      saveRegisteredUser({
        uid: generatedUid,
        email: normalizedEmail,
        displayName: newAuthUser.displayName || undefined,
        pass,
      });

      setUser(newAuthUser);
      syncSessionCookie(newAuthUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(newAuthUser));
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setError(null);
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    await isUserAuthorized(normalizedEmail);

    if (isFirebaseConfigured && auth) {
      try {
        const creds = await signInWithEmailAndPassword(auth, normalizedEmail, pass);
        const fbUser = creds.user;
        const currentAuthUser: AuthUser = {
          uid: fbUser.uid,
          email: fbUser.email || normalizedEmail,
          displayName: fbUser.displayName || normalizedEmail.split('@')[0],
          photoURL: fbUser.photoURL,
          emailVerified: fbUser.emailVerified,
        };
        setUser(currentAuthUser);
        syncSessionCookie(currentAuthUser, () => fbUser.getIdToken());
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(currentAuthUser));
        }
        setLoading(false);
        return;
      } catch (err: any) {
        // If domain unauthorized or offline, check if account exists in local registry
        const localUsers = getRegisteredUsers();
        const localAcc = localUsers[normalizedEmail];
        if (localAcc && localAcc.pass === pass) {
          const currentAuthUser: AuthUser = {
            uid: localAcc.uid,
            email: localAcc.email,
            displayName: localAcc.displayName || localAcc.email.split('@')[0],
            photoURL: null,
          };
          setUser(currentAuthUser);
          syncSessionCookie(currentAuthUser);
          if (typeof window !== 'undefined') {
            localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(currentAuthUser));
          }
          setLoading(false);
          return;
        }

        setLoading(false);
        throw err;
      }
    } else {
      // Local check
      const localUsers = getRegisteredUsers();
      const localAcc = localUsers[normalizedEmail];
      if (localAcc) {
        if (localAcc.pass !== pass) {
          setLoading(false);
          const err: any = new Error('Invalid credentials');
          err.code = 'auth/wrong-password';
          throw err;
        }
        const currentAuthUser: AuthUser = {
          uid: localAcc.uid,
          email: localAcc.email,
          displayName: localAcc.displayName || localAcc.email.split('@')[0],
          photoURL: null,
        };
        setUser(currentAuthUser);
        syncSessionCookie(currentAuthUser);
        localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(currentAuthUser));
        setLoading(false);
        return;
      }

      // Demo sign in for default whitelisted emails
      const mockUser: AuthUser = {
        uid: 'user_' + Math.random().toString(36).substring(2, 9),
        email: normalizedEmail,
        displayName: normalizedEmail.split('@')[0],
        photoURL: null,
      };
      setUser(mockUser);
      syncSessionCookie(mockUser);
      localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(mockUser));
    }
    setLoading(false);
  };

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);

    if (isFirebaseConfigured && auth && googleProvider) {
      try {
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        let creds;
        try {
          creds = await signInWithPopup(auth, googleProvider);
        } catch (popupErr: any) {
          if (
            popupErr.code === 'auth/popup-blocked' ||
            popupErr.code === 'auth/cancelled-popup-request'
          ) {
            console.warn('Popup blocked, attempting redirect sign-in...', popupErr);
            try {
              await signInWithRedirect(auth, googleProvider);
            } catch (redirectErr: any) {
              console.warn('Redirect also failed:', redirectErr);
              throw popupErr;
            }
            return;
          }
          if (popupErr.code === 'auth/unauthorized-domain') {
            console.warn('Unauthorized domain for Google sign-in, attempting redirect...', popupErr);
            try {
              await signInWithRedirect(auth, googleProvider);
              return;
            } catch {
              // Redirect also failed — throw the original error so the UI can show it
              throw popupErr;
            }
          }
          throw popupErr;
        }

        const fbUser = creds.user;
        const email = fbUser.email;
        if (email) {
          await isUserAuthorized(email);
        }

        const currentAuthUser: AuthUser = {
          uid: fbUser.uid,
          email: email || '',
          displayName: fbUser.displayName || email?.split('@')[0] || 'Google Reviewer',
          photoURL: fbUser.photoURL,
          emailVerified: fbUser.emailVerified ?? true,
        };
        setUser(currentAuthUser);
        syncSessionCookie(currentAuthUser, () => fbUser.getIdToken());
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(currentAuthUser));
        }
      } catch (err: any) {
        setLoading(false);
        throw err;
      }
    } else {
      // Demo sign in with Google account simulation
      const demoEmail = 'reviewer@example.com';
      await isUserAuthorized(demoEmail);
      const mockUser: AuthUser = {
        uid: 'google_demo_user',
        email: demoEmail,
        displayName: 'Google Reviewer',
        photoURL: null,
        emailVerified: true,
      };
      setUser(mockUser);
      syncSessionCookie(mockUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(mockUser));
      }
    }
    setLoading(false);
  };

  const signInAsGuest = async () => {
    setError(null);
    setLoading(true);
    const guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const guestUser: AuthUser = {
      uid: guestId,
      email: `${guestId}@review-app.local`,
      displayName: 'Guest Reviewer',
      photoURL: null,
      emailVerified: true,
    };
    setUser(guestUser);
    syncSessionCookie(guestUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(guestUser));
    }
    setLoading(false);
  };

  const sendVerificationEmail = async () => {
    if (isFirebaseConfigured && auth?.currentUser) {
      await sendEmailVerification(auth.currentUser);
    } else if (user) {
      console.log('Verification email simulation for local user:', user.email);
    }
  };

  /**
   * Password reset ("forgot password" path — previously missing entirely).
   * Firebase: sends the reset link to the account email (works for accounts
   * created via email/password; Google-only accounts have no password and
   * get a dedicated message). Local/demo mode: no mailer exists, so we
   * return a code the UI turns into guidance instead of fake success.
   */
  const sendPasswordReset = async (email: string): Promise<{ ok: boolean; code: string }> => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { ok: false, code: 'auth/invalid-email' };
    }
    if (isFirebaseConfigured && auth) {
      try {
        await sendPasswordResetEmail(auth, normalized);
        return { ok: true, code: 'reset-sent' };
      } catch (err: any) {
        const code = err?.code || 'reset-failed';
        // Do not leak account existence, but surface actionable codes.
        if (code === 'auth/user-not-found') return { ok: false, code };
        if (code === 'auth/invalid-email') return { ok: false, code };
        if (code === 'auth/too-many-requests') return { ok: false, code };
        if (code === 'auth/network-request-failed') return { ok: false, code };
        return { ok: false, code: 'reset-failed' };
      }
    }
    return { ok: false, code: 'local-mode-no-mailer' };
  };

  const reloadUser = async () => {
    if (isFirebaseConfigured && auth?.currentUser) {
      await auth.currentUser.reload();
      const fbUser = auth.currentUser;
      const updatedAuthUser: AuthUser = {
        uid: fbUser.uid,
        email: fbUser.email || '',
        displayName: fbUser.displayName || fbUser.email?.split('@')[0],
        photoURL: fbUser.photoURL,
        emailVerified: fbUser.emailVerified,
      };
      setUser(updatedAuthUser);
      syncSessionCookie(updatedAuthUser, () => fbUser.getIdToken());
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(updatedAuthUser));
      }
    } else if (user) {
      // Local fallback simulation
      const updatedAuthUser: AuthUser = {
        ...user,
        emailVerified: true,
      };
      setUser(updatedAuthUser);
      syncSessionCookie(updatedAuthUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(updatedAuthUser));
      }
    }
  };

  const signOut = async () => {
    setLoading(true);
    // Clear localStorage FIRST — before firebaseSignOut triggers onAuthStateChanged
    // which would otherwise find the saved user and restore it
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_AUTH_USER_KEY);
    }
    setUser(null);
    syncSessionCookie(null);
    if (isFirebaseConfigured && auth) {
      await firebaseSignOut(auth);
    }
    setLoading(false);
  };

  const clearError = () => setError(null);

  const isGuest = Boolean(
    user?.uid?.startsWith('guest_') ||
    user?.uid === 'guest_user_session' ||
    user?.email === 'guest@review-app.local' ||
    user?.email?.endsWith('@review-app.local')
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInAsGuest,
        signOut,
        sendVerificationEmail,
        reloadUser,
        sendPasswordReset,
        error,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
