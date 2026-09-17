FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG BACKEND_URL=http://backend:5174
ENV BACKEND_URL=$BACKEND_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 4000
CMD ["node", "server.js"]
