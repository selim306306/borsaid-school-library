export function shouldShowSchoolNameOnHomepage(profile) {
  return profile?.show_school_name_on_homepage !== false;
}

export function renderPublicProfilesAsSoonAsAvailable(profilesRequest, onProfilesReady) {
  return Promise.resolve(profilesRequest).then((result) => {
    const profiles = result?.error ? [] : (result?.data || []);
    onProfilesReady(profiles);
    return result;
  });
}

export function bindPublicLogoFallback(image, originalUrl, { eager = false } = {}) {
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
export function deduplicatePublicSchoolProfiles(profiles = []) {
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
export function renderPublicSchoolBranding(profiles = [], publicLogoUrl, root = document) {
  const $ = selector => root.querySelector(selector);
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
  title.textContent = 'المكتبة المدرسية الرقمية';
  subtitle.replaceChildren();
  if (!schoolProfiles.length) {
    subtitle.removeAttribute('title');
    subtitle.textContent = 'مكتبات المدارس في بورسعيد';
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
