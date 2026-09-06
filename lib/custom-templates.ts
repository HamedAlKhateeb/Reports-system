'use client';

import { AppLanguage } from './i18n/dictionary';

export interface CustomTemplateItem {
  id: string;
  name: string;
  description: string;
  contentJson: any;
  themeColor?: string;
  backgroundColor?: string;
  language: AppLanguage;
  createdAt: string;
}

export const CUSTOM_TEMPLATES_KEY = 'user_custom_templates';

export function getCustomTemplates(userUid?: string): CustomTemplateItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = userUid ? `${CUSTOM_TEMPLATES_KEY}_${userUid}` : CUSTOM_TEMPLATES_KEY;
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    // If userUid specific is empty, check global fallback
    if (userUid) {
      const fallback = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
      if (fallback) return JSON.parse(fallback);
    }
    return [];
  } catch (err) {
    console.error('Failed to load custom templates from localStorage', err);
    return [];
  }
}

export function saveCustomTemplate(
  item: Omit<CustomTemplateItem, 'id' | 'createdAt'>,
  userUid?: string
): CustomTemplateItem {
  const existing = getCustomTemplates(userUid);
  const newTemplate: CustomTemplateItem = {
    ...item,
    id: 'tmpl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    createdAt: new Date().toISOString(),
  };

  const updated = [newTemplate, ...existing];
  try {
    const key = userUid ? `${CUSTOM_TEMPLATES_KEY}_${userUid}` : CUSTOM_TEMPLATES_KEY;
    localStorage.setItem(key, JSON.stringify(updated));
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save custom template to localStorage', err);
  }
  return newTemplate;
}

export function deleteCustomTemplate(id: string, userUid?: string): boolean {
  const existing = getCustomTemplates(userUid);
  const updated = existing.filter((t) => t.id !== id);
  try {
    const key = userUid ? `${CUSTOM_TEMPLATES_KEY}_${userUid}` : CUSTOM_TEMPLATES_KEY;
    localStorage.setItem(key, JSON.stringify(updated));
    return true;
  } catch (err) {
    console.error('Failed to delete custom template from localStorage', err);
    return false;
  }
}
