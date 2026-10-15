import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPublicReadableBooks,
  hasSpecificUnknownPublicReading,
} from '../public-reading-books.js';

test('matches the three published local PDFs by title or author', () => {
  assert.equal(findPublicReadableBooks('هل يوجد PDF لحي بن يقظان؟')[0]?.pdf, 'hayy-ibn-yaqzan.pdf');
  assert.equal(findPublicReadableBooks('تحميل رسالة الغفران')[0]?.pdf, 'risalat-al-ghufran.pdf');
  assert.equal(findPublicReadableBooks('PDF لعبد الله بن المقفع')[0]?.pdf, 'kalila-wa-dimna-lion-and-bull.pdf');
});

test('treats an untitled PDF request as a general question', () => {
  const question = 'هل عندكم كتب PDF للقراءة والتنزيل؟';
  assert.deepEqual(findPublicReadableBooks(question), []);
  assert.equal(hasSpecificUnknownPublicReading(question), false);
});

test('does not claim an unrelated requested title has a local PDF', () => {
  const question = 'هل يوجد PDF لكتاب ألف ليلة وليلة؟';
  const matches = findPublicReadableBooks(question);
  assert.deepEqual(matches, []);
  assert.equal(hasSpecificUnknownPublicReading(question, matches), true);
});
