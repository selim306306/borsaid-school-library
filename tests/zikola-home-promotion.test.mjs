import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const html=read('index.html');

test('homepage no longer loads or renders the Zikola promotion',()=>{
  assert.ok(!html.includes('id="zikolaPromotion"'));
  assert.ok(!html.includes('class="zikola-promotion"'));
  assert.ok(!html.includes('zikola-promotion.css'));
  assert.ok(!html.includes('zikola-app-links.mjs'));
});

test('Zikola series content remains in the catalog records',()=>{
  const series=JSON.parse(read('external-catalog-records.json')).filter(b=>b.seriesId==='ard-zikola').sort((a,b)=>a.seriesOrder-b.seriesOrder);
  assert.deepEqual(series.map(b=>b.title),['أرض زيكولا','أماريتا','وادي الذئاب المنسية']);
});
