import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const cardSource = readFileSync(new URL('../site-news.js', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('../news-detail.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../news.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../news-detail.css', import.meta.url), 'utf8');
const data = JSON.parse(readFileSync(new URL('../news.json', import.meta.url), 'utf8'));

test('كل بطاقة خبر تبني رابط news.html بمعرّف مشفّر ولا تخلط رابط المصدر', () => {
  assert.match(cardSource, /news\.html\?id=\$\{encodeURIComponent\(itemId\)\}/);
  assert.match(cardSource, /makeText\('a', 'news-detail-link'/);
  assert.match(cardSource, /target = '_blank'/);
  assert.match(cardSource, /event\.target\?\.closest\?\.\('a'\)/);
});

test('صفحة التفاصيل ثابتة عامة للزحف ولا تدّعي معاينة لكل مقال', () => {
  assert.match(html, /dir="rtl"/);
  assert.match(html, /property="og:title" content="أخبار المكتبات والقراءة — المكتبة المدرسية الرقمية"/);
  assert.match(html, /لا يدّعي الموقع معاينة مختلفة لكل خبر/);
  assert.match(html, /news-detail\.js/);
  assert.match(html, /news-detail\.css/);
  assert.match(html, /تُعرض بيانات الخبر بعد تحميلها من news\.json/);
});

test('التفاصيل تعرض الحقول العربية المسموح بها فقط وتتحقق من HTTPS', () => {
  for (const token of ['title_ar', 'summary_ar', 'source_name', 'source_url', 'published_at', 'category']) assert.match(detailSource, new RegExp(token));
  assert.match(detailSource, /document\.title = `\$\{item\.title_ar\} — أخبار المكتبات والقراءة \| المكتبة المدرسية الرقمية`/);
  assert.match(detailSource, /validHttpsUrl\(item\.source_url\)/);
  assert.match(detailSource, /لم يُعثر على هذا الخبر/);
  assert.match(detailSource, /معرّف الخبر مفقود أو غير صالح/);
  assert.match(detailSource, /تعذّر تحميل الخبر الآن/);
  assert.ok(data.items.length > 0);
});

test('المشاركة لا تنسخ عند إلغاء native share وتملك بديل clipboard مرئياً', () => {
  assert.match(detailSource, /error\?\.name === 'AbortError'/);
  assert.match(detailSource, /أُلغيت المشاركة/);
  assert.match(detailSource, /navigator\.clipboard\?\.writeText/);
  assert.match(detailSource, /document\.execCommand\?\.\('copy'\)/);
  assert.match(detailSource, /window\.prompt\('انسخ رابط الخبر:/);
});

test('manual copy prompt is not reported as successful copying and page retains attribution', () => {
  assert.match(detailSource, /if \(typeof window\.prompt === 'function'\) window\.prompt\('انسخ رابط الخبر:', url\);\s*return false;/);
  assert.match(detailSource, /document\.title =/);
  assert.match(cardSource, /event\.target\?\.closest\?\.\('a,button'\)/);
  assert.match(html, /تصميم وبرمجة: محمد حامد/);
  assert.match(html, /مسؤولية الموقع: محمد حامد/);
});

test('التنسيق متجاوب ويعلن حالات التحميل والمشاركة لقارئ الشاشة', () => {
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media/);
  assert.match(css, /focus-visible/);
});
