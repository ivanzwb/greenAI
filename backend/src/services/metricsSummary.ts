import type { PrismaClient } from "@prisma/client";
import { CareTaskStatus } from "@prisma/client";
import { loadConfig } from "../config.js";

export type MetricsSummary = {
  generatedAt: string;
  windowDays: number;
  users: { total: number; createdInWindow: number };
  plants: { total: number; createdInWindow: number };
  careTasks: {
    pending: number;
    completedTotal: number;
    completedInWindow: number;
    skippedTotal: number;
  };
  subscribeGrants: {
    templateId: string;
    usersWithPositiveQuota: number;
    sumQuota: number;
  };
  notificationsInWindow: {
    sentOk: number;
    failed: number;
    byErrcode: Record<string, number>;
  };
  reminderQueue: {
    pendingDueNext24hUnsent: number;
  };
};

function errcodeKey(code: number | null): string {
  if (code === null || code === undefined) return "null";
  return String(code);
}

export async function getMetricsSummary(
  prisma: PrismaClient,
  windowDays: number
): Promise<MetricsSummary> {
  const config = loadConfig();
  const days = Math.min(Math.max(windowDays, 1), 90);
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const horizon24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [
    usersTotal,
    usersInWindow,
    plantsTotal,
    plantsInWindow,
    tasksPending,
    tasksCompletedTotal,
    tasksCompletedInWindow,
    tasksSkippedTotal,
    notifGroups,
    usersWithPositiveQuota,
    sumQuotaAgg,
    pendingDueNext24hUnsent,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.plant.count(),
    prisma.plant.count({ where: { createdAt: { gte: since } } }),
    prisma.careTask.count({ where: { status: CareTaskStatus.pending } }),
    prisma.careTask.count({ where: { status: CareTaskStatus.completed } }),
    prisma.careTask.count({
      where: {
        status: CareTaskStatus.completed,
        completedAt: { gte: since },
      },
    }),
    prisma.careTask.count({ where: { status: CareTaskStatus.skipped } }),
    prisma.notificationLog.groupBy({
      by: ["errcode"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.subscribeGrant.count({
      where: {
        templateId: config.SUBSCRIBE_TEMPLATE_ID,
        quota: { gt: 0 },
      },
    }),
    prisma.subscribeGrant.aggregate({
      where: { templateId: config.SUBSCRIBE_TEMPLATE_ID },
      _sum: { quota: true },
    }),
    prisma.careTask.count({
      where: {
        status: CareTaskStatus.pending,
        notifySentAt: null,
        dueDate: { gte: now, lte: horizon24h },
      },
    }),
  ]);

  let sentOk = 0;
  let failed = 0;
  const byErrcode: Record<string, number> = {};
  for (const row of notifGroups) {
    const c = row._count._all;
    const key = errcodeKey(row.errcode);
    byErrcode[key] = (byErrcode[key] ?? 0) + c;
    if (row.errcode === 0) sentOk += c;
    else failed += c;
  }

  return {
    generatedAt: now.toISOString(),
    windowDays: days,
    users: { total: usersTotal, createdInWindow: usersInWindow },
    plants: { total: plantsTotal, createdInWindow: plantsInWindow },
    careTasks: {
      pending: tasksPending,
      completedTotal: tasksCompletedTotal,
      completedInWindow: tasksCompletedInWindow,
      skippedTotal: tasksSkippedTotal,
    },
    subscribeGrants: {
      templateId: config.SUBSCRIBE_TEMPLATE_ID,
      usersWithPositiveQuota: usersWithPositiveQuota,
      sumQuota: sumQuotaAgg._sum.quota ?? 0,
    },
    notificationsInWindow: { sentOk, failed, byErrcode },
    reminderQueue: { pendingDueNext24hUnsent: pendingDueNext24hUnsent },
  };
}
