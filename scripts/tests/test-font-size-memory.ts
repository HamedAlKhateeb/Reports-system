import { resolveActiveFontSize, DEFAULT_FONT_SIZE } from '../../components/editor/FontSizeMark';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ Assertion Failed: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${msg}`);
}

console.log('=== Running Tests: Font Size Memory & Real vs Fake Number Resolution ===\n');

// 1. Test when text has an explicit mark (e.g. 24px)
console.log('--- 1. Explicit fontSize Mark ---');
const editorWithMark = {
  state: {
    selection: { empty: false, $from: { marks: () => [{ type: { name: 'fontSize' }, attrs: { size: '24px' } }] } },
    storedMarks: null,
  },
  getAttributes: (name: string) => (name === 'fontSize' ? { size: '24px' } : {}),
  isActive: () => false,
  storage: { fontSize: { current: '16px' } },
};
assert(resolveActiveFontSize(editorWithMark) === 24, 'Resolves explicit mark on selection as 24px');

// 2. Test when text is selected with NO mark (plain text)
// CRITICAL: Must return 16px (the REAL size of the text) and NOT the memory fallback!
// This is what prevents the "fake number" bug where the user had to click up and down to apply the size!
console.log('\n--- 2. Unstyled Text Selection (No Fake Number) ---');
const editorUnstyledSelection = {
  state: {
    selection: { empty: false, $from: { marks: () => [] } },
    storedMarks: null,
  },
  getAttributes: () => ({}),
  isActive: () => false,
  storage: { fontSize: { current: '28px' } }, // Memory holds 28px from earlier!
};
assert(
  resolveActiveFontSize(editorUnstyledSelection) === 16,
  'Unstyled text selection returns 16px (REAL text size), NOT the 28px memory!'
);

// 3. Test collapsed cursor on empty line with active memory
// When cursor is collapsed and about to type, it MUST read the memory so the user continues in that size!
console.log('\n--- 3. Collapsed Cursor with Memory (Active Typing Size) ---');
const editorCollapsedWithMemory = {
  state: {
    selection: { empty: true, $from: { marks: () => [] } },
    storedMarks: null,
  },
  getAttributes: () => ({}),
  isActive: () => false,
  storage: { fontSize: { current: '22px' } },
};
assert(
  resolveActiveFontSize(editorCollapsedWithMemory) === 22,
  'Collapsed cursor returns remembered 22px so typed text continues in 22px'
);

// 4. Test collapsed cursor with pending stored mark
console.log('\n--- 4. Collapsed Cursor with Stored Mark ---');
const editorWithStoredMark = {
  state: {
    selection: { empty: true, $from: { marks: () => [] } },
    storedMarks: [{ type: { name: 'fontSize' }, attrs: { size: '20px' } }],
  },
  getAttributes: () => ({}),
  isActive: () => false,
  storage: { fontSize: { current: '16px' } },
};
assert(resolveActiveFontSize(editorWithStoredMark) === 20, 'Stored mark takes precedence on collapsed cursor');

// 5. Test Heading defaults
console.log('\n--- 5. Headings Font Size ---');
const editorH1 = {
  state: {
    selection: { empty: true, $from: { marks: () => [] } },
    storedMarks: null,
  },
  getAttributes: () => ({}),
  isActive: (name: string, attrs?: any) => name === 'heading' && attrs?.level === 1,
  storage: { fontSize: { current: '16px' } },
};
assert(resolveActiveFontSize(editorH1) === 30, 'Heading 1 returns 30px');

const editorH2 = {
  state: {
    selection: { empty: true, $from: { marks: () => [] } },
    storedMarks: null,
  },
  getAttributes: () => ({}),
  isActive: (name: string, attrs?: any) => name === 'heading' && attrs?.level === 2,
  storage: { fontSize: { current: '16px' } },
};
assert(resolveActiveFontSize(editorH2) === 24, 'Heading 2 returns 24px');

console.log('\n🎉 ALL FONT SIZE MEMORY TESTS PASSED! 🎉\n');
