import { PUBLIC_READABLE_BOOKS } from './public-reading-books.js?v=5401d58c55dcc6a9';
import { fetchSharedPublicReadingJson } from './shared-public-reading-data.mjs?v=c0a874b3218d5558';
import { countIndexedMaterials, languageDistribution, normalizeArabic, sanitizeBooks } from './external-reading-model.mjs?v=1592e4746b4b5c28';

function readable(book) { return book?.availability !== 'catalog-only' && Boolean(book?.reader || book?.pdf); }
export function countReadingTitles(localBooks = [], externalBooks = []) {
  const titles = new Map();
  for (const book of [...localBooks, ...externalBooks].filter(readable)) {
    const key = normalizeArabic(book.title); if (!key) continue;
    const current = titles.get(key) || { online: false, pdf: false };
    current.online ||= Boolean(book.reader || book.pdf); current.pdf ||= Boolean(book.pdf); titles.set(key, current);
  }
  const values = [...titles.values()];
  return { total: values.length, online: values.filter(b => b.online).length, pdf: values.filter(b => b.pdf).length };
}

export { countIndexedMaterials };

export function createLanguageSummary(documentRef, books) {
  if (!documentRef?.createElement) return null;
  const box = documentRef.createElement('details'); box.className = 'header-reading-language-summary'; box.setAttribute('aria-label', 'توزيع لغات المواد');
  const title = documentRef.createElement('summary'); title.textContent = 'المواد حسب اللغة'; box.append(title);
  const text = documentRef.createElement('span'); text.textContent = languageDistribution(books, { deduplicateBy: 'id' }).map(({ language, count }) => `${language}: ${count.toLocaleString('ar-EG')}`).join(' · '); box.append(text);
  const note = documentRef.createElement('small'); note.textContent = 'الأعداد غير قابلة للجمع؛ السجل متعدد اللغات يظهر في كل لغة، والإجمالي يحسب السجلات الفريدة بالمعرّف.'; box.append(note); return box;
}

export async function refreshHeaderReadingSummary({ documentRef = globalThis.document, fetchImpl = globalThis.fetch } = {}) {
  const root = documentRef?.querySelector('#headerReadingSummary'); if (!root) return;
  const status = root.querySelector('[data-reading-status]');
  try {
    const urls = ['external-reading-books.json', 'external-catalog-records.json'].map(name => new URL(name, import.meta.url));
    const [readingRaw, catalogRaw] = await Promise.all(urls.map(url => fetchSharedPublicReadingJson(url, fetchImpl)));
    const externalBooks = sanitizeBooks(readingRaw); const catalog = sanitizeBooks(catalogRaw);
    if (!externalBooks.length || externalBooks.length !== readingRaw.length || catalog.length !== catalogRaw.length) throw new Error('reading_source_invalid');
    const totals = countIndexedMaterials([], [...PUBLIC_READABLE_BOOKS, ...externalBooks], catalog);
    for (const [name, count] of Object.entries({ ...countReadingTitles(PUBLIC_READABLE_BOOKS, externalBooks), indexedRecords: totals.indexedRecords, completeBooks: totals.completeBooks, periodicals: totals.periodicals, catalogOnly: totals.catalogOnly })) {
      const selector = `[data-reading-count="${name}"]`;
      const nodes = root.querySelectorAll ? root.querySelectorAll(selector) : [root.querySelector(selector)].filter(Boolean);
      for (const node of nodes) node.textContent = count.toLocaleString('ar-EG');
    }
    if (documentRef?.createElement) { root.querySelector('.header-reading-language-summary')?.remove(); const summary = createLanguageSummary(documentRef, [...PUBLIC_READABLE_BOOKS, ...externalBooks, ...catalog]); if (summary) root.append(summary); }
    root.dataset.countsSource = 'current-files'; status.textContent = ''; status.hidden = true;
  } catch { root.dataset.countsSource = 'publication-snapshot'; status.textContent = 'آخر حصر موثّق؛ تعذّر تحديث الأعداد الآن.'; status.hidden = false; }
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => refreshHeaderReadingSummary(), { once: true }); else refreshHeaderReadingSummary(); }
