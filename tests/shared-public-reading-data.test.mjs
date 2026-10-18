import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSharedPublicReadingJson } from '../shared-public-reading-data.mjs';
import { sanitizeBooks } from '../external-reading-model.mjs';

test('يشارك Promise نفسه لكل URL وfetchImpl ويحافظ على خيارات الكاش', async () => {
  let calls = 0;
  const raw = [{ id: 'book-1', title: 'كتاب', source: 'https://hindawi.org/source', reader: 'https://hindawi.org/read', sourceName: 'هنداوي', rights: 'متاح' }];
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(String(url), 'https://site.example/external-reading-books.json');
    assert.deepEqual(options, { credentials: 'same-origin', cache: 'no-store' });
    return { ok: true, json: async () => raw };
  };
  const first = fetchSharedPublicReadingJson('https://site.example/external-reading-books.json', fetchImpl);
  const second = fetchSharedPublicReadingJson(new URL('https://site.example/external-reading-books.json'), fetchImpl);
  assert.strictEqual(first, second);
  assert.strictEqual(await first, raw);
  assert.strictEqual(await second, raw);
  assert.equal(calls, 1);
});

test('يفصل بين fetchImpl ويزيل الطلب الفاشل لإتاحة إعادة المحاولة', async () => {
  let firstCalls = 0;
  const fetchImpl = async () => {
    firstCalls += 1;
    if (firstCalls === 1) throw new Error('offline');
    return { ok: true, json: async () => ({ retried: true }) };
  };
  await assert.rejects(fetchSharedPublicReadingJson('https://site.example/retry.json', fetchImpl), /offline/);
  assert.deepEqual(await fetchSharedPublicReadingJson('https://site.example/retry.json', fetchImpl), { retried: true });
  assert.equal(firstCalls, 2);

  let otherCalls = 0;
  const otherFetch = async () => { otherCalls += 1; return { ok: true, json: async () => ({ other: true }) }; };
  assert.deepEqual(await fetchSharedPublicReadingJson('https://site.example/retry.json', otherFetch), { other: true });
  assert.equal(otherCalls, 1);
});

test('يبقى الخام دون تغيير عند تمريره إلى sanitizeBooks', async () => {
  const raw = [{ id: 'book-raw', title: '  عنوان  ', source: 'https://hindawi.org/source', reader: 'https://hindawi.org/read', sourceName: 'هنداوي', rights: 'متاح' }];
  const fetchImpl = async () => ({ ok: true, json: async () => raw });
  const loaded = await fetchSharedPublicReadingJson('https://site.example/raw.json', fetchImpl);
  const before = structuredClone(loaded);
  sanitizeBooks(loaded, { currentOrigin: 'https://site.example' });
  assert.deepEqual(loaded, before);
  assert.equal(loaded[0].title, '  عنوان  ');
});
