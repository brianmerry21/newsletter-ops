import axios from 'axios';
import Parser from 'rss-parser';
import { query } from '../lib/db.js';
import { canonicalizeUrl, isOlderThanDays, stableHash, withRetry } from '../lib/utils.js';

const parser = new Parser();

function normalizeHN(item) {
  const points = Number(item?.content?.match(/(\d+) points?/)?.[1] || 0);
  const comments = Number(item?.content?.match(/(\d+) comments?/)?.[1] || 0);
  const url = canonicalizeUrl(item.link || item.guid || '');
  return {
    id: stableHash(`hn:${url}`),
    source: 'hn',
    title: item.title,
    url,
    published_at: item.isoDate || null,
    engagement: { points, comments },
    raw: item
  };
}

function normalizeReddit(post, subreddit) {
  const d = post.data;
  const url = canonicalizeUrl(d.url_overridden_by_dest || `https://www.reddit.com${d.permalink}`);
  return {
    id: stableHash(`reddit:${url}`),
    source: 'reddit',
    title: d.title,
    url,
    published_at: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
    engagement: { upvotes: d.ups || 0, comments: d.num_comments || 0 },
    raw: { subreddit, ...d }
  };
}

function normalizeYoutube(item) {
  const videoId = item.id.videoId;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return {
    id: stableHash(`youtube:${videoId}`),
    source: 'youtube',
    title: item.snippet.title,
    url,
    published_at: item.snippet.publishedAt || null,
    engagement: { views: Number(item.statistics?.viewCount || 0) },
    raw: item
  };
}

async function fetchHN() {
  const feed = await withRetry(() => parser.parseURL('https://news.ycombinator.com/rss'), 3, 'hn-rss');
  return (feed.items || []).map(normalizeHN);
}

async function fetchReddit(url, subreddit) {
  const res = await withRetry(() => axios.get(url, { headers: { 'User-Agent': '2045-engine/1.0' }, timeout: 15000 }), 3, `reddit-${subreddit}`);
  return res.data.data.children.map((post) => normalizeReddit(post, subreddit));
}

async function fetchYoutube(apiKey) {
  const search = await withRetry(
    () =>
      axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          key: apiKey,
          q: 'future technology explainer',
          part: 'snippet',
          maxResults: 10,
          type: 'video',
          order: 'viewCount'
        },
        timeout: 15000
      }),
    2,
    'youtube-search'
  );
  const ids = search.data.items.map((i) => i.id.videoId).join(',');
  const stats = await withRetry(
    () => axios.get('https://www.googleapis.com/youtube/v3/videos', { params: { key: apiKey, id: ids, part: 'statistics,snippet' } }),
    2,
    'youtube-stats'
  );
  const byId = new Map(stats.data.items.map((i) => [i.id, i]));
  return search.data.items.map((item) => normalizeYoutube({ ...item, statistics: byId.get(item.id.videoId)?.statistics }));
}

function scoreSignal(signal) {
  if (signal.source === 'hn') return (signal.engagement.points || 0) + (signal.engagement.comments || 0) * 0.5;
  if (signal.source === 'reddit') return (signal.engagement.upvotes || 0) + (signal.engagement.comments || 0) * 0.5;
  if (signal.source === 'youtube') return (signal.engagement.views || 0) * 0.001;
  return 0;
}

export async function discoverSignals({ youtubeApiKey }) {
  const all = [];
  all.push(...(await fetchHN()));
  all.push(...(await fetchReddit('https://www.reddit.com/r/Futurology/top.json?limit=25&t=week', 'Futurology')));
  all.push(...(await fetchReddit('https://www.reddit.com/r/technology/top.json?limit=25&t=week', 'technology')));
  if (youtubeApiKey) {
    try {
      all.push(...(await fetchYoutube(youtubeApiKey)));
    } catch (error) {
      console.warn(`[discover] youtube skipped: ${error.message}`);
    }
  }

  const deduped = new Map();
  for (const signal of all) {
    if (!signal.url || isOlderThanDays(signal.published_at, 30)) continue;
    const key = canonicalizeUrl(signal.url);
    if (!deduped.has(key)) deduped.set(key, { ...signal, url: key });
  }

  const signals = [...deduped.values()].map((s) => ({ ...s, engagement_score: scoreSignal(s) }));
  for (const signal of signals) {
    await query(
      `insert into signals (id, source, title, url, published_at, engagement, engagement_score, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set title=excluded.title, engagement=excluded.engagement, engagement_score=excluded.engagement_score, raw=excluded.raw`,
      [signal.id, signal.source, signal.title, signal.url, signal.published_at, signal.engagement, signal.engagement_score, signal.raw]
    );
  }

  return signals.sort((a, b) => b.engagement_score - a.engagement_score);
}
