import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const match = (text, pattern, message) => assert.ok(pattern.test(text), message);
const notMatch = (text, pattern, message) => assert.ok(!pattern.test(text), message);
const html = read('index.html');
const app = read('app.js');
const publicAssistant = read('supabase/functions/_shared/public-assistant.js');
const adminAgent = read('supabase/functions/library-admin-agent/index.ts');
const staffAndManagerAssistant = read('supabase/library-assistant/functions /library-assistant/index.ts');

test('staff, manager, and library-review tools use one assistant brand while keeping role boundaries visible', () => {
  match(html, /data-panel="assistantPanel" type="button">المساعد الذكي<\/button>/, 'staff navigation should use the common assistant name');
  match(html, /id="adminAgentTitle">المساعد الذكي<\/h3>/, 'manager review should use the common assistant name');
  match(html, /id="managerAssistantTitle">المساعد الذكي<\/h3>/, 'manager summary should use the common assistant name');
  match(html, /id="assistantChatTitle">المساعد الذكي<\/h4>/, 'staff chat should use the common assistant name');
  match(html, /للمالك والمسؤول فقط/, 'manager-only scope should remain visible');
  match(html, /للموظفين المخولين فقط/, 'staff-only scope should remain visible');
  match(html, /لا يرى السجلات ولا ينفذ إجراءً/, 'staff chat must remain informational only');
  match(html, /أوافق على إرسال نصه إلى Gemini/, 'staff question consent must remain separate');
  match(html, /أوافق على إرسال أعداد مجمعة فقط إلى Gemini/, 'library review aggregate consent must remain separate');
  match(app, /label\.textContent = kind === 'user' \? 'أنت' : 'المساعد الذكي'/, 'dynamic staff replies should use the common name');
  match(app, /لا يملك صلاحية استخدام المساعد الذكي/, 'authorization errors should use the common name');
  match(app, /تعذّر الاتصال بالمساعد الذكي/, 'manager errors should use the common name');
  notMatch(`${html}\n${app}`, /مساعد المكتبة الذكي|مساعد الموظفين|مساعد مدير المكتبة|مساعد المكتبة|مساعد المدير|وكيل مدير المكتبة|وكيل الإدارة وGemini/, 'old staff and manager assistant labels should be removed');
});

test('public, staff, and manager model identities share the brand without weakening privacy or role-specific limits', () => {
  match(publicAssistant, /أنت المساعد الذكي لزوار/, 'public model identity should use the common name');
  match(publicAssistant, /لا تكشف أو تستنتج بيانات أشخاص أو سجلات طلاب\//, 'public model must retain its no-personal-data instruction');
  match(adminAgent, /أنت المساعد الذكي/, 'manager model identity should use the common name');
  match(adminAgent, /أعداد مجهولة فقط/, 'manager model must remain limited to anonymous aggregate counts');
  match(staffAndManagerAssistant, /أنت المساعد الذكي لإرشاد موظفي/, 'staff model identity should use the common name');
  match(staffAndManagerAssistant, /أنت المساعد الذكي لتقارير/, 'manager summary model identity should use the common name');
  notMatch(staffAndManagerAssistant, /أنت مساعد تشغيل|أنت مساعد تقارير/, 'legacy internal model identities should be removed');
});
