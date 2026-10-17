let ownerReportPreview = null;
let ownerReportDeliveryBusy = false;
import { renderSchoolPrincipalCards } from './school-principal-photos.mjs?v=20261017-principal-1';
import { SITE_MEDIA_BUCKET, SITE_MEDIA_ITEMS, SITE_MEDIA_MAX_BYTES } from './site-media-config.js?v=20261016-social-preview-1';
import { mapCoverAnalysisNumbers } from './book-cover-numbers.mjs?v=20261015-camera-title-page-1';
import { initializeBookImportControls } from './staff-import-controller.mjs?v=20261015-staff-import-1';
import { PUBLIC_READABLE_BOOKS, findPublicReadableBooks, hasSpecificUnknownPublicReading } from './public-reading-books.js?v=20261016-public-pdf-guide-2';
import { resolveVisitorAssistantIntent } from './visitor-assistant-intents.mjs?v=20261017-visitor-intents-2';
import { isVisitorAssistantQuestionSensitive, routeVisitorAssistantQuestion, VISITOR_PERSONAL_DATA_REPLY } from './visitor-assistant-flow.mjs?v=20261017-gemini-assistant-1';
import { SITE_OWNER_LIBRARY_IDS, canDeleteOwnedSchool, schoolDeletionErrorMessage } from './owner-school-deletion.mjs?v=20261017-owner-school-delete-1';
import { hasPlatformOwnerAccess, libraryHasOperationalData } from './platform-library-report.mjs?v=20261017-platform-report-1';
import { renderPublicProfilesAsSoonAsAvailable, shouldShowSchoolNameOnHomepage } from './school-homepage-branding.mjs?v=20261017-school-homepage-name-2';
const SUPABASE_URL = 'https://eahptkwvjcnixlzlyznh.supabase.co';
// Publishable key is intended for browser use. Never place a service-role key here.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MpskNH6FyBeuQmb3Y9V2Aw_7d2L9x00';
const PAGE_SIZE = 100;
const CACHE_KEY = 'borsaid-library-public-cache-v1';
const INVITATIONS_ENABLED = false; // invite-library-member is not deployed for this project.
const ASSISTANT_MODELS = new Set(['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
const DEFAULT_ASSISTANT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_FOOTER_DESCRIPTION = 'بوابة رقمية مستقلة لدعم وصول المجتمع المدرسي إلى الكتب.';
const SITE_FOOTER_SETTING_KEY = 'global_footer';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const viewTabs = $$('.view-tab');
const viewPanels = $$('[data-view-panel]');
const PUBLIC_PAGE_VIEW_LABELS = Object.freeze({
  home: 'الرئيسية',
  discover: 'الكتب',
  branches: 'المكتبات',
  announcements: 'الإعلانات',
  about: 'عن الموقع',
  reading: 'القراءة',
  educationResearch: 'أخبار وأبحاث',
});
let publicAnalyticsSupabase = null;
let publicDirectoryAvailable = false;
let platformLibraryReportData = null;
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const scrollBehavior = () => prefersReducedMotion() ? 'instant' : 'smooth';
function trackPublicPageView(viewName) {
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_PAGE_VIEW_LABELS, viewName) || !publicAnalyticsSupabase) return;
  try {
    void Promise.resolve(publicAnalyticsSupabase.rpc('record_public_page_view', { p_section: viewName })).catch(() => {});
  } catch {}
}
function activateView(viewName, { updateHistory = false, hash = '' } = {}) {
  if (viewName === 'branches' && !publicDirectoryAvailable) return false;
  const panel = viewPanels.find(item => item.dataset.viewPanel === viewName);
  if (!panel) return false;
  const entering = panel.hidden;
  if (entering) trackPublicPageView(viewName);
  viewPanels.forEach(item => { item.hidden = item !== panel; });
  if (entering && !prefersReducedMotion() && typeof panel.animate === 'function') {
    panel.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 190, easing: 'cubic-bezier(.2,.75,.25,1)',
    });
  }
  viewTabs.forEach(tab => {
    const selected = tab.dataset.view === viewName;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.classList.toggle('active', selected);
  });
  if (updateHistory) history.pushState({ view: viewName }, '', hash || `#${panel.id}`);
  return true;
}
function activateViewFromHash() {
  const fragment = window.location.hash.slice(1);
  const target = fragment ? document.getElementById(fragment) : null;
  const panel = target?.closest('[data-view-panel]');
  activateView(panel?.dataset.viewPanel || 'home');
}
viewTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    if (!activateView(tab.dataset.view, { updateHistory: true })) return;
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  });
  tab.addEventListener('keydown', event => {
    const visibleTabs = viewTabs.filter(item => !item.hidden);
    const index = visibleTabs.indexOf(tab);
    if (index < 0 || !visibleTabs.length) return;
    let nextIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = visibleTabs.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const forwardKey = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const step = event.key === forwardKey ? 1 : -1;
      nextIndex = (index + step + visibleTabs.length) % visibleTabs.length;
    } else return;
    event.preventDefault();
    const nextTab = visibleTabs[nextIndex];
    activateView(nextTab.dataset.view, { updateHistory: true });
    nextTab.focus({ preventScroll: true });
  });
});
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented) return;
  const fragment = link.getAttribute('href').slice(1);
  if (!fragment) return;
  if (fragment === 'top') {
    if (viewPanels.find(panel => panel.dataset.viewPanel === 'home')?.hidden) {
      event.preventDefault();
      activateView('home', { updateHistory: true, hash: '#top' });
      $('#top').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    }
    return;
  }
  const target = document.getElementById(fragment);
  const panel = target?.closest('[data-view-panel]');
  if (!panel || !panel.hidden) return;
  event.preventDefault();
  activateView(panel.dataset.viewPanel, { updateHistory: true, hash: `#${fragment}` });
  target.setAttribute('tabindex', target.getAttribute('tabindex') || '-1');
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
});
window.addEventListener('popstate', activateViewFromHash);
window.addEventListener('hashchange', activateViewFromHash);
activateViewFromHash();
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const formatDate = value => value ? new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : '—';
const csvCell = value => {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

$('#copyrightYear').textContent = String(new Date().getFullYear());
const staffDialog = $('#staffDialog');
const loginMessage = $('#loginMessage');
const catalogStatus = $('#catalogStatus');
const resultsGrid = $('#resultsGrid');
const emptyState = $('#emptyState');
const branchFilter = $('#branchFilter');
let supabase = null;
let publicSupabase = null;
let publicBranches = [];
let publicLibraryProfiles = [];
let currentLibraryProfileChoices = new Map();
let publicResults = [];
let currentPage = 0;
let currentSearch = { query: '', branch_id: null, available_only: false };
let searchTimer = 0;
let currentLibraryId = null;
let currentLibraryProfile = null;
let schoolProfileLoadedId = null;
let schoolProfileLoadGeneration = 0;
let schoolProfileSaving = false;
let librarySwitchInProgress = false;
let currentMemberships = [];
let staffBranches = [];
let branchLoadFailed = false;
let inventoryLoadFailed = false;
let librarySettingsLoadFailed = true;
let currentLibraryIsPublished = null;
let staffMetrics = {};
let currentRole = null;
let currentUserId = null;
let inventoryTitles = [];
let inventoryHoldings = [];
let reservationRows = [];
let requestRecords = new Map();
let openLoans = [];

function setMessage(target, text, kind = '') {
  if (!target) return;
  target.textContent = text || '';
  target.className = `form-message${kind ? ` ${kind}` : ''}`;
}
function assistantModelKey() { return `borsaid-library-assistant-model-v1:${currentLibraryId || 'default'}`; }
function loadAssistantModelChoice() {
  const select = $('#assistantModel');
  if (!select) return;
  let choice = DEFAULT_ASSISTANT_MODEL;
  try { choice = localStorage.getItem(assistantModelKey()) || choice; } catch { /* Local storage is optional. */ }
  select.value = ASSISTANT_MODELS.has(choice) ? choice : DEFAULT_ASSISTANT_MODEL;
}
$('#assistantModel').addEventListener('change', event => {
  if (!ASSISTANT_MODELS.has(event.currentTarget.value)) return;
  try { localStorage.setItem(assistantModelKey(), event.currentTarget.value); } catch { /* Model remains selectable for this page session. */ }
});
function cacheRead() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}
function cacheWrite() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ saved_at: new Date().toISOString(), branches: publicBranches, results: publicResults, search: currentSearch }));
  } catch { /* Browser storage can be disabled or full; live browsing still works. */ }
}
function showEmpty(title, description) {
  resultsGrid.innerHTML = '';
  resultsGrid.hidden = true;
  emptyState.hidden = false;
  $('#emptyTitle').textContent = title;
  $('#emptyDescription').textContent = description;
  $('#moreRow').hidden = true;
}
function paintPublicCards(rows, append = false) {
  if (!append) resultsGrid.innerHTML = '';
  if (!rows.length && !append) {
    const searching = Boolean(currentSearch.query || currentSearch.branch_id || currentSearch.available_only);
    showEmpty(searching ? 'لم نعثر على نتائج مطابقة' : 'لا توجد عناوين منشورة بعد', searching ? 'جرّب كلمة أقصر أو أزل بعض عوامل التصفية.' : 'الفهرس العام لا يعرض حالياً عناوين منشورة. لا يعني ذلك عدم وجود كتب بالمكتبات؛ ستظهر السجلات عندما تنشر المكتبة بيانات العنوان والفرع والنسخة. لا نعرض بيانات تجريبية أو غير معتمدة.');
    return;
  }
  emptyState.hidden = true;
  resultsGrid.hidden = false;
  resultsGrid.insertAdjacentHTML('beforeend', rows.map(row => {
    const available = Number(row.available_copies || 0);
    const hasCopy = available > 0;
    const classification = row.classification ? `<span class="book-classification">${escapeHtml(row.classification)}</span>` : '<span class="book-classification">رقم عام</span>';
    const location = row.public_shelf_label ? `<span>⌖ <strong>${escapeHtml(row.public_shelf_label)}</strong></span>` : '';
    const series = row.series_name ? `<div class="book-series">السلسلة: <strong>${escapeHtml(row.series_name)}</strong></div>` : '';
    return `<article class="book-card">
      <div class="book-card-top">${classification}<span class="availability-badge ${hasCopy ? '' : 'unavailable'}">${hasCopy ? `متاح · ${available}` : 'غير متاح الآن'}</span></div>
      <h3>${escapeHtml(row.title)}</h3>
      <div class="book-author">${row.author ? `تأليف: ${escapeHtml(row.author)}` : 'بيانات المؤلف غير مضافة'}</div>
      ${series}
      <div class="book-card-divider"></div>
      <div class="book-meta"><span>⌂ <strong>${escapeHtml(row.branch_name || row.city || 'فرع مكتبة')}</strong></span>${location}</div>
      <div class="book-number">الرقم العام: ${escapeHtml(row.general_number)}</div>
    </article>`;
  }).join(''));
}
function setPublicDirectoryVisibility(enabled) {
  publicDirectoryAvailable = Boolean(enabled);
  const tab = $('#branchesTab');
  const panel = $('#branchesView');
  if (tab) tab.hidden = !publicDirectoryAvailable;
  $$('a[href="#branches"]').forEach(link => { link.hidden = !publicDirectoryAvailable; });
  if (publicDirectoryAvailable && window.location.hash === '#branches') activateView('branches');
  if (!publicDirectoryAvailable && panel) {
    if (tab?.classList.contains('active')) activateView('home', { updateHistory: true, hash: '#top' });
    else panel.hidden = true;
  }
}
function publicLogoUrl(path, { original = false } = {}) {
  if (!path || !publicSupabase) return '';
  const storage = publicSupabase.storage.from('school-branding');
  const originalUrl = storage.getPublicUrl(path).data?.publicUrl || '';
  if (original || !originalUrl) return originalUrl;
  return storage.getPublicUrl(path, {
    transform: { width: 128, height: 128, resize: 'contain', format: 'webp', quality: 65 },
  }).data?.publicUrl || originalUrl;
}
function bindPublicLogoFallback(image, originalUrl, { eager = false } = {}) {
  if (!image) return;
  image.loading = eager ? 'eager' : 'lazy';
  image.decoding = 'async';
  image.fetchPriority = eager ? 'high' : 'low';
  image.dataset.logoOriginalUrl = originalUrl || '';
  image.dataset.logoFallbackApplied = 'false';
  if (image.dataset.logoFallbackBound === 'true') return;
  image.addEventListener('error', () => {
    const fallback = image.dataset.logoOriginalUrl;
    if (!fallback || image.dataset.logoFallbackApplied === 'true' || image.currentSrc === fallback) return;
    image.dataset.logoFallbackApplied = 'true';
    image.src = fallback;
  });
  image.dataset.logoFallbackBound = 'true';
}
function deduplicatePublicSchoolProfiles(profiles = []) {
  const preferredByName = new Map();
  for (const profile of profiles || []) {
    const name = String(profile?.school_name || '').trim().normalize('NFC').replace(/\s+/gu, ' ').toLocaleLowerCase('ar');
    if (!name) continue;
    const detailCount = ['educational_administration', 'librarian_name', 'principal_name', 'deputy_names', 'general_supervisor_name', 'first_supervisor_name']
      .filter(key => String(profile[key] || '').trim()).length;
    const score = (profile.school_logo_path ? 100 : 0) + detailCount;
    const current = preferredByName.get(name);
    if (!current || score > current.score) preferredByName.set(name, { profile, score });
  }
  return [...preferredByName.values()]
    .map(({ profile }) => profile)
    .sort((left, right) => String(left.school_name).localeCompare(String(right.school_name), 'ar'));
}
function updatePublicBranding(profiles = []) {
  const defaultLogo = $('#brandDefaultLogo');
  const governorateLogo = $('#brandGovernorateLogo');
  const title = $('#siteBrandTitle');
  const subtitle = $('#siteBrandSubtitle');
  const schoolProfiles = deduplicatePublicSchoolProfiles(profiles);
  const visibleNameProfiles = deduplicatePublicSchoolProfiles(profiles.filter(shouldShowSchoolNameOnHomepage));
  const visibleSchoolNames = new Set(visibleNameProfiles.map(profile => String(profile.school_name || '').trim().normalize('NFC').replace(/\s+/gu, ' ').toLocaleLowerCase('ar')));
  const governorateProfile = schoolProfiles.find(profile => profile.governorate_logo_path);
  const governorateUrl = governorateProfile ? publicLogoUrl(governorateProfile.governorate_logo_path) : '';
  defaultLogo.hidden = false;
  governorateLogo.hidden = !governorateUrl;
  if (governorateUrl) {
    bindPublicLogoFallback(governorateLogo, publicLogoUrl(governorateProfile.governorate_logo_path, { original: true }), { eager: true });
    governorateLogo.src = governorateUrl;
  }
  else governorateLogo.removeAttribute('src');
  title.textContent = 'بوابة مدارس بورسعيد';
  subtitle.replaceChildren();
  if (!schoolProfiles.length) {
    subtitle.textContent = 'شبكة المكتبات المدرسية';
    return;
  }
  subtitle.title = visibleNameProfiles.map(profile => profile.school_name).join('، ');
  for (const profile of schoolProfiles) {
    const normalizedName = String(profile.school_name || '').trim().normalize('NFC').replace(/\s+/gu, ' ').toLocaleLowerCase('ar');
    const showSchoolName = visibleSchoolNames.has(normalizedName);
    const identity = document.createElement('span');
    identity.className = 'brand-school-identity';
    identity.setAttribute('aria-label', showSchoolName ? `مكتبة ${profile.school_name}` : 'شعار مكتبة مشاركة');
    const schoolUrl = publicLogoUrl(profile.school_logo_path);
    if (schoolUrl) {
      const logo = document.createElement('img');
      logo.className = 'brand-school-logo';
      logo.alt = '';
      bindPublicLogoFallback(logo, publicLogoUrl(profile.school_logo_path, { original: true }), { eager: true });
      logo.src = schoolUrl;
      identity.append(logo);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'brand-school-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = '⌂';
      identity.append(placeholder);
    }
    if (showSchoolName) {
      const name = document.createElement('span');
      name.className = 'brand-school-name';
      name.textContent = profile.school_name;
      identity.append(name);
    }
    subtitle.append(identity);
  }
}
function paintBranches(rows, profiles = publicLibraryProfiles, updateHeaderBranding = true) {
  renderSchoolPrincipalCards($('#leadershipList'), profiles, path => publicLogoUrl(path, { original: true }));
  const grid = $('#branchesGrid');
  const displayProfiles = deduplicatePublicSchoolProfiles(profiles);
  if (updateHeaderBranding) updatePublicBranding(displayProfiles);
  const schoolCards = displayProfiles.map(profile => {
    const schoolLogo = publicLogoUrl(profile.school_logo_path);
    const governorateLogo = publicLogoUrl(profile.governorate_logo_path);
    const schoolLogoOriginal = publicLogoUrl(profile.school_logo_path, { original: true });
    const governorateLogoOriginal = publicLogoUrl(profile.governorate_logo_path, { original: true });
    const logos = [
      schoolLogo ? `<img class="school-profile-public-logo" src="${escapeHtml(schoolLogo)}" data-logo-original="${escapeHtml(schoolLogoOriginal)}" alt="شعار ${escapeHtml(profile.school_name)}" loading="lazy">` : '<span class="branch-marker" aria-hidden="true">⌂</span>',
      governorateLogo ? `<img class="school-profile-public-logo governorate" src="${escapeHtml(governorateLogo)}" data-logo-original="${escapeHtml(governorateLogoOriginal)}" alt="شعار المحافظة" loading="lazy">` : '',
    ].join('');
    const administration = profile.educational_administration ? `<p class="school-profile-meta">${escapeHtml(profile.educational_administration)}</p>` : '';
    const librarian = profile.librarian_name ? `<p class="school-profile-librarian">أخصائي المكتبات: ${escapeHtml(profile.librarian_name)}</p>` : '';
    const leadershipRows = [
      ['مدير المدرسة', profile.principal_name],
      ['الوكلاء', profile.deputy_names],
      ['الموجه العام', profile.general_supervisor_name],
      ['الموجه الأول', profile.first_supervisor_name],
    ].filter(([, value]) => String(value || '').trim())
      .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> <span>${escapeHtml(value)}</span></p>`).join('');
    const leadership = leadershipRows ? `<div class="school-profile-leadership">${leadershipRows}</div>` : '';
    return `<article class="branch-card school-profile-card"><div class="school-profile-public-logos">${logos}</div><div class="branch-card-body"><strong>${escapeHtml(profile.school_name)}</strong>${administration}${librarian}${leadership}</div></article>`;
  });
  const branchCards = rows.map(branch => {
    const location = [branch.city, branch.governorate].filter(Boolean).map(escapeHtml).join('، ');
    const links = [];
    if (branch.public_phone) {
      const tel = String(branch.public_phone).replace(/[^+\d]/g, '');
      if (tel) links.push(`<a href="tel:${escapeHtml(tel)}">☎ ${escapeHtml(branch.public_phone)}</a>`);
    }
    if (branch.public_email) links.push(`<a href="mailto:${escapeHtml(branch.public_email)}">✉ ${escapeHtml(branch.public_email)}</a>`);
    return `<article class="branch-card"><span class="branch-marker" aria-hidden="true">⌖</span><div class="branch-card-body"><strong>${escapeHtml(branch.branch_name)}</strong><p>${location ? `${location}${branch.public_address ? ` · ${escapeHtml(branch.public_address)}` : ''}` : (branch.public_address ? escapeHtml(branch.public_address) : 'بيانات الموقع التفصيلية غير متاحة')}</p>${links.length ? `<div class="branch-contact">${links.join('')}</div>` : ''}</div></article>`;
  });
  grid.innerHTML = [...schoolCards, ...branchCards].join('');
  grid.querySelectorAll('.school-profile-public-logo').forEach(image => {
    bindPublicLogoFallback(image, image.dataset.logoOriginal || '');
  });
  grid.setAttribute('aria-busy', 'false');
  setPublicDirectoryVisibility(schoolCards.length + branchCards.length > 0);
}
function updateBranchFilter(rows) {
  const selected = branchFilter.value;
  branchFilter.innerHTML = '<option value="">كل المكتبات</option>' + rows.map(branch => `<option value="${escapeHtml(branch.branch_id)}">${escapeHtml(branch.branch_name)}${branch.city ? ` · ${escapeHtml(branch.city)}` : ''}</option>`).join('');
  if (rows.some(branch => branch.branch_id === selected)) branchFilter.value = selected;
}
async function loadPublicBranches() {
  const profilesRequest = renderPublicProfilesAsSoonAsAvailable(
    publicSupabase.from('library_profiles')
      .select('library_id,school_name,educational_administration,librarian_name,school_logo_path,governorate_logo_path,principal_photo_path,principal_name,deputy_names,general_supervisor_name,first_supervisor_name,is_public,show_school_name_on_homepage')
      .order('school_name', { ascending: true }),
    profiles => {
      publicLibraryProfiles = profiles;
      paintBranches([], profiles);
    },
  );
  const branchesRequest = publicSupabase.from('public_branches')
    .select('branch_id,library_id,library_name,branch_name,governorate,city,public_address,public_phone,public_email,interlibrary_enabled')
    .order('branch_name', { ascending: true });
  const [branchesResult, profilesResult] = await Promise.all([branchesRequest, profilesRequest]);
  publicBranches = branchesResult.error ? [] : (branchesResult.data || []);
  publicLibraryProfiles = profilesResult.error ? [] : (profilesResult.data || []);
  paintBranches(publicBranches, publicLibraryProfiles, false);
  updateBranchFilter(publicBranches);
  if (branchesResult.error && profilesResult.error) throw profilesResult.error;
}
async function runPublicSearch({ append = false } = {}) {
  if (!publicSupabase) return;
  if (!append) {
    currentPage = 0;
    publicResults = [];
    catalogStatus.textContent = 'جارٍ البحث في الفهرس المنشور...';
    resultsGrid.setAttribute('aria-busy', 'true');
  }
  const page = append ? currentPage + 1 : 0;
  const { data, error } = await publicSupabase.rpc('search_public_catalog_v2', {
    p_query: currentSearch.query || null,
    p_branch_id: currentSearch.branch_id || null,
    p_available_only: currentSearch.available_only,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  resultsGrid.setAttribute('aria-busy', 'false');
  if (error) {
    const cached = cacheRead();
    const sameSearch = cached && JSON.stringify(cached.search || {}) === JSON.stringify(currentSearch);
    if (sameSearch && cached?.results?.length) {
      publicBranches = cached.branches || [];
      publicResults = cached.results || [];
      paintBranches(publicBranches);
      paintPublicCards(publicResults);
      catalogStatus.textContent = `تعذّر الاتصال الآن؛ هذه نسخة عامة محفوظة في ${formatDate(cached.saved_at)}. قد تكون الإتاحة تغيّرت.`;
    } else {
      catalogStatus.textContent = 'تعذّر الاتصال بالفهرس؛ حاول تحديث الصفحة عند توفر الاتصال.';
      showEmpty('الفهرس غير متاح حالياً', 'لم تُحفظ نتائج عامة على هذا الجهاز بعد.');
    }
    return;
  }
  const rows = data || [];
  if (append && !rows.length) {
    $('#moreRow').hidden = true;
    catalogStatus.textContent = `عرض ${publicResults.length} نتيجة.`;
    return;
  }
  currentPage = page;
  if (append) publicResults.push(...rows); else publicResults = rows;
  paintPublicCards(rows, append);
  const shown = publicResults.length;
  catalogStatus.textContent = shown ? `عرض ${shown} نتيجة${shown === 1 ? '' : ''} من السجلات المنشورة.` : (currentSearch.query ? 'لا توجد نتائج بهذه الكلمات.' : 'لا توجد عناوين منشورة للعرض حالياً.');
  $('#resultCountLabel').textContent = `تم تحميل ${shown} نتيجة`;
  $('#moreRow').hidden = rows.length < PAGE_SIZE;
  $('#clearSearch').hidden = !(currentSearch.query || currentSearch.branch_id || currentSearch.available_only);
  cacheWrite();
}
function submitSearch() {
  currentSearch = {
    query: $('#searchInput').value.trim().slice(0, 100),
    branch_id: branchFilter.value || null,
    available_only: $('#availableOnly').checked,
  };
  runPublicSearch();
}
$('#publicSearchForm').addEventListener('submit', event => { event.preventDefault(); submitSearch(); });
const homeDiscoveryForm = $('#homeDiscoveryForm');
const homeDiscoveryInput = $('#homeDiscoveryInput');
const homeSearchDescription = $('#homeSearchDescription');
$$('input[name="homeSearchScope"]').forEach(radio => radio.addEventListener('change', () => {
  if (!radio.checked) return;
  const worldSearch = radio.value === 'world';
  homeDiscoveryInput.placeholder = worldSearch ? 'عنوان أو مؤلف في مصدر خارجي…' : 'عنوان كتاب، مؤلف، أو رقم عام…';
  homeSearchDescription.textContent = worldSearch
    ? 'اختر فهرس الإسكندرية أو مكتبة الكونجرس؛ النتائج مستقلة عن مقتنيات بورسعيد.'
    : 'سيُبحث في السجلات التي نشرتها مكتبات بورسعيد؛ اختر القراءة العالمية للبحث خارجها.';
}));
homeDiscoveryForm?.addEventListener('submit', event => {
  event.preventDefault();
  const query = homeDiscoveryInput.value.trim().slice(0, 100);
  if (query.length < 2) return;
  const worldSearch = new FormData(homeDiscoveryForm).get('homeSearchScope') === 'world';
  if (worldSearch) {
    $('#globalReadingInput').value = query;
    activateView('reading', { updateHistory: true, hash: '#globalReading' });
    $('#globalReadingForm').requestSubmit();
  } else {
    $('#searchInput').value = query;
    branchFilter.value = '';
    $('#availableOnly').checked = false;
    activateView('discover', { updateHistory: true, hash: '#discover' });
    submitSearch();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#searchInput').addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(submitSearch, 300);
});
branchFilter.addEventListener('change', submitSearch);
$('#availableOnly').addEventListener('change', submitSearch);
$('#clearSearch').addEventListener('click', () => {
  $('#searchInput').value = '';
  branchFilter.value = '';
  $('#availableOnly').checked = false;
  submitSearch();
});
$('#resetSearch').addEventListener('click', () => $('#clearSearch').click());
$('#loadMore').addEventListener('click', () => runPublicSearch({ append: true }));

function normalizeVisitorText(value = '') {
  return String(value).normalize('NFKD').replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ـ/g, '').toLowerCase().trim();
}
const VISITOR_STOP_WORDS = new Set(['هل', 'ممكن', 'عايز', 'عايزة', 'عاوز', 'عاوزة', 'اريد', 'ابحث', 'بحث', 'عن', 'عندكم', 'يوجد', 'توجد', 'موجود', 'موجودة', 'كتاب', 'الكتاب', 'كتب', 'لو', 'سمحت', 'فين', 'اين', 'ما', 'هو', 'هي', 'في', 'من', 'المكتبة', 'مكتبه', 'رقم', 'عنوان']);
function extractVisitorCatalogQuery(question) {
  return normalizeVisitorText(question).split(/[^\p{L}\p{N}]+/u).filter(word => word && !VISITOR_STOP_WORDS.has(word)).join(' ').slice(0, 100);
}
function appendVisitorAssistantMessage(kind, text, { books = [], searchQuery = '', readingLinks = [], actionLinks = [] } = {}) {
  const log = $('#visitorAssistantLog');
  const item = document.createElement('article');
  item.className = `visitor-assistant-message ${kind}`;
  const label = document.createElement('strong');
  label.textContent = kind === 'user' ? 'أنت' : 'مساعد الزوار';
  const body = document.createElement('p');
  body.textContent = text;
  item.append(label, body);
  if (books.length) {
    const list = document.createElement('ul');
    books.slice(0, 6).forEach(book => {
      const row = document.createElement('li');
      const available = Number(book.available_copies || 0);
      row.textContent = `${book.title || 'عنوان منشور'} — ${book.branch_name || book.city || 'فرع منشور'} — ${available ? `متاح ${available}` : 'غير متاح الآن'}`;
      list.append(row);
    });
    item.append(list);
  }
  if (readingLinks.length) {
    const list = document.createElement('ul');
    list.className = 'visitor-assistant-reading-links';
    readingLinks.slice(0, 3).forEach(link => {
      const row = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = link.label;
      row.append(anchor);
      if (link.note) {
        const note = document.createElement('span');
        note.textContent = ` — ${link.note}`;
        row.append(note);
      }
      list.append(row);
    });
    item.append(list);
  }
  if (actionLinks.length) {
    const list = document.createElement('ul');
    list.className = 'visitor-assistant-reading-links';
    actionLinks.slice(0, 3).forEach(link => {
      const row = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.dataset.visitorContact = 'true';
      anchor.textContent = link.label;
      row.append(anchor);
      list.append(row);
    });
    item.append(list);
  }
  if (searchQuery) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'visitor-search-action';
    button.dataset.visitorSearch = searchQuery;
    button.textContent = 'فتح النتائج في الفهرس العام';
    item.append(button);
  }
  log.append(item);
  log.scrollTop = log.scrollHeight;
}
function publicBranchAnswer(question) {
  const normalized = normalizeVisitorText(question);
  const match = publicBranches.find(branch => normalized.includes(normalizeVisitorText(branch.branch_name)));
  const branches = match ? [match] : publicBranches.slice(0, 5);
  if (!branches.length) return 'لا توجد حالياً بيانات فروع منشورة يمكن عرضها. راجع هذه الصفحة لاحقاً؛ ساعات العمل غير معروضة هنا.';
  const details = branches.map(branch => {
    const place = [branch.city, branch.governorate, branch.public_address].filter(Boolean).join('، ');
    const contact = [branch.public_phone, branch.public_email].filter(Boolean).join(' · ');
    return `${branch.branch_name}${place ? ` — ${place}` : ''}${contact ? ` — ${contact}` : ''}`;
  }).join('\n');
  return `${match ? 'هذه بيانات الفرع المنشورة:' : 'هذه بعض بيانات الفروع المنشورة؛ افتح قسم المكتبات لرؤية القائمة كاملة:'}\n${details}\nلا تتوفر هنا معلومات مؤكدة عن مواعيد العمل.`;
}
async function answerVisitorQuestion(question) {
  const intentAnswer = resolveVisitorAssistantIntent(question);
  if (intentAnswer) return intentAnswer;
  const normalized = normalizeVisitorText(question);
  if (/(اونلاين|انترنت|الكترون|pdf|تحميل|تنزيل|اقرا|قراءة|قراءه)/.test(normalized)) {
    const matches = findPublicReadableBooks(question);
    const booksToShow = matches.length ? matches : PUBLIC_READABLE_BOOKS;
    const readingLinks = booksToShow.map(book => ({
      label: `${book.title} — فتح PDF`,
      href: new URL(book.pdf, import.meta.url).href,
      note: book.kind,
    }));
    const asksAboutUnknownTitle = hasSpecificUnknownPublicReading(question, matches);
    const text = matches.length
      ? `نعم، يوجد على الموقع ملف PDF لكتاب «${matches[0].title}» (${matches[0].kind}). إليك رابطه المباشر؛ ويمكنك رؤية المصدر والترخيص في قسم القراءة الرقمية.`
      : asksAboutUnknownTitle
        ? 'لا أجد على الموقع ملف PDF مباشرًا لهذا العنوان أو الموضوع ضمن المجموعة المحلية الحالية. يستضيف الموقع ثلاثة ملفات محددة فقط؛ الروابط أدناه تعرضها، ويمكن مراجعة قسم القراءة الرقمية للمصدر والترخيص.'
        : 'نعم، يستضيف الموقع ثلاثة ملفات PDF عربية قابلة للقراءة والتنزيل. «كليلة ودمنة» هنا باب الأسد والثور فقط، و«رسالة الغفران» تشمل الجزأين الأول والثاني. إليك الروابط المباشرة؛ والمصدر والترخيص موضحان في قسم القراءة الرقمية.';
    return { text, readingLinks };
  }
  if (/(استعير|استلف|اعاره|حجز|احجز|استعاره)/.test(normalized)) {
    return { text: 'ابحث عن العنوان في الفهرس، وتحقق من الفرع وعدد النسخ المتاحة وموقع الرف إن ظهر. بعد ذلك تواصل مع الفرع عبر وسيلة الاتصال المنشورة أو زره. طلب الإعارة والحجز يُدار حالياً من الموظفين داخل المكتبة؛ لا يتيح الموقع طلباً عاماً عبر الإنترنت.' };
  }
  if (/(عامل|موظف|امين|امناء|مسؤول|مسوول|شغال|يعمل|القائمين|فريق|اسماء)/.test(normalized)) {
    return { text: 'لا ينشر الموقع حالياً أسماء الموظفين أو بياناتهم الشخصية. يعرض فقط بيانات الفروع ووسائل الاتصال التي اعتمدتها المكتبة ونشرتها؛ يمكنك مراجعة قسم المكتبات.' };
  }
  if (/(فرع|فروع|تليفون|هاتف|تواصل|مكان|مواعيد|دوام|ساعات|فين|اين)/.test(normalized) || /عنوان\s+(?:الفرع|المكتبة)/.test(normalized)) {
    return { text: publicBranchAnswer(question) };
  }
  if (/(من نحن|عن المكتبة|عن الموقع|تعريف|هدف|ما هي المكتبة|ما هي مكتبات|مكتبات بورسعيد|المكتبات المدرسية|ماهو الموقع|ايه الموقع|الموقع ده)/.test(normalized)) {
    return { text: 'هذه بوابة اكتشاف مشتركة لمكتبات المدارس المشاركة في بورسعيد. تساعدك على البحث عن الكتب المنشورة والتحقق من الفرع والإتاحة ومكان النسخة؛ ولا تعرض إلا المعلومات التي نشرتها المكتبة.' };
  }
  const query = extractVisitorCatalogQuery(question);
  if (!query) return { text: 'اسألني عن طريقة البحث أو الإعارة أو مصادر القراءة الخارجية أو الفروع، أو اكتب عنوان كتاب لأبحث في الفهرس المنشور.' };
  if (!publicSupabase) return { text: 'الفهرس غير متصل حالياً؛ أعد المحاولة بعد استقرار الاتصال.' };
  const { data, error } = await publicSupabase.rpc('search_public_catalog_v2', {
    p_query: query, p_branch_id: null, p_available_only: false, p_limit: 6, p_offset: 0,
  });
  if (error) return { text: 'تعذّر البحث في الفهرس العام الآن. جرّب البحث من صندوق الفهرس أو أعد المحاولة لاحقاً.' };
  const books = data || [];
  return books.length
    ? { text: `وجدت ${books.length} نتيجة منشورة مطابقة أو قريبة. الإتاحة قد تتغير؛ تأكد منها مع الفرع قبل الزيارة.`, books, searchQuery: query }
    : { text: `لم أجد عنواناً منشوراً يطابق «${query}». جرّب كلمة أقصر أو ابحث مباشرة في الفهرس؛ قد لا تكون كل الكتب مسجلة أو منشورة.`, searchQuery: query };
}
let visitorAssistantBusy = false;
async function sendVisitorQuestion(question) {
  const text = String(question || '').trim().slice(0, 300);
  if (!text || visitorAssistantBusy) return;
  visitorAssistantBusy = true;
  if (isVisitorAssistantQuestionSensitive(text)) {
    appendVisitorAssistantMessage('assistant', VISITOR_PERSONAL_DATA_REPLY);
    setMessage($('#visitorAssistantStatus'), 'حُجب هذا السؤال محليًا؛ لم يُرسل إلى Gemini أو Telegram ولم تُحفظ المحادثة.');
    visitorAssistantBusy = false;
    return;
  }
  appendVisitorAssistantMessage('user', text);
  setMessage($('#visitorAssistantStatus'), 'جارٍ إعداد إجابة من المعلومات العامة المنشورة…');
  const submit = $('#visitorAssistantForm button[type="submit"]');
  submit.disabled = true;
  try {
    const answer = await routeVisitorAssistantQuestion(text, {
      askGemini: async publicQuestion => {
        if (!publicSupabase) return null;
        const { data, error } = await publicSupabase.functions.invoke('visitor-assistant', {
          body: { question: publicQuestion },
        });
        return error || data?.ok !== true ? null : data;
      },
      answerLocally: answerVisitorQuestion,
    });
    appendVisitorAssistantMessage('assistant', answer.text, answer);
    setMessage($('#visitorAssistantStatus'), answer.source === 'gemini'
      ? 'أجاب Gemini اعتمادًا على دليل الموقع والفهرس المنشور. لا تُعد الإتاحة اللحظية مؤكدة إلا بعد مراجعة الفرع.'
      : answer.source === 'local-fallback'
        ? 'Gemini غير متاح الآن؛ استخدم المساعد إجابة محلية من الموقع والفهرس المنشور.'
        : 'إجابة محلية من معلومات الموقع العامة؛ لا تُعد تأكيدًا للإتاحة اللحظية إلا بعد مراجعة الفرع.');
  } catch {
    setMessage($('#visitorAssistantStatus'), 'تعذّر إكمال الإجابة الآن؛ يمكنك استخدام البحث والفروع المنشورة مباشرةً.', 'error');
  } finally {
    visitorAssistantBusy = false;
    submit.disabled = false;
  }
}
$('#visitorAssistantForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#visitorAssistantInput');
  const question = input.value;
  input.value = '';
  sendVisitorQuestion(question);
});
$$('[data-visitor-question]').forEach(button => button.addEventListener('click', () => sendVisitorQuestion(button.dataset.visitorQuestion)));
$('#visitorAssistantLog').addEventListener('click', event => {
  if (event.target.closest('[data-visitor-contact]')) {
    visitorChatDialog?.close();
    return;
  }
  const button = event.target.closest('[data-visitor-search]');
  if (!button) return;
  $('#searchInput').value = button.dataset.visitorSearch;
  branchFilter.value = '';
  $('#availableOnly').checked = false;
  submitSearch();
  $('#discover').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

const visitorChatDialog = $('#visitorChatDialog');
function openVisitorChat() {
  if (!visitorChatDialog) return;
  if (!visitorChatDialog.open) visitorChatDialog.showModal();
  requestAnimationFrame(() => $('#visitorAssistantInput')?.focus({ preventScroll: true }));
}
$('#headerVisitorChatShortcut')?.addEventListener('click', openVisitorChat);
$('#closeVisitorChat')?.addEventListener('click', () => visitorChatDialog?.close());
$$('a[href="#visitorAssistant"]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  openVisitorChat();
}));
visitorChatDialog?.addEventListener('click', event => {
  if (event.target === visitorChatDialog) visitorChatDialog.close();
});
if (window.location.hash === '#visitorAssistant') openVisitorChat();

const openStaff = () => {
  if (!staffDialog.open) staffDialog.showModal();
  if (!supabase) setMessage(loginMessage, 'الاتصال بخدمة الحسابات غير جاهز حالياً. أعد تحميل الصفحة وحاول مجدداً.', 'error');
};
$('#staffOpen').addEventListener('click', openStaff);
$('#staffOpenBottom').addEventListener('click', openStaff);
$('#staffOpenEmpty').addEventListener('click', openStaff);
$('#featureStaffLink').addEventListener('click', event => { event.preventDefault(); openStaff(); });
$('#closeStaffDialog').addEventListener('click', () => staffDialog.close());
staffDialog.addEventListener('click', event => { if (event.target === staffDialog) staffDialog.close(); });

function setWorkspaceMode(isSignedIn) {
  $('#loginPane').hidden = isSignedIn;
  $('#workspacePane').hidden = !isSignedIn;
  $('#staffDialogTitle').textContent = isSignedIn ? 'لوحة عمل المكتبة' : 'مساحة الموظفين';
}
function activatePanel(panelId) {
  const tabs = $$('.staff-tab');
  const selectedTab = tabs.find(button => button.dataset.panel === panelId && !button.hidden);
  if (!selectedTab) return;
  tabs.forEach(button => {
    const active = button === selectedTab;
    button.id ||= `${button.dataset.panel}Tab`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', button.dataset.panel);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    button.classList.toggle('active', active);
  });
  $$('.staff-panel').forEach(panel => {
    const active = panel.id === panelId;
    const tab = tabs.find(button => button.dataset.panel === panel.id);
    panel.setAttribute('role', 'tabpanel');
    if (tab) panel.setAttribute('aria-labelledby', tab.id || `${panel.id}Tab`);
    panel.tabIndex = 0;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}
function configureRole(role) {
  const manager = ['owner', 'admin', 'librarian'].includes(role);
  const administrator = ['owner', 'admin'].includes(role);
  const owner = role === 'owner';
  const assistant = manager || role === 'reporter';
  $('#ownerTelegramReportCard').hidden = !hasPlatformOwnerAccess(currentMemberships);
  ownerReportPreview = null;
  $('#ownerReportDialog').close();
  const circulation = manager || role === 'circulation';
  const allowed = new Set(['catalogPanel', 'reportsPanel']);
  if (manager) ['branchesPanel', 'requestsPanel'].forEach(id => allowed.add(id));
  if (owner) allowed.add('schoolProfilePanel');
  if (owner && hasSiteFooterOwnership()) allowed.add('visitorQuestionsPanel');
  if (hasSiteMediaOwnership()) {
    allowed.add('siteMediaPanel');
    allowed.add('siteAnalyticsPanel');
  }
  if (circulation) ['circulationPanel', 'reservationsPanel', 'visitorsPanel'].forEach(id => allowed.add(id));
  if (administrator) allowed.add('membersPanel');
  if (assistant) allowed.add('assistantPanel');
  if (role) allowed.add('automationPanel');
  $$('.staff-tab').forEach(button => { button.hidden = !allowed.has(button.dataset.panel); });
  $('#titleForm').hidden = !manager;
  $('#holdingForm').hidden = !manager;
  $('#bookImportCard').hidden = !manager;
  $('#branchForm').hidden = !manager;
  $('#schoolProfileTab').hidden = !owner;
  $('#visitorQuestionsTab').hidden = !(owner && hasSiteFooterOwnership());
  $('#siteMediaTab').hidden = !hasSiteMediaOwnership();
  $('#siteAnalyticsTab').hidden = !hasSiteMediaOwnership();
  $('#schoolProfileForm').hidden = !owner;
  schoolProfileLoadedId = null;
  schoolProfileLoadGeneration += 1;
  $('#schoolProfileFields').disabled = true;
  syncSchoolProfilePicker();
  $('#siteFooterEditor').hidden = !hasSiteFooterOwnership();
  $('#createSchoolForm').hidden = !owner;
  $('#deleteSchoolCard').hidden = !canDeleteOwnedSchool(role, currentLibraryId);
  $('#sharingSettingsForm').hidden = !administrator;
  $('#libraryPublicationForm').hidden = !administrator;
  $('#patronForm').hidden = !circulation;
  $('#checkoutForm').hidden = !circulation;
  $('#reservationForm').hidden = !circulation;
  $('#visitorForm').hidden = !circulation;
  $('#requestForm').hidden = !manager;
  $('#inviteForm').hidden = !administrator;
  $('#operationalBackupCard').hidden = role !== 'owner';
  $('#managerAssistantCard').hidden = !administrator;
  const canViewPlatformReport = hasPlatformOwnerAccess(currentMemberships);
  $('#platformReportSection').hidden = !canViewPlatformReport;
  if (!canViewPlatformReport) {
    platformLibraryReportData = null;
    $('#platformReportSummary').replaceChildren();
    $('#platformLibraryComparison').replaceChildren();
    $('#platformReportStatus').textContent = '';
    $('#platformAiSummaryOutput').replaceChildren();
    $('#platformAiSummaryOutput').hidden = true;
  }
  if (!(owner && hasSiteFooterOwnership())) {
    $('#ownerVisitorQuestionsList').replaceChildren();
    $('#visitorQuestionsStatus').textContent = '';
  }
  const active = $('.staff-tab.active');
  activatePanel(active && !active.hidden ? active.dataset.panel : 'catalogPanel');
}
$$('.staff-tab').forEach(button => {
  button.addEventListener('click', () => activatePanel(button.dataset.panel));
  button.addEventListener('keydown', event => {
    const visibleTabs = $$('.staff-tab').filter(tab => !tab.hidden);
    const index = visibleTabs.indexOf(button);
    if (index < 0 || !visibleTabs.length) return;
    let nextIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = visibleTabs.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const nextKey = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const step = event.key === nextKey ? 1 : -1;
      nextIndex = (index + step + visibleTabs.length) % visibleTabs.length;
    } else return;
    event.preventDefault();
    const nextTab = visibleTabs[nextIndex];
    activatePanel(nextTab.dataset.panel);
    nextTab.focus({ preventScroll: true });
  });
});

function libraryProfileLabel(profile) {
  const name = String(profile?.school_name || 'ملف المدرسة');
  const matches = [...currentLibraryProfileChoices.values()].filter(item => item.school_name === name);
  if (matches.length < 2) return name;
  return `${name} · ${profile.is_public ? 'ملف عام' : 'مسودة خاصة'}`;
}
function hasSiteFooterOwnership() {
  return currentMemberships.some(membership => membership.status === 'active'
    && membership.role === 'owner' && SITE_OWNER_LIBRARY_IDS.has(membership.library_id));
}
function hasSiteMediaOwnership() {
  return currentMemberships.some(membership => membership.status === 'active'
    && ['owner', 'admin'].includes(membership.role) && SITE_OWNER_LIBRARY_IDS.has(membership.library_id));
}
function visitorQuestionSourceLabel(source) {
  return ({ gemini: 'Gemini', telegram: 'متابعة عبر Telegram', local: 'رد تلقائي محلي' })[source] || 'غير مسجل';
}
async function loadOwnerVisitorQuestions() {
  const status = $('#visitorQuestionsStatus');
  const list = $('#ownerVisitorQuestionsList');
  if (currentRole !== 'owner' || !hasSiteFooterOwnership() || !supabase) {
    list.replaceChildren();
    return;
  }
  status.textContent = 'جارٍ تحميل القائمة بصلاحية المالك…';
  const { data, error } = await supabase.functions.invoke('visitor-questions-dashboard', {
    body: { action: 'list' },
  });
  if (error || !Array.isArray(data?.questions)) {
    list.replaceChildren();
    status.textContent = 'تعذّر تحميل القائمة. تحقق من صلاحية جلسة المالك ثم أعد المحاولة.';
    return;
  }
  list.replaceChildren();
  if (!data.questions.length) {
    status.textContent = 'لا توجد أسئلة محفوظة للمتابعة.';
    return;
  }
  status.textContent = `عدد الأسئلة المعروضة: ${data.questions.length}`;
  for (const item of data.questions) {
    const card = document.createElement('article');
    card.className = 'owner-question-card';
    const questionHeading = document.createElement('h4');
    questionHeading.textContent = 'السؤال';
    const question = document.createElement('p');
    question.className = 'owner-question-text';
    question.dir = 'auto';
    question.textContent = typeof item.question === 'string' ? item.question : '—';
    const meta = document.createElement('p');
    meta.className = 'owner-question-meta';
    const statusLabel = item.status === 'answered' ? 'تم الرد' : 'بانتظار الرد';
    meta.textContent = `الحالة: ${statusLabel} · المصدر: ${visitorQuestionSourceLabel(item.source)}`;
    card.append(questionHeading, question, meta);
    if (typeof item.reply === 'string' && item.reply) {
      const replyHeading = document.createElement('h4');
      replyHeading.textContent = 'الرد';
      const reply = document.createElement('p');
      reply.className = 'owner-question-text owner-question-reply';
      reply.dir = 'auto';
      reply.textContent = item.reply;
      card.append(replyHeading, reply);
    }
    list.append(card);
  }
}
$('#refreshVisitorQuestions').addEventListener('click', () => { void loadOwnerVisitorQuestions(); });
function updateLibraryProfileChoice(profile) {
  currentLibraryProfileChoices.set(profile.library_id, profile);
  updateOwnedSchoolActionOption(profile);
  const option = [...$('#librarySelect').options].find(item => item.value === profile.library_id);
  if (!option) return null;
  option.dataset.schoolName = profile.school_name || '';
  option.dataset.profilePublic = String(Boolean(profile.is_public));
  option.textContent = libraryProfileLabel(profile);
  syncSchoolProfilePicker();
  return option;
}

function activeOwnedSchoolMembership(libraryId) {
  return currentMemberships.find(membership => membership.library_id === libraryId
    && membership.role === 'owner' && membership.status === 'active') || null;
}
function updateOwnedSchoolActionControls() {
  const select = $('#ownedSchoolActionSelect');
  const option = select?.selectedOptions?.[0];
  const libraryId = select?.value || '';
  const membership = activeOwnedSchoolMembership(libraryId);
  const profile = currentLibraryProfileChoices.get(libraryId) || null;
  const schoolName = profile?.school_name || option?.dataset.schoolName || option?.dataset.libraryName || 'المدرسة المحددة';
  const visible = profile ? shouldShowSchoolNameOnHomepage(profile) : false;
  const homepageNameState = profile && !profile.is_public
    ? `معدّ ${visible ? 'للظهور' : 'للإخفاء'} عند نشر الملف`
    : (visible ? 'ظاهر' : 'مخفى');
  const toggleButton = $('#toggleHomepageSchoolName');
  const deleteButton = $('#previewOwnedSchoolDeletion');
  const context = $('#ownedSchoolActionContext');
  if (!libraryId || !membership) {
    context.textContent = 'اختر إحدى المكتبات التي تملكها لإظهار الإجراء المناسب.';
    toggleButton.disabled = true;
    deleteButton.disabled = true;
    return;
  }
  context.textContent = profile
    ? `المكتبة المختارة: ${option?.dataset.libraryName || schoolName}. اسم ملف المدرسة «${schoolName}» ${homepageNameState} بجوار شعار مصر؛ الملف ${profile.is_public ? 'ظاهر في دليل المكتبات' : 'غير منشور في الدليل'}. خيار الظهور مستقل؛ الشعاران والبيانات لا يتغيران عند إخفاء الاسم.`
    : `المكتبة المختارة: ${option?.dataset.libraryName || schoolName}. لا يوجد ملف مدرسة محفوظ لها بعد؛ يمكنك معاينة الحذف النهائي، لكن لا يمكن تغيير ظهور اسمها قبل إنشاء الملف.`;
  toggleButton.disabled = !profile;
  toggleButton.textContent = visible
    ? 'إزالة الاسم من الصفحة الرئيسية فقط'
    : 'إعادة إظهار الاسم بجوار شعار مصر';
  deleteButton.disabled = !canDeleteOwnedSchool(membership.role, libraryId);
}
function updateOwnedSchoolActionOption(profile) {
  const option = [...$('#ownedSchoolActionSelect').options].find(item => item.value === profile.library_id);
  if (!option) return;
  option.dataset.schoolName = profile.school_name || '';
  const libraryName = option.dataset.libraryName || profile.school_name || 'مكتبة';
  option.textContent = profile.school_name && profile.school_name !== libraryName
    ? `${libraryName} — ملف المدرسة: ${profile.school_name}`
    : libraryName;
  updateOwnedSchoolActionControls();
}
function refreshOwnedSchoolActionChoices(libraries = []) {
  const select = $('#ownedSchoolActionSelect');
  const previousValue = select.value;
  const owners = currentMemberships.filter(membership => membership.role === 'owner' && membership.status === 'active');
  const ownedIds = new Set(owners.map(membership => membership.library_id));
  select.innerHTML = owners.map(membership => {
    const library = libraries.find(item => item.id === membership.library_id);
    const profile = currentLibraryProfileChoices.get(membership.library_id);
    const libraryName = library?.name || 'مكتبة';
    const schoolName = profile?.school_name || '';
    const label = schoolName && schoolName !== libraryName
      ? `${libraryName} — ملف المدرسة: ${schoolName}`
      : libraryName;
    return `<option value="${escapeHtml(membership.library_id)}" data-library-name="${escapeHtml(libraryName)}" data-school-name="${escapeHtml(schoolName)}">${escapeHtml(label)}</option>`;
  }).join('');
  const selectedId = ownedIds.has(previousValue) ? previousValue
    : (ownedIds.has(currentLibraryId) ? currentLibraryId : owners[0]?.library_id || '');
  if (selectedId) select.value = selectedId;
  select.disabled = owners.length === 0;
  updateOwnedSchoolActionControls();
}

async function loadMemberships(preferredLibraryId = null) {
  const { data: userData } = await supabase.auth.getUser();
  currentUserId = userData?.user?.id || null;
  const { data, error } = await supabase.from('library_memberships').select('library_id,role,status').eq('status', 'active');
  if (error) {
    currentMemberships = [];
    refreshOwnedSchoolActionChoices([]);
    currentRole = null;
    configureRole(null);
    setWorkspaceMode(true);
    $('#membershipWarning').hidden = false;
    $('#membershipWarning').textContent = 'تعذّر تحميل صلاحيات هذا الحساب. تواصل مع مسؤول المكتبة.';
    return;
  }
  currentMemberships = data || [];
  if (!currentMemberships.length) {
    currentRole = null;
    configureRole(null);
    setWorkspaceMode(true);
    $('#membershipWarning').hidden = false;
    $('#membershipWarning').textContent = 'لا توجد مكتبة مرتبطة بهذا الحساب. لا يوجد تسجيل مفتوح؛ اطلب من مالك المكتبة إضافتك.';
    $('#workspaceTitle').textContent = 'لا توجد صلاحية لمكتبة';
    $('#staffIdentity').textContent = 'يمكنك تسجيل الخروج أو طلب دعوة من المسؤول.';
    $('#librarySelect').innerHTML = '';
    refreshOwnedSchoolActionChoices([]);
    $('#staffStats').innerHTML = '';
    return;
  }
  const ids = currentMemberships.map(item => item.library_id);
  const { data: libraries, error: libraryError } = await supabase.from('libraries').select('id,name').in('id', ids).order('name');
  if (libraryError || !libraries?.length) {
    setWorkspaceMode(true);
    $('#membershipWarning').hidden = false;
    $('#membershipWarning').textContent = 'تعذّر فتح معلومات المكتبة. راجع صلاحيات الحساب.';
    return;
  }
  const { data: profiles } = await supabase.from('library_profiles').select('library_id,school_name,is_public,show_school_name_on_homepage').in('library_id', ids);
  currentLibraryProfileChoices = new Map((profiles || []).map(profile => [profile.library_id, profile]));
  refreshOwnedSchoolActionChoices(libraries);
  $('#membershipWarning').hidden = true;
  $('#librarySelect').innerHTML = libraries.map(library => {
    const profile = currentLibraryProfileChoices.get(library.id);
    const label = profile ? libraryProfileLabel(profile) : library.name;
    return `<option value="${escapeHtml(library.id)}" data-library-name="${escapeHtml(library.name)}" data-school-name="${escapeHtml(profile?.school_name || '')}" data-profile-public="${String(Boolean(profile?.is_public))}">${escapeHtml(label)}</option>`;
  }).join('');
  $('#staffIdentity').textContent = supabase.auth.getUser ? 'حساب موظف مُصادق عليه' : '';
  currentLibraryId = libraries.some(library => library.id === preferredLibraryId) ? preferredLibraryId : libraries[0].id;
  currentRole = currentMemberships.find(item => item.library_id === currentLibraryId)?.role || null;
  configureRole(currentRole);
  $('#librarySelect').value = currentLibraryId;
  loadAssistantModelChoice();
  setWorkspaceMode(true);
  await loadStaffData();
}
function syncSchoolProfilePicker() {
  const select = $('#schoolProfileSelect');
  $('#schoolProfilePicker').hidden = currentRole !== 'owner';
  const ownedIds = new Set(currentMemberships.filter(item => item.role === 'owner' && item.status === 'active').map(item => item.library_id));
  select.replaceChildren(...[...$('#librarySelect').options].filter(option => ownedIds.has(option.value)).map(option => option.cloneNode(true)));
  select.value = currentLibraryId || '';
  select.disabled = schoolProfileSaving || librarySwitchInProgress || !select.options.length;
}
async function switchWorkspaceLibrary(nextId) {
  if (schoolProfileSaving || librarySwitchInProgress) {
    $('#librarySelect').value = currentLibraryId || '';
    syncSchoolProfilePicker();
    return;
  }
  const membership = currentMemberships.find(item => item.library_id === nextId && item.status === 'active');
  if (!membership || nextId === currentLibraryId) return;
  librarySwitchInProgress = true;
  $('#librarySelect').disabled = true;
  clearAssistantChat();
  currentLibraryId = nextId;
  currentLibraryProfile = null;
  currentRole = membership.role;
  $('#librarySelect').value = nextId;
  configureRole(currentRole);
  loadAssistantModelChoice();
  try {
    await loadStaffData();
  } finally {
    librarySwitchInProgress = false;
    $('#librarySelect').disabled = schoolProfileSaving;
    syncSchoolProfilePicker();
  }
}
$('#librarySelect').addEventListener('change', event => { void switchWorkspaceLibrary(event.target.value); });
$('#schoolProfileSelect').addEventListener('change', event => {
  if (activeOwnedSchoolMembership(event.target.value)) void switchWorkspaceLibrary(event.target.value);
});
async function loadStaffData() {
  if (!currentLibraryId) return;
  const option = $('#librarySelect').selectedOptions[0];
  $('#workspaceTitle').textContent = option?.textContent || 'مكتبتك';
  $('#workspaceMessage').textContent = '';
  branchLoadFailed = false;
  inventoryLoadFailed = false;
  librarySettingsLoadFailed = true;
  currentLibraryIsPublished = null;
  staffMetrics = {};
  inventoryTitles = [];
  inventoryHoldings = [];
  $('#libraryPublicationForm').hidden = true;
  $('#sharingSettingsForm').hidden = true;
  await loadStaffBranches();
  const tasks = [refreshStaffStats(), loadInventory(), loadReports(), loadLibrarySettings()];
  if (hasPlatformOwnerAccess(currentMemberships)) tasks.push(loadPlatformLibraryReport());
  if (currentRole === 'owner') tasks.push(loadSchoolProfile(), loadSiteFooter());
  if (currentRole === 'owner' && hasSiteFooterOwnership()) tasks.push(loadOwnerVisitorQuestions());
  if (hasSiteMediaOwnership()) tasks.push(loadSiteMediaManager(), loadSiteAnalytics());
  if (['owner', 'admin', 'librarian'].includes(currentRole)) tasks.push(loadInterlibraryRequests());
  if (['owner', 'admin'].includes(currentRole)) tasks.push(loadLibraryMembers());
  if (['owner', 'admin', 'librarian', 'circulation'].includes(currentRole)) {
    tasks.push(loadPatrons(), loadAvailableHoldings(), loadOpenLoans(), loadVisitors(), loadReservations());
  }
  await Promise.all(tasks);
  renderAutomationTasks();
}
function cairoDateOffset(days) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - days)).toISOString().slice(0, 10);
}
async function loadSiteAnalytics() {
  if (!supabase || !hasSiteMediaOwnership()) return;
  const status = $('#siteAnalyticsStatus');
  const summary = $('#siteAnalyticsSummary');
  const body = $('#siteAnalyticsRows');
  status.textContent = 'جارٍ تحميل إجماليات آخر 30 يومًا…';
  summary.innerHTML = '';
  body.innerHTML = '<tr><td class="site-analytics-empty" colspan="3">جارٍ التحميل…</td></tr>';
  const { data, error } = await supabase.from('site_page_view_daily')
    .select('view_date,section,page_views')
    .gte('view_date', cairoDateOffset(29))
    .order('view_date', { ascending: false })
    .order('section', { ascending: true })
    .limit(210);
  if (error) {
    status.textContent = 'تعذّر تحميل الإحصاءات؛ تحقق من الاتصال وصلاحية المالك أو المسؤول.';
    body.innerHTML = '<tr><td class="site-analytics-empty" colspan="3">لا تتوفر بيانات للعرض.</td></tr>';
    return;
  }
  const rows = data || [];
  const totals = Object.fromEntries(Object.keys(PUBLIC_PAGE_VIEW_LABELS).map(section => [section, 0]));
  rows.forEach(row => {
    if (Object.prototype.hasOwnProperty.call(totals, row.section)) totals[row.section] += Number(row.page_views) || 0;
  });
  const totalViews = Object.values(totals).reduce((sum, count) => sum + count, 0);
  summary.innerHTML = Object.entries(PUBLIC_PAGE_VIEW_LABELS).map(([section, label]) => `
    <article class="site-analytics-card"><span>${escapeHtml(label)}</span><strong>${totals[section].toLocaleString('ar-EG')}</strong></article>
  `).join('');
  if (!rows.length) {
    body.innerHTML = '<tr><td class="site-analytics-empty" colspan="3">لا توجد مشاهدات مسجلة في هذه الفترة بعد.</td></tr>';
  } else {
    body.innerHTML = rows.map(row => {
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(row.view_date || '');
      const viewDate = validDate
        ? new Intl.DateTimeFormat('ar-EG', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${row.view_date}T00:00:00Z`))
        : '—';
      const label = PUBLIC_PAGE_VIEW_LABELS[row.section] || 'قسم عام';
      return `<tr><td>${escapeHtml(viewDate)}</td><td>${escapeHtml(label)}</td><td>${(Number(row.page_views) || 0).toLocaleString('ar-EG')}</td></tr>`;
    }).join('');
  }
  status.textContent = `إجمالي ${totalViews.toLocaleString('ar-EG')} مشاهدة مسجلة خلال آخر 30 يومًا.`;
}
$('#refreshSiteAnalytics').addEventListener('click', () => { void loadSiteAnalytics(); });
async function countRows(table, filters = []) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('library_id', currentLibraryId);
  for (const [method, column, value] of filters) query = query[method](column, value);
  const { count, error } = await query;
  return error ? null : count;
}
async function fetchAllPages(makeQuery, { pageSize = 1000, maxRows = 50000 } = {}) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error(`Result exceeded the ${maxRows} row safety limit.`);
}

