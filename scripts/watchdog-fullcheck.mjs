#!/usr/bin/env node
// Watchdog do audit-full-jsonvs-ktask.mjs.
// Mesma estratégia do watchdog-audit (wmic + auto-restart), apontando
// pro novo script.

import fs from 'node:fs';
import { execSync, spawn } from 'node:child_process';

const TARGET_SCRIPT = 'audit-full-jsonvs-ktask.mjs';
const STATE_PATH = 'tarefas-md/full-audit-state.json';
const LOG_PATH = 'tarefas-md/full-audit-run.log';
const CHECK_INTERVAL_MS = 60_000;
const STALE_LOG_MS = 5 * 60_000;
const MAX_RESTARTS = 15;
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
    if (!r.ok) console.error('[watchdog] whats:', r.status);
    return r.ok;
  } catch (e) { console.error('[watchdog] whats erro:', e.message); return false; }
}

function isRunning() {
  try {
    const out = execSync('wmic process where "name=\'node.exe\'" get CommandLine /format:list', {
      encoding: 'utf-8', windowsHide: true,
    });
    return out.includes(TARGET_SCRIPT);
  } catch {
    try {
      const out2 = execSync('tasklist /fi "imagename eq node.exe" /fo csv /nh', { encoding: 'utf-8', windowsHide: true });
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
  try { return fs.readFileSync(LOG_PATH, 'utf-8').split('\n').slice(-n).join('\n'); } catch { return '(log indisponível)'; }
}
function spawnTarget() {
  const fd = fs.openSync(LOG_PATH, 'a');
  const child = spawn(process.execPath, [`scripts/${TARGET_SCRIPT}`], {
    detached: true, stdio: ['ignore', fd, fd], windowsHide: true,
  });
  child.unref();
  console.log('[watchdog] respawn pid=', child.pid);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`[watchdog] iniciando. alvo=${TARGET_SCRIPT}`);
await sendWhats(`[KTask full-audit watchdog] iniciado. Auto-restart até ${MAX_RESTARTS}x.`);

let restarts = 0;
let staleAlerted = false;

while (true) {
  await sleep(CHECK_INTERVAL_MS);
  const running = isRunning();
  const state = readState();
  const sinceLog = Date.now() - logMtime();

  if (running) {
    if (sinceLog > STALE_LOG_MS && !staleAlerted) {
      await sendWhats(`[KTask full-audit] TRAVADO?\nLog sem update há ${Math.round(sinceLog / 60_000)}min.\n\nTail:\n${tailLog()}`);
      staleAlerted = true;
    }
    if (sinceLog < STALE_LOG_MS) staleAlerted = false;
    const proc = state?.processedKeys?.length ?? 0;
    console.log(`[watchdog] OK. processed=${proc} divergencias=${state?.divergencias?.length ?? 0}`);
    continue;
  }

  if (state?.finishedAt) {
    await sendWhats(`[KTask full-audit watchdog] alvo finalizou em ${state.finishedAt}. Encerrando watchdog.`);
    console.log('[watchdog] alvo concluiu. saindo.');
    break;
  }

  if (restarts >= MAX_RESTARTS) {
    await sendWhats(`[KTask full-audit] LIMITE de ${MAX_RESTARTS} restarts.\nTail:\n${tailLog()}`);
    break;
  }
  restarts++;
  const proc = state?.processedKeys?.length ?? 0;
  await sendWhats(`[KTask full-audit] interrompido. Restart ${restarts}/${MAX_RESTARTS}. processed=${proc}\nTail:\n${tailLog()}`);
  spawnTarget();
  await sleep(5000);
}
