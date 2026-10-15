const BOOKS = [
  {
    title: 'حي بن يقظان',
    author: 'ابن طفيل',
    subject: 'فلسفة عربية، قصة رمزية، التفكير والملاحظة، التراث الأندلسي',
    language: 'العربية',
    kind: 'كتاب كامل',
    availability: 'PDF متاح للقراءة والتنزيل',
    pdf: 'hayy-ibn-yaqzan.pdf',
    source: 'https://ar.wikisource.org/wiki/حي_بن_يقظان',
  },
  {
    title: 'رسالة الغفران',
    author: 'أبو العلاء المعري',
    subject: 'أدب عربي، نقد أدبي، شعر، رحلة تخيّلية، التراث العباسي',
    language: 'العربية',
    kind: 'الكتاب: الجزآن الأول والثاني',
    availability: 'PDF متاح للقراءة والتنزيل',
    pdf: 'risalat-al-ghufran.pdf',
    source: 'https://ar.wikisource.org/wiki/رسالة_الغفران',
  },
  {
    title: 'كليلة ودمنة: باب الأسد والثور',
    author: 'عبد الله بن المقفع',
    subject: 'حكايات، حكم، قصص تراثية، تحليل الشخصيات، الأدب العربي',
    language: 'العربية',
    kind: 'فصل قصصي من الكتاب، وليس الكتاب كاملًا',
    availability: 'PDF متاح للقراءة والتنزيل',
    pdf: 'kalila-wa-dimna-lion-and-bull.pdf',
    source: 'https://ar.wikisource.org/wiki/كليلة_ودمنة/باب_الأسد_والثور_وهو_أول_الكتاب',
  },
];

const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.ar';
const RSS2JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json?rss_url=';
const CACHE_KEY = 'borsaid-live-education-news-v1';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const MAX_NEWS_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_NEWS_ITEMS = 8;
const EDUCATION_TERMS = /تعليم|المدرس|مدارس|طلاب|طالبات|طالب|التعلّم|التعلم|المناهج|جامع[ةات]|معلم|تدريس|مدرسي|مؤسسات تعليمية|مؤسسة تعليمية|school|education|university|universit(?:y|ies)|student|teacher|learning|curriculum/i;
const SOURCES = [
  {
    id: 'un',
    label: 'أخبار الأمم المتحدة',
    feed: 'https://news.un.org/feed/subscribe/ar/news/all/rss.xml',
    allowedHosts: ['news.un.org', 'un.org'],
  },
  {
    id: 'bbc',
    label: 'BBC عربي',
    feed: 'https://feeds.bbci.co.uk/arabic/rss.xml',
    allowedHosts: ['bbc.com', 'bbc.co.uk'],
  },
];

const $ = (selector, root = document) => root.querySelector(selector);

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

function safeHttpsUrl(value, allowedHosts = null) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (allowedHosts && !allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return '';
    return url.href;
  } catch {
    return '';
  }
}

