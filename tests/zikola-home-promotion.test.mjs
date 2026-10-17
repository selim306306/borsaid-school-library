import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('index.html'), js=read('external-reading.js'), css=read('zikola-promotion.css');
test('one homepage promotion follows the development notice and precedes the presidential card',()=>{
  assert.equal((html.match(/id="zikolaPromotion"/g)||[]).length,1);
  assert.ok(html.indexOf('header-development-notice')<html.indexOf('id="zikolaPromotion"'));
  assert.ok(html.indexOf('id="zikolaPromotion"')<html.indexOf('<figure class="president-banner"'));
  assert.ok(!js.includes('seriesPromotion') && !js.includes('zikolaPromotion'));
});
test('homepage links match the unchanged ordered catalog, without copyrighted assets',()=>{
  const promo=html.split('<aside class="zikola-promotion"')[1].split('</aside>')[0];
  const series=JSON.parse(read('external-catalog-records.json')).filter(b=>b.seriesId==='ard-zikola').sort((a,b)=>a.seriesOrder-b.seriesOrder);
  assert.deepEqual([...promo.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),series.map(b=>b.source));
  assert.equal((promo.match(/rel="noopener noreferrer"/g)||[]).length,3);
  assert.ok(!promo.includes('<img') && !promo.includes('.pdf"'));
  assert.ok(promo.includes('خذ خيالك في رحلة أبعد من المألوف!'));
  assert.ok(promo.includes('ثلاث محطات، وموعد جديد مع الدهشة في كل جزء.'));
  assert.ok(promo.includes('لا يتوفر نص الروايات أو PDF'));
});
test('promotion supports keyboard focus, reduced motion, fluid width and touch targets',()=>{
  for(const marker of [':focus-visible','prefers-reduced-motion','min-height:44px','minmax(0,1fr)','linear-gradient']) assert.ok(css.includes(marker));
  assert.ok(html.includes('zikola-promotion.css?v=20261017-home-1'));
});
