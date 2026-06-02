# 小程序图标（SVG 源稿）

与 **GreenAI Bot** 设计稿一致的线稿风格图标，手绘为 **SVG**，供维护与缩放。

## 生成 PNG（微信 tabBar / `<image>` 使用）

小程序端使用 **PNG**，在仓库根目录执行：

```bash
npm install
npm run icons:render
```

依赖根目录 `devDependencies` 中的 `sharp`，将 `icons-src/*.svg` 写入 `icons-png/*.png`（尺寸见 `scripts/render-svg-icons.mjs`）。

修改任意 SVG 后务必重新执行 `npm run icons:render` 并提交更新后的 PNG。
