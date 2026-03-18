FROM node:20-slim AS build
WORKDIR /app
COPY platform/package.json platform/package-lock.json ./
RUN npm ci
COPY platform/tsconfig.json ./
COPY platform/src/ src/
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY platform/package.json platform/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/ dist/
COPY agent/ /app/agent/
ENV AGENT_DIR=/app/agent
EXPOSE 8081
CMD ["node", "dist/index.js"]
