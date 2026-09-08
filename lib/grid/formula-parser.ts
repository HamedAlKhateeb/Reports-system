/**
 * SAFE EXCEL-LIKE FORMULA PARSER & EVALUATION ENGINE
 * 
 * Features:
 * - Pure TypeScript AST & recursive descent parser (ZERO eval, ZERO new Function).
 * - Supported Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, AND, OR.
 * - Operators: +, -, *, /, =, <>, <, <=, >, >=.
 * - Cell References: Relative (A1), Absolute ($A$1), Mixed ($A1, A$1).
 * - Ranges: A1:A10, B2:E8.
 * - Circular Dependency Detection (via visited cell chain).
 * - Relative reference shifting for Autofill & Copy (adjustFormula).
 * - Excel Error Values: #REF!, #VALUE!, #DIV/0!, #NAME?, #CIRCULAR!, #N/A.
 */

export type ExcelError = '#REF!' | '#VALUE!' | '#DIV/0!' | '#NAME?' | '#CIRCULAR!' | '#N/A';

export const FORMULA_ERROR_PREFIX = '#';

/**
 * Excel error sentinel values used across editor, exports and shared reports.
 * Errors are plain strings prefixed with '#' so consumers can detect them
 * via isFormulaError() instead of string.startsWith (which would also match
 * user text like "#hashtag").
 */
export const ERROR_VALUES = {
  REF: '#REF!',
  VALUE: '#VALUE!',
  DIV0: '#DIV/0!',
  NAME: '#NAME?',
  CIRCULAR: '#CIRCULAR!',
  NA: '#N/A',
  ERROR: '#ERROR!',
} as const;

export function isFormulaError(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith(FORMULA_ERROR_PREFIX) &&
    (Object.values(ERROR_VALUES) as string[]).includes(value)
  );
}

export interface CellCoord {
  colName: string;      // e.g. 'A'
  colIndex: number;     // 0-indexed (A -> 0)
  rowNumber: number;    // 1-indexed (1, 2, 3...)
  rowIndex: number;     // 0-indexed (rowNumber - 1)
  isColFixed: boolean;  // true if $A
  isRowFixed: boolean;  // true if $1
}

/**
 * Converts 0-indexed column number to Excel column letter (0 -> 'A', 25 -> 'Z', 26 -> 'AA')
 */
