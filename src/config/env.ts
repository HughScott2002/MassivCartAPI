import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().min(1, "Missing SUPABASE_URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "Missing SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().min(1, "Missing UPSTASH_REDIS_REST_URL"),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1, "Missing UPSTASH_REDIS_REST_TOKEN"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const messages = parsedEnv.error.issues.map((issue) => issue.message);
  throw new Error(messages.join("\n"));
}

export const env = parsedEnv.data;
