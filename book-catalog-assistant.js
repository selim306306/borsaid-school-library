const form = document.querySelector('#titleForm');
const isbnInput = form?.elements.namedItem('isbn');
const titleInput = form?.elements.namedItem('title');
const authorInput = form?.elements.namedItem('author');
const lookupButton = document.querySelector('#lookupBookButton');
const scanButton = document.querySelector('#scanIsbnButton');
const stopScanButton = document.querySelector('#stopIsbnScanButton');
const video = document.querySelector('#isbnScannerVideo');
const status = document.querySelector('#bookLookupStatus');
const results = document.querySelector('#bookLookupResults');
const coverInput = document.querySelector('#bookCoverInput');
const coverConsent = form?.elements.namedItem('allow_cover_ai');
const analyzeCoverButton = document.querySelector('#analyzeBookCoverButton');
const coverPreview = document.querySelector('#bookCoverPreview');

let scannerStream = null;
let scannerTimer = 0;
let scannerActive = false;
let candidateResults = [];
let activeSearch = { isbn: '', title: '' };
let selectedCoverFile = null;
let coverPreviewUrl = '';
let coverAnalysisPending = false;

const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
function westernDigits(value) {
  return String(value ?? '').replace(/[٠-٩]/gu, digit => String(arabicDigits.indexOf(digit)))
    .replace(/[۰-۹]/gu, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}
function normalizeIsbn(value) {
  const isbn = westernDigits(value).replace(/[\s-]/gu, '').toUpperCase();
  if (/^\d{13}$/u.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? isbn : '';
  }
  if (/^\d{9}[\dX]$/u.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + Number(digit === 'X' ? 10 : digit) * (10 - index), 0);
    return sum % 11 === 0 ? isbn : '';
  }
  return '';
}
function flattenStrings(values, limit = 20) {
  return (Array.isArray(values) ? values : values ? [values] : [])
    .map(item => typeof item === 'string' ? item : String(item?.name ?? item?.title ?? ''))
    .map(item => item.trim()).filter(Boolean).slice(0, limit);
}
function isbnMatches(values, isbn) {
  return flattenStrings(values, 100).some(value => normalizeIsbn(value) === isbn);
}
function normalizeGoogleBook(item, isbn) {
  const info = item?.volumeInfo || {};
  const identifiers = (info.industryIdentifiers || []).map(entry => entry?.identifier || '').filter(Boolean);
  const series = info.seriesInfo?.title || info.seriesInfo?.series?.title || '';
  const book = {
    title: String(info.title || '').trim(),
    author: flattenStrings(info.authors, 8).join('، '),
    series: String(series).trim(),
    isbn: isbn || identifiers.map(normalizeIsbn).find(Boolean) || '',
    subjects: [...flattenStrings(info.categories, 12), ...flattenStrings(info.subjects, 12)].slice(0, 20),
    source: 'Google Books',
    sourceUrl: String(info.infoLink || item?.selfLink || ''),
    matchesIsbn: Boolean(isbn && isbnMatches(identifiers, isbn)),
  };
  return book.title ? book : null;
}
function normalizeOpenLibraryBook(doc, isbn) {
  const identifiers = flattenStrings(doc?.isbn, 100);
  const book = {
    title: String(doc?.title || '').trim(),
    author: flattenStrings(doc?.author_name, 8).join('، '),
    series: flattenStrings(doc?.series, 5).join('، '),
    isbn: isbn || identifiers.map(normalizeIsbn).find(Boolean) || '',
    subjects: [...flattenStrings(doc?.subject, 16)].slice(0, 20),
    source: 'Open Library',
    sourceUrl: doc?.key ? `https://openlibrary.org${String(doc.key).startsWith('/') ? '' : '/works/'}${doc.key}` : '',
    matchesIsbn: Boolean(isbn && isbnMatches(identifiers, isbn)),
  };
  return book.title ? book : null;
}
function mergeCandidates(groups) {
  const merged = new Map();
  for (const item of groups.flat()) {
    if (!item) continue;
    const key = `${item.title.normalize('NFC').toLocaleLowerCase('ar')}|${item.author.normalize('NFC').toLocaleLowerCase('ar')}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...item, sources: [item.source] });
      continue;
    }
    for (const field of ['series', 'isbn', 'sourceUrl']) if (!current[field] && item[field]) current[field] = item[field];
    current.subjects = [...new Set([...current.subjects, ...item.subjects])].slice(0, 20);
    current.matchesIsbn ||= item.matchesIsbn;
    if (!current.author && item.author) current.author = item.author;
    if (!current.sources.includes(item.source)) current.sources.push(item.source);
  }
  return [...merged.values()];
}
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`metadata source returned ${response.status}`);
  return response.json();
}
async function lookupGoogle(isbn, title, author) {
  const params = new URLSearchParams({ maxResults: '6', printType: 'books' });
  params.set('q', isbn ? `isbn:${isbn}` : `${title} ${author}`.trim());
  const data = await fetchJson(`https://www.googleapis.com/books/v1/volumes?${params}`);
  return (data.items || []).map(item => normalizeGoogleBook(item, isbn)).filter(Boolean);
}
async function lookupOpenLibrary(isbn, title, author) {
  const params = new URLSearchParams({
    fields: 'title,author_name,isbn,series,subject,key',
    limit: '6',
  });
  if (isbn) params.set('isbn', isbn);
  else {
    params.set('title', title);
    if (author) params.set('author', author);
  }
  const data = await fetchJson(`https://openlibrary.org/search.json?${params}`);
  return (data.docs || []).map(doc => normalizeOpenLibraryBook(doc, isbn)).filter(Boolean);
}
function showCandidates(books) {
  results.replaceChildren();
  candidateResults = books;
  books.forEach((book, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'book-import-result';
    option.dataset.bookCandidate = String(index);
    option.setAttribute('role', 'option');
    option.textContent = [book.title, book.author, book.series ? `السلسلة: ${book.series}` : '', book.sources.join(' + ')].filter(Boolean).join(' · ');
    results.append(option);
  });
  results.hidden = books.length === 0;
}
function selectCandidate(book) {
  if (!book) return;
  window.dispatchEvent(new CustomEvent('bookmetadata:selected', {
    detail: { ...book, searchIsbn: activeSearch.isbn, searchTitle: activeSearch.title },
  }));
  results.hidden = true;
}
async function runLookup() {
  if (!form || !status || !results) return;
  const rawIsbn = String(isbnInput?.value || '').trim();
  const isbn = rawIsbn ? normalizeIsbn(rawIsbn) : '';
  if (rawIsbn && !isbn) {
    status.textContent = 'رقم ISBN غير صحيح؛ تحقق من الأرقام أو امسح الرمز مرة أخرى.';
    isbnInput?.focus();
    return;
  }
  const title = String(titleInput?.value || '').trim();
  const author = String(authorInput?.value || '').trim();
  if (!isbn && !title) {
    status.textContent = 'امسح ISBN أو أدخل عنوان الكتاب أولاً للبحث في الفهارس العامة.';
    titleInput?.focus();
    return;
  }
  if (isbn) isbnInput.value = isbn;
  activeSearch = { isbn, title };
  lookupButton.disabled = true;
  scanButton.disabled = true;
  results.hidden = true;
  status.textContent = 'جارٍ البحث في Google Books وOpen Library…';
  const [googleResult, openLibraryResult] = await Promise.allSettled([
    lookupGoogle(isbn, title, author),
    lookupOpenLibrary(isbn, title, author),
  ]);
  lookupButton.disabled = false;
  scanButton.disabled = false;
  const googleBooks = googleResult.status === 'fulfilled' ? googleResult.value : [];
  const openLibraryBooks = openLibraryResult.status === 'fulfilled' ? openLibraryResult.value : [];
  const books = mergeCandidates([googleBooks, openLibraryBooks]);
  if (!books.length) {
    const bothFailed = googleResult.status === 'rejected' && openLibraryResult.status === 'rejected';
    status.textContent = bothFailed
      ? 'تعذّر الاتصال بمصادر الكتب الآن؛ يمكنك إدخال البيانات يدوياً والمحاولة لاحقاً.'
      : 'لم نعثر على بيانات مطابقة. جرّب ISBN آخر أو ابحث بعنوان أدق، ويمكنك إدخال المعلومات يدوياً.';
    return;
  }
  const exact = isbn ? books.filter(book => book.matchesIsbn) : [];
  if (exact.length === 1) {
    status.textContent = 'عُثر على تطابق ISBN؛ تُعبّأ البيانات الببليوغرافية الآن. راجعها قبل الحفظ.';
    selectCandidate(exact[0]);
  } else if (books.length === 1) {
    status.textContent = 'عُثر على نتيجة واحدة؛ تُعبّأ البيانات الآن. راجع مطابقتها قبل الحفظ.';
    selectCandidate(books[0]);
  } else {
    status.textContent = exact.length > 1
      ? 'توجد طبعات متقاربة لهذا ISBN؛ اختر النسخة المطابقة للكتاب.'
      : 'اختر العنوان المطابق من نتائج الفهارس لإكمال الحقول.';
    showCandidates(exact.length ? exact : books);
  }
}
function updateCoverButton() {
  if (analyzeCoverButton) analyzeCoverButton.disabled = !selectedCoverFile || !coverConsent?.checked || coverAnalysisPending;
}
function clearCoverPreview() {
  selectedCoverFile = null;
  if (coverInput) coverInput.value = '';
  if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  coverPreviewUrl = '';
  if (coverPreview) {
    coverPreview.hidden = true;
    coverPreview.removeAttribute('src');
  }
  coverAnalysisPending = false;
  updateCoverButton();
}
async function compressCover(file) {
  if (!('createImageBitmap' in window)) throw new Error('image_processing_unavailable');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('canvas_unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.76));
    if (!blob) throw new Error('image_compression_failed');
    if (blob.size > 900 * 1024) {
      const smaller = document.createElement('canvas');
      const ratio = Math.min(1, 1050 / Math.max(canvas.width, canvas.height));
      smaller.width = Math.max(1, Math.round(canvas.width * ratio));
      smaller.height = Math.max(1, Math.round(canvas.height * ratio));
      smaller.getContext('2d', { alpha: false }).drawImage(canvas, 0, 0, smaller.width, smaller.height);
      blob = await new Promise(resolve => smaller.toBlob(resolve, 'image/jpeg', 0.6));
    }
    if (!blob || blob.size > 900 * 1024) throw new Error('image_too_large');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('image_read_failed'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
    return dataUrl.split(',')[1] || '';
  } finally {
    bitmap.close?.();
  }
}
function stopScanner() {
  scannerActive = false;
  window.clearTimeout(scannerTimer);
  if (scannerStream) scannerStream.getTracks().forEach(track => track.stop());
  scannerStream = null;
  if (video) {
    video.pause();
    video.srcObject = null;
    video.hidden = true;
  }
  if (stopScanButton) stopScanButton.hidden = true;
}
async function startScanner() {
  if (!status) return;
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'المتصفح لا يدعم قراءة الباركود بالكاميرا. أدخل ISBN يدوياً ثم اختر «جلب بيانات الكتاب».';
    return;
  }
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    if (!supported.includes('ean_13')) {
      status.textContent = 'قارئ الكاميرا في هذا المتصفح لا يدعم باركود ISBN؛ أدخله يدوياً ثم ابحث.';
      return;
    }
    const detector = new window.BarcodeDetector({ formats: ['ean_13'] });
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    video.srcObject = scannerStream;
    video.hidden = false;
    stopScanButton.hidden = false;
    await video.play();
    scannerActive = true;
    status.textContent = 'وجّه الكاميرا إلى باركود ISBN الخلفي للكتاب.';
    const scanFrame = async () => {
      if (!scannerActive) return;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const codes = await detector.detect(video);
          const isbn = codes.map(code => normalizeIsbn(code.rawValue)).find(Boolean);
          if (isbn) {
            isbnInput.value = isbn;
            stopScanner();
            status.textContent = 'تمت قراءة ISBN من الكاميرا؛ جارٍ جلب بيانات الكتاب.';
            await runLookup();
            return;
          }
        }
      } catch { /* Keep scanning; a single blurry frame is expected. */ }
      scannerTimer = window.setTimeout(scanFrame, 300);
    };
    scanFrame();
  } catch (error) {
    stopScanner();
    status.textContent = error?.name === 'NotAllowedError'
      ? 'لم يُسمح باستخدام الكاميرا. اسمح بها للصفحة أو أدخل ISBN يدوياً.'
      : 'تعذّر تشغيل الكاميرا. أدخل ISBN يدوياً ثم ابحث.';
  }
}

