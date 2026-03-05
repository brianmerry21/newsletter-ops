import axios from 'axios';
import { z } from 'zod';
import { withRetry } from '../lib/utils.js';


const socialSchema = z.object({
  x_posts: z.array(z.string()).length(5),
  x_thread: z.array(z.string()).min(8).max(12),
  linkedin_posts: z.array(z.string()).length(2),
  micro_posts: z.array(z.string()).length(5)
});

function promptForNewsletter(pack) {
  return `You are writing for 2045-engine. Use ONLY facts in VERIFIED SIGNAL PACK. Never invent sources, dates, launches, or numbers.

VERIFIED SIGNAL PACK:
${JSON.stringify(pack, null, 2)}

Write 1200-1800 words markdown with EXACT section headers:
TITLE
DECK
THE SIGNAL
WHAT'S ACTUALLY NEW
WHY NOW
BY 2045
POWER SHIFT
FOUNDER / INVESTOR ANGLE
THE 2045 BET

Constraints:
- techno-optimist overall
- include one contrarian paragraph with phrase "what people are missing"
- include at least 2 concrete numbers from pack
- include inline citations like [Source: URL]
- avoid filler and banned phrase: "AI is transforming everything".`;
}

function promptForSocial(pack, postUrl = '{POST_URL}') {
  return `Create Social Pack JSON only, no markdown. Schema:
{
  "x_posts": [5 strings <=280 chars],
  "x_thread": [8-12 tweet strings, last tweet has CTA],
  "linkedin_posts": [2 strings, each 150-250 words],
  "micro_posts": [5 strings for Mon-Fri, include URL ${postUrl}]
}
Use only this pack:
${JSON.stringify(pack, null, 2)}`;
}

async function openAIChat({ apiKey, model, messages, temperature = 0.2 }) {
  const res = await withRetry(
    () =>
      axios.post(
        'https://api.openai.com/v1/chat/completions',
        { model, temperature, messages },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 45000 }
      ),
    2,
    'openai-chat'
  );
  return res.data.choices[0].message.content;
}

export async function generateNewsletter({ apiKey, model, pack }) {
  return openAIChat({
    apiKey,
    model,
    messages: [
      { role: 'system', content: 'You are a precise newsletter editor that never invents facts.' },
      { role: 'user', content: promptForNewsletter(pack) }
    ]
  });
}

export async function generateSocialPack({ apiKey, model, pack, postUrl }) {
  const raw = await openAIChat({
    apiKey,
    model,
    messages: [
      { role: 'system', content: 'Return strict JSON only.' },
      { role: 'user', content: promptForSocial(pack, postUrl) }
    ],
    temperature: 0.3
  });
  const parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, '').trim());
  return socialSchema.parse(parsed);
}
