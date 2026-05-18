import { z } from "zod";

const postgresUrl = z.string().refine(
  (s) => s.startsWith("postgresql://") || s.startsWith("postgres://"),
  "must be postgres connection string"
);

const envSchema = z.object({
  DATABASE_URL: postgresUrl,
  JWT_SECRET: z.string().min(16),
  WECHAT_APPID: z.string().min(1),
  WECHAT_SECRET: z.string().min(1),
  CRON_HMAC_SECRET: z.string().min(16),
  SUBSCRIBE_TEMPLATE_ID: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  /** Baidu AI 开放平台「植物识别」；两者皆配置时启用 POST /plants/identify */
  BAIDU_API_KEY: z.string().optional(),
  BAIDU_SECRET_KEY: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function isBaiduPlantIdentifyConfigured(
  c: AppConfig
): c is AppConfig & { BAIDU_API_KEY: string; BAIDU_SECRET_KEY: string } {
  return Boolean(c.BAIDU_API_KEY && c.BAIDU_SECRET_KEY);
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${parsed.error.message}`);
  }
  return parsed.data;
}
