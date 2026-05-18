import { request } from "undici";

export type PlantIdentifyCandidate = {
  name: string;
  score: number;
};

type TokenCache = { token: string; expiresAtMs: number };
let tokenCache: TokenCache | null = null;

/** Test helper: clear in-memory token cache. */
export function resetBaiduPlantIdentifyCache(): void {
  tokenCache = null;
}

export async function getBaiduAccessToken(
  apiKey: string,
  secretKey: string
): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 120_000) {
    return tokenCache.token;
  }
  const url = new URL("https://aip.baidubce.com/oauth/2.0/token");
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("client_secret", secretKey);
  const res = await request(url, { method: "GET" });
  const body = (await res.body.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (res.statusCode !== 200 || !body.access_token) {
    throw new Error(
      `baidu_token_${res.statusCode}_${body.error ?? "unknown"}`
    );
  }
  const ttlSec = body.expires_in ?? 25 * 24 * 3600;
  tokenCache = {
    token: body.access_token,
    expiresAtMs: now + ttlSec * 1000,
  };
  return body.access_token;
}

/** Call Baidu 植物识别. `imageBase64` must be raw base64 (no data: URL prefix). */
export async function identifyPlantWithBaidu(input: {
  apiKey: string;
  secretKey: string;
  imageBase64: string;
}): Promise<PlantIdentifyCandidate[]> {
  const token = await getBaiduAccessToken(input.apiKey, input.secretKey);
  const url = new URL("https://aip.baidubce.com/rest/2.0/image-classify/v1/plant");
  url.searchParams.set("access_token", token);
  const form = new URLSearchParams();
  form.set("image", input.imageBase64);
  form.set("baike_num", "0");
  const res = await request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: form.toString(),
  });
  const raw = (await res.body.json()) as {
    error_code?: number;
    error_msg?: string;
    result?: Array<{ name?: string; score?: number }>;
  };
  if (raw.error_code != null && raw.error_code !== 0) {
    throw new Error(`baidu_plant_${raw.error_code}_${raw.error_msg ?? ""}`);
  }
  const list = Array.isArray(raw.result) ? raw.result : [];
  return list
    .filter((r) => typeof r.name === "string" && typeof r.score === "number")
    .map((r) => ({ name: String(r.name), score: Number(r.score) }))
    .filter((r) => r.name.length > 0 && r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
