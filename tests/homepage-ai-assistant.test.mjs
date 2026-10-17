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

test('homepage AI entry points open the Gemini-powered librarian assistant, not Telegram', () => {
  assert.match(html, /href="#visitorAssistant">مساعد أمين المكتبة<\/a>/);
  assert.match(html, /id="headerVisitorChatShortcut"[^>]*aria-controls="visitorChatDialog"/);
  assert.match(html, /id="visitorChatDialog"/);
  assert.match(html, /id="visitorAssistant"[^>]*aria-labelledby="visitorAssistantTitle"/);
  assert.match(html, /id="visitorAssistantTitle">اسأل مساعد أمين المكتبة عن الموقع أو كتاب منشور<\/h2>/);
  assert.match(html, /id="visitorChatDialogTitle">مساعد أمين المكتبة المدعوم بـGemini<\/h2>/);

  const aiPathway = sectionBetween('<article class="visitor-pathway-card visitor-pathway-ai">', '</article>');
  assert.match(aiPathway, /href="#visitorAssistant"/);
  assert.match(aiPathway, /Gemini/);
  assert.doesNotMatch(aiPathway, /t\.me\//);

  const telegramPathway = sectionBetween('<article class="visitor-pathway-card visitor-pathway-telegram">', '</article>');
  assert.match(telegramPathway, /t\.me\/PortSaidSchoolLibrariesBot/);
});

test('the public assistant privacy disclosure remains local and distinct from the librarian question path', () => {
  const assistant = sectionBetween('<section class="visitor-assistant section-wrap"', '</section>\n    </dialog>');
  assert.match(assistant, /تُرسل الأسئلة العامة تلقائيًا إلى Gemini/);
  assert.match(assistant, /لا تُحفظ في قاعدة بيانات موقع المكتبة أو تُرسل لمديره عبر Telegram/);
  assert.match(assistant, /يُحجب السؤال الذي يتضمن بيانات شخصية أو سرية محليًا/);
  assert.match(assistant, /استخدم النموذج المخصص/);
});
