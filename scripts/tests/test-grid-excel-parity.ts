/**
 * EXCEL PARITY TEST SUITE FOR SPREADSHEET GRID
 *
 * Verifies:
 * 1. Autofill with relative references (=A1+B1 shifted down/right).
 * 2. Autofill with absolute references (=$D$1 preserved).
 * 3. Autofill with mixed references (=$A1 or =A$1 shifted correctly).
 * 4. Circular reference detection produces '#CIRCULAR!'.
 * 5. Division by zero produces '#DIV/0!'.
 * 6. Numeric 0 vs empty string "" distinction.
 */

import assert from 'node:assert';
import { executeAutofill } from '../../lib/grid/autofill-engine';
import { evaluateFormula, adjustFormula } from '../../lib/grid/formula-parser';

console.log('--- Testing Excel Parity in Grid Engine ---');

// Test 1: adjustFormula vertical relative shift
const f1 = adjustFormula('=B1*2', 1, 0);
assert.strictEqual(f1, '=B2*2', 'Relative reference shifted down by 1 row');

const f2 = adjustFormula('=B1*2', 3, 0);
assert.strictEqual(f2, '=B4*2', 'Relative reference shifted down by 3 rows');

// Test 2: adjustFormula horizontal relative shift
const f3 = adjustFormula('=A1+B1', 0, 1);
assert.strictEqual(f3, '=B1+C1', 'Relative reference shifted right by 1 col');

// Test 3: adjustFormula absolute references
const f4 = adjustFormula('=$D$1*2', 2, 2);
assert.strictEqual(f4, '=$D$1*2', 'Absolute reference $D$1 is locked across rows and cols');

// Test 4: adjustFormula mixed references
const f5 = adjustFormula('=$A1+B$2', 2, 2);
assert.strictEqual(f5, '=$A3+D$2', 'Mixed reference: column A locked, row 2 locked');

// Test 5: executeAutofill vertical with formulas
const currentGrid = {
  A1: 10, B1: 20, C1: '=A1+B1',
  A2: 15, B2: 25,
  A3: 100, B3: 200,
};

const res = executeAutofill({
  sourceRange: { startCol: 'C', startRow: 1, endCol: 'C', endRow: 1 },
  targetRange: { startCol: 'C', startRow: 1, endCol: 'C', endRow: 3 },
  currentGridData: currentGrid,
});

assert.strictEqual(res.newCells['C2'], '=A2+B2', 'Row 2 formula shifted relatively');
assert.strictEqual(res.newCells['C3'], '=A3+B3', 'Row 3 formula shifted relatively');

// Test 6: Formula evaluation with circular reference
const cellMap: Record<string, any> = {
  A1: '=B1',
  B1: '=A1',
};
const evalA1 = evaluateFormula('=B1', (c) => cellMap[c]);
assert.strictEqual(evalA1, '#CIRCULAR!', 'Direct circular ref detected as #CIRCULAR!');

// Test 7: Formula evaluation with Division by zero
const evalDivZero1 = evaluateFormula('=10/0', {});
const evalDivZero2 = evaluateFormula('=10/(5-5)', {});
assert.strictEqual(evalDivZero1, '#DIV/0!', '=10/0 produces #DIV/0!');
assert.strictEqual(evalDivZero2, '#DIV/0!', '=10/(5-5) produces #DIV/0!');

// Test 8: Empty vs 0 distinction
const emptyMap: Record<string, any> = {
  A1: 0,
  B1: '',
};
const evalZero = evaluateFormula('=A1', emptyMap);
const evalEmpty = evaluateFormula('=B1', emptyMap);
assert.strictEqual(evalZero, 0, 'Referencing cell with 0 yields numeric 0');
assert.strictEqual(evalEmpty, '', 'Referencing empty cell yields empty string');

console.log('✅ ALL EXCEL PARITY GRID TESTS PASSED!');
