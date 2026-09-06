export interface ReportThemePalette {
  id: string;
  name: string;
  nameAr: string;
  primary: string;
  accent: string;
  light: string;
  border: string;
  thBg: string;
  thText: string;
  quoteBorder: string;
  quoteBg: string;
  h3Color: string;
  badgeBorder: string;
  badgeBg: string;
  badgeText: string;
}

export interface ReportBackgroundPalette {
  id: string;
  name: string;
  nameAr: string;
  bodyBg: string;
  cardBg: string;
  border: string;
  text: string;
  darkBodyBg: string;
  darkCardBg: string;
}

export const REPORT_THEMES: Record<string, ReportThemePalette> = {
  olive: {
    id: 'olive',
    name: 'Royal Olive',
    nameAr: 'زيتوني ملكي',
    primary: '#2E4034',
    accent: '#4A6B53',
    light: '#E8EFE9',
    border: '#D4DFD6',
    thBg: '#2E4034',
    thText: '#FFFFFF',
    quoteBorder: '#4A6B53',
    quoteBg: '#F0F5F1',
    h3Color: '#2E4034',
    badgeBorder: '#D4DFD6',
    badgeBg: '#E8EFE9',
    badgeText: '#2E4034',
  },
  blue: {
    id: 'blue',
    name: 'Professional Blue',
    nameAr: 'أزرق احترافي',
    primary: '#1D4ED8',
    accent: '#3B82F6',
    light: '#DBEAFE',
    border: '#BFDBFE',
    thBg: '#1D4ED8',
    thText: '#FFFFFF',
    quoteBorder: '#3B82F6',
    quoteBg: '#EFF6FF',
    h3Color: '#1D4ED8',
    badgeBorder: '#BFDBFE',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
  },
  slate: {
    id: 'slate',
    name: 'Slate Gray',
    nameAr: 'رمادي حجري',
    primary: '#334155',
    accent: '#64748B',
    light: '#F1F5F9',
    border: '#CBD5E1',
    thBg: '#334155',
    thText: '#FFFFFF',
    quoteBorder: '#64748B',
    quoteBg: '#F8FAFC',
    h3Color: '#334155',
    badgeBorder: '#CBD5E1',
    badgeBg: '#F1F5F9',
    badgeText: '#334155',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Green',
    nameAr: 'زمردي أنيق',
    primary: '#047857',
    accent: '#10B981',
    light: '#D1FAE5',
    border: '#A7F3D0',
    thBg: '#047857',
    thText: '#FFFFFF',
    quoteBorder: '#10B981',
    quoteBg: '#ECFDF5',
    h3Color: '#047857',
    badgeBorder: '#A7F3D0',
    badgeBg: '#D1FAE5',
    badgeText: '#065F46',
  },
};

export const REPORT_BACKGROUNDS: Record<string, ReportBackgroundPalette> = {
  white: {
    id: 'white',
    name: 'Classic White',
    nameAr: 'أبيض كلاسيكي',
    bodyBg: '#FFFFFF',
    cardBg: '#FFFFFF',
    border: '#E2E8F0',
    text: '#1E293B',
    darkBodyBg: '#18181B',
    darkCardBg: '#27272A',
  },
  cream: {
    id: 'cream',
    name: 'Warm Cream',
    nameAr: 'كريمي دافئ',
    bodyBg: '#FAF7F0',
    cardBg: '#F5EFEB',
    border: '#E3D7CB',
    text: '#2D2820',
    darkBodyBg: '#1C1A17',
    darkCardBg: '#292521',
  },
  cool: {
    id: 'cool',
    name: 'Cool Slate',
    nameAr: 'رمادي جليدي',
    bodyBg: '#F0F4F8',
    cardBg: '#E7EEF5',
    border: '#CBD5E1',
    text: '#0F172A',
    darkBodyBg: '#0F172A',
    darkCardBg: '#1E293B',
  },
};

export function getReportTheme(themeId?: string): ReportThemePalette {
  return REPORT_THEMES[themeId || 'olive'] || REPORT_THEMES.olive;
}

export function getReportBackground(bgId?: string): ReportBackgroundPalette {
  return REPORT_BACKGROUNDS[bgId || 'white'] || REPORT_BACKGROUNDS.white;
}
