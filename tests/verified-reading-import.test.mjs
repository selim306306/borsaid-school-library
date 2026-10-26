import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeArabic, sanitizeBooks, isAllowedExternalUrl } from '../external-reading-model.mjs';
import { countReadingTitles } from '../header-reading-summary.js';
import { PUBLIC_READABLE_BOOKS } from '../public-reading-books.js';
const data=JSON.parse(readFileSync(new URL('../external-reading-books.json',import.meta.url)));
const audit=JSON.parse(readFileSync(new URL('../docs/reading-import-20261020.json',import.meta.url)));
const addedIds=new Set(audit.addedIds);
const laterAddedIds=new Set(readdirSync(new URL('../docs/',import.meta.url)).filter(name=>/^reading-import-\d{8}\.json$/.test(name)&&name>'reading-import-20261020.json').flatMap(name=>JSON.parse(readFileSync(new URL('../docs/'+name,import.meta.url))).addedIds||[]));
const historicalData=data.filter(b=>!laterAddedIds.has(b.id));
const before=historicalData.filter(b=>!addedIds.has(b.id));
const oldIds=new Set(before.map(b=>b.id));
const additions=data.filter(b=>addedIds.has(b.id));
test('verified metadata adds unique external reading titles without changing prior records',()=>{
  assert.equal(additions.length,106);
  assert.equal(before.length,2419);
  // SHA-256 of canonical JSON from main 4add21bb2bd2b14ab0e5a3c504fcb1e3f2fcb04b.
  assert.equal(createHash('sha256').update(JSON.stringify(before)).digest('hex'),'66359ad8c60b3447063dc1f703bc7d4d7b0baec2b76c103d1baa1bfc84027496');
  assert.equal(sanitizeBooks(data).length,data.length);
  for(const b of before)assert.deepEqual(data.find(n=>n.id===b.id),b);
  assert.equal(before.filter(b=>b.id.startsWith('open-edu-20261019-')).length,17);
  const keys=new Set(before.map(b=>normalizeArabic(b.title)));
  const ids=new Set(oldIds);
  for(const b of additions){assert.ok(!keys.has(normalizeArabic(b.title)));keys.add(normalizeArabic(b.title));assert.ok(!ids.has(b.id));ids.add(b.id);assert.equal(b.availability,'external-reading');assert.equal(b.pdf,'');for(const key of ['title','author','language','publisher','source','reader','rights','rightsUrl','completionStatus'])assert.ok(b[key],b.id+' '+key);}
  assert.equal(countReadingTitles(PUBLIC_READABLE_BOOKS,historicalData).total,countReadingTitles(PUBLIC_READABLE_BOOKS,before).total+additions.length);
  assert.equal(countReadingTitles(PUBLIC_READABLE_BOOKS,historicalData).pdf,countReadingTitles(PUBLIC_READABLE_BOOKS,before).pdf);
  assert.ok(additions.some(b=>b.languageCodes.some(code=>code==='ar'||code==='ara')));
});
test('source audit includes all forty sites and no invented missing rows',()=>{
  const audit=JSON.parse(readFileSync(new URL('../docs/source-audit-20261020.json',import.meta.url)));
  const sites=audit.sites||audit.sources;
  assert.equal(sites.length,40);
  const ids=sites.map(s=>s.number??s.order??s.id);
  assert.equal(new Set(ids).size,40);
});
test('reviewed publishers do not permit unrelated websites or deceptive hosts',()=>{
  for(const host of ['storyweaver.org.in','gutenberg.org','standardebooks.org','oreilly.com','creativecommons.org']){
    assert.equal(isAllowedExternalUrl('https://'+host+'/'),true);
    assert.equal(isAllowedExternalUrl('https://'+host+'.evil.example/'),false);
    assert.equal(isAllowedExternalUrl('http://'+host+'/'),false);
    assert.equal(isAllowedExternalUrl('https://u:p@'+host+'/'),false);
    assert.equal(isAllowedExternalUrl('https://'+host+':8443/'),false);
  }
  assert.equal(isAllowedExternalUrl('https://random-author.github.io/'),false);
});