async function refreshStaffStats() {
  const [titles, copies, lost, maintenance, openLoans, overdue, waiting] = await Promise.all([
    countRows('catalog_titles'), countRows('holdings'),
    countRows('holdings', [['eq', 'status', 'lost']]),
    countRows('holdings', [['eq', 'status', 'maintenance']]),
    countRows('loans', [['is', 'returned_at', null]]),
    countRows('loans', [['is', 'returned_at', null], ['lt', 'due_at', new Date().toISOString()]]),
    countRows('reservations', [['eq', 'status', 'queued']]),
  ]);
  staffMetrics = { titles, copies, lost, maintenance, openLoans, overdue, waiting };
  const stats = [['عناوين مسجلة', titles], ['نسخ في الجرد', copies], ['نسخ مفقودة', lost], ['تحت الصيانة', maintenance], ['إعارات مفتوحة', openLoans], ['متأخرة الآن', overdue], ['حجوزات انتظار', waiting]];
  $('#staffStats').innerHTML = stats.map(([label, value]) => `<div class="stat-card"><span>${label}</span><strong>${value === null ? '—' : Number(value).toLocaleString('ar-EG')}</strong></div>`).join('');
  renderAutomationTasks();
}
async function loadStaffBranches() {
  const { data, error } = await supabase.from('branches').select('id,name,governorate,city,public_address,public_phone,public_email,is_published').eq('library_id', currentLibraryId).order('name');
  if (error) { branchLoadFailed = true; staffBranches = []; renderAutomationTasks(); return; }
  branchLoadFailed = false;
  staffBranches = data || [];
  const options = '<option value="">اختر الفرع</option>' + staffBranches.map(branch => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`).join('');
  $$('[data-branch-select]').forEach(select => { const old = select.value; select.innerHTML = options; if (staffBranches.some(branch => branch.id === old)) select.value = old; });
  const branchEditSelect = $('#branchEditSelect');
  const selectedBranch = branchEditSelect.value;
  branchEditSelect.innerHTML = options;
  if (staffBranches.some(branch => branch.id === selectedBranch)) branchEditSelect.value = selectedBranch;
  $('#requestSourceBranchSelect').innerHTML = '<option value="">بدون تحديد</option>' + staffBranches.map(branch => `<option value="${escapeHtml(branch.id)}">${escapeHtml(branch.name)}</option>`).join('');
  $('#staffBranches').innerHTML = staffBranches.length ? staffBranches.map(branch => `<div class="branch-admin-item"><span>${escapeHtml(branch.name)}<small>${escapeHtml([branch.city, branch.governorate].filter(Boolean).join('، '))}</small></span><span class="${branch.is_published ? 'branch-public-tag' : 'branch-public-tag branch-private-tag'}">${branch.is_published ? 'منشور' : 'داخلي'}</span></div>`).join('') : '<p class="table-empty">لا توجد فروع لهذه المكتبة بعد.</p>';
  updateBranchFilter(publicBranches);
  renderAutomationTasks();
}
async function loadLibrarySettings() {
  const publicationForm = $('#libraryPublicationForm');
  const sharingForm = $('#sharingSettingsForm');
  publicationForm.hidden = true;
  sharingForm.hidden = true;
  const { data, error } = await supabase.from('libraries').select('is_published,interlibrary_enabled').eq('id', currentLibraryId).maybeSingle();
  if (error || !data) {
    librarySettingsLoadFailed = true;
    $('#libraryPublicationStatus').textContent = 'تعذّر تحميل حالة نشر المكتبة؛ لا تفترض أن إعدادها منشور أو متوقف.';
    if (['owner','admin'].includes(currentRole)) setMessage($('#sharingSettingsMessage'), 'تعذّر تحميل إعداد المشاركة.', 'error');
    renderAutomationTasks();
    return;
  }
  librarySettingsLoadFailed = false;
  currentLibraryIsPublished = Boolean(data.is_published);
  publicationForm.elements.is_published.checked = currentLibraryIsPublished;
  $('#libraryPublicationStatus').textContent = currentLibraryIsPublished
    ? 'المكتبة منشورة؛ لا يظهر للعامة إلا الفرع والعنوان والنسخة المنشورة كلٌّ على حدة.'
    : 'المكتبة غير منشورة؛ لذلك لن تظهر أي فروع أو كتب منها في البحث العام.';
  if (!['owner','admin'].includes(currentRole)) {
    renderAutomationTasks();
    return;
  }
  publicationForm.hidden = false;
  sharingForm.hidden = false;
  sharingForm.elements.interlibrary_enabled.checked = Boolean(data.interlibrary_enabled);
  renderAutomationTasks();
}

function setSiteFooterStatus(text, kind = '') {
  const status = $('#siteFooterStatus');
  if (!status) return;
  status.textContent = text || '';
  status.className = `school-profile-status${kind ? ` ${kind}` : ''}`;
}
function updateSiteFooterPreview(value) {
  const preview = $('#siteFooterPreview');
  if (preview) preview.textContent = String(value ?? '');
}
async function loadSiteFooter() {
  const footer = $('#footerDescription');
  if (!footer) return false;
  const siteOwner = hasSiteFooterOwnership();
  const client = siteOwner && supabase ? supabase : publicSupabase;
  if (!client) {
    footer.textContent = DEFAULT_FOOTER_DESCRIPTION;
    return false;
  }
  const { data, error } = await client.from('site_settings')
    .select('setting_key,footer_description,updated_at')
    .eq('setting_key', SITE_FOOTER_SETTING_KEY).maybeSingle();
  if (error) {
    if (siteOwner) {
      const form = $('#siteFooterForm');
      if (form) {
        form.elements.footer_description.value = DEFAULT_FOOTER_DESCRIPTION;
        updateSiteFooterPreview(DEFAULT_FOOTER_DESCRIPTION);
      }
      setSiteFooterStatus('تعذّر تحميل وصف التذييل من التخزين الدائم؛ لم يُغيّر نص الزوار.', 'error');
    }
    return false;
  }
  const description = String(data?.footer_description || '').trim() || DEFAULT_FOOTER_DESCRIPTION;
  footer.textContent = description;
  if (siteOwner) {
    const form = $('#siteFooterForm');
    if (form) {
      form.elements.footer_description.value = description;
      updateSiteFooterPreview(description);
      setSiteFooterStatus('تم تحميل الوصف المحفوظ؛ يمكنك معاينته ثم حفظ التعديل.', 'success');
    }
  }
  return true;
}
$('#siteFooterForm').addEventListener('input', event => {
  if (event.target.name !== 'footer_description') return;
  updateSiteFooterPreview(event.target.value);
  setSiteFooterStatus('هذه معاينة فقط؛ لم يُحفظ التغيير بعد.');
});
$('#siteFooterForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!hasSiteFooterOwnership() || !supabase) return setSiteFooterStatus('تعديل وصف التذييل متاح لمالك الموقع فقط.', 'error');
  const form = event.currentTarget;
  const description = String(form.elements.footer_description.value || '').trim();
  if (!description || Array.from(description).length > 500) {
    return setSiteFooterStatus('اكتب وصفاً من حرف واحد إلى 500 حرف.', 'error');
  }
  const button = $('.site-footer-save', form);
  button.disabled = true;
  setSiteFooterStatus('جارٍ حفظ وصف التذييل…');
  try {
    const { data, error } = await supabase.from('site_settings')
      .update({ footer_description: description, updated_at: new Date().toISOString() })
      .eq('setting_key', SITE_FOOTER_SETTING_KEY)
      .select('footer_description,updated_at').maybeSingle();
    if (error || !data) throw error || new Error('footer_setting_missing');
    $('#footerDescription').textContent = data.footer_description;
    form.elements.footer_description.value = data.footer_description;
    updateSiteFooterPreview(data.footer_description);
    setSiteFooterStatus('تم حفظ الوصف بشكل دائم وتحديث النص الظاهر للزوار.', 'success');
  } catch {
    setSiteFooterStatus('تعذّر حفظ الوصف؛ بقي النص العام السابق كما هو. تحقق من اتصال المالك وصلاحيته.', 'error');
  } finally {
    button.disabled = false;
  }
});

const SITE_MEDIA_ASSET_COLUMNS = 'id,media_key,storage_path,original_file_name,mime_type,byte_size,alt_text,description,created_at';
const HEADER_GALLERY_SLOT_PATTERN = /^header-feature-image-(?:[6-9]|1[0-9]|2[0-5])$/;
const HEADER_GALLERY_MAX_PHOTOS = 25;
let siteMediaLoadGeneration = 0;
function setSiteMediaManagerStatus(text, kind = '') {
  const status = $('#siteMediaManagerStatus');
  if (!status) return;
  status.textContent = text || '';
  status.className = `school-profile-status site-media-manager-status${kind ? ` ${kind}` : ''}`;
}
function createMediaField(labelText, control) {
  const label = document.createElement('label');
  label.className = 'site-media-field';
  const caption = document.createElement('span');
  caption.textContent = labelText;
  label.append(caption, control);
  return label;
}
function safeMediaDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'short' }).format(date);
}
async function validateSiteMediaFile(file) {
  const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  if (!file || !allowedTypes.has(file.type) || file.size < 1 || file.size > SITE_MEDIA_MAX_BYTES) {
    throw new Error('اختر صورة PNG أو JPEG أو WebP لا يتجاوز حجمها 5 ميغابايت.');
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  const signatureMatches = file.type === 'image/png' ? png : file.type === 'image/jpeg' ? jpeg : webp;
  if (!signatureMatches) throw new Error('محتوى الملف لا يطابق صورة PNG أو JPEG أو WebP صالحة.');
  if (typeof createImageBitmap === 'function') {
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw new Error('تعذّر فك الصورة؛ اختر ملف صورة صالحاً.'); }
    finally { bitmap?.close?.(); }
  }
  return true;
}
function createSiteMediaCard(item, slot, currentAsset, mediaAssets, currentUrl) {
  const card = document.createElement('form');
  card.className = 'site-media-card';
  card.dataset.mediaKey = item.key;
  card.noValidate = true;

  const previewWrap = document.createElement('div');
  previewWrap.className = `site-media-card-preview${item.key === 'social-preview' ? ' is-wide' : ''}`;
  const preview = document.createElement('img');
  preview.loading = 'lazy';
  preview.decoding = 'async';
  preview.alt = currentAsset?.alt_text || item.defaultAlt;
  let temporaryPreviewUrl = '';
  const defaultPreviewUrl = new URL(item.defaultSrc, document.baseURI).href;
  preview.addEventListener('error', () => {
    if (preview.dataset.fallbackTried === 'true' || preview.src === defaultPreviewUrl) return;
    preview.dataset.fallbackTried = 'true';
    preview.src = defaultPreviewUrl;
  });
  const setPreview = (src, altText) => {
    if (temporaryPreviewUrl && !String(src).startsWith('blob:')) {
      URL.revokeObjectURL(temporaryPreviewUrl);
      temporaryPreviewUrl = '';
    }
    preview.dataset.fallbackTried = 'false';
    preview.alt = altText || item.defaultAlt;
    preview.src = src || item.defaultSrc;
  };
  setPreview(currentUrl || item.defaultSrc, currentAsset?.alt_text || item.defaultAlt);
  previewWrap.append(preview);

  const body = document.createElement('div');
  body.className = 'site-media-card-body';
  const title = document.createElement('h5');
  title.textContent = item.title;
  const usage = document.createElement('p');
  usage.className = 'site-media-use';
  usage.textContent = item.usage;
  const currentFile = document.createElement('p');
  currentFile.className = 'site-media-current-file';
  const currentLabel = document.createElement('strong');
  currentLabel.textContent = 'المستخدم الآن: ';
  const currentName = document.createElement('span');
  currentName.textContent = currentAsset?.original_file_name || 'الصورة الافتراضية في الموقع';
  currentFile.append(currentLabel, currentName);

  const choice = document.createElement('select');
  choice.name = 'asset_choice';
  choice.setAttribute('aria-label', `اختيار صورة محفوظة لـ ${item.title}`);
  const unchanged = document.createElement('option');
  unchanged.value = '__unchanged__';
  unchanged.textContent = 'اترك الصورة الحالية كما هي';
  choice.append(unchanged);
  const useDefault = document.createElement('option');
  useDefault.value = '__default__';
  useDefault.textContent = 'العودة للصورة الافتراضية (لا تحذف الملف)';
  choice.append(useDefault);
  for (const asset of mediaAssets) {
    if (asset.media_key !== item.key) continue;
    const option = document.createElement('option');
    option.value = asset.id;
    option.textContent = `${asset.original_file_name} · ${safeMediaDate(asset.created_at) || 'محفوظة'}`;
    choice.append(option);
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.name = 'new_file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.setAttribute('aria-label', `رفع صورة جديدة لـ ${item.title}`);
  const fileName = document.createElement('input');
  fileName.type = 'text';
  fileName.name = 'original_file_name';
  fileName.maxLength = 255;
  fileName.autocomplete = 'off';
  fileName.value = currentAsset?.original_file_name || '';
  fileName.setAttribute('aria-label', `اسم الملف المعروض لـ ${item.title}`);
  const description = document.createElement('input');
  description.type = 'text';
  description.name = 'description';
  description.maxLength = 500;
  description.autocomplete = 'off';
  description.value = currentAsset?.description || '';
  description.setAttribute('aria-label', `وصف الصورة لـ ${item.title}`);
  const altText = document.createElement('input');
  altText.type = 'text';
  altText.name = 'alt_text';
  altText.maxLength = 300;
  altText.required = true;
  altText.autocomplete = 'off';
  altText.value = currentAsset?.alt_text || item.defaultAlt;
  altText.setAttribute('aria-label', `النص البديل للصورة لـ ${item.title}`);

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className = 'button button-primary';
  saveButton.textContent = 'حفظ الصورة';
  const defaultButton = document.createElement('button');
  defaultButton.type = 'button';
  defaultButton.className = 'button button-outline';
  defaultButton.textContent = 'معاينة الافتراضية';
  const actions = document.createElement('div');
  actions.className = 'site-media-actions';
  actions.append(saveButton, defaultButton);
  if (item.isHeaderGalleryDynamic) {
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'button button-outline';
    removeButton.textContent = 'إزالة من الألبوم';
    removeButton.addEventListener('click', async () => {
      if (!hasSiteMediaOwnership() || !supabase || !window.confirm('إزالة هذه الصورة من ألبوم البنر؟ ستبقى النسخ المرفوعة في الأرشيف الخاص بالمالك.')) return;
      removeButton.disabled = true;
      status.textContent = 'جارٍ إزالة الصورة من العرض العام مع الاحتفاظ بنسخها…';
      status.className = 'site-media-status';
      try {
        const { data: deletedSlot, error } = await supabase.from('site_media_slots')
          .delete().eq('media_key', item.key).select('media_key').maybeSingle();
        if (error || !deletedSlot) throw new Error('تعذّرت إزالة الصورة؛ لم يتغير الألبوم.');
        window.dispatchEvent(new Event('site-media-updated'));
        await loadSiteMediaManager({ statusText: `أُزيلت ${item.title} من الألبوم، وبقيت الملفات محفوظة في أرشيف المالك.` });
      } catch (error) {
        status.textContent = error.message || 'تعذّرت إزالة الصورة؛ لم يتغير الألبوم.';
        status.className = 'site-media-status error';
      } finally {
        removeButton.disabled = false;
      }
    });
    actions.append(removeButton);
  }
  const status = document.createElement('p');
  status.className = 'site-media-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  choice.addEventListener('change', async () => {
    fileInput.value = '';
    if (choice.value === '__default__') {
      fileName.value = '';
      description.value = '';
      altText.value = item.defaultAlt;
      setPreview(item.defaultSrc, item.defaultAlt);
      status.textContent = 'معاينة الصورة الافتراضية فقط؛ احفظ لتطبيقها على الموقع.';
      status.className = 'site-media-status';
      return;
    }
    if (choice.value === '__unchanged__') {
      fileName.value = currentAsset?.original_file_name || '';
      description.value = currentAsset?.description || '';
      altText.value = currentAsset?.alt_text || item.defaultAlt;
      setPreview(currentUrl || item.defaultSrc, currentAsset?.alt_text || item.defaultAlt);
      status.textContent = 'لم يُحفظ أي تغيير بعد.';
      status.className = 'site-media-status';
      return;
    }
    const selectedAsset = mediaAssets.find(asset => asset.id === choice.value && asset.media_key === item.key);
    if (!selectedAsset) return;
    fileName.value = selectedAsset.original_file_name;
    description.value = selectedAsset.description || '';
    altText.value = selectedAsset.alt_text || item.defaultAlt;
    status.textContent = 'جارٍ تجهيز معاينة من الأرشيف الخاص…';
    try {
      const { data, error } = await supabase.storage.from(SITE_MEDIA_BUCKET).createSignedUrl(selectedAsset.storage_path, 3600);
      if (error || !data?.signedUrl) throw new Error('preview_failed');
      setPreview(data.signedUrl, selectedAsset.alt_text || item.defaultAlt);
      status.textContent = 'معاينة من نسخة محفوظة؛ لم تُنشر بعد.';
      status.className = 'site-media-status';
    } catch {
      setPreview(item.defaultSrc, item.defaultAlt);
      status.textContent = 'تعذّرت معاينة النسخة؛ بقيت الصورة المنشورة كما هي.';
      status.className = 'site-media-status error';
    }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = 'جارٍ التحقق من نوع الصورة وحجمها…';
    try {
      await validateSiteMediaFile(file);
      if (temporaryPreviewUrl) URL.revokeObjectURL(temporaryPreviewUrl);
      temporaryPreviewUrl = URL.createObjectURL(file);
      choice.value = '__unchanged__';
      fileName.value = file.name;
      setPreview(temporaryPreviewUrl, altText.value || item.defaultAlt);
      status.textContent = 'معاينة محلية فقط؛ لن تتغير صورة الزوار حتى يكتمل الرفع والحفظ.';
      status.className = 'site-media-status';
    } catch (error) {
      fileInput.value = '';
      setPreview(currentUrl || item.defaultSrc, currentAsset?.alt_text || item.defaultAlt);
      status.textContent = error.message || 'الملف غير مقبول.';
      status.className = 'site-media-status error';
    }
  });

  altText.addEventListener('input', () => {
    if (temporaryPreviewUrl) preview.alt = altText.value || item.defaultAlt;
  });
  defaultButton.addEventListener('click', () => {
    fileInput.value = '';
    if (temporaryPreviewUrl) {
      URL.revokeObjectURL(temporaryPreviewUrl);
      temporaryPreviewUrl = '';
    }
    choice.value = '__default__';
    choice.dispatchEvent(new Event('change'));
  });

  card.addEventListener('submit', async event => {
    event.preventDefault();
    if (!hasSiteMediaOwnership() || !supabase || !currentUserId) {
      status.textContent = 'هذه العملية متاحة لمالك/مدير المنصة المصرح فقط.';
      status.className = 'site-media-status error';
      return;
    }
    const newFile = fileInput.files?.[0] || null;
    const choiceValue = choice.value;
    const nextFileName = String(fileName.value || '').trim();
    const nextDescription = String(description.value || '').trim();
    const nextAltText = String(altText.value || '').trim();
    if (choiceValue !== '__default__' && (!nextAltText || Array.from(nextAltText).length > 300 || !/[\u0600-\u06FF]/.test(nextAltText))) {
      status.textContent = 'اكتب نصاً بديلاً عربياً واضحاً (يتضمن حروفاً عربية) لا يتجاوز 300 حرف.';
      status.className = 'site-media-status error';
      return;
    }
    if (nextDescription.length > 500 || (newFile || (choiceValue !== '__default__' && choiceValue !== '__unchanged__')) && (!nextFileName || nextFileName.length > 255)) {
      status.textContent = 'راجع اسم الملف والوصف؛ الاسم حتى 255 حرفاً والوصف حتى 500 حرف.';
      status.className = 'site-media-status error';
      return;
    }
    if (!newFile && choiceValue === '__unchanged__' && !slot.current_asset_id) {
      status.textContent = 'ارفع صورة أو اختر صورة محفوظة، أو اختر الرجوع إلى الصورة الافتراضية.';
      status.className = 'site-media-status error';
      return;
    }
    saveButton.disabled = true;
    defaultButton.disabled = true;
    status.textContent = 'جارٍ الحفظ بأمان؛ ستظل الصورة الحالية ظاهرة حتى اكتمال العملية…';
    status.className = 'site-media-status';
    try {
      let nextAssetId = null;
      if (choiceValue === '__default__' && !newFile) {
        nextAssetId = null;
      } else if (newFile) {
        await validateSiteMediaFile(newFile);
        const extension = newFile.type === 'image/jpeg' ? 'jpg' : newFile.type === 'image/webp' ? 'webp' : 'png';
        const storagePath = `media/${item.key}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(SITE_MEDIA_BUCKET).upload(storagePath, newFile, {
          cacheControl: '3600', upsert: false, contentType: newFile.type,
        });
        if (uploadError) throw new Error('تعذّر رفع الصورة؛ بقيت الصورة الحالية ظاهرة.');
        const { data: uploadedAsset, error: assetError } = await supabase.from('site_media_assets').insert({
          media_key: item.key,
          storage_path: storagePath,
          original_file_name: nextFileName,
          mime_type: newFile.type,
          byte_size: newFile.size,
          alt_text: nextAltText,
          description: nextDescription,
          uploaded_by: currentUserId,
        }).select(SITE_MEDIA_ASSET_COLUMNS).single();
        if (assetError || !uploadedAsset) throw new Error('تعذّر حفظ بيانات الصورة؛ بقيت الصورة السابقة مستخدمة ولم يُحذف الملف المرفوع.');
        nextAssetId = uploadedAsset.id;
      } else if (choiceValue === '__unchanged__') {
        nextAssetId = slot.current_asset_id;
      } else {
        const selectedAsset = mediaAssets.find(asset => asset.id === choiceValue && asset.media_key === item.key);
        if (!selectedAsset) throw new Error('الصورة المختارة غير متاحة لهذا الموضع.');
        nextAssetId = selectedAsset.id;
      }

      if (nextAssetId) {
        const { data: updatedAsset, error: metadataError } = await supabase.from('site_media_assets')
          .update({ original_file_name: nextFileName, description: nextDescription, alt_text: nextAltText })
          .eq('id', nextAssetId).eq('media_key', item.key)
          .select('id').maybeSingle();
        if (metadataError || !updatedAsset) throw new Error('تعذّر حفظ الوصف أو النص البديل؛ الصورة الحالية لم تتغير.');
      }

      const { data: updatedSlot, error: slotError } = await supabase.from('site_media_slots')
        .update({ current_asset_id: nextAssetId, updated_at: new Date().toISOString() })
        .eq('media_key', item.key).select('media_key,current_asset_id').maybeSingle();
      if (slotError || !updatedSlot) throw new Error('تعذّر تفعيل الصورة؛ ظلت الصورة الحالية كما هي، ولم تُحذف النسخ المحفوظة.');
      window.dispatchEvent(new Event('site-media-updated'));
      await loadSiteMediaManager({ statusText: choiceValue === '__default__' && !newFile
        ? `عاد ${item.title} إلى الأصل الافتراضي؛ الملف السابق محفوظ ويمكن اختياره مجدداً.`
        : `تم حفظ ${item.title} وتحديث معاينته للزوار.` });
    } catch (error) {
      status.textContent = error.message || 'تعذّر الحفظ؛ الصورة القديمة ما زالت هي المعروضة للزوار.';
      status.className = 'site-media-status error';
      setSiteMediaManagerStatus('لم يتغير موضع الصورة المنشور؛ تحقق من الاتصال وصلاحية الحساب ثم أعد المحاولة.', 'error');
    } finally {
      saveButton.disabled = false;
      defaultButton.disabled = false;
    }
  });

  body.append(
    title,
    usage,
    currentFile,
    createMediaField('اختيار صورة محفوظة أو الرجوع للأصل', choice),
    createMediaField('رفع صورة جديدة (PNG/JPEG/WebP)', fileInput),
    createMediaField('اسم الملف للعرض', fileName),
    createMediaField('وصف الصورة', description),
    createMediaField('النص البديل بالعربية', altText),
    actions,
  );
  card.append(previewWrap, body, status);
  return card;
}

