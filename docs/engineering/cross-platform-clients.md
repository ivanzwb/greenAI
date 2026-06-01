# 跨端客户端（小程序 · Android · iOS · 鸿蒙）

设计稿 **GreenAI Bot**（首页 / 养护 / 知识 / 我 + 白底绿叶色）在仓库中的落地分为两层：

1. **微信原生小程序**（`miniprogram/`）：当前业务与后端 API 已对接，适合作为微信内主入口；信息架构已与设计稿四 Tab 对齐。可与 uni-app 产出的 `mp-weixin` 并存迭代，按团队选择主维护端。
2. **uni-app 跨端工程**（`uniapp/`）：Vue 3 + Vite + 官方 `@dcloudio` 依赖；支持 **H5、App（Android/iOS 资源包）、微信小程序、鸿蒙小程序（mp-harmony）** 等目标。详见 [`uniapp/README.md`](../../uniapp/README.md)。
## 接口与鉴权（各端共用）

- **Base URL**：与 `miniprogram/utils/api.js` 中 `BASE_URL` 一致（部署后改为 HTTPS 生产域名）。
- **鉴权**：JWT（`Authorization: Bearer …`），登录流程在小程序侧为 `wx.login` + 后端换 token；App 侧需单独实现微信开放平台移动应用登录，或手机号/邮箱等（产品决策）。

## 方案对比（手机 + 鸿蒙）

| 方案 | Android / iOS | 微信小程序 | 鸿蒙 NEXT | 说明 |
|------|----------------|------------|------------|------|
| **uni-app（Vue）** | 发行到 App-plus / 新运行时 | 良好支持 | 官方在推 uni-app x / Ark 适配，需跟进版本文档 | 一套 Vue 语法多端，国内生态与中文文档友好；与设计稿 WXML 不共享，需重写模板。 |
| **Taro + React** | 可接 React Native 或 Taro 鸿蒙实验通道 | 官方支持 | 视 Taro/DCloud 版本 | 适合团队以 React 为主。 |
| **Flutter** | 极佳 | 无官方小程序同构；小程序仍保留原生 | 鸿蒙侧有社区/官方进展，需评估版本 | UI 自绘与 **Material 绿** 一致性好；与现有小程序 **零模板复用**，可共享 OpenAPI 文档与部分业务常量。 |

**当前选型**：已采用 **uni-app**（`uniapp/`）。若后续极重图形性能或需完全脱离 DCloud 工具链，可再评估 **Flutter** 独立 App 与小程序双轨。

## 小程序侧已对齐的设计点（实现参考）

- Tab：**首页 · 养护 · 知识 · 我**；「识别 / 工具」从首页 **常用工具** 进入 `pages/identify/identify`（非 Tab）。
- 全局色：**白底** + 主色接近 `#43A047`（`app.wxss` 变量）。
- 首页：大卡天气、待办浇水/施肥计数、植物横滑、三宫格工具。

## 下一步（uni-app）

1. 在 `uniapp/` 执行 `npm install` 与 `node ../scripts/write-uniapp-tab-placeholders.mjs`，再 `npm run dev:h5` 验证。
2. 逐页对接：`/tasks/today`、`/plants`、`/weather/*`、`/users/me` 等与小程序一致。
3. **鸿蒙**：使用 `dev:mp-harmony` / `build:mp-harmony`；**HarmonyOS NEXT** 策略以 [uni 官方鸿蒙文档](https://uniapp.dcloud.net.cn/) 为准。
4. **App 上架**：配置 `manifest.json` 应用名、包名、图标；Android/iOS 真机包按 DCloud 云打包或离线集成流程。
