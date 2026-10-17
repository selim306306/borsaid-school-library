import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('site-footer.css');

test('footer keeps editable description, copyright, credit, responsibility and stats', () => {
  for (const marker of ['class="site-footer section-wrap"', 'id="footerDescription"', 'id="copyrightYear"', 'تصميم وبرمجة: محمد حامد', 'مسؤولية الموقع: محمد حامد', 'id="publicPageViewStats"', 'data-public-stats-value="total"', 'data-public-stats-value="today"', 'data-public-stats-value="month"', 'href="#top"']) assert.ok(html.includes(marker), marker);
});

test('footer CSS is scoped, RTL, light, mobile-first and responsive', () => {
  assert.match(css, /^\.site-footer/m);
  assert.ok(!/(^|\n)(?!\.site-footer|@media)[^\n{]*\{/m.test(css));
  for (const marker of ['direction:rtl', 'background:#fff', 'display:grid', '@media (min-width:760px)', '@media (max-width:480px)', 'grid-template-columns:repeat(3,minmax(0,1fr))', 'flex-direction:column']) assert.ok(css.includes(marker), marker);
});
