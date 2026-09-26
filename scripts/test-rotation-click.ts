import { isPointNearElement, rotatePoint, getElementCenter } from '../lib/drawing/geometry';
import { hitTestElement, displayBox } from '../components/boards/BoardCanvas';

// Test 1: Horizontal line from (100, 100) to (300, 100)
// Rotated 90 degrees around center.
// Center is (200, 100).
// When rotated 90 degrees:
// (100, 100) -> (200, 0)
// (300, 100) -> (200, 200)
// Line runs from (200, 0) to (200, 200).
const lineEl = {
  id: 'test-line-1',
  type: 'line',
  x: 100,
  y: 100,
  width: 200,
  height: 0,
  points: [{ x: 100, y: 100 }, { x: 300, y: 100 }],
  rotation: 90,
};

const center = getElementCenter(lineEl);
console.log('Center computed:', center);
if (center.x !== 200 || center.y !== 100) {
  throw new Error(`Expected center (200, 100), got (${center.x}, ${center.y})`);
}

// Points on the rotated vertical line:
// (200, 50), (200, 100), (200, 150)
const hit1 = hitTestElement({ x: 200, y: 50 }, lineEl, 12);
const hit2 = hitTestElement({ x: 200, y: 100 }, lineEl, 12);
const hit3 = hitTestElement({ x: 200, y: 150 }, lineEl, 12);
// Near the rotated line (e.g. 8px to the right: (208, 120)):
const hit4 = hitTestElement({ x: 208, y: 120 }, lineEl, 12);
// Far from rotated line (e.g. (100, 100) which was original before rotation):
const hit5 = hitTestElement({ x: 100, y: 100 }, lineEl, 12);

console.log('Hit test results for rotated line:');
console.log(' - on (200, 50):', hit1);
console.log(' - on (200, 100):', hit2);
console.log(' - on (200, 150):', hit3);
console.log(' - near (208, 120):', hit4);
console.log(' - far (100, 100):', hit5);

if (!hit1 || !hit2 || !hit3 || !hit4) {
  throw new Error('Hit testing failed for points on/near rotated line!');
}
if (hit5) {
  throw new Error('Point (100, 100) should NOT hit the 90-degree rotated line!');
}

// Test 2: Rotated text
const textEl = {
  id: 'test-text-1',
  type: 'text',
  x: 200,
  y: 200,
  width: 100,
  height: 40,
  text: 'Hello World',
  fontSize: 20,
  rotation: 45,
};

// Center of text
const tBox = displayBox(textEl);
const tCenter = { x: tBox.x + tBox.w / 2, y: tBox.y + tBox.h / 2 };
// Clicking exactly on center should hit
const tHitCenter = hitTestElement(tCenter, textEl, 12);
console.log('Hit test results for rotated text center:', tHitCenter);
if (!tHitCenter) {
  throw new Error('Rotated text center should hit!');
}

console.log('ALL ROTATION HIT TEST CHECKS PASSED!');
