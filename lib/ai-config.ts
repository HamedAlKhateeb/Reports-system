'use client';

import { db, auth, isFirebaseConfigured } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface AiProviderConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  showAiAssistant?: boolean;
}

export const DEFAULT_AI_CONFIG: AiProviderConfig = {
  provider: 'gemini',
  modelName: 'gemini-1.5-flash',
  apiKey: '',
  baseUrl: '',
  showAiAssistant: true,
};

export const AI_CONFIG_KEY = 'ai_provider_config';
export const LEGACY_GEMINI_KEY = 'gemini_custom_api_key';
export const AI_ASSISTANT_VISIBLE_KEY = 'ai_assistant_visible';

function getStorageKey(userUid?: string): string {
  const uid = userUid || (typeof window !== 'undefined' ? auth?.currentUser?.uid : undefined);
  return uid ? `${AI_CONFIG_KEY}_${uid}` : AI_CONFIG_KEY;
}

/**
 * Synchronously retrieves local AI configuration with user-scoped key and fallback
 */
export function getLocalAiConfig(userUid?: string): AiProviderConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_AI_CONFIG };

  try {
    const userKey = getStorageKey(userUid);
    const userSaved = localStorage.getItem(userKey);
    if (userSaved) {
      const parsed = JSON.parse(userSaved);
      return { ...DEFAULT_AI_CONFIG, ...parsed };
    }

    // Fallback to global key
    const globalSaved = localStorage.getItem(AI_CONFIG_KEY);
    if (globalSaved) {
      const parsed = JSON.parse(globalSaved);
      return { ...DEFAULT_AI_CONFIG, ...parsed };
    }

    // Legacy fallback
    const legacyKey = localStorage.getItem(LEGACY_GEMINI_KEY);
    if (legacyKey) {
      return {
        ...DEFAULT_AI_CONFIG,
        provider: 'gemini',
        modelName: 'gemini-1.5-flash',
        apiKey: legacyKey,
      };
    }
  } catch (e) {
    console.warn('Could not read AI config from localStorage', e);
  }

  return { ...DEFAULT_AI_CONFIG };
}

/**
 * Loads AI configuration: checks local storage first, then merges with Firestore user_settings
 */
export async function getAiProviderConfig(userUid?: string): Promise<AiProviderConfig> {
  const localConfig = getLocalAiConfig(userUid);
  const uid = userUid || auth?.currentUser?.uid;

  if (isFirebaseConfigured && db && uid) {
    try {
      const docRef = doc(db, 'user_settings', uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data?.aiConfig || data?.showAiAssistant !== undefined) {
          const remoteConfig: AiProviderConfig = {
            ...DEFAULT_AI_CONFIG,
            ...localConfig,
            ...(data?.aiConfig || {}),
            showAiAssistant: data?.showAiAssistant !== undefined ? data.showAiAssistant : (localConfig.showAiAssistant ?? true),
          };
          // Sync back to local storage
          if (typeof window !== 'undefined') {
            try {
              const userKey = getStorageKey(uid);
              localStorage.setItem(userKey, JSON.stringify(remoteConfig));
              localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(remoteConfig));
              localStorage.setItem(AI_ASSISTANT_VISIBLE_KEY, remoteConfig.showAiAssistant ? 'true' : 'false');
              localStorage.setItem(`${AI_ASSISTANT_VISIBLE_KEY}_${uid}`, remoteConfig.showAiAssistant ? 'true' : 'false');
              if (remoteConfig.apiKey) {
                localStorage.setItem(LEGACY_GEMINI_KEY, remoteConfig.apiKey);
              }
            } catch (_) {}
          }
          return remoteConfig;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch AI config from Firestore, using local cache', e);
    }
  }

  return localConfig;
}

/**
 * Saves AI configuration to both local storage (user-scoped + global) and Firestore user_settings
 */
export async function saveAiProviderConfig(config: AiProviderConfig, userUid?: string): Promise<void> {
  const uid = userUid || auth?.currentUser?.uid;

  if (typeof window !== 'undefined') {
    try {
      const userKey = getStorageKey(uid);
      localStorage.setItem(userKey, JSON.stringify(config));
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
      if (config.apiKey) {
        localStorage.setItem(LEGACY_GEMINI_KEY, config.apiKey);
      }
    } catch (e) {
      console.warn('Failed to save AI config to localStorage', e);
    }
  }

  if (isFirebaseConfigured && db && uid) {
    try {
      const docRef = doc(db, 'user_settings', uid);
      await setDoc(
        docRef,
        {
          aiConfig: config,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to sync AI config to Firestore', e);
    }
  }
}

/**
 * Removes AI configuration (clears key and settings)
 */
export async function removeAiProviderConfig(userUid?: string): Promise<void> {
  const uid = userUid || auth?.currentUser?.uid;

  if (typeof window !== 'undefined') {
    try {
      const userKey = getStorageKey(uid);
      localStorage.removeItem(userKey);
      localStorage.removeItem(AI_CONFIG_KEY);
      localStorage.removeItem(LEGACY_GEMINI_KEY);
    } catch (_) {}
  }

  if (isFirebaseConfigured && db && uid) {
    try {
      const docRef = doc(db, 'user_settings', uid);
      await setDoc(
        docRef,
        {
          aiConfig: { ...DEFAULT_AI_CONFIG },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to clear AI config in Firestore', e);
    }
  }
}

/**
 * Returns whether AI Assistant floating button is visible for the current user
 */
export function getAiAssistantVisible(userUid?: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const uid = userUid || auth?.currentUser?.uid;
    if (uid) {
      const userVal = localStorage.getItem(`${AI_ASSISTANT_VISIBLE_KEY}_${uid}`);
      if (userVal !== null) return userVal === 'true';
    }
    const val = localStorage.getItem(AI_ASSISTANT_VISIBLE_KEY);
    if (val !== null) return val === 'true';
  } catch (_) {}
  return true;
}

/**
 * Saves AI Assistant visibility setting and notifies listeners
 */
export async function saveAiAssistantVisible(visible: boolean, userUid?: string): Promise<void> {
  const uid = userUid || auth?.currentUser?.uid;

  if (typeof window !== 'undefined') {
    try {
      if (uid) {
        localStorage.setItem(`${AI_ASSISTANT_VISIBLE_KEY}_${uid}`, visible ? 'true' : 'false');
      }
      localStorage.setItem(AI_ASSISTANT_VISIBLE_KEY, visible ? 'true' : 'false');
      window.dispatchEvent(
        new CustomEvent('ai-assistant-visibility-changed', {
          detail: { visible },
        })
      );
    } catch (_) {}
  }

  if (isFirebaseConfigured && db && uid) {
    try {
      const docRef = doc(db, 'user_settings', uid);
      await setDoc(
        docRef,
        {
          showAiAssistant: visible,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Failed to sync AI visibility to Firestore', e);
    }
  }
}