async function addHeaderGalleryPhoto() {
  const button = $('#addHeaderGalleryPhoto');
  if (!button || !hasSiteMediaOwnership() || !supabase) {
    setSiteMediaManagerStatus('إضافة صور الألبوم متاحة لمالك/مدير المنصة المصرح فقط.', 'error');
    return;
  }
  button.disabled = true;
  setSiteMediaManagerStatus('جارٍ تجهيز موضع جديد في ألبوم البنر…');
  try {
    const { data: slots, error: slotsError } = await supabase.from('site_media_slots')
      .select('media_key').like('media_key', 'header-feature-image-%').limit(100);
    if (slotsError || !slots) throw new Error('تعذّر قراءة عناصر الألبوم الحالي.');
    const usedKeys = new Set(slots.map(slot => slot.media_key));
    const nextNumber = Array.from({ length: HEADER_GALLERY_MAX_PHOTOS - 5 }, (_, index) => index + 6)
      .find(number => !usedKeys.has(`header-feature-image-${number}`));
    if (!nextNumber) throw new Error(`اكتمل الحد الأقصى للألبوم (${HEADER_GALLERY_MAX_PHOTOS} صورة). أزل صورة غير مستخدمة لإضافة أخرى.`);
    const key = `header-feature-image-${nextNumber}`;
    const { data: newSlot, error } = await supabase.from('site_media_slots').insert({
      media_key: key,
      title: `صورة الألبوم ${nextNumber}`,
      usage_description: 'صورة إضافية في ألبوم البنر؛ ارفعها أو اختر نسخة محفوظة لعرضها للزوار.',
      is_published: true,
    }).select('media_key').maybeSingle();
    if (error || !newSlot) throw new Error('تعذّر إضافة صورة إلى الألبوم. تحقق من صلاحية المالك والاتصال.');
    await loadSiteMediaManager({ statusText: `أُضيف موضع «صورة الألبوم ${nextNumber}». ارفع الصورة من البطاقة الجديدة لحفظها وعرضها.` });
  } catch (error) {
    setSiteMediaManagerStatus(error.message || 'تعذّرت إضافة صورة إلى الألبوم.', 'error');
  } finally {
    button.disabled = false;
  }
}

