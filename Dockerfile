# FocusDeck 一体镜像：前端 dist 和 API 打进同一个容器，同源提供服务。
# 这样一键部署不需要额外的 nginx，也不用给前端单独配 VITE_API_BASE。

# ---------- 1. 前端 ----------
FROM node:22-bookworm-slim AS web
WORKDIR /web
RUN npm i -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
# 留空即同源：容器里前端和 /api 是同一个 origin，用户不必在设置里填服务器地址。
# 前后端分开部署时用 --build-arg VITE_API_BASE=https://api.example.com 覆盖。
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
RUN pnpm build

# ---------- 2. 服务端 ----------
# better-sqlite3 是原生模块，预编译包常拉不下来而退回源码编译，
# 所以这一层用自带 gcc/g++/python3/make 的完整镜像。
FROM node:22-bookworm AS api
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm ci --include=dev
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

# ---------- 3. 运行 ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DB_PATH=/data/focusdeck.db \
    STATIC_DIR=/app/public

COPY --from=api /app/package.json ./
COPY --from=api /app/node_modules ./node_modules
COPY --from=api /app/dist ./dist
COPY --from=web /web/dist ./public

# 不挂卷也能起来：数据落在容器内，删容器才丢。挂了卷就走卷。
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8787

# Node 22 自带 fetch，不为一条健康检查装 curl。
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
