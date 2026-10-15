import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { SITE_MEDIA_BUCKET, SITE_MEDIA_ITEMS } from './site-media-config.js?v=20261015-header-photo-1';

const SUPABASE_URL = 'https://eahptkwvjcnixlzlyznh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MpskNH6FyBeuQmb3Y9V2Aw_7d2L9x00';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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

function setImageSource(image, source, altText, isCustom, defaultAlt, mediaKey, defaultSrc) {
  image.dataset.siteMediaDefault = defaultSrc;
  const fallbackUrl = new URL(defaultSrc, document.baseURI).href;
  image.dataset.siteMediaKey = mediaKey;
  image.dataset.siteMediaFallbackUrl = fallbackUrl;
  image.dataset.siteMediaCustom = String(Boolean(isCustom));
  image.dataset.siteMediaFallbackApplied = 'false';
  image.dataset.siteMediaDefaultAlt = defaultAlt;
  image.alt = altText || defaultAlt;
  if (!image.dataset.siteMediaFallbackBound) {
    image.addEventListener('error', () => {
      if (image.dataset.siteMediaCustom !== 'true' || image.dataset.siteMediaFallbackApplied === 'true') return;
      const fallback = image.dataset.siteMediaFallbackUrl;
      if (!fallback || image.src === fallback) return;
      image.dataset.siteMediaFallbackApplied = 'true';
      image.alt = image.dataset.siteMediaDefaultAlt || '';
      image.src = fallback;
    });
    image.dataset.siteMediaFallbackBound = 'true';
  }
  image.src = source || fallbackUrl;
}

export async function refreshPublicSiteMedia() {
  try {
    const { data: slots, error: slotError } = await publicClient
      .from('site_media_slots')
      .select('media_key,current_asset_id,is_published')
      .eq('is_published', true);
    if (slotError || !slots) return false;

    const activeSlots = new Map(slots.map(slot => [slot.media_key, slot]));
    const assetIds = [...new Set(slots.map(slot => slot.current_asset_id).filter(Boolean))];
    let assets = [];
    if (assetIds.length) {
      const { data, error } = await publicClient
        .from('site_media_assets')
        .select('id,media_key,storage_path,alt_text,mime_type')
        .in('id', assetIds);
      if (error || !data) return false;
      assets = data;
    }
    const assetById = new Map(assets.map(asset => [asset.id, asset]));
    const paths = assets.map(asset => asset.storage_path);
    const signedByPath = new Map();
    if (paths.length) {
      const { data, error } = await publicClient.storage
        .from(SITE_MEDIA_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (error || !data) return false;
      for (const result of data) {
        if (result.path && result.signedUrl && !result.error) signedByPath.set(result.path, result.signedUrl);
      }
    }

    for (const item of SITE_MEDIA_ITEMS) {
      const slot = activeSlots.get(item.key);
      if (!slot) continue;
      const asset = slot.current_asset_id ? assetById.get(slot.current_asset_id) : null;
      const signedUrl = asset ? signedByPath.get(asset.storage_path) : '';
      if (slot.current_asset_id && !signedUrl) continue;
      const imageUrl = signedUrl || item.defaultSrc;
      const altText = asset?.alt_text || item.defaultAlt;
      if (item.key === 'site-favicon' || item.key === 'social-preview') {
        setMetaImage(item.key, imageUrl, item.key === 'site-favicon' ? asset?.mime_type || '' : altText);
        continue;
      }
      imageTargets(item).forEach(image => {
        if (image instanceof HTMLImageElement) setImageSource(image, imageUrl, altText, Boolean(signedUrl), item.defaultAlt, item.key, item.defaultSrc);
      });
    }
    return true;
  } catch {
    return false;
  }
}

window.addEventListener('site-media-updated', () => { void refreshPublicSiteMedia(); });
void refreshPublicSiteMedia();
