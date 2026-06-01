<template>
  <view class="page">
    <view class="profile card">
      <view class="avatar">🌿</view>
      <view class="meta">
        <text class="name">GreenAI 花友</text>
        <text class="sub">API {{ apiBase }}</text>
      </view>
    </view>
    <text class="hint">设置项与 `miniprogram/pages/settings` 对齐；App 端需自行实现登录后写入 Token（见 `src/utils/request.ts`）。</text>
  </view>
</template>

<script setup lang="ts">
import { API_BASE_URL } from "@/utils/config";

const apiBase = API_BASE_URL;
</script>

<style scoped>
.page {
  padding: 24rpx;
}
.card {
  background: #fff;
  border-radius: 20rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.06);
  padding: 32rpx;
  margin-bottom: 24rpx;
  display: flex;
  align-items: center;
  gap: 28rpx;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #e8f5e9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52rpx;
}
.meta {
  flex: 1;
}
.name {
  font-size: 40rpx;
  font-weight: 800;
  color: #212121;
  display: block;
  margin-bottom: 8rpx;
}
.sub {
  font-size: 24rpx;
  color: #9e9e9e;
}
.hint {
  font-size: 24rpx;
  color: #9e9e9e;
  line-height: 1.5;
}
</style>
