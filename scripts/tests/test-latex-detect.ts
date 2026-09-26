import katex from 'katex';
import { isPureLatex, cleanLatex, splitTextWithLatex } from '../../lib/latex';
import { isMarkdown, markdownToHtml, markdownToTipTapJson } from '../../lib/markdown';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

console.log('--- 1. Testing isPureLatex ---');
const userEquation = '\\alpha \\in \\left(\\frac{1}{2},1\\right]';
assert(isPureLatex(userEquation), 'Detects user equation: \\alpha \\in \\left(\\frac{1}{2},1\\right]');
assert(isPureLatex('\\frac{a}{b}'), 'Detects \\frac{a}{b}');
assert(isPureLatex('$\\alpha$'), 'Detects $...$ delimited math');
assert(isPureLatex('$$\\sum_{i=1}^n i$$'), 'Detects $$...$$ display math');
assert(isPureLatex('\\[\\int_0^\\infty e^{-x} dx\\]'), 'Detects \\[...\\] LaTeX display math');
assert(isPureLatex('\\(x + y\\)'), 'Detects \\(...\\) LaTeX inline math');
assert(!isPureLatex('Hello world'), 'Rejects normal English text');
assert(!isPureLatex('مرحبا بالعالم'), 'Rejects Arabic text');
assert(!isPureLatex('C:\\alpha\\beta'), 'Rejects Windows paths');
assert(!isPureLatex('D:\\files\\frac\\test.txt'), 'Rejects nested Windows paths');
assert(!isPureLatex('const x = 1; console.log(x);'), 'Rejects JavaScript code');
assert(!isPureLatex('def solve(): return 42'), 'Rejects Python code');

console.log('\n--- 2. Testing cleanLatex ---');
assert(cleanLatex('  $$x + 1$$  ') === 'x + 1', 'Cleans $$ delimiters');
assert(cleanLatex('$x + 1$') === 'x + 1', 'Cleans $ delimiters');
assert(cleanLatex('\\(x + 1\\)') === 'x + 1', 'Cleans \\( \\) delimiters');
assert(cleanLatex('\\[x + 1\\]') === 'x + 1', 'Cleans \\[ \\] delimiters');
assert(cleanLatex(userEquation) === userEquation, 'Preserves un-delimited LaTeX');

console.log('\n--- 3. Testing splitTextWithLatex ---');
const userSegs = splitTextWithLatex(userEquation);
assert(userSegs.length === 1 && userSegs[0].type === 'math' && userSegs[0].value === userEquation, 'Pure equation splits as single math segment');

const mixedText = 'Given \\(\\alpha = 1\\) and \\[\\beta = 2\\] solve the rest';
const mixedSegs = splitTextWithLatex(mixedText);
assert(mixedSegs.length === 5, 'Mixed text correctly extracts math and text segments');
assert(mixedSegs[1].type === 'math' && mixedSegs[1].value === '\\alpha = 1', 'Extracts \\( math');
assert(mixedSegs[3].type === 'math' && mixedSegs[3].value === '\\beta = 2', 'Extracts \\[ math');

console.log('\n--- 4. Testing isMarkdown & markdownToHtml ---');
assert(isMarkdown(userEquation), 'isMarkdown recognizes user equation');
const htmlFromRaw = markdownToHtml(userEquation);
assert(htmlFromRaw.includes('data-type="latex-inline"'), 'markdownToHtml wraps raw equation in latex-inline span');
assert(!htmlFromRaw.includes('<pre>'), 'markdownToHtml NEVER creates <pre> for pure LaTeX');

const fencedLatex = '```latex\n\\alpha \\in \\left(\\frac{1}{2},1\\right]\n```';
assert(isMarkdown(fencedLatex), 'isMarkdown recognizes fenced latex');
const htmlFromFence = markdownToHtml(fencedLatex);
assert(htmlFromFence.includes('data-type="latex-inline"'), 'Fenced latex code block renders as latex-inline');
assert(!htmlFromFence.includes('<pre>'), 'Fenced latex NEVER creates <pre>');

console.log('\n--- 5. Testing markdownToTipTapJson ---');
const tipTapJson = markdownToTipTapJson(fencedLatex);
const firstBlock = tipTapJson.content[0];
assert(firstBlock.type === 'paragraph', 'Fence converts to paragraph instead of codeBlock');
assert(firstBlock.content[0].type === 'latexInline', 'Paragraph contains latexInline node');
assert(firstBlock.content[0].attrs.latex === userEquation, 'latexInline contains clean LaTeX formula');

console.log('\n🎉 ALL 24 TESTS PASSED SUCCESSFULLY! 🎉');
