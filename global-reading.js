const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const form = $('#globalReadingForm');
const input = $('#globalReadingInput');
const sourceSelect = $('#globalReadingSource');
const digitalFilter = $('#globalReadingDigitalFilter');
const digitalOnly = $('#globalReadingOnlineOnly');
const status = $('#globalReadingStatus');
const grid = $('#globalReadingResults');
const moreButton = $('#globalReadingMore');
const submitButton = form.querySelector('button[type="submit"]');
const suggestions = $$('.global-reading-suggestion');
const PAGE_SIZE = 12;
const MIN_REQUEST_GAP_MS = 1100;
const REQUEST_TIMEOUT_MS = 20000;
const LOC_BOOKS_URL = 'https://www.loc.gov/books/';
let activeQuery = '';
let currentPage = 1;
let totalResults = 0;
let loadedCount = 0;
let visibleCount = 0;
let generation = 0;
let activeController = null;
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

async function limitedJson(url, signal) {
  const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestStarted));
  if (wait) await delayWithAbort(wait, signal);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  lastRequestStarted = Date.now();
  const requestController = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => { timedOut = true; requestController.abort(); }, REQUEST_TIMEOUT_MS);
  const abortRequest = () => requestController.abort();
  signal.addEventListener('abort', abortRequest, { once: true });
  try {
    const response = await fetch(url, {
      signal: requestController.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return await response.json();
  } catch (error) {
    if (timedOut) throw new Error('http_timeout');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abortRequest);
  }
}

function setBusy(busy) {
  grid.setAttribute('aria-busy', String(busy));
  submitButton.disabled = busy;
  moreButton.disabled = busy;
  moreButton.textContent = busy ? 'جارٍ تحميل النتائج…' : 'تحميل المزيد من النتائج';
}

function safeLocUrl(value, allowTile = false) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const candidate = new URL(value.startsWith('//') ? `https:${value}` : value);
    const host = candidate.hostname.toLowerCase();
    const allowedHost = host === 'loc.gov' || host.endsWith('.loc.gov');
    if (!allowedHost || (!allowTile && host === 'tile.loc.gov') || !['https:', 'http:'].includes(candidate.protocol) || candidate.username || candidate.password || candidate.port) return '';
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

function createEmptyPanel(titleText, descriptionText, linkLabel, href) {
  const panel = document.createElement('div');
  panel.className = 'global-reading-empty';
  const heading = document.createElement('strong');
  heading.textContent = titleText;
  const text = document.createElement('p');
  text.textContent = descriptionText;
  panel.append(heading, text);
  const link = externalLink(linkLabel, href);
  if (link) panel.append(link);
  return panel;
}

function resetCounts() {
  currentPage = 1;
  totalResults = 0;
  loadedCount = 0;
  visibleCount = 0;
}

function updateSourceControls() {
  const isLoc = sourceSelect.value === 'loc';
  digitalFilter.hidden = !isLoc;
  if (!isLoc) digitalOnly.checked = false;
}

function showAlexandriaSearch(query) {
  const url = new URL('https://balis.bibalex.org/AR/OPAC/Home/SearchOpac');
  url.searchParams.set('keyword', query);
  const panel = document.createElement('article');
  panel.className = 'global-book-card';
  const top = document.createElement('div');
  top.className = 'global-book-card-top';
  const source = document.createElement('span');
  source.className = 'global-book-source';
  source.textContent = 'فهرس مكتبة الإسكندرية · BALIS';
  const badge = document.createElement('span');
  badge.className = 'global-book-status pending';
  badge.textContent = 'فهرس ببليوجرافي';
  top.append(source, badge);
  const body = document.createElement('div');
  body.className = 'global-book-body';
  const details = document.createElement('div');
  details.className = 'global-book-details';
  const title = document.createElement('h3');
  title.textContent = `بحث عن: ${query}`;
  const description = document.createElement('p');
  description.className = 'global-book-author';
  description.textContent = 'يفتح هذا الرابط البحث مباشرة في فهرس المكتبة الإلكتروني. يعرض الفهرس بيانات الكتب والمقتنيات؛ ولا يعني ظهور سجل أن نص الكتاب متاح للقراءة الرقمية.';
  details.append(title, description);
  body.append(details);
  const actions = document.createElement('div');
  actions.className = 'global-book-actions';
  actions.append(externalLink('افتح نتائج فهرس الإسكندرية', url.href, 'global-reading-link global-reading-primary'));
  actions.append(externalLink('الصفحة الرئيسية للفهرس', 'https://balis.bibalex.org/AR/OPAC/Home/SearchOpac'));
  panel.append(top, body, actions);
  grid.replaceChildren(panel);
  moreButton.hidden = true;
  status.textContent = 'الرابط جاهز؛ ستُفتح نتائج البحث من موقع مكتبة الإسكندرية الرسمي. هذا الفهرس مستقل عن مقتنيات بورسعيد.';
}

function onlineFormats(record) {
  return Array.isArray(record?.online_format)
    ? record.online_format.filter(value => typeof value === 'string' && value.trim()).slice(0, 4)
    : [];
}

