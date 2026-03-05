const REQUIRED_SECTIONS = [
  'TITLE',
  'DECK',
  'THE SIGNAL',
  "WHAT'S ACTUALLY NEW",
  'WHY NOW',
  'BY 2045',
  'POWER SHIFT',
  'FOUNDER / INVESTOR ANGLE',
  'THE 2045 BET'
];

const BANNED = ['AI is transforming everything'];

export function runQa(newsletter) {
  const issues = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!newsletter.includes(section)) issues.push(`Missing section: ${section}`);
  }
  const numbers = newsletter.match(/\b\d+(?:\.\d+)?(?:%|k|m|b)?\b/gi) || [];
  if (numbers.length < 2) issues.push('Must include at least 2 concrete numbers.');

  const citations = newsletter.match(/\[Source:\s*https?:\/\/[^\]]+\]/gi) || [];
  if (citations.length < 3) issues.push('Must include at least 3 source citations.');

  if (/will launch on\s+\w+\s+\d{1,2},\s+\d{4}/i.test(newsletter)) {
    issues.push('Potential tense/date mismatch detected.');
  }

  for (const phrase of BANNED) {
    if (newsletter.includes(phrase)) issues.push(`Banned phrase found: ${phrase}`);
  }

  return { ok: issues.length === 0, issues };
}
