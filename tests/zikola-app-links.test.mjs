import test from 'node:test';
import assert from 'node:assert/strict';
import {getReadingDestination,ANDROID_STORE,IOS_STORE,enhanceReadingLinks} from '../zikola-app-links.mjs';
const android={userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'};
test('Android Chrome uses official publisher HTTPS app route with explicit store fallback',()=>{
  for(const key of ['zikola','amarita']) {
    const d=getReadingDestination(key,android);
    assert.ok(d.href.startsWith('intent://www.aseeralkotb.com/ar/books/'));
    assert.ok(d.href.includes(';scheme=https;package=com.asseralkotb;'));
    assert.ok(d.href.endsWith('S.browser_fallback_url='+encodeURIComponent(ANDROID_STORE)+';end'));
    assert.equal(d.target,'_self');
  }
  assert.notEqual(getReadingDestination('zikola',android).href,getReadingDestination('amarita',android).href);
});
test('iPhone and iPad use verified App Store, never an invented URL scheme',()=>{
  for(const device of [{userAgent:'iPhone OS 17 Safari'},{userAgent:'iPad'},{platform:'MacIntel',maxTouchPoints:5}]) {
    assert.equal(getReadingDestination('zikola',device).href,IOS_STORE);
  }
});
test('desktop, other Android browsers and webviews retain safe HTTPS store links',()=>{
  for(const device of [{},{userAgent:'Android Firefox/130'},{userAgent:'Android; wv) Chrome/130.0'},{userAgent:'Windows Chrome/130'}]) assert.equal(getReadingDestination('amarita',device).href,ANDROID_STORE);
});
test('part three and unknown titles have no reading route',()=>{
  for(const key of ['third','__proto__','']) assert.throws(()=>getReadingDestination(key,android),TypeError);
});
test('enhancement updates only the two marked book links',()=>{
  const links=['zikola','amarita'].map(key=>({dataset:{zikolaBook:key},querySelector:()=>({set textContent(value){assert.ok(value.includes('Android'));}})}));
  enhanceReadingLinks({querySelectorAll(selector){assert.equal(selector,'[data-zikola-book]');return links;}},android);
  assert.ok(links.every(link=>link.href.startsWith('intent:') && link.target==='_self'));
});
