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

test('شريط المساعدة يحافظ على الروابط الثلاثة وأوصاف سياسة الخصوصية', () => {
  const pathways = sectionBetween('<section class="visitor-pathways', '<section class="home-news-section');
  const links = [...pathways.matchAll(/<a class="assistant-shortcut[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(([, href, label]) => ({ href, label: label.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }));
  assert.deepEqual(links, [
    { href: '#visitorAssistant', label: 'م المساعد الذكي' },
    { href: '#visitorQuestions', label: '؟ اسأل أمين المكتبة' },
    { href: 'https://t.me/PortSaidSchoolLibrariesBot', label: '↗ بوت Telegram' },
  ]);
  assert.match(pathways, /<details class="assistant-pathway-details">/);
  assert.match(pathways, /الفرق بين المسارات وسياسة الخصوصية/);
  for (const text of ['إجابة فورية عن الموقع والكتب المنشورة', 'لإرسال سؤال عام ومتابعة رد خاص في الصفحة', 'محادثة مستقلة ترد تلقائيًا']) {
    assert.match(pathways, new RegExp(text));
  }
  assert.match(pathways, /لا تُحفظ المحادثة/);
  assert.match(pathways, /لا ترسل بيانات تخص طالبًا أو موظفًا أو مستعيرًا/);
});

test('الأخبار المنزلية تسبق القيادة وتحافظ على المعرفات وحالات التحميل', () => {
  assert.ok(html.indexOf('id="homeNews"') < html.indexOf('leadership-banner'));
  const home = sectionBetween('<section class="home-news-section', '<section class="leadership-banner');
  assert.match(home, /id="homeNews"/);
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
  return { id, scope: 'school-library', title_ar: `عنوان ${id}`, summary_ar: `ملخص ${id}`, source_name: `مصدر ${id}`,
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

test('الرئيسية تستبعد التعليم العام مع حفظه في الأرشيف ولا تختلق يوم نشر للمصدر الشهري', async () => {
  const nodes = await runNews({ items: [
    item('general', 0, {scope: undefined}),
    item('library', 1, {published_at: '2026-10', date_precision: 'month', image_url: 'https://site.test/news.svg', image_alt: 'رسم أصلي', image_credit: 'ليس صورة للحدث', image_license: 'CC0 1.0', image_license_url: 'https://creativecommons.org/publicdomain/zero/1.0/'}),
  ] });
  assert.equal(nodes.homeNewsGrid.children.length, 1);
  assert.equal(nodes.educationNewsGrid.children.length, 2);
  const card = nodes.homeNewsGrid.children[0];
  assert.equal(card.querySelector('.news-card-title').textContent, 'عنوان library');
  assert.equal(card.querySelector('.news-card-image').alt, 'رسم أصلي');
  assert.match(card.querySelector('.news-image-credit').textContent, /ليس صورة للحدث/);
  assert.equal(card.querySelector('time').textContent, new Intl.DateTimeFormat('ar-EG', {year:'numeric', month:'short', timeZone:'Africa/Cairo'}).format(new Date('2026-10')));
});