$('#addHeaderGalleryPhoto')?.addEventListener('click', addHeaderGalleryPhoto);

$('#headerGallerySettingsForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const status = $('#headerGallerySettingsStatus');
  const button = $('#saveHeaderGallerySettings');
  const intervalSeconds = Number($('#headerGalleryInterval')?.value);
  if (!hasSiteMediaOwnership() || !supabase) {
    if (status) status.textContent = 'حفظ إعدادات الألبوم متاح لمالك/مدير المنصة المصرح فقط.';
    return;
  }
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 2 || intervalSeconds > 30) {
    if (status) status.textContent = 'اختر مدة بين ثانيتين و30 ثانية.';
    return;
  }
  if (button) button.disabled = true;
  if (status) { status.textContent = 'جارٍ حفظ مدة العرض…'; status.className = 'site-media-status'; }
  try {
    const { data, error } = await supabase.from('site_banner_settings')
      .update({ interval_seconds: intervalSeconds, updated_at: new Date().toISOString() })
      .eq('setting_key', 'homepage').select('interval_seconds').maybeSingle();
    if (error || !data) throw new Error('تعذّر حفظ مدة عرض الصور. لم يتغير الإعداد المنشور.');
    window.dispatchEvent(new CustomEvent('header-gallery-updated', { detail: { intervalSeconds } }));
    if (status) { status.textContent = `تم حفظ مدة عرض كل صورة: ${intervalSeconds} ثانية.`; status.className = 'site-media-status success'; }
  } catch (error) {
    if (status) { status.textContent = error.message || 'تعذّر حفظ مدة عرض الصور.'; status.className = 'site-media-status error'; }
  } finally {
    if (button) button.disabled = false;
  }
});

async function loadSiteMediaManager({ statusText = '' } = {}) {
  if (!hasSiteMediaOwnership() || !supabase) return false;
  const generation = ++siteMediaLoadGeneration;
  const container = $('#siteMediaList');
  setSiteMediaManagerStatus(statusText || 'جارٍ تحميل صور الموقع والنسخ المحفوظة…');
  try {
    const [
      { data: slots, error: slotError },
      { data: mediaAssets, error: assetsError },
      { data: bannerSettings, error: settingsError },
    ] = await Promise.all([
      supabase.from('site_media_slots').select('media_key,title,usage_description,current_asset_id,is_published,updated_at').order('media_key').limit(100),
      supabase.from('site_media_assets').select(SITE_MEDIA_ASSET_COLUMNS).order('created_at', { ascending: false }).limit(500),
      supabase.from('site_banner_settings').select('interval_seconds').eq('setting_key', 'homepage').maybeSingle(),
    ]);
    if (generation !== siteMediaLoadGeneration) return false;
    if (slotError || assetsError || settingsError || !slots || !mediaAssets || !bannerSettings) throw new Error('تعذّر تحميل سجل الصور أو إعداد مدة العرض وصلاحياتهما.');
    const intervalControl = $('#headerGalleryInterval');
    if (intervalControl) intervalControl.value = String(bannerSettings.interval_seconds);
    let allMediaAssets = mediaAssets;
    const missingCurrentIds = slots.map(slot => slot.current_asset_id).filter(Boolean)
      .filter(id => !allMediaAssets.some(asset => asset.id === id));
    if (missingCurrentIds.length) {
      const { data: currentRecords, error: currentError } = await supabase.from('site_media_assets')
        .select(SITE_MEDIA_ASSET_COLUMNS).in('id', missingCurrentIds);
      if (currentError || !currentRecords) throw new Error('تعذّر تحميل الصور المستخدمة حالياً.');
      allMediaAssets = [...allMediaAssets, ...currentRecords];
    }
    const slotByKey = new Map(slots.map(slot => [slot.media_key, slot]));
    const assetById = new Map(allMediaAssets.map(asset => [asset.id, asset]));
    const currentAssets = slots.map(slot => assetById.get(slot.current_asset_id)).filter(Boolean);
    const currentUrls = new Map();
    if (currentAssets.length) {
      const { data: signed, error } = await supabase.storage.from(SITE_MEDIA_BUCKET)
        .createSignedUrls(currentAssets.map(asset => asset.storage_path), 3600);
      if (!error && signed) {
        for (const item of signed) if (item.path && item.signedUrl && !item.error) currentUrls.set(item.path, item.signedUrl);
      }
    }
    if (generation !== siteMediaLoadGeneration) return false;
    container.replaceChildren();
    const groups = new Map();
    const albumItems = slots.filter(slot => HEADER_GALLERY_SLOT_PATTERN.test(slot.media_key))
      .sort((a, b) => Number(a.media_key.match(/(\d+)$/)?.[1]) - Number(b.media_key.match(/(\d+)$/)?.[1]))
      .map(slot => ({
        key: slot.media_key,
        category: 'ألبوم صور البنر',
        title: slot.title,
        usage: slot.usage_description,
        defaultSrc: 'assets/header-photo-placeholder.svg',
        defaultAlt: slot.title,
        selectors: [],
        isHeaderGalleryDynamic: true,
      }));
    for (const item of [...SITE_MEDIA_ITEMS, ...albumItems]) {
      if (!groups.has(item.category)) {
        const group = document.createElement('section');
        group.className = 'site-media-category';
        const heading = document.createElement('h4');
        heading.textContent = item.category;
        const grid = document.createElement('div');
        grid.className = 'site-media-grid';
        group.append(heading, grid);
        groups.set(item.category, { group, grid });
        container.append(group);
      }
      const slot = slotByKey.get(item.key);
      if (!slot) continue;
      const currentAsset = assetById.get(slot.current_asset_id) || null;
      const signedUrl = currentAsset ? currentUrls.get(currentAsset.storage_path) || '' : '';
      groups.get(item.category).grid.append(createSiteMediaCard(
        item, slot, currentAsset, allMediaAssets, signedUrl,
      ));
    }
    if (statusText) setSiteMediaManagerStatus(statusText, 'success');
    else setSiteMediaManagerStatus(`تم تحميل ${SITE_MEDIA_ITEMS.length + albumItems.length} موضع صورة؛ ${allMediaAssets.length} نسخة محفوظة قابلة لإعادة الاختيار.`, 'success');
    return true;
  } catch {
    if (generation === siteMediaLoadGeneration) setSiteMediaManagerStatus('تعذّر تحميل مكتبة الصور. لم تُغيّر الصور العامة؛ أعد المحاولة بعد التحقق من الاتصال والصلاحية.', 'error');
    return false;
  }
}