export function colIndexToName(colIdx: number): string {
  if (colIdx < 0) return '#REF!';
  let name = '';
  let n = colIdx;
  while (n >= 0) {
    name = String.fromCharCode((n % 26) + 65) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/**
 * Converts Excel column letter to 0-indexed column number ('A' -> 0, 'Z' -> 25, 'AA' -> 26)
 */
export function colNameToIndex(colName: string): number {
  const upper = colName.toUpperCase().replace(/[^A-Z]/g, '');
  if (!upper) return -1;
  let idx = 0;
  for (let i = 0; i < upper.length; i++) {
    idx = idx * 26 + (upper.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * Parses a cell reference like "A1", "$A$1", "$B3", "C$4"
 */
export function parseCellRef(ref: string): CellCoord | null {
  const match = ref.trim().match(/^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/);
  if (!match) return null;

  const isColFixed = match[1] === '$';
  const colName = match[2].toUpperCase();
  const isRowFixed = match[3] === '$';
  const rowNumber = parseInt(match[4], 10);
  const colIndex = colNameToIndex(colName);
  const rowIndex = rowNumber - 1;

  if (colIndex < 0 || rowNumber < 1) return null;

  return {
    colName,
    colIndex,
    rowNumber,
    rowIndex,
    isColFixed,
    isRowFixed,
  };
}

/**
 * Safety cap on range expansion so a typo like =SUM(A1:ZZZ999999) can never
 * freeze the editor by materializing millions of coordinates.
 */
const MAX_RANGE_CELLS = 10000;

/**
 * Expands a range like "A1:B3" into a flat list of cell coordinates ["A1", "A2", "A3", "B1", "B2", "B3"]
 * Returns [] when the range is invalid or absurdly large (crash prevention).
 */
export function expandRange(rangeStr: string): string[] {
  const parts = rangeStr.split(':');
  if (parts.length !== 2) return [];

  const start = parseCellRef(parts[0]);
  const end = parseCellRef(parts[1]);
  if (!start || !end) return [];

  const minCol = Math.min(start.colIndex, end.colIndex);
  const maxCol = Math.max(start.colIndex, end.colIndex);
  const minRow = Math.min(start.rowNumber, end.rowNumber);
  const maxRow = Math.max(start.rowNumber, end.rowNumber);

  const totalCells = (maxCol - minCol + 1) * (maxRow - minRow + 1);
  if (totalCells > MAX_RANGE_CELLS) return [];

  const result: string[] = [];
  for (let c = minCol; c <= maxCol; c++) {
    const colStr = colIndexToName(c);
    for (let r = minRow; r <= maxRow; r++) {
      result.push(`${colStr}${r}`);
    }
  }
  return result;
}

/**
 * Adjusts relative cell references in a formula string when copied or dragged by (dRow, dCol).
 * Absolute references ($A$1) are preserved unchanged.
 */
export function adjustFormula(formula: string, dRow: number, dCol: number): string {
  if (!formula.startsWith('=')) return formula;

  // Regex matches cell references like $A$1, A$1, $A1, A1, with optional range colons
  const cellRegex = /(\$?)([A-Za-z]+)(\$?)([0-9]+)/g;

  return formula.replace(cellRegex, (match, colPrefix, colLetters, rowPrefix, rowDigits) => {
    const isColAbsolute = colPrefix === '$';
    const isRowAbsolute = rowPrefix === '$';

    let colIdx = colNameToIndex(colLetters);
    let rowNum = parseInt(rowDigits, 10);

    if (!isColAbsolute) {
      colIdx += dCol;
    }
    if (!isRowAbsolute) {
      rowNum += dRow;
    }

    if (colIdx < 0 || rowNum < 1) {
      return '#REF!';
    }

    const newColName = colIndexToName(colIdx);
    return `${isColAbsolute ? '$' : ''}${newColName}${isRowAbsolute ? '$' : ''}${rowNum}`;
  });
}

/**
 * Extracts every cell coordinate referenced by a formula (including both
 * endpoints of ranges). Used for formula-reference highlighting and
 * dependency tracking. Invalid/unknown tokens are ignored.
 */
export function extractFormulaRefs(formula: string): string[] {
  if (!formula || !formula.startsWith('=')) return [];
  const refs = new Set<string>();
  const cellRegex = /\$?([A-Za-z]+)\$?([0-9]+)/g;
  let match: RegExpExecArray | null;
  while ((match = cellRegex.exec(formula)) !== null) {
    const colName = match[1].toUpperCase();
    const rowNum = parseInt(match[2], 10);
    if (colNameToIndex(colName) >= 0 && rowNum >= 1) {
      refs.add(`${colName}${rowNum}`);
    }
  }
  return Array.from(refs);
}

/**
 * Remaps every cell reference in a formula through a coordinate transform.
 * Used when rows/columns are inserted/deleted (shift semantics) and when the
 * table is transposed (swap semantics).
 *
 * - If `mapRef` returns null, the reference becomes #REF! (deleted source).
 * - String literals inside double quotes are never touched.
 * - Identifiers that are not valid cell refs (e.g. SUM, IF) are preserved.
 */
export function remapFormulaRefs(
  formula: string,
  mapRef: (colIndex: number, rowIndex: number) => { colIndex: number; rowIndex: number } | null
): string {
  if (!formula || !formula.startsWith('=')) return formula;

  // Protect quoted strings from rewriting by temporarily replacing them.
  const strings: string[] = [];
  let working = formula.replace(/"([^"]*)"/g, (_m, s: string) => {
    strings.push(s as string);
    return `"§S${strings.length - 1}§"`;
  });

  const cellRegex = /(\$?)([A-Za-z]+)(\$?)([0-9]+)/g;
  working = working.replace(
    cellRegex,
    (match, colPrefix: string, colLetters: string, rowPrefix: string, rowDigits: string) => {
      const colIdx = colNameToIndex(colLetters);
      const rowNum = parseInt(rowDigits, 10);
      if (colIdx < 0 || rowNum < 1 || !parseCellRef(colLetters + rowDigits)) {
        return match; // Not a valid cell reference (function name etc.) - keep as-is
      }
      const mapped = mapRef(colIdx, rowNum - 1);
      if (!mapped) return ERROR_VALUES.REF;
      const newColName = colIndexToName(mapped.colIndex);
      const newRowNum = mapped.rowIndex + 1;
      if (!newColName || newColName.startsWith('#') || newRowNum < 1) return ERROR_VALUES.REF;
      return `${colPrefix}${newColName}${rowPrefix}${newRowNum}`;
    }
  );

  // Restore quoted strings.
  working = working.replace(/§S(\d+)§/g, (_m, i: string) => strings[parseInt(i, 10)] ?? '');
  return working;
}

// ==========================================
// TOKENIZER & PARSER
// ==========================================

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'CELL_REF'
  | 'RANGE'
  | 'FUNCTION'
  | 'OPERATOR'
  | 'COMMA'
  | 'LPAREN'
  | 'RPAREN'
  | 'ERROR_VALUE'
  | 'EOF';

interface Token {
  type: TokenType;
  value: any;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const str = input.startsWith('=') ? input.slice(1).trim() : input.trim();

  while (i < str.length) {
    const ch = str[i];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Excel error sentinels (#REF!, #VALUE!, #DIV/0!, #NAME?, #CIRCULAR!, #N/A, #ERROR!)
    // must survive tokenization so remapped formulas like "=#REF!*500" evaluate
    // to the error itself instead of crashing or producing garbage.
    if (ch === '#') {
      const rest = str.slice(i);
      const sentinel = (Object.values(ERROR_VALUES) as string[]).find(
        (err) => rest.startsWith(err)
      );
      if (sentinel) {
        tokens.push({ type: 'ERROR_VALUE', value: sentinel });
        i += sentinel.length;
        continue;
      }
    }

    // Number literal
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(str[i + 1] || ''))) {
      let numStr = '';
      while (i < str.length && (/[0-9]/.test(str[i]) || str[i] === '.')) {
        numStr += str[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
      continue;
    }

    // String literal in double quotes
    if (ch === '"') {
      let s = '';
      i++;
      while (i < str.length && str[i] !== '"') {
        s += str[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: s });
      continue;
    }

    // Punctuation
    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'COMMA', value: ',' });
      i++;
      continue;
    }

    // Comparison Operators (<=, >=, <>, =, <, >)
    if (ch === '<' || ch === '>') {
      const next = str[i + 1];
      if (ch === '<' && (next === '=' || next === '>')) {
        tokens.push({ type: 'OPERATOR', value: ch + next });
        i += 2;
        continue;
      }
      if (ch === '>' && next === '=') {
        tokens.push({ type: 'OPERATOR', value: '>=' });
        i += 2;
        continue;
      }
      tokens.push({ type: 'OPERATOR', value: ch });
      i++;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'OPERATOR', value: '=' });
      i++;
      continue;
    }

    // Arithmetic Operators (+, -, *, /) and text concatenation (&)
    if (['+', '-', '*', '/'].includes(ch)) {
      tokens.push({ type: 'OPERATOR', value: ch });
      i++;
      continue;
    }
    if (ch === '&') {
      tokens.push({ type: 'OPERATOR', value: '&' });
      i++;
      continue;
    }

    // Identifiers: Function names, Cell references, Ranges, Booleans
    if (/[A-Za-z$]/.test(ch)) {
      let ident = '';
      while (i < str.length && /[A-Za-z0-9_$:.]/.test(str[i])) {
        ident += str[i];
        i++;
      }

      const upper = ident.toUpperCase();

      // Range check: contains ':'
      if (ident.includes(':')) {
        tokens.push({ type: 'RANGE', value: upper });
        continue;
      }

      // Boolean check
      if (upper === 'TRUE') {
        tokens.push({ type: 'BOOLEAN', value: true });
        continue;
      }
      if (upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: false });
        continue;
      }

      // Peek if followed by '(' -> Function call
      let j = i;
      while (j < str.length && /\s/.test(str[j])) j++;
      if (str[j] === '(') {
        tokens.push({ type: 'FUNCTION', value: upper });
        continue;
      }

      // Check if valid cell ref
      if (parseCellRef(ident)) {
        tokens.push({ type: 'CELL_REF', value: upper });
        continue;
      }

      // Otherwise generic cell/variable identifier
      tokens.push({ type: 'CELL_REF', value: upper });
      continue;
    }

    // Unknown character, skip
    i++;
  }

  tokens.push({ type: 'EOF', value: null });
  return tokens;
}

