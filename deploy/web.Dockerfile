# Caveman web app. On Vercel, deploy the web/ directory directly instead.
FROM node:22-slim AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 CAVEMAN_AUTH_AUTO_MIGRATE=0
RUN npm run build

FROM node:22-slim
WORKDIR /web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /web ./
RUN useradd --create-home --uid 10001 caveman && mkdir -p .local && chown caveman .local
USER caveman
EXPOSE 3000
CMD ["npx", "next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
