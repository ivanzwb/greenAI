import { request } from "undici";
import { z } from "zod";

const LlmPlantDiagnosisSchema = z.object({
  summary: z.string().min(1).max(4000),
  likely_issues: z
    .array(
      z.object({
        title: z.string().max(300),
        detail: z.string().max(4000),
      })
    )
    .max(6)
    .default([]),
  immediate_actions: z.array(z.string().max(800)).max(12).default([]),
  caution: z.string().max(4000).optional(),
  needs_expert_visit: z.boolean().optional(),
});

export type LlmPlantDiagnosis = z.infer<typeof LlmPlantDiagnosisSchema>;

/** Raw base64 or `data:image/...;base64,...` for OpenAI-compatible vision APIs. */
export function toVisionImageDataUrl(imageBase64: string): string {
  const s = imageBase64.trim();
  if (s.startsWith("data:")) return s;
  return `data:image/jpeg;base64,${s}`;
}

export function parseAssistantJson(content: string): unknown {
  const trimmed = content.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const jsonStr = fence ? fence[1].trim() : trimmed;
  return JSON.parse(jsonStr) as unknown;
}

const SYSTEM_PROMPT = `你是园艺植物健康助理。用户会上传植物照片（可能含叶、茎、盆土）。请结合图像与文字说明，给出保守、可操作的中文建议。
硬性要求：
1) 只输出一个 JSON 对象本身，不要使用 markdown 代码围栏，不要输出其它说明文字。
2) 键名固定为：summary（string）、likely_issues（array of {title, detail}）、immediate_actions（string array）、caution（string，可空）、needs_expert_visit（boolean）。
3) 非实验室检测，不要断言具体病原物种名；用「可能」「疑似」表述。
4) 若涉及农药，提醒遵守标签说明与当地法规；家庭环境优先物理与栽培措施。
5) likely_issues 不超过 5 条，immediate_actions 不超过 8 条，每条简洁可执行。`;

function buildUserText(input: {
  userNote?: string | null;
  symptomLabels?: string[];
  plantHint?: string | null;
}): string {
  const parts: string[] = ["请根据照片与下列补充信息给出诊断参考 JSON。"];
  if (input.plantHint) parts.push(`【植物与养护上下文】\n${input.plantHint}`);
  if (input.symptomLabels?.length)
    parts.push(`【用户勾选的症状】\n${input.symptomLabels.join("；")}`);
  if (input.userNote?.trim())
    parts.push(`【用户文字补充】\n${input.userNote.trim()}`);
  if (parts.length === 1) parts.push("用户未提供文字补充，请主要依据图像判断。");
  return parts.join("\n\n");
}

export async function diagnosePlantWithVisionLlm(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  imageBase64: string;
  userNote?: string | null;
  symptomLabels?: string[];
  plantHint?: string | null;
}): Promise<LlmPlantDiagnosis> {
  const url = new URL(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`);
  const imageUrl = toVisionImageDataUrl(input.imageBase64);
  const userText = buildUserText({
    userNote: input.userNote,
    symptomLabels: input.symptomLabels,
    plantHint: input.plantHint,
  });

  const payload: Record<string, unknown> = {
    model: input.model,
    temperature: 0.25,
    max_tokens: 1800,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
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

  const modelLc = input.model.toLowerCase();
  if (
    !modelLc.includes("deepseek") &&
    !modelLc.includes("qwen") &&
    !modelLc.includes("dashscope")
  ) {
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

  const safe = LlmPlantDiagnosisSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error(`llm_schema_${safe.error.message}`);
  }
  return safe.data;
}
