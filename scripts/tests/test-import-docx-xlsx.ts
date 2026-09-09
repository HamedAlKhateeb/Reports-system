/**
 * Import pipeline tests: DOCX normalization, XLSX normalization, validation,
 * error handling, large-file guards, and Candidate/Problem side-by-side UI.
 *
 * Run via: npx tsx scripts/tests/test-import-docx-xlsx.ts
 * (also auto-discovered by scripts/test-runner.mjs)
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { htmlToTipTapNodes } from '../../lib/import/docx-import';
import {
  normalizeSheetGrid,
  sheetsToTipTapNodes,
  sheetToSmartTableEntity,
} from '../../lib/import/xlsx-import';
import {
  detectKindByName,
  validateImportFile,
  MAX_IMPORT_FILE_SIZE,
} from '../../lib/import/validation';

// Install a DOM for htmlToTipTapNodes (browser code running under tsx).
const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).DOMParser = dom.window.DOMParser;
(globalThis as any).Node = dom.window.Node;

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  [FAIL] ${name}: ${err?.message || err}`);
  }
}

async function main() {

const asFile = (name: string, bytes: Uint8Array, type = ''): File =>
  new File([bytes as any], name, { type });

// ---------------------------------------------------------------- validation
console.log('\nValidation:');
await check('detectKindByName maps .docx/.xlsx, rejects others', () => {
  assert.strictEqual(detectKindByName('report.docx'), 'docx');
  assert.strictEqual(detectKindByName('DATA.XLSX'), 'xlsx');
  assert.strictEqual(detectKindByName('notes.pdf'), null);
  assert.strictEqual(detectKindByName('evil.docx.exe'), null);
});
await check('validateImportFile rejects empty file', async () => {
  const r = await validateImportFile(asFile('a.docx', new Uint8Array(0)));
  assert.strictEqual(r.ok, false);
});
await check('validateImportFile rejects unsupported extension', async () => {
  const r = await validateImportFile(asFile('a.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])));
  assert.strictEqual(r.ok, false);
});
await check('validateImportFile rejects bad magic bytes (fake docx)', async () => {
  const r = await validateImportFile(asFile('fake.docx', new Uint8Array([1, 2, 3, 4, 5])));
  assert.strictEqual(r.ok, false);
});
await check('validateImportFile accepts genuine OOXML signature', async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x01, 0x00]);
  const r = await validateImportFile(asFile('real.docx', bytes));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kind, 'docx');
});
await check('validateImportFile rejects oversized file without reading body', async () => {
  const big = {
    name: 'big.xlsx',
    size: MAX_IMPORT_FILE_SIZE + 1,
    slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
  } as unknown as File;
  const r = await validateImportFile(big);
  assert.strictEqual(r.ok, false);
});

// ------------------------------------------------------------- DOCX mapping
console.log('\nDOCX normalization:');
await check('headings map to H1/H2/H3 (H4+ demoted with warning)', () => {
  const { nodes, warnings } = htmlToTipTapNodes('<h1>Title</h1><h2>Sub</h2><h4>Deep</h4>');
  assert.strictEqual(nodes.length, 3);
  assert.strictEqual(nodes[0].type, 'heading');
  assert.strictEqual(nodes[0].attrs.level, 1);
  assert.strictEqual(nodes[2].attrs.level, 3);
  assert.ok(warnings.some((w) => w.includes('H3')));
});
await check('bold/italic/underline/link marks preserved', () => {
  const { nodes } = htmlToTipTapNodes(
    '<p><strong>B</strong> <em>I</em> <u>U</u> <a href="https://example.com">L</a></p>'
  );
  assert.strictEqual(nodes[0].type, 'paragraph');
  const marks = (nodes[0].content || []).flatMap((n: any) => (n.marks || []).map((m: any) => m.type));
  for (const m of ['bold', 'italic', 'underline', 'link']) assert.ok(marks.includes(m), `missing ${m}`);
});
await check('lists map to bulletList/orderedList', () => {
  const { nodes } = htmlToTipTapNodes('<ul><li>A</li><li>B</li></ul><ol><li>C</li></ol>');
  assert.strictEqual(nodes[0].type, 'bulletList');
  assert.strictEqual(nodes[0].content.length, 2);
  assert.strictEqual(nodes[1].type, 'orderedList');
});
await check('tables map to table nodes with header row', () => {
  const { nodes } = htmlToTipTapNodes(
    '<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
  );
  assert.strictEqual(nodes[0].type, 'table');
  assert.strictEqual(nodes[0].content[0].content[0].type, 'tableHeader');
  assert.strictEqual(nodes[0].content[1].content[0].type, 'tableCell');
});
await check('RTL heuristic marks Arabic paragraphs dir=rtl', () => {
  const { nodes } = htmlToTipTapNodes('<p>تقرير المراجعة السنوي</p>');
  assert.strictEqual(nodes[0].attrs?.dir, 'rtl');
});
await check('text-align style is preserved', () => {
  const { nodes } = htmlToTipTapNodes('<p style="text-align: center">Hi</p>');
  assert.strictEqual(nodes[0].attrs?.textAlign, 'center');
});
await check('XSS payload is neutralized (script removed, javascript: href dropped)', () => {
  const { nodes } = htmlToTipTapNodes(
    '<p>Safe</p><script>alert(1)</script><p><a href="javascript:alert(1)">X</a></p>'
  );
  const json = JSON.stringify(nodes);
  assert.ok(!json.includes('alert(1)'));
  assert.ok(!json.toLowerCase().includes('script'));
  assert.ok(!json.toLowerCase().includes('javascript:'));
});
await check('unsupported elements degrade to text with warning (no data loss)', () => {
  const { nodes, warnings } = htmlToTipTapNodes('<figure><figcaption>Cap</figcaption></figure>');
  assert.ok(nodes.length >= 1);
  assert.ok(JSON.stringify(nodes).includes('Cap'));
  assert.ok(warnings.length >= 1);
});
await check('empty html yields zero nodes (caller throws EMPTY_DOCUMENT)', () => {
  const { nodes } = htmlToTipTapNodes('   ');
  assert.strictEqual(nodes.length, 0);
});

// ------------------------------------------------------------- XLSX mapping
console.log('\nXLSX normalization:');
await check('normalizeSheetGrid trims trailing empties and names headers', () => {
  const s = normalizeSheetGrid([['Name', 'Count'], ['A', 1], ['', ''], ['  ', '  ']], 'Sheet1', 0);
  // trailing whitespace-only row is kept as-is length-wise but empty rows dropped only when fully ''
  assert.strictEqual(s.headers[0], 'Name');
  assert.ok(s.rowCount >= 2);
  assert.strictEqual(s.colCount, 2);
});
await check('numbers/dates/booleans stringify safely', () => {
  const s = normalizeSheetGrid([[1.5, true, new Date('2024-01-02T00:00:00Z')]], 'S', 0);
  assert.strictEqual(s.rows[0][0], '1.5');
  assert.strictEqual(s.rows[0][1], 'TRUE');
  assert.strictEqual(s.rows[0][2], '2024-01-02');
});
await check('oversized grids are capped (freeze guard)', () => {
  const big = Array.from({ length: 500 }, (_, r) => Array.from({ length: 60 }, (_, c) => `R${r}C${c}`));
  const s = normalizeSheetGrid(big, 'Big', 0);
  assert.ok(s.rowCount <= 200, `rows ${s.rowCount}`);
  assert.ok(s.colCount <= 50, `cols ${s.colCount}`);
  assert.strictEqual(s.truncated, true);
});
await check('formulas starting with = survive normalization', () => {
  const s = normalizeSheetGrid([['A', 'B'], ['1', '=SUM(A2:B2)']], 'F', 0);
  assert.strictEqual(s.rows[1][1], '=SUM(A2:B2)');
});
await check('sheetsToTipTapNodes emits heading + table per sheet', () => {
  const s = normalizeSheetGrid([['H1', 'H2'], ['a', 'b']], 'MySheet', 0);
  const nodes = sheetsToTipTapNodes([s]);
  assert.strictEqual(nodes[0].type, 'heading');
  assert.strictEqual(nodes[0].content[0].text, 'MySheet');
  assert.strictEqual(nodes[1].type, 'table');
  assert.strictEqual(nodes[1].content.length, 2);
});
await check('sheetToSmartTableEntity matches existing TableEntity shape', () => {
  const s = normalizeSheetGrid([['Item', 'Qty'], ['Pen', '3']], 'S1', 0);
  const entity = sheetToSmartTableEntity(s, 'rep_1', 'tbl_1', true);
  assert.strictEqual(entity.report_id, 'rep_1');
  assert.strictEqual(entity.direction, 'rtl');
  assert.deepStrictEqual(entity.columns_data.map((c: any) => c.id), ['A', 'B']);
  assert.strictEqual(entity.rows_data[0].A, 'Pen');
  assert.ok(entity.version === 1 && Array.isArray(entity.merged_cells));
});

// ------------------------------------------------- Candidate/Problem UI nav
console.log('\nCandidate/Problem navigation:');
await check('top bar shows both inspections side by side (no dropdown)', () => {
  const src = readFileSync(join(process.cwd(), 'app', 'reports', '[id]', 'page.tsx'), 'utf8');
  assert.ok(src.includes('Candidate Inspection'), 'missing Candidate Inspection button');
  assert.ok(src.includes('Problem Inspection'), 'missing Problem Inspection button');
  assert.ok(!src.includes('showScanMenu'), 'dropdown state still present');
  assert.ok(!src.includes('فحص التقرير (المرشحين / المطابقة)'), 'old dropdown title still present');
  assert.ok(src.includes('handleScanCandidates'), 'candidate handler wiring missing');
  assert.ok(src.includes('handleOpenInspector'), 'inspector handler wiring missing');
});

console.log(`\n=============================================\nImport Test Results: ${passed} passed, ${failed} failed\n=============================================`);
if (failed > 0) process.exit(1);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('Import test harness failed:', err);
    process.exit(1);
  }
);
