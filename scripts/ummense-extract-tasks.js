// Extrai tarefas (checklists) de TODOS os cards de TODOS os flows do Ummense.
// Roda no console do DevTools com qualquer pagina do Ummense aberta (logado).
// Output: download de um JSON consolidado.
//
// Uso: cole o conteudo INTEIRO no console do DevTools e aperte Enter.
// Tempo estimado: ~15-20 min (4500 requests com throttle de 200ms).

(async () => {
  const ORG_ID = 90181;

  const FLOWS = [
    { name: 'Análise de Dados & IA', id: 242303 },
    { name: 'ANEC', id: 176109 },
    { name: 'Atendimento', id: 242379 },
    { name: 'Blogs & Conteúdos', id: 238705 },
    { name: 'CATEDRAL', id: 180099 },
    { name: 'Comercial AGÊNCIA Kharis', id: 214324 },
    { name: 'COMERCIAL ECO', id: 254176 },
    { name: 'COSTUMER SUCESS', id: 275504 },
    { name: 'Design', id: 238201 },
    { name: 'ECO', id: 235535 },
    { name: 'ES 365', id: 183754 },
    { name: 'Executivo de contas | FÁBIO MACHADO', id: 220927 },
    { name: 'FACULDADE DOM ORIONE', id: 235999 },
    { name: 'Financeiro', id: 214143 },
    { name: 'Gestão Interna', id: 243490 },
    { name: 'KHARIS', id: 186873 },
    { name: 'Packs de Posts', id: 238412 },
    { name: 'Pastoralidade & Endomarketing', id: 286203 },
    { name: 'Redes Sociais', id: 238173 },
    { name: 'RERITIBA', id: 180188 },
    { name: 'Tecnologia', id: 238200 },
    { name: 'Triagem', id: 238396 },
  ];

  // Filtro padrao do board pra trazer TODOS os cards (nao so ativos)
  const FILTER = encodeURIComponent(
    JSON.stringify({
      status: ['active', 'waiting', 'canceled', 'completed'],
      selectedContacts: [],
      selectedUsers: [],
      selectedTags: [],
      selectedLeaders: [],
      selectedColumns: [],
      visibility: null,
      startCreatedAt: null,
      endCreatedAt: null,
      startDate: null,
      endDate: null,
      projectName: null,
      teams: [],
    }),
  );

  const STATE_KEY = 'ummense_extraction_v1';
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STATE_KEY) || '{"flows":{}}');
  } catch {
    state = { flows: {} };
  }
  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  if (!window.axios) {
    throw new Error('window.axios nao disponivel — abra o script em uma pagina do Ummense logada.');
  }

  async function api(url) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await window.axios.get(url);
        return r.data;
      } catch (e) {
        const status = e?.response?.status;
        if (status === 429) {
          console.warn('  rate limited, sleeping ' + 2000 * (attempt + 1) + 'ms');
          await sleep(2000 * (attempt + 1));
          continue;
        }
        if (attempt < 3) {
          console.warn('  retry ' + (attempt + 1) + ': ' + (status || e.message) + ' ' + url);
          await sleep(1500);
          continue;
        }
        throw new Error((status || 'erro') + ' ' + url);
      }
    }
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  console.log(`Iniciando extracao. ${FLOWS.length} flows.`);
  const startTs = Date.now();

  for (let i = 0; i < FLOWS.length; i++) {
    const flow = FLOWS[i];
    if (state.flows[flow.name]?._done) {
      console.log(`[${i + 1}/${FLOWS.length}] ${flow.name}: ja concluido (skip)`);
      continue;
    }

    console.log(`\n[${i + 1}/${FLOWS.length}] ${flow.name} (flow ${flow.id})`);
    state.flows[flow.name] = state.flows[flow.name] || { cards: {} };

    try {
      // 1. Lista colunas do flow
      const colsResp = await api(`/api/organization/flows/${flow.id}/flow-columns`);
      const cols = colsResp?.result?.flowColumns || [];
      console.log(`  ${cols.length} colunas`);
      await sleep(150);

      // 2. Pra cada coluna, lista projects (cards)
      let totalCards = 0;
      for (const col of cols) {
        const projResp = await api(
          `/api/organization/flow-columns/${col.id}/projects?filter=${FILTER}`,
        );
        const projects = projResp?.result?.projects || [];
        totalCards += projects.length;
        console.log(`  [${col.name}] ${projects.length} cards`);
        await sleep(150);

        // 3. Pra cada card, busca tarefas
        for (const p of projects) {
          // ticket = identificador do card (matching com nosso shortCode)
          if (state.flows[flow.name].cards[p.ticket]?._tasksLoaded) continue;
          state.flows[flow.name].cards[p.ticket] = state.flows[flow.name].cards[p.ticket] || {
            ticket: p.ticket,
            uuid: p.uuid,
            name: p.name,
            column: col.name,
            tasks: [],
          };

          try {
            // Passo extra: mapeia uuid -> id numerico (endpoint de tasks
            // exige o id, nao o uuid).
            let projectId = state.flows[flow.name].cards[p.ticket]._numericId;
            if (!projectId) {
              const detailResp = await api(`/api/organization/projects/${p.uuid}`);
              projectId = detailResp?.result?.project?.id;
              if (!projectId) throw new Error('id numerico nao encontrado pra uuid ' + p.uuid);
              state.flows[flow.name].cards[p.ticket]._numericId = projectId;
              await sleep(150);
            }

            const tasksResp = await api(
              `/api/organization/${ORG_ID}/projects/${projectId}/tasks?page=1&hideCompletedTasks=false`,
            );
            const tasks = tasksResp?.items?.tasks || [];
            state.flows[flow.name].cards[p.ticket].tasks = tasks.map((t) => ({
              name: t.name,
              description: t.description ?? null,
              priority: t.priority ?? null,
              completedAt: t.completed_at ?? null,
              createdAt: t.created_at ?? null,
              dueDate: t.due_date ?? null,
              userName: t.user?.fullname ?? null,
              userId: t.user_id ?? null,
              positionProject: t.position_project ?? 0,
              repeat: t.repeat ?? null,
            }));
            state.flows[flow.name].cards[p.ticket]._tasksLoaded = true;
            if (tasks.length > 0) {
              console.log(`    + ${p.ticket} ${p.name.slice(0, 40)}: ${tasks.length} tasks`);
            }
          } catch (e) {
            console.error(`    ERR ${p.ticket} ${p.name}: ${e.message}`);
            state.flows[flow.name].cards[p.ticket]._error = e.message;
          }
          await sleep(200);
        }
        saveState();
      }

      state.flows[flow.name]._done = true;
      console.log(`  TOTAL: ${totalCards} cards processados`);
      saveState();
    } catch (e) {
      console.error(`  FATAL no flow ${flow.name}: ${e.message}`);
    }
  }

  // Compila output final
  const output = {};
  for (const [flowName, fdata] of Object.entries(state.flows)) {
    output[flowName] = Object.values(fdata.cards || {})
      .filter((c) => c.tasks && c.tasks.length > 0)
      .map((c) => ({
        ticket: c.ticket,
        name: c.name,
        column: c.column,
        tasks: c.tasks,
      }));
  }

  const totalCardsWithTasks = Object.values(output).reduce((s, arr) => s + arr.length, 0);
  const totalTasks = Object.values(output).reduce(
    (s, arr) => s + arr.reduce((s2, c) => s2 + c.tasks.length, 0),
    0,
  );

  const elapsed = ((Date.now() - startTs) / 1000 / 60).toFixed(1);
  console.log(`\n========== FIM ==========`);
  console.log(`Tempo: ${elapsed} min`);
  console.log(`Cards com tasks: ${totalCardsWithTasks}`);
  console.log(`Total de tasks: ${totalTasks}`);

  downloadJson(output, 'ummense-tasks-extraction.json');
  console.log('Download iniciado: ummense-tasks-extraction.json');
})();
