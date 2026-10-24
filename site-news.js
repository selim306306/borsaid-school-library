const NEWS_PATH = new URL('./news.json', import.meta.url);
const NEWS_HOME_COUNT = 3;
const NEWS_ARCHIVE_PAGE_SIZE = 6;

const homeGrid = document.querySelector('#homeNewsGrid');
const educationGrid = document.querySelector('#educationNewsGrid');
const archivePagination = document.querySelector('#educationNewsPagination');
const archivePageSummary = document.querySelector('#educationNewsPageSummary');
const previousPageButton = document.querySelector('#educationNewsPrevious');
const nextPageButton = document.querySelector('#educationNewsNext');
const statusNodes = [
  document.querySelector('#homeNewsStatus'),
  document.querySelector('#educationNewsStatus'),
].filter(Boolean);
const updatedNodes = [
  document.querySelector('#homeNewsUpdated'),
  document.querySelector('#educationNewsUpdated'),
].filter(Boolean);

let archivedItems = [];
let currentArchivePage = 1;

function setStatus(message, isError = false) {
  for (const node of statusNodes) {
    node.textContent = message;
    node.classList.toggle('is-error', isError);
  }
}

function formatArabicDate(value, precision = 'day') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'تاريخ النشر غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: precision === 'month' ? undefined : 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(date);
}

function formatArabicNumber(value) {
  return new Intl.NumberFormat('ar-EG').format(value);
}

