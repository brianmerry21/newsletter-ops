import axios from 'axios';
import { withRetry } from '../lib/utils.js';

function nextSunday6pmPTIso() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilSunday = (7 - day) % 7 || 7;
  const target = new Date(now.getTime() + daysUntilSunday * 86400000);
  target.setUTCHours(1, 0, 0, 0); // roughly 6pm PT accounting for DST not exact
  return target.toISOString();
}

export async function publishToBeehiiv({ apiKey, publicationId, title, html, mode }) {
  const payload = {
    title,
    content: html,
    status: mode === 'publish_now' ? 'confirmed' : 'draft'
  };
  if (mode === 'schedule') {
    payload.status = 'scheduled';
    payload.publish_date = nextSunday6pmPTIso();
  }

  const res = await withRetry(
    () =>
      axios.post(`https://api.beehiiv.com/v2/publications/${publicationId}/posts`, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }),
    2,
    'beehiiv-create-post'
  );

  return {
    id: res.data?.data?.id,
    url: res.data?.data?.web_url || res.data?.data?.url || null,
    raw: res.data
  };
}
