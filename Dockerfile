FROM node:24.14.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY model.mjs app.source.js ./
COPY tools ./tools
COPY server ./server
COPY src ./src
COPY dist ./dist
RUN npm run build && npm test

FROM node:24.14.0-bookworm-slim
WORKDIR /app
COPY --from=build /app/package.json /app/model.mjs ./
COPY --from=build /app/server ./server
COPY --from=build /app/tools/server.mjs /app/tools/bot.mjs ./tools/
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production APP_MODE=telegram HOST=0.0.0.0 DATA_DIR=/data TZ=Europe/Moscow
CMD ["node", "tools/server.mjs"]
