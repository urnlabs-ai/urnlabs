FROM node:20-alpine AS base
FROM base AS dev
WORKDIR /app
COPY . .
EXPOSE 7009
CMD ["pnpm", "--filter", "@urnlabs/security", "dev"]