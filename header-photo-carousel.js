const slot = document.querySelector('.header-feature-image-slot');
let slides = slot ? [...slot.querySelectorAll('.brand-header-photo')] : [];
const previousButton = document.querySelector('#headerPhotoPrevious');
const nextButton = document.querySelector('#headerPhotoNext');
const autoplayButton = document.querySelector('#headerPhotoAutoplay');
const status = document.querySelector('#headerPhotoStatus');
const attribution = document.querySelector('#headerPhotoAttribution');
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const policyAllowsAutoplay = () => !reducedMotion?.matches;
let currentIndex = Math.max(0, slides.findIndex(slide => slide.classList.contains('is-active')));
let autoplayRequested = slides.length > 1 && policyAllowsAutoplay();
let manualMotionOverride = false;
let timer = null;
let intervalMilliseconds = 8000;

function updateAttribution(slide) {
  if (!attribution) return;
  const text = slide?.dataset.siteMediaCreditText || '';
  const href = slide?.dataset.siteMediaCreditHref || '';
  attribution.replaceChildren();
  attribution.classList.toggle('is-empty', !text);
  attribution.setAttribute('aria-hidden', String(!text));
  if (!text) return;
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    attribution.append(link);
  } else {
    attribution.textContent = text;
  }
}

function updateAutoplayButton() {
  if (!autoplayButton) return;
  autoplayButton.textContent = autoplayRequested ? 'Ⅱ' : '▶';
  autoplayButton.setAttribute('aria-label', autoplayRequested ? 'إيقاف التبديل التلقائي' : 'تشغيل التبديل التلقائي');
  autoplayButton.setAttribute('aria-pressed', String(autoplayRequested));
  autoplayButton.title = autoplayRequested ? 'إيقاف التبديل التلقائي' : 'تشغيل التبديل التلقائي';
}

function setSlide(nextIndex, announce = false) {
  if (!slides.length) return;
  currentIndex = (nextIndex + slides.length) % slides.length;
  slides.forEach((slide, index) => {
    const active = index === currentIndex;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', String(!active));
    if (active && slide.dataset.siteMediaDeferredSrc) {
      const deferredSrcset = slide.dataset.siteMediaDeferredSrcset || '';
      if (deferredSrcset) {
        slide.setAttribute('srcset', deferredSrcset);
        slide.setAttribute('sizes', '(max-width: 700px) min(410px, calc(100vw - 48px)), 380px');
      }
      slide.src = slide.dataset.siteMediaDeferredSrc;
    } else if (!active && slide.dataset.siteMediaDynamic === 'true') {
      slide.removeAttribute('src');
      slide.removeAttribute('srcset');
      slide.removeAttribute('sizes');
    }
  });
  updateAttribution(slides[currentIndex]);
  if (announce && status) status.textContent = `الصورة ${currentIndex + 1} من ${slides.length}`;
}

function canAutoplay() {
  return slides.length > 1
    && !document.hidden
    && (manualMotionOverride || policyAllowsAutoplay());
}

function stopTimer() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

function updateTimer() {
  stopTimer();
  if (!autoplayRequested || !canAutoplay()) return;
  timer = window.setInterval(() => setSlide(currentIndex + 1), intervalMilliseconds);
}

previousButton?.addEventListener('click', () => {
  setSlide(currentIndex - 1, true);
  updateTimer();
});
nextButton?.addEventListener('click', () => {
  setSlide(currentIndex + 1, true);
  updateTimer();
});
autoplayButton?.addEventListener('click', () => {
  autoplayRequested = !autoplayRequested;
  manualMotionOverride = autoplayRequested;
  updateAutoplayButton();
  updateTimer();
});
window.addEventListener('header-gallery-updated', event => {
  const currentKey = slides[currentIndex]?.dataset.siteMediaKey || '';
  const nextInterval = Number(event.detail?.intervalSeconds);
  if (Number.isFinite(nextInterval) && nextInterval >= 2 && nextInterval <= 30) {
    intervalMilliseconds = nextInterval * 1000;
  }
  slides = slot ? [...slot.querySelectorAll('.brand-header-photo')] : [];
  let nextIndex = currentKey ? slides.findIndex(slide => slide.dataset.siteMediaKey === currentKey) : -1;
  if (nextIndex < 0) nextIndex = slides.findIndex(slide => slide.classList.contains('is-active'));
  currentIndex = Math.max(0, nextIndex);
  setSlide(currentIndex);
  updateTimer();
});
document.addEventListener('visibilitychange', updateTimer);
reducedMotion?.addEventListener?.('change', updateTimer);
window.addEventListener('pagehide', stopTimer, { once: true });

setSlide(currentIndex);
updateAutoplayButton();
updateTimer();
