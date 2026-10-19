const NEWS_PATH = new URL('./news.json', import.meta.url);

const statusNode = document.querySelector('#newsStatus');
const contentNode = document.querySelector('#newsContent');
const sourceNode = document.querySelector('#newsSource');
const titleNode = document.querySelector('#newsTitle');
const categoryNode = document.querySelector('#newsCategory');
const dateNode = document.querySelector('#newsDate');
const summaryNode = document.querySelector('#newsSummary');
const originalLink = document.querySelector('#newsOriginalLink');
const shareButton = document.querySelector('#shareNews');
const shareStatus = document.querySelector('#shareStatus');

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function formatArabicDate(value, precision = 'day') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'تاريخ النشر غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric', month: 'short', day: precision === 'month' ? undefined : 'numeric', timeZone: 'Africa/Cairo',
  }).format(date);
}

function requestedId() {
  try { return new URL(window.location.href).searchParams.get('id')?.trim() || ''; }
  catch { return ''; }
}

function setError(message) {
  statusNode.textContent = message;
  statusNode.classList.add('is-error');
  contentNode.hidden = true;
}

function renderItem(item) {
  sourceNode.textContent = item.source_name;
  titleNode.textContent = item.title_ar;
  document.title = `${item.title_ar} — المكتبة المدرسية الرقمية`;
  categoryNode.textContent = item.category || 'تعليم';
  dateNode.textContent = formatArabicDate(item.published_at, item.date_precision);
  if (item.published_at) dateNode.dateTime = item.published_at;
  summaryNode.textContent = item.summary_ar;
  const sourceUrl = validHttpsUrl(item.source_url);
  originalLink.href = sourceUrl;
  contentNode.hidden = false;
  statusNode.hidden = true;
}

function copyWithFallback(url) {
  const area = document.createElement('textarea');
  area.value = url;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.append(area); area.select();
  let copied = false;
  try { copied = Boolean(document.execCommand?.('copy')); } catch { copied = false; }
  area.remove();
  if (copied) return true;
  if (typeof window.prompt === 'function') window.prompt('انسخ رابط الخبر:', url);
  return false;
}

async function shareOrCopy() {
  const url = window.location.href;
  shareStatus.textContent = '';
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: titleNode.textContent, text: summaryNode.textContent, url });
      shareStatus.textContent = 'تمت مشاركة الخبر.';
      return;
    } catch (error) {
      if (error?.name === 'AbortError') { shareStatus.textContent = 'أُلغيت المشاركة.'; return; }
    }
  }
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); shareStatus.textContent = 'نُسخ رابط الخبر.'; return; }
    catch { /* انتقل إلى بديل مرئي بعد فشل clipboard */ }
  }
  shareStatus.textContent = copyWithFallback(url) ? 'نُسخ رابط الخبر.' : 'تعذّر النسخ تلقائياً؛ انسخ الرابط من شريط العنوان.';
}

shareButton?.addEventListener('click', shareOrCopy);

async function loadNewsDetail() {
  const id = requestedId();
  if (!id) { setError('معرّف الخبر مفقود أو غير صالح.'); return; }
  try {
    const response = await fetch(`${NEWS_PATH.href}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('news_unavailable');
    const data = await response.json();
    const item = Array.isArray(data.items) ? data.items.find(candidate => String(candidate?.id ?? '').trim() === id) : null;
    if (!item || typeof item.title_ar !== 'string' || !item.title_ar.trim() || typeof item.summary_ar !== 'string' || !item.summary_ar.trim() || typeof item.source_name !== 'string' || !item.source_name.trim() || !validHttpsUrl(item.source_url)) {
      setError('لم يُعثر على هذا الخبر في الأرشيف الحالي.'); return;
    }
    renderItem(item);
  } catch { setError('تعذّر تحميل الخبر الآن. تحقّق من الاتصال وحاول لاحقاً.'); }
}

loadNewsDetail();
