import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { SoilMoistureHint } from "@prisma/client";
import { estimateSoilMoistureFromPhoto } from "./soilPhotoLlm.js";

describe("estimateSoilMoistureFromPhoto", () => {
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

  it("returns parsed soil enum from chat completion", async () => {
    const pool = agent.get("https://api.openai.com");
    pool
      .intercept({ path: "/v1/chat/completions", method: "POST" })
      .reply(200, {
        choices: [
          {
            message: {
              content: JSON.stringify({
                soilMoistureHint: SoilMoistureHint.dry,
                rationale: "表土颜色浅，有细微裂纹。",
                wateringTip: "可浇少量水，避免一次猛浇。",
              }),
            },
          },
        ],
      });

    const out = await estimateSoilMoistureFromPhoto({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk",
      model: "gpt-4o-mini",
      imageBase64: "abcd",
    });
    expect(out.soilMoistureHint).toBe(SoilMoistureHint.dry);
    expect(out.rationale.length).toBeGreaterThan(3);
  });
});
