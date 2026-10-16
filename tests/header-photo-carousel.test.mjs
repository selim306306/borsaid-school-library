import test from 'node:test';
import assert from 'node:assert/strict';

function createEnvironment() {
  const handlers = new Map();
  let timerCallback = null;
  const makeButton = key => ({
    textContent: '',
    title: '',
    addEventListener(type, callback) { handlers.set(`${key}:${type}`, callback); },
    setAttribute() {},
  });
  const makeSlide = active => {
    const classes = new Set(active ? ['is-active'] : []);
    return {
      dataset: {},
      attributes: {},
      classList: {
        contains: name => classes.has(name),
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
  };
  const slides = Array.from({ length: 5 }, (_, index) => makeSlide(index === 0));
  const slot = { querySelectorAll: () => slides };
  const previous = makeButton('previous');
  const next = makeButton('next');
  const autoplay = makeButton('autoplay');
  const status = { textContent: '' };
  const attribution = { hidden: false, textContent: '', replaceChildren() {}, append() {} };
  globalThis.document = {
    hidden: false,
    querySelector(selector) {
      return ({
        '.header-feature-image-slot': slot,
        '#headerPhotoPrevious': previous,
        '#headerPhotoNext': next,
        '#headerPhotoAutoplay': autoplay,
        '#headerPhotoStatus': status,
        '#headerPhotoAttribution': attribution,
      })[selector] ?? null;
    },
    addEventListener() {},
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setInterval(callback, ms) { timerCallback = callback; assert.equal(ms, 8000); return 1; },
    clearInterval() {},
    addEventListener() {},
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  return { handlers, slides, status, get timerCallback() { return timerCallback; } };
}

test('manual and automatic controls advance exactly one carousel slide', async () => {
  const env = createEnvironment();
  await import('../header-photo-carousel.js?test=manual');
  assert.equal(env.slides[0].classList.contains('is-active'), true);
  env.handlers.get('next:click')();
  assert.equal(env.slides[1].classList.contains('is-active'), true);
  assert.equal(env.status.textContent, 'الصورة 2 من 5');
  assert.equal(typeof env.timerCallback, 'function');
  env.timerCallback();
  assert.equal(env.slides[2].classList.contains('is-active'), true);
  assert.equal(env.slides[1].classList.contains('is-active'), false);
});
