export interface ShortcutItem {
  id: string;
  action: string;
  category: 'editor' | 'table' | 'navigation';
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  defaultKey: string;
  currentKey: string;
  isCustom?: boolean;
  isProtected?: boolean; // For built-in table tab behavior that must be preserved
}

export const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  // Navigation & Saving
  {
    id: 'save',
    action: 'save',
    category: 'navigation',
    titleAr: 'حفظ التقرير فورياً',
    titleEn: 'Save Report Immediately',
    descriptionAr: 'حفظ المحتوى والتعديلات فوراً دون انتظار التوقيت التلقائي',
    descriptionEn: 'Save content immediately without waiting for auto-save debounce',
    defaultKey: 'ctrl+s',
    currentKey: 'ctrl+s',
  },
  {
    id: 'focus_title',
    action: 'focus_title',
    category: 'navigation',
    titleAr: 'الانتقال لحقل العنوان',
    titleEn: 'Focus Title Input',
    descriptionAr: 'نقل مؤشر الكتابة مباشرة إلى حقل عنوان التقرير',
    descriptionEn: 'Move focus directly to report title input',
    defaultKey: 'alt+t',
    currentKey: 'alt+t',
  },
  {
    id: 'focus_editor',
    action: 'focus_editor',
    category: 'navigation',
    titleAr: 'الانتقال إلى محرر التقرير',
    titleEn: 'Focus Editor Area',
    descriptionAr: 'نقل مؤشر الكتابة إلى داخل محرر التقرير',
    descriptionEn: 'Move focus into the rich text editor area',
    defaultKey: 'alt+e',
    currentKey: 'alt+e',
  },

  // Editor Formatting
  {
    id: 'bold',
    action: 'bold',
    category: 'editor',
    titleAr: 'خط عريض (Bold)',
    titleEn: 'Bold',
    descriptionAr: 'تبديل النص المحدد إلى عريض أو عادي',
    descriptionEn: 'Toggle bold formatting on selected text',
    defaultKey: 'ctrl+b',
    currentKey: 'ctrl+b',
  },
  {
    id: 'italic',
    action: 'italic',
    category: 'editor',
    titleAr: 'خط مائل (Italic)',
    titleEn: 'Italic',
    descriptionAr: 'تبديل النص المحدد إلى مائل أو عادي',
    descriptionEn: 'Toggle italic formatting on selected text',
    defaultKey: 'ctrl+i',
    currentKey: 'ctrl+i',
  },
  {
    id: 'h1',
    action: 'h1',
    category: 'editor',
    titleAr: 'عنوان رئيسي (H1)',
    titleEn: 'Heading 1',
    descriptionAr: 'تحويل السطر الحالي إلى ترويسة رئيسية مستوى 1',
    descriptionEn: 'Format current block as Heading 1',
    defaultKey: 'ctrl+alt+1',
    currentKey: 'ctrl+alt+1',
  },
  {
    id: 'h2',
    action: 'h2',
    category: 'editor',
    titleAr: 'عنوان فرعي (H2)',
    titleEn: 'Heading 2',
    descriptionAr: 'تحويل السطر الحالي إلى عنوان فرعي مستوى 2',
    descriptionEn: 'Format current block as Heading 2',
    defaultKey: 'ctrl+alt+2',
    currentKey: 'ctrl+alt+2',
  },
  {
    id: 'h3',
    action: 'h3',
    category: 'editor',
    titleAr: 'عنوان فرعي ثالث (H3)',
    titleEn: 'Heading 3',
    descriptionAr: 'تحويل السطر الحالي إلى عنوان فرعي مستوى 3',
    descriptionEn: 'Format current block as Heading 3',
    defaultKey: 'ctrl+alt+3',
    currentKey: 'ctrl+alt+3',
  },
  {
    id: 'paragraph',
    action: 'paragraph',
    category: 'editor',
    titleAr: 'فقرة نص عادي',
    titleEn: 'Normal Paragraph',
    descriptionAr: 'تحويل السطر أو الترويسة الحالية إلى نص عادي',
    descriptionEn: 'Format current block as a normal paragraph',
    defaultKey: 'ctrl+alt+0',
    currentKey: 'ctrl+alt+0',
  },
  {
    id: 'bullet_list',
    action: 'bullet_list',
    category: 'editor',
    titleAr: 'قائمة نقطية',
    titleEn: 'Bullet List',
    descriptionAr: 'إنشاء أو إلغاء قائمة ذات نقاط',
    descriptionEn: 'Toggle bullet list on current block',
    defaultKey: 'ctrl+shift+8',
    currentKey: 'ctrl+shift+8',
  },
  {
    id: 'ordered_list',
    action: 'ordered_list',
    category: 'editor',
    titleAr: 'قائمة مرقمة',
    titleEn: 'Numbered List',
    descriptionAr: 'إنشاء أو إلغاء قائمة ذات ترقيم تسلسلي',
    descriptionEn: 'Toggle numbered list on current block',
    defaultKey: 'ctrl+shift+7',
    currentKey: 'ctrl+shift+7',
  },
  {
    id: 'blockquote',
    action: 'blockquote',
    category: 'editor',
    titleAr: 'كتلة اقتباس',
    titleEn: 'Blockquote',
    descriptionAr: 'تحويل النص إلى كتلة اقتباس متميزة',
    descriptionEn: 'Toggle blockquote styling',
    defaultKey: 'ctrl+shift+q',
    currentKey: 'ctrl+shift+q',
  },
  {
    id: 'increase_font_size',
    action: 'increase_font_size',
    category: 'editor',
    titleAr: 'تكبير حجم الخط (+2px)',
    titleEn: 'Increase Font Size (+2px)',
    descriptionAr: 'تكبير حجم خط النص المحدد بمقدار 2 بكسل',
    descriptionEn: 'Increase font size of selected text by 2px',
    defaultKey: 'ctrl+shift+>',
    currentKey: 'ctrl+shift+>',
  },
  {
    id: 'decrease_font_size',
    action: 'decrease_font_size',
    category: 'editor',
    titleAr: 'تصغير حجم الخط (-2px)',
    titleEn: 'Decrease Font Size (-2px)',
    descriptionAr: 'تصغير حجم خط النص المحدد بمقدار 2 بكسل',
    descriptionEn: 'Decrease font size of selected text by 2px',
    defaultKey: 'ctrl+shift+<',
    currentKey: 'ctrl+shift+<',
  },
  {
    id: 'dir_rtl',
    action: 'dir_rtl',
    category: 'editor',
    titleAr: 'اتجاه النص لليمين (RTL)',
    titleEn: 'Text Direction Right to Left (RTL)',
    descriptionAr: 'تغيير اتجاه النص المحدد ليكون من اليمين إلى اليسار',
    descriptionEn: 'Set text direction of selected block to Right to Left (RTL)',
    defaultKey: 'ctrl+alt+r',
    currentKey: 'ctrl+alt+r',
  },
  {
    id: 'dir_ltr',
    action: 'dir_ltr',
    category: 'editor',
    titleAr: 'اتجاه النص لليسار (LTR)',
    titleEn: 'Text Direction Left to Right (LTR)',
    descriptionAr: 'تغيير اتجاه النص المحدد ليكون من اليسار إلى اليمين',
    descriptionEn: 'Set text direction of selected block to Left to Right (LTR)',
    defaultKey: 'ctrl+alt+l',
    currentKey: 'ctrl+alt+l',
  },

  // Tables
  {
    id: 'table_tab_next',
    action: 'table_tab_next',
    category: 'table',
    titleAr: 'التنقل للخلية التالية / إنشاء صف جديد',
    titleEn: 'Next Cell / Add Row on End',
    descriptionAr: 'الانتقال للخلية التالية؛ وعند الضغط في آخر خلية بآخر صف ينشئ صفاً جديداً تلقائياً',
    descriptionEn: 'Move to next cell; press in last cell to automatically create a new row',
    defaultKey: 'tab',
    currentKey: 'tab',
    isProtected: true,
  },
  {
    id: 'table_tab_prev',
    action: 'table_tab_prev',
    category: 'table',
    titleAr: 'الرجوع للخلية السابقة بالجدول',
    titleEn: 'Previous Cell in Table',
    descriptionAr: 'الانتقال إلى الخلية السابقة بالجدول',
    descriptionEn: 'Move back to the previous table cell',
    defaultKey: 'shift+tab',
    currentKey: 'shift+tab',
    isProtected: true,
  },
  {
    id: 'table_add_row',
    action: 'table_add_row',
    category: 'table',
    titleAr: 'إضافة صف أسفل الموضع الحالي',
    titleEn: 'Add Row Below',
    descriptionAr: 'إدراج صف جديد في الجدول مباشرة أسفل الصف النشط',
    descriptionEn: 'Insert a new row in table directly below active row',
    defaultKey: 'ctrl+alt+down',
    currentKey: 'ctrl+alt+down',
  },
  {
    id: 'table_delete_row',
    action: 'table_delete_row',
    category: 'table',
    titleAr: 'حذف الصف الحالي بالجدول',
    titleEn: 'Delete Current Row',
    descriptionAr: 'حذف الصف الذي يوجد فيه المؤشر حالياً',
    descriptionEn: 'Delete the table row currently containing the cursor',
    defaultKey: 'ctrl+alt+backspace',
    currentKey: 'ctrl+alt+backspace',
  },
];

