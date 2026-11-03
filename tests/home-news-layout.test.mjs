import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const newsSource = readFileSync(new URL('../site-news.js', import.meta.url), 'utf8')
  .replace("new URL('./news.json', import.meta.url)", "new URL('https://site.test/news.json')");

function sectionBetween(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing HTML section ${start}`);
  return html.slice(from, to);
}

test('شريط المساعدة يعرض مدخلًا واحدًا ويحتفظ بالمسارات البديلة داخل التفاصيل', () => {
  const pathways = sectionBetween('<section class="visitor-pathways', '<section class="home-news-section');
  const shortcuts = sectionBetween('<nav class="assistant-shortcuts"', '</nav>');
  const links = [...shortcuts.matchAll(/<a class="assistant-shortcut[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(([, href, label]) => ({ href, label: label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }));
  assert.deepEqual(links, [
    { href: '#visitorAssistant', label: 'م المساعد الذكي' },
  ]);
  const details = sectionBetween('<details class="assistant-pathway-details">', '</details>');
  assert.match(details, /href="#visitorQuestions"/);
  assert.match(details, /href="https:\/\/t\.me\/PortSaidSchoolLibrariesBot"/);
  assert.match(details, /خيارات المساعدة الأخرى وسياسة الخصوصية/);
  for (const nav of [
    sectionBetween('<nav class="desktop-nav"', '</nav>'),
    sectionBetween('<nav class="mobile-nav', '</nav>'),
  ]) {
    assert.equal((nav.match(/href="#visitorAssistant"/g) ?? []).length, 1);
    assert.doesNotMatch(nav, /href="#visitorQuestions"/);
  }
  for (const text of ['إجابة عن المعرفة العامة أو معلومات الموقع والكتب المنشورة', 'تُرسل الأسئلة العامة تلقائيًا إلى Qwen عبر Groq', 'قد يصل السؤال والرد إلى مدير الموقع عبر Telegram', 'يجيب تلقائيًا من المعلومات المنشورة', 'Qwen عبر Groq على الخطة المجانية']) {
    assert.match(details, new RegExp(text));
  }
  assert.doesNotMatch(details, /Gemini|DeepSeek/);
  assert.match(details, /لا تُحفظ المحادثة/);
  assert.match(details, /لا ترسل بيانات تخص طالبًا أو موظفًا أو مستعيرًا/);
});

test('الأخبار المنزلية تأتي بعد مصادر القراءة وتحافظ على المعرفات وحالات التحميل', () => {
  const homeStart = html.indexOf('<section class="home-news-section');
  const homeEnd = html.indexOf('</section>', homeStart);
  const home = html.slice(homeStart, homeEnd);
  assert.ok(html.indexOf('class="leadership-banner') < html.indexOf('id="homeNews"'));
  assert.ok(html.indexOf('id="readingSources"') < html.indexOf('id="homeNews"'));
  assert.match(home, /id="homeNews"/);
  assert.match(home, /أخبار المكتبات في مصر والعالم/);
  assert.match(home, /id="homeNewsGrid"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.match(home, /id="homeNewsStatus"/);
  const education = sectionBetween('<section class="education-research-section', '<section class="visitor-support');
  assert.match(education, /id="educationNewsGrid"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.match(education, /id="educationNewsStatus"/);
  assert.match(education, /id="educationNewsPagination"/);
  assert.match(education, /id="educationNewsPrevious"/);
  assert.match(education, /id="educationNewsNext"/);
  assert.match(newsSource, /const NEWS_HOME_COUNT = 3;/);
  assert.match(newsSource, /const NEWS_ARCHIVE_PAGE_SIZE = 6;/);
  assert.doesNotMatch(home, /عاجل/);
  assert.doesNotMatch(newsSource, /عاجل/);
});

class FakeElement {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this._text = '';
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.classList = { toggle: (name, force) => {
      const names = new Set(this.className.split(/\s+/).filter(Boolean));
      if (force) names.add(name); else names.delete(name);
      this.className = [...names].join(' ');
    }};
  }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) { for (const node of nodes.flat()) { if (node == null) continue; this.children.push(node); node.parentNode = this; } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  addEventListener() {}
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector) {
    const result = [];
    const match = node => selector.startsWith('#') ? node.id === selector.slice(1)
      : selector.startsWith('.') ? node.className.split(/\s+/).includes(selector.slice(1))
      : node.tagName.toLowerCase() === selector.toLowerCase();
    const walk = node => { for (const child of node.children) { if (match(child)) result.push(child); walk(child); } };
    walk(this);
    return result;
  }
}

function makeFixture() {
  const ids = ['homeNewsGrid', 'educationNewsGrid', 'educationNewsPagination', 'educationNewsPageSummary',
    'educationNewsPrevious', 'educationNewsNext', 'homeNewsStatus', 'educationNewsStatus',
    'homeNewsUpdated', 'educationNewsUpdated'];
  const nodes = Object.fromEntries(ids.map(id => [id, new FakeElement('div', id)]));
  nodes.educationNewsPrevious.tagName = 'BUTTON';
  nodes.educationNewsNext.tagName = 'BUTTON';
  const document = {
    querySelector(selector) { return selector.startsWith('#') ? nodes[selector.slice(1)] ?? null : null; },
    createElement(tag) { return new FakeElement(tag); },
    createTextNode(text) { const node = new FakeElement('#text'); node.textContent = text; return node; },
  };
  return { document, nodes };
}

async function runNews(payload, { fetchError = false, httpError = false } = {}) {
  const fixture = makeFixture();
  const context = vm.createContext({
    document: fixture.document,
    URL,
    URLSearchParams,
    Intl,
    Date,
    Number,
    String,
    Set,
    Math,
    fetch: fetchError ? async () => { throw new Error('offline'); } : async () => ({
      ok: !httpError,
      async json() { return payload; },
    }),
    console,
  });
  new vm.Script(newsSource, { filename: 'site-news.js' }).runInContext(context);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return fixture.nodes;
}

function item(id, days, overrides = {}) {
  return { id, scope: 'libraries', title_ar: `عنوان ${id}`, summary_ar: `ملخص ${id}`, source_name: `مصدر ${id}`,
    source_url: `https://source.test/news/${id}`, published_at: `2026-10-${String(18 - days).padStart(2, '0')}T12:00:00Z`, ...overrides };
}

