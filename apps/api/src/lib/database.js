import { PrismaClient } from '@prisma/client';
import { databaseConfig, isDevelopment } from '@/lib/config.js';
let prismaSingleton = null;
export function getPrisma() {
    if (!prismaSingleton) {
        prismaSingleton = new PrismaClient({
            log: isDevelopment ? ['query', 'info', 'warn', 'error'] : ['error'],
        });
    }
    return prismaSingleton;
}
export async function disconnectPrisma() {
    if (prismaSingleton) {
        await prismaSingleton.$disconnect();
        prismaSingleton = null;
    }
}
export async function testConnection() {
    const prisma = getPrisma();
    const start = Date.now();
    try {
        await prisma.$queryRaw `SELECT 1`;
        const latency = Date.now() - start;
        return { ok: true, latencyMs: latency };
    }
    catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}
export async function checkSchema() {
    const prisma = getPrisma();
    try {
        const rows = await prisma.$queryRawUnsafe("SELECT to_regclass('public.users') as users, to_regclass('public.agents') as agents, to_regclass('public.workflows') as workflows");
        const row = rows?.[0] || { users: null, agents: null, workflows: null };
        return {
            ok: Boolean(row.users && row.agents && row.workflows),
            schema: {
                users: Boolean(row.users),
                agents: Boolean(row.agents),
                workflows: Boolean(row.workflows),
            },
        };
    }
    catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}
export async function connectWithRetry(opts) {
    const attempts = opts?.attempts ?? 20;
    const delayMs = opts?.delayMs ?? 2000;
    let lastError;
    for (let i = 1; i <= attempts; i++) {
        const res = await testConnection();
        if (res.ok)
            return;
        lastError = res.error;
        await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error(`Database not reachable after ${attempts} attempts: ${lastError || 'unknown error'}`);
}
export async function databaseHealth() {
    const conn = await testConnection();
    const schema = await checkSchema();
    const urlMasked = maskConnectionString(databaseConfig.url);
    const details = {
        ok: Boolean(conn.ok && schema.ok),
        urlMasked,
    };
    if (typeof conn.latencyMs === 'number') {
        details.latencyMs = conn.latencyMs;
    }
    if (!conn.ok && conn.error) {
        details.error = conn.error;
    }
    else if (schema.error) {
        details.error = schema.error;
    }
    if (schema.schema) {
        details.schema = schema.schema;
    }
    const ready = Boolean(conn.ok && schema.ok);
    return { ready, details };
}
function maskConnectionString(url) {
    try {
        const u = new URL(url);
        if (u.password)
            u.password = '***';
        if (u.username)
            u.username = '***';
        return u.toString();
    }
    catch {
        return '<invalid-url>';
    }
}
//# sourceMappingURL=database.js.map