const SCHOOL_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const SCHOOL_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SCHOOL_BRANDING_FIELDS = [
  { key: 'principal_photo_path', fileName: 'principal_photo', removeName: 'remove_principal_photo', kind: 'principal-photo', preview: 'principalPhoto' },
  { key: 'school_logo_path', fileName: 'school_logo', removeName: 'remove_school_logo', kind: 'school-logo', preview: 'schoolLogo' },
  { key: 'governorate_logo_path', fileName: 'governorate_logo', removeName: 'remove_governorate_logo', kind: 'governorate-logo', preview: 'governorateLogo' },
];
function setSchoolProfileStatus(text, kind = '') {
  const status = $('#schoolProfileStatus');
  if (!status) return;
  status.textContent = text || '';
  status.className = `school-profile-status${kind ? ` ${kind}` : ''}`;
}
function renderSchoolLogoPreview(field, path, caption = 'الصورة الحالية') {
  const preview = $(`#${field.preview}Preview`);
  const image = $(`#${field.preview}Image`);
  const label = $(`#${field.preview}Caption`);
  if (!preview || !image || !label) return;
  const url = path ? supabase.storage.from('school-branding').getPublicUrl(path).data?.publicUrl : '';
  preview.hidden = !url;
  if (url) image.src = url;
  else image.removeAttribute('src');
  label.textContent = url ? caption : '';
}
async function uploadSchoolLogo(field, file, libraryId = currentLibraryId) {
  if (!SCHOOL_LOGO_TYPES.has(file.type) || file.size > SCHOOL_LOGO_MAX_BYTES) {
    throw new Error('المسموح PNG أو JPG أو WebP حتى 2 ميغابايت.');
  }
  const path = `${libraryId}/${field.kind}-${crypto.randomUUID()}`;
  const { error } = await supabase.storage.from('school-branding').upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: file.type,
  });
  if (error) throw error;
  return path;
}
async function loadSchoolProfile() {
  if (!currentLibraryId || currentRole !== 'owner') return;
  const form = $('#schoolProfileForm');
  const loadingLibraryId = currentLibraryId;
  const generation = ++schoolProfileLoadGeneration;
  schoolProfileLoadedId = null;
  currentLibraryProfile = null;
  $('#schoolProfileFields').disabled = true;
  form.setAttribute('aria-busy', 'true');
  form.hidden = false;
  form.reset();
  for (const field of SCHOOL_BRANDING_FIELDS) {
    form.elements[field.fileName].value = '';
    form.elements[field.removeName].checked = false;
    renderSchoolLogoPreview(field, null);
  }
  const selectedOption = $('#librarySelect').selectedOptions[0];
  $('#schoolProfileLibraryContext').textContent = `الملف المحدد: ${selectedOption?.textContent || 'المدرسة الحالية'}؛ اسم المدير وصورته والوكلاء محفوظون لهذا الملف فقط.`;
  setSchoolProfileStatus('جارٍ تحميل بيانات المدرسة…');
  const { data, error } = await supabase.from('library_profiles')
    .select('library_id,school_name,educational_administration,librarian_name,school_logo_path,governorate_logo_path,principal_photo_path,principal_name,deputy_names,general_supervisor_name,first_supervisor_name,is_public,show_school_name_on_homepage,updated_at')
    .eq('library_id', loadingLibraryId).maybeSingle();
  if (generation !== schoolProfileLoadGeneration || currentLibraryId !== loadingLibraryId || currentRole !== 'owner') return;
  form.setAttribute('aria-busy', 'false');
  if (error) {
    currentLibraryProfile = null;
    form.hidden = true;
    return setSchoolProfileStatus('تعذّر تحميل ملف المدرسة. تحقق من اتصال الخدمة وصلاحية المالك.', 'error');
  }
  currentLibraryProfile = data || null;
  if (data) {
    currentLibraryProfileChoices.set(data.library_id, data);
    form.elements.school_name.value = data.school_name || '';
    form.elements.educational_administration.value = data.educational_administration || '';
    form.elements.librarian_name.value = data.librarian_name || '';
    form.elements.principal_name.value = data.principal_name || '';
    form.elements.deputy_names.value = data.deputy_names || '';
    form.elements.general_supervisor_name.value = data.general_supervisor_name || '';
    form.elements.first_supervisor_name.value = data.first_supervisor_name || '';
    form.elements.is_public.checked = Boolean(data.is_public);
  } else {
    form.reset();
  }
  for (const field of SCHOOL_BRANDING_FIELDS) {
    form.elements[field.fileName].value = '';
    form.elements[field.removeName].checked = false;
    renderSchoolLogoPreview(field, data?.[field.key] || null);
  }
  schoolProfileLoadedId = loadingLibraryId;
  $('#schoolProfileFields').disabled = schoolProfileSaving;
  const refreshedOption = data ? updateLibraryProfileChoice(data) : selectedOption;
  $('#schoolProfileLibraryContext').textContent = `الملف المحدد: ${refreshedOption?.textContent || data?.school_name || 'المدرسة الحالية'}؛ اسم المدير وصورته والوكلاء محفوظون لهذا الملف فقط.`;
  setSchoolProfileStatus(data
    ? 'البيانات المحفوظة تخص هذه المدرسة فقط. يظهر الملف عند تفعيل خيار العرض العام؛ نشر الكتب والفروع مستقل.'
    : 'لا يوجد ملف مدرسي بعد؛ اكتب الاسم الرسمي والبيانات التي تريد حفظها. لا توجد بيانات مفترضة.');
}
$('#schoolProfileForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (currentRole !== 'owner') return setSchoolProfileStatus('تعديل بيانات المدرسة متاح للمالك فقط.', 'error');
  const form = event.currentTarget;
  if (schoolProfileSaving || schoolProfileLoadedId !== currentLibraryId || !currentLibraryId || (currentLibraryProfile && currentLibraryProfile.library_id !== currentLibraryId)) {
    return setSchoolProfileStatus('انتظر اكتمال تحميل المدرسة المختارة قبل الحفظ.', 'error');
  }
  const fields = new FormData(form);
  const schoolName = String(fields.get('school_name') || '').trim();
  if (schoolName.length < 2 || schoolName.length > 160) return setSchoolProfileStatus('أدخل اسم المدرسة الرسمي، من حرفين إلى 160 حرفاً.', 'error');
  const button = $('.school-profile-action', form);
  const savingLibraryId = currentLibraryId;
  const savingProfile = currentLibraryProfile;
  if (form.elements.principal_photo.files?.length && !String(fields.get('principal_name') || '').trim()) {
    return setSchoolProfileStatus('اكتب اسم مدير المدرسة قبل إضافة صورته.', 'error');
  }
  schoolProfileSaving = true;
  button.disabled = true;
  $('#schoolProfileFields').disabled = true;
  $('#librarySelect').disabled = true;
  syncSchoolProfilePicker();
  try {
    const logoPaths = {};
    for (const field of SCHOOL_BRANDING_FIELDS) {
      const file = fields.get(field.fileName);
      if (file?.size) {
        logoPaths[field.key] = await uploadSchoolLogo(field, file, savingLibraryId);
      } else if (fields.get(field.removeName) === 'on') {
        logoPaths[field.key] = null;
      } else {
        logoPaths[field.key] = savingProfile?.[field.key] || null;
      }
    }
    const payload = {
      library_id: savingLibraryId,
      school_name: schoolName,
      educational_administration: String(fields.get('educational_administration') || '').trim() || null,
      librarian_name: String(fields.get('librarian_name') || '').trim() || null,
      principal_name: String(fields.get('principal_name') || '').trim() || null,
      deputy_names: String(fields.get('deputy_names') || '').trim() || null,
      general_supervisor_name: String(fields.get('general_supervisor_name') || '').trim() || null,
      first_supervisor_name: String(fields.get('first_supervisor_name') || '').trim() || null,
      principal_photo_path: logoPaths.principal_photo_path,
      school_logo_path: logoPaths.school_logo_path,
      governorate_logo_path: logoPaths.governorate_logo_path,
      is_public: fields.get('is_public') === 'on',
      show_school_name_on_homepage: savingProfile?.show_school_name_on_homepage !== false,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('library_profiles').upsert(payload, { onConflict: 'library_id' })
      .select('library_id,school_name,educational_administration,librarian_name,school_logo_path,governorate_logo_path,principal_photo_path,principal_name,deputy_names,general_supervisor_name,first_supervisor_name,is_public,show_school_name_on_homepage,updated_at').single();
    if (error || !data) throw error || new Error('save_failed');
    if (currentLibraryId !== savingLibraryId) {
      await loadPublicBranches().catch(() => {});
      return;
    }
    currentLibraryProfile = data;
    const option = updateLibraryProfileChoice(data);
    $('#workspaceTitle').textContent = option?.textContent || data.school_name;
    $('#schoolProfileLibraryContext').textContent = `الملف المحدد: ${option?.textContent || data.school_name}؛ اسم المدير وصورته والوكلاء محفوظون لهذا الملف فقط.`;
    for (const field of SCHOOL_BRANDING_FIELDS) {
      form.elements[field.fileName].value = '';
      form.elements[field.removeName].checked = false;
      renderSchoolLogoPreview(field, data[field.key] || null);
    }
    setSchoolProfileStatus('تم حفظ بيانات هذه المدرسة فقط. إعداد النشر العام لم يتغير.', 'success');
    await loadPublicBranches().catch(() => {});
  } catch (error) {
    setSchoolProfileStatus(error?.message?.includes('2 ميغابايت')
      ? error.message
      : 'تعذّر حفظ البيانات أو رفع إحدى الصور. لم تُغيّر حالة نشر المكتبة؛ تحقق من الحقول والاتصال ثم أعد المحاولة.', 'error');
  } finally {
    schoolProfileSaving = false;
    button.disabled = false;
    $('#schoolProfileFields').disabled = schoolProfileLoadedId !== currentLibraryId;
    $('#librarySelect').disabled = librarySwitchInProgress;
    syncSchoolProfilePicker();
  }
});
function formSchoolImageInput(field) {
  return $('#schoolProfileForm').elements[field.fileName];
}
for (const field of SCHOOL_BRANDING_FIELDS) {
  const input = formSchoolImageInput(field);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!SCHOOL_LOGO_TYPES.has(file.type) || file.size > SCHOOL_LOGO_MAX_BYTES) {
      input.value = '';
      return setSchoolProfileStatus('المسموح صورة PNG أو JPG أو WebP، بحجم لا يتجاوز 2 ميغابايت.', 'error');
    }
    const image = $(`#${field.preview}Image`);
    const label = $(`#${field.preview}Caption`);
    image.src = URL.createObjectURL(file);
    label.textContent = `معاينة قبل الرفع: ${file.name}`;
    $(`#${field.preview}Preview`).hidden = false;
  });
}
$('#createSchoolForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (currentRole !== 'owner') return;
  const form = event.currentTarget;
  const status = $('#createSchoolStatus');
  const button = $('.school-profile-action', form);
  const fields = new FormData(form);
  const schoolName = String(fields.get('school_name') || '').trim();
  if (schoolName.length < 2) {
    status.textContent = 'اكتب الاسم الرسمي للمدرسة الجديدة.';
    status.className = 'school-profile-status error';
    return;
  }
  button.disabled = true;
  status.textContent = 'جارٍ إنشاء سجل مستقل غير منشور…';
  status.className = 'school-profile-status';
  let data, error;
  try {
    ({ data, error } = await supabase.rpc('create_owned_school', {
      p_school_name: schoolName,
      p_educational_administration: String(fields.get('educational_administration') || '').trim() || null,
      p_librarian_name: String(fields.get('librarian_name') || '').trim() || null,
    }));
  } catch {
    button.disabled = false;
    status.textContent = 'تعذّر الاتصال بخدمة إنشاء المدرسة. لم نؤكد إنشاء سجل؛ أعد تحميل الصفحة قبل المحاولة مجددًا.';
    status.className = 'school-profile-status error';
    return;
  }
  button.disabled = false;
  if (error || !data) {
    status.textContent = 'تعذّر إنشاء المدرسة. تأكد من صلاحية المالك واتصال الخدمة، ثم أعد المحاولة.';
    status.className = 'school-profile-status error';
    return;
  }
  form.reset();
  status.textContent = 'أُنشئ ملف المدرسة كمدرسة منفصلة وغير منشورة. جارٍ فتحه لإضافة الشعارات أو تعديل بياناته.';
  status.className = 'school-profile-status success';
  $('#createSchoolDetails').open = false;
  await loadMemberships(data);
});
const SCHOOL_DELETION_IMPACT_LABELS = [
  ['libraries', 'سجل المدرسة'],
  ['library_profiles', 'ملف المدرسة وبياناته'],
  ['library_memberships', 'عضويات الوصول (حسابات الدخول نفسها لا تُحذف)'],
  ['branches', 'الفروع'],
  ['catalog_titles', 'عناوين الكتب'],
  ['holdings', 'نسخ الكتب'],
  ['inventory_checks', 'سجلات الجرد'],
  ['patrons', 'سجلات المستعيرين'],
  ['loans', 'سجلات الإعارة'],
  ['reservations', 'الحجوزات'],
  ['visitors', 'سجلات الزوار'],
  ['interlibrary_requests', 'طلبات بين المكتبات المرتبطة بالمدرسة'],
  ['incoming_external_requests', 'طلبات واردة من مكتبات أخرى (تمنع الحذف)'],
  ['audit_log', 'سجلات التدقيق المرتبطة (ستُحذف)'],
  ['storage_files', 'ملفات شعارات المدرسة'],
  ['remaining_owned_libraries', 'مكتبات أخرى ستبقى لك بصفة المالك'],
];
let pendingSchoolDeletion = null;
$('#ownedSchoolActionSelect').addEventListener('change', () => {
  if (pendingSchoolDeletion) return;
  $('#schoolDeletionPreview').hidden = true;
  $('#confirmSchoolDeletionCheck').checked = false;
  $('#confirmDeleteOwnedSchool').disabled = true;
  $('#deleteOwnedSchoolStatus').textContent = '';
  updateOwnedSchoolActionControls();
});
async function setSchoolHomepageNameVisibility(visible) {
  const select = $('#ownedSchoolActionSelect');
  const libraryId = select.value;
  const membership = activeOwnedSchoolMembership(libraryId);
  const profile = currentLibraryProfileChoices.get(libraryId);
  if (!canDeleteOwnedSchool(membership?.role, libraryId)) return;
  if (!profile) {
    $('#deleteOwnedSchoolStatus').textContent = 'لا يوجد ملف مدرسة لهذا الاختيار؛ لم يتغير شيء. أنشئ ملف المدرسة أولًا إذا أردت إدارة ظهور الاسم.';
    return;
  }
  const schoolName = profile.school_name || 'المدرسة المحددة';
  const toggleButton = $('#toggleHomepageSchoolName');
  const deleteButton = $('#previewOwnedSchoolDeletion');
  const status = $('#deleteOwnedSchoolStatus');
  select.disabled = true;
  toggleButton.disabled = true;
  deleteButton.disabled = true;
  status.className = 'school-profile-status';
  status.textContent = visible ? 'جارٍ إظهار اسم المدرسة في الشريط…' : 'جارٍ إزالة اسم المدرسة من الشريط فقط…';
  try {
    const { data, error } = await supabase.from('library_profiles')
      .update({ show_school_name_on_homepage: visible, updated_at: new Date().toISOString() })
      .eq('library_id', libraryId)
      .select('library_id,school_name,is_public,show_school_name_on_homepage,updated_at')
      .single();
    if (error || !data) throw error || new Error('save_failed');
    const updatedProfile = { ...profile, ...data };
    currentLibraryProfileChoices.set(libraryId, updatedProfile);
    if (currentLibraryId === libraryId) currentLibraryProfile = { ...currentLibraryProfile, ...data };
    updateLibraryProfileChoice(updatedProfile);
    status.className = 'school-profile-status success';
    status.textContent = visible
      ? `أُظهر اسم «${schoolName}» بجوار شعار مصر.`
      : `أُزيل اسم «${schoolName}» من الصفحة الرئيسية فقط؛ بقي ملف المدرسة والدليل والشعارات والبيانات كما هي.`;
    await loadPublicBranches().catch(() => {});
  } catch {
    status.className = 'school-profile-status error';
    status.textContent = 'تعذّر تحديث إعداد ظهور الاسم. حدّث الصفحة للتحقق؛ لم يُنفّذ حذف للمدرسة.';
  } finally {
    select.disabled = false;
    updateOwnedSchoolActionControls();
  }
}
$('#toggleHomepageSchoolName').addEventListener('click', () => {
  const profile = currentLibraryProfileChoices.get($('#ownedSchoolActionSelect').value);
  if (!profile) return;
  void setSchoolHomepageNameVisibility(!shouldShowSchoolNameOnHomepage(profile));
});
async function listSchoolBrandingFiles(libraryId) {
  const bucket = supabase.storage.from('school-branding');
  const paths = [];
  async function visit(folder, depth = 0) {
    if (depth > 5) throw new Error('school_branding_list_failed');
    for (let offset = 0; offset < 10000; offset += 100) {
      const { data, error } = await bucket.list(folder, { limit: 100, offset });
      if (error) throw new Error('school_branding_list_failed');
      const page = Array.isArray(data) ? data : [];
      for (const item of page) {
        if (!item?.name) continue;
        if (item.id) paths.push(`${folder}/${item.name}`);
        else await visit(`${folder}/${item.name}`, depth + 1);
      }
      if (page.length < 100) return;
    }
    throw new Error('school_branding_list_failed');
  }
  await visit(libraryId);
  return paths;
}
function renderSchoolDeletionPreview(preview, files) {
  const counts = { ...preview.counts, storage_files: files.length };
  const list = $('#schoolDeletionImpactList');
  list.replaceChildren();
  const formatter = new Intl.NumberFormat('ar-EG');
  for (const [key, label] of SCHOOL_DELETION_IMPACT_LABELS) {
    const row = document.createElement('li');
    const name = document.createElement('span');
    const count = document.createElement('strong');
    name.textContent = label;
    count.textContent = formatter.format(Number(counts[key] || 0));
    row.append(name, count);
    list.append(row);
  }

  const incomingRequests = Number(counts.incoming_external_requests || 0);
  const remainingLibraries = Number(counts.remaining_owned_libraries || 0);
  const isLastSiteOwnerLibrary = SITE_OWNER_LIBRARY_IDS.has(preview.library_id)
    && !currentMemberships.some(membership => membership.status === 'active'
      && membership.role === 'owner' && SITE_OWNER_LIBRARY_IDS.has(membership.library_id)
      && membership.library_id !== preview.library_id);
  const blockers = [];
  const notices = [];
  if (incomingRequests > 0) blockers.push('توجد طلبات واردة من مكتبات أخرى؛ يجب أن يعالجها أصحابها قبل الحذف.');
  if (remainingLibraries < 1) blockers.push('يجب أن تبقى لك مكتبة نشطة واحدة على الأقل بصفة المالك.');
  if (isLastSiteOwnerLibrary) notices.push('تنبيه: حذف آخر مكتبة أساسية سيعطّل صلاحيات إدارة محتوى الموقع العام مثل التذييل والصور والإحصاءات.');
  if (!blockers.length) notices.push('راجع الأعداد أعلاه، ثم فعّل مربع الإقرار لتأكيد الحذف النهائي.');
  $('#schoolDeletionImpactNotice').textContent = [...blockers, ...notices].join(' ');
  $('#schoolDeletionSchoolName').textContent = preview.school_name || 'المدرسة المحددة';

  const checkbox = $('#confirmSchoolDeletionCheck');
  checkbox.checked = false;
  checkbox.disabled = blockers.length > 0;
  $('#confirmDeleteOwnedSchool').disabled = true;
  $('#schoolDeletionPreview').hidden = false;
  pendingSchoolDeletion = {
    libraryId: preview.library_id,
    counts: preview.counts,
    files,
    blocked: blockers.length > 0,
  };
}
$('#previewOwnedSchoolDeletion').addEventListener('click', async () => {
  const libraryId = $('#ownedSchoolActionSelect').value;
  const membership = activeOwnedSchoolMembership(libraryId);
  if (!canDeleteOwnedSchool(membership?.role, libraryId)) return;
  const button = $('#previewOwnedSchoolDeletion');
  button.disabled = true;
  $('#librarySelect').disabled = true;
  $('#ownedSchoolActionSelect').disabled = true;
  $('#toggleHomepageSchoolName').disabled = true;
  $('#schoolDeletionPreview').hidden = true;
  pendingSchoolDeletion = null;
  $('#deleteOwnedSchoolStatus').textContent = 'جارٍ جمع أعداد السجلات وملفات المدرسة…';
  try {
    const { data, error } = await supabase.rpc('preview_owned_school_deletion', { p_library_id: libraryId });
    if (error) throw error;
    if (!data?.counts || data.library_id !== libraryId) throw new Error('school_not_found');
    const files = await listSchoolBrandingFiles(libraryId);
    if (files.length !== Number(data.storage_files || 0)) throw new Error('school_storage_count_mismatch');
    const selectedOption = $('#ownedSchoolActionSelect').selectedOptions[0];
    const selectedProfile = currentLibraryProfileChoices.get(libraryId);
    const displayedSchoolName = selectedProfile?.school_name || selectedOption?.dataset.schoolName || data.school_name || selectedOption?.dataset.libraryName;
    renderSchoolDeletionPreview({ ...data, school_name: displayedSchoolName }, files);
    $('#deleteOwnedSchoolStatus').textContent = 'اكتملت المعاينة. لم يُحذف أي سجل؛ أكّد فقط إذا وافقت على الأثر المعروض.';
  } catch (error) {
    $('#deleteOwnedSchoolStatus').textContent = schoolDeletionErrorMessage(error?.message);
    $('#librarySelect').disabled = false;
    $('#ownedSchoolActionSelect').disabled = false;
    updateOwnedSchoolActionControls();
  } finally {
    button.disabled = false;
  }
});
$('#confirmSchoolDeletionCheck').addEventListener('change', event => {
  $('#confirmDeleteOwnedSchool').disabled = !pendingSchoolDeletion
    || pendingSchoolDeletion.blocked || !event.currentTarget.checked;
});
$('#cancelSchoolDeletion').addEventListener('click', () => {
  pendingSchoolDeletion = null;
  $('#schoolDeletionPreview').hidden = true;
  $('#confirmSchoolDeletionCheck').checked = false;
  $('#librarySelect').disabled = false;
  $('#ownedSchoolActionSelect').disabled = false;
  updateOwnedSchoolActionControls();
  $('#deleteOwnedSchoolStatus').textContent = 'أُلغيت المعاينة؛ لم يُحذف أي شيء.';
});
async function removeSchoolBrandingFiles(paths) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await supabase.storage.from('school-branding').remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}
$('#confirmDeleteOwnedSchool').addEventListener('click', async () => {
  const pending = pendingSchoolDeletion;
  if (!pending || pending.blocked || !$('#confirmSchoolDeletionCheck').checked) return;
  const confirmButton = $('#confirmDeleteOwnedSchool');
  const previewButton = $('#previewOwnedSchoolDeletion');
  confirmButton.disabled = true;
  previewButton.disabled = true;
  $('#ownedSchoolActionSelect').disabled = true;
  $('#toggleHomepageSchoolName').disabled = true;
  let storageAttempted = false;
  let storageComplete = false;
  let deletionCompleted = false;
  $('#deleteOwnedSchoolStatus').textContent = 'جارٍ حذف الملفات ثم السجلات التي راجعت أثرها…';
  try {
    if (pending.files.length) {
      storageAttempted = true;
      await removeSchoolBrandingFiles(pending.files);
      storageComplete = true;
    }
    const { error } = await supabase.rpc('delete_owned_school', {
      p_library_id: pending.libraryId,
      p_expected_counts: pending.counts,
    });
    if (error) throw error;
    deletionCompleted = true;
    currentLibraryProfileChoices.delete(pending.libraryId);
    if (currentLibraryId === pending.libraryId) currentLibraryProfile = null;
    pendingSchoolDeletion = null;
    $('#schoolDeletionPreview').hidden = true;
    $('#confirmSchoolDeletionCheck').checked = false;
    await loadMemberships(currentLibraryId);
    setSchoolProfileStatus('حُذفت المدرسة نهائيًا مع السجلات التي ظهرت في المعاينة.', 'success');
    $('#deleteOwnedSchoolStatus').textContent = 'اكتمل الحذف النهائي.';
  } catch (error) {
    const message = schoolDeletionErrorMessage(error?.message);
    if (deletionCompleted) {
      setSchoolProfileStatus('اكتمل حذف المدرسة، لكن تعذّر تحديث بقية لوحة الإدارة. حدّث الصفحة.', 'success');
      $('#deleteOwnedSchoolStatus').textContent = 'اكتمل الحذف النهائي.';
    } else {
      const fileNotice = storageAttempted
        ? storageComplete
          ? ' أُزيلت ملفات الشعارات قبل تعذّر إكمال حذف السجلات؛ أعد رفعها إذا بقي سجل المدرسة.'
          : ' لم يكتمل تنظيف ملفات الشعارات؛ لم يُحذف سجل المكتبة، وقد يكون بعض الملفات أُزيل.'
        : '';
      $('#deleteOwnedSchoolStatus').textContent = `${message}${fileNotice}`;
      pendingSchoolDeletion = null;
      $('#schoolDeletionPreview').hidden = true;
      $('#confirmSchoolDeletionCheck').checked = false;
    }
  } finally {
    $('#librarySelect').disabled = false;
    $('#ownedSchoolActionSelect').disabled = false;
    updateOwnedSchoolActionControls();
    confirmButton.disabled = true;
  }
});
async function loadInventory() {
  const tbody = $('#inventoryRows');
  try {
    inventoryTitles = await fetchAllPages(() => supabase.from('catalog_titles')
      .select('id,general_number,title,author,classification,isbn,series_name,is_published').eq('library_id', currentLibraryId).order('title'));
    inventoryHoldings = await fetchAllPages(() => supabase.from('holdings')
      .select('id,title_id,branch_id,inventory_tag,cabinet_code,shelf_code,public_shelf_label,status,created_at')
      .eq('library_id', currentLibraryId).order('created_at'));
  } catch (error) {
    inventoryLoadFailed = true;
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">تعذّر تحميل الفهرس أو النسخ؛ تحقق من الصلاحية والاتصال.</td></tr>';
    $('#holdingRows').innerHTML = '<tr><td colspan="6" class="table-empty">تعذّر تحميل النسخ.</td></tr>';
    renderAutomationTasks();
    return;
  }
  inventoryLoadFailed = false;
  const titleOptions = '<option value="">اختر عنواناً</option>' + inventoryTitles.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.title)} · ${escapeHtml(row.general_number)}</option>`).join('');
  for (const id of ['reservationTitleSelect','holdingTitleSelect','requestMatchedTitleSelect']) {
    const select = $(`#${id}`);
    if (!select) continue;
    const selected = select.value;
    select.innerHTML = titleOptions;
    if (inventoryTitles.some(row => row.id === selected)) select.value = selected;
  }
  const canManage = ['owner','admin','librarian'].includes(currentRole);
  renderInventoryTitles();
  const titleMap = Object.fromEntries(inventoryTitles.map(row => [row.id, row]));
  const branchMap = Object.fromEntries(staffBranches.map(row => [row.id, row.name]));
  const statusLabels = { available: 'متاح', on_loan: 'معار', reserved: 'محجوز', maintenance: 'صيانة', lost: 'مفقود', withdrawn: 'مستبعد' };
  $('#holdingRows').innerHTML = inventoryHoldings.length ? inventoryHoldings.map(row => {
    const title = titleMap[row.title_id] || {};
    const location = [branchMap[row.branch_id], row.cabinet_code, row.shelf_code].filter(Boolean).join(' · ') || '—';
    const blocked = ['on_loan','reserved','withdrawn'].includes(row.status);
    const auditActions = `<button class="loan-return" data-inventory-result="found" data-holding-id="${escapeHtml(row.id)}" type="button">موجود</button>${blocked ? '' : ` <button class="loan-return" data-inventory-result="missing" data-holding-id="${escapeHtml(row.id)}" type="button">مفقود</button> <button class="loan-return" data-inventory-result="damaged" data-holding-id="${escapeHtml(row.id)}" type="button">تالف</button>`}`;
    const statusAction = canManage && row.status === 'maintenance' ? ` <button class="loan-return" data-copy-status="available" data-holding-id="${escapeHtml(row.id)}" type="button">تم الإصلاح</button>` : canManage && row.status === 'available' ? ` <button class="loan-return" data-copy-status="withdrawn" data-holding-id="${escapeHtml(row.id)}" type="button">استبعاد</button>` : '';
    const editAction = canManage ? `<button class="loan-return" data-edit-holding="${escapeHtml(row.id)}" type="button">الموقع</button>` : '';
    return `<tr><td>${escapeHtml(title.general_number || '—')}</td><td>${escapeHtml(title.title || 'عنوان')}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(row.inventory_tag || '—')}</td><td><span class="${row.status === 'available' ? 'published-tag' : 'pending-tag'}">${statusLabels[row.status] || escapeHtml(row.status)}</span></td><td>${auditActions}${statusAction} ${editAction}</td></tr>`;
  }).join('') : '<tr><td colspan="6" class="table-empty">لا توجد نسخ مسجلة.</td></tr>';
  renderAutomationTasks();
}
function renderInventoryTitles() {
  const tbody = $('#inventoryRows');
  if (!tbody) return;
  const query = String($('#inventorySearch')?.value || '').normalize('NFKC').toLocaleLowerCase('ar-EG').trim();
  const visibleTitles = inventoryTitles.filter(row => !query || [row.general_number, row.title, row.author, row.classification, row.isbn, row.series_name]
    .some(value => String(value || '').normalize('NFKC').toLocaleLowerCase('ar-EG').includes(query)));
  const count = $('#inventorySearchCount');
  if (count) count.textContent = `${visibleTitles.length.toLocaleString('ar-EG')} من ${inventoryTitles.length.toLocaleString('ar-EG')} عنوان`;
  const canManage = ['owner', 'admin', 'librarian'].includes(currentRole);
  tbody.innerHTML = visibleTitles.length ? visibleTitles.map(row => `<tr><td>${escapeHtml(row.general_number)}</td><td>${escapeHtml(row.title)}${row.series_name ? `<small class="catalog-series-label">السلسلة: ${escapeHtml(row.series_name)}</small>` : ''}</td><td>${escapeHtml(row.author || '—')}</td><td><span class="${row.is_published ? 'published-tag' : 'pending-tag'}">${row.is_published ? 'منشور' : 'داخلي'}</span></td><td>${canManage ? `<button class="loan-return" data-edit-title="${escapeHtml(row.id)}" type="button">تعديل</button>` : '—'}</td></tr>`).join('') : `<tr><td colspan="5" class="table-empty">${inventoryTitles.length && query ? 'لا توجد عناوين تطابق البحث.' : 'لا توجد عناوين مسجلة لهذه المكتبة.'}</td></tr>`;
}
async function loadPatrons() {
  let data;
  try { data = await fetchAllPages(() => supabase.from('patrons').select('id,member_code,full_name,is_active').eq('library_id', currentLibraryId).eq('is_active', true).order('full_name').order('id')); }
  catch {
    const select = $('#patronSelect');
    select.innerHTML = '<option value="">تعذّر تحميل القائمة</option>';
    $('#reservationPatronSelect').innerHTML = '<option value="">تعذّر تحميل القائمة</option>';
    return;
  }
  const select = $('#patronSelect');
  const options = (data || []).map(patron => `<option value="${escapeHtml(patron.id)}">${escapeHtml(patron.full_name)}${patron.member_code ? ` · ${escapeHtml(patron.member_code)}` : ''}</option>`).join('');
  select.innerHTML = '<option value="">اختر مستعيراً</option>' + options;
  $('#reservationPatronSelect').innerHTML = '<option value="">اختر مستعيراً</option>' + options;
}
async function loadAvailableHoldings() {
  const selectedPatron = $('#patronSelect').value;
  const select = $('#holdingSelect');
  let data, readyReservations;
  try {
    [data, readyReservations] = await Promise.all([
      fetchAllPages(() => supabase.from('holdings').select('id,inventory_tag,title_id,status').eq('library_id', currentLibraryId).in('status', ['available','reserved']).order('id')),
      fetchAllPages(() => supabase.from('reservations').select('holding_id,patron_id').eq('library_id', currentLibraryId).eq('status', 'ready').order('created_at').order('id')),
    ]);
  } catch { select.innerHTML = '<option value="">تعذّر تحميل القائمة</option>'; return; }
  const reservedFor = Object.fromEntries((readyReservations || []).filter(row => row.holding_id).map(row => [row.holding_id, row.patron_id]));
  const rows = (data || []).filter(row => row.status === 'available' || (row.status === 'reserved' && selectedPatron && reservedFor[row.id] === selectedPatron));
  const ids = [...new Set(rows.map(row => row.title_id))];
  let titleMap = {};
  if (ids.length) {
    const { data: titles } = await supabase.from('catalog_titles').select('id,title,general_number').eq('library_id', currentLibraryId).in('id', ids);
    titleMap = Object.fromEntries((titles || []).map(title => [title.id, title]));
  }
  select.innerHTML = '<option value="">اختر نسخة</option>' + rows.map(row => {
    const title = titleMap[row.title_id];
    return `<option value="${escapeHtml(row.id)}">${escapeHtml(title?.title || 'عنوان')} · ${escapeHtml(row.inventory_tag || title?.general_number || 'بلا رقم نسخة')}${row.status === 'reserved' ? ' · حجز هذا المستعير' : ''}</option>`;
  }).join('');
}
async function loadOpenLoans() {
  const tbody = $('#loanRows');
  let loans;
  try { loans = await fetchAllPages(() => supabase.from('loans').select('id,due_at,created_at,patron_id,holding_id,renewal_count').eq('library_id', currentLibraryId).is('returned_at', null).order('due_at')); }
  catch { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">تعذّر تحميل الإعارات أو تجاوزت حد الصفحات.</td></tr>'; return; }
  if (!loans?.length) { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">لا توجد إعارات مفتوحة.</td></tr>'; return; }
  const patronIds = [...new Set(loans.map(loan => loan.patron_id))];
  const holdingIds = [...new Set(loans.map(loan => loan.holding_id))];
  const [{ data: patrons }, { data: holdings }] = await Promise.all([
    supabase.from('patrons').select('id,full_name').eq('library_id', currentLibraryId).in('id', patronIds),
    supabase.from('holdings').select('id,inventory_tag,title_id').eq('library_id', currentLibraryId).in('id', holdingIds),
  ]);
  const patronMap = Object.fromEntries((patrons || []).map(patron => [patron.id, patron.full_name]));
  const holdingRows = holdings || [];
  const titleIds = [...new Set(holdingRows.map(holding => holding.title_id))];
  const { data: titles } = titleIds.length ? await supabase.from('catalog_titles').select('id,title').eq('library_id', currentLibraryId).in('id', titleIds) : { data: [] };
  const titleMap = Object.fromEntries((titles || []).map(title => [title.id, title.title]));
  const holdingMap = Object.fromEntries(holdingRows.map(holding => [holding.id, `${titleMap[holding.title_id] || 'كتاب'} · ${holding.inventory_tag || 'نسخة'}`]));
  const now = Date.now();
  tbody.innerHTML = loans.map(loan => {
    const late = new Date(loan.due_at).getTime() < now;
    const renewal = Number(loan.renewal_count || 0) < 2 ? `<button class="loan-return" data-renew-loan="${escapeHtml(loan.id)}" type="button">تجديد 14 يوماً</button>` : '<small>بلغ حد التجديد</small>';
    return `<tr><td>${escapeHtml(patronMap[loan.patron_id] || 'مستعير')}</td><td>${escapeHtml(holdingMap[loan.holding_id] || 'نسخة')}</td><td>${formatDate(loan.due_at)}<small class="table-subtext">تجديدات: ${Number(loan.renewal_count || 0)} من 2</small></td><td>${late ? '<span class="late-tag">متأخرة</span>' : 'جارية'}</td><td>${renewal} <button class="loan-return" data-return-loan="${escapeHtml(loan.id)}" type="button">تسجيل الإرجاع</button></td></tr>`;
  }).join('');
}
async function loadVisitors() {
  const tbody = $('#visitorRows');
  const { data, error } = await supabase.from('visitors').select('id,display_name,occupation,created_at').eq('library_id', currentLibraryId).order('created_at', { ascending: false }).limit(100);
  if (error) { tbody.innerHTML = '<tr><td colspan="3" class="table-empty">تعذّر تحميل سجلات الزوار.</td></tr>'; return; }
  if (!data?.length) { tbody.innerHTML = '<tr><td colspan="3" class="table-empty">لا توجد سجلات زوار مسجلة.</td></tr>'; return; }
  tbody.innerHTML = data.map(visitor => `<tr><td>${escapeHtml(visitor.display_name)}</td><td>${escapeHtml(visitor.occupation || '—')}</td><td>${formatDate(visitor.created_at)}</td></tr>`).join('');
}
async function loadReports() {
  const [titles, copies, lost, maintenance, open, overdue, visitors, checks, waiting, ready] = await Promise.all([
    countRows('catalog_titles'), countRows('holdings'),
    countRows('holdings', [['eq', 'status', 'lost']]),
    countRows('holdings', [['eq', 'status', 'maintenance']]),
    countRows('loans', [['is', 'returned_at', null]]),
    countRows('loans', [['is', 'returned_at', null], ['lt', 'due_at', new Date().toISOString()]]),
    countRows('visitors'), countRows('inventory_checks'),
    countRows('reservations', [['eq', 'status', 'queued']]), countRows('reservations', [['eq', 'status', 'ready']]),
  ]);
  const cards = [['العناوين', titles], ['النسخ المسجلة', copies], ['نسخ مفقودة', lost], ['تحت الصيانة', maintenance], ['الإعارات المفتوحة', open], ['الإعارات المتأخرة', overdue], ['الزوار المسجلون', visitors], ['عمليات الجرد', checks], ['حجوزات انتظار', waiting], ['جاهزة للاستلام', ready], ['الفروع', staffBranches.length]];
  $('#reportGrid').innerHTML = cards.map(([label, count]) => `<div class="report-card"><span>${label}</span><strong>${count === null ? '—' : Number(count).toLocaleString('ar-EG')}</strong></div>`).join('');
}
const PLATFORM_REPORT_METRICS = Object.freeze([
  ['branches', 'الفروع'], ['titles', 'عناوين الكتب'], ['copies', 'النسخ المسجلة'],
  ['available', 'نسخ متاحة'], ['lost', 'نسخ مفقودة'], ['open_loans', 'إعارات مفتوحة'],
  ['overdue_loans', 'إعارات متأخرة الآن'], ['queued_reservations', 'حجوزات انتظار'],
  ['ready_reservations', 'حجوزات جاهزة'],
]);
function platformReportNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}
function formatPlatformReportDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'غير متاح';
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo',
  }).format(date);
}
function renderPlatformLibraryReport() {
  const report = platformLibraryReportData;
  if (!report) return;
  const libraries = Array.isArray(report.libraries) ? report.libraries : [];
  const totals = report.totals || {};
  const summary = [
    ['المكتبات المسجلة', totals.libraries ?? libraries.length],
    ...PLATFORM_REPORT_METRICS.map(([key, label]) => [label, totals[key]]),
  ];
  $('#platformReportSummary').innerHTML = summary.map(([label, value]) =>
    `<article class="platform-report-stat"><span>${escapeHtml(label)}</span><strong>${platformReportNumber(value).toLocaleString('ar-EG')}</strong></article>`,
  ).join('');
  $('#platformReportScope').textContent = `${report.scope || 'لقطة حالية لجميع المكتبات المسجلة.'} تاريخ الإنشاء: ${formatPlatformReportDate(report.generated_at)} بتوقيت القاهرة.`;
  if (!libraries.length) {
    $('#platformLibraryComparison').innerHTML = '<p class="inline-alert">لا توجد مكتبات مسجلة لعرضها في هذه اللقطة.</p>';
    return;
  }
  $('#platformLibraryComparison').innerHTML = libraries.map((library, index) => {
    const metrics = PLATFORM_REPORT_METRICS.map(([key, label]) =>
      `<div class="platform-report-metric"><span>${escapeHtml(label)}</span><strong>${platformReportNumber(library[key]).toLocaleString('ar-EG')}</strong></div>`,
    ).join('');
    const note = libraryHasOperationalData(library)
      ? ''
      : '<p class="platform-report-no-data">لا توجد بيانات تشغيلية مسجلة لهذه المكتبة في هذه المؤشرات؛ لا يعني ذلك نجاحاً أو قصوراً.</p>';
    return `<article class="platform-library-card"><h4>${escapeHtml(library.name || `مكتبة ${index + 1}`)}</h4>${note}<div class="platform-report-metrics">${metrics}</div></article>`;
  }).join('');
}
async function loadPlatformLibraryReport() {
  const section = $('#platformReportSection');
  if (!section || !hasPlatformOwnerAccess(currentMemberships) || !supabase) {
    if (section) section.hidden = true;
    return;
  }
  $('#ownerTelegramReportCard').hidden = false;
  section.hidden = false;
  $('#platformReportStatus').textContent = 'جارٍ إعداد لقطة مجمعة لجميع المكتبات…';
  platformLibraryReportData = null;
  $('#platformReportSummary').replaceChildren();
  $('#platformLibraryComparison').replaceChildren();
  $('#platformAiSummaryOutput').replaceChildren();
  $('#platformAiSummaryOutput').hidden = true;
  $('#platformAiSummaryStatus').textContent = '';
  $('#exportPlatformReport').disabled = true;
  const { data, error } = await supabase.rpc('get_platform_library_report', {});
  if (error || !data || typeof data !== 'object') {
    platformLibraryReportData = null;
    $('#platformReportStatus').textContent = 'تعذّر تحميل التقرير. تحقّق من جلسة المالك والاتصال ثم أعد المحاولة.';
    return;
  }
  platformLibraryReportData = data;
  renderPlatformLibraryReport();
  $('#exportPlatformReport').disabled = false;
  $('#platformReportStatus').textContent = `تم إعداد التقرير الشامل لعدد ${platformReportNumber(data.totals?.libraries ?? data.libraries?.length).toLocaleString('ar-EG')} مكتبات.`;
}
$('#refreshPlatformReport').addEventListener('click', () => { void loadPlatformLibraryReport(); });
$('#exportPlatformReport').addEventListener('click', () => {
  const report = platformLibraryReportData;
  if (!report || !hasPlatformOwnerAccess(currentMemberships)) return;
  const rows = [
    ['تقرير المكتبات المسجلّة — لقطة حالية'],
    ['تاريخ الإنشاء', report.generated_at || ''],
    ['النطاق', report.scope || 'جميع المكتبات المسجلة'],
    [],
    ['المكتبة', ...PLATFORM_REPORT_METRICS.map(([, label]) => label)],
    ...(Array.isArray(report.libraries) ? report.libraries.map(library => [
      library.name || '', ...PLATFORM_REPORT_METRICS.map(([key]) => platformReportNumber(library[key])),
    ]) : []),
    ['الإجمالي', ...PLATFORM_REPORT_METRICS.map(([key]) => platformReportNumber(report.totals?.[key]))],
  ];
  const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'borsaid-platform-library-report.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('#generatePlatformAiSummary').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!hasPlatformOwnerAccess(currentMemberships)) {
    return setMessage($('#platformAiSummaryStatus'), 'تحليل التقرير الشامل متاح لمالك المنصة المخوّل فقط.', 'error');
  }
  button.disabled = true;
  $('#platformAiSummaryOutput').hidden = true;
  setMessage($('#platformAiSummaryStatus'), 'جارٍ تحديث اللقطة ثم إرسال أعداد مجهولة ومجمعة فقط إلى Gemini…');
  try {
    await loadPlatformLibraryReport();
    if (!platformLibraryReportData) throw new Error('metrics_unavailable');
    const { data, error } = await supabase.functions.invoke('platform-library-report', {
      body: { action: 'summary', model: $('#assistantModel').value },
    });
    if (error || data?.error) {
      const reason = data?.error || error?.message || '';
      const message = reason.includes('not_authorized') || error?.status === 403
        ? 'هذا التحليل متاح لمالك المنصة المخوّل فقط.'
        : reason.includes('server_configuration_missing') || error?.status === 503
          ? 'تعذّر التحليل؛ تحقّق من إعداد Gemini الخادمي. يظل التقرير العددي متاحاً.'
          : 'تعذّر إنشاء التحليل. يظل التقرير العددي متاحاً ولم تتغير أي بيانات.';
      return setMessage($('#platformAiSummaryStatus'), message, 'error');
    }
    const output = $('#platformAiSummaryOutput');
    output.replaceChildren();
    const summary = document.createElement('p');
    summary.textContent = data?.summary || 'لا يوجد ملخص.';
    output.append(summary);
    if (Array.isArray(data?.actions) && data.actions.length) {
      const list = document.createElement('ul');
      data.actions.forEach(item => {
        const action = document.createElement('li');
        action.textContent = String(item);
        list.append(action);
      });
      output.append(list);
    }
    output.hidden = false;
    setMessage($('#platformAiSummaryStatus'), 'تحليل إرشادي للأعداد المجمعة المجهولة فقط؛ لا ينفذ إجراءً ولا يعرض بيانات أفراد.', 'success');
  } catch {
    setMessage($('#platformAiSummaryStatus'), 'تعذّر إنشاء التحليل أو تحديث التقرير. لم تتغير أي بيانات.', 'error');
  } finally {
    button.disabled = false;
  }
});
async function loadReservations() {
  const tbody = $('#reservationRows');
  let reservations;
  try {
    reservations = await fetchAllPages(() => supabase.from('reservations')
      .select('id,title_id,patron_id,status,created_at,holding_id').eq('library_id', currentLibraryId)
      .order('created_at', { ascending: false }).order('id'));
  } catch { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">تعذّر تحميل الحجوزات.</td></tr>'; return; }
  if (!reservations?.length) { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">لا توجد حجوزات.</td></tr>'; return; }
  const titleIds = [...new Set(reservations.map(row => row.title_id))];
  const patronIds = [...new Set(reservations.map(row => row.patron_id))];
  const [{ data: titles }, { data: patrons }] = await Promise.all([
    supabase.from('catalog_titles').select('id,title').eq('library_id', currentLibraryId).in('id', titleIds),
    supabase.from('patrons').select('id,full_name').eq('library_id', currentLibraryId).in('id', patronIds),
  ]);
  const titleMap = Object.fromEntries((titles || []).map(row => [row.id, row.title]));
  const patronMap = Object.fromEntries((patrons || []).map(row => [row.id, row.full_name]));
  const labels = { queued: 'قيد الانتظار', ready: 'جاهز للاستلام', fulfilled: 'مكتمل', cancelled: 'ملغى', expired: 'منتهي' };
  tbody.innerHTML = reservations.map(row => {
    const assigned = row.holding_id ? inventoryHoldings.find(holding => holding.id === row.holding_id) : null;
    const copyLabel = assigned ? ` · نسخة ${escapeHtml(assigned.inventory_tag || '')}` : '';
    const action = ['queued','ready'].includes(row.status)
      ? `<button class="loan-return" data-reservation-id="${escapeHtml(row.id)}" data-next-status="cancelled" type="button">إلغاء</button>` : '—';
    return `<tr><td>${escapeHtml(titleMap[row.title_id] || 'عنوان')}${row.status === 'ready' ? `<small class="table-subtext">جاهز للاستلام${copyLabel}</small>` : ''}</td><td>${escapeHtml(patronMap[row.patron_id] || 'مستعير')}</td><td>${formatDate(row.created_at)}</td><td>${labels[row.status] || escapeHtml(row.status)}</td><td>${action}</td></tr>`;
  }).join('');
}
async function loadInterlibraryRequests() {
  const select = $('#requestDestinationSelect');
  const targets = [...new Map(publicBranches.filter(branch => branch.library_id !== currentLibraryId && branch.interlibrary_enabled)
    .map(branch => [branch.library_id, branch.library_name])).entries()];
  select.innerHTML = '<option value="">اختر مكتبة مشاركة</option>' + targets.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join('');
  const tbody = $('#requestRows');
  const [outgoingResult, incomingResult] = await Promise.all([
    supabase.from('interlibrary_requests').select('id,source_library_id,destination_library_id,requested_title,requested_author,matched_title_id,status,created_at').eq('source_library_id', currentLibraryId).order('created_at', { ascending: false }).limit(100),
    supabase.from('interlibrary_requests').select('id,source_library_id,destination_library_id,requested_title,requested_author,matched_title_id,status,created_at').eq('destination_library_id', currentLibraryId).order('created_at', { ascending: false }).limit(100),
  ]);
  if (outgoingResult.error || incomingResult.error) { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">تعذّر تحميل الطلبات؛ تحقق من عضوية المكتبة.</td></tr>'; return; }
  const rows = [
    ...(outgoingResult.data || []).map(row => ({ ...row, direction: 'صادر' })),
    ...(incomingResult.data || []).map(row => ({ ...row, direction: 'وارد' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="5" class="table-empty">لا توجد طلبات حتى الآن.</td></tr>'; return; }
  const statusLabels = { requested: 'جديد', accepted: 'مقبول', declined: 'مرفوض', in_transit: 'قيد النقل', completed: 'مكتمل', cancelled: 'ملغى' };
  const libraryNames = Object.fromEntries([...new Map(publicBranches.map(branch => [branch.library_id, branch.library_name])).entries()]);
  requestRecords = new Map(rows.map(row => [row.id, row]));
  tbody.innerHTML = rows.map(row => {
    let controls = '—';
    if (row.direction === 'وارد' && row.status === 'requested') controls = `<button class="loan-return" data-request-match="${escapeHtml(row.id)}" type="button">مطابقة وقبول</button> <button class="loan-return" data-request-id="${escapeHtml(row.id)}" data-next-status="declined" type="button">رفض</button>`;
    else if (row.direction === 'صادر' && row.status === 'requested') controls = `<button class="loan-return" data-request-id="${escapeHtml(row.id)}" data-next-status="cancelled" type="button">إلغاء الطلب</button>`;
    else if (row.direction === 'وارد' && row.status === 'accepted') controls = `<button class="loan-return" data-request-id="${escapeHtml(row.id)}" data-next-status="in_transit" type="button">إرسال</button>`;
    else if (row.direction === 'صادر' && row.status === 'in_transit') controls = `<button class="loan-return" data-request-id="${escapeHtml(row.id)}" data-next-status="completed" type="button">تأكيد الاستلام</button>`;
    const otherLibrary = row.direction === 'صادر' ? row.destination_library_id : row.source_library_id;
    const matchedTitle = row.matched_title_id ? inventoryTitles.find(title => title.id === row.matched_title_id)?.title : null;
    return `<tr><td>${escapeHtml(row.requested_title)}${matchedTitle ? `<small class="table-subtext">مطابق في السجل: ${escapeHtml(matchedTitle)}</small>` : ''}${row.requested_author ? `<small class="table-subtext">${escapeHtml(row.requested_author)}</small>` : ''}</td><td>${row.direction} · ${escapeHtml(libraryNames[otherLibrary] || 'مكتبة مشاركة')}</td><td>${statusLabels[row.status] || escapeHtml(row.status)}</td><td>${formatDate(row.created_at)}</td><td>${controls}</td></tr>`;
  }).join('');
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) return setMessage(loginMessage, 'الاتصال غير متاح حالياً.', 'error');
  const submit = $('.login-submit', event.currentTarget);
  submit.disabled = true;
  setMessage(loginMessage, 'جارٍ التحقق من الحساب...');
  const form = new FormData(event.currentTarget);
  const { error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
  submit.disabled = false;
  if (error) return setMessage(loginMessage, 'تعذّر تسجيل الدخول. تحقق من بيانات الحساب أو تواصل مع مسؤول المكتبة.', 'error');
  event.currentTarget.reset();
  setMessage(loginMessage, 'تم تسجيل الدخول.', 'success');
});
$('#forgotPasswordButton').addEventListener('click', async event => {
  if (!supabase) return setMessage(loginMessage, 'الاتصال غير متاح حالياً.', 'error');
  const emailInput = $('#loginEmail');
  const email = emailInput.value.trim();
  if (!email) {
    setMessage(loginMessage, 'أدخل بريد حساب الموظف أولاً، ثم اختر هذا الخيار مجدداً.', 'error');
    emailInput.focus();
    return;
  }
  if (!emailInput.checkValidity()) { emailInput.reportValidity(); return; }
  const button = event.currentTarget;
  button.disabled = true;
  setMessage(loginMessage, 'جارٍ إرسال رابط آمن إذا كان البريد مسجلاً...');
  const redirectTo = new URL('./set-password.html', window.location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  button.disabled = false;
  if (error) return setMessage(loginMessage, 'تعذّر إرسال الرابط الآن. تحقّق من إعداد إعادة التوجيه والاتصال ثم حاول لاحقاً.', 'error');
  setMessage(loginMessage, 'إذا كان البريد مسجلاً، فسيصلك رابط لتعيين كلمة المرور. افحص صندوق الوارد والرسائل غير المرغوب فيها.', 'success');
});
$('#signOut').addEventListener('click', async () => {
  await supabase?.auth.signOut();
  clearAssistantChat();
  currentLibraryId = null;
  currentRole = null;
  currentUserId = null;
  currentMemberships = [];
  configureRole(null);
  setWorkspaceMode(false);
  setMessage(loginMessage, 'تم تسجيل الخروج.');
});
function normalizeDeweyNumber(value) {
  const digits = '٠١٢٣٤٥٦٧٨٩';
  const western = String(value || '').trim().replace(/[٠-٩]/gu, digit => String(digits.indexOf(digit)))
    .replace(/[۰-۹]/gu, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace('٫', '.');
  return /^\d{3}(?:\.\d{1,8})?$/u.test(western) ? western : '';
}
function normalizeCatalogIsbn(value) {
  const digits = '٠١٢٣٤٥٦٧٨٩';
  const isbn = String(value || '').replace(/[٠-٩]/gu, digit => String(digits.indexOf(digit)))
    .replace(/[۰-۹]/gu, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[\s-]/gu, '').toUpperCase();
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
async function requestCatalogDewey(metadata) {
  const status = $('#bookLookupStatus');
  const form = $('#titleForm');
  if (!form.elements.allow_ai_classification.checked) {
    status.textContent = `تمت تعبئة البيانات من ${metadata.sources.join(' و')}. اختر التصنيف يدوياً، أو فعّل موافقة Gemini قبل جلب الكتاب لاقتراح فئة ديوي.`;
    return;
  }
  if (!supabase || !currentLibraryId) {
    status.textContent = 'تم جلب بيانات الكتاب، لكن يلزم تسجيل الدخول إلى مكتبة لتشغيل اقتراح ديوي.';
    return;
  }
  status.textContent = 'جارٍ طلب اقتراح ديوي من Gemini للبيانات الببليوغرافية العامة…';
  try {
    const { data, error } = await supabase.functions.invoke('book-classifier', {
      body: {
        library_id: currentLibraryId,
        model: $('#assistantModel')?.value || DEFAULT_ASSISTANT_MODEL,
        title: metadata.title,
        author: metadata.author,
        series_name: metadata.series,
        topics: metadata.subjects,
      },
    });
    const code = normalizeDeweyNumber(data?.classification);
    if (error || data?.error || !code || !new Set(['000','100','200','300','400','500','600','700','800','900']).has(code)) {
      status.textContent = 'تم جلب البيانات، لكن خدمة Gemini لم تُرجع اقتراحاً صالحاً. اختر فئة ديوي يدوياً أو حاول لاحقاً.';
      return;
    }
    if (!form.elements.classification.value.trim()) form.elements.classification.value = code;
    const reason = String(data.reason || '').trim();
    status.textContent = `اقتراح Gemini المبدئي: ${code}${reason ? ` — ${reason}` : ''}. راجعه وفق جداول المكتبة قبل الحفظ.`;
  } catch {
    status.textContent = 'تم جلب بيانات الكتاب، لكن اقتراح Gemini غير متاح الآن. اختر رقم ديوي من القائمة أو حاول لاحقاً.';
  }
}
window.addEventListener('bookmetadata:selected', async event => {
  const metadata = event.detail || {};
  const form = $('#titleForm');
  const tidy = value => String(value || '').trim();
  const normalized = value => tidy(value).normalize('NFC').replace(/\s+/gu, ' ').toLocaleLowerCase('ar');
  const currentTitle = tidy(form.elements.title.value);
  if (metadata.title && (!currentTitle || (metadata.searchTitle && normalized(currentTitle) === normalized(metadata.searchTitle)))) {
    form.elements.title.value = tidy(metadata.title).slice(0, 240);
  }
  if (!form.elements.author.value.trim() && metadata.author) form.elements.author.value = tidy(metadata.author).slice(0, 180);
  if (!form.elements.series_name.value.trim() && metadata.series) form.elements.series_name.value = tidy(metadata.series).slice(0, 240);
  const isbn = normalizeCatalogIsbn(metadata.isbn || metadata.searchIsbn);
  if (!form.elements.isbn.value.trim() && isbn) form.elements.isbn.value = isbn;
  $('#bookLookupStatus').textContent = `تمت تعبئة بيانات الفهرس من ${metadata.sources.join(' و') || 'المصدر العام'}؛ راجع العنوان والمؤلف والسلسلة قبل الحفظ.`;
  await requestCatalogDewey({
    title: tidy(metadata.title).slice(0, 240),
    author: tidy(metadata.author).slice(0, 180),
    series: tidy(metadata.series).slice(0, 240),
    subjects: Array.isArray(metadata.subjects) ? metadata.subjects.slice(0, 20).map(value => tidy(value).slice(0, 120)) : [],
    sources: Array.isArray(metadata.sources) ? metadata.sources : [],
  });
});
function reviewCoverNumbers(form, data) {
  const panel = $('#bookCoverNumberReview');
  if (!panel) return;
  const mapped = mapCoverAnalysisNumbers(data, {
    isbn: form.elements.isbn.value,
    general_number: form.elements.general_number.value,
    classification: form.elements.classification.value,
  });
  for (const [field, value] of Object.entries(mapped.fills)) form.elements[field].value = value;
  panel.replaceChildren();
  if (!mapped.numbers.length) {
    panel.hidden = true;
    return;
  }
  const heading = document.createElement('h4');
  heading.textContent = 'الأرقام التي قرأها الغلاف — راجعها قبل الحفظ';
  const list = document.createElement('ul');
  const kindLabels = {
    isbn: 'ISBN',
    local_general_number: 'الرقم العام المحلي',
    deposit_number: 'رقم الإيداع',
    issue_number: 'رقم العدد',
    edition_number: 'رقم الطبعة',
    volume_number: 'رقم المجلد',
    other: 'رقم مطبوع غير مصنف',
  };
  for (const item of mapped.numbers) {
    const row = document.createElement('li');
    const category = kindLabels[item.kind] || kindLabels.other;
    const printedLabel = item.label && item.label !== category ? `${item.label}: ` : '';
    row.append(document.createTextNode(`${printedLabel}${category}: ${item.value}`));
    if (item.kind === 'deposit_number') row.append(document.createTextNode(' — ليس الرقم العام المحلي ولا ISBN.'));
    else if (item.kind === 'issue_number' || item.kind === 'edition_number' || item.kind === 'volume_number') row.append(document.createTextNode(' — لا يُسجّل كـISBN.'));
    else if (item.kind === 'isbn' && mapped.fills.isbn === item.value) row.append(document.createTextNode(' — أُدخل في حقل ISBN؛ راجعه أو حرّره.'));
    else if (item.kind === 'local_general_number' && mapped.fills.general_number === item.value) row.append(document.createTextNode(' — أُدخل في حقل الرقم العام المحلي؛ راجعه أو حرّره.'));
    else if (item.kind === 'isbn' && form.elements.isbn.value.trim()) row.append(document.createTextNode(' — لم تُستبدل قيمة ISBN التي أدخلتها.'));
    else if (item.kind === 'local_general_number' && form.elements.general_number.value.trim()) row.append(document.createTextNode(' — لم تُستبدل قيمة الرقم العام التي أدخلتها.'));
    list.append(row);
  }
  for (const [field, values] of Object.entries(mapped.choices)) {
    const fieldLabel = field === 'isbn' ? 'ISBN' : 'الرقم العام المحلي';
    for (const value of values) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `استخدام ${fieldLabel}: ${value}`;
      button.addEventListener('click', () => {
        form.elements[field].value = value;
        form.elements[field].focus();
        button.disabled = true;
      });
      row.append(button);
      list.append(row);
    }
  }
  panel.append(heading, list);
  panel.hidden = false;
}
window.addEventListener('bookcover:selected', async event => {
  const form = $('#titleForm');
  const status = $('#bookLookupStatus');
  const cover = event.detail || {};
  const complete = typeof cover.complete === 'function' ? cover.complete : () => {};
  try {
    if (!form.elements.allow_cover_ai.checked) {
      status.textContent = 'فعّل موافقة تحليل صورة الغلاف أولاً؛ لم تُرسل الصورة.';
      return;
    }
    if (!supabase || !currentLibraryId || cover.mimeType !== 'image/jpeg' || typeof cover.data !== 'string') {
      status.textContent = 'يلزم تسجيل الدخول إلى مكتبة واختيار صورة غلاف صالحة قبل التحليل.';
      return;
    }
    status.textContent = 'جارٍ تحليل صورة الغلاف بموافقتك؛ لن يحفظ الموقع الصورة…';
    const { data, error } = await supabase.functions.invoke('book-classifier', {
      body: {
        library_id: currentLibraryId,
        model: $('#assistantModel')?.value || DEFAULT_ASSISTANT_MODEL,
        mode: 'cover',
        image_consent: true,
        cover_image: { mimeType: cover.mimeType, data: cover.data },
      },
    });
    if (error || data?.error) {
      status.textContent = 'تعذّر تحليل الغلاف الآن؛ يمكنك إدخال البيانات يدوياً أو البحث بالعنوان.';
      return;
    }
    const extractedTitle = String(data.title || '').trim().slice(0, 240);
    const extractedAuthor = String(data.author || '').trim().slice(0, 180);
    const extractedSeries = String(data.series_name || '').trim().slice(0, 240);
    reviewCoverNumbers(form, data);
    const priorTitle = String(form.elements.title.value || '').trim();
    const titleMatches = !priorTitle || priorTitle.normalize('NFC').toLocaleLowerCase('ar') === extractedTitle.normalize('NFC').toLocaleLowerCase('ar');
    if (extractedTitle && !priorTitle) form.elements.title.value = extractedTitle;
    if (!form.elements.author.value.trim() && extractedAuthor) form.elements.author.value = extractedAuthor;
    if (!form.elements.series_name.value.trim() && extractedSeries) form.elements.series_name.value = extractedSeries;
    const classification = String(data.classification || '');
    if (!form.elements.classification.value.trim() && new Set(['000','100','200','300','400','500','600','700','800','900']).has(classification)) form.elements.classification.value = classification;
    const reason = String(data.reason || '').trim();
    status.textContent = extractedTitle
      ? `استخراج مبدئي من الغلاف: ${extractedTitle}${extractedAuthor ? ` — ${extractedAuthor}` : ''}${classification ? ` · ديوي ${classification}` : ''}${reason ? ` — ${reason}` : ''}. راجع البيانات قبل الحفظ.`
      : 'لم يظهر عنوان مقروء بوضوح على الغلاف؛ أدخله يدوياً أو التقط صورة أوضح.';
    if (extractedTitle && titleMatches) $('#lookupBookButton')?.click();
    else if (extractedTitle) status.textContent += ' لم نغيّر العنوان الموجود؛ امسحه أو راجعه ثم استخدم البحث يدوياً.';
  } catch {
    status.textContent = 'تعذّر الاتصال بمحلل الغلاف. لم يحفظ الموقع الصورة؛ يمكنك إدخال البيانات يدوياً.';
  } finally {
    complete();
  }
});
window.addEventListener('booktitlepage:selected', async event => {
  const form = $('#titleForm');
  const status = $('#bookLookupStatus');
  const panel = $('#bookTitlePageReview');
  const page = event.detail || {};
  const complete = typeof page.complete === 'function' ? page.complete : () => {};
  try {
    if (!form.elements.allow_title_page_ai.checked) {
      status.textContent = 'فعّل موافقة تحليل صورة صفحة العنوان أولاً؛ لم تُرسل الصورة.';
      return;
    }
    if (!supabase || !currentLibraryId || page.mimeType !== 'image/jpeg' || typeof page.data !== 'string') {
      status.textContent = 'يلزم تسجيل الدخول إلى مكتبة واختيار صورة صفحة عنوان صالحة قبل التحليل.';
      return;
    }
    status.textContent = 'جارٍ تحليل صفحة العنوان بموافقتك؛ لن تُحفظ الصورة…';
    const { data, error } = await supabase.functions.invoke('book-classifier', {
      body: {
        library_id: currentLibraryId,
        model: $('#assistantModel')?.value || DEFAULT_ASSISTANT_MODEL,
        mode: 'title_page',
        image_consent: true,
        title_page_image: { mimeType: page.mimeType, data: page.data },
      },
    });
    if (error || data?.error) {
      status.textContent = 'تعذّر تحليل صفحة العنوان الآن؛ يمكنك مراجعة البيانات وإدخالها يدوياً.';
      return;
    }
    const fields = [
      { key: 'title', label: 'العنوان', max: 240, target: form.elements.title },
      { key: 'author', label: 'المؤلف', max: 180, target: form.elements.author },
      { key: 'edition', label: 'الطبعة', max: 120 },
      { key: 'publisher', label: 'الناشر', max: 180 },
      { key: 'publication_year', label: 'سنة النشر كما ظهرت', max: 40 },
    ].map(field => ({ ...field, value: String(data?.[field.key] || '').trim().slice(0, field.max) }));
    panel.replaceChildren();
    const heading = document.createElement('h4');
    heading.textContent = 'بيانات صفحة العنوان — راجعها قبل الحفظ';
    const list = document.createElement('ul');
    for (const field of fields) {
      const row = document.createElement('li');
      row.append(document.createTextNode(`${field.label}: ${field.value || 'لم يظهر بوضوح'}`));
      if (field.target && field.value) {
        const current = String(field.target.value || '').trim();
        if (!current) {
          field.target.value = field.value;
          row.append(document.createTextNode(' — أُدخل في الحقل؛ راجعه.'));
        } else if (current.normalize('NFC') === field.value.normalize('NFC')) {
          row.append(document.createTextNode(' — يطابق القيمة الحالية.'));
        } else {
          const useValue = document.createElement('button');
          useValue.type = 'button';
          useValue.textContent = `استخدام ${field.label} المستخرج`;
          useValue.addEventListener('click', () => {
            field.target.value = field.value;
            field.target.focus();
            useValue.disabled = true;
          });
          row.append(document.createTextNode(' — لم تُستبدل القيمة الموجودة. '), useValue);
        }
      }
      list.append(row);
    }
    const note = document.createElement('p');
    note.textContent = 'الطبعة والناشر وسنة النشر للمراجعة فقط ولا تُحفظ في سجل الفهرس الحالي. لم تُستخرج من هذه الصورة أرقام ISBN أو الرقم العام المحلي أو تصنيف ديوي.';
    panel.append(heading, list, note);
    panel.hidden = false;
    status.textContent = 'اكتمل الاستخراج المبدئي من صفحة العنوان. راجع البيانات، واستخدم حقل العنوان والمؤلف عند الحاجة؛ لم يُحفظ أي سجل.';
  } catch {
    status.textContent = 'تعذّر الاتصال بمحلل صفحة العنوان. لم يحفظ الموقع الصورة؛ يمكنك إدخال البيانات يدوياً.';
  } finally {
    complete();
  }
});
$('#titleForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentLibraryId) return;
  const form = event.currentTarget;
  const fields = new FormData(form);
  const rawDewey = String(fields.get('classification') || '').trim();
  const dewey = normalizeDeweyNumber(rawDewey);
  const rawIsbn = String(fields.get('isbn') || '').trim();
  const isbn = rawIsbn ? normalizeCatalogIsbn(rawIsbn) : '';
  if (rawDewey && !dewey) return setMessage($('#titleMessage'), 'أدخل رقم ديوي من ثلاثة أرقام، ويمكن إضافة جزء عشري مثل 510.1.', 'error');
  if (rawIsbn && !isbn) return setMessage($('#titleMessage'), 'أدخل ISBN-10 أو ISBN-13 صحيحاً أو امسح باركود الكتاب.', 'error');
  const button = $('.form-action', form);
  button.disabled = true;
  setMessage($('#titleMessage'), 'جارٍ حفظ العنوان والنسخة...');
  const { error } = await supabase.rpc('create_title_with_holding_v2', {
    p_library_id: currentLibraryId,
    p_branch_id: fields.get('branch_id'),
    p_general_number: String(fields.get('general_number')).trim(),
    p_title: String(fields.get('title')).trim(),
    p_author: String(fields.get('author') || '').trim() || null,
    p_classification: dewey || null,
    p_isbn: isbn || null,
    p_series_name: String(fields.get('series_name') || '').trim() || null,
    p_inventory_tag: String(fields.get('inventory_tag') || '').trim() || null,
    p_cabinet_code: String(fields.get('cabinet_code') || '').trim() || null,
    p_shelf_code: String(fields.get('shelf_code') || '').trim() || null,
    p_public_shelf_label: String(fields.get('public_shelf_label') || '').trim() || null,
    p_is_published: fields.get('is_published') === 'on',
  });
  button.disabled = false;
  if (error) return setMessage($('#titleMessage'), 'لم يُحفظ العنوان والنسخة معاً. تحقق من الرقم العام المكرر والفرع والصلاحية.', 'error');
  form.reset();
  setMessage($('#titleMessage'), 'تم حفظ العنوان والنسخة معاً. سيظهران للعامة فقط إذا نُشرا وكانت المكتبة والفرع منشورين.', 'success');
  await Promise.all([loadInventory(), loadAvailableHoldings(), refreshStaffStats(), loadReports()]);
  if (fields.get('is_published') === 'on') { await loadPublicBranches().catch(() => {}); await runPublicSearch().catch(() => {}); }
});
$('#branchForm').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const { error } = await supabase.from('branches').insert({
    library_id: currentLibraryId,
    name: String(fields.get('name')).trim(),
    governorate: String(fields.get('governorate') || 'بورسعيد').trim(),
    city: String(fields.get('city') || 'بورسعيد').trim(),
    public_address: String(fields.get('public_address') || '').trim() || null,
    public_phone: String(fields.get('public_phone') || '').trim() || null,
    public_email: String(fields.get('public_email') || '').trim() || null,
    is_published: fields.get('is_published') === 'on',
  });
  if (error) return setMessage($('#branchMessage'), 'لم يُضف الفرع؛ تحقق من صلاحية الحساب والبيانات.', 'error');
  event.currentTarget.reset();
  event.currentTarget.elements.governorate.value = 'بورسعيد';
  event.currentTarget.elements.city.value = 'بورسعيد';
  setMessage($('#branchMessage'), 'تمت إضافة الفرع.', 'success');
  await Promise.all([loadStaffBranches(), refreshStaffStats()]);
  await loadPublicBranches().catch(() => {});
});
$('#patronForm').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const { error } = await supabase.from('patrons').insert({
    library_id: currentLibraryId,
    full_name: String(fields.get('full_name')).trim(),
    member_code: String(fields.get('member_code') || '').trim() || null,
    category: fields.get('category'),
  });
  if (error) return setMessage($('#patronMessage'), 'لم يُسجل المستعير. تحقق من رمز العضوية أو الصلاحية.', 'error');
  event.currentTarget.reset();
  setMessage($('#patronMessage'), 'تمت إضافة المستعير ضمن بيانات المكتبة الخاصة.', 'success');
  await loadPatrons();
});
$('#patronSelect').addEventListener('change', loadAvailableHoldings);
$('#checkoutForm').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const dueAt = new Date(`${fields.get('due_at')}T23:59:59`).toISOString();
  const { error } = await supabase.rpc('checkout_copy', {
    p_library_id: currentLibraryId,
    p_holding_id: fields.get('holding_id'),
    p_patron_id: fields.get('patron_id'),
    p_due_at: dueAt,
  });
  if (error) return setMessage($('#checkoutMessage'), 'لم تتم الإعارة؛ تحقق من إتاحة النسخة وصلاحية المستخدم وتاريخ الاستحقاق.', 'error');
  event.currentTarget.reset();
  setMessage($('#checkoutMessage'), 'سُجلت الإعارة وتغيّرت حالة النسخة.', 'success');
  await Promise.all([loadAvailableHoldings(), loadOpenLoans(), loadReservations(), refreshStaffStats(), loadReports()]);
});
$('#loanRows').addEventListener('click', async event => {
  const renewButton = event.target.closest('[data-renew-loan]');
  if (renewButton) {
    renewButton.disabled = true;
    const { error } = await supabase.rpc('renew_copy', { p_loan_id: renewButton.dataset.renewLoan, p_add_days: 14 });
    if (error) { renewButton.disabled = false; return setMessage($('#workspaceMessage'), 'تعذّر التجديد؛ قد يوجد حجز انتظار أو بلغ القرض حد التجديد.', 'error'); }
    setMessage($('#workspaceMessage'), 'تم تمديد موعد الإرجاع 14 يوماً.', 'success');
    await Promise.all([loadOpenLoans(), refreshStaffStats(), loadReports()]);
    return;
  }
  const button = event.target.closest('[data-return-loan]');
  if (!button) return;
  button.disabled = true;
  const { error } = await supabase.rpc('return_copy', { p_loan_id: button.dataset.returnLoan });
  if (error) {
    button.disabled = false;
    return setMessage($('#workspaceMessage'), 'تعذّر تسجيل الإرجاع. حدّث القائمة وحاول مرة أخرى.', 'error');
  }
  setMessage($('#workspaceMessage'), 'تم تسجيل الإرجاع وإعادة النسخة إلى المتاح.', 'success');
  await Promise.all([loadAvailableHoldings(), loadOpenLoans(), loadReservations(), refreshStaffStats(), loadReports()]);
});
$('#visitorForm').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const { error } = await supabase.from('visitors').insert({
    library_id: currentLibraryId,
    display_name: String(fields.get('display_name')).trim(),
    occupation: String(fields.get('occupation') || '').trim() || null,
    consent_confirmed: fields.get('consent_confirmed') === 'on',
  });
  if (error) return setMessage($('#visitorMessage'), 'لم يُسجل الزائر؛ تحقق من صلاحية الحساب.', 'error');
  event.currentTarget.reset();
  setMessage($('#visitorMessage'), 'تم تسجيل ملف الزائر داخل نطاق المكتبة.', 'success');
  await loadVisitors();
});
$('#reservationForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const { error } = await supabase.rpc('create_reservation', {
    p_library_id: currentLibraryId, p_title_id: fields.get('title_id'), p_patron_id: fields.get('patron_id'),
  });
  if (error) return setMessage($('#reservationMessage'), 'لم يُسجل الحجز؛ تحقق من بيانات المستعير والعنوان وصلاحية الدور.', 'error');
  form.reset();
  setMessage($('#reservationMessage'), 'تم تسجيل الحجز داخل سجل المكتبة.', 'success');
  await Promise.all([loadReservations(), loadAvailableHoldings(), loadInventory(), refreshStaffStats(), loadReports()]);
});
$('#reservationRows').addEventListener('click', async event => {
  const button = event.target.closest('[data-reservation-id]');
  if (!button) return;
  button.disabled = true;
  const { error } = await supabase.rpc('transition_reservation', {
    p_reservation_id: button.dataset.reservationId, p_next_status: button.dataset.nextStatus,
  });
  if (error) { button.disabled = false; return setMessage($('#workspaceMessage'), 'تعذّر تحديث حالة الحجز.', 'error'); }
  await Promise.all([loadReservations(), loadInventory(), loadAvailableHoldings(), refreshStaffStats(), loadReports()]);
});
$('#requestForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const { error } = await supabase.rpc('create_interlibrary_request', {
    p_source_library_id: currentLibraryId,
    p_destination_library_id: fields.get('destination_library_id'),
    p_source_branch_id: fields.get('source_branch_id') || null,
    p_requested_title: String(fields.get('requested_title')).trim(),
    p_requested_general_number: String(fields.get('requested_general_number') || '').trim() || null,
    p_requested_author: String(fields.get('requested_author') || '').trim() || null,
    p_request_note: String(fields.get('request_note') || '').trim() || null,
  });
  if (error) return setMessage($('#requestMessage'), 'لم يُرسل الطلب. تأكد أن المكتبة المستقبِلة مشاركة وأن دورك يسمح بذلك.', 'error');
  form.reset();
  setMessage($('#requestMessage'), 'أُرسل الطلب إلى سجل المكتبة المستقبِلة.', 'success');
  await loadInterlibraryRequests();
});
$('#requestRows').addEventListener('click', async event => {
  const button = event.target.closest('[data-request-id]');
  const matchButton = event.target.closest('[data-request-match]');
  if (matchButton) {
    if (!inventoryTitles.length) return setMessage($('#workspaceMessage'), 'أضف عنواناً محلياً لمطابقة الطلب قبل قبوله.', 'error');
    $('#requestMatchForm').elements.request_id.value = matchButton.dataset.requestMatch;
    $('#requestMatchedTitleSelect').value = '';
    $('#requestMatchDialog').showModal();
    return;
  }
  if (!button) return;
  button.disabled = true;
  const row = requestRecords.get(button.dataset.requestId);
  const { error } = await supabase.rpc('transition_interlibrary_request', {
    p_request_id: button.dataset.requestId,
    p_next_status: button.dataset.nextStatus,
    p_matched_title_id: row?.matched_title_id || null,
  });
  if (error) { button.disabled = false; return setMessage($('#workspaceMessage'), 'تعذّر تحديث حالة الطلب؛ راجع صلاحيات المكتبة.', 'error'); }
  await loadInterlibraryRequests();
});
$('#requestMatchForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const { error } = await supabase.rpc('transition_interlibrary_request', {
    p_request_id: fields.get('request_id'), p_next_status: 'accepted', p_matched_title_id: fields.get('matched_title_id'),
  });
  if (error) return setMessage($('#requestMatchMessage'), 'تعذّر قبول الطلب؛ يجب مطابقة عنوان من مكتبتك.', 'error');
  $('#requestMatchDialog').close();
  await loadInterlibraryRequests();
  setMessage($('#workspaceMessage'), 'قُبل الطلب بعد مطابقة العنوان المحلي.', 'success');
});
$('#memberRows').addEventListener('click', async event => {
  const button = event.target.closest('[data-member-save]');
  if (!button) return;
  const row = button.closest('tr');
  const role = $('.member-role', row)?.value;
  const status = $('.member-status', row)?.value;
  if (!role || !status) return;
  button.disabled = true;
  const { error } = await supabase.rpc('manage_library_membership', {
    p_library_id: currentLibraryId,
    p_user_id: button.dataset.memberSave,
    p_new_role: role,
    p_new_status: status,
  });
  if (error) { button.disabled = false; return setMessage($('#inviteMessage'), 'تعذّر حفظ الدور؛ تحقّق من صلاحيتك ومن وجود مالك نشط واحد على الأقل.', 'error'); }
  setMessage($('#inviteMessage'), 'تم تحديث دور المستخدم.', 'success');
  await loadLibraryMembers();
});
$('#inviteForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!INVITATIONS_ENABLED) return setMessage($('#inviteMessage'), 'الدعوات متوقفة؛ لم تُنشر وظيفة الدعوات في هذا المشروع.', 'error');
  const fields = new FormData(event.currentTarget);
  const { data, error } = await supabase.functions.invoke('invite-library-member', {
    body: { library_id: currentLibraryId, email: String(fields.get('email')).trim(), role: fields.get('role') },
  });
  if (error) return setMessage($('#inviteMessage'), 'خدمة الدعوات غير مهيأة بعد؛ يلزم نشر الوظيفة وضبط نطاق الموقع وإعادة التوجيه على الخادم.', 'error');
  event.currentTarget.reset();
  setMessage($('#inviteMessage'), data?.message || 'أُرسلت الدعوة وأُضيفت العضوية.', 'success');
  await loadLibraryMembers();
});
function renderAutomationTasks() {
  const summary = $('#automationSummary');
  const list = $('#automationTasks');
  if (!summary || !list || !currentLibraryId) return;
  const requiredMetrics = ['titles', 'copies', 'overdue', 'lost', 'maintenance', 'waiting'];
  const metricsKnown = requiredMetrics.every(key => staffMetrics[key] !== undefined && staffMetrics[key] !== null);
  if (branchLoadFailed || inventoryLoadFailed || librarySettingsLoadFailed || !metricsKnown) {
    summary.textContent = 'تعذّر إكمال الفحص بسبب نقص بيانات من الخادم. لن نفسّر البيانات غير المحمّلة على أنها صفر.';
    list.innerHTML = '<li class="automation-task"><strong>تحقق من الاتصال والصلاحيات</strong><p>أعد تحميل لوحة العمل أو اطلب من مسؤول المكتبة مراجعة الاتصال. لم تُنفذ أي تغييرات.</p></li>';
    return;
  }
  const branchMap = new Map(staffBranches.map(branch => [branch.id, branch]));
  const searchableTitle = inventoryTitles.some(title => title.is_published && inventoryHoldings.some(copy => copy.title_id === title.id
    && ['available', 'on_loan'].includes(copy.status) && branchMap.get(copy.branch_id)?.is_published));
  const milestones = [
    staffBranches.length > 0,
    inventoryTitles.length > 0 && inventoryHoldings.length > 0,
    currentLibraryIsPublished === true,
    searchableTitle,
  ];
  summary.textContent = `اكتمل ${milestones.filter(Boolean).length} من 4 متطلبات للظهور العام. الفحص للقراءة فقط ولا يرسل أسماء أو سجلات أشخاص.`;
  const tasks = [];
  const addTask = (title, detail, panelId = '') => tasks.push({ title, detail, panelId });
  if (!staffBranches.length) addTask('أضف الفرع الصحيح الأول', 'لا توجد فروع مسجلة؛ أنشئ فرعًا بالاسم والموقع المعتمدين.', 'branchesPanel');
  if (currentLibraryIsPublished !== true) addTask('راجع نشر المكتبة', 'المكتبة غير منشورة للعامة؛ المالك أو المسؤول فقط يستطيع تغيير هذا الإعداد بعد مراجعته.', 'branchesPanel');
  if (staffBranches.length && !staffBranches.some(branch => branch.is_published)) addTask('راجع نشر فرع واحد على الأقل', 'الفروع غير منشورة؛ لا تُظهر الموقع أو بيانات تواصل قبل التحقق منها.', 'branchesPanel');
  if (!inventoryTitles.length) addTask('أضف أول عنوان ونسخة', 'لا توجد عناوين؛ أدخل بيانات كتاب حقيقية ورقم النسخة وموقعها.', 'catalogPanel');
  else if (!inventoryHoldings.length) addTask('أضف نسخة إلى عنوان مسجل', 'سُجلت عناوين لكن لا توجد نسخ مرتبطة بها في الجرد.', 'catalogPanel');
  else if (!searchableTitle) addTask('راجع نشر عنوان وفرع ونسخة قابلة للعرض', 'لا يوجد حتى الآن سجل يجتاز شروط الفهرس العام معًا؛ راجع البيانات قبل النشر.', 'catalogPanel');
  if (Number(staffMetrics.overdue) > 0) addTask(`راجع ${Number(staffMetrics.overdue).toLocaleString('ar-EG')} إعارة متأخرة`, 'افتح قائمة الإعارات وراجع الحالة مع السجل الأصلي؛ لن يرسل النظام إشعارًا أو يغيّر الإعارة تلقائيًا.', 'circulationPanel');
  if (Number(staffMetrics.lost) > 0) addTask(`راجع ${Number(staffMetrics.lost).toLocaleString('ar-EG')} نسخة مفقودة`, 'تحقق من نتيجة الجرد وسجل النسخة قبل تغيير حالتها.', 'catalogPanel');
  if (Number(staffMetrics.maintenance) > 0) addTask(`تابع ${Number(staffMetrics.maintenance).toLocaleString('ar-EG')} نسخة تحت الصيانة`, 'بعد الإصلاح، راجع النسخة يدويًا ثم حدّث حالتها من قائمة الجرد.', 'catalogPanel');
  if (Number(staffMetrics.waiting) > 0) addTask(`راجع ${Number(staffMetrics.waiting).toLocaleString('ar-EG')} حجزًا في الانتظار`, 'تحقق من التسلسل والتخصيص من شاشة الحجوزات.', 'reservationsPanel');
  if (!tasks.length) addTask('لا توجد خطوات عاجلة في الفحص الحالي', 'تأكد دوريًا من صحة بيانات الفرع والعناوين؛ هذا الفحص لا يراقب المكتبة في الخلفية.');
  list.innerHTML = tasks.map(task => {
    const tab = task.panelId ? $(`.staff-tab[data-panel="${task.panelId}"]`) : null;
    const action = tab && !tab.hidden
      ? `<button class="loan-return" type="button" data-automation-panel="${escapeHtml(task.panelId)}">فتح القسم</button>`
      : (task.panelId ? '<small>اطلب من المالك أو الموظف ذي الصلاحية متابعة ذلك.</small>' : '');
    return `<li class="automation-task"><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.detail)}</p>${action}</li>`;
  }).join('');
}
$('#automationTasks').addEventListener('click', event => {
  const button = event.target.closest('[data-automation-panel]');
  if (!button) return;
  activatePanel(button.dataset.automationPanel);
  const panel = $(`#${button.dataset.automationPanel}`);
  panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  panel?.querySelector('form:not([hidden]) input, form:not([hidden]) select')?.focus({ preventScroll: true });
});
$('#runAutomationAudit').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  $('#automationSummary').textContent = 'جارٍ تحديث العدادات وبيانات الإعداد…';
  try {
    await loadStaffBranches();
    await Promise.all([refreshStaffStats(), loadInventory(), loadLibrarySettings()]);
    renderAutomationTasks();
  } finally {
    button.disabled = false;
  }
});
async function assistantErrorMessage(error) {
  let reason = '';
  let status = error?.status;
  const response = error?.context instanceof Response ? error.context : null;
  if (response) {
    status = response.status;
    try { reason = (await response.clone().json())?.error || ''; } catch { /* Use status-only guidance. */ }
  }
  if (reason === 'server_configuration_missing' || status === 503) return 'إعداد الخادم ناقص: تحقّق من GEMINI_API_KEY وAPP_ORIGIN وأسرار Supabase، ثم أعد المحاولة.';
  if (reason === 'origin_not_allowed') return 'نطاق الموقع غير مسموح به في APP_ORIGIN.';
  if (reason === 'not_authorized' || status === 403) return 'هذا الحساب لا يملك صلاحية استخدام مساعد المكتبة.';
  if (reason === 'authentication_required' || status === 401) return 'انتهت جلسة الدخول؛ سجّل الخروج ثم ادخل مجددًا.';
  if (reason === 'consent_required') return 'أكّد موافقتك على إرسال السؤال بعد التأكد من خلوه من بيانات الأشخاص.';
  if (reason === 'personal_data_not_allowed') return 'رُفض السؤال لأنه يبدو أنه يتضمن بيانات اتصال أو معرّفاً أو تفاصيل سجل؛ احذف بيانات الأشخاص وأعد صياغته كسؤال عام.';
  if (reason === 'invalid_request') return 'اختيار النموذج أو نوع الملخص غير مدعوم؛ اختر نموذجًا من القائمة ثم أعد المحاولة.';
  if (reason === 'metrics_unavailable') return 'تعذّر قراءة العدادات بصلاحيات هذا الحساب؛ لم تُرسل بيانات إلى Gemini.';
  if (reason === 'assistant_provider_failed' || status === 502) return 'رفض Gemini الطلب أو النموذج؛ تحقّق من المفتاح الخادمي وإتاحة النموذج في حساب Google.';
  return 'تعذّر الاتصال بالمساعد. راجع نشر Edge Function وأسرار الخادم والاتصال، دون إدخال المفتاح في الموقع.';
}
function appendAssistantChatMessage(kind, text) {
  const log = $('#assistantChatLog');
  if (!log) return;
  log.querySelector('.assistant-chat-empty')?.remove();
  const item = document.createElement('article');
  item.className = `assistant-chat-message ${kind}`;
  const label = document.createElement('strong');
  label.textContent = kind === 'user' ? 'أنت' : 'مساعد المكتبة';
  const body = document.createElement('p');
  body.textContent = text;
  item.append(label, body);
  log.append(item);
  log.scrollTop = log.scrollHeight;
}
function clearAssistantChat() {
  const log = $('#assistantChatLog');
  if (log) {
    log.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'assistant-chat-empty';
    empty.textContent = 'اسأل عن خطوات تنظيم العمل أو استخدام وظائف الموقع.';
    log.append(empty);
  }
  $('#assistantChatForm')?.reset();
  setMessage($('#assistantChatMessage'), 'المحادثة مؤقتة في هذه الجلسة ولا تُحفظ في قاعدة البيانات.');
}
$('#assistantTestButton').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!supabase || !currentLibraryId) return setMessage($('#assistantTestMessage'), 'سجّل الدخول بحساب مكتبة مخوّل أولاً.', 'error');
  button.disabled = true;
  setMessage($('#assistantTestMessage'), 'جارٍ اختبار الاتصال بطلب ثابت بلا بيانات مكتبة…');
  try {
    const { data, error } = await supabase.functions.invoke('library-assistant', {
      body: { library_id: currentLibraryId, mode: 'test', model: $('#assistantModel').value },
    });
    if (error) return setMessage($('#assistantTestMessage'), await assistantErrorMessage(error), 'error');
    if (!data?.ok) return setMessage($('#assistantTestMessage'), 'لم يؤكد الخادم نجاح الاتصال؛ تحقق من نشر الوظيفة والإعدادات.', 'error');
    setMessage($('#assistantTestMessage'), `الاتصال ناجح — ${data.model || $('#assistantModel').value}.`, 'success');
  } catch {
    setMessage($('#assistantTestMessage'), 'تعذّر إكمال اختبار الاتصال؛ تحقق من الوظيفة الخلفية والاتصال.', 'error');
  } finally { button.disabled = false; }
});
$('#assistantForm').addEventListener('submit', async event => {
  event.preventDefault();
  const intent = new FormData(event.currentTarget).get('intent');
  const model = $('#assistantModel').value;
  const button = $('.form-action', event.currentTarget);
  button.disabled = true;
  setMessage($('#assistantMessage'), 'جارٍ طلب ملخص من الوظيفة الخلفية…');
  const { data, error } = await supabase.functions.invoke('library-assistant', { body: { library_id: currentLibraryId, intent, model } });
  button.disabled = false;
  if (error) return setMessage($('#assistantMessage'), await assistantErrorMessage(error), 'error');
  const output = $('#assistantOutput');
  output.innerHTML = `<p>${escapeHtml(data?.summary || 'لا يوجد ملخص.')}</p>${Array.isArray(data?.actions) ? `<ul>${data.actions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;
  output.hidden = false;
  setMessage($('#assistantMessage'), 'ملخص إرشادي مبني على أعداد إجمالية فقط؛ راجع السجلات الأصلية قبل اتخاذ قرار.', 'success');
});
$('#managerAssistantForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['owner', 'admin'].includes(currentRole)) return setMessage($('#managerAssistantMessage'), 'ملخص مدير المكتبة متاح للمالك أو المسؤول فقط.', 'error');
  if (!supabase || !currentLibraryId) return setMessage($('#managerAssistantMessage'), 'سجّل الدخول بحساب مالك أو مسؤول للمكتبة أولاً.', 'error');
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  setMessage($('#managerAssistantMessage'), 'جارٍ طلب ملخص إجمالي من الوظيفة الخلفية…');
  try {
    const { data, error } = await supabase.functions.invoke('library-assistant', {
      body: { library_id: currentLibraryId, mode: 'summary', intent: 'manager_summary', model: $('#assistantModel').value },
    });
    if (error) return setMessage($('#managerAssistantMessage'), await assistantErrorMessage(error), 'error');
    const output = $('#managerAssistantOutput');
    output.innerHTML = `<p>${escapeHtml(data?.summary || 'لا يوجد ملخص.')}</p>${Array.isArray(data?.actions) ? `<ul>${data.actions.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}`;
    output.hidden = false;
    setMessage($('#managerAssistantMessage'), 'ملخص استرشادي يعتمد على أعداد وإعدادات مجمعة فقط. لا يرسل تنبيهاً ولا يغيّر بيانات المكتبة.', 'success');
  } catch {
    setMessage($('#managerAssistantMessage'), 'تعذّر الاتصال بمساعد المدير؛ لم يتغير أي سجل.', 'error');
  } finally {
    button.disabled = false;
  }
});
$('#assistantChatForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = String(new FormData(form).get('message') || '').trim();
  if (!message || message.length > 800) return setMessage($('#assistantChatMessage'), 'اكتب سؤالاً لا يتجاوز 800 حرف.', 'error');
  if (!form.elements.consent.checked) return setMessage($('#assistantChatMessage'), 'أكّد الموافقة بعد التأكد من عدم تضمين بيانات شخصية.', 'error');
  if (!supabase || !currentLibraryId) return setMessage($('#assistantChatMessage'), 'سجّل الدخول بحساب مكتبة مخوّل أولاً.', 'error');
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  form.elements.message.disabled = true;
  appendAssistantChatMessage('user', message);
  setMessage($('#assistantChatMessage'), 'جارٍ إرسال السؤال إلى Gemini…');
  try {
    const { data, error } = await supabase.functions.invoke('library-assistant', {
      body: { library_id: currentLibraryId, mode: 'chat', model: $('#assistantModel').value, message, consent: true },
    });
    if (error) return setMessage($('#assistantChatMessage'), await assistantErrorMessage(error), 'error');
    if (typeof data?.text !== 'string' || !data.text.trim()) return setMessage($('#assistantChatMessage'), 'لم تصل إجابة صالحة من Gemini؛ حاول مرة أخرى.', 'error');
    appendAssistantChatMessage('assistant', data.text);
    form.reset();
    setMessage($('#assistantChatMessage'), 'تمت الإجابة. راجع الإرشاد ولا تعتبره إجراءً منفّذاً.', 'success');
  } catch {
    setMessage($('#assistantChatMessage'), 'تعذّر الاتصال بالمساعد؛ لم تُحفظ الرسائل في قاعدة البيانات.', 'error');
  } finally {
    button.disabled = false;
    form.elements.message.disabled = false;
  }
});
$$('[data-staff-prompt]').forEach(button => button.addEventListener('click', () => {
  const input = $('#assistantChatInput');
  input.value = button.dataset.staffPrompt;
  input.focus();
}));
$('#refreshInventory').addEventListener('click', async () => { await loadInventory(); await refreshStaffStats(); });
$('#refreshLoans').addEventListener('click', async () => { await loadOpenLoans(); await refreshStaffStats(); });
$('#exportInventory').addEventListener('click', async () => {
  let titles, holdings, branches;
  try {
    [titles, holdings, branches] = await Promise.all([
      fetchAllPages(() => supabase.from('catalog_titles').select('id,general_number,title,author,classification,isbn,series_name').eq('library_id', currentLibraryId).order('general_number')),
      fetchAllPages(() => supabase.from('holdings').select('id,title_id,branch_id,inventory_tag,cabinet_code,shelf_code,public_shelf_label,status').eq('library_id', currentLibraryId).order('created_at')),
      fetchAllPages(() => supabase.from('branches').select('id,name').eq('library_id', currentLibraryId).order('name')),
    ]);
  } catch { return setMessage($('#workspaceMessage'), 'تعذّر تصدير الجرد أو تجاوز حد الأمان؛ تحقق من الصلاحية.', 'error'); }
  const titleMap = Object.fromEntries((titles || []).map(title => [title.id, title]));
  const branchMap = Object.fromEntries((branches || []).map(branch => [branch.id, branch.name]));
  const rows = [['الرقم العام', 'عنوان الكتاب', 'المؤلف', 'التصنيف (ديوي)', 'ISBN', 'السلسلة', 'الفرع', 'رقم النسخة', 'الدولاب', 'الرف الداخلي', 'وصف الرف العام', 'الحالة']];
  for (const holding of holdings || []) {
    const title = titleMap[holding.title_id] || {};
    rows.push([title.general_number, title.title, title.author, title.classification, title.isbn, title.series_name, branchMap[holding.branch_id], holding.inventory_tag, holding.cabinet_code, holding.shelf_code, holding.public_shelf_label, holding.status]);
  }
  const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'borsaid-library-inventory.csv'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setMessage($('#workspaceMessage'), 'تم تنزيل ملف الجرد. خزّنه في مكان آمن وفق سياسة المكتبة.', 'success');
});
$('#exportLoanReport').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const [loans, holdings, titles, branches] = await Promise.all([
      fetchAllPages(() => supabase.from('loans').select('holding_id,due_at,returned_at,created_at').eq('library_id', currentLibraryId).order('created_at')),
      fetchAllPages(() => supabase.from('holdings').select('id,title_id,branch_id').eq('library_id', currentLibraryId).order('id')),
      fetchAllPages(() => supabase.from('catalog_titles').select('id,general_number,title').eq('library_id', currentLibraryId).order('general_number')),
      fetchAllPages(() => supabase.from('branches').select('id,name').eq('library_id', currentLibraryId).order('name')),
    ]);
    const holdingMap = new Map(holdings.map(row => [row.id, row]));
    const titleMap = new Map(titles.map(row => [row.id, row]));
    const branchMap = new Map(branches.map(row => [row.id, row.name]));
    const grouped = new Map();
    const now = Date.now();
    for (const loan of loans) {
      const holding = holdingMap.get(loan.holding_id);
      const title = holding ? titleMap.get(holding.title_id) : null;
      if (!holding || !title) continue;
      const key = `${title.id}\u0000${holding.branch_id}`;
      if (!grouped.has(key)) grouped.set(key, { title, branch: branchMap.get(holding.branch_id) || 'فرع غير محدد', total: 0, open: 0, overdue: 0, returned: 0 });
      const summary = grouped.get(key);
      summary.total += 1;
      if (loan.returned_at) summary.returned += 1;
      else {
        summary.open += 1;
        if (loan.due_at && new Date(loan.due_at).getTime() < now) summary.overdue += 1;
      }
    }
    const rows = [['الرقم العام المحلي', 'عنوان الكتاب', 'الفرع', 'إجمالي الإعارات', 'المفتوحة', 'المتأخرة', 'المرتجعة']];
    [...grouped.values()].sort((a, b) => String(a.title.title).localeCompare(String(b.title.title), 'ar-EG') || a.branch.localeCompare(b.branch, 'ar-EG'))
      .forEach(row => rows.push([row.title.general_number, row.title.title, row.branch, row.total, row.open, row.overdue, row.returned]));
    const csv = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'borsaid-library-circulation-report.csv'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage($('#workspaceMessage'), loans.length ? 'تم تنزيل التقرير المجمع؛ لا يحتوي أسماء أو رموز مستعيرين.' : 'لا توجد إعارات مسجلة؛ نُزّل تقرير بعناوين الأعمدة فقط.', 'success');
  } catch {
    setMessage($('#workspaceMessage'), 'تعذّر إنشاء تقرير الإعارات؛ تحقق من صلاحية المكتبة والاتصال.', 'error');
  } finally {
    button.disabled = false;
  }
});

$('#dueAtInput').min = (() => { const date = new Date(); date.setDate(date.getDate() + 1); return date.toISOString().slice(0, 10); })();
$('#refreshInventory').addEventListener('click', () => loadReports());
$('#inventorySearch').addEventListener('input', renderInventoryTitles);
initializeBookImportControls({
  getSupabase: () => supabase,
  getLibraryId: () => currentLibraryId,
  getRole: () => currentRole,
  getBranches: () => staffBranches,
  getTitles: () => inventoryTitles,
  normalizeDeweyNumber,
  normalizeCatalogIsbn,
  escapeHtml,
  csvCell,
  onImported: async () => {
    await Promise.allSettled([loadInventory(), refreshStaffStats(), loadReports()]);
  },
});

async function start() {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.0');
    publicSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    publicAnalyticsSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init = {}) => fetch(input, {
          ...init,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        }),
      },
    });
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    trackPublicPageView(viewPanels.find(panel => !panel.hidden)?.dataset.viewPanel || 'home');
  } catch (error) {
    catalogStatus.textContent = 'تعذّر تحميل مكوّن الاتصال. تحقق من اتصال الإنترنت ثم أعد المحاولة.';
    const cached = cacheRead();
    if (cached?.results?.length) {
      publicBranches = cached.branches || [];
      publicResults = cached.results || [];
      paintBranches(publicBranches);
      updateBranchFilter(publicBranches);
      paintPublicCards(publicResults);
      catalogStatus.textContent = `عرض نسخة عامة محفوظة في ${formatDate(cached.saved_at)}. قد تكون الإتاحة تغيّرت.`;
    } else showEmpty('الاتصال غير متاح', 'يمكنك إعادة تحميل الصفحة عندما يستقر الاتصال.');
    return;
  }
  try {
    await Promise.all([
      loadSiteFooter().catch(() => {}),
      loadPublicBranches(),
    ]);
    await runPublicSearch();
  } catch {
    const cached = cacheRead();
    if (cached) {
      publicBranches = cached.branches || [];
      publicResults = cached.results || [];
      paintBranches(publicBranches);
      updateBranchFilter(publicBranches);
      paintPublicCards(publicResults);
      catalogStatus.textContent = `عرض نسخة عامة محفوظة في ${formatDate(cached.saved_at)}. قد تكون الإتاحة تغيّرت.`;
    } else {
      catalogStatus.textContent = 'تعذّر الاتصال بالفهرس؛ حاول تحديث الصفحة عند توفر الاتصال.';
      showEmpty('الفهرس غير متاح حالياً', 'لم تُحفظ نتائج عامة على هذا الجهاز بعد.');
    }
  }
  const { data: authData } = await supabase.auth.getSession();
  if (authData?.session) await loadMemberships();
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      window.setTimeout(() => loadMemberships(), 0);
    } else {
      currentLibraryId = null;
      currentRole = null;
      currentUserId = null;
      currentMemberships = [];
      configureRole(null);
      $('#ownerVisitorQuestionsList').replaceChildren();
      setWorkspaceMode(false);
    }
  });
}
void start();
async function loadLibraryMembers() {
  const tbody = $('#memberRows');
  let data;
  try {
    data = await fetchAllPages(() => supabase.from('library_memberships')
      .select('user_id,role,status').eq('library_id', currentLibraryId).order('role').order('user_id'));
  } catch { tbody.innerHTML = '<tr><td colspan="4" class="table-empty">تعذّر تحميل العضويات.</td></tr>'; return; }
  if (!data?.length) { tbody.innerHTML = '<tr><td colspan="4" class="table-empty">لا توجد عضويات.</td></tr>'; return; }
  const roles = [['owner','مالك'],['admin','مسؤول'],['librarian','أمين مكتبة'],['circulation','إعارة واستلام'],['reporter','تقارير فقط']];
  const roleLabels = Object.fromEntries(roles);
  const statusLabels = { active: 'نشط', suspended: 'موقوف' };
  tbody.innerHTML = data.map(member => {
    const protectedRole = currentRole === 'admin' && ['owner','admin'].includes(member.role);
    const roleControl = protectedRole ? escapeHtml(roleLabels[member.role]) : `<select class="member-role" aria-label="الدور" ${member.user_id === currentUserId ? 'disabled' : ''}>${roles.filter(([value]) => currentRole === 'owner' || !['owner','admin'].includes(value)).map(([value,label]) => `<option value="${value}" ${member.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
    const statusControl = protectedRole ? escapeHtml(statusLabels[member.status] || member.status) : `<select class="member-status" aria-label="الحالة" ${member.user_id === currentUserId ? 'disabled' : ''}><option value="active" ${member.status === 'active' ? 'selected' : ''}>نشط</option><option value="suspended" ${member.status === 'suspended' ? 'selected' : ''}>موقوف</option></select>`;
    const save = protectedRole || member.user_id === currentUserId ? '—' : `<button class="loan-return" data-member-save="${escapeHtml(member.user_id)}" type="button">حفظ</button>`;
    return `<tr><td title="${escapeHtml(member.user_id)}">${escapeHtml(member.user_id.slice(0,8))}…</td><td>${roleControl}</td><td>${statusControl}</td><td>${save}</td></tr>`;
  }).join('');
}

$('#holdingForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const button = $('.form-action', form);
  button.disabled = true;
  const { error } = await supabase.from('holdings').insert({
    library_id: currentLibraryId,
    branch_id: fields.get('branch_id'),
    title_id: fields.get('title_id'),
    inventory_tag: String(fields.get('inventory_tag') || '').trim() || null,
    cabinet_code: String(fields.get('cabinet_code') || '').trim() || null,
    shelf_code: String(fields.get('shelf_code') || '').trim() || null,
    public_shelf_label: String(fields.get('public_shelf_label') || '').trim() || null,
    status: 'available',
  });
  button.disabled = false;
  if (error) return setMessage($('#holdingMessage'), 'لم تُضف النسخة؛ تحقق من العنوان والفرع ورقم النسخة.', 'error');
  form.reset();
  setMessage($('#holdingMessage'), 'تمت إضافة النسخة. إن وُجد حجز انتظار، تُخصص له تلقائياً.', 'success');
  await Promise.all([loadInventory(), loadAvailableHoldings(), loadReservations(), refreshStaffStats(), loadReports()]);
});

$('#inventoryRows').addEventListener('click', event => {
  const button = event.target.closest('[data-edit-title]');
  if (!button) return;
  const title = inventoryTitles.find(row => row.id === button.dataset.editTitle);
  if (!title) return;
  const form = $('#titleEditForm');
  for (const key of ['id','general_number','title','author','classification','isbn','series_name']) form.elements[key].value = title[key] || '';
  form.elements.is_published.checked = Boolean(title.is_published);
  $('#titleEditDialog').showModal();
});
$('#titleEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const rawDewey = String(fields.get('classification') || '').trim();
  const dewey = normalizeDeweyNumber(rawDewey);
  const rawIsbn = String(fields.get('isbn') || '').trim();
  const isbn = rawIsbn ? normalizeCatalogIsbn(rawIsbn) : '';
  if (rawDewey && !dewey) return setMessage($('#titleEditMessage'), 'أدخل رقم ديوي من ثلاثة أرقام، ويمكن إضافة جزء عشري مثل 510.1.', 'error');
  if (rawIsbn && !isbn) return setMessage($('#titleEditMessage'), 'أدخل ISBN-10 أو ISBN-13 صحيحاً.', 'error');
  const { error } = await supabase.from('catalog_titles').update({
    general_number: String(fields.get('general_number')).trim(),
    title: String(fields.get('title')).trim(),
    author: String(fields.get('author') || '').trim() || null,
    classification: dewey || null,
    isbn: isbn || null,
    series_name: String(fields.get('series_name') || '').trim() || null,
    is_published: fields.get('is_published') === 'on',
  }).eq('id', fields.get('id')).eq('library_id', currentLibraryId);
  if (error) return setMessage($('#titleEditMessage'), 'تعذّر حفظ العنوان؛ قد يكون الرقم العام مكرراً.', 'error');
  $('#titleEditDialog').close();
  await Promise.all([loadInventory(), runPublicSearch().catch(() => {})]);
  setMessage($('#workspaceMessage'), 'تم تحديث سجل العنوان.', 'success');
});

$('#holdingRows').addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit-holding]');
  if (edit) {
    const holding = inventoryHoldings.find(row => row.id === edit.dataset.editHolding);
    if (!holding) return;
    const form = $('#holdingEditForm');
    for (const key of ['holding_id','branch_id','inventory_tag','cabinet_code','shelf_code','public_shelf_label']) {
      const source = key === 'holding_id' ? 'id' : key;
      form.elements[key].value = holding[source] || '';
    }
    $('#holdingEditDialog').showModal();
    return;
  }
  const check = event.target.closest('[data-inventory-result]');
  const statusButton = event.target.closest('[data-copy-status]');
  const button = check || statusButton;
  if (!button) return;
  button.disabled = true;
  const result = check
    ? await supabase.rpc('record_inventory_check', { p_library_id: currentLibraryId, p_holding_id: button.dataset.holdingId, p_result: button.dataset.inventoryResult, p_note: null })
    : await supabase.rpc('set_copy_status', { p_library_id: currentLibraryId, p_holding_id: button.dataset.holdingId, p_new_status: button.dataset.copyStatus });
  if (result.error) {
    button.disabled = false;
    return setMessage($('#workspaceMessage'), 'تعذّر تحديث حالة النسخة؛ قد يمنع ذلك إعارة أو حجز نشط.', 'error');
  }
  setMessage($('#workspaceMessage'), check ? 'سُجلت نتيجة الجرد وتحديث الحالة.' : 'تم تحديث حالة النسخة.', 'success');
  await Promise.all([loadInventory(), loadAvailableHoldings(), loadReservations(), refreshStaffStats(), loadReports()]);
});
$('#holdingEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const { error } = await supabase.rpc('update_holding_location', {
    p_library_id: currentLibraryId,
    p_holding_id: fields.get('holding_id'),
    p_branch_id: fields.get('branch_id'),
    p_inventory_tag: String(fields.get('inventory_tag') || '').trim() || null,
    p_cabinet_code: String(fields.get('cabinet_code') || '').trim() || null,
    p_shelf_code: String(fields.get('shelf_code') || '').trim() || null,
    p_public_shelf_label: String(fields.get('public_shelf_label') || '').trim() || null,
  });
  if (error) return setMessage($('#holdingEditMessage'), 'تعذّر حفظ الموقع؛ لا يمكن نقل نسخة معارة أو محجوزة.', 'error');
  $('#holdingEditDialog').close();
  await loadInventory();
  setMessage($('#workspaceMessage'), 'تم تحديث موقع النسخة.', 'success');
});
$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.closeDialog}`).close()));

$('#exportOperationalBackup').addEventListener('click', async () => {
  if (currentRole !== 'owner') return setMessage($('#workspaceMessage'), 'هذا التصدير متاح لمالك المكتبة فقط.', 'error');
  const tableSpecs = {
    branches: () => supabase.from('branches').select('*').eq('library_id', currentLibraryId).order('id'),
    catalog_titles: () => supabase.from('catalog_titles').select('*').eq('library_id', currentLibraryId).order('id'),
    holdings: () => supabase.from('holdings').select('*').eq('library_id', currentLibraryId).order('id'),
    patrons: () => supabase.from('patrons').select('*').eq('library_id', currentLibraryId).order('id'),
    loans: () => supabase.from('loans').select('*').eq('library_id', currentLibraryId).order('id'),
    reservations: () => supabase.from('reservations').select('*').eq('library_id', currentLibraryId).order('id'),
    visitors: () => supabase.from('visitors').select('*').eq('library_id', currentLibraryId).order('id'),
    inventory_checks: () => supabase.from('inventory_checks').select('*').eq('library_id', currentLibraryId).order('id'),
    interlibrary_requests: () => supabase.from('interlibrary_requests').select('*').or(`source_library_id.eq.${currentLibraryId},destination_library_id.eq.${currentLibraryId}`).order('id'),
    library_memberships: () => supabase.from('library_memberships').select('library_id,user_id,role,status,created_at').eq('library_id', currentLibraryId).order('user_id'),
  };
  const button = $('#exportOperationalBackup');
  button.disabled = true;
  let records;
  try {
    records = Object.fromEntries(await Promise.all(Object.entries(tableSpecs).map(async ([name, query]) => [name, await fetchAllPages(query)])));
  } catch {
    button.disabled = false;
    return setMessage($('#workspaceMessage'), 'تعذّر إنشاء التصدير؛ قد تكون بعض الجداول غير متاحة أو تجاوزت حد الأمان.', 'error');
  }
  button.disabled = false;
  const backup = {
    format: 'borsaid-school-library-operational-export-v1',
    generated_at: new Date().toISOString(),
    library_id: currentLibraryId,
    library_name: $('#workspaceTitle').textContent,
    warning: 'Sensitive operational data. Not a complete PostgreSQL backup; does not contain Auth credentials, Storage files or platform configuration.',
    records,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `borsaid-library-operational-${new Date().toISOString().slice(0,10)}.json`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setMessage($('#workspaceMessage'), 'تم تنزيل تصدير تشغيلي حساس؛ خزّنه مشفراً وبصلاحيات مقيدة.', 'success');
});

$('#dueAtInput').min = (() => { const date = new Date(); date.setDate(date.getDate() + 1); return date.toISOString().slice(0, 10); })();
$('#branchEditSelect').addEventListener('change', event => {
  const branch = staffBranches.find(row => row.id === event.target.value);
  if (!branch) return;
  const form = $('#branchEditForm');
  for (const key of ['id','name','governorate','city','public_address','public_phone','public_email']) form.elements[key].value = branch[key] || '';
  form.elements.is_published.checked = Boolean(branch.is_published);
});
$('#branchEditForm').addEventListener('submit', async event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const { error } = await supabase.from('branches').update({
    name: String(fields.get('name')).trim(),
    governorate: String(fields.get('governorate') || '').trim() || null,
    city: String(fields.get('city') || '').trim() || null,
    public_address: String(fields.get('public_address') || '').trim() || null,
    public_phone: String(fields.get('public_phone') || '').trim() || null,
    public_email: String(fields.get('public_email') || '').trim() || null,
    is_published: fields.get('is_published') === 'on',
  }).eq('id', fields.get('id')).eq('library_id', currentLibraryId);
  if (error) return setMessage($('#branchEditMessage'), 'تعذّر حفظ بيانات الفرع؛ تحقق من صلاحية الحساب.', 'error');
  setMessage($('#branchEditMessage'), 'تم تحديث الفرع.', 'success');
  await Promise.all([loadStaffBranches(), loadPublicBranches(), runPublicSearch()]);
});
$('#libraryPublicationForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['owner', 'admin'].includes(currentRole)) return setMessage($('#libraryPublicationMessage'), 'تغيير ظهور المكتبة متاح للمالك أو المسؤول فقط.', 'error');
  if (currentLibraryIsPublished === null) return setMessage($('#libraryPublicationMessage'), 'تعذّر التحقق من الحالة الحالية. أعد تحميل الإعدادات قبل الحفظ.', 'error');
  const form = event.currentTarget;
  const nextValue = form.elements.is_published.checked;
  if (nextValue === currentLibraryIsPublished) return setMessage($('#libraryPublicationMessage'), 'لم يتغير إعداد النشر.', '');
  const libraryName = $('#workspaceTitle').textContent;
  const actionText = nextValue
    ? `سيتيح ذلك ظهور السجلات التي نُشرت كلٌّ على حدة من مكتبة «${libraryName}» في البحث العام.`
    : `سيخفي ذلك المكتبة «${libraryName}» وجميع فروعها وعناوينها من البحث العام دون حذف السجلات.`;
  if (!window.confirm(`${actionText}\n\nهل تريد المتابعة؟`)) {
    form.elements.is_published.checked = currentLibraryIsPublished;
    return setMessage($('#libraryPublicationMessage'), 'أُلغي التغيير؛ لم تُعدّل قاعدة البيانات.', '');
  }
  const button = $('.form-action', form);
  button.disabled = true;
  const { data: savedPublication, error } = await supabase.from('libraries').update({ is_published: nextValue })
    .eq('id', currentLibraryId).select('is_published').maybeSingle();
  button.disabled = false;
  if (error || !savedPublication) {
    form.elements.is_published.checked = currentLibraryIsPublished;
    return setMessage($('#libraryPublicationMessage'), 'تعذّر حفظ حالة النشر؛ تحقق من صلاحية المالك أو المسؤول والاتصال.', 'error');
  }
  currentLibraryIsPublished = Boolean(savedPublication.is_published);
  $('#libraryPublicationStatus').textContent = nextValue
    ? 'المكتبة منشورة؛ لا يظهر للعامة إلا الفرع والعنوان والنسخة المنشورة كلٌّ على حدة.'
    : 'المكتبة غير منشورة؛ لذلك لن تظهر أي فروع أو كتب منها في البحث العام.';
  setMessage($('#libraryPublicationMessage'), nextValue ? 'نُشرت المكتبة بعد تأكيدك؛ لم تُنشر أي سجلات غير معتمدة.' : 'أُخفيت المكتبة من الفهرس العام دون حذف سجلاتها.', 'success');
  await loadStaffBranches();
  await loadPublicBranches().catch(() => {});
  await runPublicSearch();
  await Promise.all([refreshStaffStats(), loadReports()]);
  renderAutomationTasks();
});
$('#sharingSettingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!['owner','admin'].includes(currentRole)) return setMessage($('#sharingSettingsMessage'), 'تغيير المشاركة متاح للمالك أو المسؤول فقط.', 'error');
  const form = event.currentTarget;
  const button = $('.form-action', form);
  button.disabled = true;
  const { error } = await supabase.from('libraries').update({
    interlibrary_enabled: form.elements.interlibrary_enabled.checked,
  }).eq('id', currentLibraryId);
  button.disabled = false;
  if (error) return setMessage($('#sharingSettingsMessage'), 'تعذّر حفظ إعداد المشاركة؛ تحقق من الصلاحية والاتصال.', 'error');
  setMessage($('#sharingSettingsMessage'), 'حُفظ إعداد المشاركة بين المكتبات.', 'success');
  await loadPublicBranches().catch(() => {});
  await loadInterlibraryRequests();
});

