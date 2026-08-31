# better-sqlite3 是原生模块，预编译包常拉不下来而退回源码编译，
# 所以构建阶段用自带 gcc/g++/python3/make 的完整镜像，运行阶段仍回到 slim。
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
EXPOSE 8787
CMD ["node", "dist/index.js"]
