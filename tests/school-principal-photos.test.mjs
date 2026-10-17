import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicSchoolPrincipals } from '../school-principal-photos.mjs';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const profile = { library_id: a, school_name: 'مدرسة اختبار', principal_name: 'اسم اختبار', is_public: true, principal_photo_path: `${a}/principal-photo-${b}` };
test('only a real configured photo with a name and public school profile is shown', () => {
  assert.equal(publicSchoolPrincipals([profile]).length, 1);
  for (const change of [{is_public:false}, {is_public:undefined}, {principal_name:''}, {principal_photo_path:null}, {school_name:''}, {principal_photo_path:`${b}/principal-photo-${a}`}, {principal_photo_path:'https://example.org/photo.jpg'}]) {
    assert.equal(publicSchoolPrincipals([{...profile,...change}]).length, 0);
  }
  assert.equal(publicSchoolPrincipals([profile,profile]).length, 1);
  assert.equal(publicSchoolPrincipals([]).length, 0);
});
test('owner form supports upload, preview, replace and removal; save is tied to the selected library', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(html, /id="principalPhotoFile" name="principal_photo"/);
  assert.match(html, /name="remove_principal_photo"/);
  assert.match(html, /id="principalPhotoPreview"/);
  assert.match(app, /principal_photo_path: logoPaths.principal_photo_path/);
  assert.match(app, /library_id: savingLibraryId/);
  assert.match(app, /uploadSchoolLogo\(field, file, savingLibraryId\)/);
  assert.match(app, /currentRole !== 'owner'/);
  assert.match(app, /SCHOOL_LOGO_MAX_BYTES = 2 \* 1024 \* 1024/);
});
