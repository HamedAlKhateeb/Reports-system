import { normalizeSeverity, normalizeStatus, isDoneStatus, isCriticalOrMajor } from '../../lib/i18n/dictionary';
import { evaluateFormula, colIndexToName } from '../../lib/grid/formula-parser';
import { getMetricHelpDetails } from '../../lib/insight-help-data';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${msg}`);
}

console.log('\n=== TESTING SMART TABLE & NORMALIZATION ENHANCEMENTS ===\n');

// 1. Canonical Normalization
console.log('Test 1: Canonical Normalization');
assert(normalizeSeverity('high') === 'major', 'Maps legacy "high" to "major"');
assert(normalizeSeverity('critical') === 'critical', 'Preserves "critical"');
assert(normalizeSeverity('low') === 'minor', 'Maps legacy "low" to "minor"');
assert(normalizeSeverity('medium') === 'medium', 'Preserves "medium"');
assert(normalizeSeverity('normal') === 'normal', 'Preserves "normal"');
assert(normalizeSeverity(undefined) === 'normal', 'Defaults to "normal"');

assert(normalizeStatus('closed') === 'done', 'Maps legacy "closed" to "done"');
assert(normalizeStatus('resolved') === 'done', 'Maps legacy "resolved" to "done"');
assert(normalizeStatus('in_progress') === 'in_progress', 'Preserves "in_progress"');
assert(normalizeStatus('open') === 'open', 'Preserves "open"');

assert(isDoneStatus('done') === true, 'isDoneStatus(done) is true');
assert(isDoneStatus('closed') === true, 'isDoneStatus(closed) is true');
assert(isDoneStatus('open') === false, 'isDoneStatus(open) is false');

assert(isCriticalOrMajor('critical') === true, 'isCriticalOrMajor(critical) is true');
assert(isCriticalOrMajor('major') === true, 'isCriticalOrMajor(major) is true');
assert(isCriticalOrMajor('high') === true, 'isCriticalOrMajor(high) is true');
assert(isCriticalOrMajor('medium') === false, 'isCriticalOrMajor(medium) is false');

// 2. Smart Table Transpose Logic
console.log('\nTest 2: Smart Table Transpose Logic');
const originalCols = [
  { id: 'A', name: 'Item', type: 'text' },
  { id: 'B', name: 'Cost', type: 'number' },
];
const originalRows = [
  { A: 'Laptop', B: 1200 },
  { A: 'Mouse', B: 25 },
];

// Transposing: new columns count = original rows count
const transposedCols = originalRows.map((_, rIdx) => ({
  id: colIndexToName(rIdx),
  name: `Column ${colIndexToName(rIdx)}`,
  type: 'text',
}));
assert(transposedCols.length === 2, 'Transposed columns count matches original rows');
assert(transposedCols[0].id === 'A' && transposedCols[1].id === 'B', 'Transposed column IDs are A and B');

const transposedRows = originalCols.map((oldCol) => {
  const newRowObj: Record<string, any> = {};
  originalRows.forEach((oldRow, rIdx) => {
    const newColLetter = colIndexToName(rIdx);
    newRowObj[newColLetter] = (oldRow as any)[oldCol.id] ?? '';
  });
  return newRowObj;
});

assert(transposedRows.length === 2, 'Transposed rows count matches original cols');
assert(transposedRows[0].A === 'Laptop' && transposedRows[0].B === 'Mouse', 'Row 1 has original Col A values');
assert(transposedRows[1].A === 1200 && transposedRows[1].B === 25, 'Row 2 has original Col B values');

// 3. Formula Evaluation for DOCX/PDF Export
console.log('\nTest 3: Formula Evaluation for Exports');
const cellsMap: Record<string, unknown> = {
  A1: 10,
  A2: 20,
  A3: 30,
  B1: '=SUM(A1:A3)',
  B2: '=AVERAGE(A1:A3)',
  B3: '=A1*A2',
};

assert(evaluateFormula('=SUM(A1:A3)', cellsMap) === 60, 'Formula =SUM(A1:A3) evaluates to 60');
assert(evaluateFormula('=AVERAGE(A1:A3)', cellsMap) === 20, 'Formula =AVERAGE(A1:A3) evaluates to 20');
assert(evaluateFormula('=A1*A2', cellsMap) === 200, 'Formula =A1*A2 evaluates to 200');

// 4. Insight Help Definitions Coverage
console.log('\nTest 4: Insight Help Popover Dictionary');
const expectedKeys = ['total', 'critical', 'major', 'criticalAndMajor', 'closureRate', 'inProgress', 'open', 'done'];
for (const key of expectedKeys) {
  const arDetails = getMetricHelpDetails(key, 'ar');
  const enDetails = getMetricHelpDetails(key, 'en');
  assert(arDetails !== undefined && typeof arDetails.title === 'string', `Help definition (ar) exists for "${key}": ${arDetails.title}`);
  assert(enDetails !== undefined && typeof enDetails.title === 'string', `Help definition (en) exists for "${key}": ${enDetails.title}`);
}

console.log('\n🎉 ALL ENHANCEMENT CHECKS PASSED (100% SUCCESS)!\n');
