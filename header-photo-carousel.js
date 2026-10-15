const slot = document.querySelector('.header-feature-image-slot');
const slides = slot ? [...slot.querySelectorAll('.brand-header-photo')] : [];
const previousButton = document.querySelector('#headerPhotoPrevious');
const nextButton = document.querySelector('#headerPhotoNext');
const autoplayButton = document.querySelector('#headerPhotoAutoplay');
const status = document.querySelector('#headerPhotoStatus');
const attribution = document.querySelector('#headerPhotoAttribution');
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const hasDataSaver = () => Boolean(connection?.saveData)
  || ['slow-2g', '2g'].includes(connection?.effectiveType || '');
const policyAllowsAutoplay = () => !reducedMotion?.matches && !hasDataSaver();
let currentIndex = Math.max(0, slides.findIndex(slide => slide.classList.contains('is-active')));
let autoplayRequested = slides.length > 1 && policyAllowsAutoplay();
let manualMotionOverride = false;
let timer = null;

function updateAttribution(slide) {
  if (!attribution) return;
  const text = slide?.dataset.siteMediaCreditText || '';
  const href = slide?.dataset.siteMediaCreditHref || '';
  attribution.hidden = !text;
  attribution.replaceChildren();
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
  timer = window.setInterval(() => setSlide(currentIndex + 1), 8000);
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
document.addEventListener('visibilitychange', updateTimer);
reducedMotion?.addEventListener?.('change', updateTimer);
connection?.addEventListener?.('change', updateTimer);
window.addEventListener('pagehide', stopTimer, { once: true });

setSlide(currentIndex);
updateAutoplayButton();
updateTimer();
