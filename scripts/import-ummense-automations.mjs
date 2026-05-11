#!/usr/bin/env node
// Importa automações de coluna dos templates JSON Ummense pro KTask.
// Le os arquivos `flow_2026050[67]*.json` em ~/Downloads, mapeia
// por nome de board e nome de coluna, e cria automações via API.
//
// Uso:
//   DRY_RUN=1 node scripts/import-ummense-automations.mjs   # so loga
//   node scripts/import-ummense-automations.mjs              # cria
//
// Credenciais: .env.ops (KTASK_BOT_EMAIL/PASSWORD).
// Idempotente parcial: pula automacoes onde ja existe uma com mesmo
// actionType + actionConfig "core" + label igual na mesma list.

import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API_URL || 'https://api.ktask.agenciakharis.com.br/api/v1';
const DRY_RUN = process.env.DRY_RUN === '1';
// STRICT_TAGS: se 1, pula automation quando QUALQUER tag em condition
// nao mapeia pra label do KTask. Util pra primeira passada.
const STRICT_TAGS = process.env.STRICT_TAGS === '1';
const DOWNLOADS = 'C:/Users/NoteBook1/Downloads/';

function loadEnv() {
  const p = '.env.ops';
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv();
const EMAIL = process.env.KTASK_BOT_EMAIL ?? env.KTASK_BOT_EMAIL;
const PASSWORD = process.env.KTASK_BOT_PASSWORD ?? env.KTASK_BOT_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Credenciais nao encontradas. Defina KTASK_BOT_EMAIL/PASSWORD.');
  process.exit(1);
}

let TOKEN = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error('Login falhou: ' + r.status);
  TOKEN = (await r.json()).accessToken;
}

async function api(ep, opts = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(API + ep, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
    });
    const t = await r.text();
    let b; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
    if (r.status === 401 && TOKEN) { await login(); continue; }
    if (r.status === 429 && attempt < retries) { await sleep(2000 * (attempt + 1)); continue; }
    if (!r.ok) {
      const msg = typeof b === 'object' ? b?.message ?? JSON.stringify(b) : b;
      throw new Error(`${r.status} ${opts.method || 'GET'} ${ep}: ${msg}`);
    }
    await sleep(400);
    return b;
  }
}

