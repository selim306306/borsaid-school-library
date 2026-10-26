import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const layoutCss = readFileSync(new URL('../home-news-layout.css', import.meta.url), 'utf8');
const tickerJs = readFileSync(new URL('../book-updates-ticker.js', import.meta.url), 'utf8');

function positionOf(needle, description) {
  const position = html.indexOf(needle);
  assert.ok(position >= 0, `missing ${description}`);
  return position;
}

test('البحث الرئيسي يسبق الصور والبطاقة التعريفية ولا يبقى الرأس مزدحمًا بها', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  const headerStart = positionOf('<header class="site-header">', 'site header');
  const headerEnd = html.indexOf('</header>', headerStart);
  assert.ok(headerEnd > headerStart, 'site header has a closing tag');
  const header = html.slice(headerStart, headerEnd);
  assert.doesNotMatch(header, /header-feature-stack|president-banner/);

  const search = positionOf('id="homeDiscoveryForm"', 'primary search form');
  assert.ok(search < positionOf('class="header-feature-stack"', 'moved photo carousel'));
  assert.ok(search < positionOf('class="president-banner"', 'moved introduction card'));
  assert.ok(search < positionOf('class="portal-side home-quick-links"', 'secondary quick links'));
});

test('الأخبار تأتي بعد مصادر القراءة مع بقاء مسارات الزوار الثلاثة', () => {
  assert.ok(positionOf('id="readingSources"', 'reading sources') < positionOf('id="homeNews"', 'home news'));
  for (const href of ['#branches', '#visitorAssistant', '#educationResearch']) {
    assert.match(html, new RegExp(`href="${href.replace('#', '\\#')}"`));
  }
  assert.match(html, /مكتبات/);
  assert.match(html, /مساعد أمين المكتبة/);
  assert.match(html, /أخبار المكتبات في مصر والعالم/);
});

test('روابط المسارات الثانوية تظل مريحة للمس مع تخطيط أخف من بطاقات الترويج', () => {
  const rule = layoutCss.match(/\.page-home \.home-quick-links \.portal-side-link\s*\{([^}]*)\}/s)?.[1];
  assert.ok(rule, 'quick links have a dedicated compact style');
  const minHeight = Number(rule.match(/min-height:\s*(\d+)px/)?.[1] ?? 0);
  assert.ok(minHeight >= 44, `quick links need 44px touch targets, got ${minHeight}px`);
  assert.match(layoutCss, /\.home-feature-strip/);
});

test('شريط تحديث القراءة يُدرج بعد الأخبار بدلًا من مقدمة الصفحة', () => {
  assert.match(tickerJs, /querySelector\('#homeNews'\)/);
  assert.match(tickerJs, /homeNews\.parentNode\.insertBefore\(ticker,\s*homeNews\.nextSibling\)/);
  assert.doesNotMatch(tickerJs, /insertBefore\(ticker,\s*mobileNav\)/);
});
