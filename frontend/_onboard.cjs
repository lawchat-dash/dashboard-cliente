const { Client } = require('pg');
const PROD = 'https://dashboard.lawchat.com.br';
const FLAVIO = 'e49ff683-bee4-4fc8-b201-f7e473ed30e0';
const BATCH = 3;
const PER_CLIENT_TIMEOUT = 12 * 60 * 1000;

async function syncOne(id, name) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), PER_CLIENT_TIMEOUT);
  const t0 = Date.now();
  try {
    const r = await fetch(PROD + '/api/sync-cascade-full', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: id }), signal: ctrl.signal,
    });
    await r.text();
    console.log(`  ✓ ${name} (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) {
    console.log(`  · ${name} desconectou/timeout (server continua): ${e.message}`);
  } finally { clearTimeout(to); }
}

(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const rows = (await c.query(
    `SELECT id, name FROM helena_clientes_crm
      WHERE active = TRUE AND first_sync_done = FALSE AND id <> $1
      ORDER BY name`, [FLAVIO]
  )).rows;
  await c.end();

  console.log(`Onboarding ${rows.length} clientes em lotes de ${BATCH} (Flávio excluído)\n`);
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    console.log(`LOTE ${i / BATCH + 1}/${Math.ceil(rows.length / BATCH)}: ${batch.map(b => b.name).join(', ')}`);
    await Promise.all(batch.map(b => syncOne(b.id, b.name)));
  }

  // resumo final
  const c2 = new Client({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false } });
  await c2.connect();
  const s = await c2.query('SELECT count(*) FILTER (WHERE first_sync_done) ok, count(*) total FROM helena_clientes_crm');
  console.log(`\n=== FIM === ${s.rows[0].ok}/${s.rows[0].total} clientes com 1º sync concluído`);
  await c2.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
