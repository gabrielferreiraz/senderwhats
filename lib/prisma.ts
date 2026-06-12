import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// Bump this string whenever a migration adds/removes fields on existing models.
// Changing it forces the cached singleton to be discarded and rebuilt.
const SCHEMA_VERSION = "3" // unify_campaigns: added scheduledAt + customMessage to Campaign

const REQUIRED_MODELS = ["vendedor", "contact", "campaign", "contactList"] as const

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSchemaVersion: string | undefined
}

function createClient(): PrismaClient {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

function isClientValid(client: PrismaClient): boolean {
  if (globalForPrisma.prismaSchemaVersion !== SCHEMA_VERSION) return false
  return REQUIRED_MODELS.every((model) => model in client)
}

function getOrCreateClient(): PrismaClient {
  if (globalForPrisma.prisma && isClientValid(globalForPrisma.prisma)) {
    return globalForPrisma.prisma
  }
  globalForPrisma.prisma = createClient()
  globalForPrisma.prismaSchemaVersion = SCHEMA_VERSION
  return globalForPrisma.prisma
}

export const prisma = getOrCreateClient()
