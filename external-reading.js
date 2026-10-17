import {
  filterBooks,
  sanitizeBooks,
  uniqueValues,
} from './external-reading-model.mjs';

const PAGE_SIZE = 12;
const DATA_URL = 'external-reading-books.json';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function externalLink(label, href, primary = false) {
  if (!href) return null;
  const link = el('a', `external-reading-link${primary ? ' external-reading-primary' : ''}`, label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function mount() {
  const view = document.querySelector('#globalReadingView');
  const anchor = view?.querySelector('#openBooksSection');
  if (!view || !anchor || view.querySelector('#externalReadingSection')) return;

  const section = el('section', 'external-reading-section');
  section.id = 'externalReadingSection';
  section.setAttribute('aria-labelledby', 'externalReadingTitle');

  const heading = el('div', 'external-reading-heading');
  const headingCopy = el('div');
  headingCopy.append(el('span', 'external-reading-eyebrow', 'مصادر رسمية موثوقة'));
  const title = el('h2', '', 'مكتبة عربية موسّعة');
  title.id = 'externalReadingTitle';
  headingCopy.append(title);
  headingCopy.append(el('p', '', 'كتب ومجلدات من مواقع الجهات الناشرة أو الحافظة. القارئ الرسمي خارجي، والملفات غير مستضافة محليًا في هذا الموقع.'));
  const count = el('span', 'external-reading-count', 'جارٍ تحميل عدد الكتب الفعلي…');
  heading.append(headingCopy, count);

  const note = el('aside', 'external-reading-note', 'تُفتح القراءة الكاملة وملفات PDF من المصدر الرسمي فقط. تشمل القائمة كتبًا وطبعات ومجلدات منفصلة، فلا يعني العدد أعمالًا مستقلة بالضرورة. لا تُحمّل الملفات تلقائيًا ولا نعيد نشرها محليًا.');
  const form = el('form', 'external-reading-form');
  form.setAttribute('role', 'search');
  const searchField = el('label', 'external-reading-field');
  searchField.append(el('span', '', 'بحث عربي'), Object.assign(el('input'), { type: 'search', name: 'q', placeholder: 'العنوان أو المؤلف أو الموضوع أو المصدر', autocomplete: 'off' }));
  const subjectField = el('label', 'external-reading-field');
  const subject = Object.assign(el('select'), { name: 'subject' });
  subject.append(Object.assign(el('option', '', 'كل الموضوعات'), { value: '' }));
  subjectField.append(el('span', '', 'الموضوع'), subject);
  const sourceField = el('label', 'external-reading-field');
  const source = Object.assign(el('select'), { name: 'source' });
  source.append(Object.assign(el('option', '', 'كل المصادر'), { value: '' }));
  sourceField.append(el('span', '', 'المصدر'), source);
  const submit = el('button', 'external-reading-submit', 'بحث');
  submit.type = 'submit';
  form.append(searchField, subjectField, sourceField, submit);
  const status = el('p', 'external-reading-status', 'جارٍ تحميل المصادر…');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const grid = el('div', 'external-reading-grid');
  grid.setAttribute('aria-live', 'polite');
  const moreRow = el('div', 'external-reading-more-row');
  const more = el('button', 'external-reading-more', 'تحميل المزيد');
  more.type = 'button';
  moreRow.append(more);

  section.append(heading, note, form, status, grid, moreRow);
  anchor.after(section);

  let books = [];
  let filtered = [];
  let shown = PAGE_SIZE;

  function setError() {
    count.textContent = 'تعذّر تحديد العدد';
    status.textContent = 'تعذّر تحميل قائمة القراءة الرسمية. لم نعرض بيانات بديلة أو مختلقة.';
    grid.replaceChildren();
    const box = el('div', 'external-reading-empty external-reading-error');
    box.append(el('strong', '', 'لم تُحمّل المصادر')); 
    const retry = el('button', 'external-reading-retry', 'إعادة المحاولة');
    retry.type = 'button';
    retry.addEventListener('click', load);
    box.append(el('p', '', 'تحقق من اتصالك ثم أعد المحاولة.'));
    box.append(retry);
    grid.append(box);
    moreRow.hidden = true;
  }

  function renderCard(book) {
    const card = el('article', 'external-reading-card');
    const top = el('div', 'external-reading-card-top');
    top.append(el('span', 'external-reading-kind', book.kind || 'كتاب'));
    top.append(el('span', 'external-reading-source', book.sourceName));
    const body = el('div', 'external-reading-card-body');
    const details = el('div', 'external-reading-details');
    details.append(el('h3', '', book.title));
    details.append(el('p', 'external-reading-author', `المؤلف: ${book.author || 'غير مذكور'}`));
    details.append(el('p', 'external-reading-meta', `الموضوع: ${book.subject || 'غير مصنف'} · اللغة: ${book.language}`));
    if (book.publicationPlace || book.publicationYear) details.append(el('p', 'external-reading-meta', `النشر: ${[book.publicationPlace, book.publicationYear].filter(Boolean).join('، ')}`));
    details.append(el('p', 'external-reading-meta', book.searchable ? 'نص رقمي؛ يدعم بحث المتصفح في صفحة الفصل المفتوحة لدى المصدر.' : 'نسخة مصوّرة؛ البحث هنا في بيانات الكتاب، ولم تُثبت قابلية البحث داخل نصه.'));
    details.append(el('p', 'external-reading-rights', `الحقوق: ${book.rights}`));
    const actions = el('div', 'external-reading-actions');
    actions.append(externalLink('افتح القارئ الكامل ↗', book.reader || book.source, true));
    if (book.pdf) actions.append(externalLink('PDF من المصدر', book.pdf));
    if (book.rightsUrl) actions.append(externalLink('تفاصيل الحقوق', book.rightsUrl));
    body.append(details);
    card.append(top, body, actions);
    return card;
  }

  function render() {
    filtered = filterBooks(books, { query: searchField.querySelector('input').value, subject: subject.value, source: source.value });
    shown = Math.min(shown, Math.max(PAGE_SIZE, filtered.length));
    grid.replaceChildren();
    filtered.slice(0, shown).forEach((book) => grid.append(renderCard(book)));
    const format = value => new Intl.NumberFormat('ar-EG').format(value);
    count.textContent = `${format(books.length)} كتاب ومجلد لدى المصادر`;
    status.textContent = filtered.length ? `يعرض ${format(Math.min(shown, filtered.length))} من ${format(filtered.length)} نتيجة. الملفات المحلية الثلاثة محفوظة في القسم السابق.` : 'لا توجد كتب مطابقة للبحث الحالي.';
    moreRow.hidden = shown >= filtered.length || !filtered.length;
  }

  function populateFilters() {
    subject.replaceChildren(Object.assign(el('option', '', 'كل الموضوعات'), { value: '' }));
    source.replaceChildren(Object.assign(el('option', '', 'كل المصادر'), { value: '' }));
    uniqueValues(books, 'category').forEach((value) => subject.append(el('option', '', value)));
    uniqueValues(books, 'sourceName').forEach((value) => source.append(el('option', '', value)));
  }

  async function load() {
    submit.disabled = true;
    more.disabled = true;
    status.textContent = 'جارٍ تحميل المصادر…';
    try {
      const requestUrl = new URL(DATA_URL, window.location.href);
      if (requestUrl.origin !== window.location.origin || requestUrl.protocol !== window.location.protocol) {
        throw new Error('بيانات القراءة ليست من نفس الأصل');
      }
      const response = await fetch(requestUrl.href, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      books = sanitizeBooks(data, { currentOrigin: window.location.origin });
      if (!books.length) throw new Error('لا توجد بيانات قراءة صالحة');
      populateFilters();
      render();
    } catch (error) {
      console.error('External reading load failed', error);
      setError();
    } finally {
      submit.disabled = false;
      more.disabled = false;
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); shown = PAGE_SIZE; render(); });
  subject.addEventListener('change', () => { shown = PAGE_SIZE; render(); });
  source.addEventListener('change', () => { shown = PAGE_SIZE; render(); });
  searchField.querySelector('input').addEventListener('input', () => { shown = PAGE_SIZE; render(); });
  more.addEventListener('click', () => { shown += PAGE_SIZE; render(); });
  load();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();

export { mount };
