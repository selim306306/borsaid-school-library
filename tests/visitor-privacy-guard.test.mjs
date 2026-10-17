import test from 'node:test';
import assert from 'node:assert/strict';
import { containsSensitivePersonalData } from '../supabase/functions/visitor-questions/privacy-guard.js';

test('blocks numeric, contact, account and direct person identifiers before external processing', () => {
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
    'رقم عضوية المستعير 202612345',
    'مين استعار الكتاب؟',
    'أحمد استعار كتابًا من المكتبة',
    'تفاصيل إعارة أحمد',
    'loan history for Ahmed',
  ]) assert.equal(containsSensitivePersonalData(text), true, text);
});

test('blocks confidential attributes about students, borrowers and employees', () => {
  for (const text of [
    'ما درجات الطالب؟',
    'غياب الموظف أحمد',
    'عنوان المستعير المسجل',
    'student grade record',
    'employee salary',
    'borrower medical status',
    'رسالة شكوى عن المعلمة منى',
    'معلومات الطالب الشخصية',
  ]) assert.equal(containsSensitivePersonalData(text), true, text);
});

test('allows generic public questions that mention roles but contain no person identifier or confidential attribute', () => {
  for (const text of [
    'كيف يقرأ الطلاب في المكتبة؟',
    'ما دور الموظف في إدارة الإعارة؟',
    'كيف تنظم المكتبة سياسة الإعارة؟',
    'هل توجد كتب متاحة للقراءة؟',
    'How can students use the library?',
    'هل يمكن للطالب البحث في الفهرس العام؟',
  ]) assert.equal(containsSensitivePersonalData(text), false, text);
});
