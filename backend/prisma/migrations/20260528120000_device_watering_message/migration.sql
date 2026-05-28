-- Device.wateringMessage: 用户在小程序为该设备选择的浇水回馈文案。
-- NULL 时由固件回退到内置默认句。

ALTER TABLE "Device" ADD COLUMN "wateringMessage" TEXT;
