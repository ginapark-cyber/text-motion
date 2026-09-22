# text-motion — hosted build (Railway / any Docker host)
# Node + Playwright Chromium + ffmpeg-static + zip in one image.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOSTED=1 \
    NO_WATCH=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# zip: used to package PNG-sequence exports for download
RUN apt-get update && apt-get install -y --no-install-recommends zip ca-certificates && rm -rf /var/lib/apt/lists/*

# install deps first (better layer caching). postinstall downloads Chromium (into /ms-playwright) and the ffmpeg binary
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# OS libraries Chromium needs on Debian
RUN npx playwright install-deps chromium

COPY . .

# persistent data (mount a volume here on Railway): rendered files + uploaded logos
ENV EXPORTS_DIR=/data/exports \
    LOGOS_DIR=/data/logos \
    FONTS_DIR=/data/fonts
RUN mkdir -p /data/exports /data/logos /data/fonts

EXPOSE 5173
CMD ["node", "server.js"]
