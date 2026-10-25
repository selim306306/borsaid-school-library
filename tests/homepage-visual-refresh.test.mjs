import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const themeCss = readFileSync(new URL('../reader-theme.css', import.meta.url), 'utf8');
const layoutCss = readFileSync(new URL('../home-news-layout.css', import.meta.url), 'utf8');
const regularPhoneCss = layoutCss.slice(layoutCss.lastIndexOf('@media (max-width: 700px)'));
const narrowPhoneCss = layoutCss.slice(layoutCss.lastIndexOf('@media (max-width: 360px)'));
const rootTokens = [...themeCss.matchAll(/:root\s*\{([^}]*)\}/gs)].map(match => match[1]).join('\n');

function colorToken(name) {
  const match = rootTokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(match, `Expected the theme to define --${name}`);
  return match[1];
}

function linearChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const values = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
  return 0.2126 * linearChannel(values[0])
    + 0.7152 * linearChannel(values[1])
    + 0.0722 * linearChannel(values[2]);
}

function contrastRatio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function colorValues(cssValue) {
  return [...cssValue.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)].map(match => match[0]);
}

function rgbChannels(color) {
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex.slice(0, 3)].map(char => char + char).join('');
    return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
  }
  return (color.match(/[-+]?(?:\d*\.)?\d+%?/g) ?? []).slice(0, 3).map(value => {
    const number = parseFloat(value);
    return value.endsWith('%') ? number * 2.55 : number;
  });
}

function hueAndChroma(color) {
  const [red, green, blue] = rgbChannels(color);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  if (chroma === 0) return { hue: null, chroma };
  let hue;
  if (max === red) hue = 60 * (((green - blue) / chroma) % 6);
  else if (max === green) hue = 60 * ((blue - red) / chroma + 2);
  else hue = 60 * ((red - green) / chroma + 4);
  return { hue: (hue + 360) % 360, chroma };
}

function nonBlueThemeColors() {
  const colorProperties = new Set([
    'color', 'background', 'background-color', 'background-image', 'border', 'border-color',
    'border-top', 'border-top-color', 'border-right', 'border-right-color', 'border-bottom',
    'border-bottom-color', 'border-left', 'border-left-color', 'border-inline-start',
    'border-inline-start-color', 'border-inline-end', 'border-inline-end-color', 'outline',
    'outline-color', 'text-decoration-color', 'fill', 'stroke', 'accent-color', 'caret-color', 'box-shadow'
  ]);
  const violations = [];
  for (const match of themeCss.matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]*)/g)) {
    const property = match[1].toLowerCase();
    const isColorToken = property.startsWith('--');
    if (!colorProperties.has(property) && !isColorToken) continue;
    for (const color of colorValues(match[2])) {
      const { hue, chroma } = hueAndChroma(color);
      if (chroma > 3 && (hue < 195 || hue > 240)) violations.push(`${property}: ${color}`);
    }
  }
  return violations;
}

test('الصفحة الرئيسية تستخدم سطحًا أزرق فاتحًا ونصًا وزرًا بتباين AA', () => {
  const canvas = colorToken('library-canvas');
  const surface = colorToken('library-surface');
  const ink = colorToken('library-ink');
  const accent = colorToken('library-accent');
  const [red, green, blue] = canvas.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));

  assert.ok(blue > red && green >= red, 'The canvas should read as a cool blue tint');
  assert.ok(luminance(canvas) >= 0.9, 'The page canvas should remain very light');
  assert.ok(luminance(surface) >= 0.95, 'Cards should remain white or near-white');
  assert.ok(contrastRatio(ink, canvas) >= 4.5, 'Body text must meet WCAG AA on the canvas');
  assert.ok(contrastRatio('#ffffff', accent) >= 4.5, 'White button text must meet WCAG AA');
  assert.match(themeCss, /\.page-home\s*>\s*\.portal-hero\s*\{[^}]*background:\s*linear-gradient\(/s);
  assert.match(themeCss, /\.page-home\s+\.portal-search-panel\s*\{[^}]*background(?:-color)?:\s*var\(--library-surface\)/s);
});

test('ألوان لوحة المعاينة تقتصر على الأبيض والأزرق دون درجات بنفسجية أو دافئة', () => {
  const palette = themeCss.split('/* Port Said library refresh:')[1] ?? '';
  assert.ok(palette, 'Expected the current library palette block');
  const colors = colorValues(palette);
  const outsideBlue = colors.filter(color => {
    const { hue, chroma } = hueAndChroma(color);
    return chroma > 3 && (hue < 195 || hue > 240);
  });
  assert.deepEqual(outsideBlue, [], `Expected only neutral/blue colors, got: ${outsideBlue.join(', ')}`);
});

test('البطاقات والزر تستخدم تجسيمًا ناعمًا بظلال خارجية وإبراز داخلي', () => {
  const shadowTokens = new Map([...themeCss.matchAll(/--(reader-shadow(?:-raised|-control)?):\s*([^;]+);/g)]
    .map(([, name, value]) => [`--${name}`, value.trim()]));
  const resolveShadow = value => value.replace(/var\((--[\w-]+)\)/g, (_, name) => shadowTokens.get(name) ?? '');
  const layeredShadow = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rules = [...themeCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map(match => match[1]);
    const rule = rules.reverse().find(candidate => /box-shadow:/.test(candidate)) ?? '';
    const shadow = resolveShadow(rule.match(/box-shadow:\s*([^;]+)/)?.[1] ?? '');
    assert.ok((shadow.match(/rgba?\(/g) ?? []).length >= 2, `${selector} needs multiple soft shadow layers`);
    assert.match(shadow, /\binset\b/, `${selector} needs an inner highlight`);
  };

  for (const selector of ['.page-home .portal-search-panel', '.page-home .portal-side', '.page-home .portal-side-link', '.page-home .portal-search-submit']) {
    layeredShadow(selector);
  }
});

test('كل ألوان الثيم ودرجات الظلال تقع ضمن الأبيض والأزرق', () => {
  const outsideBlue = nonBlueThemeColors();
  assert.deepEqual(outsideBlue, [], `Expected only neutral/blue theme colors, got: ${outsideBlue.join(', ')}`);
});

test('المسارات في الهاتف المعتاد عمودان، والشاشات الأضيق عمود واحد مع أهداف لمس كبيرة', () => {
  assert.match(regularPhoneCss, /\.page-home\s+\.portal-side-links\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(regularPhoneCss, /\.page-home\s+\.portal-side-link\s*\{[^}]*min-height:\s*94px;/s);
  assert.match(layoutCss, /\.page-home\s+\.portal-search-row\s*\{\s*min-height:\s*52px;/s);
  assert.match(narrowPhoneCss, /\.page-home\s+\.portal-side-links\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(narrowPhoneCss, /\.page-home\s+\.portal-side-link\s*\{[^}]*min-height:\s*52px;/s);
});

test('روابط البوابة تحافظ على مؤشر تركيز واضح وتحترم تفضيل تقليل الحركة', () => {
  assert.match(themeCss, /\.page-home\s+\.portal-side-link:focus-visible\s*\{[^}]*outline:\s*3px/s);
  assert.match(themeCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.page-home\s+\.portal-side-link[^}]*transition:\s*none/s);
});
