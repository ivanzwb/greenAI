import type { PrismaClient } from "@prisma/client";
import { CareTaskStatus, CareTaskType } from "@prisma/client";
import { loadConfig } from "../config.js";
import { subscribeNotifyRetryDelayMs } from "../lib/subscribeRetryBackoff.js";
import { getAccessToken, sendSubscribeMessage } from "./wechat.js";

export async function runReminderJob(
  prisma: PrismaClient
): Promise<{
  sent: number;
  skipped: number;
  skippedNoQuota: number;
  skippedMaxFailures: number;
  skippedWxError: number;
}> {
  const config = loadConfig();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 15 * 60 * 1000);

  const tasks = await prisma.careTask.findMany({
    where: {
      status: CareTaskStatus.pending,
      notifySentAt: null,
      dueDate: { lte: windowEnd },
      OR: [
        { notifyNextAttemptAt: null },
        { notifyNextAttemptAt: { lte: now } },
      ],
    },
    include: { plant: { include: { user: true } } },
    take: 100,
  });

  let sent = 0;
  let skippedNoQuota = 0;
  let skippedMaxFailures = 0;
  let skippedWxError = 0;
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

    const wx = await sendSubscribeMessage({
      accessToken: token,
      touser: task.plant.user.openid,
      templateId: config.SUBSCRIBE_TEMPLATE_ID,
      page: "pages/index/index",
      data: {
        thing1: {
          value: `${task.plant.nickname} 需要${task.type === CareTaskType.water ? "浇水" : "施肥"}`,
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
          },
        }),
        prisma.subscribeGrant.update({
          where: { id: grant.id },
          data: { quota: { decrement: 1 } },
        }),
      ]);
      sent++;
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

  const skipped = skippedNoQuota + skippedMaxFailures + skippedWxError;
  return {
    sent,
    skipped,
    skippedNoQuota,
    skippedMaxFailures,
    skippedWxError,
  };
}

