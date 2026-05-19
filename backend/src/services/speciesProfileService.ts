import { Prisma, type PrismaClient } from "@prisma/client";
import { SpeciesProfileSource } from "@prisma/client";
import type { DiagnoseLlmSettings } from "../config.js";
import { normalizeSpeciesNameKey } from "../lib/speciesNameKey.js";
import { inferSpeciesProfileWithLlm } from "./speciesProfileLlm.js";

/**
 * 先查自建品种表；未命中且配置了 LLM 时推断并写入，供后续识别复用。
 */
export async function findOrCreateSpeciesProfile(
  prisma: PrismaClient,
  input: {
    displayName: string;
    taxonFamilyHint?: string | null;
    baikeDescription?: string | null;
  },
  llm: DiagnoseLlmSettings | null
): Promise<{
  profile: import("@prisma/client").SpeciesProfile | null;
  source: "cache" | "created" | "llm_disabled" | "llm_failed";
}> {
  const trimmed = input.displayName.trim();
  if (!trimmed) {
    return { profile: null, source: "llm_disabled" };
  }
  const nameKey = normalizeSpeciesNameKey(trimmed);

  const hit = await prisma.speciesProfile.findUnique({
    where: { nameKey },
  });
  if (hit) {
    return { profile: hit, source: "cache" };
  }

  if (!llm) {
    return { profile: null, source: "llm_disabled" };
  }

  let inferred;
  try {
    inferred = await inferSpeciesProfileWithLlm({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      displayName: trimmed,
      taxonFamilyHint: input.taxonFamilyHint,
      baikeDescription: input.baikeDescription,
    });
  } catch {
    return { profile: null, source: "llm_failed" };
  }

  const taxonFamily =
    inferred.taxonFamily?.trim() ||
    (input.taxonFamilyHint?.trim() ?? null) ||
    null;

  try {
    const created = await prisma.speciesProfile.create({
      data: {
        nameKey,
        displayName: trimmed.slice(0, 200),
        taxonFamily: taxonFamily ? taxonFamily.slice(0, 120) : null,
        careDifficulty: inferred.careDifficulty,
        careSummary: inferred.careSummary.slice(0, 2000),
        source: SpeciesProfileSource.llm,
      },
    });
    return { profile: created, source: "created" };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const again = await prisma.speciesProfile.findUnique({
        where: { nameKey },
      });
      return { profile: again, source: "cache" };
    }
    throw e;
  }
}
