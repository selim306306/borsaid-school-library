import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PHOTO_A = `${A}/school-logo-11111111-1111-4111-8111-111111111111`;

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${signature}`);
}

function option(value, text = value) {
  return {
    value, textContent: text, dataset: {},
    cloneNode() { return option(this.value, this.textContent); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('واجهة التبويب تعرض اختيارًا واضحًا، وتقيّد الحقول أثناء التحميل', () => {
  assert.match(html, /id="schoolProfilePicker"/);
  assert.match(html, /id="schoolProfileSelect"/);
  assert.match(html, /اختر المدرسة لتعديل بياناتها وصورة المدير/);
  assert.match(html, /id="schoolProfileFields"[^>]*disabled/);
  assert.match(app, /currentMemberships\.filter\(item => item\.role === 'owner' && item\.status === 'active'\)/);
});

test('syncSchoolProfilePicker يعرض المالكين النشطين فقط ويحافظ على المدرسة الحالية', () => {
  const select = {
    options: [], value: '', disabled: false,
    replaceChildren(...children) { this.options = children; },
  };
  const librarySelect = { options: [option(A, 'مدرسة أ'), option(B, 'مدرسة ب'), option('staff', 'موظف')] };
  const picker = { hidden: false };
  const context = {
    currentRole: 'owner', currentLibraryId: B, currentMemberships: [
      { library_id: A, role: 'owner', status: 'active' },
      { library_id: B, role: 'owner', status: 'inactive' },
      { library_id: 'staff', role: 'librarian', status: 'active' },
    ], schoolProfileSaving: false, librarySwitchInProgress: false,
    $: selector => ({ '#schoolProfileSelect': select, '#schoolProfilePicker': picker, '#librarySelect': librarySelect }[selector]),
  };
  const fn = extractFunction(app, 'function syncSchoolProfilePicker()');
  new Function(...Object.keys(context), `${fn}; return syncSchoolProfilePicker;`)(...Object.values(context))();
  assert.deepEqual(select.options.map(item => item.value), [A]);
  assert.equal(select.value, B, 'picker follows workspace id even if it is no longer an active owner');
  assert.equal(select.disabled, false);
});

test('loadSchoolProfile يتجاهل نتيجة قديمة عند تبديل المدرسة أثناء السباق', async () => {
  const loadA = deferred();
  const loadB = deferred();
  const formElements = new Proxy({}, { get(target, key) {
    if (!(key in target)) target[key] = { value: '', checked: false, files: [] };
    return target[key];
  } });
  const form = {
    hidden: true, elements: formElements, reset() {}, setAttribute() {},
  };
  const status = { textContent: '', className: '' };
  const librarySelect = { selectedOptions: [option(A, 'أ')] };
  const fn = extractFunction(app, 'async function loadSchoolProfile()');
  const runtime = new Function('loadA', 'loadB', 'form', 'librarySelect', 'status', `
    let currentLibraryId = '${A}';
    let currentRole = 'owner';
    let schoolProfileLoadGeneration = 0;
    let schoolProfileLoadedId = null;
    let currentLibraryProfile = null;
    let schoolProfileSaving = false;
    const currentLibraryProfileChoices = new Map();
    const SCHOOL_BRANDING_FIELDS = [];
    const $ = selector => ({
      '#schoolProfileForm': form,
      '#librarySelect': librarySelect,
      '#schoolProfileFields': { disabled: false },
      '#schoolProfileLibraryContext': { textContent: '' },
      '#schoolProfileStatus': status,
    }[selector]);
    const setSchoolProfileStatus = text => { status.textContent = text; };
    const renderSchoolLogoPreview = () => {};
    const updateLibraryProfileChoice = () => {};
    const supabase = { from() { return { select() { return { eq(_column, id) {
      return { maybeSingle: () => id === '${A}' ? loadA : loadB };
    } }; } }; } };
    ${fn}
    return {
      load: loadSchoolProfile,
      setLibraryId(id) { currentLibraryId = id; },
      getState() { return { currentLibraryProfile, schoolProfileLoadedId }; },
    };
  `)(loadA.promise, loadB.promise, form, librarySelect, status);
  const first = runtime.load();
  runtime.setLibraryId(B);
  librarySelect.selectedOptions = [option(B, 'ب')];
  const second = runtime.load();
  loadB.resolve({ data: { library_id: B, school_name: 'مدرسة ب', school_logo_path: null }, error: null });
  await second;
  loadA.resolve({ data: { library_id: A, school_name: 'مدرسة أ', school_logo_path: PHOTO_A }, error: null });
  await first;
  const state = runtime.getState();
  assert.equal(state.currentLibraryProfile.library_id, B);
  assert.equal(state.schoolProfileLoadedId, B);
  assert.equal(form.hidden, false);
});

test('الحفظ ممنوع قبل تحميل المدرسة، والصور الحالية محفوظة بلا ملف جديد', () => {
  assert.match(app, /schoolProfileLoadedId !== currentLibraryId/);
  assert.match(app, /انتظر اكتمال تحميل المدرسة المختارة قبل الحفظ/);
  assert.match(app, /logoPaths\[field\.key\] = savingProfile\?\.\[field\.key\] \|\| null/);
  assert.match(app, /library_id: savingLibraryId/);
  assert.match(app, /uploadSchoolLogo\(field, file, savingLibraryId\)/);
});

test('تبديل المدرسة أثناء الحفظ يُمنع، والتبديل العادي لا يقبل إلا عضوية نشطة', () => {
  assert.match(app, /if \(schoolProfileSaving \|\| librarySwitchInProgress\)/);
  assert.match(app, /currentMemberships\.find\(item => item\.library_id === nextId && item\.status === 'active'\)/);
  assert.match(app, /if \(activeOwnedSchoolMembership\(event\.target\.value\)\) void switchWorkspaceLibrary/);
  assert.match(app, /\$\('#librarySelect'\)\.disabled = true/);
  assert.match(app, /finally \{\n    librarySwitchInProgress = false;/);
});
