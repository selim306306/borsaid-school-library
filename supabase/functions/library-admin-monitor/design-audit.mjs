const PUBLIC_URL = 'https://selim306306.github.io/borsaid-school-library/';
const MAX_CSS_FILES = 24;
const CSS_CONCURRENCY = 4;
const MAX_TOTAL_SOURCE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const CSS_PATH_PREFIX = '/borsaid-school-library/';
const LIMITATION = 'فحص بنية HTML/CSS ثابتة فقط؛ ليس مراجعة بصرية أو اختبار قابلية استخدام كامل.';

const CHECK_LABELS = {
  rtl: 'RTL والعربية',
  viewport: 'نافذة الهاتف',
  focus: 'تركيز لوحة المفاتيح',
  reducedMotion: 'الحركة المخفّضة',
  responsive: 'قواعد الهاتف',
  font: 'حجم الخط الأساسي',
  contrast: 'تباين النص والخلفية',
  hierarchy: 'الهرمية البصرية',
  usability: 'قابلية الاستخدام الفعلية',
};

function check(id, status, evidence, suggestion) {
  return { id, label: CHECK_LABELS[id] || id, status, evidence, suggestion };
}

function clean(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\s+/g, ' ').trim();
}

function cssText(css) {
  return Array.isArray(css) ? css.map((item) => typeof item === 'string' ? item : item?.css || '').join('\n') : String(css || '');
}

function stripCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{]+)\{[^{}]*\}/g, '$1{}');
}

function hasDeclaration(css, pattern) { return pattern.test(css); }

function parseColor(value) {
  const input = value.trim().toLowerCase();
  const named = { white: '#ffffff', black: '#000000', transparent: null };
  if (input in named) return named[input];
  if (/^#[0-9a-f]{3,8}$/.test(input)) {
    if (input.length === 4) return `#${[...input.slice(1)].map((c) => c + c).join('')}`;
    if (input.length === 7) return input;
  }
  const rgb = input.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[, /]+\s*([\d.]+))?\s*\)$/);
  if (rgb && (rgb[4] === undefined || Number(rgb[4]) === 1)
      && [rgb[1], rgb[2], rgb[3]].every(n => Number(n) >= 0 && Number(n) <= 255)) {
    return '#' + [rgb[1], rgb[2], rgb[3]].map(n => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
  }
  return null;
}

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function findRootTokens(css) {
  const root = css.match(/:root\s*\{([^}]*)\}/i)?.[1] || '';
  const tokens = {};
  for (const match of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) tokens[match[1]] = match[2].trim();
  return tokens;
}

function resolveColor(value, tokens) {
  const varMatch = value.match(/^var\(\s*(--[\w-]+)\s*\)$/i);
  return parseColor(varMatch ? tokens[varMatch[1]] || '' : value);
}

