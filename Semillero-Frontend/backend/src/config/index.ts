import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3001),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    CORS_ORIGIN: z.string().default('http://localhost:3002'),
    // El chat usa OpenRouter (API compatible con OpenAI). OPENAI_API_KEY se
    // mantiene como alternativa para apuntar directo a OpenAI.
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    LLM_BASE_URL: z.string().url().optional(),
    LLM_MODEL: z.string().min(1).optional(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    N8N_WEBHOOK_URL: z.string().url().optional(),
    N8N_WEBHOOK_SECRET: z.string().optional(),
  })
  .refine((v) => v.OPENROUTER_API_KEY || v.OPENAI_API_KEY, {
    message: 'Define OPENROUTER_API_KEY (o OPENAI_API_KEY)',
    path: ['OPENROUTER_API_KEY'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
