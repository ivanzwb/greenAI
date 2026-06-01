# GreenAI Bot · uni-app

基于 **Vue 3 + Vite + uni-app** 的跨端壳工程，与仓库内 **Fastify 后端**、**微信原生小程序**（`miniprogram/`）共用同一套 REST 约定。

## 环境

- Node.js **≥ 18**
- 依赖与官方 `dcloudio/uni-preset-vue`（vite-ts）对齐；锁版本见 `package.json`。

## 安装与运行

```bash
cd uniapp
npm install
npm run dev:h5
```

- **微信小程序**：`npm run dev:mp-weixin`（需在 `src/manifest.json` → `mp-weixin` 填写真实 `appid`）。
- **鸿蒙小程序**：`npm run dev:mp-harmony`（需本机已按 DCloud 文档配置对应工具链）。
- **App 资源包**：`npm run dev:app-android` / `npm run build:app-android`（真机 APK/AAB 通常还需 HBuilderX 云打包或离线壳工程）。

## 配置 API

编辑 `src/utils/config.ts` 中的 `API_BASE_URL`（默认 `http://127.0.0.1:3000`，与小程序 `utils/api.js` 一致）。

登录：App 需接入**微信开放平台移动应用**或其它账号体系后，将 JWT 写入 `uni.setStorageSync('greenai_token', ...)`（key 见 `config.ts`）。

## Tab 图标

`npm install` 后于仓库根目录执行一次：

```bash
node scripts/write-uniapp-tab-placeholders.mjs
```

会生成 `src/static/tab/*.png` 占位图；发布前请替换为设计稿切图。

## 与原生小程序的关系

- **业务优先**可继续在 `miniprogram/` 迭代；本目录逐步把各页迁到 Vue 并接同一 API。
- 若将来以 uni-app 为主，可用 `build:mp-weixin` 产出小程序目录再导入微信开发者工具。
