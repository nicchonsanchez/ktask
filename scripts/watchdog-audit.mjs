#!/usr/bin/env node
// Watchdog do audit-cards-vs-csv.mjs:
//   - Checa a cada 60s se o processo Node alvo ainda existe.
//   - Se NÃO existe E state.finishedAt está null → relança (até MAX restarts),
//     notifica via WhatsApp.
//   - Se NÃO existe E state.finishedAt setado → manda WhatsApp final + encerra.
//   - Se log do alvo >5min sem update → alerta TRAVADO (não relança).
//
// Uso: node scripts/watchdog-audit.mjs

import fs from 'node:fs';
import { execSync, spawn } from 'node:child_process';

const TARGET_SCRIPT = 'audit-cards-vs-csv.mjs';
const STATE_PATH = 'tarefas-md/audit-cards-state.json';
const LOG_PATH = 'tarefas-md/audit-cards-run.log';
const CHECK_INTERVAL_MS = 60_000;
const STALE_LOG_MS = 5 * 60_000;
const MAX_RESTARTS = 10;
const OPERATOR_PHONE = '5531993767301';

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const apiEnv = readEnv('apps/api/.env');
const EVO_URL = apiEnv.EVOLUTION_DEFAULT_URL;
const EVO_KEY = apiEnv.EVOLUTION_DEFAULT_API_KEY;
const EVO_INSTANCE = apiEnv.EVOLUTION_DEFAULT_INSTANCE;

async function sendWhats(text) {
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) return false;
  try {
    const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: OPERATOR_PHONE, text }),
    });
    if (!r.ok) console.error('[watchdog] whats:', r.status); else console.log('[watchdog] whats OK:', text.slice(0, 80));
    return r.ok;
  } catch (e) { console.error('[watchdog] whats erro:', e.message); return false; }
}

function isRunning() {
  // wmic é mais leve que powershell e não depende do .NET runtime.
  // Lista CommandLine de todos node.exe; filtro pelo nome do script alvo.
  try {
    const out = execSync('wmic process where "name=\'node.exe\'" get CommandLine /format:list', {
      encoding: 'utf-8',
      windowsHide: true,
    });
    return out.includes(TARGET_SCRIPT);
  } catch {
    // fallback tasklist (não mostra cmdline, mas confirma se há algum node.exe vivo)
    try {
      const out2 = execSync('tasklist /fi "imagename eq node.exe" /fo csv /nh', { encoding: 'utf-8', windowsHide: true });
      // Sem cmdline, retorna conservadoramente true se há algum node — evita falso restart
      return out2.includes('node.exe');
    } catch { return false; }
  }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); } catch { return null; }
}

function logMtime() {
  try { return fs.statSync(LOG_PATH).mtimeMs; } catch { return 0; }
}

function tailLog(n = 5) {
  try {
    const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n');
    return lines.slice(-n).join('\n');
  } catch { return '(log indisponível)'; }
}

function spawnTarget() {
  // Spawn direto sem shell: usa o próprio process.execPath (node atual)
  // e redireciona stdout/stderr pro log file via 'append'.
  const fd = fs.openSync(LOG_PATH, 'a');
  const child = spawn(process.execPath, [`scripts/${TARGET_SCRIPT}`], {
    detached: true,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  child.unref();
  console.log('[watchdog] respawn pid=', child.pid);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`[watchdog] iniciando. alvo=${TARGET_SCRIPT}. intervalo=${CHECK_INTERVAL_MS / 1000}s`);
await sendWhats(`[KTask audit watchdog] iniciado. Monitorando ${TARGET_SCRIPT} a cada ${CHECK_INTERVAL_MS / 1000}s. Auto-restart até ${MAX_RESTARTS}x.`);

let restarts = 0;
let staleAlerted = false;

while (true) {
  await sleep(CHECK_INTERVAL_MS);
  const running = isRunning();
  const state = readState();
  const sinceLog = Date.now() - logMtime();

  if (running) {
    if (sinceLog > STALE_LOG_MS && !staleAlerted) {
      await sendWhats(`[KTask audit] TRAVADO?\nLog sem update há ${Math.round(sinceLog / 60_000)}min.\n\nTail:\n${tailLog()}`);
      staleAlerted = true;
    }
    if (sinceLog < STALE_LOG_MS) staleAlerted = false; // reset
    const checked = state?.checkedTickets?.length ?? 0;
    console.log(`[watchdog] OK running. checked=${checked} missing=${state?.missing?.length ?? 0} sinceLog=${Math.round(sinceLog / 1000)}s`);
    continue;
  }

  // não está rodando
  if (state?.finishedAt) {
    await sendWhats(`[KTask audit watchdog] alvo finalizou em ${state.finishedAt}. Encerrando watchdog.`);
    console.log('[watchdog] alvo concluiu. saindo.');
    break;
  }

  // não rodando E não finalizado → relança
  if (restarts >= MAX_RESTARTS) {
    await sendWhats(`[KTask audit] LIMITE de ${MAX_RESTARTS} restarts atingido.\nChecked: ${state?.checkedTickets?.length ?? 0}\nTail:\n${tailLog()}`);
    console.log('[watchdog] max restarts atingido. saindo.');
    break;
  }
  restarts++;
  const checked = state?.checkedTickets?.length ?? 0;
  await sendWhats(`[KTask audit] interrompido. Restart ${restarts}/${MAX_RESTARTS}. Progresso: ${checked} tickets checados.\nTail:\n${tailLog()}`);
  spawnTarget();
  await sleep(5000); // dá tempo do filho começar
}
