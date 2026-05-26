-- DeviceIngestLog: firmware diagnostic lines via POST /internal/sensors/logs (same HMAC as sensor ingest)

CREATE TABLE "DeviceIngestLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceIngestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceIngestLog_deviceId_createdAt_idx" ON "DeviceIngestLog"("deviceId", "createdAt");

ALTER TABLE "DeviceIngestLog" ADD CONSTRAINT "DeviceIngestLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
