import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sanitizeBooks, normalizeArabic, isAllowedExternalUrl, countIndexedMaterials, filterBooks} from '../external-reading-model.mjs';
import {PUBLIC_READABLE_BOOKS} from '../public-reading-books.js';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const raw = read('../external-reading-books.json');
const catalog = sanitizeBooks(read('../external-catalog-records.json'));
const books = sanitizeBooks(raw);
const batch = books.filter(b => b.id.startsWith('open-edu-20261019-'));
const audit = read('../docs/open-education-reading-20261019.json');

test('17 educational titles retain official external links, language, level and rights evidence without PDF files', () => {
  assert.equal(batch.length,17); assert.equal(audit.records.length,17);
  assert.equal(audit.hostedFilesAdded,0); assert.equal(audit.databaseChanges,false);
  for(const b of batch){
    assert.equal(b.availability,'external-reading'); assert.equal(b.pdf,'');
    assert.equal(b.language,'الإنجليزية'); assert.equal(b.kind,'كتاب تعليمي');
    assert.ok(b.author && b.category && b.rightsUrl && b.reader);
    assert.match(b.completionStatus,/المستوى:/); assert.match(b.completionStatus,/لا يوجد ملف مستضاف/);
    const evidence=audit.records.find(x=>x.id===b.id)?.evidence;
    assert.ok(evidence?.licenseSource && evidence.accessType && evidence.evidenceSummary && evidence.level);
    assert.equal(evidence.licenseSource,b.rightsUrl);
  }
  assert.equal(batch.filter(b=>b.sourceName==='Raspberry Pi Press').length,6);
  assert.equal(batch.filter(b=>b.sourceName==='OpenStax — Rice University').length,5);
});

test('batch changes reading and complete-book counts by 17 but never PDF, periodical or catalog-only counts',()=>{
  const before=countIndexedMaterials(PUBLIC_READABLE_BOOKS,books.filter(b=>!batch.includes(b)),catalog);
  const after=countIndexedMaterials(PUBLIC_READABLE_BOOKS,books,catalog);
  for(const key of ['indexedRecords','readingTitles','completeBooks','total','online'])assert.equal(after[key],before[key]+17,key);
  for(const key of ['pdf','periodicals','catalogOnly'])assert.equal(after[key],before[key],key);
});

test('all new titles and URLs are unique against the entire current catalogue and local books',()=>{
  const all=[...books,...catalog,...PUBLIC_READABLE_BOOKS];
  for(const b of batch){
    assert.equal(all.filter(x=>normalizeArabic(x.title)===normalizeArabic(b.title)).length,1,b.title);
    assert.equal(all.filter(x=>x.reader===b.reader).length,1,b.reader);
  }
  assert.equal(filterBooks(batch,{subject:'الحوسبة والبرمجة'}).length,12);
  assert.equal(filterBooks(batch,{subject:'الرياضيات'}).length,3);
  assert.equal(filterBooks(batch,{subject:'العلوم'}).length,2);
});

test('official author GitHub sites do not allow arbitrary GitHub Pages, deceptive hosts, HTTP, credentials or ports',()=>{
  for(const u of ['https://allendowney.github.io/ThinkPython/','https://chrismayfield.github.io/ThinkJava2/','https://openstax.org/books/physics','https://magazine.raspberrypi.com/books/essentials-scratch-v1'])assert.equal(isAllowedExternalUrl(u),true);
  for(const u of ['https://evil.github.io/book','https://openstax.org.evil.example/book','https://evil-raspberrypi.com/book','http://openstax.org/book','https://u:p@openstax.org/book','https://openstax.org:8443/book'])assert.equal(isAllowedExternalUrl(u),false);
});

test('mixed and unspecified reuse terms remain explicit rather than promising unrestricted rehosting',()=>{
  assert.match(batch.find(b=>b.id.endsWith('-physics')).rights,/ترخيص مختلط/);
  for(const slug of ['invent-games','pygame','small-python-projects'])assert.match(batch.find(b=>b.id.endsWith('-'+slug)).rights,/لم يوثّق هنا/);
  const ui=readFileSync(new URL('../external-reading.js',import.meta.url),'utf8');
  assert.ok(ui.includes('اقرأ لدى المصدر الرسمي ↗'));
  assert.ok(ui.includes("book.availability === 'external-reading' ? book.completionStatus"));
});