lookupButton?.addEventListener('click', runLookup);
scanButton?.addEventListener('click', startScanner);
stopScanButton?.addEventListener('click', () => {
  stopScanner();
  if (status) status.textContent = 'توقف المسح. يمكنك إعادة المحاولة أو إدخال ISBN يدوياً.';
});
results?.addEventListener('click', event => {
  const button = event.target.closest('[data-book-candidate]');
  if (!button) return;
  selectCandidate(candidateResults[Number(button.dataset.bookCandidate)]);
});
coverInput?.addEventListener('change', () => {
  selectedCoverFile = coverInput.files?.[0] || null;
  if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
  coverPreviewUrl = '';
  if (!selectedCoverFile) {
    coverPreview.hidden = true;
    coverPreview.removeAttribute('src');
    updateCoverButton();
    return;
  }
  if (!selectedCoverFile.type.startsWith('image/') || selectedCoverFile.size > 12 * 1024 * 1024) {
    selectedCoverFile = null;
    coverInput.value = '';
    status.textContent = 'اختر صورة غلاف بحجم لا يتجاوز 12 ميغابايت.';
    coverPreview.hidden = true;
    coverPreview.removeAttribute('src');
    updateCoverButton();
    return;
  }
  coverPreviewUrl = URL.createObjectURL(selectedCoverFile);
  coverPreview.src = coverPreviewUrl;
  coverPreview.hidden = false;
  status.textContent = 'تظهر معاينة الغلاف محلياً. لتحليلها فعّل موافقة إرسال الصورة إلى Gemini.';
  updateCoverButton();
});
coverConsent?.addEventListener('change', updateCoverButton);
analyzeCoverButton?.addEventListener('click', async () => {
  if (!selectedCoverFile || !coverConsent?.checked) return;
  coverAnalysisPending = true;
  updateCoverButton();
  status.textContent = 'جارٍ ضغط صورة الغلاف محلياً وإرسالها إلى Gemini للتحليل…';
  let sentToApp = false;
  try {
    const data = await compressCover(selectedCoverFile);
    if (!data) throw new Error('empty_image');
    sentToApp = true;
    const timeout = window.setTimeout(() => {
      coverAnalysisPending = false;
      updateCoverButton();
    }, 45000);
    const complete = () => {
      window.clearTimeout(timeout);
      coverAnalysisPending = false;
      updateCoverButton();
    };
    window.dispatchEvent(new CustomEvent('bookcover:selected', { detail: { mimeType: 'image/jpeg', data, complete } }));
  } catch {
    status.textContent = 'تعذّر تجهيز الصورة. جرّب صورة أوضح بصيغة JPG أو PNG أو WebP.';
  } finally {
    if (!sentToApp) {
      coverAnalysisPending = false;
      updateCoverButton();
    }
  }
});
form?.addEventListener('submit', stopScanner);
form?.addEventListener('reset', () => window.setTimeout(clearCoverPreview, 0));
window.addEventListener('beforeunload', () => {
  stopScanner();
  if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
});
