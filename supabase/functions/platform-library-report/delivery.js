export const METRICS = [
  ['branches', 'الفروع'], ['titles', 'عناوين الكتب'], ['copies', 'النسخ المسجلة'],
  ['available', 'نسخ متاحة'], ['lost', 'نسخ مفقودة'], ['open_loans', 'إعارات مفتوحة'],
  ['overdue_loans', 'إعارات متأخرة'], ['queued_reservations', 'حجوزات انتظار'], ['ready_reservations', 'حجوزات جاهزة'],
];
const count = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.trunc(Number(value)) : 0;
export function reportMessages(report, ai) {
  const libraries = Array.isArray(report.libraries) ? report.libraries : [];
  const lines = ['تقرير مكتبات بورسعيد المدرسية — لقطة حالية', `وقت الإنشاء: ${report.generated_at}`, `المكتبات المسجلة: ${libraries.length}`, 'الأعداد مجمعة؛ لا توجد بيانات أفراد أو معرّفات. ترقيم المكتبات مطابق لترتيب التقرير في لوحة المالك.'];
  const section = (label, row) => `${label}\n${METRICS.map(([key, name]) => `${name}: ${count(row?.[key])}`).join('\n')}`;
  const blocks = [lines.join('\n'), section('الإجمالي الكلي', report.totals), ...libraries.map((row, i) => section(`مكتبة ${i + 1}`, row))];
  if (ai) blocks.push(`ملخص Gemini الإرشادي\n${ai.summary}\n${ai.actions.map(text => `• ${text}`).join('\n')}`);
  else blocks.push('ملخص Gemini غير متاح الآن؛ التقرير العددي الكامل أعلاه.');
  const messages = [];
  for (const block of blocks) {
    // Split by UTF-16 length conservatively below Telegram's 4096-character limit.
    for (let offset = 0; offset < block.length; offset += 3400) {
      const part = block.slice(offset, offset + 3400);
      if (messages.length && messages.at(-1).length + part.length + 2 <= 3500) messages[messages.length - 1] += `\n\n${part}`;
      else messages.push(part);
    }
  }
  return messages;
}
function encode(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decode(value) { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
async function signingKey(secret) { return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
export async function signPreview(payload, secret) {
  const encoded = encode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), new TextEncoder().encode(encoded));
  return `${encoded}.${encode(new Uint8Array(signature))}`;
}
export async function verifyPreview(token, secret, userId, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 500000) return null;
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) return null;
    if (!await crypto.subtle.verify('HMAC', await signingKey(secret), decode(signature), new TextEncoder().encode(encoded))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(encoded)));
    if (payload.user !== userId || !Number.isFinite(payload.expires) || payload.expires < now || payload.expires > now + 610000 || typeof payload.nonce !== 'string') return null;
    if (!Array.isArray(payload.messages) || !payload.messages.length || payload.messages.some(text => typeof text !== 'string' || !text || text.length > 3500)) return null;
    return payload;
  } catch { return null; }
}
