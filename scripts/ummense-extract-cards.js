// Extrai metadados (ticket, nome, coluna) de TODOS os cards de TODOS
// os flows do Ummense. Pareado com ummense-extract-tasks.js — esse aqui
// nao busca tasks, so as colunas em que cada card esta. Usado pra
// validar/corrigir colunas dos cards no KTask.
//
// Uso: cole o conteudo INTEIRO no console do DevTools do Ummense (logado).
// Tempo estimado: ~1-2 min (~250 requests com throttle 200ms).

(async () => {
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

  if (!window.axios) {
    throw new Error('window.axios nao disponivel — abra em pagina do Ummense logada.');
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(url) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await window.axios.get(url);
        return r.data;
      } catch (e) {
        const status = e?.response?.status;
        if (status === 429) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        if (attempt < 3) {
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

  console.log(`Iniciando extracao de cards. ${FLOWS.length} flows.`);
  const startTs = Date.now();
  const output = {};
  let totalCards = 0;

  for (let i = 0; i < FLOWS.length; i++) {
    const flow = FLOWS[i];
    console.log(`\n[${i + 1}/${FLOWS.length}] ${flow.name} (flow ${flow.id})`);
    output[flow.name] = [];

    try {
      const colsResp = await api(`/api/organization/flows/${flow.id}/flow-columns`);
      const cols = colsResp?.result?.flowColumns || [];
      await sleep(150);

      let flowCardCount = 0;
      for (const col of cols) {
        const projResp = await api(
          `/api/organization/flow-columns/${col.id}/projects?filter=${FILTER}`,
        );
        const projects = projResp?.result?.projects || [];
        flowCardCount += projects.length;

        for (const p of projects) {
          output[flow.name].push({
            ticket: p.ticket,
            uuid: p.uuid,
            name: p.name,
            column: col.name,
            columnId: col.id,
            isFinal: col.is_final === 1,
            isBacklog: col.is_backlog === 1,
            status: p.status,
          });
        }
        await sleep(150);
      }
      totalCards += flowCardCount;
      console.log(`  ${cols.length} colunas, ${flowCardCount} cards`);
    } catch (e) {
      console.error(`  FATAL: ${e.message}`);
    }
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
  console.log(`\n========== FIM ==========`);
  console.log(`Tempo: ${elapsed}s`);
  console.log(`Total cards: ${totalCards}`);

  downloadJson(output, 'ummense-cards-extraction.json');
  console.log('Download iniciado: ummense-cards-extraction.json');
})();