function evaluateDesignSources({ html = '', css = '' } = {}) {
  const sourceHtml = String(html);
  const sourceCss = cssText(css);
  const lowerHtml = sourceHtml.toLowerCase();
  const checks = [];
  const dir = lowerHtml.match(/<html\b[^>]*\bdir\s*=\s*["']?([^\s"'>]+)/i)?.[1]?.toLowerCase();
  const lang = lowerHtml.match(/<html\b[^>]*\blang\s*=\s*["']?([^\s"'>]+)/i)?.[1]?.toLowerCase();
  checks.push(dir === 'rtl' && (lang?.startsWith('ar') || !lang)
    ? check('rtl', 'pass', 'وُجد dir="rtl" وملف اللغة العربية.', 'لا يوجد إجراء آلي؛ راجع اتجاه المكوّنات بصريًا لاحقًا.')
    : check('rtl', 'attention', 'لم يثبت وجود dir="rtl" مع لغة عربية على عنصر html.', 'أضف dir="rtl" وlang="ar" إلى HTML المنشور.'));
  checks.push(/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*content\s*=|<meta\b[^>]*content\s*=\s*["'][^"']*width\s*=\s*device-width/i.test(sourceHtml)
    ? check('viewport', 'pass', 'وُجد تعريف viewport يتضمن عرض الجهاز.', 'لا يوجد إجراء آلي؛ تحقق من الصفحة على هاتف فعلي.')
    : check('viewport', 'attention', 'لم يُعثر على meta viewport ثابت.', 'أضف meta viewport مع width=device-width وinitial-scale=1.'));
  checks.push(/:(?:focus-visible|focus)\b[^}]*\{[^}]*?(?:outline|box-shadow|border)/is.test(sourceCss)
    ? check('focus', 'pass', 'وُجد نمط مرئي لـ :focus أو :focus-visible.', 'اختبر ترتيب التنقل ولوحة المفاتيح يدويًا.')
    : check('focus', 'attention', 'لم يظهر نمط تركيز مرئي في CSS الثابت.', 'أضف مؤشر تركيز واضحًا ولا تُخفِ outline دون بديل.'));
  checks.push(/@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce/i.test(sourceCss)
    ? check('reducedMotion', 'pass', 'وُجد media query للحركة المخفّضة.', 'لا يوجد إجراء آلي؛ راجع انتقالات المكوّنات يدويًا.')
    : check('reducedMotion', 'attention', 'لم يظهر دعم prefers-reduced-motion.', 'أضف بديلًا يقلل الحركة عند تفضيل المستخدم ذلك.'));
  checks.push(/@media[^{}]*max-width\s*:/i.test(sourceCss)
    ? check('responsive', 'pass', 'وُجدت قواعد CSS عند max-width؛ وجود media query لا يثبت جودة التخطيط على الهاتف.', 'اختبره بصريًا على هاتف حقيقي.')
    : check('responsive', 'attention', 'لم تظهر قاعدة max-width في CSS المقروء.', 'أضف قواعد استجابة مناسبة إن كانت الصفحة تحتاجها.'));
  checks.push(/(?:^|[;{])\s*font-size\s*:\s*16px\b/i.test(sourceCss)
    ? check('font', 'pass', 'وُجد تصريح font-size: 16px على الأقل.', 'هذه قرينة CSS فقط؛ القيمة المحسوبة والوراثة غير معروفتين هنا.')
    : check('font', 'not_verified', 'لم يظهر تصريح 16px؛ لا يمكن استنتاج الحجم المحسوب من CSS المجرد.', 'راجع الحجم المحسوب ووضوح النص في المتصفح لاحقًا.'));

  const tokens = findRootTokens(sourceCss);
  const body = sourceCss.match(/(?:^|})\s*(?:body|main)\s*\{([^}]*)\}/i)?.[1] || '';
  const fgRaw = body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim();
  const bgRaw = body.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i)?.[1]?.trim();
  const fg = resolveColor(fgRaw || '', tokens), bg = resolveColor(bgRaw || '', tokens);
  if (fg && bg) {
    const ratio = contrastRatio(fg, bg);
    checks.push(ratio >= 4.5
      ? check('contrast', 'pass', `تباين body/main صريح ${ratio.toFixed(2)}:1 (${fg} على ${bg})، يطابق AA للنص العادي.`, 'التباين المحسوب من CSS فقط؛ راجع الحالات الفعلية والعناصر الأخرى.')
      : check('contrast', 'attention', `تباين body/main صريح ${ratio.toFixed(2)}:1 (${fg} على ${bg})، أقل من 4.5:1 للنص العادي.`, 'ارفع التباين إلى 4.5:1 على الأقل للنص العادي.'));
  } else checks.push(check('contrast', 'not_verified', 'لم تُستخرج زوجية لون صريحة قابلة للحساب من body/main أو :root tokens.', 'افحص التباين الفعلي للألوان والنصوص في المتصفح.'));
  checks.push(check('hierarchy', 'not_verified', 'لا يمكن استنتاج الهرمية البصرية من HTML/CSS دون عرض الصفحة.', 'راجع العناوين، التسلسل البصري، والمسافات في مراجعة بصرية لاحقة.'));
  checks.push(check('usability', 'not_verified', 'لا يمكن إثبات قابلية الاستخدام أو التخطيط الحقيقي من قواعد ثابتة فقط.', 'اختبر المهام الأساسية على الهاتف ولوحة المفاتيح مع مستخدمين فعليين.'));
  return { version: 1, checks, needs_attention: checks.some((item) => item.status === 'attention'), limitation: LIMITATION };
}

async function sha256(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !globalThis.TextEncoder) throw new Error('Web Crypto SHA-256 غير متاح');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function responseText(response, maxBytes, label) {
  if (!response || response.ok === false) throw new Error(`تعذر قراءة المصدر الثابت: ${label}`);
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new Error(`المصدر يتجاوز الحد ${maxBytes} بايت: ${label}`);
        chunks.push(value);
      }
    } finally { reader.releaseLock?.(); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  }
  if (typeof response.text !== 'function') throw new Error(`تعذر قراءة المصدر الثابت: ${label}`);
  const value = await response.text();
  if (new TextEncoder().encode(value).byteLength > maxBytes) throw new Error(`المصدر يتجاوز الحد ${maxBytes} بايت: ${label}`);
  return value;
}

