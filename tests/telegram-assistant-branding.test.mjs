import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleTelegramMessage, TELEGRAM_PUBLIC_DISCLOSURE } from '../supabase/functions/telegram-webhook/bot-handler.js';
import { buildTelegramMessage } from '../supabase/functions/library-admin-monitor/metrics.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const match = (text, pattern, message) => assert.ok(pattern.test(text), message);
const notMatch = (text, pattern, message) => assert.ok(!pattern.test(text), message);
const html = read('index.html');
const readme = read('README.md');
const setupGuide = read('docs/GEMINI_SETUP_AR.md');
const automationGuide = read('docs/AUTOMATION_SETUP_AR.md');
const adminGuide = read('docs/ADMIN_AGENT_AR.md');

test('Telegram start, automatic answer, and fallback use the common name without asking per-message consent', async () => {
  match(TELEGRAM_PUBLIC_DISCLOSURE, /المساعد الذكي/, 'Telegram disclosure should use the common assistant name');
  notMatch(TELEGRAM_PUBLIC_DISCLOSURE, /اسأل أمين المكتبة/, 'Telegram should not refer to the retired website form name');

  const startMessages = [];
  const startResult = await handleTelegramMessage({
    chatId: 'brand-start', ownerChatId: null, text: '/start',
    sendText: async (_chatId, text) => { startMessages.push(text); return true; },
  });
  assert.equal(startResult.action, 'public_start');
  match(startMessages[0], /المساعد الذكي/, 'Telegram welcome should use the common name');
  notMatch(startMessages[0], /موافقة/, 'Telegram welcome must not add a consent request');
  notMatch(startMessages[0], /اسأل أمين المكتبة/, 'Telegram welcome should not retain the old website form name');

  const answerMessages = [];
  const modelCalls = [];
  const answerResult = await handleTelegramMessage({
    chatId: 'brand-answer', ownerChatId: null, text: 'ما خدمات الموقع؟',
    answerWithFreeProvider: async question => { modelCalls.push(question); return { ok: true, text: 'إجابة عامة.' }; },
    sendText: async (_chatId, text) => { answerMessages.push(text); return true; },
  });
  assert.equal(answerResult.action, 'answered');
  assert.deepEqual(modelCalls, ['ما خدمات الموقع؟']);
  match(answerMessages[0], /المساعد الذكي/, 'Telegram answers should use the common name');
  notMatch(answerMessages[0], /موافقة/, 'Telegram answers must not ask for per-message consent');

  const fallbackMessages = [];
  await handleTelegramMessage({
    chatId: 'brand-fallback', ownerChatId: null, text: 'سؤال عام',
    answerWithFreeProvider: async () => ({ ok: false, sentToExternalModel: false }),
    sendText: async (_chatId, text) => { fallbackMessages.push(text); return true; },
  });
  match(fallbackMessages[0], /المساعد الذكي/, 'Telegram fallback should direct to the renamed assistant');
  notMatch(fallbackMessages[0], /اسأل أمين المكتبة/, 'Telegram fallback should not retain the old website form name');
});

test('the owner setup notice and admin Telegram monitor use the same brand while remaining separate flows', async () => {
  const linkMessages = [];
  const linkResult = await handleTelegramMessage({
    chatId: 'owner-link', ownerChatId: null, ownerSetupCode: 'SETUPCODE', text: '/start SETUPCODE',
    linkOwner: async () => true,
    sendText: async (_chatId, text) => { linkMessages.push(text); return true; },
  });
  assert.equal(linkResult.action, 'owner_linked');
  match(linkMessages[0], /المساعد الذكي/, 'owner setup should identify the website follow-up assistant');
  notMatch(linkMessages[0], /اسأل أمين المكتبة/, 'owner setup should not keep the old website form name');

  const adminMessage = buildTelegramMessage({ titles: 2, missing_author: 1, missing_classification: 0, missing_isbn: 3, whitespace_candidates: 1 });
  match(adminMessage, /المساعد الذكي/, 'administrative Telegram monitor should use the common brand');
  match(adminMessage, /لا تعدّل من Telegram/, 'Telegram monitor must remain notification-only');
  notMatch(adminMessage, /وكيل مدير المكتبة/, 'the old admin assistant name should be removed');
});

test('site Telegram entry point and current guides use one name and preserve channel-specific rules', () => {
  match(html, /المساعد الذكي عبر Telegram/, 'the site shortcut should use the common name for Telegram');
  for (const document of [readme, setupGuide, automationGuide, adminGuide]) {
    match(document, /المساعد الذكي/, 'each current guide should use the common name');
    notMatch(document, /مساعد الموظفين|مساعد المدير|مساعد الزوار|مساعد زوار|مساعد أمين المكتبة|اسأل أمين المكتبة|وكيل مدير المكتبة|مساعدا Gemini/, 'current guides should not retain old assistant names');
  }
  match(setupGuide, /Telegram[^\n]*لا يطلب موافقة لكل رسالة/, 'the guide should distinguish Telegram from browser consent');
  match(setupGuide, /موافقة الزائر المحفوظة[^\n]*متصفح/, 'visitor consent should remain browser-specific');
  match(setupGuide, /صلاحية الموظف[^\n]*منفصل/, 'internal permissions and data paths should remain separate');
});
