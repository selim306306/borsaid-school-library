import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('index.html'), js=read('external-reading.js'), css=read('zikola-promotion.css');
const promo=html.split('<aside class="zikola-promotion"')[1].split('</aside>')[0];
const android='https://play.google.com/store/apps/details?id=com.asseralkotb';
const ios='https://apps.apple.com/eg/app/عصير-الكتب/id1573588874';
const info='https://books.google.com/books?vid=ISBN9789779921914';
test('one homepage promotion follows the development notice and precedes the presidential card',()=>{
  assert.equal((html.match(/id="zikolaPromotion"/g)||[]).length,1);
  assert.ok(html.indexOf('header-development-notice')<html.indexOf('id="zikolaPromotion"'));
  assert.ok(html.indexOf('id="zikolaPromotion"')<html.indexOf('<figure class="president-banner"'));
  assert.ok(!js.includes('seriesPromotion') && !js.includes('zikolaPromotion'));
});
test('ordered promotion offers official app links and information only for part three, not purchase pages',()=>{
  assert.deepEqual([...promo.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),[android,android,info,ios]);
  assert.equal((promo.match(/rel="noopener noreferrer"/g)||[]).length,4);
  assert.ok(!promo.includes('aseeralkotb.com/ar/books/') && !promo.includes('<img') && !promo.includes('.pdf"'));
  assert.ok(promo.includes('خذ خيالك في رحلة أبعد من المألوف!'));
  assert.ok(promo.includes('ثلاث محطات، وموعد جديد مع الدهشة في كل جزء.'));
  for (const marker of ['لا يتوفر نص الروايات أو PDF','فتح الكتاب والتحقق من توفره يتم داخل التطبيق','لم نعثر على قراءة رقمية مرخصة له','للمعلومات بلا معاينة قراءة','لا نضمن فتح الكتاب مباشرة']) assert.ok(promo.includes(marker));
  const series=JSON.parse(read('external-catalog-records.json')).filter(b=>b.seriesId==='ard-zikola').sort((a,b)=>a.seriesOrder-b.seriesOrder);
  assert.deepEqual(series.map(b=>b.title),['أرض زيكولا','أماريتا','وادي الذئاب المنسية']);
  for(const b of series) assert.ok(b.source.startsWith('https://www.aseeralkotb.com/ar/books/'));
});
test('descriptions associate app conditions and part-three limitations with their respective links',()=>{
  assert.equal((promo.match(/aria-describedby="zikolaAppNote"/g)||[]).length,3);
  assert.ok(promo.includes('id="zikolaAppNote"'));
  assert.ok(promo.includes('aria-describedby="zikolaThirdNote"'));
  assert.ok(promo.includes('id="zikolaThirdNote"'));
});
test('promotion supports keyboard focus, reduced motion, fluid width and touch targets',()=>{
  for(const marker of [':focus-visible','prefers-reduced-motion','min-height:44px','minmax(0,1fr)','linear-gradient','.zikola-part-copy small','.zikola-ios-link']) assert.ok(css.includes(marker));
  assert.ok(html.includes('zikola-promotion.css?v=20261017-reading-options-1'));
});
