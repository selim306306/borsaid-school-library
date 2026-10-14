const NEWS_PATH = new URL('./news.json', import.meta.url);
const NEWS_LIMIT_HOME = 3;
const NEWS_LIMIT_ALL = 9;

const homeGrid = document.querySelector('#homeNewsGrid');
const educationGrid = document.querySelector('#educationNewsGrid');
const statusNodes = [
  document.querySelector('#homeNewsStatus'),
  document.querySelector('#educationNewsStatus'),
].filter(Boolean);
const updatedNodes = [
  document.querySelector('#homeNewsUpdated'),
  document.querySelector('#educationNewsUpdated'),
].filter(Boolean);

function setStatus(message, isError = false) {
  for (const node of statusNodes) {
    node.textContent = message;
    node.classList.toggle('is-error', isError);
  }
}

function formatArabicDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'تاريخ النشر غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric',
    timeZone: 'Africa/Cairo',
  }).format(date);
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
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

  const top = document.createElement('div');
  top.className = 'education-news-card-top';
  top.append(
    makeText('span', 'news-source-name', item.source_name || 'مصدر تعليمي'),
    makeText('span', 'news-language-tag', item.source_language === 'ar' ? 'ملخص عربي' : 'ترجمة موجزة'),
  );
  article.append(top);
  article.append(makeText('h3', 'news-card-title', item.title_ar));
  article.append(makeText('p', 'news-card-summary', item.summary_ar));

  const metadata = document.createElement('div');
  metadata.className = 'news-card-metadata';
  metadata.append(
    makeText('span', 'news-category', item.category || 'تعليم'),
    makeText('time', 'news-date', formatArabicDate(item.published_at)),
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

function renderGrid(grid, items, limit) {
  if (!grid) return;
  grid.replaceChildren();
  for (const item of items.slice(0, limit)) grid.append(createNewsCard(item));
  grid.setAttribute('aria-busy', 'false');
}

async function loadNews() {
  for (const grid of [homeGrid, educationGrid].filter(Boolean)) grid.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`${NEWS_PATH.href}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('news_unavailable');
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items.filter(item =>
      item && typeof item.title_ar === 'string' && item.title_ar.trim() &&
      typeof item.summary_ar === 'string' && item.summary_ar.trim() &&
      typeof item.source_name === 'string' && typeof item.source_url === 'string' &&
      validHttpsUrl(item.source_url) && item.published_at,
    ) : [];
    items.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    renderGrid(homeGrid, items, NEWS_LIMIT_HOME);
    renderGrid(educationGrid, items, NEWS_LIMIT_ALL);

    if (data.updated_at) {
      const updated = `آخر تحديث للموجز: ${formatArabicDate(data.updated_at)} · يرصد المساعد المصادر كل ٤ ساعات`;
      for (const node of updatedNodes) node.textContent = updated;
    }
    setStatus(items.length ? '' : 'لا توجد أخبار موثقة حالياً؛ سيبقى القسم هادئاً بدلاً من عرض خبر غير متحقق منه.');
  } catch {
    for (const grid of [homeGrid, educationGrid].filter(Boolean)) grid.setAttribute('aria-busy', 'false');
    setStatus('تعذّر تحميل موجز الأخبار الآن. حاول تحديث الصفحة لاحقاً.', true);
  }
}

loadNews();
