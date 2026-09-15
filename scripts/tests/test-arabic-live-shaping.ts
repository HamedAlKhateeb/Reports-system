import { hasArabic } from '@univerjs/engine-render';

console.log('=== TEST ARABIC RENDERING & DETECTION ===\n');

// 1. Check hasArabic detection
const testCases = [
  { text: 'حامد', expected: true, label: 'Standard Arabic' },
  { text: 'مرحبا بكم', expected: true, label: 'Arabic phrase' },
  { text: 'Hello World', expected: false, label: 'Latin text' },
  { text: '=SUM(A1:B2)', expected: false, label: 'Formula' },
  { text: '12345', expected: false, label: 'Pure numbers' },
  { text: 'Hello \u062D\u0627\u0645\u062F', expected: true, label: 'Mixed Latin + Arabic' },
  { text: '\u0750', expected: true, label: 'Arabic Supplement start (\\u0750)' },
  { text: '\u077F', expected: true, label: 'Arabic Supplement end (\\u077F)' },
  { text: 'نص\u200Cفاصل', expected: true, label: 'Arabic with ZWNJ (\\u200C)' },
  { text: 'نص\u200Dمتصل', expected: true, label: 'Arabic with ZWJ (\\u200D)' },
];

let failed = 0;
for (const tc of testCases) {
  const actual = hasArabic(tc.text);
  if (actual === tc.expected) {
    console.log(`  [PASS] ${tc.label} (hasArabic("${tc.text}") === ${actual})`);
  } else {
    console.error(`  [FAIL] ${tc.label} (expected ${tc.expected}, got ${actual})`);
    failed++;
  }
}

// 2. Test FormulaBar direction heuristic
console.log('\n=== TEST FORMULABAR DIRECTION HEURISTIC ===\n');
function getFormulaBarDirection(stream: string, isRTLSheet: boolean) {
  const isFormula = stream.startsWith('=');
  const isArabic = hasArabic(stream);
  const isRTL = !isFormula && (isArabic || isRTLSheet);
  const dir = isRTL ? 'rtl' : 'ltr';
  const forceDirection = isFormula ? 'ltr' : isRTL ? 'rtl' : undefined;
  return { dir, forceDirection };
}

const dirCases = [
  { stream: '=SUM(A1:A5)', isRTLSheet: true, expectedDir: 'ltr', expectedForce: 'ltr', label: 'Formula in RTL sheet' },
  { stream: '=AVERAGE(B1:B10)', isRTLSheet: false, expectedDir: 'ltr', expectedForce: 'ltr', label: 'Formula in LTR sheet' },
  { stream: 'تقرير المبيعات', isRTLSheet: false, expectedDir: 'rtl', expectedForce: 'rtl', label: 'Arabic text in LTR sheet' },
  { stream: 'حامد', isRTLSheet: true, expectedDir: 'rtl', expectedForce: 'rtl', label: 'Arabic text in RTL sheet' },
  { stream: 'Invoice #1024', isRTLSheet: true, expectedDir: 'rtl', expectedForce: 'rtl', label: 'English text in RTL sheet' },
  { stream: 'Invoice #1024', isRTLSheet: false, expectedDir: 'ltr', expectedForce: undefined, label: 'English text in LTR sheet' },
];

for (const dc of dirCases) {
  const result = getFormulaBarDirection(dc.stream, dc.isRTLSheet);
  const pass = result.dir === dc.expectedDir && result.forceDirection === dc.expectedForce;
  if (pass) {
    console.log(`  [PASS] ${dc.label}: dir=${result.dir}, force=${result.forceDirection}`);
  } else {
    console.error(`  [FAIL] ${dc.label}: expected dir=${dc.expectedDir}, force=${dc.expectedForce}, got dir=${result.dir}, force=${result.forceDirection}`);
    failed++;
  }
}

console.log(`\n=== RESULTS: ${testCases.length + dirCases.length - failed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
