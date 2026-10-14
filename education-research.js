const $ = (selector, root = document) => root.querySelector(selector);
const form = $('#educationResearchForm');
const input = $('#educationResearchInput');
const period = $('#educationResearchPeriod');
const status = $('#educationResearchStatus');
const results = $('#educationResearchResults');
const moreButton = $('#educationResearchMore');
const ericLink = $('#educationEricLink');
const suggestions = [...document.querySelectorAll('.education-research-suggestion')];

const API_URL = 'https://api.openalex.org/works';
const PAGE_SIZE = 5;
const MAX_PAGES = 4;
const MIN_REQUEST_GAP_MS = 1100;
let query = '';
let page = 0;
let total = 0;
let generation = 0;
let activeController = null;
let requestQueue = Promise.resolve();
let lastRequestStarted = 0;

function abortError() { return new DOMException('Aborted', 'AbortError'); }

function delayWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = window.setTimeout(done, ms);
    function done() { signal.removeEventListener('abort', cancel); resolve(); }
    function cancel() { window.clearTimeout(timer); reject(abortError()); }
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function limitedJson(url, signal) {
  const run = async () => {
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestStarted));
    if (wait) await delayWithAbort(wait, signal);
    if (signal.aborted) throw abortError();
    lastRequestStarted = Date.now();
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return response.json();
  };
  const request = requestQueue.then(run, run);
  requestQueue = request.catch(() => {});
  return request;
}

function safeHttpsUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

function openAlexRecordUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/openalex\.org\/W\d+$/i.test(value)) return '';
  return value;
}

function doiUrl(value) {
  if (typeof value !== 'string') return '';
  const doi = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();
  if (!/^10\.\d{4,9}\/[^\s<>"']+$/i.test(doi)) return '';
  try {
    const url = new URL(`https://doi.org/${doi}`);
    return url.hostname === 'doi.org' ? url.href : '';
  } catch { return ''; }
}

function makeExternalLink(label, href, className = 'education-research-link') {
  const safeHref = safeHttpsUrl(href);
  if (!safeHref) return null;
  const link = document.createElement('a');
  link.className = className;
  link.href = safeHref;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  const note = document.createElement('span');
  note.className = 'sr-only';
  note.textContent = ' يفتح في موقع خارجي في نافذة جديدة';
  link.append(note);
  return link;
}

function formatDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'التاريخ غير متاح';
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'التاريخ غير متاح';
  return new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
}

function formatCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? new Intl.NumberFormat('ar-EG').format(count) : '—';
}

function typeLabel(type) {
  const labels = {
    article: 'مقال منشور',
    'book-chapter': 'فصل كتاب',
    preprint: 'مسودة بحثية قبل النشر',
    review: 'مراجعة',
    report: 'تقرير',
    dissertation: 'رسالة علمية',
    editorial: 'افتتاحية',
    proceedings: 'ورقة مؤتمر',
  };
  return labels[String(type || '').toLowerCase()] || 'منشور بحثي';
}

function createWorkCard(work) {
  const card = document.createElement('article');
  card.className = 'education-work-card';

  const top = document.createElement('div');
  top.className = 'education-work-top';
  const type = document.createElement('span');
  type.className = 'education-work-type';
  type.textContent = typeLabel(work.type);
  const openAccess = work.open_access?.is_oa === true;
  const access = document.createElement('span');
  access.className = `education-work-access${openAccess ? ' is-open' : ''}`;
  access.textContent = openAccess ? 'مصنّف مفتوح الوصول لدى OpenAlex' : 'تحقّق من الإتاحة لدى المصدر';
  top.append(type, access);

  const title = document.createElement('h3');
  title.textContent = String(work.title || 'عنوان غير متاح').slice(0, 300);

  const authorships = Array.isArray(work.authorships) ? work.authorships : [];
  const authorNames = authorships
    .map(item => item?.author?.display_name)
    .filter(name => typeof name === 'string' && name.trim())
    .slice(0, 4);
  const authors = document.createElement('p');
  authors.className = 'education-work-authors';
  authors.textContent = authorNames.length ? `المؤلفون: ${authorNames.join('، ')}` : 'المؤلفون غير مذكورين في السجل المعروض';

  const sourceName = work.primary_location?.source?.display_name;
  const source = document.createElement('p');
  source.className = 'education-work-source';
  source.textContent = `الدورية / جهة النشر: ${typeof sourceName === 'string' && sourceName.trim() ? sourceName : 'غير محددة في السجل'}`;

  const topicName = work.primary_topic?.display_name;
  const topic = document.createElement('p');
  topic.className = 'education-work-source';
  topic.textContent = `الموضوع المصنّف لدى OpenAlex: ${typeof topicName === 'string' && topicName.trim() ? topicName : 'غير محدد في السجل'}`;

  const dateValue = typeof work.publication_date === 'string'
    ? work.publication_date
    : (Number.isInteger(work.publication_year) ? `${work.publication_year}-01-01` : '');
  const date = document.createElement('p');
  date.className = 'education-work-date';
  date.textContent = `تاريخ النشر المسجّل: ${formatDate(dateValue)}`;

  const actions = document.createElement('div');
  actions.className = 'education-work-actions';
  const openUrl = work.open_access?.is_oa === true ? safeHttpsUrl(work.open_access.oa_url) : '';
  const doi = doiUrl(work.doi);
  const record = openAlexRecordUrl(work.id);
  const primary = makeExternalLink(
    openUrl ? 'افتح النسخة أو صفحة الإتاحة لدى المصدر' : 'افتح سجل OpenAlex',
    openUrl || record,
    'education-research-link education-research-link-primary'
  );
  if (primary) actions.append(primary);
  if (doi && doi !== openUrl) {
    const doiLink = makeExternalLink('معرّف DOI / صفحة الناشر', doi, 'education-research-link education-research-link-muted');
    if (doiLink) actions.append(doiLink);
  }
  card.append(top, title, authors, source, topic, date, actions);
  return card;
}

