/**
 * PHASE 4 (IMAGES APPENDIX / B16) MANDATORY TEST SUITE
 *
 * - Id-first matching excludes placed images (no duplication).
 * - Rename keeps exclusion via src/seq even when fileName changed.
 * - fitImageBox preserves aspect ratio inside the appendix box.
 */

import { filterUnplacedImages, fitImageBox } from '../../lib/images-appendix';

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS: ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

console.log('\n=== PHASE 4 / B16: APPENDIX MATCHING ===\n');

const images: any[] = [
  { id: 'img1', sequenceNumber: 1, fileName: 'img-1.png', downloadUrl: 'https://x/img1', caption: '' },
  { id: 'img2', sequenceNumber: 2, fileName: 'img-2.png', downloadUrl: 'https://x/img2', caption: '' },
  { id: 'img3', sequenceNumber: 3, fileName: 'img-3.png', downloadUrl: 'https://x/img3', caption: '' },
];

// img1 placed by id, img2 by src only (legacy node without imageId).
const doc: any = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
    { type: 'reportImage', attrs: { imageId: 'img1', src: 'https://x/img1', fileName: 'img-1.png', sequenceNumber: 1 } },
    { type: 'reportImage', attrs: { src: 'https://x/img2', fileName: 'img-2.png', sequenceNumber: 2 } },
  ],
};
eq(
  filterUnplacedImages(doc, images).map((i) => i.id),
  ['img3'],
  'B16: placed images excluded, unplaced kept'
);

// Rename img2 (fileName changed, URL+seq stable) → still excluded, no dup.
const renamed = images.map((i) => (i.id === 'img2' ? { ...i, fileName: 'renamed.png' } : i));
eq(
  filterUnplacedImages(doc, renamed).map((i) => i.id),
  ['img3'],
  'B16: renamed image still excluded via src/seq (no duplication)'
);

eq(filterUnplacedImages(null, images).map((i) => i.id), ['img1', 'img2', 'img3'], 'B16: empty doc → all unplaced');
eq(filterUnplacedImages(doc, []).length, 0, 'B16: empty images → empty');

console.log('\n=== PHASE 4 / B16: ASPECT FIT ===\n');

eq(fitImageBox(1040, 640), { width: 520, height: 320 }, 'B16: exact 13:8 fits box');
eq(fitImageBox(1040, 320), { width: 520, height: 160 }, 'B16: wide image letterboxed, ratio kept');
eq(fitImageBox(300, 900), { width: 107, height: 320 }, 'B16: tall image pillarboxed, ratio kept');
const small = fitImageBox(100, 50);
eq(small, { width: 100, height: 50 }, 'B16: small images never upscaled');
eq(fitImageBox(NaN, 0), { width: 520, height: 320 }, 'B16: garbage dims fall back to box');

console.log('\n=== PHASE 4 IMAGES: TEST SUMMARY ===\n');
console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
}
