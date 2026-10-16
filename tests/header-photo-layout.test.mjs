import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../header-photo.css', import.meta.url), 'utf8');

test('header gallery keeps five full-frame photos and places attribution outside the image', () => {
  const slot = html.match(/<div class="header-feature-image-slot"[\s\S]*?<\/div>/)?.[0];
  assert.ok(slot, 'header carousel frame exists');
  assert.equal((slot.match(/class="brand-header-photo/g) || []).length, 5);
  assert.doesNotMatch(slot, /headerPhotoAttribution/);

  const slotEnd = html.indexOf(slot) + slot.length;
  const attributionIndex = html.indexOf('id="headerPhotoAttribution"');
  const assistantIndex = html.indexOf('id="headerVisitorChatShortcut"');
  assert.ok(attributionIndex > slotEnd, 'source note follows the image frame');
  assert.ok(assistantIndex > attributionIndex, 'assistant shortcut follows the source note');

  const imageRule = css.match(/\.header-feature-image-slot \.brand-header-photo\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(imageRule, /width:\s*100%/);
  assert.match(imageRule, /height:\s*100%/);
  assert.match(imageRule, /object-fit:\s*cover/);
  assert.match(imageRule, /object-position:\s*center/);
});
