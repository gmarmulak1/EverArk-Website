/**
 * Shared helpers for the Weebly migration scripts.
 *
 * Everything here is deliberately regex-based rather than DOM-based: the export
 * contains malformed markup (a stray <html> tag inside <head>, unclosed <hr>),
 * and a real parser would silently normalise it, which would change rendering.
 * We only ever touch the exact byte ranges we mean to touch.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const UPLOAD_BASE = 'uploads/1/0/7/5/107572223';
export const LIVE_ORIGIN = 'https://www.everark.io';

/** Every top-level page of the export, in stable order. */
export function pages() {
  return fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith('.html'))
    .sort();
}

export function readPage(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

export function writePage(name, html) {
  fs.writeFileSync(path.join(ROOT, name), html);
}

/**
 * Rewrites every page with `fn`, reporting how many changed.
 * Idempotent by construction: a script that has already run makes no edits.
 */
export function transformPages(label, fn) {
  let changed = 0;
  const touched = [];
  for (const name of pages()) {
    const before = readPage(name);
    const after = fn(before, name);
    if (after !== before) {
      writePage(name, after);
      changed++;
      touched.push(name);
    }
  }
  console.log(`${label}: rewrote ${changed}/${pages().length} pages`);
  return touched;
}

/** All local (non-absolute) href/src targets referenced by the pages. */
export function localRefs() {
  const found = new Map();
  const attr = /(?:src|href)\s*=\s*"([^"]+)"/g;
  for (const name of pages()) {
    const html = readPage(name);
    for (const m of html.matchAll(attr)) {
      const raw = m[1].trim();
      if (!raw || /^(https?:)?\/\//.test(raw)) continue;
      if (/^(mailto:|tel:|javascript:|data:|about:|#|\/)/.test(raw)) continue;
      const clean = raw.split(/[?#]/)[0];
      if (!clean) continue;
      if (!found.has(clean)) found.set(clean, new Set());
      found.get(clean).add(name);
    }
  }
  return found;
}

export function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

/** Fetch with retries; returns a Buffer or null. */
export async function fetchBuffer(url, { retries = 4, timeoutMs = 45000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'everark-migration/1.0' },
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`HTTP ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === retries) {
        console.warn(`  fetch failed ${url}: ${err.message}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
  return null;
}

export function writeFileEnsured(rel, buf) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
}

/** Run `worker` over `items` with bounded concurrency. */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}