export async function auditPublicDesign({ fetcher = globalThis.fetch, url = PUBLIC_URL } = {}) {
  const target = new URL(url);
  if (target.href !== PUBLIC_URL) throw new Error('الرابط العام ثابت ومسموح به فقط');
  const started = Date.now();
  const fetchBounded = async (resource, maxBytes) => {
    const remaining = REQUEST_TIMEOUT_MS - (Date.now() - started);
    if (remaining <= 0) throw new Error('انتهت مهلة فحص التصميم الثابت');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try { return await responseText(await fetcher(resource, { signal: controller.signal, redirect: 'error' }), maxBytes, resource); }
    finally { clearTimeout(timer); }
  };
  const html = await fetchBounded(PUBLIC_URL, MAX_TOTAL_SOURCE_BYTES);
  const sourceParts = [`html:${html}`];
  const cssUrls = [];
  const links = html.matchAll(/<link\b[^>]*>/gi);
  for (const link of links) {
    if (!/\brel\s*=\s*["'][^"']*stylesheet[^"']*["']/i.test(link[0])) continue;
    const href = link[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const cssUrl = new URL(href, PUBLIC_URL);
      if (cssUrl.origin === target.origin && cssUrl.pathname.startsWith(CSS_PATH_PREFIX) && !cssUrls.includes(cssUrl.href)) cssUrls.push(cssUrl.href);
    } catch { /* ignore malformed or cross-origin links */ }
  }
  const priority = (value) => /site\.css/i.test(value) ? 0 : /responsive|mobile|media/i.test(value) ? 1 : 2;
  cssUrls.sort((a, b) => priority(a) - priority(b));
  const selectedCssUrls = cssUrls.slice(0, MAX_CSS_FILES);
  const skippedCss = cssUrls.length - selectedCssUrls.length;
  let totalBytes = new TextEncoder().encode(html).byteLength;
  const fetchedCss = new Array(selectedCssUrls.length);
  let nextCss = 0;
  const worker = async () => {
    while (true) {
      const index = nextCss++;
      if (index >= selectedCssUrls.length) return;
      fetchedCss[index] = await fetchBounded(selectedCssUrls[index], MAX_TOTAL_SOURCE_BYTES);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CSS_CONCURRENCY, selectedCssUrls.length) }, worker));
  const css = [];
  for (let index = 0; index < fetchedCss.length; index++) {
    const value = fetchedCss[index];
    const bytes = new TextEncoder().encode(value).byteLength;
    if (totalBytes + bytes > MAX_TOTAL_SOURCE_BYTES) throw new Error(`تجاوز مجموع المصادر الحد ${MAX_TOTAL_SOURCE_BYTES} بايت؛ التقرير غير مكتمل`);
    css.push(value); sourceParts.push(`css:${selectedCssUrls[index]}:${value}`); totalBytes += bytes;
  }
  const result = evaluateDesignSources({ html, css });
  if (skippedCss > 0 || totalBytes >= MAX_TOTAL_SOURCE_BYTES) result.limitation += ` تغطية CSS جزئية: تم تجاهل ${skippedCss} ملفًا بعد حد ${MAX_CSS_FILES} أو حد الحجم.`;
  result.source_hash = await sha256(sourceParts.join('\n'));
  return result;
}

export { PUBLIC_URL, LIMITATION, evaluateDesignSources };
