import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3001),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    CORS_ORIGIN: z.string().default('http://localhost:3002'),
    // Saltos de proxy delante del backend (0 en local; 1 en Render)
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Peticiones por IP cada 15 min
    RATE_LIMIT_PER_15MIN: z.coerce.number().int().min(10).default(1000),
    // El chat usa OpenRouter (API compatible con OpenAI)
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    // Opcional: activa Google Jobs (elempleo, Computrabajo, LinkedIn…) en las ofertas externas del candidato
    SERPAPI_API_KEY: z.string().min(1).optional(),
    // Margen bajo el plan gratis de 250 búsquedas al mes
    SERPAPI_MONTHLY_LIMIT: z.coerce.number().int().min(0).default(230),
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
