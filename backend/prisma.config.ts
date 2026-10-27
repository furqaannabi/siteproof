import { defineConfig } from "prisma/config";

// The Prisma CLI runs on Node and does not read .env itself. Load backend/.env when
// it exists; in CI or on the host, DATABASE_URL comes from the environment.
try {
  process.loadEnvFile(".env");
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
