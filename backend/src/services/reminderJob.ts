import type { PrismaClient } from "@prisma/client";
import {
  CareTaskStatus,
  CareTaskType,
  type SoilMoistureHint,
} from "@prisma/client";
import type { WeatherSnapshot } from "../domain/careEngine.js";
import { loadConfig } from "../config.js";
import { fetchUserWeatherSnapshot } from "../lib/userWeather.js";
import { subscribeNotifyRetryDelayMs } from "../lib/subscribeRetryBackoff.js";
import { getAccessToken, sendSubscribeMessage } from "./wechat.js";

const SOON_MS = 15 * 60 * 1000;
/** 与「雨天推迟」对称：干旱信号强时，浇水订阅可提前覆盖的最长时间窗 */
const EARLY_WATER_HORIZON_MS = 6 * 60 * 60 * 1000;
const WET_FORECAST_DEFER_THRESHOLD = 0.58;
const DRY_FORECAST_ADVANCE_THRESHOLD = 0.58;
/** 若短期仍偏湿，则不做「提前」以免与雨天推迟打架 */
const WET_BLOCK_EARLY_THRESHOLD = 0.45;

function careTaskVerb(type: CareTaskType): string {
  switch (type) {
    case CareTaskType.water:
      return "浇水";
    case CareTaskType.fertilize:
      return "施肥";
    case CareTaskType.repot:
      return "换盆";
    case CareTaskType.inspect:
      return "例行检查";
    default:
      return "养护";
  }
}

function isWaterDueBeyondSoonWindow(
  task: { dueDate: Date; type: CareTaskType },
  now: Date
): boolean {
  return (
    task.type === CareTaskType.water &&
    task.dueDate.getTime() > now.getTime() + SOON_MS
  );
}

/**
 * 高温/干旱预报或近期盆土偏干 → 允许在计划日前提前发浇水订阅（与雨天推迟对称）。
 */
function canAdvanceWaterReminderDueToDrought(
  weather: WeatherSnapshot | null,
  recentSoil: { soilMoistureHint: SoilMoistureHint } | null
): boolean {
  if (!weather) return false;
  if (
    weather.upcomingWetBias != null &&
    weather.upcomingWetBias >= WET_BLOCK_EARLY_THRESHOLD
  ) {
    return false;
  }
  if (
    weather.upcomingDryBias != null &&
    weather.upcomingDryBias >= DRY_FORECAST_ADVANCE_THRESHOLD
  ) {
    return true;
  }
  if (weather.temperatureC >= 31 && weather.relativeHumidity <= 42) {
    return true;
  }
  if (
    recentSoil &&
    (recentSoil.soilMoistureHint === "very_dry" ||
      recentSoil.soilMoistureHint === "dry")
  ) {
    return true;
  }
  return false;
}

