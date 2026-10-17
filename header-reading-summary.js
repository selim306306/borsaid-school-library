import { PUBLIC_READABLE_BOOKS } from './public-reading-books.js?v=20261016-public-pdf-guide-2';
import { normalizeArabic, sanitizeBooks } from './external-reading-model.mjs';

// Count titles, not source records or formats. Volumes/chapters keep their full titles.
export function countReadingTitles(localBooks = [], externalBooks = []) {
  const titles = new Map();
  for (const book of [...localBooks, ...externalBooks]) {
    const key = normalizeArabic(book.title);
    if (!key) continue;
    const current = titles.get(key) || { online: false, pdf: false };
    // A local PDF opens in the site's browser reader; external records use reader.
    current.online ||= Boolean(book.reader || book.pdf);
    current.pdf ||= Boolean(book.pdf);
    titles.set(key, current);
  }
  const values = [...titles.values()];
  return {
    total: values.length,
    online: values.filter(book => book.online).length,
    pdf: values.filter(book => book.pdf).length,
  };
}

export async function refreshHeaderReadingSummary({ documentRef = globalThis.document, fetchImpl = globalThis.fetch } = {}) {
  const root = documentRef?.querySelector('#headerReadingSummary');
  if (!root) return;
  const status = root.querySelector('[data-reading-status]');
  try {
    const response = await fetchImpl(new URL('external-reading-books.json', import.meta.url), { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('reading_source_unavailable');
    const raw = await response.json();
    const externalBooks = sanitizeBooks(raw);
    if (!externalBooks.length || externalBooks.length !== raw.length) throw new Error('reading_source_invalid');
    const totals = countReadingTitles(PUBLIC_READABLE_BOOKS, externalBooks);
    for (const [name, count] of Object.entries(totals)) {
      root.querySelector(`[data-reading-count="${name}"]`).textContent = count.toLocaleString('ar-EG');
    }
    root.dataset.countsSource = 'current-files';
    status.textContent = '';
    status.hidden = true;
  } catch {
    // Keep the verified publication snapshot, but never label stale counts as live.
    root.dataset.countsSource = 'publication-snapshot';
    status.textContent = 'آخر حصر موثّق؛ تعذّر تحديث الأعداد الآن.';
    status.hidden = false;
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refreshHeaderReadingSummary(), { once: true });
  else refreshHeaderReadingSummary();
}
