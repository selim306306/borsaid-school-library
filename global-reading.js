const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $('#globalReadingForm');
const input = $('#globalReadingInput');
const language = $('#globalReadingLanguage');
const status = $('#globalReadingStatus');
const grid = $('#globalReadingResults');
const moreButton = $('#globalReadingMore');
const suggestions = $$('.global-reading-suggestion');
const PAGE_SIZE = 4;
const MIN_REQUEST_GAP_MS = 1125;
const REQUEST_TIMEOUT_MS = 25000;
const SEARCH_URL = 'https://openlibrary.org/search.json';
const READ_URL = 'https://openlibrary.org/api/volumes/brief/olid/';
let activeQuery = '';
let offset = 0;
let generation = 0;
let activeController = null;
let debounceTimer = 0;
let requestQueue = Promise.resolve();
let lastRequestStarted = 0;

function delayWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = window.setTimeout(done, ms);
    function done() { signal.removeEventListener('abort', cancel); resolve(); }
    function cancel() { window.clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function limitedJson(url, signal) {
  const run = async () => {
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestStarted));
    if (wait) await delayWithAbort(wait, signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    lastRequestStarted = Date.now();
    const requestController = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; requestController.abort(); }, REQUEST_TIMEOUT_MS);
    const abortRequest = () => requestController.abort();
    if (signal.aborted) abortRequest();
    else signal.addEventListener('abort', abortRequest, { once: true });
    try {
      const response = await fetch(url, { signal: requestController.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await response.json();
    } catch (error) {
      if (timedOut) throw new Error('http_timeout');
      throw error;
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abortRequest);
    }
  };
  const request = requestQueue.then(run, run);
  requestQueue = request.catch(() => {});
  return request;
}

function setBusy(busy) {
  grid.setAttribute('aria-busy', String(busy));
  form.querySelector('button[type="submit"]').disabled = busy;
}

function safeSourceUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const candidate = new URL(value);
    const host = candidate.hostname.toLowerCase();
    const permitted = host === 'openlibrary.org' || host === 'www.openlibrary.org' || host === 'archive.org' || host === 'www.archive.org' || host.endsWith('.archive.org');
    if (!permitted || !['https:', 'http:'].includes(candidate.protocol) || candidate.username || candidate.password || candidate.port) return '';
    candidate.protocol = 'https:';
    return candidate.href;
  } catch { return ''; }
}

function externalLink(label, href, className = 'global-reading-link') {
  if (!href) return null;
  const link = document.createElement('a');
  link.className = className;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  const screenReader = document.createElement('span');
  screenReader.className = 'sr-only';
  screenReader.textContent = ' يفتح لدى المصدر الخارجي في نافذة جديدة';
  link.append(screenReader);
  return link;
}

function googleBooksSearch(title, author) {
  const terms = [title, author].filter(Boolean).join(' ');
  return `https://books.google.com/books?q=${encodeURIComponent(terms)}`;
}

function createCard(book) {
  const card = document.createElement('article');
  card.className = 'global-book-card';
  const top = document.createElement('div');
  top.className = 'global-book-card-top';
  const source = document.createElement('span');
  source.className = 'global-book-source';
  source.textContent = 'Open Library · فهرس عالمي';
  const badge = document.createElement('span');
  badge.className = 'global-book-status pending';
  badge.textContent = 'جارٍ التحقق من الإتاحة الرقمية…';
  top.append(source, badge);

  const body = document.createElement('div');
  body.className = 'global-book-body';
  if (Number.isInteger(book.cover_i) && book.cover_i > 0) {
    const cover = document.createElement('img');
    cover.className = 'global-book-cover';
    cover.src = `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg?default=false`;
    cover.alt = '';
    cover.loading = 'lazy';
    cover.decoding = 'async';
    cover.referrerPolicy = 'no-referrer';
    cover.width = 96;
    cover.height = 144;
    cover.addEventListener('error', () => cover.remove(), { once: true });
    body.append(cover);
  }
  const details = document.createElement('div');
  details.className = 'global-book-details';
  const title = document.createElement('h3');
  title.textContent = String(book.title || 'عنوان غير متاح').slice(0, 240);
  const author = document.createElement('p');
  author.className = 'global-book-author';
  author.textContent = Array.isArray(book.author_name) && book.author_name.length
    ? `تأليف: ${book.author_name.slice(0, 3).join('، ')}` : 'بيانات المؤلف غير متاحة';
  const meta = document.createElement('p');
  meta.className = 'global-book-meta';
  const year = Number(book.first_publish_year);
  meta.textContent = `${Number.isInteger(year) && year > 0 ? `أول نشر مسجّل: ${year} · ` : ''}مصدر بيانات الفهرس: Open Library`;
  details.append(title, author, meta);
  body.append(details);

  const actions = document.createElement('div');
  actions.className = 'global-book-actions';
  const workKey = typeof book.key === 'string' && /^\/works\/OL\d+W$/.test(book.key) ? book.key : '';
  const record = externalLink('تفاصيل الكتاب', workKey ? `https://openlibrary.org${workKey}` : 'https://openlibrary.org/');
  if (record) actions.append(record);
  actions.append(externalLink('ابحث في Google Books', googleBooksSearch(book.title || '', (book.author_name || [])[0] || ''), 'global-reading-link global-reading-link-muted'));
  card.append(top, body, actions);
  return { card, badge, actions, book };
}

