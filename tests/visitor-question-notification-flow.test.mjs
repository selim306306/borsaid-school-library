import test from 'node:test';
import assert from 'node:assert/strict';
import { processVisitorQuestion } from '../supabase/functions/visitor-questions/submission-flow.js';

function setup({ sensitiveQuestion = 'كيف أبحث عن كتاب منشور؟', answer = { ok: true, provider: 'groq', text: 'اكتب عنوان الكتاب في مربع البحث.', sentToExternalModel: true }, externalAiConsent = false, ownerChatId = 'test-owner-chat', sendResult = true } = {}) {
  const calls = { model: [], saved: [], telegram: [], getOwner: 0 };
  const deps = {
    question: sensitiveQuestion,
    visitorToken: 'test-visitor-token',
    visitorTokenHash: 'a'.repeat(64),
    externalAiConsent,
    answerWithFreeProvider: async question => { calls.model.push(question); return answer; },
    saveQuestion: async (...args) => {
      calls.saved.push(args);
      return { id: '00000000-0000-4000-8000-000000000001', replyCode: 'ABC2345678', answeredAt: args.length > 2 ? '2026-01-01T00:00:00.000Z' : null };
    },
    getOwnerChatId: async () => { calls.getOwner += 1; return ownerChatId; },
    sendTelegramMessage: async (chatId, text) => { calls.telegram.push({ chatId, text }); return sendResult; },
  };
  return { calls, deps };
}

test('an explicitly consented free Qwen answer is private to the ticket and its owner notice is accurate', async () => {
  const { calls, deps } = setup({ externalAiConsent: true });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.auto_answered, true);
  assert.equal(result.body.answer_provider, 'groq_qwen');
  assert.equal(result.body.external_model_consented, true);
  assert.equal(result.body.external_model_attempted, true);
  assert.equal(result.body.reply, 'اكتب عنوان الكتاب في مربع البحث.');
  assert.equal(result.body.owner_notification, 'sent');
  assert.deepEqual(calls.model, [deps.question]);
  assert.equal(calls.saved[0][0], deps.question);
  assert.equal(calls.saved[0][2], result.body.reply);
  assert.match(calls.telegram[0].text, /Qwen عبر Groq/);
  assert.match(calls.telegram[0].text, /كيف أبحث عن كتاب منشور؟/);
  assert.match(calls.telegram[0].text, /اكتب عنوان الكتاب في مربع البحث/);
  assert.equal(calls.telegram[0].chatId, 'test-owner-chat');
  assert.equal(Object.hasOwn(result.body, 'reply_code'), false);
});

test('without one-question consent, no model callback runs and the question remains a manual pending ticket', async () => {
  const { calls, deps } = setup();
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.auto_answered, false);
  assert.equal(result.body.external_model_consented, false);
  assert.equal(result.body.external_model_attempted, false);
  assert.equal(result.body.owner_notification, 'sent');
  assert.deepEqual(calls.model, []);
  assert.equal(calls.saved[0].length, 2);
  assert.match(calls.telegram[0].text, /تعذر الرد الآلي/);
  assert.match(calls.telegram[0].text, /كيف أبحث عن كتاب منشور؟/);
  assert.match(calls.telegram[0].text, /\/reply ABC2345678/);
  assert.equal(result.body.reply, undefined);
});

test('provider failure sends a pending question without trying another provider', async () => {
  const { calls, deps } = setup({ externalAiConsent: true, answer: { ok: false, reason: 'provider_failed', sentToExternalModel: true } });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.auto_answered, false);
  assert.equal(result.body.external_model_consented, true);
  assert.equal(result.body.external_model_attempted, true);
  assert.deepEqual(calls.model, [deps.question]);
  assert.equal(calls.saved[0].length, 2);
  assert.equal(calls.telegram.length, 1);
});

test('sensitive content is answered locally without sending, storing, or notifying', async () => {
  const secret = 'اسم الطالب أحمد ورقمه 12345678';
  const { calls, deps } = setup({ sensitiveQuestion: secret, externalAiConsent: true });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 200);
  assert.equal(result.body.privacy_blocked, true);
  assert.equal(result.body.stored, false);
  assert.deepEqual(calls.model, []);
  assert.deepEqual(calls.saved, []);
  assert.deepEqual(calls.telegram, []);
  assert.equal(calls.getOwner, 0);
  assert.equal(result.body.question_display.includes('أحمد'), false);
  assert.equal(result.body.question_display.includes('12345678'), false);
  assert.equal(Object.hasOwn(result.body, 'question_id'), false);
  assert.equal(Object.hasOwn(result.body, 'access_token'), false);
});

test('an unlinked owner never causes a pending ticket to be deleted or falsely marked delivered', async () => {
  const { calls, deps } = setup({ ownerChatId: null });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.status, 201);
  assert.equal(result.body.owner_notification, 'not_linked');
  assert.equal(calls.saved.length, 1);
  assert.equal(calls.telegram.length, 0);
});

test('a sensitive model answer is rejected and is not shown or sent to Telegram', async () => {
  const { calls, deps } = setup({ externalAiConsent: true, answer: { ok: true, provider: 'groq', text: 'راسل الموظف على staff@example.com' } });
  const result = await processVisitorQuestion(deps);
  assert.equal(result.body.auto_answered, false);
  assert.equal(result.body.reply, undefined);
  assert.equal(calls.saved[0][2], undefined);
  assert.equal(calls.telegram.length, 1);
  assert.equal(calls.telegram[0].text.includes('staff@example.com'), false);
});


test('ticket Edge wiring uses only the project-specific Groq Free variables and no legacy provider endpoints', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../supabase/functions/visitor-questions/index.ts', import.meta.url), 'utf8');
  assert.match(source, /LIBRARY_GROQ_FREE_PLAN_API_KEY/);
  assert.match(source, /LIBRARY_GROQ_FREE_PLAN_CONFIRMED/);
  assert.doesNotMatch(source, /GEMINI_API_KEY|DEEPSEEK_API_KEY|QWEN_API_KEY/);
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com|api\.deepseek\.com|dashscope\.aliyuncs\.com/);
});
