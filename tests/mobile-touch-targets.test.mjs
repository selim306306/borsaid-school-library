import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const browser = process.env.CHROME_BIN || ['google-chrome', 'chromium', 'chromium-browser']
  .map(command => spawnSync('which', [command], { encoding: 'utf8' }))
  .find(result => result.status === 0)?.stdout.trim();

const selectors = [
  '#homeView #homeDiscoveryInput',
  '#homeView .visitor-pathway-action',
  '#discoverView #publicSearchForm #searchInput',
  '#discoverView #publicSearchForm #branchFilter',
  '#discoverView #publicSearchForm .availability-toggle',
  '#discoverView #publicSearchForm .search-submit',
  '#discoverView #clearSearch',
  '#discoverView #emptyState .empty-guide-link',
  '#globalReadingView .livealert-refresh',
  '#globalReadingView .openbooks-reader-toggle',
  '#globalReadingView .openbooks-action',
  '#globalReadingView .external-reading-link',
  '#globalReadingView .global-reading-suggestion',
  '#globalReadingView .global-reading-link',
  '#educationResearchView .news-page-button',
  '#educationResearchView .education-research-suggestion',
  '#educationResearchView .education-research-link',
  '#educationResearchView .news-source-link',
];

function fixture(css) {
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${safeCss}</style></head>
<body class="page-home">
  <section id="homeView" class="page-view" style="display:block"><div class="portal-search-row"><input id="homeDiscoveryInput" type="search" aria-label="بحث"></div><a class="visitor-pathway-action" href="#">مسار</a></section>
  <section id="discoverView" class="page-view" style="display:block">
    <form id="publicSearchForm" class="search-box"><span class="search-icon" aria-hidden="true"></span><input id="searchInput" type="search" aria-label="بحث الفهرس"><select id="branchFilter" aria-label="المكتبة"><option>كل المكتبات</option></select><label class="availability-toggle"><input id="availableOnly" type="checkbox"><span class="toggle-ui" aria-hidden="true"></span><span>المتاح فقط</span></label><button class="button button-primary search-submit" type="submit">ابحث</button></form>
    <button id="clearSearch" type="button">مسح البحث</button><div id="emptyState" class="empty-state"><a class="empty-guide-link" href="#homeGuide">كيف أستخدم الموقع؟</a></div>
  </section>
  <section id="globalReadingView" class="page-view" style="display:block"><button class="livealert-refresh">تحديث الآن</button><button class="openbooks-reader-toggle">اقرأ هنا</button><a class="openbooks-action openbooks-read" href="#">اقرأ PDF</a><a class="external-reading-link" href="#">اقرأ لدى المصدر</a><button class="global-reading-suggestion">اقتراح قراءة</button><a class="global-reading-link" href="#">افتح الكتاب</a></section>
  <section id="educationResearchView" class="page-view" style="display:block"><button class="news-page-button">التالي</button><button class="education-research-suggestion">موضوع مقترح</button><a class="education-research-link" href="#">رابط بحث</a><a class="education-research-link news-source-link" href="#">مصدر الخبر</a></section>
  <pre id="measurements"></pre>
  <script>const selectors=${JSON.stringify(selectors)};const targets=selectors.flatMap(selector=>Array.from(document.querySelectorAll(selector)).map(element=>({selector,height:element.getBoundingClientRect().height})));document.querySelector('#measurements').textContent=JSON.stringify({viewport:innerWidth,targets});</script>
</body></html>`;
}

test('mobile public controls and primary links have at least 44px touch targets', { skip: !browser && 'No Chromium executable is available' }, () => {
  const css = readFileSync(new URL('../site-bundle.css', import.meta.url), 'utf8');
  const temp = mkdtempSync(join(tmpdir(), 'library-touch-targets-'));
  try {
    const htmlPath = join(temp, 'fixture.html');
    writeFileSync(htmlPath, fixture(css));
    const result = spawnSync(browser, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', `--user-data-dir=${join(temp, 'profile')}`, '--window-size=360,980', '--dump-dom',
      pathToFileURL(htmlPath).href,
    ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr || result.error?.message || 'Chromium did not finish');
    const match = result.stdout.match(/<pre id="measurements">([^<]*)<\/pre>/);
    assert.ok(match, 'Chromium should return the fixture measurements');
    const measured = JSON.parse(match[1]);
    assert.ok(measured.viewport <= 760, `mobile media query must be active; viewport=${measured.viewport}`);
    const undersized = measured.targets.filter(target => target.height < 44);
    assert.deepEqual(undersized, [], `touch targets under 44px: ${JSON.stringify(undersized)}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
