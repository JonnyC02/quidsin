FROM node:24-alpine
WORKDIR /repo

COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/core/package.json packages/core/
COPY packages/banking/package.json packages/banking/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/

RUN npm ci

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npx tsc -b packages/shared

WORKDIR /repo/apps/web
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0"]
