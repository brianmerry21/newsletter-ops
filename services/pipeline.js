import { query, withTx } from '../lib/db.js';
import { config } from '../lib/config.js';
import { markdownToHtml } from '../lib/utils.js';
import { discoverSignals } from './discover.js';
import { publishToBeehiiv } from './publisher.js';
import { runQa } from './qa.js';
import { selectTopic } from './selector.js';
import { generateNewsletter, generateSocialPack } from './writer.js';

async function createIssue(client, pack) {
  const res = await client.query(
    `insert into issues (status, chosen_cluster, chosen_topic_title, verified_signal_pack)
     values ('drafting',$1,$2,$3) returning id`,
    [pack.chosen_cluster, pack.chosen_topic_title, pack]
  );
  return res.rows[0].id;
}

export async function runWeeklyPipeline() {
  const run = await query("insert into runs (run_type, status, logs) values ('weekly','running',$1) returning id", [
    { start: new Date().toISOString() }
  ]);
  const runId = run.rows[0].id;
  try {
    const signals = await discoverSignals({ youtubeApiKey: config.YOUTUBE_API_KEY });
    const pack = await selectTopic(signals);

    const issueId = await withTx(async (client) => {
      const id = await createIssue(client, pack);
      for (const signal of pack.selected_signals) {
        await client.query('insert into issue_signals (issue_id, signal_id) values ($1,$2) on conflict do nothing', [id, signal.id]);
      }
      return id;
    });

    let newsletter = '';
    let qa = { ok: false, issues: [] };
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      newsletter = await generateNewsletter({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL, pack });
      qa = runQa(newsletter);
      if (qa.ok) break;
    }

    const html = markdownToHtml(newsletter);
    if (!qa.ok) {
      await query('update issues set status=$1, fail_reason=$2 where id=$3', ['failed', qa.issues.join('; '), issueId]);
      await query('insert into issue_assets (issue_id, asset_type, content_text, content_json) values ($1,$2,$3,$4)', [
        issueId,
        'qa_failure',
        newsletter,
        { qa }
      ]);
      throw new Error(`QA failed twice: ${qa.issues.join('; ')}`);
    }

    let post;
    try {
      post = await publishToBeehiiv({
        apiKey: config.BEEHIIV_API_KEY,
        publicationId: config.BEEHIIV_PUBLICATION_ID,
        title: pack.chosen_topic_title,
        html,
        mode: config.PUBLISH_MODE
      });
    } catch (error) {
      await query('update issues set status=$1, fail_reason=$2 where id=$3', ['publish_failed', error.message, issueId]);
      await query('insert into issue_assets (issue_id, asset_type, content_text) values ($1,$2,$3)', [issueId, 'newsletter_md', newsletter]);
      await query('insert into issue_assets (issue_id, asset_type, content_text) values ($1,$2,$3)', [issueId, 'newsletter_html', html]);
      throw error;
    }

    const social = await generateSocialPack({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL, pack, postUrl: post.url || '{POST_URL}' });
    if (post.url) {
      social.micro_posts = social.micro_posts.map((p) => p.replaceAll('{POST_URL}', post.url));
    }

    await query('update issues set status=$1, beehiiv_post_id=$2, beehiiv_post_url=$3 where id=$4', ['published', post.id, post.url, issueId]);
    await query('insert into issue_assets (issue_id, asset_type, content_text) values ($1,$2,$3)', [issueId, 'newsletter_md', newsletter]);
    await query('insert into issue_assets (issue_id, asset_type, content_text) values ($1,$2,$3)', [issueId, 'newsletter_html', html]);
    await query('insert into issue_assets (issue_id, asset_type, content_json) values ($1,$2,$3)', [issueId, 'social_pack', social]);

    await query('update runs set status=$1, logs=$2, completed_at=now() where id=$3', ['success', { issueId, qa, post }, runId]);
    return { issueId, postUrl: post.url };
  } catch (error) {
    await query('update runs set status=$1, logs=$2, completed_at=now() where id=$3', ['failed', { error: error.message }, runId]);
    throw error;
  }
}

export async function regenerateMicroPosts() {
  const issueRes = await query('select id, verified_signal_pack, beehiiv_post_url from issues order by created_at desc limit 1');
  if (!issueRes.rows[0]) throw new Error('No issue available for micro-post generation.');
  const issue = issueRes.rows[0];
  const social = await generateSocialPack({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_MODEL,
    pack: issue.verified_signal_pack,
    postUrl: issue.beehiiv_post_url || '{POST_URL}'
  });
  await query('insert into issue_assets (issue_id, asset_type, content_json) values ($1,$2,$3)', [issue.id, 'micro_posts', social.micro_posts]);
  return social.micro_posts;
}