function setAvailability(view, item) {
  view.actions.querySelectorAll('[data-availability-action]').forEach(node => node.remove());
  const statusText = typeof item?.status === 'string' ? item.status.toLowerCase() : '';
  const itemUrl = safeSourceUrl(item?.itemURL);
  const matchType = item?.match;
  if (!['exact', 'similar'].includes(matchType)) {
    view.badge.classList.remove('pending', 'available');
    view.badge.classList.add('restricted');
    view.badge.textContent = 'لم يؤكد Open Library نوع مطابقة النسخة؛ لا نعرض حالة إتاحة أو زر قراءة';
    return;
  }
  const similar = matchType === 'similar';
  view.badge.classList.remove('pending', 'available', 'restricted');
  if (statusText === 'full access' && itemUrl) {
    view.badge.classList.add('available');
    view.badge.textContent = similar ? 'قراءة كاملة · نسخة رقمية مشابهة' : 'قراءة كاملة بحسب Open Library';
    const link = externalLink(similar ? 'اقرأ النسخة الرقمية المشابهة' : 'اقرأ لدى Open Library', itemUrl, 'global-reading-link global-reading-primary');
    link.dataset.availabilityAction = 'true';
    view.actions.prepend(link);
    return;
  }
  if (statusText === 'lendable' && itemUrl) {
    view.badge.classList.add('available');
    view.badge.textContent = similar ? 'إعارة رقمية · نسخة مشابهة' : 'إعارة رقمية معلنة من المصدر';
    const link = externalLink(similar ? 'استعر النسخة الرقمية المشابهة' : 'استعر من Open Library', itemUrl, 'global-reading-link global-reading-primary');
    link.dataset.availabilityAction = 'true';
    view.actions.prepend(link);
    return;
  }
  if (statusText === 'checked out') {
    view.badge.classList.add('restricted');
    view.badge.textContent = similar ? 'النسخة الرقمية المشابهة معارة حالياً بحسب المصدر' : 'النسخة الرقمية معارة حالياً بحسب المصدر';
    if (itemUrl) {
      const link = externalLink(similar ? 'تحقّق من حالة إعارة النسخة المشابهة' : 'تحقّق من حالة الإعارة', itemUrl);
      link.dataset.availabilityAction = 'true';
      view.actions.prepend(link);
    }
    return;
  }
  if (statusText === 'restricted') {
    view.badge.classList.add('restricted');
    view.badge.textContent = similar ? 'الوصول مقيّد للنسخة المشابهة بحسب Open Library' : 'الوصول مقيّد بحسب Open Library';
  } else if (itemUrl) {
    view.badge.textContent = similar ? 'حالة القراءة غير مؤكدة لنسخة مشابهة؛ راجع المصدر' : 'حالة القراءة غير مؤكدة؛ راجع المصدر';
  } else {
    view.badge.classList.add('restricted');
    view.badge.textContent = 'لم يظهر رابط قراءة أو إعارة لهذا السجل';
  }
  if (itemUrl) {
    const link = externalLink('تفاصيل النسخة الرقمية', itemUrl);
    link.dataset.availabilityAction = 'true';
    view.actions.prepend(link);
  }
}

function showReadFailure(view, error) {
  view.badge.classList.remove('pending', 'available');
  view.badge.classList.add('restricted');
  view.badge.textContent = error?.message?.includes('http_429')
    ? 'المصدر يحدّ الطلبات الآن؛ لم نعرض زر قراءة'
    : 'تعذّر التحقق من الإتاحة؛ راجع صفحة المصدر';
}

function showNoResults(query) {
  const panel = document.createElement('div');
  panel.className = 'global-reading-empty';
  const heading = document.createElement('strong');
  heading.textContent = 'لم يعثر Open Library على نتائج بهذه العبارة.';
  const text = document.createElement('p');
  text.textContent = 'جرّب عنواناً أقصر أو الاسم بلغة أخرى. خلو النتائج هنا لا يعني خلو مكتبات بورسعيد من الكتاب.';
  const link = externalLink('جرّب البحث مباشرة في Open Library', `https://openlibrary.org/search?q=${encodeURIComponent(query)}`);
  panel.append(heading, text);
  if (link) panel.append(link);
  grid.replaceChildren(panel);
}

