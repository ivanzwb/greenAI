-- DeviceBindingCode: one-time bind code from mini-program → firmware claim

CREATE TABLE "DeviceBindingCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceBindingCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceBindingCode_code_key" ON "DeviceBindingCode"("code");

CREATE INDEX "DeviceBindingCode_userId_idx" ON "DeviceBindingCode"("userId");

CREATE INDEX "DeviceBindingCode_expiresAt_idx" ON "DeviceBindingCode"("expiresAt");

ALTER TABLE "DeviceBindingCode" ADD CONSTRAINT "DeviceBindingCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
