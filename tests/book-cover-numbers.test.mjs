import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCoverAnalysisNumbers, normalizeCatalogIsbn } from '../book-cover-numbers.mjs';

test('normalizes valid ISBN-10 and ISBN-13, including Arabic digits', () => {
  assert.equal(normalizeCatalogIsbn('977-343-046-4'), '9773430464');
  assert.equal(normalizeCatalogIsbn('978-0-306-40615-7'), '9780306406157');
  assert.equal(normalizeCatalogIsbn('٩٧٨-٠-٣٠٦-٤٠٦١٥-٧'), '9780306406157');
  assert.equal(normalizeCatalogIsbn('977-343-046-5'), '');
});

test('does not map a publisher deposit number into ISBN or local general number', () => {
  const mapped = mapCoverAnalysisNumbers({
    printed_numbers: [{ kind: 'deposit_number', label: 'رقم الإيداع', value: '2004/15109' }],
    classification: '900',
  });
  assert.deepEqual(mapped.fills, { classification: '900' });
  assert.deepEqual(mapped.numbers, [{ kind: 'deposit_number', label: 'رقم الإيداع', value: '2004/15109' }]);
});

test('maps a cover ISBN while keeping its deposit number and Dewey in separate fields', () => {
  const mapped = mapCoverAnalysisNumbers({
    printed_numbers: [
      { kind: 'deposit_number', label: 'رقم الإيداع', value: '2004/15109' },
      { kind: 'isbn', label: 'رقم مطبوع', value: '977-343-046-4' },
    ],
    classification: '900',
  });
  assert.deepEqual(mapped.fills, { isbn: '9773430464', classification: '900' });
  assert.equal(mapped.numbers[0].kind, 'deposit_number');
  assert.equal(mapped.numbers[1].kind, 'isbn');
});

test('fills one confidently labeled ISBN and one explicitly local accession number separately', () => {
  const mapped = mapCoverAnalysisNumbers({
    printed_numbers: [
      { kind: 'isbn', label: 'ISBN', value: '977-343-046-4' },
      { kind: 'local_general_number', label: 'رقم الجرد', value: '000123' },
    ],
    classification: '700',
  });
  assert.deepEqual(mapped.fills, {
    isbn: '9773430464',
    general_number: '000123',
    classification: '700',
  });
});

test('rejects a local-number category unless the printed label is explicitly local', () => {
  const mapped = mapCoverAnalysisNumbers({
    printed_numbers: [{ kind: 'local_general_number', label: 'رقم الإيداع', value: '2004/15109' }],
  });
  assert.deepEqual(mapped.fills, {});
  assert.equal(mapped.numbers[0].kind, 'other');
});

test('requires trusted ISBN context and checksum before filling', () => {
  const mapped = mapCoverAnalysisNumbers({
    printed_numbers: [
      { kind: 'isbn', label: 'رقم العدد', value: '977-343-046-4' },
      { kind: 'isbn', label: 'ISBN', value: '977-343-046-5' },
    ],
  });
  assert.deepEqual(mapped.fills, {});
  assert.deepEqual(mapped.choices.isbn, []);
  assert.ok(mapped.numbers.every(item => item.kind === 'other'));
});

test('does not overwrite staff-entered values and asks staff to choose among multiple ISBNs', () => {
  const mapped = mapCoverAnalysisNumbers({
    printed_numbers: [
      { kind: 'isbn', label: 'ISBN', value: '977-343-046-4' },
      { kind: 'isbn', label: 'ISBN', value: '978-0-306-40615-7' },
      { kind: 'local_general_number', label: 'رقم الجرد', value: '000123' },
    ],
    classification: '800',
  }, { general_number: 'LIB-9', classification: '820' });
  assert.deepEqual(mapped.fills, {});
  assert.deepEqual(mapped.choices.isbn, ['9773430464', '9780306406157']);
  assert.deepEqual(mapped.choices.general_number, []);
});

test('does not convert an arbitrary printed number into Dewey', () => {
  const mapped = mapCoverAnalysisNumbers({
    printed_numbers: [{ kind: 'other', label: 'رقم مطبوع', value: '9773430464' }],
    classification: '977.3',
  });
  assert.deepEqual(mapped.fills, {});
});
