<template>
  <view class="page">
    <view class="search-bar">
      <text class="icon">🔍</text>
      <input class="input" type="text" placeholder="搜索我的植物" disabled />
    </view>
    <text class="hint">对接 `GET /plants` 后在此展示列表；与微信原生 `miniprogram/pages/plants` 行为对齐。</text>
  </view>
</template>

<script setup lang="ts"></script>

<style scoped>
.page {
  padding: 24rpx;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 24rpx;
  border-radius: 999rpx;
  background: #f5f5f5;
  border: 1rpx solid rgba(0, 0, 0, 0.06);
}
.icon {
  opacity: 0.6;
}
.input {
  flex: 1;
  font-size: 28rpx;
}
.hint {
  margin-top: 24rpx;
  font-size: 24rpx;
  color: #9e9e9e;
  line-height: 1.5;
}
</style>
