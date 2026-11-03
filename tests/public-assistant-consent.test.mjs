import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const portal = readFileSync(new URL('../portal-upgrade.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const ticketForm = readFileSync(new URL('../visitor-questions.js', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const privacyGuide = readFileSync(new URL('../docs/GEMINI_SETUP_AR.md', import.meta.url), 'utf8');

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing section ${startMarker}`);
  return source.slice(start, end);
}

test('the new visitor flow clears the obsolete browser-saved approval', async () => {
  const migration = await import(new URL('../visitor-public-ai-consent.mjs?cleanup-test=1', import.meta.url).href);
  const key = 'borsaid-public-assistant-ai-consent-v1';
  const values = new Map([[key, 'granted']]);
  const storage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, String(value)),
    removeItem: name => values.delete(name),
  };
  assert.equal(typeof migration.clearLegacyPublicAssistantAiConsent, 'function');
  assert.equal(migration.clearLegacyPublicAssistantAiConsent(storage), true);
  assert.equal(values.has(key), false);
});

test('public assistant discloses automatic free-Qwen processing without a consent control', () => {
  const assistant = sectionBetween(html, '<section class="visitor-assistant section-wrap"', '</section>\n    </dialog>');
  assert.match(assistant, /تُرسل الأسئلة العامة تلقائيًا إلى Qwen عبر Groq ضمن الخطة المجانية/);
  assert.match(assistant, /لا تُدخل أي اسم أو معلومة شخصية أو سرية/);
  assert.match(assistant, /قد لا تلتقط حواجز الخصوصية كل الحالات/);
  assert.match(assistant, /لا تُحفظ هذه المحادثة في قاعدة بيانات الموقع ولا تُرسل عبر Telegram/);
  assert.doesNotMatch(assistant, /visitorAssistantPersistentConsent|visitorAssistantConsentStatus|الموافقة المحفوظة|أوافق على إرسال/);
});

test('public chat and private visitor follow-up no longer depend on browser-saved approval', () => {
  assert.doesNotMatch(app, /hasPublicAssistantAiConsent|setPublicAssistantAiConsent|needsExternalModelConsent|data-visitor-free-model-consent/);
  assert.match(app, /clearLegacyPublicAssistantAiConsent\(\)/);
  assert.doesNotMatch(portal, /hasPublicAssistantAiConsent|setPublicAssistantAiConsent|visitorAssistantPersistentConsent/);
  assert.doesNotMatch(ticketForm, /hasPublicAssistantAiConsent/);
  assert.match(ticketForm, /externalAiConsent:\s*true/);

  const tickets = sectionBetween(html, '<section class="visitor-support section-wrap"', '<footer class="site-footer');
  assert.match(tickets, /تُرسل الأسئلة العامة تلقائيًا إلى Qwen عبر Groq ضمن الخطة المجانية/);
  assert.match(tickets, /قد يصل نص السؤال والرد إلى مدير الموقع عبر Telegram/);
  assert.doesNotMatch(tickets, /الموافقة المحفوظة على هذا الجهاز|فعّلت موافقة Qwen/);
});

test('automatic visitor approval stays separate from staff and manager consent boundaries', () => {
  assert.match(html, /id="adminAgentConsent"/);
  assert.match(html, /أوافق على إرسال أعداد مجمعة فقط إلى Gemini/);
  assert.match(html, /name="consent" type="checkbox" required/);
  assert.match(privacyGuide, /إرسال نص سؤال دردشة الموظفين إلى Gemini يتطلب موافقة مستقلة لكل سؤال/);
  assert.match(privacyGuide, /Telegram.*لا يطلب موافقة لكل رسالة/);
  assert.match(readme, /لا تُرسل بيانات الطلاب أو المستعيرين أو الإعارات الفردية إلى أي نموذج/);
});

test('current guides describe automatic public processing without browser-persisted consent', () => {
  assert.match(readme, /الأسئلة العامة.*تلقائيًا.*Qwen عبر Groq/);
  assert.match(privacyGuide, /تُرسل الأسئلة العامة تلقائيًا/);
  assert.doesNotMatch(privacyGuide, /موافقة الزائر المحفوظة محليًا|موافقة الزائر المحفوظة على هذا المتصفح/);
});
