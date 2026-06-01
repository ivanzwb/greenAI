import type { PrismaClient } from "@prisma/client";

export type DeviceLogEntryInput = {
  level: string;
  message: string;
  occurredAt?: Date | null;
  meta?: Record<string, string | number | boolean> | null;
};

export type DeviceLogIngestPayload = {
  hardwareId: string;
  userId: string;
  /** 传 `undefined` 时不因日志 ingest 改写 `Device.plantId`。 */
  plantId?: string | null;
  entries: DeviceLogEntryInput[];
};

export type DeviceLogIngestResult = {
  deviceId: string;
  inserted: number;
};

  /**
   * Upsert 设备后批量写入运行日志，并按本批 `occurredAt`（或当前时间）刷新 `lastSeenAt`。
   * `plantId` 仅用于 create 分支；路由层传 `undefined` 时不改写已绑定植物。
   */
export async function ingestDeviceLogs(
  prisma: PrismaClient,
  payload: DeviceLogIngestPayload
): Promise<DeviceLogIngestResult> {
  const device = await prisma.device.upsert({
    where: {
      userId_hardwareId: {
        userId: payload.userId,
        hardwareId: payload.hardwareId,
      },
    },
    create: {
      userId: payload.userId,
      hardwareId: payload.hardwareId,
      plantId: payload.plantId ?? null,
    },
    update:
      payload.plantId === undefined
        ? {}
        : { plantId: payload.plantId },
  });

  const now = new Date();
  const latest = payload.entries.reduce<Date | null>((acc, e) => {
    const t = e.occurredAt ?? null;
    if (!t) return acc;
    if (!acc || t > acc) return t;
    return acc;
  }, null);

  await prisma.deviceIngestLog.createMany({
    data: payload.entries.map((e) => ({
      deviceId: device.id,
      level: e.level,
      message: e.message,
      occurredAt: e.occurredAt ?? null,
      meta: e.meta ?? undefined,
    })),
  });

  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: latest ?? now },
  });

  return {
    deviceId: device.id,
    inserted: payload.entries.length,
  };
}