// ==========================================
// RECURSIVE DESCENT EVALUATOR
// ==========================================

export class FormulaEvaluator {
  private tokens: Token[] = [];
  private pos = 0;
  private visitedCells: Set<string>;
  private getCellValue: (cellCoord: string) => any;

  constructor(
    getCellValue: (cellCoord: string) => any,
    visitedCells: Set<string> = new Set()
  ) {
    this.getCellValue = getCellValue;
    this.visitedCells = visitedCells;
  }

  public evaluate(formulaString: string): any {
    if (!formulaString) return '';
    const clean = formulaString.toString().trim();
    if (!clean.startsWith('=')) {
      // Non-formula literal
      const num = Number(clean);
      return !isNaN(num) && clean !== '' ? num : clean;
    }

    try {
      this.tokens = tokenize(clean);
      this.pos = 0;
      const result = this.parseComparison();
      if (this.current().type !== 'EOF') {
        // Trailing garbage after a complete expression (e.g. "=C2 D2")
        return ERROR_VALUES.VALUE;
      }
      return result;
    } catch (err: any) {
      if (typeof err === 'string' && err.startsWith('#')) return err;
      return ERROR_VALUES.VALUE;
    }
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: null };
  }

  private consume(expectedType?: TokenType): Token {
    const t = this.current();
    if (expectedType && t.type !== expectedType) {
      throw '#VALUE!';
    }
    this.pos++;
    return t;
  }

  // Comparison: =, <>, <, <=, >, >=
  private parseComparison(): any {
    let left = this.parseAdditive();

    while (this.current().type === 'OPERATOR' && ['=', '<>', '<', '<=', '>', '>='].includes(this.current().value)) {
      const op = this.consume().value;
      const right = this.parseAdditive();

      if (isFormulaError(left)) return left;
      if (isFormulaError(right)) return right;

      switch (op) {
        case '=':
          left = left === right;
          break;
        case '<>':
          left = left !== right;
          break;
        case '<':
          left = left < right;
          break;
        case '<=':
          left = left <= right;
          break;
        case '>':
          left = left > right;
          break;
        case '>=':
          left = left >= right;
          break;
      }
    }
    return left;
  }

  // Additive: +, -
  private parseAdditive(): any {
    let left = this.parseConcatenation();

    while (this.current().type === 'OPERATOR' && (this.current().value === '+' || this.current().value === '-')) {
      const op = this.consume().value;
      const right = this.parseConcatenation();

      if (isFormulaError(left)) return left;
      if (isFormulaError(right)) return right;

      const numL = Number(left);
      const numR = Number(right);
      if (left === '' || right === '' || isNaN(numL) || isNaN(numR)) {
        if (typeof left !== 'string' || typeof right !== 'string') return ERROR_VALUES.VALUE;
        // Excel cannot add text values arithmetically
        return ERROR_VALUES.VALUE;
      }

      if (op === '+') left = numL + numR;
      else left = numL - numR;
    }
    return left;
  }

  // Concatenation: & (text join, e.g. ="Total: "&A1)
  private parseConcatenation(): any {
    let left = this.parseMultiplicative();

    while (this.current().type === 'OPERATOR' && this.current().value === '&') {
      this.consume();
      const right = this.parseMultiplicative();

      if (isFormulaError(left)) return left;
      if (isFormulaError(right)) return right;

      left = `${left === null || left === undefined ? '' : left}${right === null || right === undefined ? '' : right}`;
    }
    return left;
  }

  // Multiplicative: *, /
  private parseMultiplicative(): any {
    let left = this.parsePrimary();

    while (this.current().type === 'OPERATOR' && (this.current().value === '*' || this.current().value === '/')) {
      const op = this.consume().value;
      const right = this.parsePrimary();

      if (isFormulaError(left)) return left;
      if (isFormulaError(right)) return right;

      const numL = Number(left);
      const numR = Number(right);
      if (left === '' || right === '' || isNaN(numL) || isNaN(numR)) return ERROR_VALUES.VALUE;

      if (op === '*') {
        left = numL * numR;
      } else {
        if (numR === 0) return ERROR_VALUES.DIV0;
        left = numL / numR;
      }
    }
    return left;
  }

  // Primary: literals, cell values, range values, parentheses, functions
  private parsePrimary(): any {
    const t = this.current();

    // Unary plus/minus
    if (t.type === 'OPERATOR' && (t.value === '+' || t.value === '-')) {
      const op = this.consume().value;
      const val = this.parsePrimary();
      return op === '-' ? -Number(val) : Number(val);
    }

    // Number literal
    if (t.type === 'NUMBER') {
      return this.consume().value;
    }

    // Excel error sentinel produced by reference remapping (=#REF!*500)
    if (t.type === 'ERROR_VALUE') {
      return this.consume().value;
    }

    // String literal
    if (t.type === 'STRING') {
      return this.consume().value;
    }

    // Boolean literal
    if (t.type === 'BOOLEAN') {
      return this.consume().value;
    }

    // Parentheses (expr)
    if (t.type === 'LPAREN') {
      this.consume('LPAREN');
      const val = this.parseComparison();
      this.consume('RPAREN');
      return val;
    }

    // Cell Reference
    if (t.type === 'CELL_REF') {
      const ref = this.consume().value;
      return this.resolveCell(ref);
    }

    // Range Reference (when encountered as single argument, expand to array)
    if (t.type === 'RANGE') {
      const rangeStr = this.consume().value;
      return this.resolveRange(rangeStr);
    }

    // Function Call: SUM(A1:A5), IF(B1 > 10, "High", "Low")
    if (t.type === 'FUNCTION') {
      const fnName = this.consume().value;
      this.consume('LPAREN');
      const args: any[] = [];
      if (this.current().type !== 'RPAREN') {
        while (true) {
          args.push(this.parseComparison());
          if (this.current().type === 'COMMA') {
            this.consume('COMMA');
          } else {
            break;
          }
        }
      }
      this.consume('RPAREN');
      return this.executeFunction(fnName, args);
    }

    throw '#VALUE!';
  }

  // Resolve a single cell coordinate value with circular reference protection
  private resolveCell(cellRef: string): any {
    const norm = cellRef.replace(/\$/g, '').toUpperCase();
    if (this.visitedCells.has(norm)) {
      return '#CIRCULAR!';
    }

    let raw: any;
    try {
      raw = this.getCellValue(norm);
    } catch {
      return '#REF!';
    }
    if (raw === null || raw === undefined || raw === '') return '';

    // If the referenced cell is itself a formula, evaluate it recursively
    if (typeof raw === 'string' && raw.startsWith('=')) {
      // Guard against pathological recursion depth (deep dependency chains)
      if (this.visitedCells.size > 500) return '#CIRCULAR!';
      const nextVisited = new Set(this.visitedCells);
      nextVisited.add(norm);
      const subEval = new FormulaEvaluator(this.getCellValue, nextVisited);
      return subEval.evaluate(raw);
    }

    const num = Number(raw);
    return !isNaN(num) && typeof raw !== 'boolean' ? num : raw;
  }

  // Resolve range into array of values
  private resolveRange(rangeStr: string): any[] {
    const cells = expandRange(rangeStr);
    return cells.map((c) => this.resolveCell(c));
  }

  // Flatten nested arrays and ranges for aggregate functions
  private flattenArgs(args: any[]): any[] {
    const flat: any[] = [];
    for (const a of args) {
      if (Array.isArray(a)) {
        flat.push(...this.flattenArgs(a));
      } else {
        flat.push(a);
      }
    }
    return flat;
  }

  // Execute built-in Excel function
  private executeFunction(fnName: string, args: any[]): any {
    const upper = fnName.toUpperCase();
    const flat = this.flattenArgs(args);

    // Propagate errors (any Excel error sentinel returned upstream wins)
    for (const v of flat) {
      if (isFormulaError(v)) {
        return v;
      }
    }

    switch (upper) {
      case 'SUM': {
        return flat.reduce((acc, curr) => {
          if (curr === '' || curr === null || curr === undefined || typeof curr === 'boolean') return acc;
          const n = Number(curr);
          return acc + (!isNaN(n) ? n : 0);
        }, 0);
      }

      case 'AVERAGE': {
        const nums = flat
          .filter((v) => typeof v !== 'boolean' && v !== '' && v !== null && v !== undefined)
          .map(Number)
          .filter((n) => !isNaN(n));
        if (nums.length === 0) return '#DIV/0!';
        const sum = nums.reduce((a, b) => a + b, 0);
        return sum / nums.length;
      }

      case 'MIN': {
        const nums = flat
          .filter((v) => typeof v !== 'boolean' && v !== '' && v !== null && v !== undefined)
          .map(Number)
          .filter((n) => !isNaN(n));
        if (nums.length === 0) return 0;
        return Math.min(...nums);
      }

      case 'MAX': {
        const nums = flat
          .filter((v) => typeof v !== 'boolean' && v !== '' && v !== null && v !== undefined)
          .map(Number)
          .filter((n) => !isNaN(n));
        if (nums.length === 0) return 0;
        return Math.max(...nums);
      }

      case 'COUNT': {
        // Counts only numeric values
        return flat.filter((v) => typeof v === 'number' || (!isNaN(Number(v)) && v !== '' && typeof v !== 'boolean')).length;
      }

      case 'COUNTA': {
        // Counts non-empty values
        return flat.filter((v) => v !== '' && v !== null && v !== undefined).length;
      }

      case 'IF': {
        const condition = args[0];
        if (isFormulaError(condition)) return condition;
        const valIfTrue = args[1] !== undefined ? args[1] : true;
        const valIfFalse = args[2] !== undefined ? args[2] : false;
        return Boolean(condition) ? valIfTrue : valIfFalse;
      }

      case 'AND': {
        return args.every(Boolean);
      }

      case 'OR': {
        return args.some(Boolean);
      }

      case 'ROUND': {
        const value = Number(args[0]);
        const digits = args[1] !== undefined ? Number(args[1]) : 0;
        if (isNaN(value)) return '#VALUE!';
        const factor = Math.pow(10, isNaN(digits) ? 0 : digits);
        return Math.round(value * factor) / factor;
      }

      default:
        return '#NAME?';
    }
  }
}

/**
 * Convenience helper to evaluate a formula given a dictionary of cell coordinates
 * Example: evaluateFormula("=SUM(A1:A3)", { A1: 10, A2: 20, A3: 30 }) => 60
 */
export function evaluateFormula(
  formulaStr: string,
  cells: Record<string, any> | ((cell: string) => any)
): any {
  const getVal: (cellCoord: string) => any =
    typeof cells === 'function'
      ? (c: string) => (cells as any)(c)
      : (c: string) => cells[c.toUpperCase()];
  const evaluator = new FormulaEvaluator(getVal);
  return evaluator.evaluate(formulaStr);
}
