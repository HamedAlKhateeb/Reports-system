const fs = require('fs');
const path = require('path');

const polyfillCode = `// Polyfill WeakRef and FinalizationRegistry for Cloudflare Workers runtime
if (typeof globalThis.WeakRef === 'undefined') {
  globalThis.WeakRef = class WeakRef {
    constructor(target) {
      this.target = target;
    }
    deref() {
      return this.target;
    }
  };
}
if (typeof globalThis.FinalizationRegistry === 'undefined') {
  globalThis.FinalizationRegistry = class FinalizationRegistry {
    register() {}
    unregister() {}
  };
}
`;

const filesToPatch = [
  path.join(__dirname, '..', '.open-next', 'worker.js'),
  path.join(__dirname, '..', '.open-next', 'server-functions', 'default', 'handler.mjs'),
  path.join(__dirname, '..', '.open-next', 'server-functions', 'default', 'index.mjs'),
  path.join(__dirname, '..', '.open-next', 'server-functions', 'default', 'middleware.mjs'),
];

for (const file of filesToPatch) {
  if (fs.existsSync(file)) {
    try {
      let content = fs.readFileSync(file, 'utf8');
      let modified = false;

      // 1. WeakRef & FinalizationRegistry polyfill
      if (!content.includes('Polyfill WeakRef and FinalizationRegistry')) {
        content = polyfillCode + '\n' + content;
        modified = true;
      }

      // 2. Protobufjs codegen bypass for Cloudflare Workers eval security
      if (content.includes('return Function(t2)();')) {
        content = content.replace(
          'return a[A] = t2, Function.apply(null, a).apply(null, l);',
          'try { return a[A] = t2, Function.apply(null, a).apply(null, l); } catch (_) { return function() {}; }'
        );
        content = content.replace(
          'return Function(t2)();',
          'try { return Function(t2)(); } catch (_) { return function() {}; }'
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`[patch-open-next] Successfully patched ${path.relative(process.cwd(), file)}`);
      } else {
        console.log(`[patch-open-next] Already patched: ${path.relative(process.cwd(), file)}`);
      }
    } catch (err) {
      console.error(`[patch-open-next] Error patching ${file}:`, err);
    }
  }
}
