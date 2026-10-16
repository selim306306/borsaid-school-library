import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerNotification, processVisitorQuestion } from '../supabase/functions/visitor-questions/submission-flow.js';

function setup({ sensitiveQuestion = 'كيف أبحث عن كتاب منشور؟', answer = { ok: true, text: 'اكتب عنوان الكتاب في مربع البحث.' }, ownerChatId = 'test-owner-chat', sendResult = true } = {}) {
  const calls = { gemini: [], saved: [], telegram: [] };
  const deps = {
    question: sensitiveQuestion,
    visitorToken: 'test-visitor-token',
    visitorTokenHash: 'a'.repeat(64),
    answerWithGemini: async question => { calls.gemini.push(question); return answer; },
    saveQuestion: async (...args) => {
      calls.saved.push(args);
      return { id: '00000000-0000-4000-8000-000000000001', replyCode: 'ABC2345678', answeredAt: args.length > 2 ? '2026-01-01T00:00:00.000Z' : null };
    },
    getOwnerChatId: async () => ownerChatId,
    sendTelegramMessage: async (chatId, text) => { calls.telegram.push({ chatId, text }); return sendResult; },
  };
  return { calls, deps };
}

test('Gemini success sends the question and exact automatic reply to the owner; answer stays in the visitor ticket', async () => {
  const { calls, deps } = setup();
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.auto_answered, true);
  assert.equal(result.body.reply, 'اكتب عنوان الكتاب في مربع البحث.');
  assert.equal(result.body.owner_notification, 'sent');
  assert.deepEqual(calls.gemini, [deps.question]);
  assert.equal(calls.saved[0][0], deps.question);
  assert.equal(calls.saved[0][2], result.body.reply);
  assert.match(calls.telegram[0].text, /سؤال جديد من نموذج الموقع/);
  assert.match(calls.telegram[0].text, /كيف أبحث عن كتاب منشور؟/);
  assert.match(calls.telegram[0].text, /اكتب عنوان الكتاب في مربع البحث/);
  assert.equal(calls.telegram[0].chatId, 'test-owner-chat');
  assert.equal(Object.hasOwn(result.body, 'reply_code'), false);
});

test('Gemini failure sends a pending question and owner-only reply instruction', async () => {
  const { calls, deps } = setup({ answer: { ok: false } });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.auto_answered, false);
  assert.equal(result.body.owner_notification, 'sent');
  assert.equal(calls.saved[0].length, 2);
  assert.match(calls.telegram[0].text, /تعذر الرد الآلي/);
  assert.match(calls.telegram[0].text, /كيف أبحث عن كتاب منشور؟/);
  assert.match(calls.telegram[0].text, /\/reply ABC2345678/);
  assert.equal(result.body.reply, undefined);
});

test('sensitive content skips Gemini and persists/notifies only a generic redaction', async () => {
  const secret = 'اسم الطالب أحمد ورقمه 12345678';
  const { calls, deps } = setup({ sensitiveQuestion: secret });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.deepEqual(calls.gemini, []);
  assert.equal(calls.saved[0][0], result.body.question_display);
  assert.equal(calls.saved[0][0].includes('أحمد'), false);
  assert.equal(calls.saved[0][0].includes('12345678'), false);
  assert.equal(calls.telegram.length, 1);
  assert.equal(calls.telegram[0].text, buildOwnerNotification({ sensitive: true }));
  assert.equal(calls.telegram[0].text.includes(secret), false);
  assert.equal(calls.telegram[0].text.includes('أحمد'), false);
  assert.equal(calls.telegram[0].text.includes('12345678'), false);
  assert.equal(result.body.question_display.includes('أحمد'), false);
});

test('an unlinked owner never causes a pending ticket to be deleted or falsely marked as delivered', async () => {
  const { calls, deps } = setup({ answer: { ok: false }, ownerChatId: null });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.owner_notification, 'not_linked');
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.telegram.length, 0);
});

test('Telegram send failure never deletes the safely stored pending ticket', async () => {
  const { calls, deps } = setup({ answer: { ok: false }, sendResult: false });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.owner_notification, 'failed');
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.telegram.length, 1);
});

test('a sensitive Gemini reply is rejected and is not sent to either the visitor or Telegram', async () => {
  const { calls, deps } = setup({ answer: { ok: true, text: 'راسل الموظف على staff@example.com' } });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.body.auto_answered, false);
  assert.equal(result.body.reply, undefined);
  assert.equal(calls.saved[0][2], undefined);
  assert.equal(calls.telegram.length, 1);
  assert.equal(calls.telegram[0].text.includes('staff@example.com'), false);
});
