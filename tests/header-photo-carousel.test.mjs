import test from 'node:test';
import assert from 'node:assert/strict';

function createEnvironment(options = {}) {
  const handlers = new Map();
  const windowHandlers = new Map();
  let timerCallback = null;
  let timerDelay = null;
  let nextTimerId = 0;
  let activeTimerId = null;
  const makeButton = key => ({
    textContent: '',
    title: '',
    attributes: {},
    addEventListener(type, callback) { handlers.set(`${key}:${type}`, callback); },
    setAttribute(name, value) { this.attributes[name] = value; },
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
      removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; },
    };
  };
  const slides = Array.from({ length: 5 }, (_, index) => makeSlide(index === 0));
  const slot = { querySelectorAll: () => slides };
  const previous = makeButton('previous');
  const next = makeButton('next');
  const autoplay = makeButton('autoplay');
  const status = { textContent: '' };
  const attribution = { textContent: '', classList: { toggle() {} }, setAttribute() {}, replaceChildren() {}, append() {} };
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
    matchMedia: () => ({ matches: options.reducedMotion ?? false, addEventListener() {} }),
    setInterval(callback, ms) { timerCallback = callback; timerDelay = ms; activeTimerId = ++nextTimerId; return activeTimerId; },
    clearInterval(id) { if (id === activeTimerId) activeTimerId = null; },
    addEventListener(type, callback) { windowHandlers.set(type, callback); },
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { connection: options.connection } });
  return { handlers, windowHandlers, slides, status, autoplay, get timerCallback() { return timerCallback; }, get timerDelay() { return timerDelay; }, get timerActive() { return activeTimerId !== null; } };
}

test('manual and automatic controls advance exactly one carousel slide', async () => {
  const env = createEnvironment({ connection: { saveData: true, effectiveType: '2g' } });
  await import('../header-photo-carousel.js?test=manual');
  assert.equal(env.timerDelay, 8000);
  assert.equal(env.timerActive, true);
  assert.equal(env.slides[0].classList.contains('is-active'), true);
  assert.equal(env.autoplay.textContent, 'Ⅱ');
  assert.equal(env.autoplay.attributes['aria-label'], 'إيقاف التبديل التلقائي');
  assert.equal(env.autoplay.attributes['aria-pressed'], 'true');

  env.handlers.get('autoplay:click')();
  assert.equal(env.timerActive, false);
  assert.equal(env.autoplay.textContent, '▶');
  assert.equal(env.autoplay.attributes['aria-label'], 'تشغيل التبديل التلقائي');
  assert.equal(env.autoplay.attributes['aria-pressed'], 'false');
  env.handlers.get('autoplay:click')();
  assert.equal(env.timerActive, true);
  assert.equal(env.autoplay.textContent, 'Ⅱ');
  assert.equal(env.autoplay.attributes['aria-pressed'], 'true');

  env.handlers.get('next:click')();
  assert.equal(env.slides[1].classList.contains('is-active'), true);
  assert.equal(env.status.textContent, 'الصورة 2 من 5');
  assert.equal(typeof env.timerCallback, 'function');
  env.timerCallback();
  assert.equal(env.slides[2].classList.contains('is-active'), true);
  assert.equal(env.slides[1].classList.contains('is-active'), false);

  const addedSlide = {
    dataset: { siteMediaKey: 'header-feature-image-6', siteMediaDynamic: 'true', siteMediaDeferredSrc: 'https://example.test/slide.webp' },
    attributes: {},
    classList: {
      classes: new Set(),
      contains(name) { return this.classes.has(name); },
      toggle(name, force) { if (force) this.classes.add(name); else this.classes.delete(name); },
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; },
  };
  env.slides.push(addedSlide);
  env.windowHandlers.get('header-gallery-updated')({ detail: { intervalSeconds: 5 } });
  assert.equal(env.timerDelay, 5000);
  for (let index = 0; index < 3; index += 1) env.handlers.get('next:click')();
  assert.equal(addedSlide.classList.contains('is-active'), true);
  assert.equal(addedSlide.src, 'https://example.test/slide.webp');
  assert.equal(env.status.textContent, 'الصورة 6 من 6');
});
