# 使用轻量级的 Node.js 18 官方 Alpine 镜像
FROM node:18-alpine

WORKDIR /usr/src/app

# 复制配置文件和脚本
COPY package.json ./
COPY server.js ./

# 暴露平台默认转发的 7860 端口
EXPOSE 7860

# 启动服务
CMD [ "node", "server.js" ]
