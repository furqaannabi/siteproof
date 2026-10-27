/** The one Prisma client for the backend. Never log DATABASE_URL. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be set in backend/.env");

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
