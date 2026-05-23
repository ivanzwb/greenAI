#!/usr/bin/env bash
# Deploy greenAI API stack (Docker Compose + optional nginx reverse proxy).
# Run from repository root.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ──────────────────────────────────────────────────────────────
# 0. 加载 .env（供后续 nginx 配置和 Docker Compose 使用）
# ──────────────────────────────────────────────────────────────
if [[ ! -f ".env" ]]; then
  echo "Missing .env in repo root. Copy .env.example to .env and fill secrets." >&2
  exit 1
fi
source .env

COMPOSE_FILE="deploy/docker-compose.prod.yml"
API_PORT="${API_PUBLISH_PORT:-3000}"

# ──────────────────────────────────────────────────────────────
# 1. Nginx 反向代理设置（可选；NGINX_DOMAIN 不设置则跳过）
# ──────────────────────────────────────────────────────────────
setup_nginx() {
  local domain="${NGINX_DOMAIN:-}"
  if [[ -z "$domain" ]]; then
    echo "  -> NGINX_DOMAIN 未设置，跳过 nginx 配置。"
    echo "     如需 nginx 反代，请设置：NGINX_DOMAIN=your.domain.com"
    return 0
  fi

  # --- 1a. 检测 / 安装 nginx ---
  if command -v nginx &>/dev/null; then
    echo "  -> 检测到 nginx $(nginx -v 2>&1 | grep -oP '[\d.]+' | head -1)"
  else
    echo "  -> 未安装 nginx，正在安装……"
    local pm=""
    if command -v apt &>/dev/null; then
      pm="apt"; apt update -y && apt install -y nginx
    elif command -v dnf &>/dev/null; then
      pm="dnf"; dnf install -y nginx
    elif command -v yum &>/dev/null; then
      pm="yum"; yum install -y nginx
    else
      echo "  !! 不支持的包管理器，请手动安装 nginx。" >&2
      return 1
    fi
    # 确保 nginx 开机自启并启动
    systemctl enable nginx 2>/dev/null || true
    systemctl start nginx 2>/dev/null || true
  fi

  # --- 1b. 决定目标目录（优先 sites-available，兜底 conf.d）---
  local conf_target=""
  if [[ -d "/etc/nginx/sites-available" ]]; then
    conf_target="/etc/nginx/sites-available/greenai.conf"
  else
    conf_target="/etc/nginx/conf.d/greenai.conf"
  fi

  # --- 1c. 读取模板并生成配置 ---
  local template="$ROOT/deploy/nginx-greenai.conf"
  if [[ ! -f "$template" ]]; then
    echo "  !! 模板文件缺失：$template" >&2
    return 1
  fi

  local ssl_cert="${NGINX_SSL_CERT:-}"
  local ssl_key="${NGINX_SSL_KEY:-}"

  echo "  -> 生成配置文件：$conf_target"
  sed \
    -e "s|\${api_port}|${API_PORT}|g" \
    -e "s|\${domain}|${domain}|g" \
    -e "s|\${ssl_cert}|${ssl_cert}|g" \
    -e "s|\${ssl_key}|${ssl_key}|g" \
    "$template" > "$conf_target"

  # --- 1d. SSL 证书存在时，取消注释 HTTPS 相关行 ---
  if [[ -n "$ssl_cert" && -f "$ssl_cert" && -n "$ssl_key" && -f "$ssl_key" ]]; then
    echo "  -> 检测到 SSL 证书文件，启用 HTTPS……"
    # 取消注释 listen 443 ssl; 和 ssl_* 行（去掉行首的 # 及一个空格）
    sed -i \
      -e '/listen 443 ssl;/s/^# *//' \
      -e '/listen \[::\]:443 ssl;/s/^# *//' \
      -e '/ssl_certificate /s/^# *//' \
      -e '/ssl_protocols /s/^# *//' \
      -e '/ssl_ciphers /s/^# *//' \
      "$conf_target"
    echo "  -> HTTPS 已启用（证书：$ssl_cert）"
  else
    echo "  -> SSL 证书未配置或文件不存在，仅启用 HTTP（80）。"
    echo "     设置 NGINX_SSL_CERT + NGINX_SSL_KEY 路径并确保文件存在以启用 HTTPS。"
  fi

  # --- 1e. 启用站点（sites-available 下需 symlink 到 sites-enabled）---
  if [[ -d "/etc/nginx/sites-enabled" ]]; then
    ln -sf "$conf_target" "/etc/nginx/sites-enabled/greenai.conf"
    echo "  -> 站点已启用（symlink: sites-enabled/greenai.conf）"
  fi
  # conf.d 下的文件由 nginx 自动加载，无需额外操作

  # --- 1f. 验证并重载 nginx ---
  echo "  -> 验证 nginx 配置……"
  if nginx -t 2>&1; then
    echo "  -> 重载 nginx……"
    if systemctl is-active --quiet nginx 2>/dev/null; then
      systemctl reload nginx || nginx -s reload
    else
      systemctl start nginx || nginx
    fi
    echo "  OK: nginx 配置已生效"
  else
    echo "  !! nginx 配置验证失败，请检查 $conf_target" >&2
    return 1
  fi
}

echo "===== greenAI 部署 ====="
echo "==> [1/3] Nginx 反向代理"
setup_nginx

# ──────────────────────────────────────────────────────────────
# 2. Docker Compose 构建并启动
# ──────────────────────────────────────────────────────────────
echo ""
echo "==> [2/3] 构建并启动 Docker 栈（${COMPOSE_FILE}）"
docker compose -f "$COMPOSE_FILE" --env-file .env up -d --build

# ──────────────────────────────────────────────────────────────
# 3. 健康检查
# ──────────────────────────────────────────────────────────────
echo ""
echo "==> [3/3] 等待 API 健康检查（localhost:${API_PORT}）"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    echo "OK: /health"
    if [[ -n "${NGINX_DOMAIN:-}" ]]; then
      echo ""
      echo "部署完成！"
      echo "  小程序 BASE_URL : https://${NGINX_DOMAIN}"
    else
      echo ""
      echo "部署完成！API 地址：http://127.0.0.1:${API_PORT}"
      echo "提示：NGINX_DOMAIN 未设置，如需公网访问请配置 nginx。"
    fi
    exit 0
  fi
  sleep 1
done
echo "WARN: /health 未在预期时间内就绪；请检查：docker compose -f $COMPOSE_FILE logs -f api" >&2
exit 1