function isOnlineRecord(record) {
  return onlineFormats(record).length > 0 && record?.access_restricted !== true;
}

function resourcePageUrl(record) {
  if (record?.access_restricted === true || !Array.isArray(record?.resources)) return '';
  for (const resource of record.resources) {
    const url = safeLocUrl(resource?.url);
    if (url) return url;
  }
  return '';
}

function shortText(value, limit = 260) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join(' · ').slice(0, limit);
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function createLocCard(record, query) {
  const card = document.createElement('article');
  card.className = 'global-book-card';
  const top = document.createElement('div');
  top.className = 'global-book-card-top';
  const source = document.createElement('span');
  source.className = 'global-book-source';
  source.textContent = 'مكتبة الكونجرس · سجل فهرسي';
  const badge = document.createElement('span');
  badge.className = 'global-book-status';
  const formats = onlineFormats(record);
  if (record?.access_restricted === true) {
    badge.classList.add('restricted');
    badge.textContent = 'الوصول الكامل مقيّد بالموقع بحسب LOC';
  } else if (formats.length && record?.access_restricted === false) {
    badge.classList.add('available');
    badge.textContent = `صيغة رقمية مسجلة: ${formats.join('، ')}`;
  } else if (formats.length) {
    badge.classList.add('pending');
    badge.textContent = `صيغة رقمية مسجلة (${formats.join('، ')})؛ تحقق من الشروط`;
  } else {
    badge.classList.add('restricted');
    badge.textContent = 'لا تظهر صيغة رقمية في بيانات هذا السجل';
  }
  top.append(source, badge);

  const body = document.createElement('div');
  body.className = 'global-book-body';
  const details = document.createElement('div');
  details.className = 'global-book-details';
  const title = document.createElement('h3');
  title.textContent = shortText(record?.title, 240) || 'عنوان غير متاح';
  const contributor = document.createElement('p');
  contributor.className = 'global-book-author';
  const contributors = shortText(record?.contributor, 180);
  contributor.textContent = contributors ? `المؤلف/المساهم: ${contributors}` : 'بيانات المؤلف أو المساهم غير متاحة';
  const meta = document.createElement('p');
  meta.className = 'global-book-meta';
  const metadata = [record?.date ? `التاريخ: ${shortText(record.date, 40)}` : '',
    shortText(record?.original_format, 100) ? `النوع: ${shortText(record.original_format, 100)}` : '']
    .filter(Boolean).join(' · ');
  meta.textContent = `${metadata ? `${metadata} · ` : ''}مصدر البيانات: مكتبة الكونجرس`;
  details.append(title, contributor, meta);
  const descriptionText = shortText(record?.description, 300);
  if (descriptionText) {
    const description = document.createElement('p');
    description.className = 'global-book-author';
    description.textContent = descriptionText;
    details.append(description);
  }
  body.append(details);

  const actions = document.createElement('div');
  actions.className = 'global-book-actions';
  const recordUrl = safeLocUrl(record?.url) || safeLocUrl(record?.id) || `https://www.loc.gov/books/?q=${encodeURIComponent(query)}`;
  actions.append(externalLink('افتح لدى مكتبة الكونجرس', recordUrl, 'global-reading-link global-reading-primary'));
  const resourceUrl = resourcePageUrl(record);
  if (resourceUrl) actions.append(externalLink('افتح صفحة المورد الرقمي', resourceUrl));
  card.append(top, body, actions);
  return card;
}

function showNoResults(query, digitalFilterActive) {
  const title = digitalFilterActive ? 'لم تظهر سجلات بصيغة رقمية في هذه الدفعة.' : 'لم يعثر فهرس الكتب في مكتبة الكونجرس على نتائج بهذه العبارة.';
  const description = digitalFilterActive
    ? 'أُخفيت السجلات التي لا يظهر فيها تنسيق إلكتروني، أو التي يذكر LOC أن الوصول الكامل إليها مقيّد بالموقع. يمكنك تحميل دفعة أخرى أو إلغاء الفلتر.'
    : 'جرّب عنواناً أقصر أو الاسم بلغة أخرى. هذه النتائج مستقلة عن مقتنيات المكتبة المدرسية الرقمية.';
  const url = new URL(LOC_BOOKS_URL);
  url.searchParams.set('q', query);
  grid.replaceChildren(createEmptyPanel(title, description, 'ابحث مباشرة في موقع مكتبة الكونجرس', url.href));
}

function showFailure(error, append, query) {
  const message = error?.message === 'http_429'
    ? 'وصلت واجهة المصدر إلى حد الطلبات؛ انتظر قليلاً ثم أعد المحاولة.'
    : error?.message === 'http_timeout'
      ? 'انتهت مهلة الاتصال بمكتبة الكونجرس؛ أعد المحاولة أو افتح موقع المصدر مباشرة.'
      : 'تعذّر الاتصال بواجهة مكتبة الكونجرس الآن؛ لم نعرض نتائج قديمة على أنها مباشرة.';
  if (!append) {
    const url = new URL(LOC_BOOKS_URL);
    url.searchParams.set('q', query);
    const panel = createEmptyPanel('تعذّر إكمال البحث المباشر.', message, 'فتح البحث في موقع مكتبة الكونجرس', url.href);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'global-reading-link global-reading-retry';
    retry.textContent = 'إعادة المحاولة';
    retry.addEventListener('click', () => searchBooks());
    panel.append(retry);
    grid.replaceChildren(panel);
  }
  status.textContent = append ? `تعذّر تحميل الدفعة التالية. ${message}` : 'تعذّر إكمال البحث المباشر.';
}

