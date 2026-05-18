import { request } from "undici";

export type CurrentWeather = {
  temperatureC: number;
  relativeHumidity: number;
};

export async function fetchOpenMeteoCurrent(input: {
  latitude: number;
  longitude: number;
}): Promise<CurrentWeather> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(input.latitude));
  url.searchParams.set("longitude", String(input.longitude));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m");

  const res = await request(url, { method: "GET" });
  if (res.statusCode !== 200) {
    throw new Error(`open_meteo_http_${res.statusCode}`);
  }
  const body = (await res.body.json()) as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
    };
  };
  const t = body.current?.temperature_2m;
  const h = body.current?.relative_humidity_2m;
  if (typeof t !== "number" || typeof h !== "number") {
    throw new Error("open_meteo_invalid_payload");
  }
  return { temperatureC: t, relativeHumidity: h };
}
