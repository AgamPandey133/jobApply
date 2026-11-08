import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Provide the DATABASE_URL for Prisma Migrate (prisma migrate dev/deploy)
  // Falls back gracefully during `prisma generate` (no DB needed)
  ...(process.env.DATABASE_URL
    ? {
        datasource: {
          url: process.env.DATABASE_URL,
        },
      }
    : {}),
});
