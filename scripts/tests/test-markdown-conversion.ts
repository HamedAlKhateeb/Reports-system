import {
  isMarkdown,
  hasMarkdownTable,
  parseMarkdownTableToGrid,
  markdownToHtml,
  markdownToTipTapJson,
  isRawPreHtml,
} from '../../lib/markdown';

console.log('=== TEST SUITE: Markdown Detection & Conversion ===');

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('❌ FAILED:', msg);
    process.exit(1);
  }
  console.log('  [PASS]', msg);
}

// 1. Table Detection & Parsing
const sampleTable = `
| المعرف | المشكلة | الأولوية | الحالة |
| :--- | :--- | :---: | ---: |
| PRB-01 | خطأ في حفظ التقرير | **حرجة** | مفتوحة |
| PRB-02 | *بطء* في تحميل الجداول | عالية | قيد المعالجة |
`;

assert(hasMarkdownTable(sampleTable), 'hasMarkdownTable detects markdown table with pipes and alignments');
assert(isMarkdown(sampleTable), 'isMarkdown detects markdown table');

const grid = parseMarkdownTableToGrid(sampleTable);
assert(grid !== null, 'parseMarkdownTableToGrid returns a 2D array');
assert(grid?.length === 3, 'Grid has 3 rows (1 header + 2 data rows, separator skipped)');
assert(grid?.[0]?.[0] === 'المعرف', 'Header row cell 0 is "المعرف"');
assert(grid?.[0]?.[1] === 'المشكلة', 'Header row cell 1 is "المشكلة"');
assert(grid?.[1]?.[0] === 'PRB-01', 'Row 1 cell 0 is "PRB-01"');
assert(grid?.[1]?.[2] === 'حرجة', 'Row 1 cell 2 has stripped **bold** to "حرجة"');
assert(grid?.[2]?.[1] === 'بطء في تحميل الجداول', 'Row 2 cell 1 has stripped *italic* to plain text');

// Table without outer pipes
const borderlessTable = `
الاسم | الدرجة
---|---
محمد | 100
سارة | 95
`;
assert(hasMarkdownTable(borderlessTable), 'hasMarkdownTable detects borderless markdown table');
const grid2 = parseMarkdownTableToGrid(borderlessTable);
assert(grid2?.length === 3, 'Borderless grid has 3 rows');
assert(grid2?.[1]?.[0] === 'محمد' && grid2?.[1]?.[1] === '100', 'Data parsed correctly');

// 2. Headings, Lists, Quotes, Code Blocks Detection
assert(isMarkdown('# عنوان رئيسي'), 'Detects h1');
assert(isMarkdown('### عنوان فرعي'), 'Detects h3');
assert(isMarkdown('- بند 1\n- بند 2'), 'Detects bullet list');
assert(isMarkdown('1. أولاً\n2. ثانياً'), 'Detects ordered list');
assert(isMarkdown('> هذا اقتباس مهم'), 'Detects blockquote');
assert(isMarkdown('```javascript\nconsole.log(1);\n```'), 'Detects code block');
assert(isMarkdown('هذا نص به **خط عريض**'), 'Detects bold text');
assert(isMarkdown('هذا نص به [رابط إلى الموقع](https://example.com)'), 'Detects link');

// 3. Plain Text Detection (should NOT be marked as markdown)
assert(!isMarkdown('هذا نص عادي بدون أي ماركداون'), 'Normal sentence is NOT markdown');
assert(!isMarkdown('5 * 5 = 25'), 'Arithmetic expression with single asterisk is NOT markdown');
assert(!isMarkdown('الخيار أ | الخيار ب'), 'Sentence with pipe but no table separator is NOT markdown');

// 4. HTML Generation
const html = markdownToHtml(sampleTable);
assert(html.includes('<table') && html.includes('</table>'), 'markdownToHtml contains <table>');
assert(html.includes('<th') && html.includes('</th>'), 'markdownToHtml contains <th>');
assert(html.includes('<td') && html.includes('</td>'), 'markdownToHtml contains <td>');
assert(html.includes('<strong>حرجة</strong>'), 'markdownToHtml preserves bold within table cell');

const mixedDoc = `
# تقرير المراجعة والتدقيق

فيما يلي ملخص النتائج:

| العنصر | القيمة |
|---|---|
| الإجمالي | 500 |

- تم فحص النظام بالكامل.
- التوافق ممتاز.

> ملاحظة هامة: يجب تأكيد الاعتماد قبل الإرسال.
`;

const mixedHtml = markdownToHtml(mixedDoc);
assert(mixedHtml.includes('<h1>تقرير المراجعة والتدقيق</h1>'), 'mixedHtml has <h1>');
assert(mixedHtml.includes('<table'), 'mixedHtml has <table>');
assert(mixedHtml.includes('<ul>') && mixedHtml.includes('<li>تم فحص النظام بالكامل.</li>'), 'mixedHtml has <ul><li>');
assert(mixedHtml.includes('<blockquote>'), 'mixedHtml has <blockquote>');

// 5. Direct TipTap JSON AST Generation
const jsonDoc = markdownToTipTapJson(mixedDoc);
assert(jsonDoc.type === 'doc', 'jsonDoc root is "doc"');
const types = jsonDoc.content.map((n: any) => n.type);
assert(types.includes('heading'), 'jsonDoc contains heading node');
assert(types.includes('paragraph'), 'jsonDoc contains paragraph node');
assert(types.includes('table'), 'jsonDoc contains table node');
assert(types.includes('bulletList'), 'jsonDoc contains bulletList node');
assert(types.includes('blockquote'), 'jsonDoc contains blockquote node');

// Verify table node structure
const tableNode = jsonDoc.content.find((n: any) => n.type === 'table');
assert(tableNode.content.length === 2, 'tableNode has 2 rows (header + data)');
assert(tableNode.content[0].type === 'tableRow', 'Row is tableRow');
assert(tableNode.content[0].content[0].type === 'tableHeader', 'First row has tableHeader');
assert(tableNode.content[1].content[0].type === 'tableCell', 'Second row has tableCell');

// 6. Raw pre HTML detection
assert(isRawPreHtml('<pre># Heading\n| a | b |</pre>'), '<pre> wrapper is identified as raw pre');
assert(isRawPreHtml(''), 'Empty html is raw pre');
assert(!isRawPreHtml('<table><tr><th>Col</th></tr></table>'), 'Real HTML table is NOT raw pre');
assert(!isRawPreHtml('<h1>Heading</h1><p>Text</p>'), 'Real HTML heading is NOT raw pre');

console.log('🎉 ALL MARKDOWN CONVERSION TESTS PASSED SUCCESSFULLY!');