function normalizeArabic(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLocaleLowerCase('ar')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function buildBookCard(book) {
  const card = node('article', 'openbooks-card');
  const top = node('div', 'openbooks-card-top');
  top.append(node('span', 'openbooks-kind', book.kind));
  top.append(node('span', 'openbooks-language', book.language));

  const title = node('h3', 'openbooks-title', book.title);
  const author = node('p', 'openbooks-author', `المؤلف: ${book.author}`);
  const subject = node('p', 'openbooks-subject', `الموضوع: ${book.subject}`);
  const availability = node('p', 'openbooks-availability', book.availability);
  const attribution = node('p', 'openbooks-attribution', `نصّ ${book.title} لمؤلفه ${book.author}؛ مصدر النص ويكي مصدر العربية. النسخة المنشورة في ويكي مصدر مرخّصة برخصة المشاع الإبداعي نَسب المصنّف، الترخيص بالمثل 4.0 (CC BY-SA 4.0). أُعدّ ملف PDF من النص المنشور دون تعديل محتواه.`);

  const actions = node('div', 'openbooks-actions');
  const pdfUrl = new URL(book.pdf, import.meta.url).href;
  const readHere = node('button', 'openbooks-reader-toggle', 'اقرأ هنا');
  readHere.type = 'button';
  readHere.setAttribute('aria-expanded', 'false');
  const readLink = node('a', 'openbooks-action openbooks-read', 'اقرأ PDF');
  readLink.href = pdfUrl;
  readLink.target = '_blank';
  readLink.rel = 'noopener noreferrer';
  readLink.setAttribute('aria-label', `قراءة ${book.title} بصيغة PDF في نافذة جديدة`);
  const downloadLink = node('a', 'openbooks-action openbooks-download', 'تحميل PDF');
  downloadLink.href = pdfUrl;
  downloadLink.download = book.pdf;
  downloadLink.setAttribute('aria-label', `تحميل ${book.title} بصيغة PDF`);
  actions.append(readHere, readLink, downloadLink);

  const reader = node('div', 'openbooks-reader-wrap');
  reader.hidden = true;
  const frame = node('iframe', 'openbooks-reader-frame');
  frame.title = `قارئ PDF لكتاب ${book.title}`;
  frame.loading = 'lazy';
  reader.append(frame);
  readHere.addEventListener('click', () => {
    const opening = reader.hidden;
    reader.hidden = !opening;
    readHere.textContent = opening ? 'إخفاء القراءة' : 'اقرأ هنا';
    readHere.setAttribute('aria-expanded', String(opening));
    card.classList.toggle('is-reading', opening);
    if (opening && !frame.src) frame.src = `${pdfUrl}#view=FitH`;
  });

  const citation = node('div', 'openbooks-citation');
  const sourceLink = node('a', 'openbooks-source-link', 'صفحة النص وبياناته في ويكي مصدر');
  sourceLink.href = book.source;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  const licenseLink = node('a', 'openbooks-license-link', 'بنود CC BY-SA 4.0');
  licenseLink.href = LICENSE_URL;
  licenseLink.target = '_blank';
  licenseLink.rel = 'noopener noreferrer';
  citation.append(sourceLink, node('span', 'openbooks-citation-separator', ' · '), licenseLink);

  card.append(top, title, author, subject, availability, attribution, actions, reader, citation);
  return card;
}

function mountOpenBooks() {
  const readerView = $('#globalReadingView');
  const anchor = $('#globalReading');
  if (!readerView || !anchor || $('#openBooksSection')) return;

  const section = node('section', 'section-wrap openbooks-section');
  section.id = 'openBooksSection';
  section.setAttribute('aria-labelledby', 'openBooksTitle');

  const heading = node('div', 'openbooks-heading');
  const headingCopy = node('div', 'openbooks-heading-copy');
  headingCopy.append(node('span', 'eyebrow', 'الكتاب نفسه · مع ترخيصه ومصدره'));
  headingCopy.append(node('h2', 'openbooks-heading-title', 'كتب عربية كاملة للقراءة الآن'));
  headingCopy.append(node('p', 'openbooks-intro', 'افتح صفحات الكتاب هنا بقارئ PDF أو نزّل الملف. «كليلة ودمنة» المعروض هنا فصل قصصي محدد، بينما رسالة الغفران تشمل الجزأين الأول والثاني.'));
  const count = node('span', 'openbooks-count', `${new Intl.NumberFormat('ar-EG').format(BOOKS.length)} كتب وملفات PDF`);
  heading.append(headingCopy, count);

  const rightsNote = node('aside', 'openbooks-rights-note');
  rightsNote.setAttribute('aria-label', 'معلومات الترخيص والإسناد');
  rightsNote.append(node('span', 'openbooks-rights-icon', 'i'));
  rightsNote.append(node('p', '', 'تُعرض بيانات المؤلف والموضوع واللغة والإتاحة لكل ملف. نصوص ويكي مصدر في هذه المجموعة منشورة وفق CC BY-SA 4.0، الذي يسمح بالنسخ والتوزيع مع الإسناد والمشاركة بالمثل؛ راجع صفحة المصدر والترخيص المرفقتين بكل عنوان.'));

  const form = node('form', 'openbooks-search');
  form.setAttribute('role', 'search');
  const label = node('label', 'openbooks-search-label', 'ابحث في العنوان أو المؤلف أو الموضوع أو اللغة أو الإتاحة');
  label.htmlFor = 'openBooksSearchInput';
  const searchRow = node('div', 'openbooks-search-row');
  const input = node('input', 'openbooks-search-input');
  input.id = 'openBooksSearchInput';
  input.type = 'search';
  input.maxLength = 100;
  input.autocomplete = 'off';
  input.placeholder = 'مثال: ابن طفيل، حكايات، العربية…';
  input.setAttribute('aria-controls', 'openBooksResults');
  input.setAttribute('aria-describedby', 'openBooksSearchStatus');
  const searchButton = node('button', 'openbooks-search-button', 'ابحث');
  searchButton.type = 'submit';
  searchRow.append(input, searchButton);
  const searchStatus = node('p', 'openbooks-search-status', 'تظهر المجموعة كاملة؛ اكتب كلمة لتصفية النتائج فورًا.');
  searchStatus.id = 'openBooksSearchStatus';
  const results = node('div', 'openbooks-grid');
  results.id = 'openBooksResults';
  results.setAttribute('aria-live', 'polite');
  results.setAttribute('aria-busy', 'false');
  form.append(label, searchRow, searchStatus);

  function renderBooks() {
    const query = normalizeArabic(input.value);
    const words = query ? query.split(/\s+/).filter(Boolean) : [];
    const matches = BOOKS.filter(book => {
      const text = normalizeArabic([
        book.title, book.author, book.subject, book.language, book.kind, book.availability,
        'ويكي مصدر', 'CC BY-SA 4.0', 'قراءة تنزيل PDF',
      ].join(' '));
      return words.every(word => text.includes(word));
    });
    results.replaceChildren();
    if (matches.length) {
      matches.forEach(book => results.append(buildBookCard(book)));
      searchStatus.textContent = query
        ? `عدد النتائج المطابقة: ${new Intl.NumberFormat('ar-EG').format(matches.length)} من ${new Intl.NumberFormat('ar-EG').format(BOOKS.length)}.`
        : `عدد العناوين: ${new Intl.NumberFormat('ar-EG').format(BOOKS.length)}.`;
    } else {
      const empty = node('div', 'openbooks-empty');
      empty.append(node('strong', '', 'لا توجد نتيجة مطابقة في هذه المجموعة.'));
      empty.append(node('p', '', 'جرّب اسم المؤلف أو موضوعًا أوسع؛ البحث يقتصر على الملفات المرخّصة المعروضة هنا.'));
      results.append(empty);
      searchStatus.textContent = 'لا توجد نتائج مطابقة.';
    }
  }

  input.addEventListener('input', renderBooks);
  form.addEventListener('submit', event => {
    event.preventDefault();
    renderBooks();
  });
  section.append(heading, rightsNote, form, results);
  anchor.before(section);

  const sideLinks = $('.portal-side-links');
  if (sideLinks && !sideLinks.querySelector('[href="#openBooksSection"]')) {
    const quickLink = node('a', 'portal-side-link portal-side-books');
    quickLink.href = '#openBooksSection';
    const icon = node('span', 'portal-side-icon', 'PDF');
    icon.setAttribute('aria-hidden', 'true');
    const copy = node('span', 'portal-side-copy');
    copy.append(node('strong', '', 'كتب PDF مرخّصة'));
    copy.append(node('small', '', 'ابحث واقرأ من المجموعة العربية'));
    quickLink.append(icon, copy, node('span', 'portal-side-arrow', '←'));
    sideLinks.append(quickLink);
  }
  renderBooks();
}

function stripMarkup(value) {
  if (typeof value !== 'string') return '';
  const parsed = new DOMParser().parseFromString(value.slice(0, 20000), 'text/html');
  parsed.querySelectorAll('script,style,iframe,object,embed,form').forEach(element => element.remove());
  return String(parsed.body.textContent || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseNewsDate(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function sanitizeNewsItem(raw, source, now) {
  if (!raw || typeof raw !== 'object') return null;
  const title = stripMarkup(raw.title).slice(0, 300);
  const summary = stripMarkup(raw.description || raw.content).slice(0, 420);
  const published = parseNewsDate(raw.pubDate || raw.published || raw.date);
  const url = safeHttpsUrl(raw.link || raw.url, source.allowedHosts);
  if (!title || !published || !url) return null;
  const age = now - published.getTime();
  if (age < -5 * 60 * 1000 || age > MAX_NEWS_AGE_MS) return null;
  if (!EDUCATION_TERMS.test(`${title} ${summary}`)) return null;
  return {
    key: `${source.id}:${url}`,
    sourceId: source.id,
    source: source.label,
    title,
    summary: summary || 'لا يتوفر ملخص في التغذية؛ افتح المصدر لقراءة التفاصيل.',
    url,
    publishedAt: published.toISOString(),
  };
}

function formatCairoDate(value, includeTime = true) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'الوقت غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Africa/Cairo',
  }).format(date);
}

function normalizeCachedItems(value) {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const result = [];
  for (const raw of value) {
    const source = SOURCES.find(item => item.id === raw?.sourceId);
    if (!source) continue;
    const sanitized = sanitizeNewsItem({
      title: raw.title,
      description: raw.summary,
      pubDate: raw.publishedAt,
      link: raw.url,
    }, source, now);
    if (sanitized) result.push(sanitized);
  }
  return result;
}

function readCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    const checkedAt = Number(saved?.checkedAt);
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt >= REFRESH_INTERVAL_MS) return null;
    return { checkedAt, items: normalizeCachedItems(saved.items) };
  } catch {
    return null;
  }
}

