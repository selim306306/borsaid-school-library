const ALLOWED_ROLES = new Set(['owner', 'admin']);
const ACTIONS = new Set(['review', 'normalize', 'undo']);
const GOALS = new Set(['review', 'normalize_catalog']);
const byId = id => typeof document === 'undefined' ? null : document.getElementById(id);
const asCount = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const cleanMetrics = metrics => Object.fromEntries(['titles', 'missing_author', 'missing_classification', 'missing_isbn', 'whitespace_candidates'].map(key => [key, asCount(metrics?.[key])]));
const errorText = error => String(error?.message || error || '').toLowerCase();
function formatCairoTime(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : fallback;
}
export function formatMonitorStatus(m = {}) {
  const checked = formatCairoTime(m.last_checked_at, 'لا يوجد وقت فحص مؤكد');
  const next = formatCairoTime(m.next_review_help, 'لم يُحدد بعد');
  const delivery = ({ sent: 'تم التسليم', failed: 'تعذّر تأكيد التسليم', pending: 'إرسال قيد التحقق' })[m.last_delivery_status] || 'لا توجد رسالة مسجلة';
  const schedule = m.enabled ? `مفعّلة · الموعد التالي: ${next}` : 'غير مفعّلة لهذه المكتبة';
  return `المتابعة اليومية 09:00 بتوقيت مصر: ${schedule} · آخر فحص: ${checked} · آخر تنبيه مسجل: ${delivery} (قد يخص فحصًا سابقًا؛ ليس نتيجة آخر فحص بالضرورة). جميع الأوقات بتوقيت مصر. لا تنفيذ حذف أو تغييرات حساسة عبر Telegram.`;
}
function translateError(error) {
  const text = errorText(error);
  if (/401|403|auth|permission|unauthori|forbidden/.test(text)) return 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  if (/409|conflict|ambiguous|already/.test(text)) return 'تعارض: تغيرت البيانات أو حالة التشغيل. راجع التاريخ قبل إعادة المحاولة.';
  if (/empty.*title|title.*empty|not.?null|constraint/.test(text)) return 'تعذّر التنظيف: يوجد عنوان فارغ أو غير صالح في البيانات.';
  if (/network|fetch|timeout|offline|failed to fetch/.test(text)) return 'تعذّر الاتصال. لم نؤكد نتيجة العملية؛ راجع التاريخ قبل إعادة المحاولة.';
  return 'تعذّر إكمال العملية. راجع التاريخ وحاول مرة أخرى إن لزم.';
}
// Pure offline helper; the actual UI always reviews through authenticated RPC.
function localReview(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return cleanMetrics({ titles: list.length,
    missing_author: list.filter(row => !String(row?.author ?? '').trim()).length,
    missing_classification: list.filter(row => !String(row?.classification ?? '').trim()).length,
    missing_isbn: list.filter(row => !String(row?.isbn ?? '').trim()).length,
    whitespace_candidates: list.filter(row => ['title', 'author', 'series_name'].some(key => {
      const value = String(row?.[key] ?? '');
      return value !== value.trim() || /[\t\r\n]| {2,}/.test(value);
    })).length });
}
export function initializeAdminAgent({ getClient, getContext, getModel } = {}) {
  const panel = byId('adminAgentSection');
  if (!panel || typeof getContext !== 'function') return { configureRole() {}, reset() {} };
  const reviewButton = byId('adminAgentLocalReview');
  const geminiButton = byId('adminAgentGemini');
  const normalizeButton = byId('adminAgentNormalize');
  const goalSelect = byId('adminAgentGoal');
  const consent = byId('adminAgentConsent');
  const status = byId('adminAgentStatus');
  const metricsNode = byId('adminAgentMetrics');
  const historyNode = byId('adminAgentHistory');
  const output = byId('adminAgentOutput');
  const preview = byId('adminAgentPreview');
  const monitorNode = byId('adminAgentMonitorStatus');
  const designButton = byId('adminAgentDesignReview');
  const designNode = byId('adminAgentDesignReport');
  let role = null, generation = 0, busy = false, lastReview = null;
  let history = [], activeRunId = null, contextKey = '';
  const currentContext = () => getContext() || {};
  const keyFor = context => `${context.libraryId || ''}:${context.sessionId || ''}:${context.role || ''}`;
  const validContext = () => {
    const context = currentContext();
    return context.libraryId && ALLOWED_ROLES.has(context.role) && context.role === role && keyFor(context) === contextKey;
  };
  const stale = token => token !== generation || !validContext();
  const setStatus = (text, kind = '') => {
    if (status) { status.textContent = text || ''; status.dataset.kind = kind; }
  };
  function renderHistory() {
    if (!historyNode) return;
    historyNode.replaceChildren();
    for (const item of history) {
      const row = document.createElement('li');
      const text = document.createElement('span');
      const date = item.created_at ? new Date(item.created_at).toLocaleString('ar-EG') : '—';
      text.textContent = `تنظيف المسافات · ${asCount(item.changed_count)} سجلًا · ${date}${item.undone_at ? ' · تم التراجع' : ''}`;
      row.append(text);
      if (item.action === 'normalize' && !item.undone_at && item.id) {
        const undo = document.createElement('button');
        undo.type = 'button'; undo.className = 'button button-outline admin-agent-undo';
        undo.textContent = 'تراجع عن هذا التشغيل'; undo.dataset.runId = String(item.id);
        undo.disabled = busy; row.append(undo);
      }
      historyNode.append(row);
    }
  }
  function setBusy(value) {
    busy = value;
    for (const button of [reviewButton, geminiButton, designButton]) if (button) button.disabled = value || !ALLOWED_ROLES.has(role);
    if (normalizeButton) normalizeButton.disabled = value || !ALLOWED_ROLES.has(role) || !lastReview || lastReview.whitespace_candidates === 0;
    if (goalSelect) goalSelect.disabled = value;
    renderHistory();
  }
  function renderMetrics(metrics) {
    if (!metricsNode) return;
    metricsNode.replaceChildren();
    for (const [key, label] of [['titles', 'العناوين'], ['missing_author', 'بلا مؤلف'], ['missing_classification', 'بلا تصنيف'], ['missing_isbn', 'بلا ISBN'], ['whitespace_candidates', 'مسافات زائدة']]) {
      const item = document.createElement('div');
      const name = document.createElement('span'); name.textContent = label;
      const value = document.createElement('strong'); value.textContent = String(asCount(metrics?.[key]));
      item.append(name, value); metricsNode.append(item);
    }
  }
  async function rpc(action, runId = null) {
    if (!ACTIONS.has(action) || !validContext()) throw new Error('not_authorized');
    const context = currentContext(), client = getClient?.();
    if (!client?.rpc) throw new Error('client unavailable');
    const { data, error } = await client.rpc('library_admin_agent', { p_library_id: context.libraryId, p_action: action, p_run_id: runId });
    if (error) throw error;
    return data || {};
  }
  function showReview(data) {
    lastReview = cleanMetrics(data.metrics);
    history = Array.isArray(data.history) ? data.history : [];
    renderMetrics(lastReview); renderHistory();
    if (preview) preview.hidden = false;
  }
  async function refreshHistory(token = generation) {
    const data = await rpc('review');
    if (!stale(token)) showReview(data);
  }
  function renderDesign(report) {
    if (!designNode) return;
    designNode.replaceChildren();
    const note = document.createElement('p');
    note.textContent = report?.limitation || 'لم يُحفظ فحص تقني بعد؛ المراجعة البصرية تحتاج متصفحًا.';
    designNode.append(note);
    for (const item of (Array.isArray(report?.checks) ? report.checks : []).slice(0, 24)) {
      const card = document.createElement('div'), title = document.createElement('strong');
      const evidence = document.createElement('p'), suggestion = document.createElement('p');
      const label = ({ pass: 'قرينة تقنية متوفرة', attention: 'يستحق المراجعة', not_verified: 'يحتاج تحققًا بصريًا' })[item.status] || 'غير متحقق';
      card.className = 'admin-design-finding'; card.dataset.status = item.status || 'not_verified';
      title.textContent = `${item.label || item.id || 'فحص'} — ${label}`;
      evidence.textContent = String(item.evidence || '');
      suggestion.textContent = `الاقتراح: ${item.suggestion || 'راجع النتيجة في المتصفح قبل القرار.'}`;
      card.append(title, evidence, suggestion); designNode.append(card);
    }
  }
  async function refreshDesign(token = generation) {
    if (!validContext() || !designNode) return;
    try {
      const { data, error } = await getClient().rpc('admin_agent_design_status', { p_library_id: currentContext().libraryId });
      if (error) throw error;
      if (!stale(token)) renderDesign(data);
    } catch { if (!stale(token)) designNode.textContent = 'تعذّر قراءة تقرير التصميم. يمكنك إعادة الفحص تقنيًا الآن.'; }
  }
  async function designAction() {
    if (busy || !validContext()) return;
    const token = generation, libraryId = currentContext().libraryId;
    setBusy(true); setStatus('جارٍ فحص مصادر التصميم العامة فقط؛ بلا Gemini أو تغييرات مرئية…');
    try {
      const { data, error } = await getClient().functions.invoke('library-admin-agent', { body: { library_id: libraryId, goal: 'design_review' } });
      if (error) throw error;
      if (stale(token)) return;
      renderDesign(data?.design_report);
      setStatus('اكتمل الفحص التقني؛ الاقتراحات للمراجعة فقط ولم يُنشر أي تغيير.', 'success');
    } catch (error) { if (!stale(token)) setStatus(translateError(error), 'error'); }
    finally { if (!stale(token)) setBusy(false); }
  }
  async function refreshMonitor(token = generation) {
    if (!validContext() || !monitorNode) return;
    try {
      const { data, error } = await getClient().rpc('admin_agent_monitor_status', { p_library_id: currentContext().libraryId });
      if (error) throw error;
      if (stale(token)) return;
      monitorNode.textContent = formatMonitorStatus(data || {});
    } catch {
      if (!stale(token)) monitorNode.textContent = 'تعذّر قراءة حالة المتابعة الخادمية الآن. لا يُعد ذلك تأكيدًا لتشغيلها أو وصول رسالة.';
    }
  }
  async function localReviewAction() {
    if (busy || !validContext()) return;
    const token = generation; setBusy(true); setStatus('جارٍ طلب المراجعة الموثوقة من الخادم…');
    try {
      await refreshHistory(token);
      if (!stale(token)) setStatus('اكتملت المراجعة من الخادم؛ لم تُرسل بيانات إلى Gemini.', 'success');
    } catch (error) { if (!stale(token)) setStatus(translateError(error), 'error'); }
    finally { if (!stale(token)) setBusy(false); }
  }
  async function geminiAction() {
    if (busy || !validContext()) return;
    if (!consent?.checked) { setStatus('وافق على إرسال الأعداد المجمعة فقط أولًا.', 'error'); return; }
    const token = generation, context = currentContext();
    setBusy(true); setStatus('جارٍ طلب التحليل بالأعداد المجمعة فقط…');
    try {
      const goal = GOALS.has(goalSelect?.value) ? goalSelect.value : 'review';
      const { data, error } = await getClient().functions.invoke('library-admin-agent', { body: { library_id: context.libraryId, goal, model: getModel?.(), consent: true } });
      if (error) throw error;
      if (stale(token)) return;
      if (output) { output.textContent = data?.summary || 'لم يصل ملخص صالح.'; output.hidden = false; }
      if (data?.metrics) { lastReview = cleanMetrics(data.metrics); renderMetrics(lastReview); if (preview) preview.hidden = false; }
      setStatus('وصل تحليل Gemini؛ لم ينفذ النموذج أي تغيير. التنفيذ الآمن له زر مستقل.', 'success');
    } catch (error) { if (!stale(token)) setStatus(translateError(error), 'error'); }
    finally { if (!stale(token)) setBusy(false); }
  }
  async function normalizeAction() {
    if (busy || !validContext()) return;
    if (!lastReview || (!activeRunId && lastReview.whitespace_candidates === 0) || !preview || preview.hidden) {
      setStatus('أجرِ مراجعة خادمية وتأكد من وجود سجلات ذات مسافات زائدة قبل التنظيف.', 'error'); return;
    }
    if (!activeRunId && !globalThis.crypto?.randomUUID) { setStatus('يتطلب التنفيذ اتصال HTTPS ومتصفحًا حديثًا.', 'error'); return; }
    const token = generation, runId = activeRunId || crypto.randomUUID();
    activeRunId = runId; setBusy(true); setStatus('جارٍ تنفيذ تنظيف المسافات الآمن…');
    let writeConfirmed = false;
    try {
      const data = await rpc('normalize', runId);
      if (stale(token)) return;
      writeConfirmed = true; activeRunId = null;
      try { await refreshHistory(token); } catch {
        if (!stale(token)) setStatus('أكد الخادم تنفيذ التشغيل، لكن تعذّر تحديث التاريخ. أعد المراجعة قبل إجراء آخر.', 'error');
        return;
      }
      if (!stale(token)) setStatus(data.already_undone ? 'هذا التشغيل سبق التراجع عنه؛ لم يُعد تطبيقه.' : `اكتمل التنظيف: ${asCount(data.changed_count)} سجلًا. التاريخ محدّث ويمكن التراجع.`, 'success');
    } catch (error) {
      if (!stale(token)) {
        // Keep the same UUID after network/unknown failure; retry must never create a second write.
        if (error?.code && !['40001', '57014'].includes(error.code)) activeRunId = null;
        setStatus(translateError(error), 'error');
      }
    } finally {
      if (!stale(token)) {
        setBusy(false);
        if (!writeConfirmed && activeRunId && normalizeButton) normalizeButton.disabled = false;
      }
    }
  }
  async function undoAction(runId) {
    if (busy || !validContext() || !runId) return;
    const token = generation; setBusy(true); setStatus('جارٍ التراجع عن التشغيل…');
    try {
      const data = await rpc('undo', runId);
      if (stale(token)) return;
      await refreshHistory(token);
      if (!stale(token)) setStatus(`اكتمل التراجع: ${asCount(data.changed_count)} سجلًا.`, 'success');
    } catch (error) { if (!stale(token)) setStatus(translateError(error), 'error'); }
    finally { if (!stale(token)) setBusy(false); }
  }
  reviewButton?.addEventListener('click', localReviewAction);
  geminiButton?.addEventListener('click', geminiAction);
  normalizeButton?.addEventListener('click', normalizeAction);
  designButton?.addEventListener('click', designAction);
  historyNode?.addEventListener('click', event => {
    const button = event.target.closest('.admin-agent-undo');
    if (button && !busy) void undoAction(button.dataset.runId);
  });
  function clearState() {
    lastReview = null; history = []; activeRunId = null;
    if (consent) consent.checked = false;
    if (output) { output.textContent = ''; output.hidden = true; }
    if (preview) preview.hidden = true;
    if (monitorNode) monitorNode.textContent = '';
    if (designNode) designNode.replaceChildren();
    if (metricsNode) metricsNode.replaceChildren();
    renderHistory();
  }
  function setContext(nextContext = {}) {
    const ctx = currentContext();
    const nextRole = nextContext.role || null;
    const nextKey = keyFor({ ...ctx, role: nextRole });
    if (nextKey !== contextKey) clearState();
    role = nextRole; generation += 1; contextKey = nextKey;
    const token = generation; panel.hidden = !ALLOWED_ROLES.has(role); setBusy(false);
    if (!panel.hidden) {
      setStatus('يمكنك بدء مراجعة خادمية دون إرسال بيانات.');
      void refreshHistory(token).then(() => { if (!stale(token)) setBusy(false); }).catch(error => { if (!stale(token)) setStatus(translateError(error), 'error'); });
      void refreshMonitor(token);
      void refreshDesign(token);
    } else setStatus('');
  }
  function configureRole(nextRole) { setContext({ role: nextRole }); }
  function reset() { generation += 1; contextKey = ''; role = null; clearState(); panel.hidden = true; setBusy(false); }
  configureRole(null);
  return { configureRole, setContext, reset, getState: () => ({ generation, busy, lastReview, activeRunId }) };
}
export { cleanMetrics, localReview, translateError };
