import type { PrismaClient } from "@prisma/client";

export type SensorReadingInput = {
  /** 测量时刻；可为 Unix 秒数或 ISO 字符串。 */
  measuredAt: Date;
  /** 环境温度 ℃。 */
  tempC?: number | null;
  /** 土壤湿度（0..100）。 */
  soilMoisture?: number | null;
  /** 土壤 pH（0..14）。 */
  phLevel?: number | null;
  /** 光照 lx。 */
  lux?: number | null;
};

export type SensorIngestPayload = {
  hardwareId: string;
  /** 由路由层根据 `hardwareId` 查库得到，不来自设备 JSON。 */
  userId: string;
  /** 不使用设备上报；传 `undefined` 表示不因 ingest 改写 `Device.plantId`（植物绑定在小程序 PATCH）。 */
  plantId?: string | null;
  readings: SensorReadingInput[];
};

export type SensorIngestResult = {
  deviceId: string;
  inserted: number;
  /** 因 (deviceId, measuredAt) 唯一约束被服务端去重的笔数。 */
  deduped: number;
};

/**
 * 幂等 ingest：
 *  - 设备须已通过 claim 预建 `Device`；按 (userId, hardwareId) upsert 仅用于定位已有行
 *  - 不因 ingest 改写 `plantId`
 *  - 按 (deviceId, measuredAt) 唯一约束去重写入读数
 *  - 刷新 device.lastSeenAt 为本批次最新 measuredAt
 */
export async function ingestSensorReadings(
  prisma: PrismaClient,
  payload: SensorIngestPayload
): Promise<SensorIngestResult> {
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

  const latest = payload.readings.reduce<Date | null>((acc, r) => {
    if (!acc || r.measuredAt > acc) return r.measuredAt;
    return acc;
  }, null);

  const result = await prisma.deviceReading.createMany({
    data: payload.readings.map((r) => ({
      deviceId: device.id,
      measuredAt: r.measuredAt,
      tempC: r.tempC ?? null,
      soilMoisture: r.soilMoisture ?? null,
      phLevel: r.phLevel ?? null,
      lux: r.lux ?? null,
    })),
    skipDuplicates: true,
  });

  if (latest) {
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: latest },
    });
  }

  return {
    deviceId: device.id,
    inserted: result.count,
    deduped: payload.readings.length - result.count,
  };
}
