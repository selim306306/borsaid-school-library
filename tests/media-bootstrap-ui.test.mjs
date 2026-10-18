import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('async function requestMediaBootstrapSync('), source.indexOf('function setSiteMediaManagerStatus('));
function fixture({ owner = true, fails = false } = {}) {
  const calls = [], messages = [], buttons = [];
  const context = vm.createContext({
    hasSiteFooterOwnership: () => owner,
    supabase: { functions: { invoke: async (name, options) => { calls.push({ name, options }); return fails ? { error: new Error('failed') } : { data: { accepted: true } }; } } },
    setSiteMediaManagerStatus: (...args) => messages.push(args),
    $: selector => selector === '#siteMediaManagerStatus' ? { after: button => buttons.push(button) } : null,
    document: { createElement: () => ({ addEventListener: function (_, fn) { this.click = fn; } }) },
  });
  vm.runInContext(helpers, context);
  return { context, calls, messages, buttons };
}
test('only active owner requests fixed function for banner and mark, never album images', async () => {
  const f = fixture();
  assert.equal(await f.context.requestMediaBootstrapSync('header-feature-image'), true);
  assert.equal(await f.context.requestMediaBootstrapSync('site-mark'), true);
  assert.equal(await f.context.requestMediaBootstrapSync('header-feature-image-25'), null);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].name, 'sync-media-bootstrap');
  assert.equal(JSON.stringify(f.calls[0].options), '{"body":{"media_key":"header-feature-image"}}');
  const unauthorized = fixture({ owner: false });
  assert.equal(await unauthorized.context.requestMediaBootstrapSync('site-mark'), null);
  assert.equal(unauthorized.calls.length, 0);
});
test('dispatch failure keeps saved-photo message and gives manual retry, with no polling', async () => {
  const f = fixture({ fails: true });
  assert.equal(await f.context.requestMediaBootstrapSync('site-mark'), false);
  f.context.showMediaBootstrapSyncResult('site-mark', false);
  assert.match(f.messages[0][0], /حُفظت الصورة/);
  assert.equal(f.buttons.length, 1);
  await f.buttons[0].click();
  assert.equal(f.calls.length, 2);
  assert.equal(f.buttons.length, 2);
});
test('accepted means queued, not published; manual retry remains available after async build failure', () => {
  const f = fixture();
  f.context.showMediaBootstrapSyncResult('header-feature-image', true);
  assert.match(f.messages[0][0], /طلب/);
  assert.match(f.messages[0][0], /١٠ دقائق/);
  assert.match(f.buttons[0].textContent, /تعثّر البناء/);
  assert.equal(f.calls.length, 0);
});
