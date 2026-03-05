import crypto from 'crypto';

export function stableHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function canonicalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'context'];
    drop.forEach((k) => parsed.searchParams.delete(k));
    parsed.searchParams.sort();
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function isOlderThanDays(isoDate, days) {
  if (!isoDate) return false;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return false;
  const cutoff = Date.now() - days * 86400000;
  return target.getTime() < cutoff;
}

export function extractNumbers(text) {
  return (text.match(/\b\d+(?:\.\d+)?(?:%|k|m|b)?\b/gi) || []).map((n) => n.toLowerCase());
}

export function seededRandom(seedString) {
  let seed = 0;
  for (let i = 0; i < seedString.length; i += 1) {
    seed = (seed * 31 + seedString.charCodeAt(i)) >>> 0;
  }
  return function random() {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function withRetry(fn, retries = 3, label = 'operation') {
  let lastError;
  for (let i = 1; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`[retry] ${label} failed (${i}/${retries}): ${error.message}`);
      if (i < retries) await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  throw lastError;
}

export function markdownToHtml(md) {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = escaped.split('\n');
  return lines
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
      if (!line.trim()) return '';
      return `<p>${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`;
    })
    .join('\n')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
}