async function searchBooks({ append = false } = {}) {
  const query = input.value.trim().slice(0, 100);
  if (query.length < 2) {
    status.textContent = 'اكتب حرفين على الأقل للبحث في الفهرس العالمي.';
    return;
  }
  activeQuery = query;
  if (!append) offset = 0;
  if (activeController) activeController.abort();
  activeController = new AbortController();
  const signal = activeController.signal;
  const requestId = ++generation;
  const lang = language.value;
  clearTimeout(debounceTimer);
  setBusy(true);
  moreButton.hidden = true;
  if (!append) {
    grid.replaceChildren();
    status.textContent = 'جارٍ البحث في Open Library؛ لا تُحفظ عبارة البحث على الموقع.';
  } else status.textContent = 'جارٍ تحميل مجموعة أخرى من المصدر…';
  try {
    const params = new URLSearchParams({
      q: query,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      fields: 'key,title,author_name,first_publish_year,cover_i,edition_key',
    });
    if (lang) params.set('lang', lang);
    const result = await limitedJson(`${SEARCH_URL}?${params.toString()}`, signal);
    if (requestId !== generation) return;
    const books = Array.isArray(result.docs) ? result.docs : [];
    if (!append) grid.replaceChildren();
    if (!books.length && !append) {
      showNoResults(query);
      status.textContent = 'لا توجد نتائج مطابقة من Open Library.';
      return;
    }
    const cards = books.map(book => createCard(book));
    for (const view of cards) grid.append(view.card);
    offset += books.length;
    moreButton.hidden = books.length < PAGE_SIZE || offset >= 100;
    for (const view of cards) {
      if (requestId !== generation || signal.aborted) return;
      const edition = Array.isArray(view.book.edition_key)
        ? view.book.edition_key.find(value => typeof value === 'string' && /^OL\d+M$/.test(value)) : null;
      if (!edition) {
        view.badge.classList.remove('pending');
        view.badge.classList.add('restricted');
        view.badge.textContent = 'لا تتوفر نسخة محددة للتحقق؛ راجع بيانات المصدر';
        continue;
      }
      try {
        const readData = await limitedJson(`${READ_URL}${encodeURIComponent(edition)}.json`, signal);
        if (requestId !== generation) return;
        const items = Array.isArray(readData.items) ? readData.items : [];
        const item = items.find(row => row && ['full access', 'lendable', 'checked out', 'restricted'].includes(String(row.status || '').toLowerCase())) || items[0];
        if (item) setAvailability(view, item);
        else {
          view.badge.classList.remove('pending');
          view.badge.classList.add('restricted');
          view.badge.textContent = 'لم يظهر رابط قراءة أو إعارة لهذا السجل';
        }
      } catch (error) {
        if (error?.name === 'AbortError') return;
        showReadFailure(view, error);
      }
    }
    if (requestId === generation) {
      status.textContent = `عرض ${offset} من نتائج هذا البحث في Open Library. الإتاحة الرقمية تخص المصدر العالمي فقط، ولا تثبت وجود الكتاب في مكتبات بورسعيد.`;
    }
  } catch (error) {
    if (error?.name === 'AbortError' || requestId !== generation) return;
    grid.replaceChildren();
    const panel = document.createElement('div');
    panel.className = 'global-reading-empty global-reading-error';
    const heading = document.createElement('strong');
    heading.textContent = 'تعذّر الاتصال بمصدر القراءة الرقمية.';
    const text = document.createElement('p');
    text.textContent = error?.message?.includes('http_429')
      ? 'وصل المصدر إلى حد الطلبات؛ انتظر قليلاً قبل المحاولة. لم نستخدم وسيطاً أو نخزّن الاستعلام.'
      : 'تحقق من اتصالك ثم أعد المحاولة؛ لم نعرض نتائج قديمة على أنها مباشرة.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'global-reading-link global-reading-retry';
    retry.textContent = 'إعادة المحاولة';
    retry.addEventListener('click', () => searchBooks());
    panel.append(heading, text, retry);
    grid.append(panel);
    status.textContent = 'تعذّر إكمال البحث المباشر.';
  } finally {
    if (requestId === generation) setBusy(false);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  searchBooks();
});
input.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  if (input.value.trim().length < 3) return;
  debounceTimer = window.setTimeout(() => searchBooks(), 600);
});
language.addEventListener('change', () => { if (activeQuery) searchBooks(); });
moreButton.addEventListener('click', () => searchBooks({ append: true }));
suggestions.forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.query || '';
  searchBooks();
}));
