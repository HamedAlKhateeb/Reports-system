import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2A3E31" />
      <stop offset="45%" stop-color="#1F2F25" />
      <stop offset="100%" stop-color="#131E17" />
    </linearGradient>

    <!-- Inner Border Glow -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#527A5F" />
      <stop offset="100%" stop-color="#263D2F" />
    </linearGradient>

    <!-- Emerald Accent Gradient -->
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34D399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>

    <!-- Top Highlight -->
    <linearGradient id="topGlow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />
    </linearGradient>
  </defs>

  <!-- Squircle Base with Border -->
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="8" />
  <rect x="20" y="20" width="472" height="230" rx="104" fill="url(#topGlow)" />

  <!-- Document Silhouette -->
  <path
    d="M 156 94 H 272 L 358 180 V 390 C 358 406.5 344.5 420 328 420 H 156 C 139.5 420 126 406.5 126 390 V 124 C 126 107.5 139.5 94 156 94 Z"
    fill="#FFFFFF"
    fill-opacity="0.08"
    stroke="#FFFFFF"
    stroke-width="26"
    stroke-linejoin="round"
    stroke-linecap="round"
  />

  <!-- Document Fold Corner -->
  <path
    d="M 268 94 V 184 H 358"
    fill="#FFFFFF"
    fill-opacity="0.2"
    stroke="#FFFFFF"
    stroke-width="26"
    stroke-linejoin="round"
    stroke-linecap="round"
  />

  <!-- Report Data Lines -->
  <!-- Top emerald line (indicates score / verified report) -->
  <line x1="172" y1="232" x2="280" y2="232" stroke="#34D399" stroke-width="22" stroke-linecap="round" />
  <!-- Middle line -->
  <line x1="172" y1="288" x2="252" y2="288" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="22" stroke-linecap="round" />
  <!-- Bottom line -->
  <line x1="172" y1="344" x2="216" y2="344" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="22" stroke-linecap="round" />

  <!-- Quality / Verification Badge at bottom-right -->
  <!-- Cutout mask ring to give separation from document -->
  <circle cx="348" cy="348" r="82" fill="#17241C" />
  <!-- Badge body -->
  <circle cx="348" cy="348" r="70" fill="url(#emeraldGrad)" />
  <circle cx="348" cy="348" r="70" fill="none" stroke="#6EE7B7" stroke-width="4" stroke-opacity="0.7" />
  <!-- Checkmark -->
  <path
    d="M 318 348 L 338 368 L 380 326"
    fill="none"
    stroke="#FFFFFF"
    stroke-width="22"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

const publicDir = path.resolve('public');
const appDir = path.resolve('app');

// 1. Write SVG to public and app
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf-8');
fs.writeFileSync(path.join(appDir, 'icon.svg'), svgContent, 'utf-8');
console.log('Wrote icon.svg to public/ and app/');

async function generatePngs() {
  const svgBuffer = Buffer.from(svgContent);

  // Generate PNG sizes
  const sizes = [16, 32, 48, 64, 128, 180, 192, 512];
  for (const size of sizes) {
    const outName = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    const outPath = path.join(publicDir, outName);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`Generated ${outName} (${size}x${size})`);
  }

  // Also write apple-touch-icon.png to app/
  fs.copyFileSync(
    path.join(publicDir, 'apple-touch-icon.png'),
    path.join(appDir, 'apple-touch-icon.png')
  );

  // Create favicon.ico using python Pillow
  console.log('Generating multi-resolution favicon.ico via Python Pillow...');
  execSync('python scripts/create-ico.py', { stdio: 'inherit' });
}

generatePngs().catch(console.error);
