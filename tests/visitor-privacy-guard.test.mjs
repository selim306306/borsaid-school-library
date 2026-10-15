import test from 'node:test';
import assert from 'node:assert/strict';
import { containsSensitivePersonalData } from '../supabase/functions/visitor-questions/privacy-guard.js';

test('blocks numeric, account and direct person identifiers before external processing', () => {
  for (const text of [
    'رقم الطالب 12345678',
    'الطالب أحمد استعار الكتاب',
    'اسم الموظف محمد',
    'اسمي سارة',
    'student Ahmed borrowed a book',
    'my name is Mohamed',
    'user@example.com',
    'رقم تليفوني 01012345678',
    'بيانات الموظف محمد',
    'أمين المكتبة محمد',
    'employee records',
  ]) assert.equal(containsSensitivePersonalData(text), true, text);
});

test('allows generic public questions that mention roles but contain no person identifier', () => {
  for (const text of [
    'كيف يقرأ الطلاب في المكتبة؟',
    'ما دور الموظف في إدارة الإعارة؟',
    'هل توجد كتب متاحة للقراءة؟',
    'How can students use the library?',
  ]) assert.equal(containsSensitivePersonalData(text), false, text);
});
