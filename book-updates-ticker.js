import { PUBLIC_READABLE_BOOKS } from './public-reading-books.js?v=5401d58c55dcc6a9';
import { fetchSharedPublicReadingJson } from './shared-public-reading-data.mjs?v=c0a874b3218d5558';
import { sanitizeBooks } from './external-reading-model.mjs?v=3ee1aa50144d7c9a';

const DATA_URL = 'external-reading-books.json';
const ROTATION_MS = 4000;

export function buildTickerItems(externalBooks = []) {
  const local = PUBLIC_READABLE_BOOKS.map((book) => ({
    id: `local:${book.title}`,
    title: book.title,
    author: book.author,
    href: book.pdf,
    kind: 'local',
    badge: 'موجود بالموقع',
  }));
  const external = externalBooks.map((book) => ({
    id: `external:${book.id}`,
    title: book.title,
    author: book.author,
    href: book.reader || book.source,
    kind: 'external',
    badge: 'إضافة جديدة · لدى المصدر',
    sourceName: book.sourceName,
  }));
  return [...local, ...external].filter((item) => item.title && item.href);
}

export async function loadExternalBooks(fetchImpl = globalThis.fetch, currentOrigin = globalThis.location?.origin) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch غير متاح');
  const data = await fetchSharedPublicReadingJson(DATA_URL, fetchImpl);
  const books = sanitizeBooks(data, { currentOrigin });
  if (!books.length) throw new Error('لا توجد بيانات خارجية صالحة');
  return books;
}

function makeElement(documentRef, tag, className, text) {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function mountBookUpdatesTicker({ documentRef = globalThis.document, fetchImpl = globalThis.fetch } = {}) {
  if (!documentRef) return null;
  const header = documentRef.querySelector('.site-header');
  const mobileNav = documentRef.querySelector('.mobile-nav');
  if (!header || !mobileNav || documentRef.querySelector('#bookUpdatesTicker')) return null;

  const ticker = makeElement(documentRef, 'section', 'book-updates-ticker');
  ticker.id = 'bookUpdatesTicker';
  ticker.dir = 'rtl';
  ticker.setAttribute('aria-labelledby', 'bookUpdatesTickerTitle');

  const heading = makeElement(documentRef, 'h2', 'book-updates-ticker-title', 'آخر تحديثات القراءة');
  heading.id = 'bookUpdatesTickerTitle';
  const viewport = makeElement(documentRef, 'div', 'book-updates-ticker-viewport');
  const status = makeElement(documentRef, 'p', 'book-updates-ticker-status');
  status.hidden = true;
  const controls = makeElement(documentRef, 'div', 'book-updates-ticker-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'التحكم في تحديثات القراءة');
  const previous = makeElement(documentRef, 'button', 'book-updates-ticker-control', 'السابق');
  previous.type = 'button';
  previous.setAttribute('aria-label', 'عنوان الكتاب السابق');
  const toggle = makeElement(documentRef, 'button', 'book-updates-ticker-control book-updates-ticker-toggle', 'إيقاف');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'إيقاف العرض التلقائي');
  toggle.setAttribute('aria-pressed', 'true');
  const next = makeElement(documentRef, 'button', 'book-updates-ticker-control', 'التالي');
  next.type = 'button';
  next.setAttribute('aria-label', 'عنوان الكتاب التالي');
  controls.append(previous, toggle, next);
  ticker.append(heading, viewport, status, controls);
  mobileNav.parentNode.insertBefore(ticker, mobileNav);

  let items = buildTickerItems();
  let index = 0;
  let timer = null;
  let userPaused = false;
  let hovered = false;
  let focused = false;
  const reducedMotion = typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };

  const render = () => {
    viewport.replaceChildren();
    const item = items[index];
    if (!item) return;
    const link = makeElement(documentRef, 'a', 'book-updates-ticker-link', item.title);
    link.href = item.href;
    link.title = `${item.title}${item.author ? ` — ${item.author}` : ''}`;
    if (item.kind === 'external') {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    const meta = makeElement(documentRef, 'span', 'book-updates-ticker-meta', `${item.badge}${item.author ? ` · ${item.author}` : ''}`);
    viewport.append(link, meta);
    ticker.dataset.source = item.kind;
    if (!reducedMotion.matches && typeof viewport.animate === 'function') {
      viewport.animate([{ opacity: 0.4, transform: 'translateX(-5px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 240, easing: 'ease-out' });
    }
  };
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
  const startTimer = () => {
    stopTimer();
    toggle.disabled = reducedMotion.matches;
    toggle.textContent = reducedMotion.matches ? 'حركة مخفّضة' : userPaused ? 'تشغيل' : 'إيقاف';
    toggle.setAttribute('aria-pressed', String(!reducedMotion.matches && !userPaused));
    toggle.setAttribute('aria-label', reducedMotion.matches ? 'الحركة متوقفة حسب تفضيلات الجهاز؛ استخدم السابق والتالي' : userPaused ? 'تشغيل العرض التلقائي' : 'إيقاف العرض التلقائي');
    if (!reducedMotion.matches && !userPaused && !hovered && !focused && !documentRef.hidden && items.length > 1) {
      timer = setInterval(() => { index = (index + 1) % items.length; render(); }, ROTATION_MS);
    }
  };
  const move = (step) => { if (items.length) { index = (index + step + items.length) % items.length; render(); } };
  const setUserPaused = (paused) => {
    userPaused = paused;
    toggle.setAttribute('aria-pressed', String(!paused));
    toggle.textContent = paused ? 'تشغيل' : 'إيقاف';
    toggle.setAttribute('aria-label', paused ? 'تشغيل العرض التلقائي' : 'إيقاف العرض التلقائي');
    startTimer();
  };
  previous.addEventListener('click', () => { move(-1); startTimer(); });
  next.addEventListener('click', () => { move(1); startTimer(); });
  toggle.addEventListener('click', () => setUserPaused(!userPaused));
  ticker.addEventListener('mouseenter', () => { hovered = true; stopTimer(); });
  ticker.addEventListener('mouseleave', () => { hovered = false; startTimer(); });
  ticker.addEventListener('focusin', () => { focused = true; stopTimer(); });
  ticker.addEventListener('focusout', (event) => { if (!ticker.contains(event.relatedTarget)) { focused = false; startTimer(); } });
  documentRef.addEventListener('visibilitychange', startTimer);
  reducedMotion.addEventListener?.('change', startTimer);

  render();
  loadExternalBooks(fetchImpl, globalThis.location?.origin).then((books) => {
    items = buildTickerItems(books);
    index = 0;
    render();
    status.hidden = true;
    startTimer();
  }).catch(() => {
    status.textContent = 'تعذّر تحميل الإضافات الخارجية الآن؛ نعرض الكتب الموجودة بالموقع فقط.';
    status.hidden = false;
    items = buildTickerItems();
    render();
    startTimer();
  });
  startTimer();
  return { element: ticker, destroy: () => { stopTimer(); ticker.remove(); } };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountBookUpdatesTicker(), { once: true });
  else mountBookUpdatesTicker();
}