// Manual owner report: preview never sends; only the explicit confirmation calls send.
$('#previewOwnerReport').addEventListener('click', async event => {
  if (ownerReportDeliveryBusy || !supabase || !hasPlatformOwnerAccess(currentMemberships)) return;
  const button = event.currentTarget;
  ownerReportDeliveryBusy = true;
  button.disabled = true;
  ownerReportPreview = null;
  setMessage($('#ownerReportDeliveryStatus'), 'جارٍ إعداد معاينة التقرير الشامل؛ لن تُرسل رسائل الآن…');
  try {
    const { data, error } = await supabase.functions.invoke('platform-library-report', {
      body: { action: 'preview', model: $('#assistantModel').value },
    });
    if (error || !data?.token || !Array.isArray(data.messages)) throw new Error('preview_failed');
    ownerReportPreview = { token: data.token, expires: Date.parse(data.expires_at) };
    $('#ownerReportPreviewDestination').textContent = `الوجهة: ${data.destination}. عدد الرسائل: ${data.messages.length}. ${data.ai_included ? 'يتضمن ملخص Gemini.' : 'ملخص Gemini غير متاح؛ يتضمن التقرير العددي الكامل.'}`;
    const output = $('#ownerReportPreviewText');
    output.replaceChildren();
    data.messages.forEach(text => { const part = document.createElement('pre'); part.textContent = text; output.append(part); });
    $('#confirmOwnerReportSend').disabled = false;
    setMessage($('#ownerReportDialogStatus'), 'لم يُرسل التقرير بعد.');
    $('#ownerReportDialog').showModal();
    setMessage($('#ownerReportDeliveryStatus'), 'المعاينة جاهزة؛ راجعها ثم أكّد الإرسال أو ألغِه.');
  } catch {
    setMessage($('#ownerReportDeliveryStatus'), 'تعذّر إعداد المعاينة. تحقّق من جلسة المالك وإعداد البوت الخادمي؛ لم تُرسل أي رسالة.', 'error');
  } finally { button.disabled = false; ownerReportDeliveryBusy = false; }
});
$('#cancelOwnerReportSend').addEventListener('click', () => { ownerReportPreview = null; $('#ownerReportDialog').close(); });
$('#ownerReportDialog').addEventListener('cancel', event => { if (ownerReportDeliveryBusy) event.preventDefault(); else ownerReportPreview = null; });
$('#confirmOwnerReportSend').addEventListener('click', async event => {
  if (ownerReportDeliveryBusy || !ownerReportPreview || !hasPlatformOwnerAccess(currentMemberships)) return;
  if (Date.now() >= ownerReportPreview.expires) { ownerReportPreview = null; event.currentTarget.disabled = true; return setMessage($('#ownerReportDialogStatus'), 'انتهت المعاينة؛ أغلقها وأنشئ معاينة جديدة.', 'error'); }
  const token = ownerReportPreview.token;
  ownerReportPreview = null;
  ownerReportDeliveryBusy = true;
  event.currentTarget.disabled = true;
  $('#cancelOwnerReportSend').disabled = true;
  setMessage($('#ownerReportDialogStatus'), 'جارٍ إرسال الرسائل المعروضة إلى المالك… لا تضغط مرة أخرى.');
  try {
    const { data, error } = await supabase.functions.invoke('platform-library-report', { body: { action: 'send', token, confirm: true } });
    if (error || !data?.ok) throw new Error('delivery_uncertain');
    setMessage($('#ownerReportDialogStatus'), `تم إرسال التقرير كاملًا (${data.sent_parts} رسائل) إلى Telegram.`, 'success');
    setMessage($('#ownerReportDeliveryStatus'), 'تم إرسال التقرير يدويًا بنجاح. الإرسال التلقائي غير مفعّل.', 'success');
  } catch {
    const message = 'تعذّر تأكيد اكتمال الإرسال؛ قد تكون بعض الرسائل وصلت. راجع Telegram قبل إنشاء معاينة جديدة؛ لن نعيد الإرسال تلقائيًا.';
    setMessage($('#ownerReportDialogStatus'), message, 'error');
    setMessage($('#ownerReportDeliveryStatus'), message, 'error');
  } finally { ownerReportDeliveryBusy = false; $('#cancelOwnerReportSend').disabled = false; }
});
