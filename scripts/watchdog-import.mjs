#!/usr/bin/env node
// Watchdog: checa periodicamente se o import-delta-double-check.mjs ainda
// está rodando. Se parou (por finalização normal OU crash), manda
// WhatsApp pro operador via Evolution API.
//
// Critério de "rodando": existe processo node executando o script-alvo
// (tasklist no Windows + filtro por nome). Adicionalmente, observa
// mtime do log — se >5min sem atualização, considera travado.
//
// Uso: node scripts/watchdog-import.mjs

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const TARGET_SCRIPT = 'import-delta-double-check.mjs';
const LOG_PATH = 'tarefas-md/delta-double-check-run.log';
const CHECK_INTERVAL_MS = 60_000; // 1 min
const STALE_LOG_MS = 5 * 60_000; // 5 min sem update no log = travou
const OPERATOR_PHONE = '5531993767301';

// Lê config Evolution do .env do api
const apiEnv = {};
for (const line of fs.readFileSync('apps/api/.env', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) apiEnv[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const EVO_URL = apiEnv.EVOLUTION_DEFAULT_URL;
const EVO_KEY = apiEnv.EVOLUTION_DEFAULT_API_KEY;
const EVO_INSTANCE = apiEnv.EVOLUTION_DEFAULT_INSTANCE;

if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) {
  console.error('[watchdog] falta config Evolution em apps/api/.env');
  process.exit(1);
}

async function sendWhats(text) {
  const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
    body: JSON.stringify({ number: OPERATOR_PHONE, text }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error('[watchdog] erro envio WhatsApp:', r.status, t.slice(0, 200));
    return false;
  }
  console.log('[watchdog] WhatsApp enviado:', text.slice(0, 80));
  return true;
}

function isRunning() {
  try {
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object -ExpandProperty CommandLine"', { encoding: 'utf-8' });
    return out.includes(TARGET_SCRIPT);
  } catch {
    return false;
  }
}

function logMtime() {
  try {
    return fs.statSync(LOG_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

function tailLog(lines = 20) {
  try {
    const content = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
    return content.slice(-lines).join('\n');
  } catch {
    return '(log indisponível)';
  }
}

console.log('[watchdog] iniciando. intervalo:', CHECK_INTERVAL_MS / 1000, 's. stale:', STALE_LOG_MS / 1000, 's');
await sendWhats(`[KTask watchdog] iniciado. Monitorando import-delta-double-check.mjs a cada ${CHECK_INTERVAL_MS / 1000}s. Aviso quando parar.`);

let alerted = false;
let lastSeenRunning = Date.now();

while (true) {
  await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
  const running = isRunning();
  const mtime = logMtime();
  const sinceLog = Date.now() - mtime;
  const tail = tailLog(5);
  console.log(`[watchdog] running=${running} sinceLog=${Math.round(sinceLog / 1000)}s`);

  if (running) {
    lastSeenRunning = Date.now();
    if (sinceLog > STALE_LOG_MS && !alerted) {
      await sendWhats(
        `[KTask] ⚠ Import parece TRAVADO\n` +
          `Processo node ainda existe, mas log sem update há ${Math.round(sinceLog / 60_000)}min.\n\n` +
          `Tail:\n${tail}`,
      );
      alerted = true;
    }
    continue;
  }

  // Não está rodando — manda alerta uma vez e encerra
  await sendWhats(
    `[KTask] Import FINALIZOU/PAROU\n` +
      `Última atividade detectada: ${new Date(lastSeenRunning).toLocaleString('pt-BR')}\n\n` +
      `Tail do log:\n${tail}`,
  );
  console.log('[watchdog] alvo parou. encerrando watchdog.');
  break;
}
