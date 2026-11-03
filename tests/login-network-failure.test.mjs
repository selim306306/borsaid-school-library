import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const handlerStart = app.indexOf("$('#loginForm').addEventListener('submit', async event => {");
const handlerEnd = app.indexOf('\n});', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'staff login submit handler is available');
const handlerSource = app.slice(handlerStart, handlerEnd + '\n});'.length);

function createHarness(signInWithPassword) {
  let submitHandler;
  const submitButton = { disabled: false };
  const loginMessage = {};
  const form = {
    addEventListener(type, handler) {
      assert.equal(type, 'submit');
      submitHandler = handler;
    },
  };
  const context = {
    $: (selector, root) => {
      if (selector === '#loginForm') return form;
      if (selector === '.login-submit') return submitButton;
      throw new Error(`Unexpected selector: ${selector}`);
    },
    supabase: { auth: { signInWithPassword } },
    loginMessage,
    FormData: class {
      get(name) { return name === 'email' ? 'staff@example.invalid' : 'test-password'; }
    },
    setMessage(target, text, kind) {
      Object.assign(target, { text, kind });
    },
  };
  vm.runInNewContext(handlerSource, context);
  assert.equal(typeof submitHandler, 'function');
  const currentTarget = { wasReset: false, reset() { this.wasReset = true; } };
  const event = { prevented: false, preventDefault() { this.prevented = true; }, currentTarget };
  return { submitButton, loginMessage, currentTarget, event, submitHandler };
}

test('network rejection restores the login button and shows a generic error', async () => {
  const networkError = new Error('network connection failed');
  const harness = createHarness(async () => { throw networkError; });

  await harness.submitHandler(harness.event);

  assert.equal(harness.event.prevented, true);
  assert.equal(harness.submitButton.disabled, false);
  assert.equal(harness.loginMessage.kind, 'error');
  assert.match(harness.loginMessage.text, /تعذّر تسجيل الدخول/);
  assert.doesNotMatch(harness.loginMessage.text, /network connection failed/);
  assert.equal(harness.currentTarget.wasReset, false);
});