export async function runReminderJob(
  prisma: PrismaClient
): Promise<{
  sent: number;
  skipped: number;
  skippedNoQuota: number;
  skippedMaxFailures: number;
  skippedWxError: number;
  skippedDeferredWetForecast: number;
  skippedDeferredSoilMoist: number;
  skippedEarlyWaterIneligible: number;
  sentEarlyDroughtWater: number;
}> {
  const config = loadConfig();
  const now = new Date();
  const soonEnd = new Date(now.getTime() + SOON_MS);
  const earlyEnd = new Date(now.getTime() + EARLY_WATER_HORIZON_MS);

  const soonTasks = await prisma.careTask.findMany({
    where: {
      status: CareTaskStatus.pending,
      notifySentAt: null,
      dueDate: { lte: soonEnd },
      OR: [
        { notifyNextAttemptAt: null },
        { notifyNextAttemptAt: { lte: now } },
      ],
    },
    include: { plant: { include: { user: true } } },
    take: 100,
    orderBy: { dueDate: "asc" },
  });

  const earlyWaterTasks = await prisma.careTask.findMany({
    where: {
      type: CareTaskType.water,
      status: CareTaskStatus.pending,
      notifySentAt: null,
      dueDate: { gt: soonEnd, lte: earlyEnd },
      OR: [
        { notifyNextAttemptAt: null },
        { notifyNextAttemptAt: { lte: now } },
      ],
    },
    include: { plant: { include: { user: true } } },
    take: 80,
    orderBy: { dueDate: "asc" },
  });

  const byId = new Map<string, (typeof soonTasks)[0]>();
  for (const t of soonTasks) {
    byId.set(t.id, t);
  }
  for (const t of earlyWaterTasks) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  const tasks = [...byId.values()]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, 100);

  let sent = 0;
  let skippedNoQuota = 0;
  let skippedMaxFailures = 0;
  let skippedWxError = 0;
  let skippedDeferredWetForecast = 0;
  let skippedDeferredSoilMoist = 0;
  let skippedEarlyWaterIneligible = 0;
  let sentEarlyDroughtWater = 0;
  const token = await getAccessToken(config.WECHAT_APPID, config.WECHAT_SECRET);

  for (const task of tasks) {
    const grant = await prisma.subscribeGrant.findUnique({
      where: {
        userId_templateId: {
          userId: task.plant.userId,
          templateId: config.SUBSCRIBE_TEMPLATE_ID,
        },
      },
    });

    if (!grant || grant.quota <= 0) {
      skippedNoQuota++;
      continue;
    }

    if (task.notifyFailCount >= 5) {
      skippedMaxFailures++;
      continue;
    }

    let weather: WeatherSnapshot | null = null;
    let recentSoil: { soilMoistureHint: SoilMoistureHint } | null = null;

    if (task.type === CareTaskType.water) {
      weather = await fetchUserWeatherSnapshot(prisma, task.plant.userId);

      const since = new Date(now.getTime() - 36 * 3600 * 1000);
      recentSoil = await prisma.soilRecord.findFirst({
        where: { plantId: task.plantId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { soilMoistureHint: true },
      });

      if (isWaterDueBeyondSoonWindow(task, now)) {
        if (!canAdvanceWaterReminderDueToDrought(weather, recentSoil)) {
          skippedEarlyWaterIneligible++;
          continue;
        }
      }

      if (
        weather?.upcomingWetBias != null &&
        weather.upcomingWetBias >= WET_FORECAST_DEFER_THRESHOLD
      ) {
        await prisma.careTask.update({
          where: { id: task.id },
          data: {
            notifyNextAttemptAt: new Date(now.getTime() + 24 * 3600 * 1000),
            lastError: "deferred_wet_forecast",
          },
        });
        skippedDeferredWetForecast++;
        continue;
      }

      if (
        recentSoil &&
        (recentSoil.soilMoistureHint === "very_wet" ||
          recentSoil.soilMoistureHint === "wet")
      ) {
        await prisma.careTask.update({
          where: { id: task.id },
          data: {
            notifyNextAttemptAt: new Date(now.getTime() + 12 * 3600 * 1000),
            lastError: "deferred_soil_recent_moist",
          },
        });
        skippedDeferredSoilMoist++;
        continue;
      }
    }

    const wx = await sendSubscribeMessage({
      accessToken: token,
      touser: task.plant.user.openid,
      templateId: config.SUBSCRIBE_TEMPLATE_ID,
      page: "pages/index/index",
      data: {
        thing1: {
          value: `${task.plant.nickname} 需要${careTaskVerb(task.type)}`,
        },
        time2: {
          value: task.dueDate.toISOString().slice(0, 16).replace("T", " "),
        },
      },
    });

    await prisma.notificationLog.create({
      data: {
        taskId: task.id,
        templateId: config.SUBSCRIBE_TEMPLATE_ID,
        errcode: wx.errcode,
        errmsg: wx.errmsg,
      },
    });

    if (wx.errcode === 0) {
      await prisma.$transaction([
        prisma.careTask.update({
          where: { id: task.id },
          data: {
            notifySentAt: new Date(),
            notifyFailCount: 0,
            notifyNextAttemptAt: null,
            lastError:
              task.type === CareTaskType.water &&
              isWaterDueBeyondSoonWindow(task, now)
                ? "advanced_drought_or_soil_dry"
                : null,
          },
        }),
        prisma.subscribeGrant.update({
          where: { id: grant.id },
          data: { quota: { decrement: 1 } },
        }),
      ]);
      sent++;
      if (
        task.type === CareTaskType.water &&
        isWaterDueBeyondSoonWindow(task, now)
      ) {
        sentEarlyDroughtWater++;
      }
    } else {
      const nextFailCount = task.notifyFailCount + 1;
      const delayMs = subscribeNotifyRetryDelayMs(nextFailCount);
      const nextAttempt =
        nextFailCount >= 5 ? null : new Date(now.getTime() + delayMs);
      const errSummary = `wx_${wx.errcode}_${wx.errmsg ?? ""}`;
      await prisma.careTask.update({
        where: { id: task.id },
        data: {
          notifyFailCount: { increment: 1 },
          notifyNextAttemptAt: nextAttempt,
          lastError: errSummary.slice(0, 500),
        },
      });
      skippedWxError++;
    }
  }

  const skipped =
    skippedNoQuota +
    skippedMaxFailures +
    skippedWxError +
    skippedDeferredWetForecast +
    skippedDeferredSoilMoist +
    skippedEarlyWaterIneligible;
  return {
    sent,
    skipped,
    skippedNoQuota,
    skippedMaxFailures,
    skippedWxError,
    skippedDeferredWetForecast,
    skippedDeferredSoilMoist,
    skippedEarlyWaterIneligible,
    sentEarlyDroughtWater,
  };
}
