FROM node:20-alpine AS base
FROM base AS dev
WORKDIR /app
COPY . .
EXPOSE 7008
CMD ["pnpm", "--filter", "@urnlabs/testing", "dev"]