import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../site-bundle.css', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../portal-upgrade.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cardBackground = '#182744';
const labelSelector = '#homeView .portal-program-card .eyebrow-light';

function specificity(selector) {
  return (selector.match(/#[\w-]+/g) ?? []).length * 100
    + (selector.match(/\.[\w-]+/g) ?? []).length * 10
    + (selector.replace(/#[\w-]+|\.[\w-]+/g, '').match(/(?:^|\s)[a-z][\w-]*/gi) ?? []).length;
}

function luminance(hex) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

test('announcement eyebrow keeps WCAG AA contrast on the dark program card', () => {
  assert.match(html, /<section class="page-view page-home" id="homeView"/);
  assert.ok(markup.includes('class="portal-program-card"><span class="eyebrow eyebrow-light">إعلانات ومسابقات المدرسة</span>'));

  const backgroundRule = markup.match(/\.portal-program-card\s*\{[^}]*background:\s*(#[0-9a-f]{6})/i);
  assert.ok(backgroundRule, 'expected the program card background to remain explicitly defined');
  assert.equal(backgroundRule[1].toLowerCase(), cardBackground, 'the dark card background must remain unchanged');

  const escapedSelector = labelSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = bundle.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*?color:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(rule, `expected a generated CSS rule for ${labelSelector}`);
  assert.ok(specificity(labelSelector) > specificity('.page-view .eyebrow'), 'the label rule must outrank the dark generic eyebrow color');

  const foreground = rule[1];
  const luminances = [luminance(foreground), luminance(cardBackground)].sort((a, b) => b - a);
  const ratio = (luminances[0] + 0.05) / (luminances[1] + 0.05);
  assert.ok(ratio >= 4.5, `expected at least 4.5:1 contrast, got ${ratio.toFixed(2)}:1 (${foreground} on ${cardBackground})`);
});
