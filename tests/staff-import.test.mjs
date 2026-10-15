import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookImportMatrix, parseDelimitedText, parsePublishedCell } from '../staff-import.mjs';

test('parses quoted CSV cells, commas, escaped quotes and Arabic headers', () => {
  const matrix = parseDelimitedText('\uFEFFالرقم العام,عنوان الكتاب,المؤلف,الفرع,رقم النسخة\r\n0012,"تاريخ, بورسعيد","منى ""حامد""",مكة,نسخة-1');
  assert.deepEqual(matrix[0], ['الرقم العام', 'عنوان الكتاب', 'المؤلف', 'الفرع', 'رقم النسخة']);
  const mapped = parseBookImportMatrix(matrix);
  assert.deepEqual(mapped.missingRequired, []);
  assert.equal(mapped.rows[0].general_number, '0012');
  assert.equal(mapped.rows[0].title, 'تاريخ, بورسعيد');
  assert.equal(mapped.rows[0].author, 'منى "حامد"');
  assert.equal(mapped.rows[0].inventory_tag, 'نسخة-1');
  assert.equal(mapped.rows[0].source_row, 2);
});

test('detects tab-delimited input and skips blank rows', () => {
  const matrix = parseDelimitedText('general_number\ttitle\tclassification\n\n17\tعلوم\t٥٠٠');
  const mapped = parseBookImportMatrix(matrix);
  assert.equal(mapped.rows.length, 1);
  assert.equal(mapped.rows[0].classification, '٥٠٠');
});

test('reports missing required catalog headers and ignored columns', () => {
  const mapped = parseBookImportMatrix([['المؤلف', 'ملاحظة خاصة'], ['أحمد', 'تجاهل']]);
  assert.deepEqual(mapped.missingRequired, ['general_number', 'title']);
  assert.deepEqual(mapped.ignoredHeaders, ['ملاحظة خاصة']);
});

test('maps supported publication values without treating unknown text as public', () => {
  assert.equal(parsePublishedCell('نعم'), true);
  assert.equal(parsePublishedCell('منشور'), true);
  assert.equal(parsePublishedCell('داخلي'), false);
  assert.equal(parsePublishedCell(''), null);
  assert.equal(parsePublishedCell('ربما'), null);
});
