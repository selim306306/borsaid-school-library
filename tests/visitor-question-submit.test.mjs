import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveReplySource, REDACTED_QUESTION } from '../supabase/functions/visitor-question-submit/source.js';

test('derives only reply sources accepted by the existing database constraint', () => {
  assert.equal(deriveReplySource({ ok: true, auto_answered: false, owner_notification: 'sent' }), 'telegram');
  assert.equal(deriveReplySource({ ok: true, auto_answered: true, answer_provider: 'groq_qwen' }), null);
  assert.equal(deriveReplySource({ ok: true, auto_answered: true, question_display: REDACTED_QUESTION }), 'local');
  assert.equal(deriveReplySource({ ok: true, auto_answered: true }), null);
});

test('does not claim Telegram delivery when the owner is unlinked or send fails', () => {
  assert.equal(deriveReplySource({ ok: true, auto_answered: false, owner_notification: 'not_linked' }), null);
  assert.equal(deriveReplySource({ ok: true, auto_answered: false, owner_notification: 'failed' }), null);
});

test('does not infer a source from incomplete or failed responses', () => {
  assert.equal(deriveReplySource({ ok: false, auto_answered: true }), null);
  assert.equal(deriveReplySource({ ok: true }), null);
  assert.equal(deriveReplySource(null), null);
});
