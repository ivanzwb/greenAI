import { request } from "undici";
import { z } from "zod";
import { SoilFertilityHint, SoilMoistureHint } from "@prisma/client";
import { parseAssistantJson, toVisionImageDataUrl } from "./diagnoseLlm.js";

const SoilEstimateSchema = z.object({
  soilMoistureHint: z.nativeEnum(SoilMoistureHint),
  soilFertilityHint: z.nativeEnum(SoilFertilityHint).optional(),
  rationale: z.string().max(3000),
  wateringTip: z.string().max(2000).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type SoilPhotoEstimate = {
  soilMoistureHint: SoilMoistureHint;
  soilFertilityHint: SoilFertilityHint;
  rationale: string;
  wateringTip?: string;
  confidence?: number;
};

const SYSTEM = `你是园艺土壤视觉评估助手。用户上传的是盆栽土壤表面或盆土特写（可能含盆沿、颗粒土、水渍、裂纹等）。
请根据图像保守估计盆土状态，只输出一个 JSON 对象（不要 markdown 围栏，不要其它文字）。
键名固定为：
soilMoistureHint（字符串枚举，必须是以下之一）：very_wet、wet、moderate、dry、very_dry
soilFertilityHint（字符串枚举，可选，默认 unknown）：unknown、depleted、adequate、rich
  — 仅从可见线索粗判盆土肥力感：颗粒贫瘠/发白板结倾向 depleted；黑亮疏松有机质多倾向 rich；拿不准用 unknown 或 adequate。
rationale（string，简短说明从图像看到了什么线索）
wateringTip（string，可选，给家庭用户一句浇水/控水/施肥侧建议）
confidence（number 0~1，可选，你对湿度判断的整体置信度）
枚举含义：very_wet=很湿/积水感；wet=偏湿；moderate=适中；dry=偏干；very_dry=很干/明显干透。
注意：仅凭照片判断误差大，宁肯偏保守；若图像不像土壤，请在 rationale 说明并仍给出最可能的 moderate，soilFertilityHint 用 unknown。`;

export async function estimateSoilMoistureFromPhoto(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  imageBase64: string;
}): Promise<SoilPhotoEstimate> {
  const url = new URL(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`);
  const imageUrl = toVisionImageDataUrl(input.imageBase64);
  const userText =
    "请仅依据这张盆土/土壤相关照片，输出 JSON（键：soilMoistureHint、soilFertilityHint、rationale、wateringTip、confidence）。";

  const payload: Record<string, unknown> = {
    model: input.model,
    temperature: 0.2,
    max_tokens: 800,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "low" },
          },
        ],
      },
    ],
  };

  if (!input.model.toLowerCase().includes("deepseek")) {
    payload.response_format = { type: "json_object" };
  }

  const res = await request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(payload),
    headersTimeout: 60_000,
    bodyTimeout: 120_000,
  });

  const raw = (await res.body.json()) as Record<string, unknown>;
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const err = raw.error as { message?: string } | undefined;
    throw new Error(
      `llm_http_${res.statusCode}_${err?.message ?? JSON.stringify(raw).slice(0, 200)}`
    );
  }

  const choices = raw.choices as
    | Array<{ message?: { content?: string | null } }>
    | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("llm_empty_content");
  }

  let parsed: unknown;
  try {
    parsed = parseAssistantJson(content);
  } catch {
    throw new Error("llm_invalid_json");
  }

  const safe = SoilEstimateSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error(`llm_schema_${safe.error.message}`);
  }
  const d = safe.data;
  return {
    soilMoistureHint: d.soilMoistureHint,
    soilFertilityHint: d.soilFertilityHint ?? SoilFertilityHint.unknown,
    rationale: d.rationale,
    ...(d.wateringTip !== undefined ? { wateringTip: d.wateringTip } : {}),
    ...(d.confidence !== undefined ? { confidence: d.confidence } : {}),
  };
}
