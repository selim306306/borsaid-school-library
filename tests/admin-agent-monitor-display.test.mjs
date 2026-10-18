import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMonitorStatus } from '../admin-agent-controller.mjs';

const checked = '2026-10-18T06:00:03Z';
const next = '2026-10-19T06:00:00Z';
const cairo = value => new Date(value).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

test('monitor times use Cairo independently of the device timezone and include the next review', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const text = formatMonitorStatus({ enabled: true, last_checked_at: checked, next_review_help: next, last_delivery_status: 'sent' });
    assert.ok(text.includes(`آخر فحص: ${cairo(checked)}`));
    assert.ok(text.includes(`الموعد التالي: ${cairo(next)}`));
    assert.match(text, /جميع الأوقات بتوقيت مصر/);
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test('historical delivery is explicitly separated from the latest check, for sent, failed, and pending', () => {
  for (const status of ['sent', 'failed', 'pending']) {
    const text = formatMonitorStatus({ enabled: true, last_checked_at: checked, last_delivery_status: status });
    assert.match(text, /آخر تنبيه مسجل/);
    assert.match(text, /قد يخص فحصًا سابقًا؛ ليس نتيجة آخر فحص بالضرورة/);
  }
});

test('unknown delivery never implies success and invalid dates never imply a confirmed check', () => {
  const text = formatMonitorStatus({ enabled: true, last_checked_at: 'bad date', next_review_help: 'bad date', last_delivery_status: 'unknown' });
  assert.match(text, /لا يوجد وقت فحص مؤكد/);
  assert.match(text, /لا توجد رسالة مسجلة/);
  assert.match(text, /الموعد التالي: لم يُحدد بعد/);
  assert.doesNotMatch(text, /تم التسليم|Invalid Date/);
});

test('disabled monitor does not present a stored next-review date as an active schedule', () => {
  const text = formatMonitorStatus({ enabled: false, next_review_help: next });
  assert.match(text, /غير مفعّلة لهذه المكتبة/);
  assert.doesNotMatch(text, /الموعد التالي/);
});
