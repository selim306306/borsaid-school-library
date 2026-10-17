import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refreshHeaderReadingSummary, countReadingTitles } from '../header-reading-summary.js';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
import { sanitizeBooks } from '../external-reading-model.mjs';
const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css = readFileSync(new URL('../header-refinements.css',import.meta.url),'utf8');
test('compact header keeps native disclosure, full statistics and selected leadership image', () => {
  assert.match(html, /<details[^>]*id="headerReadingSummary"[^>]*>\s*<summary class="header-reading-overview">/);
  for(const text of ['المكتبة المدرسية الرقمية','السيد الرئيس عبد الفتاح السيسي','مؤسس مصر الحديثة','سجلات فهرسة فقط','ضمن الإجمالي','ستضاف كتب أخرى تباعًا.']) assert.ok(html.includes(text));
  assert.match(html,/src="president-480.webp" srcset="president-240.webp 240w, president-480.webp 480w"/);
  assert.doesNotMatch(css, /object-fit|object-position|url\(|img\s*\{/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
});
test('all duplicate compact and expanded counters refresh together from the same public files', async () => {
  const externalRaw=JSON.parse(readFileSync(new URL('../external-reading-books.json',import.meta.url)));
  const external=sanitizeBooks(externalRaw);
  const nodes = Object.fromEntries(['total','online','pdf','indexedRecords','completeBooks','periodicals','catalogOnly'].map(key=>[key,[{textContent:'snapshot'},{textContent:'snapshot'}]]));
  const status={hidden:true,textContent:''};
  const root={dataset:{},querySelector:()=>status,querySelectorAll:selector=>nodes[selector.match(/"([^"]+)"/)[1]]||[]};
  await refreshHeaderReadingSummary({documentRef:{querySelector:()=>root},fetchImpl:async url=>({ok:true,json:async()=>url.pathname.endsWith('external-reading-books.json')?externalRaw:[]})});
  const expected=countReadingTitles(PUBLIC_READABLE_BOOKS,external).total.toLocaleString('ar-EG');
  assert.equal(nodes.total[0].textContent,expected);assert.equal(nodes.total[1].textContent,expected);
  assert.equal(nodes.indexedRecords[0].textContent,nodes.indexedRecords[1].textContent);
  assert.notEqual(nodes.indexedRecords[0].textContent,'snapshot');
  assert.equal(root.dataset.countsSource,'current-files');
});
