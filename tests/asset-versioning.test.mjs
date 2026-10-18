import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { versionAssets } from '../scripts/version-assets.mjs';

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'asset-versions-'));
  try { fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
test('published resource versions are current', () => {
  assert.deepEqual(versionAssets(new URL('../', import.meta.url).pathname, { check: true }), []);
});
test('versions propagate through imports, stay stable, and leave images/data/external URLs alone', () => fixture(root => {
  writeFileSync(join(root, 'index.html'), '<link href="site.css?v=old"><script src="parent.js?v=old"></script><img src="photo.webp"><script src="https://example.com/external.js?v=1"></script>');
  writeFileSync(join(root, 'set-password.html'), '<script src="leaf.mjs"></script>');
  writeFileSync(join(root, 'site.css'), 'body{color:black}');
  writeFileSync(join(root, 'parent.js'), "import {x} from './leaf.mjs?v=old'; const data=new URL('./news.json', import.meta.url); const script=new URL('./vendor.js', import.meta.url);\n");
  writeFileSync(join(root, 'leaf.mjs'), 'export const x=1;\n');
  writeFileSync(join(root, 'vendor.js'), 'window.vendor=true;\n');
  writeFileSync(join(root, 'news.json'), '{}');
  const initial = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(versionAssets(root, { check: true }).length);
  assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), initial);
  versionAssets(root);
  assert.deepEqual(versionAssets(root), []);
  const before = readFileSync(join(root, 'index.html'), 'utf8');
  const css = before.match(/site.css\?v=[a-f0-9]{16}/)[0];
  assert.match(readFileSync(join(root, 'parent.js'), 'utf8'), /leaf.mjs\?v=[a-f0-9]{16}/);
  assert.match(readFileSync(join(root, 'parent.js'), 'utf8'), /vendor.js\?v=[a-f0-9]{16}/);
  assert.ok(before.includes('src="photo.webp"'));
  assert.ok(before.includes('https://example.com/external.js?v=1'));
  writeFileSync(join(root, 'leaf.mjs'), 'export const x=2;\n');
  assert.deepEqual(versionAssets(root), ['index.html', 'parent.js', 'set-password.html']);
  assert.notEqual(readFileSync(join(root, 'index.html'), 'utf8'), before);
  assert.ok(readFileSync(join(root, 'index.html'), 'utf8').includes(css));
  assert.ok(readFileSync(join(root, 'parent.js'), 'utf8').includes("'./news.json'"));
  assert.deepEqual(versionAssets(root), []);
}));
test('cycles fail before writing any files', () => fixture(root => {
  writeFileSync(join(root, 'a.js'), "import './b.js';");
  writeFileSync(join(root, 'b.js'), "import './a.js';");
  assert.throws(() => versionAssets(root), /Cyclic asset imports/);
  assert.equal(readFileSync(join(root, 'a.js'), 'utf8'), "import './b.js';");
}));
