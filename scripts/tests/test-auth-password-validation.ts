import { evaluateAccountPassword, firstPasswordFailure } from '../../lib/password-policy';

console.log('=== TEST SUITE: Password Policy & Validation ===');

// 1. Valid password
const valid = 'CorrectHorse!123';
const evValid = evaluateAccountPassword(valid);
console.log('Test 1: Valid password passes:', evValid.passed === true ? '[PASS]' : '[FAIL]');
console.log('  Score:', evValid.score, 'Strength:', evValid.strengthEn);

// 2. Too short (< 8 chars)
const shortPass = 'Ab!1';
const evShort = evaluateAccountPassword(shortPass);
const failShortAr = firstPasswordFailure(shortPass, 'ar');
console.log('Test 2: Short password fails:', evShort.passed === false ? '[PASS]' : '[FAIL]');
console.log('  Failure message (Ar):', failShortAr);

// 3. No digit
const noDigit = 'Abcdefgh!@#';
const evNoDigit = evaluateAccountPassword(noDigit);
console.log('Test 3: No digit fails:', evNoDigit.passed === false ? '[PASS]' : '[FAIL]');

// 4. No symbol
const noSymbol = 'Abcdefgh1234';
const evNoSymbol = evaluateAccountPassword(noSymbol);
console.log('Test 4: No symbol fails:', evNoSymbol.passed === false ? '[PASS]' : '[FAIL]');

// 5. Common password
const common = 'password123';
const evCommon = evaluateAccountPassword(common);
console.log('Test 5: Common password fails:', evCommon.passed === false ? '[PASS]' : '[FAIL]');

// 6. Contains whitespace
const hasSpace = 'Abcdefgh !123';
const evSpace = evaluateAccountPassword(hasSpace);
console.log('Test 6: Has space fails:', evSpace.passed === false ? '[PASS]' : '[FAIL]');

// 7. Arabic password with digit and symbol
const arabicPass = 'كلمةمرور#١٢٣٤';
const evArabic = evaluateAccountPassword(arabicPass);
console.log('Test 7: Arabic password passes:', evArabic.passed === true ? '[PASS]' : '[FAIL]');

if (
  evValid.passed &&
  !evShort.passed &&
  !evNoDigit.passed &&
  !evNoSymbol.passed &&
  !evCommon.passed &&
  !evSpace.passed &&
  evArabic.passed
) {
  console.log('\nAll password policy tests PASSED!');
  process.exit(0);
} else {
  console.error('\nSome password tests failed!');
  process.exit(1);
}
