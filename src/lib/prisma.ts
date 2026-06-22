import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const dbUrl = process.env.DATABASE_URL ?? 'file:./dev.db';
// Strip "file:" prefix — better-sqlite3 adapter expects a plain file path
const dbPath = dbUrl.replace(/^file:/, '');

const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

export default prisma;
