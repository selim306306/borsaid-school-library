import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const brand = 'المكتبة المدرسية الرقمية';
const html = read('index.html');
test('public titles, metadata and accessible branding use the digital library name', () => {
  assert.match(html, /<title>المكتبة المدرسية الرقمية — كتابك أقرب<\/title>/);
  for (const key of ['og:title', 'og:site_name', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt', 'description']) {
    const tag = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`));
    assert.ok(tag, key); assert.ok(tag[1].includes(brand), key);
  }
  assert.match(html, /id="siteBrandTitle">المكتبة المدرسية الرقمية/);
  assert.match(html, /aria-label="المكتبة المدرسية الرقمية"/);
  assert.match(html, /أخبار المكتبة المدرسية الرقمية في بورسعيد/);
  assert.ok(html.includes('تصميم وبرمجة: محمد حامد'));
  assert.ok(html.includes('مسؤولية الموقع: محمد حامد'));
  assert.ok(html.includes('مكتبات المدارس في بورسعيد'));
  assert.ok(html.includes('https://selim306306.github.io/borsaid-school-library/'));
});
test('public text and media fallbacks contain no obsolete branding', () => {
  for (const name of ['index.html','set-password.html','global-reading.js','image-viewer.js','site-media-config.js','site-media-public.js','assets/social-preview-source.html']) {
    assert.doesNotMatch(read(name), /مكتبات بورسعيد|بوابة مدارس بورسعيد/, name);
  }
  const app = read('app.js');
  const branding = read('school-homepage-branding.mjs');
  assert.match(branding, /title.textContent = 'المكتبة المدرسية الرقمية'/);
  assert.match(app, /renderPublicSchoolBranding\(profiles, publicLogoUrl\)/);
  // Historical user-input intent aliases stay compatible, but are never rendered.
  assert.doesNotMatch(app.split('\n').filter(line => !line.includes('.test(normalized)')).join('\n'), /مكتبات بورسعيد|بوابة مدارس بورسعيد/);
  assert.ok(app.includes('profile.school_name'));
  assert.ok(existsSync(new URL('../.nojekyll', import.meta.url)));
});
test('password screen and versioned social card use consistent branding', () => {
  assert.match(read('set-password.html'), /<title>تعيين كلمة المرور \| المكتبة المدرسية الرقمية<\/title>/);
  for (const file of ['index.html','site-media-config.js','site-media-public.js']) assert.ok(read(file).includes('social-preview-20261018.jpg'), file);
  const bytes = readFileSync(new URL('../assets/social-preview-20261018.jpg', import.meta.url));
  assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8); assert.ok(bytes.length > 20000);
  assert.match(read('assets/social-preview-source.html'), /المكتبة المدرسية<br>الرقمية/);
});
