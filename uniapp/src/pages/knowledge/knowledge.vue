<template>
  <view class="page">
    <view class="search-bar">
      <input class="input flex" type="text" placeholder="搜索养护知识" disabled />
      <text class="cam">📷</text>
    </view>
    <text class="hint">对接知识文章 API 与 `miniprogram/pages/discover` 一致。</text>
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
.flex {
  flex: 1;
}
.input {
  font-size: 28rpx;
}
.cam {
  font-size: 36rpx;
}
.hint {
  margin-top: 24rpx;
  font-size: 24rpx;
  color: #9e9e9e;
  line-height: 1.5;
}
</style>
