import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { cleanMetrics, localReview, translateError, initializeAdminAgent } from '../admin-agent-controller.mjs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
test('admin UI is inside assistant panel, defaults hidden, and declares daily/limited execution', () => {
  assert.match(html, /id="assistantPanel"[\s\S]*id="adminAgentSection" hidden/);
  assert.match(html, /مراجعة الفهرس عبر الخادم/);
  assert.match(html, /يوميًا 09:00 بتوقيت مصر/);
  assert.match(html, /أعداد مجمعة فقط/);
  assert.match(app, /adminAgentController\?\.configureRole\(role\)/);
});
test('offline helper and RPC sanitation only return bounded aggregate counts', () => {
  assert.deepEqual(localReview([{ title: '  كتاب  ', author: '', classification: '  ', isbn: '', series_name: 'سلسلة' }, { title: 'عنوان', author: 'كاتب', classification: '100', isbn: '1' }]), { titles: 2, missing_author: 1, missing_classification: 1, missing_isbn: 1, whitespace_candidates: 1 });
  assert.deepEqual(cleanMetrics({ titles: 3, missing_author: -2, missing_isbn: '4', raw: 'secret' }), { titles: 3, missing_author: 0, missing_classification: 0, missing_isbn: 4, whitespace_candidates: 0 });
});
test('errors do not expose backend credentials or traces', () => {
  assert.equal(translateError(new Error('403 permission denied')), 'لا تملك صلاحية تنفيذ هذا الإجراء.');
  assert.equal(translateError(new Error('network timeout')), 'تعذّر الاتصال. لم نؤكد نتيجة العملية؛ راجع التاريخ قبل إعادة المحاولة.');
});
class FakeElement {
  constructor(id = '') { Object.assign(this, { id, hidden: false, disabled: false, dataset: {}, children: [], listeners: {}, value: 'review', checked: false, textContent: '' }); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async dispatch(type, event = { target: this }) { for (const fn of this.listeners[type] || []) await fn(event); }
  replaceChildren(...items) { this.children = items; }
  append(...items) { this.children.push(...items); }
  closest() { return this; }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const ids = ['adminAgentSection','adminAgentLocalReview','adminAgentGemini','adminAgentNormalize','adminAgentGoal','adminAgentConsent','adminAgentStatus','adminAgentMetrics','adminAgentHistory','adminAgentOutput','adminAgentPreview','adminAgentMonitorStatus'];
async function harness(run, handler = async () => ({ data: { metrics: { titles: 7, whitespace_candidates: 2 }, history: [] } })) {
  const nodes = new Map(ids.map(id => [id, new FakeElement(id)]));
  const oldDocument = globalThis.document;
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
  globalThis.document = { getElementById: id => nodes.get(id) || null, createElement: () => new FakeElement() };
  const context = { libraryId: 'library-1', role: 'admin', sessionId: 'session-1' };
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name,args]); if (name === 'admin_agent_monitor_status') return { data: { enabled: true, interval_hours: 24 } }; return handler(name,args); }, functions: { invoke: async (name,args) => { calls.push([name,args]); return { data: { summary: '<script>not HTML</script>', metrics: { titles: 7, whitespace_candidates: 2 } } }; } } };
  try {
    const controller = initializeAdminAgent({ getClient: () => client, getContext: () => context });
    controller.configureRole('admin'); await flush();
    await run({ nodes, context, calls, controller });
  } finally { globalThis.document = oldDocument; }
}
test('UI reviews real server metrics, blocks Gemini without consent, executes bounded RPC', async () => {
  await harness(async ({ nodes, calls, controller }) => {
    await nodes.get('adminAgentLocalReview').dispatch('click');
    assert.equal(controller.getState().lastReview.titles, 7);
    await nodes.get('adminAgentGemini').dispatch('click');
    assert.equal(calls.some(([name]) => name === 'library-admin-agent'), false);
    nodes.get('adminAgentConsent').checked = true;
    await nodes.get('adminAgentGemini').dispatch('click');
    assert.equal(nodes.get('adminAgentOutput').textContent, '<script>not HTML</script>');
    await nodes.get('adminAgentNormalize').dispatch('click');
    const writes = calls.filter(([name,args]) => name === 'library_admin_agent' && args.p_action === 'normalize');
    assert.equal(writes.length, 1);
    assert.match(writes[0][1].p_run_id, /^[0-9a-f-]{36}$/);
    assert.equal(controller.getState().activeRunId, null);
  });
});
test('ambiguous network failure retries with the same UUID; a later new run gets a new UUID', async () => {
  let writes = 0;
  await harness(async ({ nodes, calls, controller }) => {
    await nodes.get('adminAgentNormalize').dispatch('click');
    const retained = controller.getState().activeRunId;
    assert.ok(retained);
    await nodes.get('adminAgentLocalReview').dispatch('click');
    assert.equal(controller.getState().activeRunId, retained);
    await nodes.get('adminAgentNormalize').dispatch('click');
    await nodes.get('adminAgentNormalize').dispatch('click');
    const ids = calls.filter(([,args]) => args?.p_action === 'normalize').map(([,args]) => args.p_run_id);
    assert.equal(ids[0], ids[1]);
    assert.notEqual(ids[1], ids[2]);
  }, async (_,args) => {
    if (args.p_action === 'normalize') { writes++; if (writes === 1) throw new Error('network timeout'); return { data: { changed_count: 2 } }; }
    return { data: { metrics: { titles: 7, whitespace_candidates: 2 }, history: [] } };
  });
});
test('role/library/session changes clear prior output and forbid unauthorized operations', async () => {
  await harness(async ({ nodes, context, calls, controller }) => {
    nodes.get('adminAgentConsent').checked = true;
    await nodes.get('adminAgentGemini').dispatch('click');
    context.libraryId = 'library-2'; context.sessionId = 'session-2'; context.role = 'reporter';
    controller.configureRole('reporter');
    assert.equal(nodes.get('adminAgentSection').hidden, true);
    assert.equal(nodes.get('adminAgentOutput').textContent, '');
    assert.equal(nodes.get('adminAgentConsent').checked, false);
    const before = calls.length;
    await nodes.get('adminAgentNormalize').dispatch('click');
    assert.equal(calls.length, before);
    assert.equal(controller.getState().lastReview, null);
  });
});