const norm = (s) => (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ============== MAPEAMENTOS ==============

const BOARD_RENAMES = {
  'Executivo de contas | FÁBIO MACHADO': 'Executivo de contas - Fábio Machado',
};

// Ummense column.automations[].name -> KTask actionType
const TYPE_MAP = {
  AutomationAddTasks: 'INSERT_CHECKLIST_ITEMS',
  AutomationAddTeamProject: 'ADD_TEAM',
  AutomationChangeCardVisibility: 'SET_PRIVACY',
  AutomationAddTags: 'INSERT_TAGS',
  AutomationRemoveTags: 'REMOVE_TAGS',
  AutomationChangeStatusCard: 'SET_CARD_STATUS',
  AutomationAddManager: 'SET_LEAD',
  // PENDENTES (anotados em tarefas-md/47-automacoes-pendentes.md):
  // AutomationAlertTimeExceeded, AutomationAlertLastInteraction,
  // AutomationSendEmail, AutomationAddCustomFieldsInProject,
  // AutomationUpdateStep, AutomationCreateProjectParent
};

// Ummense visibility -> KTask privacy
const PRIVACY_MAP = {
  'public': 'PUBLIC',
  'private-team-edit': 'TEAM_ONLY',
  'private': 'TEAM_ONLY',
};

// Ummense status -> KTask status (handler so suporta COMPLETED/REOPENED/ARCHIVED)
const STATUS_MAP = {
  'completed': 'COMPLETED',
  'active': 'REOPENED',
};

// Ummense currentLeader -> KTask replaceMode
const REPLACE_MODE_MAP = {
  'replace_and_add_in_team': 'MOVE_TO_TEAM',
  'replace_and_remove': 'REMOVE_FROM_TEAM',
  'keep_if_set': 'KEEP_IF_HAS_LEAD',
  'keep_as_leader': 'MOVE_TO_TEAM', // fallback
};

// Ummense condition method -> KTask operator
const OPERATOR_MAP = {
  containAnyTags: 'containsAny',
  dontContainAnyTags: 'notContainsAny',
  containsAllTags: 'containsAll',
  doesNotContainAnyTags: 'notContainsAll',
};

// ============== CACHES ==============

const ktaskBoards = new Map(); // norm(name) -> { id, name, lists: Map<norm(name), { id, name }>, labels: Map<norm(name), { id, name, color }> }
const userByFullname = new Map(); // norm(fullname) -> { id, name }

async function loadKtaskState() {
  console.log('[load] org members...');
  const members = await api('/organizations/members');
  for (const m of members) {
    userByFullname.set(norm(m.user.name), { id: m.user.id, name: m.user.name });
  }
  console.log(`  ${members.length} membros`);

  console.log('[load] boards...');
  const boards = await api('/boards');
  for (const b of boards) {
    if (b.isArchived) continue;
    const detail = await api('/boards/' + b.id);
    const lists = new Map();
    for (const l of detail.lists || []) {
      if (l.isArchived) continue;
      lists.set(norm(l.name), { id: l.id, name: l.name });
    }
    const labelsResp = await api('/boards/' + b.id + '/labels');
    const labels = new Map();
    for (const lab of labelsResp || []) {
      labels.set(norm(lab.name), { id: lab.id, name: lab.name, color: lab.color });
    }
    ktaskBoards.set(norm(b.name), { id: b.id, name: b.name, lists, labels });
  }
  console.log(`  ${ktaskBoards.size} boards`);
}

function resolveBoard(ummenseFlowName) {
  const renamed = BOARD_RENAMES[ummenseFlowName] ?? ummenseFlowName;
  return ktaskBoards.get(norm(renamed));
}

function resolveList(board, ummenseColName) {
  if (!board) return null;
  return board.lists.get(norm(ummenseColName));
}

function resolveLabel(board, ummenseTagName) {
  if (!board) return null;
  return board.labels.get(norm(ummenseTagName));
}

function resolveUser(ummenseFullname) {
  return userByFullname.get(norm(ummenseFullname));
}

// ============== MAPEAMENTO DE AUTOMACOES ==============

function mapConditions(ummConditions, board, stats) {
  if (!Array.isArray(ummConditions)) return { ok: true, conditions: null };
  const out = [];
  let anyMissing = false;
  for (const c of ummConditions) {
    const op = OPERATOR_MAP[c.method];
    if (!op) { stats.conditionsSkipped++; continue; }
    if (c.status !== 'Tags') { stats.conditionsSkipped++; continue; }
    const tagsId = c.tagsId || [];
    const labelIds = [];
    for (const t of tagsId) {
      const lab = resolveLabel(board, t.name);
      if (lab) labelIds.push(lab.id);
      else {
        stats.tagsNotFound.push({ board: board?.name, tag: t.name });
        anyMissing = true;
      }
    }
    if (labelIds.length === 0) continue;
    out.push({ field: 'tags', operator: op, value: labelIds });
  }
  return { ok: !anyMissing, conditions: out.length > 0 ? out : null };
}

function mapAutomation(umm, board, stats) {
  const actionType = TYPE_MAP[umm.name];
  if (!actionType) {
    stats.unsupportedTypes.set(umm.name, (stats.unsupportedTypes.get(umm.name) || 0) + 1);
    return null;
  }

  let actionConfig = null;
  const s = umm.structure;

  switch (umm.name) {
    case 'AutomationAddTasks': {
      // structure = array de tasks { name, user_id, priority, date, automation: { flow_column_id } }
      // O KTask aplica 1 assignee/priority/date pra TODOS os items da
      // automacao. 97% das automacoes Ummense tem valores uniformes ou
      // 1 item so, entao usamos o primeiro item como template.
      if (!Array.isArray(s) || s.length === 0) return null;
      const items = s.map((t) => t.name).filter(Boolean);
      if (items.length === 0) return null;
      const first = s[0];
      actionConfig = { items, checklistTitle: 'Tarefas' };

      // Assignee: resolve user_id Ummense -> KTask user
      if (first.user_id) {
        const userInfo = umm._usersLookup?.get(first.user_id);
        if (userInfo) {
          const ku = resolveUser(userInfo.fullname);
          if (ku) {
            actionConfig.assigneeMode = 'SPECIFIC_USER';
            actionConfig.assigneeUserId = ku.id;
          }
        }
      }

      // Priority: Ummense 'low'/'medium'/'high'/'urgent' -> uppercase
      if (first.priority && typeof first.priority === 'string') {
        const p = first.priority.toUpperCase();
        if (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(p)) {
          actionConfig.itemPriority = p;
        }
      }

      // Date: { number: '0', period: 'days' } -> dueMode OFFSET_FROM_NOW
      if (first.date?.number !== undefined && first.date?.number !== null) {
        const n = parseInt(first.date.number, 10);
        if (!isNaN(n)) {
          // Period: na pratica so vemos 'days' no Ummense
          const periodDays = first.date.period === 'weeks' ? 7
                           : first.date.period === 'months' ? 30
                           : 1;
          actionConfig.dueMode = 'OFFSET_FROM_NOW';
          actionConfig.dueOffsetDays = n * periodDays;
        }
      }
      break;
    }
    case 'AutomationAddTeamProject': {
      // structure = { users: [{ id, fullname, ... }], leaderConfig }
      const users = s?.users || [];
      const userIds = [];
      for (const u of users) {
        const ku = resolveUser(u.fullname);
        if (ku) userIds.push(ku.id);
        else stats.usersNotFound.push({ board: board?.name, user: u.fullname });
      }
      if (userIds.length === 0) return null;
      actionConfig = { userIds };
      break;
    }
    case 'AutomationChangeCardVisibility': {
      const priv = PRIVACY_MAP[s?.cardVisibility];
      if (!priv) return null;
      actionConfig = { privacy: priv };
      break;
    }
    case 'AutomationAddTags':
    case 'AutomationRemoveTags': {
      // structure = [tagId1, tagId2] (Ummense ids numéricos)
      // Precisamos do nome da tag pra mapear pro KTask. Vamos olhar
      // nas conditions de outras automacoes? Não — usamos um cache global.
      // Como structure traz so ids, precisamos do tagDictionary global do flow.
      // (handled outside — caller deve enriquecer com tagsLookup)
      const tagIdNums = Array.isArray(s) ? s : [];
      const labelIds = [];
      for (const tagId of tagIdNums) {
        const tagInfo = umm._tagsLookup?.get(tagId);
        if (!tagInfo) { stats.tagsNotFound.push({ board: board?.name, tagId, reason: 'sem nome no dict' }); continue; }
        const lab = resolveLabel(board, tagInfo.name);
        if (lab) labelIds.push(lab.id);
        else stats.tagsNotFound.push({ board: board?.name, tag: tagInfo.name });
      }
      if (labelIds.length === 0) return null;
      actionConfig = { tagIds: labelIds };
      break;
    }
    case 'AutomationChangeStatusCard': {
      const status = STATUS_MAP[s?.status];
      if (!status) {
        stats.statusUnmapped.push({ board: board?.name, status: s?.status });
        return null;
      }
      actionConfig = { status };
      break;
    }
    case 'AutomationAddManager': {
      // structure = { userId: NumericUmmenseId, currentLeader: 'replace_and_add_in_team' }
      // userId é numérico — preciso achar pelo numero. Mas nao tenho mapa user_id Ummense -> nome
      // direto aqui. Vou usar tabela auxiliar (umm._usersLookup).
      const ummUserId = s?.userId;
      const userInfo = umm._usersLookup?.get(ummUserId);
      if (!userInfo) {
        stats.usersNotFound.push({ board: board?.name, ummUserId, reason: 'sem nome no dict' });
        return null;
      }
      const ku = resolveUser(userInfo.fullname);
      if (!ku) {
        stats.usersNotFound.push({ board: board?.name, user: userInfo.fullname });
        return null;
      }
      const replaceMode = REPLACE_MODE_MAP[s?.currentLeader] || 'MOVE_TO_TEAM';
      actionConfig = { userId: ku.id, replaceMode };
      break;
    }
  }

  if (!actionConfig) return null;

  const condResult = mapConditions(umm.conditions, board, stats);
  if (STRICT_TAGS && !condResult.ok) {
    stats.skippedByStrictTags++;
    return null;
  }

  return {
    trigger: 'CARD_ENTERED',
    actionType,
    actionConfig,
    label: deriveLabel(umm),
    isActive: umm.active === 1,
    conditions: condResult.conditions,
  };
}

function deriveLabel(umm) {
  // Cria um label legível pra UI baseado no tipo + dica do conteúdo.
  const typeLabels = {
    AutomationAddTasks: 'Adicionar tarefas',
    AutomationAddTeamProject: 'Adicionar equipe',
    AutomationChangeCardVisibility: 'Mudar visibilidade',
    AutomationAddTags: 'Adicionar etiquetas',
    AutomationRemoveTags: 'Remover etiquetas',
    AutomationChangeStatusCard: 'Mudar status',
    AutomationAddManager: 'Definir líder',
  };
  return typeLabels[umm.name] ?? umm.name;
}

// ============== TAG/USER LOOKUPS ==============

/**
 * Constrói um dicionário tagId(num) -> { name, color } a partir das
 * conditions de TODAS as automacoes do flow (que é onde aparece o nome).
 */
function buildTagsLookup(flow) {
  const lookup = new Map();
  for (const col of flow.columns || []) {
    for (const a of col.automations || []) {
      for (const c of a.conditions || []) {
        for (const t of c.tagsId || []) {
          if (t.id && t.name) lookup.set(t.id, { name: t.name, color: t.color });
        }
      }
    }
  }
  return lookup;
}

/**
 * Constrói usersLookup ummUserId -> { fullname } a partir de:
 *   - flow.users[] (nivel raiz — todos os membros do flow)
 *   - structures de automation que tenham users[] com id+fullname
 * O primeiro cobre AddManager (que usa userId singular sem fullname).
 */
function buildUsersLookup(flow) {
  const lookup = new Map();
  for (const u of flow.users || []) {
    if (u.id && u.fullname) lookup.set(u.id, { fullname: u.fullname });
  }
  // model_created_by: o criador do template (frequentemente o Owner)
  if (flow.model_created_by?.id && flow.model_created_by?.fullname) {
    lookup.set(flow.model_created_by.id, { fullname: flow.model_created_by.fullname });
  }
  for (const col of flow.columns || []) {
    for (const a of col.automations || []) {
      const s = a.structure;
      if (s?.users) {
        for (const u of s.users) {
          if (u.id && u.fullname) lookup.set(u.id, { fullname: u.fullname });
        }
      }
    }
  }
  return lookup;
}

// Lookup compartilhado entre flows — IDs Ummense conhecidos pra fallback.
// Construido a partir de model_created_by e structure.users de TODOS os
// flows pra cobrir cross-references (ex: AddManager apontando pra user
// que aparece em outro flow).
function buildGlobalUsersLookup(allFlows) {
  const lookup = new Map();
  for (const flow of allFlows) {
    const local = buildUsersLookup(flow);
    for (const [id, info] of local) lookup.set(id, info);
  }
  return lookup;
}

// ============== MAIN ==============

(async () => {
  console.log(`[mode] ${DRY_RUN ? 'DRY RUN (nada sera persistido)' : 'LIVE (vai criar automacoes)'}`);
  await login();
  console.log('[auth] OK');

  await loadKtaskState();

  const files = fs.readdirSync(DOWNLOADS).filter((f) => /^flow_2026050[67]/.test(f) && f.endsWith('.json'));
  console.log(`\n[templates] ${files.length} arquivos`);

  // Pre-load todos os flows e constroi lookup global de users
  const allFlows = [];
  for (const f of files) {
    try { allFlows.push(JSON.parse(fs.readFileSync(path.join(DOWNLOADS, f), 'utf-8'))); } catch {}
  }
  const globalUsersLookup = buildGlobalUsersLookup(allFlows);
  console.log(`[users] lookup global: ${globalUsersLookup.size} usuarios Ummense conhecidos`);

  const stats = {
    flowsProcessed: 0,
    boardsNotFound: [],
    listsNotFound: [],
    usersNotFound: [],
    tagsNotFound: [],
    unsupportedTypes: new Map(),
    conditionsSkipped: 0,
    statusUnmapped: [],
    skippedByStrictTags: 0,
    automationsAttempted: 0,
    automationsCreated: 0,
    automationsErrors: [],
  };

  for (const flow of allFlows) {
    if (!flow.name) continue;
    stats.flowsProcessed++;

    const board = resolveBoard(flow.name);
    if (!board) {
      stats.boardsNotFound.push(flow.name);
      console.log(`\n[${flow.name}] BOARD NAO ENCONTRADO no KTask — skip`);
      continue;
    }

    const tagsLookup = buildTagsLookup(flow);
    const usersLookup = globalUsersLookup;

    let totalForFlow = 0;
    for (const col of flow.columns || []) {
      if (!col.automations || col.automations.length === 0) continue;
      const list = resolveList(board, col.name);
      if (!list) {
        stats.listsNotFound.push({ board: flow.name, column: col.name });
        continue;
      }

      for (const umm of col.automations) {
        umm._tagsLookup = tagsLookup;
        umm._usersLookup = usersLookup;

        const mapped = mapAutomation(umm, board, stats);
        if (!mapped) continue;
        stats.automationsAttempted++;
        totalForFlow++;

        if (DRY_RUN) {
          console.log(`  + ${flow.name} > ${col.name} > ${mapped.actionType} (${mapped.isActive ? 'ATIVO' : 'inativo'})`);
          stats.automationsCreated++;
          continue;
        }

        try {
          await api(`/lists/${list.id}/automations`, {
            method: 'POST',
            body: JSON.stringify(mapped),
          });
          stats.automationsCreated++;
        } catch (e) {
          stats.automationsErrors.push({
            board: flow.name,
            column: col.name,
            type: mapped.actionType,
            error: e.message.slice(0, 200),
          });
          console.error(`    ERR ${mapped.actionType} em ${flow.name}/${col.name}: ${e.message.slice(0, 100)}`);
        }
      }
    }
    if (totalForFlow > 0) console.log(`[${flow.name}] ${totalForFlow} automacoes processadas`);
  }

  console.log('\n========== RELATORIO ==========');
  console.log('Flows processados:', stats.flowsProcessed);
  console.log('Boards nao encontrados no KTask:', stats.boardsNotFound);
  console.log('Listas nao encontradas:', stats.listsNotFound.length);
  if (stats.listsNotFound.length > 0) console.log('  ', stats.listsNotFound.slice(0, 10));
  console.log('Tags nao encontradas:', stats.tagsNotFound.length);
  if (stats.tagsNotFound.length > 0) console.log('  ', stats.tagsNotFound.slice(0, 10));
  console.log('Users nao encontrados:', stats.usersNotFound.length);
  if (stats.usersNotFound.length > 0) console.log('  ', stats.usersNotFound.slice(0, 10));
  console.log('Conditions ignoradas:', stats.conditionsSkipped);
  console.log('Status nao-mapeaveis (canceled):', stats.statusUnmapped.length);
  if (STRICT_TAGS) console.log('Puladas por STRICT_TAGS (tag faltante):', stats.skippedByStrictTags);
  console.log('Tipos nao-suportados:');
  for (const [t, n] of stats.unsupportedTypes) console.log(`  ${t.padEnd(40)} ${n}`);
  console.log('\nAutomacoes tentadas:', stats.automationsAttempted);
  console.log('Automacoes ' + (DRY_RUN ? '(seriam) ' : '') + 'criadas:', stats.automationsCreated);
  console.log('Erros:', stats.automationsErrors.length);

  const reportPath = `tarefas-md/automations-import-${Date.now()}.json`;
  // Convert Maps to objects for JSON
  const out = { ...stats, unsupportedTypes: Object.fromEntries(stats.unsupportedTypes) };
  fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
  console.log('\nRelatorio salvo:', reportPath);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
