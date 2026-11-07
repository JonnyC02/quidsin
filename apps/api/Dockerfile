FROM node:24-alpine AS build
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
COPY packages/config packages/config
COPY packages/database packages/database
COPY packages/core packages/core
COPY packages/banking packages/banking
COPY apps/api apps/api

RUN npx tsc -b apps/api --force

FROM node:24-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/config/package.json packages/config/package.json
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/core/package.json packages/core/package.json
COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/packages/database/package.json packages/database/package.json
COPY --from=build /repo/packages/database/dist packages/database/dist
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/dist apps/api/dist

WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