test('site-news.js يرشح ويزيل التكرار ويرتب أحدث ثلاثة ويعرض أرشيف ستة', async () => {
  const raw = [
    item('a', 0, { image_url: 'https://images.source.test/a.webp' }), item('b', 1), item('c', 2), item('d', 3), item('e', 4), item('f', 5),
    item('a', 7, { source_url: 'https://source.test/news/another-id' }), item('unique-id', 8, { source_url: 'https://source.test/news/a?utm=ignored#fragment' }),
    item('duplicate-url', 9, { source_url: 'https://source.test/news/a?utm=ignored#fragment' }),
    item('empty-source', 10, { source_name: '   ' }),
    item('bad-date', 11, { published_at: 'not-a-date' }),
    item('bad-title', 12, { title_ar: '   ' }),
  ];
  const nodes = await runNews({ items: raw, updated_at: '2026-10-18T00:00:00Z', schedule_interval_hours: 24 });
  assert.equal(nodes.homeNewsGrid.children.length, 3);
  assert.equal(nodes.educationNewsGrid.children.length, 6);
  assert.deepEqual(nodes.homeNewsGrid.children.map(card => card.querySelector('.news-card-title').textContent), ['عنوان a', 'عنوان b', 'عنوان c']);
  const sourceImage = nodes.homeNewsGrid.children[0].querySelector('.news-card-image');
  assert.ok(sourceImage);
  assert.equal(sourceImage.src, 'https://images.source.test/a.webp');
  assert.equal(sourceImage.loading, 'lazy');
  assert.equal(sourceImage.decoding, 'async');
  assert.equal(sourceImage.alt, 'مصدر a — صورة الخبر');
  assert.equal(nodes.homeNewsGrid.children[1].querySelector('.news-card-image'), null);
  assert.equal(nodes.educationNewsPageSummary.textContent.includes('من ٦'), true);
  assert.equal(nodes.homeNewsGrid.getAttribute('aria-busy'), 'false');
  assert.equal(nodes.educationNewsGrid.getAttribute('aria-busy'), 'false');
  assert.equal(nodes.homeNewsStatus.textContent, '');
});

test('site-news.js keeps distinct Bibliotheca Alexandrina DocumentID articles and removes tracking aliases', async () => {
  const nodes = await runNews({ items: [
    item('bibalex-46369', 0, { source_url: 'https://www.bibalex.org/en/news/Details.aspx?DocumentID=46369' }),
    item('bibalex-46370', 1, { source_url: 'https://www.bibalex.org/en/news/Details.aspx?documentid=46370' }),
    item('bibalex-46369-tracked', 2, { source_url: 'https://www.bibalex.org/en/news/Details.aspx?documentid=46369&utm_source=archive#top' }),
  ] });
  assert.deepEqual(nodes.educationNewsGrid.children.map(card => card.getAttribute('data-news-id')), [
    'bibalex-46369',
    'bibalex-46370',
  ]);
});