function saveCache(checkedAt, items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt, items }));
  } catch {
    // Local storage is optional; live fetching still works when it is unavailable.
  }
}

function mountLiveNews() {
  const home = $('#homeView');
  const archive = $('#homeNews');
  const books = $('#openBooksSection');
  if (!home || !archive || $('#liveBreakingNews')) return;

  const section = node('section', 'section-wrap livealert-section');
  section.id = 'liveBreakingNews';
  section.setAttribute('aria-labelledby', 'liveBreakingTitle');
  const heading = node('div', 'livealert-heading');
  const headingCopy = node('div', 'livealert-heading-copy');
  headingCopy.append(node('span', 'eyebrow', 'موجز مباشر من المصادر المختارة'));
  headingCopy.append(node('h2', 'livealert-title', 'أخبار عاجلة الآن'));
  headingCopy.append(node('p', 'livealert-description', 'آخر الأخبار المتصلة بالتعليم كما تنشرها المصادر المحددة؛ لا يمثّل هذا المربع تغطية لكل الأخبار العاجلة عالميًا.'));
  const controls = node('div', 'livealert-controls');
  const cadence = node('span', 'livealert-cadence', 'تحديث تلقائي كل ١٥ دقيقة');
  const refreshButton = node('button', 'livealert-refresh', 'تحديث الآن');
  refreshButton.type = 'button';
  refreshButton.setAttribute('aria-controls', 'liveBreakingResults');
  controls.append(cadence, refreshButton);
  heading.append(headingCopy, controls);

  const status = node('p', 'livealert-status', 'جارٍ الاتصال بمصادر الأخبار المختارة…');
  status.id = 'liveBreakingStatus';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const grid = node('div', 'livealert-grid');
  grid.id = 'liveBreakingResults';
  grid.setAttribute('aria-live', 'polite');
  grid.setAttribute('aria-busy', 'true');
  const note = node('p', 'livealert-note', 'المصادر: أخبار الأمم المتحدة باللغة العربية وBBC عربي. تُقرأ تغذيات RSS الأصلية عبر خدمة تحويل عامة إلى JSON لتمكين الطلبات من موقع ثابت؛ عناوين الأخبار وملخصاتها وروابطها تُنسب إلى الناشرين. عند تعذر الاتصال أو عدم وجود خبر تعليمي حديث، تظهر الحالة بوضوح ولا يُعرض خبر قديم على أنه عاجل.');
  section.append(heading, status, grid, note);
  (books || archive).before(section);

  let currentItems = [];
  let lastCheckedAt = 0;
  let lastItemsUpdatedAt = 0;
  let refreshing = false;

  function renderItems(items) {
    grid.replaceChildren();
    if (!items.length) {
      const empty = node('div', 'livealert-empty');
      empty.append(node('strong', '', 'لا توجد أخبار تعليمية حديثة في المصادر المختارة الآن.'));
      empty.append(node('p', '', 'قد لا تنشر المصادر خبرًا تعليميًا كل لحظة؛ اضغط «تحديث الآن» أو انتظر دورة التحديث التالية.'));
      grid.append(empty);
      grid.setAttribute('aria-busy', 'false');
      return;
    }

    for (const item of items.slice(0, MAX_NEWS_ITEMS)) {
      const card = node('article', 'livealert-card');
      const meta = node('div', 'livealert-card-meta');
      meta.append(node('span', 'livealert-source', item.source));
      const time = node('time', 'livealert-date', formatCairoDate(item.publishedAt));
      time.dateTime = item.publishedAt;
      meta.append(time);
      card.append(meta, node('h3', 'livealert-card-title', item.title), node('p', 'livealert-card-summary', item.summary));
      const link = node('a', 'livealert-source-link', 'اقرأ الخبر في المصدر الأصلي');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.append(link);
      grid.append(card);
    }
    grid.setAttribute('aria-busy', 'false');
  }

  function updateStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  async function fetchSource(source) {
    const url = `${RSS2JSON_ENDPOINT}${encodeURIComponent(source.feed)}`;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`http_${response.status}`);
      const data = await response.json();
      if (data?.status !== 'ok' || !Array.isArray(data.items)) throw new Error('feed_unavailable');
      const now = Date.now();
      return data.items.map(item => sanitizeNewsItem(item, source, now)).filter(Boolean);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    refreshButton.disabled = true;
    refreshButton.textContent = 'جارٍ التحديث…';
    grid.setAttribute('aria-busy', 'true');
    if (!currentItems.length) updateStatus('جارٍ التحقق من تغذيات الأخبار العربية…');

    const results = await Promise.allSettled(SOURCES.map(fetchSource));
    const checkedAt = Date.now();
    lastCheckedAt = checkedAt;
    const failed = [];
    const freshItems = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') freshItems.push(...result.value);
      else failed.push(SOURCES[index].label);
    });

    if (freshItems.length || !failed.length) {
      const unique = new Map();
      for (const item of freshItems) {
        const key = item.url.replace(/[?#].*$/, '').toLocaleLowerCase('en');
        if (!unique.has(key)) unique.set(key, item);
      }
      currentItems = [...unique.values()]
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, MAX_NEWS_ITEMS);
      lastItemsUpdatedAt = checkedAt;
      renderItems(currentItems);
      saveCache(checkedAt, currentItems);
    } else {
      grid.setAttribute('aria-busy', 'false');
      if (!currentItems.length) renderItems([]);
    }

    const checkedText = `آخر تحقق: ${formatCairoDate(checkedAt)} · التحديث التلقائي كل ١٥ دقيقة.`;
    if (failed.length === SOURCES.length) {
      updateStatus(currentItems.length
        ? `تعذّر تحديث المصدرين؛ نعرض آخر نتائج محفوظة من ${formatCairoDate(lastItemsUpdatedAt || lastCheckedAt)}.`
        : 'تعذّر الاتصال بمصادر الأخبار الآن. استخدم زر التحديث لإعادة المحاولة.', true);
    } else if (failed.length) {
      updateStatus(`${checkedText} تعذّر الاتصال بـ ${failed.join(' و')}؛ الأخبار الظاهرة من المصدر الذي استجاب.`, true);
    } else {
      updateStatus(checkedText);
    }

    refreshing = false;
    refreshButton.disabled = false;
    refreshButton.textContent = 'تحديث الآن';
  }

  refreshButton.addEventListener('click', refresh);
  const cached = readCache();
  if (cached) {
    currentItems = cached.items;
    lastCheckedAt = cached.checkedAt;
    lastItemsUpdatedAt = cached.checkedAt;
    renderItems(currentItems);
    updateStatus(`آخر تحقق: ${formatCairoDate(lastCheckedAt)} · التحديث التالي خلال ١٥ دقيقة كحد أقصى.`);
    const wait = Math.max(1000, REFRESH_INTERVAL_MS - (Date.now() - cached.checkedAt));
    window.setTimeout(refresh, wait);
  } else {
    refresh();
  }
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt >= REFRESH_INTERVAL_MS) refresh();
  }, 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt >= REFRESH_INTERVAL_MS) refresh();
  });
}

mountOpenBooks();
mountLiveNews();
