import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { SITE_MEDIA_BUCKET, SITE_MEDIA_ITEMS } from './site-media-config.js?v=20261016-header-gallery-1';

const SUPABASE_URL = 'https://eahptkwvjcnixlzlyznh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MpskNH6FyBeuQmb3Y9V2Aw_7d2L9x00';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const DYNAMIC_HEADER_GALLERY_KEY = /^header-feature-image-(?:[6-9]|1[0-9]|2[0-5])$/;

const publicClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function setMetaImage(key, imageUrl, altText) {
  if (key === 'site-favicon') {
    const icon = document.querySelector('link[rel~="icon"]');
    if (!icon) return;
    icon.href = imageUrl;
    const typeByMime = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/webp': 'image/webp' };
    if (typeByMime[altText]) icon.type = typeByMime[altText];
    else icon.type = 'image/svg+xml';
    return;
  }
  if (key !== 'social-preview') return;
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const meta = document.querySelector(selector);
    if (meta) meta.content = imageUrl;
  }
  const alt = document.querySelector('meta[property="og:image:alt"]');
  if (alt) alt.content = altText;
}

function imageTargets(item) {
  const alreadyTagged = [...document.querySelectorAll('[data-site-media-key]')]
    .filter(image => image.dataset.siteMediaKey === item.key);
  if (alreadyTagged.length) return alreadyTagged;
  if (item.key.startsWith('leader-')) {
    const configuredTargets = item.selectors.flatMap(selector => [...document.querySelectorAll(selector)]);
    if (configuredTargets.length) return configuredTargets;
    const fileName = item.defaultSrc.split('/').pop();
    return [...document.querySelectorAll('.leadership-photo')]
      .filter(image => (image.getAttribute('src') || '').split(/[?#]/, 1)[0].endsWith(fileName));
  }
  return item.selectors.flatMap(selector => [...document.querySelectorAll(selector)]);
}

function syncDynamicHeaderSlides(slots) {
  const frame = document.querySelector('.header-feature-image-slot');
  if (!frame) return [];
  const slides = slots.filter(slot => DYNAMIC_HEADER_GALLERY_KEY.test(slot.media_key) && slot.current_asset_id)
    .sort((a, b) => Number(a.media_key.match(/(\d+)$/)?.[1]) - Number(b.media_key.match(/(\d+)$/)?.[1]));
  const desiredKeys = new Set(slides.map(slide => slide.media_key));
  frame.querySelectorAll('img[data-site-media-dynamic="true"]').forEach(image => {
    if (!desiredKeys.has(image.dataset.siteMediaKey)) image.remove();
  });
  const controls = frame.querySelector('.header-photo-controls');
  for (const slide of slides) {
    const existing = [...frame.querySelectorAll('img[data-site-media-key]')]
      .find(image => image.dataset.siteMediaKey === slide.media_key);
    if (existing) continue;
    const image = document.createElement('img');
    image.className = 'brand-header-photo';
    image.dataset.siteMediaKey = slide.media_key;
    image.dataset.siteMediaDynamic = 'true';
    image.alt = slide.title || 'صورة إضافية في ألبوم مكتبات بورسعيد';
    image.width = 960;
    image.height = 720;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.setAttribute('fetchpriority', 'low');
    image.setAttribute('aria-hidden', 'true');
    if (controls) frame.insertBefore(image, controls);
    else frame.append(image);
  }
  return slides;
}

function setImageSource(image, source, altText, isCustom, defaultAlt, mediaKey, defaultSrc, srcSet = '', originalSource = '', creditText = '', creditHref = '') {
  image.dataset.siteMediaDefault = defaultSrc;
  const fallbackUrl = new URL(defaultSrc, document.baseURI).href;
  image.dataset.siteMediaKey = mediaKey;
  image.dataset.siteMediaFallbackUrl = fallbackUrl;
  image.dataset.siteMediaCustom = String(Boolean(isCustom));
  image.dataset.siteMediaFallbackApplied = 'false';
  image.dataset.siteMediaOriginalUrl = isCustom ? (originalSource || source) : '';
  image.dataset.siteMediaOriginalFallbackApplied = 'false';
  image.dataset.siteMediaDefaultAlt = defaultAlt;
  image.dataset.siteMediaCreditText = creditText || '';
  image.dataset.siteMediaCreditHref = creditHref || '';
  image.alt = altText || defaultAlt;
  if (mediaKey.startsWith('header-feature-image')) {
    const isPrimaryHeaderImage = mediaKey === 'header-feature-image';
    image.loading = isPrimaryHeaderImage ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.setAttribute('fetchpriority', isPrimaryHeaderImage ? 'high' : 'low');
    if (srcSet) {
      image.setAttribute('srcset', srcSet);
      image.setAttribute('sizes', '(max-width: 700px) min(410px, calc(100vw - 48px)), 380px');
    } else {
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
    }
  }
  if (mediaKey === 'site-mark') {
    const isPrimaryLogo = image.id === 'brandDefaultLogo';
    image.loading = isPrimaryLogo ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.setAttribute('fetchpriority', isPrimaryLogo ? 'high' : 'low');
  }
  if (!image.dataset.siteMediaFallbackBound) {
    image.addEventListener('error', () => {
      if (image.dataset.siteMediaCustom !== 'true') return;
      const original = image.dataset.siteMediaOriginalUrl;
      if (image.dataset.siteMediaOriginalFallbackApplied !== 'true' && original && image.src !== original) {
        image.dataset.siteMediaOriginalFallbackApplied = 'true';
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
        image.src = original;
        return;
      }
      if (image.dataset.siteMediaFallbackApplied === 'true') return;
      const fallback = image.dataset.siteMediaFallbackUrl;
      if (!fallback || image.src === fallback) return;
      image.dataset.siteMediaFallbackApplied = 'true';
      image.alt = image.dataset.siteMediaDefaultAlt || '';
      image.src = fallback;
    });
    image.dataset.siteMediaFallbackBound = 'true';
  }
  const nextSource = source || fallbackUrl;
  const isDynamicGallerySlide = DYNAMIC_HEADER_GALLERY_KEY.test(mediaKey);
  if (isDynamicGallerySlide) {
    image.dataset.siteMediaDeferredSrc = nextSource;
    image.dataset.siteMediaDeferredSrcset = srcSet || '';
    if (!image.classList.contains('is-active')) {
      image.removeAttribute('src');
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      return;
    }
  } else {
    delete image.dataset.siteMediaDeferredSrc;
    delete image.dataset.siteMediaDeferredSrcset;
  }
  if (image.getAttribute('src') !== nextSource) image.src = nextSource;
}

const HEADER_IMAGE_VARIANTS = Object.freeze([
  { width: 480, height: 360, quality: 78 },
  { width: 960, height: 720, quality: 78 },
]);
const SITE_MARK_VARIANT = Object.freeze({ width: 144, height: 144, quality: 80 });

async function createResponsiveSiteMarkUrl(asset) {
  if (!asset?.storage_path) return '';
  try {
    const { data, error } = await publicClient.storage.from(SITE_MEDIA_BUCKET).createSignedUrl(
      asset.storage_path,
      SIGNED_URL_TTL_SECONDS,
      { transform: { ...SITE_MARK_VARIANT, resize: 'contain', format: 'webp' } },
    );
    return error || !data?.signedUrl ? '' : data.signedUrl;
  } catch {
    return '';
  }
}

async function createResponsiveHeaderImageUrls(asset, variantsToCreate = HEADER_IMAGE_VARIANTS) {
  if (!asset?.storage_path) return [];
  const variants = await Promise.all(variantsToCreate.map(async ({ width, height, quality }) => {
    try {
      const { data, error } = await publicClient.storage.from(SITE_MEDIA_BUCKET).createSignedUrl(
        asset.storage_path,
        SIGNED_URL_TTL_SECONDS,
        { transform: { width, height, resize: 'contain', quality } },
      );
      return error || !data?.signedUrl ? null : { width, url: data.signedUrl };
    } catch {
      return null;
    }
  }));
  return variants.filter(Boolean);
}

export async function refreshPublicSiteMedia() {
  try {
    const [
      { data: slots, error: slotError },
      { data: gallerySettings },
    ] = await Promise.all([
      publicClient.from('site_media_slots')
        .select('media_key,title,current_asset_id,is_published')
        .eq('is_published', true).order('media_key').limit(100),
      publicClient.from('site_banner_settings')
        .select('interval_seconds').eq('setting_key', 'homepage').maybeSingle(),
    ]);
    if (slotError || !slots) return false;

    const dynamicGallerySlides = syncDynamicHeaderSlides(slots);
    const dynamicGalleryItems = dynamicGallerySlides.map(slot => ({
      key: slot.media_key,
      category: 'ألبوم صور البنر',
      title: slot.title || 'صورة إضافية في ألبوم مكتبات بورسعيد',
      usage: 'صورة أضافها مالك الموقع إلى ألبوم البنر.',
      defaultSrc: 'assets/header-photo-placeholder.svg',
      defaultAlt: slot.title || 'صورة إضافية في ألبوم مكتبات بورسعيد',
      selectors: [],
    }));
    const activeSlots = new Map(slots.map(slot => [slot.media_key, slot]));
    const assetIds = [...new Set(slots.map(slot => slot.current_asset_id).filter(Boolean))];
    let assets = [];
    if (assetIds.length) {
      const { data, error } = await publicClient
        .from('site_media_assets')
        .select('id,media_key,storage_path,alt_text,mime_type,description')
        .in('id', assetIds);
      if (error || !data) return false;
      assets = data;
    }
    const assetById = new Map(assets.map(asset => [asset.id, asset]));
    const paths = assets.map(asset => asset.storage_path);
    const headerAssets = assets.filter(asset => asset.media_key.startsWith('header-feature-image'));
    const signedRequest = paths.length
      ? publicClient.storage.from(SITE_MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
      : Promise.resolve({ data: [], error: null });
    const headerVariantsRequest = Promise.all(headerAssets.map(async asset => [
      asset.media_key,
      await createResponsiveHeaderImageUrls(asset, DYNAMIC_HEADER_GALLERY_KEY.test(asset.media_key)
        ? [HEADER_IMAGE_VARIANTS[1]]
        : HEADER_IMAGE_VARIANTS),
    ]));
    const siteMarkAsset = assets.find(asset => asset.media_key === 'site-mark');
    const siteMarkVariantRequest = siteMarkAsset
      ? createResponsiveSiteMarkUrl(siteMarkAsset)
      : Promise.resolve('');
    const [signedResponse, headerVariantEntries, siteMarkVariant] = await Promise.all([
      signedRequest,
      headerVariantsRequest,
      siteMarkVariantRequest,
    ]);
    if (signedResponse.error || !signedResponse.data) return false;
    const headerVariantsByKey = new Map(headerVariantEntries);
    const signedByPath = new Map();
    for (const result of signedResponse.data) {
      if (result.path && result.signedUrl && !result.error) signedByPath.set(result.path, result.signedUrl);
    }

    for (const item of [...SITE_MEDIA_ITEMS, ...dynamicGalleryItems]) {
      const slot = activeSlots.get(item.key);
      if (!slot) continue;
      const asset = slot.current_asset_id ? assetById.get(slot.current_asset_id) : null;
      const signedUrl = asset ? signedByPath.get(asset.storage_path) : '';
      const responsiveHeaderSources = headerVariantsByKey.get(item.key) || [];
      const responsiveSiteMark = item.key === 'site-mark' ? siteMarkVariant : '';
      if (slot.current_asset_id && !signedUrl && !responsiveHeaderSources.length && !responsiveSiteMark) continue;
      const imageUrl = signedUrl || item.defaultSrc;
      const altText = asset?.alt_text || item.defaultAlt;
      if (item.key === 'site-favicon' || item.key === 'social-preview') {
        setMetaImage(item.key, imageUrl, item.key === 'site-favicon' ? asset?.mime_type || '' : altText);
        continue;
      }
      const headerSrcSet = responsiveHeaderSources.map(variant => `${variant.url} ${variant.width}w`).join(', ');
      const displayUrl = responsiveSiteMark || (responsiveHeaderSources.length
        ? responsiveHeaderSources[responsiveHeaderSources.length - 1].url
        : imageUrl);
      imageTargets(item).forEach(image => {
        if (!(image instanceof HTMLImageElement)) return;
        const isUnchangedBootstrapImage = (item.key === 'header-feature-image' || item.key === 'site-mark')
          && asset?.storage_path
          && image.dataset.siteMediaBootstrapPath === asset.storage_path
          && image.getAttribute('src') === image.dataset.siteMediaBootstrapSrc;
        setImageSource(
          image,
          isUnchangedBootstrapImage ? image.dataset.siteMediaBootstrapSrc : displayUrl,
          altText,
          Boolean(signedUrl || responsiveHeaderSources.length || responsiveSiteMark),
          item.defaultAlt,
          item.key,
          item.defaultSrc,
          isUnchangedBootstrapImage ? '' : headerSrcSet,
          item.key === 'site-mark' || item.key.startsWith('header-feature-image') ? signedUrl : '',
          asset?.description || item.defaultCredit?.text || '',
          asset ? '' : (item.defaultCredit?.href || ''),
        );
      });
    }
    const intervalSeconds = Number(gallerySettings?.interval_seconds);
    window.dispatchEvent(new CustomEvent('header-gallery-updated', {
      detail: { intervalSeconds: Number.isFinite(intervalSeconds) ? intervalSeconds : 8 },
    }));
    return true;
  } catch {
    return false;
  }
}

window.addEventListener('site-media-updated', () => { void refreshPublicSiteMedia(); });
void refreshPublicSiteMedia();
