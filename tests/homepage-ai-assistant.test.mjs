import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function sectionBetween(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return html.slice(start, end);
}

test('homepage assistant entry points lead to the unified public assistant', () => {
  assert.match(html, /href="#visitorAssistant">المساعد الذكي<\/a>/);
  assert.match(html, /id="headerVisitorChatShortcut"[^>]*aria-controls="visitorChatDialog"/);
  assert.match(html, /id="visitorChatDialog"/);
  assert.match(html, /id="visitorAssistant"[^>]*aria-labelledby="visitorAssistantTitle"/);
  assert.match(html, /id="visitorAssistantTitle">اسأل عن الموقع أو كتاب منشور<\/h2>/);
  assert.match(html, /id="visitorChatDialogTitle">المساعد الذكي/);

  const aiPathway = sectionBetween('<article class="visitor-pathway-card visitor-pathway-ai">', '</article>');
  assert.match(aiPathway, /href="#visitorAssistant"/);
  assert.match(aiPathway, /Qwen/);
  assert.match(aiPathway, /Groq/);
  assert.match(aiPathway, /تُرسل الأسئلة العامة تلقائيًا إلى Qwen عبر Groq/);
  assert.doesNotMatch(aiPathway, /Gemini|DeepSeek|t\.me\//i);

  const telegramPathway = sectionBetween('<article class="visitor-pathway-card visitor-pathway-telegram">', '</article>');
  assert.match(telegramPathway, /t\.me\/PortSaidSchoolLibrariesBot/);
  assert.doesNotMatch(telegramPathway, /Gemini|DeepSeek/i);
});

test('public assistant explains automatic free-Qwen processing separately from private ticket follow-up', () => {
  const assistant = sectionBetween('<section class="visitor-assistant section-wrap"', '</section>\n    </dialog>');
  assert.match(assistant, /Qwen/);
  assert.match(assistant, /Groq/);
  assert.match(assistant, /تُرسل الأسئلة العامة تلقائيًا/);
  assert.doesNotMatch(assistant, /visitorAssistantPersistentConsent|الموافقة المحفوظة|حفظ الموافقة/);
  assert.match(assistant, /لا تُحفظ هذه المحادثة في قاعدة بيانات الموقع ولا تُرسل عبر Telegram/);
  assert.match(assistant, /لا تُدخل أي اسم أو معلومة شخصية أو سرية/);
  assert.doesNotMatch(assistant, /Gemini|DeepSeek/i);
});

test('public follow-up explains the saved Qwen choice and its separate Telegram handling', () => {
  const tickets = sectionBetween('<section class="visitor-support section-wrap"', '<footer class="site-footer');
  assert.doesNotMatch(tickets, /visitorQuestionAiConsent/);
  assert.match(tickets, /تُرسل الأسئلة العامة تلقائيًا إلى Qwen عبر Groq/);
  assert.match(tickets, /قد يصل نص السؤال والرد إلى مدير الموقع عبر Telegram/);
  assert.doesNotMatch(tickets, /الموافقة المحفوظة على هذا الجهاز|فعّلت موافقة Qwen/);
  assert.match(tickets, /Qwen/);
  assert.match(tickets, /Groq/);
  assert.match(tickets, /تُتابع يدويًا/);
  assert.doesNotMatch(tickets, /Gemini|DeepSeek/i);
});