function formatCadence(data) {
  const configuredSeconds = Number(data.schedule_interval_seconds);
  const intervalSeconds = Number.isFinite(configuredSeconds) && configuredSeconds > 0
    ? configuredSeconds
    : Number(data.schedule_interval_hours) * 3600;
  const hours = intervalSeconds / 3600;
  return Number.isInteger(hours) && hours > 0
    ? `المراجعة كل ${formatArabicNumber(hours)} ساعة`
    : 'دورية المراجعة غير محددة';
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function validNewsImageUrl(value) {
  const safeUrl = validHttpsUrl(value);
  if (!safeUrl) return '';
  const url = new URL(safeUrl);
  return url.username || url.password ? '' : url.href;
}

function canonicalSourceUrl(value) {
  const safeUrl = validHttpsUrl(value);
  if (!safeUrl) return '';
  const url = new URL(safeUrl);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.origin}${url.pathname}`;
}

function deduplicateItems(items) {
  const seenIds = new Set();
  const seenUrls = new Set();
  return items.filter(item => {
    const id = String(item.id ?? '').trim().toLocaleLowerCase();
    const sourceUrl = canonicalSourceUrl(item.source_url);
    if ((id && seenIds.has(id)) || (sourceUrl && seenUrls.has(sourceUrl))) return false;
    if (id) seenIds.add(id);
    if (sourceUrl) seenUrls.add(sourceUrl);
    return true;
  });
}

function makeText(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(value ?? '');
  return element;
}

function createNewsCard(item) {
  const article = document.createElement('article');
  article.className = 'education-news-card live-news-card';
  const itemId = String(item.id ?? '').trim();
  const detailUrl = itemId ? `news.html?id=${encodeURIComponent(itemId)}` : 'news.html';
  article.setAttribute('data-news-id', itemId);
  article.setAttribute('role', 'link');
  article.setAttribute('tabindex', '0');
  const openDetails = () => { window.location.href = detailUrl; };
  article.addEventListener('click', event => {
    if (event.target?.closest?.('a')) return;
    openDetails();
  });
  article.addEventListener('keydown', event => {
    if (event.target?.closest?.('a,button')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetails();
    }
  });

  const top = document.createElement('div');
  top.className = 'education-news-card-top';
  top.append(
    makeText('span', 'news-source-name', item.source_name || 'مصدر موثوق'),
    makeText('span', 'news-language-tag', item.source_language === 'ar' ? 'ملخص عربي' : 'ترجمة موجزة'),
  );
  article.append(top);
  const imageUrl = validNewsImageUrl(item.image_url ?? item.media_url ?? item.og_image);
  if (imageUrl) {
    const figure = document.createElement('div');
    figure.className = 'news-card-image-wrap';
    const image = document.createElement('img');
    image.className = 'news-card-image';
    image.src = imageUrl;
    image.alt = item.image_alt || `${String(item.source_name || 'مصدر الخبر').trim()} — صورة الخبر`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => figure.remove());
    figure.append(image);
    article.append(figure);
    if (item.image_credit) {
      const credit = makeText('small', 'news-image-credit', item.image_credit);
      const licenseUrl = validHttpsUrl(item.image_license_url);
      if (licenseUrl && item.image_license) {
        const license = makeText('a', 'news-image-license', ` · ${item.image_license}`);
        license.href = licenseUrl;
        license.target = '_blank';
        license.rel = 'noopener noreferrer';
        credit.append(license);
      }
      article.append(credit);
    }
  }
  const title = makeText('h3', 'news-card-title', '');
  const detailLink = makeText('a', 'news-detail-link', item.title_ar);
  detailLink.href = detailUrl;
  title.append(detailLink);
  article.append(title);
  article.append(makeText('p', 'news-card-summary', item.summary_ar));

  const metadata = document.createElement('div');
  metadata.className = 'news-card-metadata';
  metadata.append(
    makeText('span', 'news-category', item.category || 'أخبار المكتبات'),
    makeText('time', 'news-date', formatArabicDate(item.published_at, item.date_precision)),
  );
  const time = metadata.querySelector('time');
  if (time && item.published_at) time.dateTime = item.published_at;
  article.append(metadata);

  const sourceUrl = validHttpsUrl(item.source_url);
  if (sourceUrl) {
    const link = document.createElement('a');
    link.className = 'education-research-link news-source-link';
    link.href = sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.append(document.createTextNode('افتح المصدر الأصلي '));
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    link.append(arrow);
    article.append(link);
  }
  return article;
}

function renderGrid(grid, items) {
  if (!grid) return;
  grid.replaceChildren();
  for (const item of items) grid.append(createNewsCard(item));
  grid.setAttribute('aria-busy', 'false');
}

function renderArchivePage() {
  const pageCount = Math.max(1, Math.ceil(archivedItems.length / NEWS_ARCHIVE_PAGE_SIZE));
  currentArchivePage = Math.min(Math.max(currentArchivePage, 1), pageCount);
  const startIndex = (currentArchivePage - 1) * NEWS_ARCHIVE_PAGE_SIZE;
  const pageItems = archivedItems.slice(startIndex, startIndex + NEWS_ARCHIVE_PAGE_SIZE);
  renderGrid(educationGrid, pageItems);

  if (archivePagination) archivePagination.hidden = archivedItems.length === 0;
  if (archivePageSummary) {
    const firstItem = archivedItems.length ? startIndex + 1 : 0;
    const lastItem = Math.min(startIndex + NEWS_ARCHIVE_PAGE_SIZE, archivedItems.length);
    archivePageSummary.textContent = `الأخبار ${formatArabicNumber(firstItem)}–${formatArabicNumber(lastItem)} من ${formatArabicNumber(archivedItems.length)} · الصفحة ${formatArabicNumber(currentArchivePage)} من ${formatArabicNumber(pageCount)}`;
  }
  if (previousPageButton) previousPageButton.disabled = currentArchivePage <= 1;
  if (nextPageButton) nextPageButton.disabled = currentArchivePage >= pageCount;
}

previousPageButton?.addEventListener('click', () => {
  if (currentArchivePage <= 1) return;
  currentArchivePage -= 1;
  renderArchivePage();
});
nextPageButton?.addEventListener('click', () => {
  const pageCount = Math.ceil(archivedItems.length / NEWS_ARCHIVE_PAGE_SIZE);
  if (currentArchivePage >= pageCount) return;
  currentArchivePage += 1;
  renderArchivePage();
});

async function loadNews() {
  for (const grid of [homeGrid, educationGrid].filter(Boolean)) grid.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`${NEWS_PATH.href}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('news_unavailable');
    const data = await response.json();
    const validItems = Array.isArray(data.items) ? data.items.filter(item => {
      const publishedAt = item?.published_at ? new Date(item.published_at).getTime() : NaN;
      return item && typeof item.title_ar === 'string' && item.title_ar.trim() &&
        typeof item.summary_ar === 'string' && item.summary_ar.trim() &&
        typeof item.source_name === 'string' && item.source_name.trim() && validHttpsUrl(item.source_url) &&
        Number.isFinite(publishedAt);
    }) : [];

    archivedItems = deduplicateItems(validItems).sort((a, b) => {
      const dateDifference = new Date(b.published_at) - new Date(a.published_at);
      return dateDifference || String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });
    currentArchivePage = 1;
    const libraryNewsItems = archivedItems.filter(item => (item.scope === 'libraries' || item.scope === 'school-library') && item.home_excluded !== true);
    renderGrid(homeGrid, libraryNewsItems.slice(0, NEWS_HOME_COUNT));
    renderArchivePage();

    if (data.updated_at) {
      const updated = `آخر تحديث للأخبار: ${formatArabicDate(data.updated_at)} · ${formatCadence(data)}`;
      for (const node of updatedNodes) node.textContent = updated;
    } else {
      for (const node of updatedNodes) node.textContent = 'تاريخ تحديث الأرشيف غير متاح';
    }
    setStatus(archivedItems.length ? '' : 'لا توجد أخبار موثقة حالياً؛ سيبقى القسم هادئاً بدلاً من عرض خبر غير متحقق منه.');
  } catch {
    for (const grid of [homeGrid, educationGrid].filter(Boolean)) grid.setAttribute('aria-busy', 'false');
    if (archivePagination) archivePagination.hidden = true;
    for (const node of updatedNodes) node.textContent = 'تحديث الأخبار غير متاح الآن';
    setStatus('تعذّر تحميل موجز الأخبار الآن. حاول تحديث الصفحة لاحقاً.', true);
  }
}

loadNews();
