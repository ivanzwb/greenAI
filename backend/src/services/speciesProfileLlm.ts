import { request } from "undici";
import { z } from "zod";
import { parseAssistantJson } from "./diagnoseLlm.js";

const OutSchema = z.object({
  careDifficulty: z.enum(["新手", "进阶", "专家"]),
  careSummary: z.string().min(10).max(1200),
  taxonFamily: z.string().max(120).optional(),
});

export type SpeciesProfileLlmResult = z.infer<typeof OutSchema>;

const SYSTEM = `你是家庭园艺知识库维护助手。只根据用户给出的植物中文俗名/学名与可选的百科摘要片段，推断该植物对普通爱好者的养护难度与要点。
硬性要求：
1) 只输出一个 JSON 对象本身，不要使用 markdown 围栏，不要其它文字。
2) 键名固定：careDifficulty（字符串，必须是以下之一：新手、进阶、专家）、careSummary（string，80～300 字中文，浇水/光照/越冬等可执行要点）、taxonFamily（string，可选，科属如「天南星科」；不确定则省略或空字符串）。
3) 保守：信息不足时宁可 careDifficulty=进阶，careSummary 中说明「信息有限、建议核对百科」。
4) 不要编造具体拉丁学名双名法（除非用户文本里已出现）。`;

export async function inferSpeciesProfileWithLlm(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  displayName: string;
  taxonFamilyHint?: string | null;
  baikeDescription?: string | null;
}): Promise<SpeciesProfileLlmResult> {
  const parts = [`【植物名称】\n${input.displayName.trim()}`];
  if (input.taxonFamilyHint?.trim()) {
    parts.push(`【已知科属线索】\n${input.taxonFamilyHint.trim()}`);
  }
  if (input.baikeDescription?.trim()) {
    parts.push(
      `【百科摘要片段】\n${input.baikeDescription.trim().slice(0, 1500)}`
    );
  }
  const userText = `${parts.join("\n\n")}\n\n请输出 JSON。`;

  const url = new URL(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`);
  const payload: Record<string, unknown> = {
    model: input.model,
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userText },
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
    headersTimeout: 45_000,
    bodyTimeout: 90_000,
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

  const safe = OutSchema.safeParse(parsed);
  if (!safe.success) {
    throw new Error(`llm_schema_${safe.error.message}`);
  }

  const taxon = safe.data.taxonFamily?.trim();
  return {
    careDifficulty: safe.data.careDifficulty,
    careSummary: safe.data.careSummary.trim(),
    ...(taxon && taxon.length > 0 ? { taxonFamily: taxon.slice(0, 120) } : {}),
  };
}
