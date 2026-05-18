import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { fetchOpenMeteoCurrent } from "./openMeteo.js";

describe("fetchOpenMeteoCurrent", () => {
  let agent: MockAgent;
  let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;

  beforeAll(() => {
    previousDispatcher = getGlobalDispatcher();
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });

  afterAll(() => {
    agent.close();
    setGlobalDispatcher(previousDispatcher);
  });

  it("parses current block", async () => {
    const pool = agent.get("https://api.open-meteo.com");
    pool
      .intercept({ path: /\/v1\/forecast/, method: "GET" })
      .reply(200, {
        current: {
          temperature_2m: 22.5,
          relative_humidity_2m: 55,
        },
      });

    const w = await fetchOpenMeteoCurrent({ latitude: 31.2, longitude: 121.5 });
    expect(w.temperatureC).toBe(22.5);
    expect(w.relativeHumidity).toBe(55);
  });
});
