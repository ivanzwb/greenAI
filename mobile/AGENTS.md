# Cursor Multi-Agent Pipeline (受限环境 & 统一工程目录扩展版)

## 📌 终极目标 (Ultimate Goal)
在**绝对不改动、不破坏**现有微信小程序前端（`/miniprogram`）和后端（`/backend`）代码的前提下，以小程序为逻辑蓝本，在根目录下【自动创建并全量生成】移动端项目（目录命名为 `/mobile`，技术栈使用 [填你的技术栈，如 Flutter / React Native]）。

---

## 🚫 绝对红线与资产保护 (Directory Guardrails)
- **只读目录（严禁修改）**：`/miniprogram/**/*`、`/backend/**/*`、`/firmware/**/*`、`/openspec/**/*`。你只能将其作为静态逻辑和 API 蓝本进行静态阅读。
- **允许写入目录**：所有的新建、修改、编译、运行操作，**必须且只能**限制在新建的 `/mobile/**/*` 目录下。
- **环境隔离**：不需要、也禁止尝试在本地启动任何 `/backend`、`/miniprogram` 服务或 Docker 容器。

---

## 🤖 自动化批处理与影子验证流水线 (Shadow Verification Pipeline)

当你（Cursor 3 Agent）接收到迁移指令时，请在后台沙箱工作树中，按照以下 4 个阶段不间断、全自动连续执行：

### 阶段一：静态资产与路由映射 (Static Analysis)
1. **结构提取**：通读 `/miniprogram` 下的页面，梳理出完整的页面路由表、全局状态（App Store）以及 UI 布局意图。
2. **契约反推**：通过阅读 `/backend` 下的接口代码或 `/miniprogram` 里的请求封装，反推出所有核心业务的请求与返回数据结构（Request/Response JSON）。

### 阶段二：移动端独立脚手架配置 (Standalone Mobile Build)
1. **自动建目录**：在根目录下创建 `/mobile` 文件夹，并初始化所选技术栈的基础工程。
2. **双端适配网关配置**：
    - **线上代理模式**：将统一网络请求的 BaseURL 指向用户指定的线上/测试环境 URL（跳过本地后端）。
    - **影子 Mock 机制**：根据阶段一反推的 JSON 契约，在 `/mobile` 内编写局部 Mock 数据拦截器，确保在无网络/无本地后端情况下，移动端页面依然能加载出完整数据状态。

### 阶段三：页面流水线翻译与可视化验证 (Visible Verification)
1. **流水线生成**：将小程序的页面 100% 对齐翻译至 `/mobile` 对应的组件和状态逻辑。
2. **启动本地预览**：在 `/mobile` 目录下执行移动端 Web 或 H5 的本地启动命令（如 `npm run dev`）。
3. **调用内置浏览器截图（核心）**：利用 Cursor 3 内置的浏览器自动化工具（MCP 浏览器扩展）访问 `http://localhost:[端口]`。
    - 使用 `browser_take_screenshot` 拦截带有 Mock 数据的 APP 关键页面（如首页、详情页）。
    - 检查视觉效果（是否有错位、文本溢出）。若有视觉 Bug，自动在 `/mobile` 中修复并重新截图，直至视觉合格。

### 阶段四：产出视觉与一致性审计报告 (Final Audit)
- 运行结束后，在 Agents Window 中直接输出：
  1. 成功在 `/mobile` 中迁移的页面清单。
  2. **验证成功的 APP 真实渲染效果截图预览（Inline Preview）**。
  3. 双端（小程序 vs 移动端）交互逻辑一致性校验报告。

---

## 📱 移动端实现约定 (Mobile Implementation Conventions)

- **长页面滚动约束**：Expo Web / React Native Web 中，外层手机框和内容区必须有明确高度约束。`phoneFrame` 应保持视口高度，`content` / `screen` 应保留 `flex: 1` 与 `minHeight: 0`，避免 `ScrollView` 在长页面失效。
- **按钮与动态内容间距**：按钮后面如果会出现卡片、结果块、保存按钮或其它动态内容，不要裸相邻。优先使用统一间距容器（如 `sectionAction`、`cardAction`）承载按钮，保证上下留白稳定。
- **卡片列表节奏**：首页、列表页、结果页不要只依赖 `Card` 的默认 margin。遇到连续卡片、快捷入口、待办列表等区域，应加页面级 block 间距，避免视觉上“紧贴”。
- **Mock 优先**：`/mobile` 继续使用前端 Mock 拦截请求来完成页面状态验证；不要启动本地 `/backend`、`/miniprogram` 或 Docker。
- **验证要求**：每次修改 `/mobile` 后，至少在 `/mobile` 目录运行 `npm run check`。涉及页面布局或交互时，继续用 Expo Web 和内置浏览器截图做可视化验证。
