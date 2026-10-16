import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReplySource, sanitizeOwnerDisplayText } from '../supabase/functions/visitor-questions-dashboard/sanitize.ts';

test('masks personal or sensitive text completely before owner display', () => {
  const maskedQuestion = sanitizeOwnerDisplayText('اسم الطالب أحمد ورقمه 12345678', 'question');
  const maskedReply = sanitizeOwnerDisplayText('راسلنا على person@example.com', 'reply');
  assert.equal(maskedQuestion, 'حُجب نص السؤال تلقائيًا لاحتوائه على بيانات شخصية أو معلومات حساسة.');
  assert.equal(maskedReply, 'حُجب نص الرد تلقائيًا لاحتوائه على بيانات شخصية أو معلومات حساسة.');
  assert.equal(maskedQuestion.includes('أحمد'), false);
  assert.equal(maskedReply.includes('person@example.com'), false);
});

test('preserves ordinary public question text and recognizes missing historical source', () => {
  assert.equal(sanitizeOwnerDisplayText('كيف أبحث عن كتاب منشور؟', 'question'), 'كيف أبحث عن كتاب منشور؟');
  assert.equal(normalizeReplySource(null), null);
  assert.equal(normalizeReplySource('legacy-value'), null);
});

test('normalizes only known sources for new questions', () => {
  assert.equal(normalizeReplySource('gemini'), 'gemini');
  assert.equal(normalizeReplySource('telegram'), 'telegram');
  assert.equal(normalizeReplySource('local'), 'local');
});