test('site-news.js يتعامل مع فشل HTTP وفشل الشبكة دون خبر مصطنع', async () => {
  const failedHttp = await runNews({ items: [item('x', 0)] }, { httpError: true });
  assert.match(failedHttp.homeNewsStatus.textContent, /تعذّر تحميل موجز الأخبار/);
  assert.equal(failedHttp.homeNewsStatus.className, 'is-error');
  assert.equal(failedHttp.homeNewsGrid.getAttribute('aria-busy'), 'false');
  assert.equal(failedHttp.educationNewsPagination.hidden, true);

  const failedFetch = await runNews({ items: [item('x', 0)] }, { fetchError: true });
  assert.match(failedFetch.educationNewsStatus.textContent, /تعذّر تحميل موجز الأخبار/);

  const empty = await runNews({ items: [] });
  assert.match(empty.homeNewsStatus.textContent, /لا توجد أخبار موثقة/);
  assert.equal(empty.homeNewsGrid.children.length, 0);
  assert.equal(empty.educationNewsGrid.children.length, 0);
  assert.equal(empty.educationNewsPagination.hidden, true);
});

test('site-news.js لا يمرر صورة غير HTTPS أو بيانات اعتماد داخل الرابط', async () => {
  const nodes = await runNews({ items: [
    item('http', 0, { image_url: 'http://images.source.test/a.webp' }),
    item('credential', 1, { image_url: 'https://user:pass@images.source.test/b.webp' }),
    item('fallback', 2, { media_url: 'https://images.source.test/c.webp' }),
  ] });
  assert.equal(nodes.homeNewsGrid.children[0].querySelector('.news-card-image'), null);
  assert.equal(nodes.homeNewsGrid.children[1].querySelector('.news-card-image'), null);
  assert.equal(nodes.homeNewsGrid.children[2].querySelector('.news-card-image').src, 'https://images.source.test/c.webp');
});
test('الأخبار المصورة مدمجة بثلاثة أعمدة وصورة مصغرة على الهاتف', () => {
  const css = readFileSync(new URL('../home-news-layout.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(min-width: 700px\)/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-columns: 94px minmax\(0, 1fr\)/);
  assert.match(css, /-webkit-line-clamp: 2/);
});

test('الرئيسية تعرض أخبار المكتبات العامة مع حفظ المواد غير المصنفة في الأرشيف', async () => {
  const nodes = await runNews({ items: [
    item('general', 0, {scope: undefined}),
    item('library', 1, {published_at: '2026-10', date_precision: 'month', image_url: 'https://site.test/news.svg', image_alt: 'صورة من مصدر الخبر', image_credit: 'الصورة: المصدر الأصلي', image_license: 'CC BY 4.0', image_license_url: 'https://creativecommons.org/licenses/by/4.0/'}),
  ] });
  assert.equal(nodes.homeNewsGrid.children.length, 1);
  assert.equal(nodes.educationNewsGrid.children.length, 2);
  const card = nodes.homeNewsGrid.children[0];
  assert.equal(card.querySelector('.news-card-title').textContent, 'عنوان library');
  assert.equal(card.querySelector('.news-card-image').alt, 'صورة من مصدر الخبر');
  assert.match(card.querySelector('.news-image-credit').textContent, /الصورة: المصدر الأصلي/);
  assert.equal(card.querySelector('time').textContent, new Intl.DateTimeFormat('ar-EG', {year:'numeric', month:'short', timeZone:'Africa/Cairo'}).format(new Date('2026-10')));
});

test('الرئيسية تعرض النطاق الجديد والمدرسي التاريخي فقط وتحترم home_excluded', async () => {
  const nodes = await runNews({ items: [
    item('general-library', 0),
    item('legacy-school-library', 1, { scope: 'school-library' }),
    item('unclassified-archive', 2, { scope: undefined }),
    item('excluded-library', 3, { home_excluded: true }),
  ] });
  assert.equal(nodes.homeNewsGrid.children.length, 2);
  assert.deepEqual(nodes.homeNewsGrid.children.map(card => card.querySelector('.news-card-title').textContent), ['عنوان general-library', 'عنوان legacy-school-library']);
  assert.equal(nodes.educationNewsGrid.children.length, 4);
});
