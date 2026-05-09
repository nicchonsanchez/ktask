import type { ActivityNode } from '@/lib/queries/cards';

const FIELD_LABELS: Record<string, string> = {
  title: 'o título',
  description: 'a descrição',
  cardColor: 'a cor do card',
  dueDate: 'o prazo',
  startDate: 'a data de início',
  estimateMinutes: 'a estimativa',
};

const CARD_COLOR_LABELS: Record<string, string> = {
  slate: 'cinza',
  rose: 'rosa',
  orange: 'laranja',
  amber: 'âmbar',
  emerald: 'verde',
  sky: 'azul',
  violet: 'violeta',
  pink: 'pink',
};

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtMinutes(min: number | null | undefined): string | null {
  if (min === null || min === undefined) return null;
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}min`;
}

function truncate(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Renderiza uma mudança de field específica como sequência de ActivityPart
 * — formato "{verb} {label} de {from} para {to}". Quando from ou to é null
 * (definição/remoção), troca pra "definiu" ou "removeu".
 */
function changePart(field: string, change: { from: unknown; to: unknown }): ActivityPart[] | null {
  const label = FIELD_LABELS[field];
  if (!label) return null;

  if (field === 'title') {
    const from = typeof change.from === 'string' ? truncate(change.from) : null;
    const to = typeof change.to === 'string' ? truncate(change.to) : null;
    if (!to) return null;
    if (!from) return ['definiu ', label, ' como "', { bold: to }, '"'];
    return ['alterou ', label, ' de "', { bold: from }, '" para "', { bold: to }, '"'];
  }

  if (field === 'cardColor') {
    const fromKey = typeof change.from === 'string' ? change.from : null;
    const toKey = typeof change.to === 'string' ? change.to : null;
    const from = fromKey ? (CARD_COLOR_LABELS[fromKey] ?? fromKey) : null;
    const to = toKey ? (CARD_COLOR_LABELS[toKey] ?? toKey) : null;
    if (!from && to) return ['definiu ', label, ' como ', { bold: to }];
    if (from && !to) return ['removeu ', label];
    if (from && to) return ['alterou ', label, ' de ', { bold: from }, ' para ', { bold: to }];
    return null;
  }

  if (field === 'dueDate' || field === 'startDate') {
    const from = fmtDate(typeof change.from === 'string' ? change.from : null);
    const to = fmtDate(typeof change.to === 'string' ? change.to : null);
    if (!from && to) return ['definiu ', label, ' para ', { bold: to }];
    if (from && !to) return ['removeu ', label, ' (era ', { bold: from }, ')'];
    if (from && to) return ['alterou ', label, ' de ', { bold: from }, ' para ', { bold: to }];
    return null;
  }

  if (field === 'estimateMinutes') {
    const from = fmtMinutes(typeof change.from === 'number' ? change.from : null);
    const to = fmtMinutes(typeof change.to === 'number' ? change.to : null);
    if (!from && to) return ['definiu ', label, ' como ', { bold: to }];
    if (from && !to) return ['removeu ', label];
    if (from && to) return ['alterou ', label, ' de ', { bold: from }, ' para ', { bold: to }];
    return null;
  }

  return null;
}

function joinParts(blocks: ActivityPart[][]): ActivityPart[] {
  if (blocks.length === 1) return blocks[0]!;
  if (blocks.length === 2) return [...blocks[0]!, '; ', ...blocks[1]!];
  // 3+: separa com '; ' entre todos pra leitura clara
  const out: ActivityPart[] = [];
  blocks.forEach((b, i) => {
    if (i > 0) out.push('; ');
    out.push(...b);
  });
  return out;
}

const SIMPLE_LABELS: Record<string, string> = {
  CARD_CREATED: 'criou o card',
  CARD_ARCHIVED: 'arquivou o card',
  CARD_RESTORED: 'desarquivou o card',
  CARD_COMPLETED: 'finalizou o card',
  CARD_UNCOMPLETED: 'reabriu o card',
  CARD_ASSIGNED: 'atribuiu um membro',
  CARD_UNASSIGNED: 'removeu um membro',
  CARD_PARENT_LINKED: 'vinculou como filho',
  CARD_PARENT_UNLINKED: 'desvinculou do pai',
  COMMENT_ADDED: 'comentou',
  COMMENT_EDITED: 'editou um comentário',
  COMMENT_DELETED: 'excluiu um comentário',
  ATTACHMENT_ADDED: 'anexou um arquivo',
  ATTACHMENT_REMOVED: 'removeu um anexo',
  MEMBER_JOINED_BOARD: 'entrou no quadro',
  TIME_ENTRY_STARTED: 'iniciou cronômetro',
  TIME_ENTRY_STOPPED: 'parou cronômetro',
  TIME_ENTRY_CREATED: 'lançou tempo manual',
  TIME_ENTRY_UPDATED: 'editou um lançamento de tempo',
  TIME_ENTRY_DELETED: 'removeu um lançamento de tempo',
};

/**
 * Parte de uma mensagem de activity. Texto simples (string) ou trecho que
 * deve ser renderizado em negrito (`{ bold: string }`). O componente
 * <ActivityMessage> renderiza isso pra JSX.
 */
export type ActivityPart = string | { bold: string };

function fieldLabel(f: string): string {
  return FIELD_LABELS[f] ?? f;
}

function listFields(fields: string[]): ActivityPart[] {
  if (fields.length === 1) return [{ bold: fieldLabel(fields[0]!) }];
  if (fields.length === 2)
    return [{ bold: fieldLabel(fields[0]!) }, ' e ', { bold: fieldLabel(fields[1]!) }];
  // 3+: "X, Y e Z"
  const parts: ActivityPart[] = [];
  fields.forEach((f, i) => {
    parts.push({ bold: fieldLabel(f) });
    if (i < fields.length - 2) parts.push(', ');
    else if (i === fields.length - 2) parts.push(' e ');
  });
  return parts;
}

/**
 * Retorna a mensagem da activity como uma sequência de partes (texto simples
 * + trechos em negrito). Permite o componente renderizar com tipografia
 * rica (substantivos importantes em negrito).
 */
export function activityParts(a: ActivityNode): ActivityPart[] {
  const p = (a.payload ?? {}) as Record<string, unknown>;

  switch (a.type) {
    case 'CARD_UPDATED': {
      const fields = Array.isArray(p.fields) ? (p.fields as string[]) : [];
      if (fields.length === 0) return ['atualizou o card'];

      // Quando há `changes` no payload (activity nova), renderiza com from/to
      // específicos pra cada field. Senão cai no fallback genérico (activities
      // antigas + descrição que não tem from/to).
      const changes =
        p.changes && typeof p.changes === 'object'
          ? (p.changes as Record<string, { from: unknown; to: unknown }>)
          : {};

      const detailedBlocks: ActivityPart[][] = [];
      const genericFields: string[] = [];
      for (const field of fields) {
        const change = changes[field];
        const part = change ? changePart(field, change) : null;
        if (part) {
          detailedBlocks.push(part);
        } else {
          genericFields.push(field);
        }
      }

      // Append "alterou X" pros fields sem from/to (ex: descrição)
      if (genericFields.length > 0) {
        detailedBlocks.push(['alterou ', ...listFields(genericFields)]);
      }

      if (detailedBlocks.length === 0) return ['alterou ', ...listFields(fields)];
      return joinParts(detailedBlocks);
    }

    case 'CARD_MOVED': {
      const from = typeof p.fromListName === 'string' ? p.fromListName : null;
      const to = typeof p.toListName === 'string' ? p.toListName : null;
      const board = typeof p.boardName === 'string' ? p.boardName : null;
      if (from && to && board) {
        return [
          'moveu o card da coluna ',
          { bold: from },
          ' para a coluna ',
          { bold: to },
          ' no fluxo ',
          { bold: board },
        ];
      }
      if (from && to) {
        return ['moveu o card da coluna ', { bold: from }, ' para ', { bold: to }];
      }
      return ['moveu o card'];
    }

    case 'CARD_LEAD_CHANGED':
      return ['mudou o líder'];

    case 'CHECKLIST_CREATED': {
      const title = typeof p.title === 'string' ? p.title : null;
      return title ? ['criou a lista ', { bold: title }] : ['criou uma lista de tarefas'];
    }

    case 'CHECKLIST_RENAMED': {
      const from = typeof p.fromTitle === 'string' ? p.fromTitle : null;
      const to = typeof p.toTitle === 'string' ? p.toTitle : null;
      if (from && to) return ['renomeou a lista ', { bold: from }, ' para ', { bold: to }];
      return ['renomeou uma lista de tarefas'];
    }

    case 'CHECKLIST_DELETED': {
      const title = typeof p.title === 'string' ? p.title : null;
      return title ? ['excluiu a lista ', { bold: title }] : ['excluiu uma lista de tarefas'];
    }

    case 'CHECKLIST_ITEM_CREATED': {
      const text = typeof p.text === 'string' ? p.text : null;
      return text ? ['adicionou a tarefa ', { bold: text }, ' ao card'] : ['adicionou uma tarefa'];
    }

    case 'CHECKLIST_ITEM_RENAMED': {
      const from = typeof p.fromText === 'string' ? p.fromText : null;
      const to = typeof p.toText === 'string' ? p.toText : null;
      if (from && to) return ['renomeou a tarefa ', { bold: from }, ' para ', { bold: to }];
      return ['renomeou uma tarefa'];
    }

    case 'CHECKLIST_ITEM_DELETED': {
      const text = typeof p.text === 'string' ? p.text : null;
      return text ? ['excluiu a tarefa ', { bold: text }] : ['excluiu uma tarefa'];
    }

    case 'CHECKLIST_ITEM_DONE': {
      const text = typeof p.text === 'string' ? p.text : null;
      return text ? ['concluiu a tarefa ', { bold: text }] : ['concluiu uma tarefa'];
    }

    case 'CHECKLIST_ITEM_UNDONE': {
      const text = typeof p.text === 'string' ? p.text : null;
      return text ? ['reabriu a tarefa ', { bold: text }] : ['reabriu uma tarefa'];
    }

    case 'LABEL_ADDED': {
      const name = typeof p.labelName === 'string' ? p.labelName : null;
      return name ? ['adicionou a etiqueta ', { bold: name }] : ['adicionou uma etiqueta'];
    }
    case 'LABEL_REMOVED': {
      const name = typeof p.labelName === 'string' ? p.labelName : null;
      return name ? ['removeu a etiqueta ', { bold: name }] : ['removeu uma etiqueta'];
    }

    default:
      return [SIMPLE_LABELS[a.type] ?? a.type.toLowerCase().replace(/_/g, ' ')];
  }
}

/** Versão "string" da mensagem (sem formatação) — útil em contextos plain. */
export function activityLabel(a: ActivityNode): string {
  return activityParts(a)
    .map((p) => (typeof p === 'string' ? p : p.bold))
    .join('');
}

/** Detalhe extra. Hoje tudo já vai embutido em activityParts. */
export function activityDetail(_a: ActivityNode): string | null {
  return null;
}
