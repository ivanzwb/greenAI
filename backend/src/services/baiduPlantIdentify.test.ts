import { afterEach, describe, expect, it } from "vitest";
import { Agent, MockAgent, setGlobalDispatcher } from "undici";
import {
  getBaiduAccessToken,
  identifyPlantWithBaidu,
  resetBaiduPlantIdentifyCache,
} from "./baiduPlantIdentify.js";

afterEach(() => {
  resetBaiduPlantIdentifyCache();
  setGlobalDispatcher(new Agent());
});

describe("baiduPlantIdentify (mocked HTTP)", () => {
  it("returns sorted candidates", async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    const pool = agent.get("https://aip.baidubce.com");

    pool
      .intercept({ path: /\/oauth\/2\.0\/token/, method: "GET" })
      .reply(200, { access_token: "tok", expires_in: 3600 });

    pool
      .intercept({
        path: /\/rest\/2\.0\/image-classify\/v1\/plant/,
        method: "POST",
      })
      .reply(200, {
        result: [
          { name: "绿萝", score: 0.41 },
          { name: "万年青", score: 0.82 },
        ],
      });

    const out = await identifyPlantWithBaidu({
      apiKey: "k",
      secretKey: "s",
      imageBase64: "ZmFrZQ==",
    });
    expect(out[0].name).toBe("万年青");
    expect(out[0].score).toBe(0.82);
    expect(out).toHaveLength(2);

    await agent.close();
  });

  it("getBaiduAccessToken throws on error body", async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    const pool = agent.get("https://aip.baidubce.com");
    pool
      .intercept({ path: /\/oauth\/2\.0\/token/, method: "GET" })
      .reply(200, {
        error: "invalid_client_id",
      });
    await expect(getBaiduAccessToken("bad", "bad")).rejects.toThrow(/baidu_token/);
    await agent.close();
  });
});
