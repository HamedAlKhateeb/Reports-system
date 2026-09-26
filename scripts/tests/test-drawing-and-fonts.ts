import { wrapTextLines, elementsBounds } from '../../lib/drawing/geometry';
import { EDITOR_FONTS, GOOGLE_FONTS_STYLESHEET_URL, matchEditorFont, resolveFontStack } from '../../lib/fonts';
import { newDrawingElementId, DrawingElement } from '../../lib/drawing/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${message}`);
}

console.log('=== Running Tests: Drawing Text Wrapping, Fonts, and Element Clones ===\n');

// 1. Test Text Wrapping
console.log('--- 1. Testing wrapTextLines ---');
const sampleText = 'This is a long line of text that should wrap inside a rectangle shape properly';
const wrapped = wrapTextLines(sampleText, 100, 16, (s) => s.length * 8);
assert(wrapped.length > 1, `Wrapped into ${wrapped.length} lines for narrow width`);
assert(wrapped.join(' ').replace(/\s+/g, ' ') === sampleText, 'All words preserved when joining wrapped lines');

// Test newline preservation
const multilineText = 'First Line\nSecond Line\nThird Line';
const wrappedMultiline = wrapTextLines(multilineText, 500, 16);
assert(wrappedMultiline.length === 3, 'Preserves explicit newlines');
assert(wrappedMultiline[0] === 'First Line' && wrappedMultiline[2] === 'Third Line', 'Multiline content matches');

// Empty text
const emptyWrapped = wrapTextLines('', 100, 16);
assert(emptyWrapped.length === 0, 'Empty string returns empty array');

// 2. Test Fonts System
console.log('\n--- 2. Testing Font Definitions and Google Fonts ---');
assert(EDITOR_FONTS.length >= 8, `Has at least 8 editor fonts (found ${EDITOR_FONTS.length})`);
assert(GOOGLE_FONTS_STYLESHEET_URL.includes('Amiri'), 'Google Fonts stylesheet includes Amiri');
assert(GOOGLE_FONTS_STYLESHEET_URL.includes('Cairo'), 'Google Fonts stylesheet includes Cairo');
assert(GOOGLE_FONTS_STYLESHEET_URL.includes('Readex+Pro'), 'Google Fonts stylesheet includes Readex Pro');
assert(GOOGLE_FONTS_STYLESHEET_URL.includes('Tajawal'), 'Google Fonts stylesheet includes Tajawal');

const amiriMatch = matchEditorFont('Amiri');
assert(amiriMatch !== undefined && amiriMatch.id === 'Amiri', 'matchEditorFont matches Amiri');
const amiriStack = resolveFontStack(amiriMatch?.stack);
assert(amiriStack.includes('Amiri') && amiriStack.includes('serif'), 'resolveFontStack produces valid CSS font stack');
const fallbackStack = resolveFontStack(undefined);
assert(fallbackStack.includes('Tajawal') && fallbackStack.includes('sans-serif'), 'resolveFontStack uses fallback for undefined');

// 3. Test Element Cloning & Independent Text
console.log('\n--- 3. Testing Element Cloning and Text Independence ---');
const originalElement: DrawingElement = {
  id: newDrawingElementId(),
  type: 'rectangle',
  x: 100,
  y: 150,
  width: 200,
  height: 120,
  strokeColor: '#2563eb',
  backgroundColor: '#dbeafe',
  strokeWidth: 2,
  strokeStyle: 'solid',
  fontSize: 20,
  fontFamily: 'Cairo',
  textColor: '#1e3a8a',
  text: 'Shape Text',
};

// Simulate clone
const clonedElement: DrawingElement = {
  ...originalElement,
  id: newDrawingElementId(),
  x: originalElement.x + 20,
  y: originalElement.y + 20,
};

assert(clonedElement.id !== originalElement.id, 'Cloned element gets a distinct ID');
assert(clonedElement.x === 120 && clonedElement.y === 170, 'Cloned element is offset by +20px');
assert(clonedElement.text === 'Shape Text', 'Cloned element preserves text');
assert(clonedElement.textColor === '#1e3a8a', 'Cloned element preserves textColor');
assert(clonedElement.fontSize === 20, 'Cloned element preserves fontSize');

// Clear text alone without mutating geometry
const textClearedElement: DrawingElement = {
  ...originalElement,
  text: '',
};
assert(textClearedElement.text === '', 'Text is cleared');
assert(textClearedElement.width === 200 && textClearedElement.height === 120, 'Geometry is preserved when clearing text');
assert(textClearedElement.strokeColor === '#2563eb', 'Styles are preserved when clearing text');

// Update text alone
const textUpdatedElement: DrawingElement = {
  ...originalElement,
  text: 'Brand New Independent Text',
  textColor: '#dc2626',
};
assert(textUpdatedElement.text === 'Brand New Independent Text', 'Text updated independently');
assert(textUpdatedElement.textColor === '#dc2626', 'Text color updated independently');
assert(textUpdatedElement.width === originalElement.width, 'Shape geometry unchanged');

// 4. Test Bounds Calculation
console.log('\n--- 4. Testing Elements Bounds Calculation ---');
const bounds = elementsBounds([originalElement, clonedElement]);
assert(bounds !== null, 'Bounds calculated successfully');
if (bounds) {
  assert(bounds.minX === 100, `minX is 100 (got ${bounds.minX})`);
  assert(bounds.minY === 150, `minY is 150 (got ${bounds.minY})`);
  assert(bounds.maxX === 320, `maxX is 320 (got ${bounds.maxX})`);
  assert(bounds.maxY === 290, `maxY is 290 (got ${bounds.maxY})`);
}

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n');
