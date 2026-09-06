'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
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
}

interface AuthContextType {
  user: AuthUser | null;
  isGuest: boolean;
  loading: boolean;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_AUTH_USER_KEY = 'review_app_auth_user';
const SESSION_COOKIE_NAME = '__session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync session cookie for Next.js Middleware
  const syncSessionCookie = (userObj: AuthUser | null) => {
    if (typeof document === 'undefined') return;
    if (userObj) {
      document.cookie = `${SESSION_COOKIE_NAME}=${userObj.uid}; path=/; max-age=604800; SameSite=Lax`;
    } else {
      document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    }
  };

  useEffect(() => {
    if (isFirebaseConfigured && auth) {
      const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        if (fbUser && fbUser.email) {
          // Check whitelist!
          const authorized = await isUserAuthorized(fbUser.email);
          if (!authorized) {
            if (auth) await firebaseSignOut(auth);
            setUser(null);
            syncSessionCookie(null);
            setError('unauthorizedUserError');
            setLoading(false);
            return;
          }

          const currentAuthUser: AuthUser = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email.split('@')[0],
            photoURL: fbUser.photoURL,
          };
          setUser(currentAuthUser);
          syncSessionCookie(currentAuthUser);
        } else {
          setUser(null);
          syncSessionCookie(null);
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

  const signInWithEmail = async (email: string, pass: string) => {
    setError(null);
    setLoading(true);

    const authorized = await isUserAuthorized(email);
    if (!authorized) {
      setLoading(false);
      throw new Error('unauthorizedUserError');
    }

    if (isFirebaseConfigured && auth) {
      try {
        const creds = await signInWithEmailAndPassword(auth, email, pass);
        const fbUser = creds.user;
        const currentAuthUser: AuthUser = {
          uid: fbUser.uid,
          email: fbUser.email || email,
          displayName: fbUser.displayName || email.split('@')[0],
          photoURL: fbUser.photoURL,
        };
        setUser(currentAuthUser);
        syncSessionCookie(currentAuthUser);
      } catch (err: any) {
        setLoading(false);
        throw err;
      }
    } else {
      // Demo / Mock sign in
      const mockUser: AuthUser = {
        uid: 'user_' + Math.random().toString(36).substring(2, 9),
        email,
        displayName: email.split('@')[0],
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
        const creds = await signInWithPopup(auth, googleProvider);
        const fbUser = creds.user;
        const email = fbUser.email;

        // Verify whitelist!
        const authorized = await isUserAuthorized(email);
        if (!authorized) {
          await firebaseSignOut(auth);
          setUser(null);
          syncSessionCookie(null);
          throw new Error('unauthorizedUserError');
        }

        const currentAuthUser: AuthUser = {
          uid: fbUser.uid,
          email: email || '',
          displayName: fbUser.displayName || email?.split('@')[0],
          photoURL: fbUser.photoURL,
        };
        setUser(currentAuthUser);
        syncSessionCookie(currentAuthUser);
      } catch (err: any) {
        setLoading(false);
        throw err;
      }
    } else {
      // Demo sign in with Google account simulation
      const demoEmail = 'reviewer@example.com';
      const authorized = await isUserAuthorized(demoEmail);
      if (!authorized) {
        setLoading(false);
        throw new Error('unauthorizedUserError');
      }
      const mockUser: AuthUser = {
        uid: 'google_demo_user',
        email: demoEmail,
        displayName: 'Google Reviewer',
        photoURL: null,
      };
      setUser(mockUser);
      syncSessionCookie(mockUser);
      localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(mockUser));
    }
    setLoading(false);
  };

  const signInAsGuest = async () => {
    setError(null);
    setLoading(true);
    const guestUser: AuthUser = {
      uid: 'guest_user_session',
      email: 'guest@review-app.local',
      displayName: 'Guest Reviewer',
      photoURL: null,
    };
    setUser(guestUser);
    syncSessionCookie(guestUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(guestUser));
    }
    setLoading(false);
  };

  const signOut = async () => {
    setLoading(true);
    if (isFirebaseConfigured && auth) {
      await firebaseSignOut(auth);
    }
    setUser(null);
    syncSessionCookie(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_AUTH_USER_KEY);
    }
    setLoading(false);
  };

  const clearError = () => setError(null);

  const isGuest = user?.uid === 'guest_user_session' || user?.email === 'guest@review-app.local';

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        loading,
        signInWithEmail,
        signInWithGoogle,
        signInAsGuest,
        signOut,
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