export const SHORTCUTS_STORAGE_KEY = 'user_custom_shortcuts';

export function getCustomShortcuts(): ShortcutItem[] {
  if (typeof window === 'undefined') return DEFAULT_SHORTCUTS;
  try {
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!raw) return DEFAULT_SHORTCUTS;
    const parsed: Record<string, string> = JSON.parse(raw);
    return DEFAULT_SHORTCUTS.map((item) => {
      const customKey = parsed[item.id];
      if (customKey && !item.isProtected) {
        return { ...item, currentKey: customKey, isCustom: customKey !== item.defaultKey };
      }
      return item;
    });
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveCustomShortcut(id: string, newKey: string): ShortcutItem[] {
  if (typeof window === 'undefined') return DEFAULT_SHORTCUTS;
  try {
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    const existing: Record<string, string> = raw ? JSON.parse(raw) : {};
    existing[id] = newKey.toLowerCase();
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(existing));
  } catch (err) {
    console.error('Failed to save shortcut', err);
  }
  return getCustomShortcuts();
}

export function resetShortcutsToDefault(): ShortcutItem[] {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
  }
  return DEFAULT_SHORTCUTS;
}

export function normalizeKeyboardEvent(e: KeyboardEvent | React.KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  const rawKey = e.key ? e.key.toLowerCase() : '';
  // Don't add modifier keys alone
  if (!['control', 'alt', 'shift', 'meta'].includes(rawKey)) {
    if (rawKey === 'arrowdown') {
      parts.push('down');
    } else if (rawKey === 'arrowup') {
      parts.push('up');
    } else if (rawKey === 'arrowleft') {
      parts.push('left');
    } else if (rawKey === 'arrowright') {
      parts.push('right');
    } else if (rawKey === ' ') {
      parts.push('space');
    } else if (rawKey === 'escape') {
      parts.push('escape');
    } else if (rawKey === 'backspace') {
      parts.push('backspace');
    } else if (rawKey === 'tab') {
      parts.push('tab');
    } else if (rawKey === 'enter') {
      parts.push('enter');
    } else if (rawKey === '*' || e.code === 'Digit8') {
      parts.push(e.shiftKey ? '8' : '*');
    } else if (rawKey === '&' || e.code === 'Digit7') {
      parts.push(e.shiftKey ? '7' : '&');
    } else if (rawKey === '>' || (e.shiftKey && e.code === 'Period')) {
      parts.push('>');
    } else if (rawKey === '<' || (e.shiftKey && e.code === 'Comma')) {
      parts.push('<');
    } else if (e.code && e.code.startsWith('Digit') && /^[0-9]$/.test(e.code.slice(5))) {
      parts.push(e.code.slice(5));
    } else if (e.code && e.code.startsWith('Key')) {
      // If rawKey is non-latin (e.g. Arabic keyboard layout), resolve key from e.code
      if (!/^[a-z]$/i.test(rawKey)) {
        parts.push(e.code.slice(3).toLowerCase());
      } else {
        parts.push(rawKey);
      }
    } else {
      parts.push(rawKey);
    }
  }
  return parts.join('+');
}

export function formatKeyDisplay(keyCombo: string): string {
  if (!keyCombo) return '';
  return keyCombo
    .split('+')
    .map((k) => {
      switch (k) {
        case 'ctrl':
          return 'Ctrl';
        case 'alt':
          return 'Alt';
        case 'shift':
          return 'Shift';
        case 'down':
          return '↓';
        case 'up':
          return '↑';
        case 'left':
          return '←';
        case 'right':
          return '→';
        case 'space':
          return 'Space';
        case 'backspace':
          return 'Backspace';
        case 'tab':
          return 'Tab';
        default:
          return k.toUpperCase();
      }
    })
    .join(' + ');
}
