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

test('homepage assistant entry points lead to a provider-neutral librarian assistant', () => {
  assert.match(html, /href="#visitorAssistant">مساعد أمين المكتبة<\/a>/);
  assert.match(html, /id="headerVisitorChatShortcut"[^>]*aria-controls="visitorChatDialog"/);
  assert.match(html, /id="visitorChatDialog"/);
  assert.match(html, /id="visitorAssistant"[^>]*aria-labelledby="visitorAssistantTitle"/);
  assert.match(html, /id="visitorAssistantTitle">اسأل عن الموقع أو كتاب منشور<\/h2>/);
  assert.match(html, /id="visitorChatDialogTitle">مساعد أمين المكتبة/);

  const aiPathway = sectionBetween('<article class="visitor-pathway-card visitor-pathway-ai">', '</article>');
  assert.match(aiPathway, /href="#visitorAssistant"/);
  assert.match(aiPathway, /Qwen/);
  assert.match(aiPathway, /Groq/);
  assert.doesNotMatch(aiPathway, /Gemini|DeepSeek|t\.me\//i);

  const telegramPathway = sectionBetween('<article class="visitor-pathway-card visitor-pathway-telegram">', '</article>');
  assert.match(telegramPathway, /t\.me\/PortSaidSchoolLibrariesBot/);
  assert.doesNotMatch(telegramPathway, /Gemini|DeepSeek/i);
});

test('public assistant explains optional free-model consent and local fallback separately from the ticket form', () => {
  const assistant = sectionBetween('<section class="visitor-assistant section-wrap"', '</section>\n    </dialog>');
  assert.match(assistant, /Qwen/);
  assert.match(assistant, /Groq/);
  assert.match(assistant, /خطة Groq المجانية/);
  assert.match(assistant, /محلي/);
  assert.match(assistant, /لا تُحفظ هذه المحادثة في قاعدة بيانات الموقع ولا تُرسل عبر Telegram/);
  assert.match(assistant, /لا تُدخل أي اسم أو معلومة شخصية أو سرية/);
  assert.doesNotMatch(assistant, /Gemini|DeepSeek/i);
});

test('public ticket form makes free-model processing an explicit optional choice', () => {
  const tickets = sectionBetween('<section class="visitor-support section-wrap"', '<footer class="site-footer');
  assert.match(tickets, /visitorQuestionAiConsent/);
  assert.match(tickets, /أوافق/);
  assert.match(tickets, /Qwen/);
  assert.match(tickets, /Groq/);
  assert.match(tickets, /متابعة يدوية/);
  assert.doesNotMatch(tickets, /Gemini|DeepSeek/i);
});
