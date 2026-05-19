import { afterEach, describe, expect, it } from "vitest";
import { Agent, MockAgent, setGlobalDispatcher } from "undici";
import {
  extractTaxonFamilyFromText,
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
          {
            name: "绿萝",
            score: 0.41,
            category: "天南星科",
            baike_info: {
              baike_url: "https://baike.baidu.com/item/%E7%BB%BF%E8%90%9D",
              description: "天南星科常绿藤本。",
            },
          },
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
    expect(out[0].baikeUrl).toBeUndefined();
    expect(out[1].baikeUrl).toContain("baike.baidu.com");
    expect(out[1].baikeDescription).toContain("天南星科");
    expect(out[1].taxonFamily).toBe("天南星科");
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

  it("extractTaxonFamilyFromText finds 科 in description", () => {
    expect(extractTaxonFamilyFromText("常见天南星科观叶植物。")).toBe("天南星科");
    expect(extractTaxonFamilyFromText(undefined)).toBeUndefined();
  });
});
