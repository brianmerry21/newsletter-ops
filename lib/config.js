import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-4.1'),
  DATABASE_URL: z.string().url(),
  BEEHIIV_API_KEY: z.string().min(1),
  BEEHIIV_PUBLICATION_ID: z.string().min(1),
  YOUTUBE_API_KEY: z.string().optional(),
  ENABLE_CRON: z.enum(['true', 'false']).default('false'),
  PUBLISH_MODE: z.enum(['draft', 'schedule', 'publish_now']).default('draft'),
  TIMEZONE: z.string().default('America/Los_Angeles')
});

export const config = schema.parse(process.env);
