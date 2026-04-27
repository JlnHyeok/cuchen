FROM node:22-bookworm-slim

WORKDIR /workspace/apps/backend

ENV CI=true
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY tsconfig.json tsconfig.build.json ./

WORKDIR /workspace

COPY --from=shared package.json packages/shared/package.json
COPY --from=shared package-lock.json packages/shared/package-lock.json
COPY --from=shared tsconfig.json packages/shared/tsconfig.json
COPY --from=shared src packages/shared/src

RUN cd apps/backend && npm ci

COPY src apps/backend/src

RUN cd packages/shared && npm run build && cd ../../apps/backend && npm run build

EXPOSE 3000

WORKDIR /workspace/apps/backend

CMD ["npm", "run", "start"]
