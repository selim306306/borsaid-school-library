#!/usr/bin/env node
// Run before publishing source changes; --check is read-only.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildStyles } from './build-styles.mjs';

export function versionAssets(root, { check = false } = {}) {
  root = resolve(root);
  const bundled = buildStyles(root, { check });
  const sources = readdirSync(root).filter(name => /\.(?:js|mjs|css|html)$/.test(name) && !name.endsWith('.test.mjs'));
  const planned = new Map();
  const visiting = new Set();
  const localFile = (owner, url) => {
    if (/^(?:[a-z]+:|\/\/|#|\/)/i.test(url)) return null;
    const path = resolve(dirname(owner), url.split(/[?#]/)[0]);
    if (!path.startsWith(root + '/') || !/\.(?:js|mjs|css)$/.test(path) || !existsSync(path)) return null;
    return path;
  };
  const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
  const versionUrl = (owner, url) => {
    const target = localFile(owner, url);
    if (!target) return url;
    const body = transform(target);
    const [beforeFragment, fragment] = url.split('#');
    const [path, query = ''] = beforeFragment.split('?');
    const params = new URLSearchParams(query);
    params.set('v', hash(body));
    return `${path}?${params}${fragment === undefined ? '' : '#' + fragment}`;
  };
  function transform(file) {
    if (planned.has(file)) return planned.get(file);
    if (visiting.has(file)) throw new Error(`Cyclic asset imports: ${relative(root, file)}`);
    visiting.add(file);
    let text = readFileSync(file, 'utf8');
    if (extname(file) === '.html') {
      text = text.replace(/\b(href|src)=(['"])([^'"\s]+)\2/g, (all, attr, quote, url) => `${attr}=${quote}${versionUrl(file, url)}${quote}`);
    } else if (/\.(?:js|mjs)$/.test(file)) {
      // Static module imports/re-exports, literal dynamic imports and local script URLs.
      text = text.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\bnew URL\(\s*)(['"])(\.[^'"\s]+\.(?:js|mjs|css)(?:\?[^'"\s]*)?(?:#[^'"\s]*)?)\2/g,
        (all, prefix, quote, url) => `${prefix}${quote}${versionUrl(file, url)}${quote}`);
    } else if (extname(file) === '.css') {
      text = text.replace(/(@import\s+(?:url\(\s*)?)(['"])([^'"\s]+)\2/g,
        (all, prefix, quote, url) => `${prefix}${quote}${versionUrl(file, url)}${quote}`);
    }
    visiting.delete(file);
    planned.set(file, text);
    return text;
  }
  for (const source of sources) transform(resolve(root, source));
  const changed = [...bundled];
  for (const [file, content] of planned) {
    if (readFileSync(file, 'utf8') !== content) {
      changed.push(relative(root, file));
      if (!check) writeFileSync(file, content);
    }
  }
  return changed.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = versionAssets(resolve(dirname(fileURLToPath(import.meta.url)), '..'), { check: process.argv.includes('--check') });
  console.log(changed.length ? `Asset versions ${process.argv.includes('--check') ? 'out of date' : 'updated'}: ${changed.join(', ')}` : 'Asset versions are current.');
  if (process.argv.includes('--check') && changed.length) process.exitCode = 1;
}
