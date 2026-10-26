import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./president-banner.css',import.meta.url),'utf8');
function sectionEnd(source,start){
 const open=source.indexOf('<section',start);
 let depth=0;
 for(const match of source.slice(open).matchAll(/<\/?section\b[^>]*>/g)){
  depth+=match[0].startsWith('</')?-1:1;
  if(depth===0)return open+match.index+match[0].length;
 }
 throw new Error('section closing tag not found');
}
test('presidential portrait is shared after SPA panels and keeps the requested caption',()=>{
 const start=html.indexOf('<section class="home-feature-strip');
 const feature=html.match(/<section class="home-feature-strip[^>]*>[\s\S]*?<\/section>/)?.[0];
 assert.ok(feature);
 const lastPanel=html.indexOf('<section class="page-view" id="aboutView"');
 assert.ok(start>sectionEnd(html,lastPanel),'shared feature follows every tab panel');
 assert.ok(start<html.indexOf('</main>',start),'shared feature remains in the main content');
 assert.ok(html.indexOf('id="homeDiscoveryForm"')<start,'search remains above the shared feature');
 assert.match(feature,/<figure class="president-banner"/);
 assert.match(feature,/السيد الرئيس عبد الفتاح السيسي/);
 assert.match(feature,/مؤسس مصر الحديثة/);
 assert.match(feature,/alt="السيد الرئيس عبد الفتاح السيسي، رئيس جمهورية مصر العربية"/);
 assert.match(feature,/width="480" height="360" loading="eager"/);
 assert.match(feature,/srcset="president-240.webp 240w, president-480.webp 480w"/);
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
