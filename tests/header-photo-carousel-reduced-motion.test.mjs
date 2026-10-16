import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const carouselPath = fileURLToPath(new URL('../header-photo-carousel.js', import.meta.url));

const script = `
import assert from 'node:assert/strict';
const handlers = new Map();
let timerCallback = null;
const button = key => ({ textContent: '', title: '', addEventListener(type, fn) { handlers.set(key + ':' + type, fn); }, setAttribute() {} });
const classes = new Set(['is-active']);
const slide = active => {
  const state = new Set(active ? ['is-active'] : []);
  return { dataset: {}, classList: { contains: key => state.has(key), toggle(key, force) { if (force) state.add(key); else state.delete(key); } }, setAttribute() {} };
};
const slides = Array.from({ length: 5 }, (_, index) => slide(index === 0));
const previous = button('previous');
const next = button('next');
const autoplay = button('autoplay');
const status = { textContent: '' };
const attribution = { hidden: false, textContent: '', replaceChildren() {}, append() {} };
globalThis.document = { hidden: false, querySelector(selector) { return ({ '.header-feature-image-slot': { querySelectorAll: () => slides }, '#headerPhotoPrevious': previous, '#headerPhotoNext': next, '#headerPhotoAutoplay': autoplay, '#headerPhotoStatus': status, '#headerPhotoAttribution': attribution })[selector] ?? null; }, addEventListener() {} };
globalThis.window = { matchMedia: () => ({ matches: true, addEventListener() {} }), setInterval(fn) { timerCallback = fn; return 1; }, clearInterval() {}, addEventListener() {} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
await import(${JSON.stringify(new URL('../header-photo-carousel.js', import.meta.url).href)});
assert.equal(timerCallback, null);
assert.equal(autoplay.textContent, '▶');
handlers.get('autoplay:click')();
assert.equal(typeof timerCallback, 'function');
assert.equal(autoplay.textContent, 'Ⅱ');
`;

test('autoplay respects reduced motion until the visitor explicitly enables it', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
