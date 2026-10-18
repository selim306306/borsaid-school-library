import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../supabase/functions/education-news/index.ts',import.meta.url),'utf8');
test('news parser stays on patched v4 release with entity processing disabled',()=>{
  assert.match(code,/npm:fast-xml-parser@4\.5\.5/);
  assert.match(code,/processEntities:\s*false/);
});
test('entity processing stays disabled and the unused XMLBuilder stays excluded',()=>{
  assert.match(code,/processEntities:\s*false/);
  assert.doesNotMatch(code,/XMLBuilder/);
  const entityConfig=code.match(/const xmlParser = new XMLParser\(\{[\s\S]*?\}\);/)?.[0];
  assert.ok(entityConfig);
  assert.match(entityConfig,/processEntities:\s*false/);
  assert.match(entityConfig,/parseTagValue:\s*false/);
});
test('declarations are rejected before XML validation and parsing',()=>{
  const guard=code.match(/function rejectXmlDeclarations\(xml: string\)\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(guard);
  const reject=vm.runInNewContext(`(${guard.replace('xml: string','xml')})`);
  for(const xml of ['<!DOCTYPE rss><rss/>','<!doctype rss SYSTEM "file:///not-read"><rss/>','<!ENTITY x "blocked"><rss/>','<rss><!-- <!ENTITY x "blocked"> --></rss>']){
    assert.throws(()=>reject(xml),/unsupported_xml_declaration/);
  }
  assert.doesNotThrow(()=>reject('<rss><channel><title>خبر آمن</title></channel></rss>'));
  assert.doesNotThrow(()=>reject('<feed><entry><title>خبر آمن</title></entry></feed>'));
  const fetchBody=code.slice(code.indexOf('async function fetchFeed'));
  assert.ok(fetchBody.indexOf('rejectXmlDeclarations(xml)') < fetchBody.indexOf('XMLValidator.validate(xml)'));
  assert.ok(fetchBody.indexOf('rejectXmlDeclarations(xml)') < fetchBody.indexOf('xmlParser.parse(xml)'));
});