function createMessage(titleText, bodyText, retry = false) {
  const panel = document.createElement('div');
  panel.className = 'education-research-message';
  const heading = document.createElement('strong');
  heading.textContent = titleText;
  const body = document.createElement('p');
  body.textContent = bodyText;
  panel.append(heading, body);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'education-research-link education-research-retry';
    button.textContent = 'إعادة المحاولة';
    button.addEventListener('click', () => searchWorks());
    panel.append(button);
  }
  return panel;
}

function setBusy(busy) {
  results.setAttribute('aria-busy', String(busy));
  form.querySelector('button[type="submit"]').disabled = busy;
  moreButton.disabled = busy;
}

function makeApiUrl(searchText, pageNumber) {
  const params = new URLSearchParams({
    'search.title_and_abstract': searchText,
    per_page: String(PAGE_SIZE),
    page: String(pageNumber),
    sort: 'publication_date:desc',
    select: 'id,title,publication_date,publication_year,type,doi,open_access,primary_location,primary_topic,authorships',
  });
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filters = ['primary_topic.subfield.id:subfields/3304', 'is_oa:true', `to_publication_date:${today}`];
  if (period.value !== 'all') {
    const years = Math.max(1, Math.min(50, Number(period.value) || 10));
    const sinceDate = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
    const since = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-${String(sinceDate.getDate()).padStart(2, '0')}`;
    filters.push(`from_publication_date:${since}`);
  }
  params.set('filter', filters.join(','));
  return `${API_URL}?${params.toString()}`;
}

async function searchWorks({ append = false } = {}) {
  const submitted = input.value.trim().slice(0, 120);
  if (!append && submitted.length < 2) {
    status.textContent = 'اكتب حرفين على الأقل لبدء البحث في بيانات الأبحاث المفتوحة.';
    return;
  }
  if (!append) {
    query = submitted;
    input.value = query;
    page = 0;
    total = 0;
    results.replaceChildren();
    if (activeController) activeController.abort();
    activeController = new AbortController();
    const ericUrl = `https://eric.ed.gov/?q=${encodeURIComponent(query)}`;
    ericLink.href = ericUrl;
    ericLink.dataset.queryReady = 'true';
  }
  const signal = activeController?.signal;
  if (!signal) return;
  const requestedPage = append ? page + 1 : 1;
  const requestId = ++generation;
  setBusy(true);
  moreButton.hidden = true;
  status.textContent = append
    ? 'جارٍ تحميل مجموعة أخرى من المصدر…'
    : 'جارٍ البحث مباشرة في OpenAlex عن منشورات مفتوحة الوصول؛ لا تُحفظ عبارة البحث في هذا الموقع.';

  try {
    const data = await limitedJson(makeApiUrl(query, requestedPage), signal);
    if (requestId !== generation) return;
    const works = Array.isArray(data.results) ? data.results : [];
    if (!append) results.replaceChildren();
    if (!works.length && !append) {
      results.append(createMessage('لم تظهر نتائج مفتوحة الوصول لهذه العبارة.', 'جرّب موضوعاً أوسع أو ابحث مباشرة في قاعدة ERIC المتخصصة بموارد التعليم.'));
      status.textContent = 'لا توجد نتائج مطابقة في OpenAlex ضمن الفترة المختارة.';
      return;
    }
    if (!works.length && append) {
      status.textContent = 'لا توجد مجموعة إضافية من النتائج لهذا البحث.';
      moreButton.hidden = true;
      return;
    }
    works.forEach(work => results.append(createWorkCard(work)));
    page = requestedPage;
    total = Number(data.meta?.count) || 0;
    const shown = results.querySelectorAll('.education-work-card').length;
    const endReached = works.length < PAGE_SIZE || page >= MAX_PAGES || shown >= total;
    moreButton.hidden = endReached;
    status.textContent = `عرض ${formatCount(shown)} من ${formatCount(total)} سجل مفتوح الوصول، مصنّف ضمن مجال التعليم لدى OpenAlex وحتى تاريخ اليوم. هذا الفهرس لا يثبت التحكيم العلمي ولا يضمن وجود ملف PDF لكل سجل.`;
  } catch (error) {
    if (error?.name === 'AbortError' || requestId !== generation) return;
    if (append) {
      results.append(createMessage('تعذّر تحميل مجموعة إضافية.', 'النتائج التي ظهرت أعلاه تخص البحث الحالي؛ حاول مرة أخرى بعد قليل.', true));
    } else {
      results.replaceChildren(createMessage(
        'تعذّر الاتصال بفهرس الأبحاث.',
        error?.message?.includes('http_429')
          ? 'وصل المصدر إلى حدّ الطلبات الآن؛ انتظر قليلاً قبل إعادة المحاولة.'
          : 'تحقق من اتصالك ثم أعد المحاولة. لم نعرض نتائج قديمة على أنها مباشرة.',
        true
      ));
    }
    status.textContent = 'تعذّر إكمال البحث المباشر.';
  } finally {
    if (requestId === generation) setBusy(false);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  searchWorks();
});
moreButton.addEventListener('click', () => searchWorks({ append: true }));
suggestions.forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.query || '';
  searchWorks();
}));

if (ericLink && !ericLink.href) ericLink.href = 'https://eric.ed.gov/';
