import { request } from "undici";

/**
 * Open-Meteo 逆地理（免密钥），用于展示「城市/地区」文案，对齐计划书环境感知表述。
 * @see https://open-meteo.com/en/docs/geocoding-api
 */
export async function reverseGeocodeLabel(input: {
  latitude: number;
  longitude: number;
}): Promise<string | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
  url.searchParams.set("latitude", String(input.latitude));
  url.searchParams.set("longitude", String(input.longitude));
  url.searchParams.set("language", "zh");
  const res = await request(url, { method: "GET" });
  if (res.statusCode !== 200) return null;
  const body = (await res.body.json()) as {
    results?: Array<{
      name?: string;
      admin1?: string;
      country?: string;
    }>;
  };
  const r = body.results?.[0];
  if (!r) return null;
  const parts = [r.admin1, r.name, r.country].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  return parts.length ? parts.join(" · ") : null;
}
