<template>
  <view class="page">
    <view class="card weather">
      <view class="weather-row">
        <view class="col">
          <text class="date">{{ dateLine }}</text>
          <text class="big-temp">--°C</text>
          <text class="sub">连接后端后显示 Open-Meteo 实况</text>
        </view>
        <text class="sun">☀️</text>
      </view>
    </view>

    <view class="section-title">待办事项</view>
    <view class="card row">
      <view class="donut">
        <text class="num">--</text>
        <text class="cap">待浇水</text>
      </view>
      <view class="donut fert">
        <text class="num">--</text>
        <text class="cap">待施肥</text>
      </view>
    </view>

    <view class="section-title">常用工具</view>
    <view class="card tools">
      <view class="tool"><text class="ico">🌼</text><text>植物识别</text></view>
      <view class="tool"><text class="ico">🪴</text><text>土壤识别</text></view>
      <view class="tool"><text class="ico">🐛</text><text>病虫害诊断</text></view>
    </view>

    <text class="hint">在 `src/utils/config.ts` 配置 API；微信登录需在 App 侧接开放平台或暂用手动填 Token 调试。</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";

const dateLine = computed(() => {
  const d = new Date();
  const w = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${w}`;
});
</script>

<style scoped>
.page {
  padding: 24rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}
.card {
  background: #fff;
  border-radius: 20rpx;
  border: 1rpx solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.04);
  padding: 28rpx;
  margin-bottom: 24rpx;
}
.weather-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.col {
  flex: 1;
}
.date {
  font-size: 24rpx;
  color: #9e9e9e;
  display: block;
  margin-bottom: 8rpx;
}
.big-temp {
  font-size: 56rpx;
  font-weight: 800;
  color: #212121;
}
.sub {
  font-size: 24rpx;
  color: #616161;
  display: block;
  margin-top: 8rpx;
}
.sun {
  font-size: 100rpx;
}
.section-title {
  font-size: 32rpx;
  font-weight: 700;
  margin: 16rpx 0;
  color: #212121;
}
.row {
  display: flex;
  justify-content: space-around;
}
.donut {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  border: 12rpx solid #90caf9;
  background: #e3f2fd;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.donut.fert {
  border-color: #ffcc80;
  background: #fff3e0;
}
.num {
  font-size: 44rpx;
  font-weight: 800;
}
.cap {
  font-size: 22rpx;
  color: #616161;
  margin-top: 4rpx;
}
.tools {
  display: flex;
  gap: 16rpx;
}
.tool {
  flex: 1;
  text-align: center;
  padding: 20rpx 8rpx;
  background: #f5f5f5;
  border-radius: 16rpx;
  font-size: 22rpx;
  color: #616161;
}
.ico {
  display: block;
  font-size: 40rpx;
  margin-bottom: 8rpx;
}
.hint {
  font-size: 22rpx;
  color: #9e9e9e;
  line-height: 1.5;
}
</style>
