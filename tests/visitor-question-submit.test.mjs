import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveReplySource, REDACTED_QUESTION } from '../supabase/functions/visitor-question-submit/source.js';

test('derives only the source returned by the trusted existing response path', () => {
  assert.equal(deriveReplySource({ ok: true, auto_answered: false, owner_notification: 'sent' }), 'telegram');
  assert.equal(deriveReplySource({ ok: true, auto_answered: true, question_display: 'كيف أبحث عن كتاب؟' }), 'gemini');
  assert.equal(deriveReplySource({ ok: true, auto_answered: true, question_display: REDACTED_QUESTION }), 'local');
});

test('does not claim Telegram delivery when the owner is unlinked or Telegram send fails', () => {
  assert.equal(deriveReplySource({ ok: true, auto_answered: false, owner_notification: 'not_linked' }), null);
  assert.equal(deriveReplySource({ ok: true, auto_answered: false, owner_notification: 'failed' }), null);
});

test('does not infer a source from an incomplete or failed response', () => {
  assert.equal(deriveReplySource({ ok: false, auto_answered: true }), null);
  assert.equal(deriveReplySource({ ok: true }), null);
  assert.equal(deriveReplySource(null), null);
});
