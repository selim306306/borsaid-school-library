import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseBookImportMatrix } from '../staff-import.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('../assets/vendor/xlsx.full.min.js');

test('parses an in-memory Arabic XLSX workbook and preserves text identifiers', () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['الرقم العام', 'عنوان الكتاب', 'تصنيف ديوي'],
    ['0012', 'كتاب تجريبي مؤقت', '٥٠٠'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'الجرد');
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const parsedWorkbook = XLSX.read(bytes, { type: 'buffer', sheetRows: 5002, cellFormula: false, cellHTML: false });
  const matrix = XLSX.utils.sheet_to_json(parsedWorkbook.Sheets[parsedWorkbook.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
  const mapped = parseBookImportMatrix(matrix);
  assert.deepEqual(mapped.missingRequired, []);
  assert.equal(mapped.rows[0].general_number, '0012');
  assert.equal(mapped.rows[0].title, 'كتاب تجريبي مؤقت');
  assert.equal(mapped.rows[0].classification, '٥٠٠');
});
