// Only official publisher HTTPS routes and official app stores; no embedded books.
export const ANDROID_STORE = 'https://play.google.com/store/apps/details?id=com.asseralkotb';
export const IOS_STORE = 'https://apps.apple.com/eg/app/عصير-الكتب/id1573588874';
const BOOK_PATHS = Object.freeze({
  zikola: 'أرض-زيكولا',
  amarita: 'أماريتا-سلسلة-أرض-زيكولا-الجزء-الثاني'
});

export function getReadingDestination(book, { userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (!Object.hasOwn(BOOK_PATHS, book)) throw new TypeError('Unsupported reading title');
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  if (ios) return { href: IOS_STORE, label: 'القراءة عبر تطبيق عصير الكتب · App Store', target: '_blank' };
  // The publisher associates its domain with com.asseralkotb in assetlinks.json.
  // This is a best-effort HTTPS app route, NOT a claim that a book reader opens.
  // Chrome uses the store fallback if there is no eligible installed handler.
  const chromeAndroid = /Android/i.test(userAgent) && /Chrome\//.test(userAgent) && !/; wv\)|Firefox|OPR\//.test(userAgent);
  if (chromeAndroid) {
    const path = encodeURIComponent(BOOK_PATHS[book]);
    return {
      href: `intent://www.aseeralkotb.com/ar/books/${path}#Intent;scheme=https;package=com.asseralkotb;S.browser_fallback_url=${encodeURIComponent(ANDROID_STORE)};end`,
      label: 'فتح تطبيق عصير الكتب أو تثبيته · Android', target: '_self'
    };
  }
  return { href: ANDROID_STORE, label: 'القراءة في تطبيق عصير الكتب · متجر Android', target: '_blank' };
}

export function enhanceReadingLinks(doc, device) {
  for (const link of doc.querySelectorAll('[data-zikola-book]')) {
    const destination = getReadingDestination(link.dataset.zikolaBook, device);
    link.href = destination.href;
    link.target = destination.target;
    link.querySelector('[data-zikola-action]').textContent = destination.label;
  }
}

if (typeof document !== 'undefined') enhanceReadingLinks(document, navigator);