async function searchBooks({ append = false } = {}) {
  const query = (append ? activeQuery : input.value.trim()).slice(0, 100);
  if (query.length < 2) {
    status.textContent = 'اكتب حرفين على الأقل ثم ابدأ البحث.';
    return;
  }
  if (activeController) activeController.abort();
  activeController = null;
  const requestId = ++generation;
  activeQuery = query;
  if (!append) resetCounts();
  moreButton.hidden = true;
  setBusy(true);

  if (sourceSelect.value === 'alexandria') {
    grid.replaceChildren();
    showAlexandriaSearch(query);
    setBusy(false);
    return;
  }

  const signalController = new AbortController();
  activeController = signalController;
  const signal = signalController.signal;
  if (!append) {
    grid.replaceChildren();
    status.textContent = 'جارٍ البحث في سجلات الكتب لدى مكتبة الكونجرس؛ لا تُحفظ عبارة البحث على الموقع.';
  } else {
    status.textContent = 'جارٍ تحميل دفعة أخرى من سجلات المصدر…';
  }

  try {
    const params = new URLSearchParams({ fo: 'json', at: 'results,pagination', q: query, c: String(PAGE_SIZE), sp: String(append ? currentPage + 1 : 1) });
    const result = await limitedJson(`${LOC_BOOKS_URL}?${params.toString()}`, signal);
    if (requestId !== generation) return;
    const records = Array.isArray(result?.results) ? result.results : [];
    const pagination = result?.pagination || {};
    currentPage = Number(pagination.current) || (append ? currentPage + 1 : 1);
    if (!append) totalResults = Number(pagination.of) || 0;
    loadedCount += records.length;
    const matches = digitalOnly.checked ? records.filter(isOnlineRecord) : records;
    visibleCount += matches.length;

    if (!records.length && !append) {
      showNoResults(query, false);
    } else if (matches.length) {
      if (!append) grid.replaceChildren();
      else grid.querySelector('.global-reading-empty')?.remove();
      for (const record of matches) grid.append(createLocCard(record, query));
    } else if (!append && grid.childElementCount === 0) {
      showNoResults(query, digitalOnly.checked);
    } else if (append && grid.childElementCount === 0) {
      grid.replaceChildren(createEmptyPanel('لم تظهر صيغة رقمية في هذه الدفعة.', 'أُخفيت السجلات غير المطابقة للفلتر. حمّل دفعة أخرى أو ألغِ الفلتر؛ فهرس الكونجرس لا يضمن القراءة المجانية أو النص الكامل.', '', ''));
    }

    moreButton.hidden = !(typeof pagination.next === 'string' && pagination.next);
    if (digitalOnly.checked) {
      status.textContent = `يعرض الفلتر ${visibleCount} سجلاً بصيغة إلكترونية غير معلنة كـمقيّدة للموقع، من ${loadedCount} سجل تم تحميله${totalResults ? `؛ إجمالي نتائج المصدر ${totalResults}` : ''}. قد تختلف حقوق القراءة ونوع المورد.`;
    } else {
      status.textContent = `تم تحميل ${loadedCount} سجل${totalResults ? ` من إجمالي ${totalResults}` : ''} من فهرس مكتبة الكونجرس. الصيغة الرقمية لا تعني بالضرورة قراءة مجانية أو نصاً كاملاً.`;
    }
  } catch (error) {
    if (error?.name === 'AbortError' || requestId !== generation) return;
    showFailure(error, append, query);
    moreButton.hidden = append ? false : true;
  } finally {
    if (requestId === generation) {
      activeController = null;
      setBusy(false);
    }
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  searchBooks();
});
sourceSelect.addEventListener('change', () => {
  if (activeController) activeController.abort();
  activeController = null;
  generation++;
  resetCounts();
  grid.replaceChildren();
  moreButton.hidden = true;
  setBusy(false);
  updateSourceControls();
  status.textContent = sourceSelect.value === 'loc'
    ? 'اكتب عنواناً أو مؤلفاً للبحث في كتب مكتبة الكونجرس، ثم اضغط «ابحث في المصدر».'
    : 'اكتب عنواناً أو مؤلفاً لفتح بحث مباشر في فهرس مكتبة الإسكندرية.';
});
digitalOnly.addEventListener('change', () => {
  if (activeQuery || input.value.trim().length >= 2) searchBooks();
  else status.textContent = 'اكتب عبارة البحث أولاً، ثم سيُطبّق الفلتر على سجلات مكتبة الكونجرس.';
});
moreButton.addEventListener('click', () => searchBooks({ append: true }));
suggestions.forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.query || '';
  searchBooks();
}));
updateSourceControls();
