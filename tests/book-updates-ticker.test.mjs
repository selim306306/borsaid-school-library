import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
import { buildTickerItems, loadExternalBooks } from '../book-updates-ticker.js';

const root = new URL('../', import.meta.url);

test('يبني الشريط من الكتب المحلية الثلاثة ويميز الإضافات الخارجية', () => {
  const items = buildTickerItems([{ id: 'x', title: 'كتاب خارجي', author: 'كاتب', reader: 'https://hindawi.org/reader', source: 'https://hindawi.org/source', sourceName: 'هنداوي' }]);
  assert.equal(items.length, PUBLIC_READABLE_BOOKS.length + 1);
  assert.equal(items.filter((item) => item.kind === 'local').length, 3);
  assert.equal(items[0].badge, 'موجود بالموقع');
  assert.equal(items.at(-1).badge, 'إضافة جديدة · لدى المصدر');
  assert.equal(items.at(-1).href, 'https://hindawi.org/reader');
});

test('يستخدم reader الرسمي الخارجي ولا يختلق رابطاً عند غيابه', () => {
  const items = buildTickerItems([{ id: 'source-only', title: 'مصدر فقط', source: 'https://hindawi.org/source', author: '' }]);
  assert.equal(items.at(-1).href, 'https://hindawi.org/source');
  assert.equal(buildTickerItems([{ id: 'invalid', title: 'بلا رابط' }]).length, 3);
});

test('ينظف JSON عبر sanitizeBooks ويرفض السجلات غير الصالحة', async () => {
  const fetchImpl = async () => new Response(JSON.stringify([
    { id: 'valid', title: 'صحيح', author: '', sourceName: 'هنداوي', source: 'https://hindawi.org/source', reader: 'https://hindawi.org/reader', rights: 'متاح' },
    { id: 'invalid', title: 'غير صحيح', sourceName: 'مجهول', source: 'https://not-allowed.example/book', reader: 'https://not-allowed.example/read', rights: '' },
  ]), { status: 200, headers: { 'content-type': 'application/json' } });
  const books = await loadExternalBooks(fetchImpl, 'https://site.example');
  assert.deepEqual(books.map((book) => book.id), ['valid']);
});

test('يحتوي الملف على نقطة إدراج بعد site-header، توقف/تشغيل، reduced motion، وروابط آمنة', async () => {
  const source = await fs.readFile(new URL('book-updates-ticker.js', root), 'utf8');
  assert.match(source, /insertBefore\(ticker, mobileNav\)/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /noopener noreferrer/);
  assert.match(source, /visibilitychange/);
});

test('سرعة الشريط أربع ثوانٍ مع خلفية ملونة وحافة واضحة وإتاحة الحركة', async () => {
  const js = await fs.readFile(new URL('book-updates-ticker.js', root), 'utf8');
  const css = await fs.readFile(new URL('book-updates-ticker.css', root), 'utf8');
  assert.match(js, /const ROTATION_MS = 4000;/);
  assert.match(js, /duration: 240/);
  assert.match(css, /background: linear-gradient/);
  assert.match(css, /border-inline-start: 6px solid/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
});
