import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const themeCss = readFileSync(new URL('../reader-theme.css', import.meta.url), 'utf8');
const layoutCss = readFileSync(new URL('../home-news-layout.css', import.meta.url), 'utf8');
const regularPhoneCss = layoutCss.slice(layoutCss.lastIndexOf('@media (max-width: 700px)'));
const narrowPhoneCss = layoutCss.slice(layoutCss.lastIndexOf('@media (max-width: 360px)'));

test('بوابة الصفحة الرئيسية تستخدم لوحة ألوان بحرية هادئة مع هرم بصري واضح', () => {
  assert.match(themeCss, /\.page-home\s*\{[^}]*--home-ink:\s*#153b45;/s);
  assert.match(themeCss, /\.page-home\s*>\s*\.portal-hero\s*\{[^}]*linear-gradient/s);
  assert.match(themeCss, /\.page-home\s+\.portal-search-panel\s*\{[^}]*background:\s*#fff;/s);
});

test('المسارات في الهاتف المعتاد عمودان، والشاشات الأضيق عمود واحد مع أهداف لمس كبيرة', () => {
  assert.match(regularPhoneCss, /\.page-home\s+\.portal-side-links\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(regularPhoneCss, /\.page-home\s+\.portal-side-link\s*\{[^}]*min-height:\s*94px;/s);
  assert.match(layoutCss, /\.page-home\s+\.portal-search-row\s*\{\s*min-height:\s*52px;/s);
  assert.match(narrowPhoneCss, /\.page-home\s+\.portal-side-links\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(narrowPhoneCss, /\.page-home\s+\.portal-side-link\s*\{[^}]*min-height:\s*52px;/s);
});

test('روابط البوابة تحافظ على مؤشر تركيز واضح وتحترم تفضيل تقليل الحركة', () => {
  assert.match(themeCss, /\.page-home\s+\.portal-side-link:focus-visible\s*\{[^}]*outline:\s*3px/s);
  assert.match(themeCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.page-home\s+\.portal-side-link[^}]*transition:\s*none/s);
});
