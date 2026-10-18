import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./president-banner.css',import.meta.url),'utf8');
test('presidential portrait is shared outside SPA panels and keeps the requested caption',()=>{
 const header=html.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
 assert.ok(header);
 assert.match(header,/<figure class="president-banner"/);
 assert.match(header,/السيد الرئيس عبد الفتاح السيسي/);
 assert.match(header,/مؤسس مصر الحديثة/);
 assert.match(header,/alt="السيد الرئيس عبد الفتاح السيسي، رئيس جمهورية مصر العربية"/);
 assert.match(header,/width="480" height="360" loading="eager"/);
 assert.match(header,/srcset="president-240.webp 240w, president-480.webp 480w"/);
 const sources=JSON.parse(readFileSync(new URL('./scripts/stylesheets.json',import.meta.url),'utf8'));
 assert.ok(sources.indexOf('president-banner.css')>sources.indexOf('visual-polish.css'));
 assert.ok(readFileSync(new URL('./site-bundle.css',import.meta.url),'utf8').includes(css));
});
test('portrait stays in flow, uses the left RTL grid area and preserves the full frame',()=>{
 assert.match(css,/grid-template-areas:"brand photo president"/);
 assert.match(css,/grid-template-areas:"brand brand" "photo president"/);
 assert.match(css,/object-fit:contain/);
 assert.doesNotMatch(css,/position:\s*(fixed|sticky)/);
 for(const width of [240,480]) assert.ok(statSync(new URL(`./president-${width}.webp`,import.meta.url)).size<22000);
 assert.ok(statSync(new URL('./president-original.jpg',import.meta.url)).size>0);
});

test('development notice stays separate and presidential caption retains identity and reading summary',()=>{
 const figure=html.match(/<figure class="president-banner"[^>]*>[\s\S]*?<\/figure>/)?.[0];
 assert.ok(figure);
 const caption=figure.match(/<figcaption>[\s\S]*?<\/figcaption>/)?.[0];
 assert.ok(caption);
 const notice=html.match(/<aside class="header-development-notice"[^>]*>[\s\S]*?<\/aside>/)?.[0];
 assert.ok(notice);
 assert.match(notice,/الموقع قيد التطوير بمساندة وكيل الذكاء الاصطناعي، وتحت إشراف إدارة الموقع\./);
 assert.match(notice,/يُرجى زيارة الموقع باستمرار للاطلاع على آخر التحديثات\./);
 assert.doesNotMatch(caption,/header-development-notice/);
 assert.match(caption,/id="headerReadingSummary"/);
 assert.doesNotMatch(caption,/بوابتك لاكتشاف مكتبات بورسعيد/);
 assert.match(caption,/السيد الرئيس عبد الفتاح السيسي/);
 assert.match(caption,/مؤسس مصر الحديثة/);
 assert.ok(caption.indexOf('president-banner-site-note')>caption.indexOf('presidentBannerTitle'));
});

test('presidential banner uses the requested calm teal colors',()=>{
 assert.match(css,/background:#dff3f0/);
 assert.match(css,/color:#204c49/);
 assert.match(css,/border:1px solid #6faeae/);
});
