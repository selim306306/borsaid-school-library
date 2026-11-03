import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const consentModule = new URL('../visitor-public-ai-consent.mjs', import.meta.url);
const portalModule = new URL('../portal-upgrade.js', import.meta.url);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const portal = readFileSync(portalModule, 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const ticketForm = readFileSync(new URL('../visitor-questions.js', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const privacyGuide = readFileSync(new URL('../docs/GEMINI_SETUP_AR.md', import.meta.url), 'utf8');

test('public AI consent is opt-in, stored on this browser, reusable, and revocable', async () => {
  assert.ok(existsSync(consentModule), 'a shared browser-only consent helper should exist');
  const consent = await import(consentModule.href);
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };

  assert.equal(consent.hasPublicAssistantAiConsent(storage), false);
  consent.setPublicAssistantAiConsent(true, storage);
  const reloadedConsent = await import(new URL('../visitor-public-ai-consent.mjs?fresh=1', import.meta.url).href);
  assert.equal(reloadedConsent.hasPublicAssistantAiConsent(storage), true, 'the saved choice should survive a page reload');
  consent.setPublicAssistantAiConsent(false, storage);
  assert.equal(consent.hasPublicAssistantAiConsent(storage), false, 'revoking consent should take effect immediately');
  assert.equal(values.size, 0, 'revocation should remove the stored preference');
});

test('all public assistant paths share one transparent, revocable device preference', () => {
  assert.ok(html.includes('id="visitorAssistantPersistentConsent"'), 'a shared consent toggle should be visible');
  assert.ok(html.includes('إرسال الأسئلة العامة تلقائيًا'), 'the toggle should explain the automatic processing');
  assert.ok(html.includes('تُحفظ الموافقة محليًا في هذا المتصفح فقط'), 'the page should explain where the preference is stored');
  assert.ok(!html.includes('visitorQuestionAiConsent'), 'the question form should not ask for duplicate per-question consent');
  assert.ok(portal.includes('setPublicAssistantAiConsent') && portal.includes('hasPublicAssistantAiConsent'), 'the shared control should load and update the saved choice');
  assert.ok(app.includes('hasPublicAssistantAiConsent') && app.includes('setPublicAssistantAiConsent'), 'the chat should reuse and save the same choice');
  assert.ok(ticketForm.includes('hasPublicAssistantAiConsent'), 'the follow-up form should reuse the same choice');
  assert.ok(!portal.includes('موافقة مستقلة لكل سؤال'), 'the dialog should no longer describe repeated consent');
});

test('visitor, staff, and manager surfaces use one name while retaining separate consent and access boundaries', () => {
  assert.ok(html.includes('id="visitorChatDialogTitle">المساعد الذكي'), 'the dialog should use the unified title');
  assert.ok(html.includes('id="visitorQuestionTitle">أرسل سؤالًا للمساعد الذكي'), 'the follow-up action should use the same assistant name');
  assert.ok(portal.includes("title.textContent = 'المساعد الذكي'"), 'the runtime title should match the static title');
  assert.ok(!/مساعد أمين المكتبة|مساعد زوار/.test(html + portal), 'old public visitor-assistant names should be removed');
  assert.ok(html.includes('id="assistantChatTitle">المساعد الذكي'), 'the staff assistant should use the common name');
  assert.ok(html.includes('للموظفين المخولين فقط'), 'staff access should remain explicit');
  assert.ok(html.includes('للمالك والمسؤول فقط'), 'manager access should remain explicit');
  assert.ok(html.includes('أوافق على إرسال نصه إلى Gemini'), 'staff consent should remain a separate per-question control');
});

test('current guides distinguish the visitor browser preference from internal and Telegram consent', () => {
  assert.ok(readme.includes('حفظ موافقته محليًا على هذا المتصفح'), 'README should explain the persistent device choice');
  assert.ok(!/مساعد أمين المكتبة|مساعد الزوار|مساعد زوار/.test(readme), 'README should use the unified public assistant name');
  assert.ok(privacyGuide.includes('حفظ الموافقة محليًا على هذا المتصفح'), 'privacy guide should document the shared setting');
  assert.ok(privacyGuide.includes('موافقة مستقلة لكل سؤال'), 'staff chat should retain its separate per-question consent');
  assert.ok(privacyGuide.includes('لا يطلب موافقة لكل رسالة'), 'Telegram should answer automatically without per-message consent');
  assert.ok(privacyGuide.includes('موافقة الزائر المحفوظة محليًا تخص متصفح الموقع'), 'the visitor preference should remain browser-specific');
});

test('browser-facing portal module can be imported in Node without a document global', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(portalModule.href)})`], { encoding: 'utf8' });
  assert.equal(result.status, 0, `the import should not assume a browser DOM: ${result.stderr}`);
});
