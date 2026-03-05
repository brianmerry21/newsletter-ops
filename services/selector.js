import fs from 'fs/promises';
import { query } from '../lib/db.js';
import { extractNumbers, seededRandom } from '../lib/utils.js';

const DOMAIN_PRIMARY_HINTS = ['.gov', '.edu', '.org', 'blog.', 'openai.com', 'anthropic.com', 'googleblog.com', 'nasa.gov'];

function clusterForSignal(signal, clusters) {
  const hay = `${signal.title} ${signal.url}`.toLowerCase();
  for (const c of clusters) {
    if (c.keywords.some((k) => hay.includes(k.toLowerCase()))) return c.cluster;
  }
  return 'General Future';
}

function countConcreteNumbers(signals) {
  const all = new Set();
  for (const s of signals) {
    extractNumbers(`${s.title} ${JSON.stringify(s.engagement)}`).forEach((n) => all.add(n));
    if (s.published_at) all.add(String(new Date(s.published_at).getUTCFullYear()));
  }
  return all.size;
}

function scoreTrope(signalPack, tropes) {
  const hay = signalPack.map((s) => `${s.title} ${s.url}`).join(' ').toLowerCase();
  return tropes
    .map((t) => {
      const score = (t.works || []).reduce((acc, w) => acc + (hay.includes(String(w).toLowerCase()) ? 2 : 0), 0) +
        t.summary.toLowerCase().split(' ').reduce((acc, w) => acc + (hay.includes(w) ? 0.05 : 0), 0);
      return { ...t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

export async function selectTopic(signals) {
  const [tropes, clustersFile] = await Promise.all([
    fs.readFile(new URL('../data/tropes.json', import.meta.url), 'utf-8'),
    fs.readFile(new URL('../data/topic_clusters.json', import.meta.url), 'utf-8')
  ]);
  const tropeLibrary = JSON.parse(tropes);
  const clusters = JSON.parse(clustersFile);

  const shortlist = signals.slice(0, 15).map((s) => ({ ...s, cluster: clusterForSignal(s, clusters) }));
  const grouped = shortlist.reduce((acc, s) => {
    acc[s.cluster] = acc[s.cluster] || [];
    acc[s.cluster].push(s);
    return acc;
  }, {});

  const recent = await query('select chosen_cluster from issues where status in ($1,$2,$3) order by created_at desc limit 4', [
    'published',
    'publish_failed',
    'failed'
  ]);
  const recentClusters = recent.rows.map((r) => r.chosen_cluster).filter(Boolean);

  const candidates = Object.entries(grouped)
    .map(([cluster, items]) => {
      const hasPrimary = items.some((i) => DOMAIN_PRIMARY_HINTS.some((hint) => i.url.includes(hint)));
      const uniqueDomains = new Set(items.map((i) => { try { return new URL(i.url).hostname; } catch { return i.url; }}));
      const credibleSources = uniqueDomains.size;
      const numbers = countConcreteNumbers(items);
      if (!(credibleSources >= 3 || (hasPrimary && credibleSources >= 3))) return null;
      if (numbers < 2) return null;
      const tropesTop = scoreTrope(items, tropeLibrary);
      const engagement = items.reduce((acc, i) => acc + i.engagement_score, 0);
      const novelty = recentClusters.includes(cluster) ? 0.2 : 1;
      const portfolioBalance = recentClusters.slice(0, 2).every((c) => c === cluster) ? 0.1 : 1;
      const tropeStrength = tropesTop.reduce((acc, t) => acc + t.score, 0) / 10;
      const weight = 0.45 * engagement + 0.25 * novelty + 0.15 * tropeStrength + 0.15 * portfolioBalance;
      return { cluster, items, weight, tropesTop };
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight);

  if (!candidates.length) {
    throw new Error('No candidate topic passed hard gates (sources + concrete numbers).');
  }

  const rand = seededRandom(`${new Date().toISOString().slice(0, 10)}:${candidates.map((c) => c.cluster).join('|')}`);
  const totalWeight = candidates.reduce((a, c) => a + c.weight, 0);
  const ticket = rand() * totalWeight;
  let cursor = 0;
  let winner = candidates[0];
  for (const c of candidates) {
    cursor += c.weight;
    if (ticket <= cursor) {
      winner = c;
      break;
    }
  }

  const selectedSignals = winner.items.slice(0, 10);
  const facts = selectedSignals.flatMap((s) => {
    const factsForSignal = [];
    factsForSignal.push(`${s.title} [Source: ${s.url}]`);
    if (s.published_at) factsForSignal.push(`Published date: ${s.published_at} [Source: ${s.url}]`);
    if (s.engagement_score) factsForSignal.push(`Engagement score ${s.engagement_score.toFixed(2)} from source metrics [Source: ${s.url}]`);
    return factsForSignal;
  });

  return {
    chosen_cluster: winner.cluster,
    chosen_topic_title: selectedSignals[0].title,
    selected_signals: selectedSignals,
    selected_tropes: winner.tropesTop.map((t) => ({ trope_id: t.trope_id, trope_name: t.trope_name })),
    extracted_facts: facts
  };
}
