import type { Automation } from '@/lib/queries/automations';

interface MemberLookup {
  id: string;
  name: string;
}

interface LabelLookup {
  id: string;
  name: string;
  color: string;
}

interface Lookups {
  members: MemberLookup[];
  labels: LabelLookup[];
}

/**
 * Renderiza descricao rica de uma automacao usando o actionConfig.
 * Ex: "Definir Nicchon Sanchez como lider", "Inserir 1 tarefa em Tarefas",
 * "Adicionar etiquetas: SUPORTE, BUG".
 *
 * Cai pro label generico se faltar dado pra renderizar (ex: usuario removido).
 */
export function describeAutomationRich(automation: Automation, lookups: Lookups): React.ReactNode {
  const cfg = automation.actionConfig ?? {};

  switch (automation.actionType) {
    case 'SET_LEAD': {
      const userId = typeof cfg.userId === 'string' ? cfg.userId : null;
      const member = userId ? lookups.members.find((m) => m.id === userId) : null;
      const replaceMode = cfg.replaceMode;
      const suffix =
        replaceMode === 'REMOVE_FROM_TEAM'
          ? ' (substituindo e removendo o anterior da equipe)'
          : replaceMode === 'KEEP_IF_HAS_LEAD'
            ? ' (apenas se o card não tiver líder)'
            : '';
      if (!member) return `Definir líder do card${suffix}`;
      return (
        <>
          Definir <Strong>{member.name}</Strong> como líder do card{suffix}
        </>
      );
    }

    case 'ADD_TEAM': {
      const userIds = Array.isArray(cfg.userIds) ? (cfg.userIds as string[]) : [];
      const names = userIds
        .map((id) => lookups.members.find((m) => m.id === id)?.name)
        .filter((n): n is string => !!n);
      if (names.length === 0) return 'Adicionar equipe ao card';
      if (names.length === 1) {
        return (
          <>
            Adicionar <Strong>{names[0]}</Strong> à equipe do card
          </>
        );
      }
      if (names.length <= 3) {
        return (
          <>
            Adicionar <Strong>{names.join(', ')}</Strong> à equipe do card
          </>
        );
      }
      return (
        <>
          Adicionar <Strong>{names.length} pessoas</Strong> à equipe do card
        </>
      );
    }

    case 'INSERT_TAGS': {
      const ids = Array.isArray(cfg.tagIds) ? (cfg.tagIds as string[]) : [];
      const names = ids
        .map((id) => lookups.labels.find((l) => l.id === id)?.name)
        .filter((n): n is string => !!n);
      if (names.length === 0) return 'Adicionar etiquetas ao card';
      return (
        <>
          Adicionar etiqueta{names.length > 1 ? 's' : ''} <Strong>{names.join(', ')}</Strong>
        </>
      );
    }

    case 'REMOVE_TAGS': {
      const ids = Array.isArray(cfg.tagIds) ? (cfg.tagIds as string[]) : [];
      const names = ids
        .map((id) => lookups.labels.find((l) => l.id === id)?.name)
        .filter((n): n is string => !!n);
      if (names.length === 0) return 'Remover etiquetas do card';
      return (
        <>
          Remover etiqueta{names.length > 1 ? 's' : ''} <Strong>{names.join(', ')}</Strong>
        </>
      );
    }

    case 'INSERT_CHECKLIST_ITEMS': {
      const items = Array.isArray(cfg.items) ? (cfg.items as string[]) : [];
      const title =
        typeof cfg.checklistTitle === 'string' ? (cfg.checklistTitle as string) : 'Tarefas';
      return (
        <>
          Inserir{' '}
          <Strong>
            {items.length} tarefa{items.length === 1 ? '' : 's'}
          </Strong>{' '}
          em <Strong>{title}</Strong>
          {describeChecklistDefaults(cfg, lookups)}
        </>
      );
    }

    case 'INSERT_CHECKLIST_GROUP': {
      const items = Array.isArray(cfg.items) ? (cfg.items as string[]) : [];
      const title = typeof cfg.title === 'string' ? (cfg.title as string) : 'Tarefas';
      return (
        <>
          Inserir grupo <Strong>{title}</Strong> com{' '}
          <Strong>
            {items.length} tarefa{items.length === 1 ? '' : 's'}
          </Strong>
          {describeChecklistDefaults(cfg, lookups)}
        </>
      );
    }

    case 'POST_COMMENT': {
      const tpl = typeof cfg.template === 'string' ? (cfg.template as string).trim() : '';
      if (!tpl) return 'Postar comentário automático';
      const preview = tpl.length > 60 ? `${tpl.slice(0, 60)}…` : tpl;
      return (
        <>
          Postar comentário: <Strong>&ldquo;{preview}&rdquo;</Strong>
        </>
      );
    }

    case 'SET_CARD_STATUS': {
      const status = cfg.status;
      if (status === 'COMPLETED') return 'Marcar card como finalizado';
      if (status === 'REOPENED') return 'Reabrir card (desmarcar finalizado)';
      if (status === 'ARCHIVED') return 'Arquivar card';
      return 'Alterar status do card';
    }

    case 'CREATE_CHILD_CARD': {
      const tpl = typeof cfg.titleTemplate === 'string' ? (cfg.titleTemplate as string).trim() : '';
      if (!tpl) return 'Criar card filho';
      return (
        <>
          Criar card filho: <Strong>&ldquo;{tpl}&rdquo;</Strong>
        </>
      );
    }

    case 'UPDATE_FLOW_POSITION': {
      if (cfg.position === 'BOTTOM') return 'Mover para a base da coluna';
      return 'Mover para o topo da coluna';
    }

    case 'MOVE_CARD': {
      const targetListId = typeof cfg.targetListId === 'string' ? cfg.targetListId : null;
      const pos = cfg.position === 'TOP' ? 'topo' : 'base';
      if (!targetListId) return 'Mover para outra coluna (não configurada)';
      return `Mover para outra coluna (${pos})`;
    }

    default:
      return ACTION_FALLBACK[automation.actionType] ?? automation.actionType;
  }
}

const ACTION_FALLBACK: Partial<Record<Automation['actionType'], string>> = {
  FILL_FIELDS: 'Preencher campos',
  SAVE_DESCRIPTION_VERSION: 'Salvar versão da descrição',
  SEND_EMAIL: 'Enviar e-mail',
  SEND_WHATSAPP: 'Enviar WhatsApp',
  LINK_FLOW: 'Vincular a outro fluxo',
  UNLINK_FLOW: 'Desvincular do fluxo',
  FLAG_DUE_TODAY: 'Sinalizar marcos para hoje',
  FLAG_OVERDUE: 'Sinalizar marcos atrasados',
};

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="text-fg font-semibold">{children}</strong>;
}

/**
 * Descricao opcional (sufixo) com assignee/prazo/prioridade dos items
 * criados pela automacao. Soh renderiza se algum default estiver setado.
 */
function describeChecklistDefaults(
  cfg: Record<string, unknown>,
  lookups: Lookups,
): React.ReactNode {
  const parts: React.ReactNode[] = [];

  // ---- assignee ----
  if (cfg.assigneeMode === 'CARD_LEAD') {
    parts.push(
      <>
        para o <Strong>líder do card</Strong>
      </>,
    );
  } else if (cfg.assigneeMode === 'SPECIFIC_USER' && typeof cfg.assigneeUserId === 'string') {
    const member = lookups.members.find((m) => m.id === cfg.assigneeUserId);
    parts.push(
      <>
        para <Strong>{member?.name ?? 'membro'}</Strong>
      </>,
    );
  }

  // ---- due date ----
  if (cfg.dueMode === 'OFFSET_FROM_NOW' && typeof cfg.dueOffsetDays === 'number') {
    parts.push(
      <>
        com prazo em{' '}
        <Strong>
          {cfg.dueOffsetDays} dia{cfg.dueOffsetDays === 1 ? '' : 's'}
        </Strong>
      </>,
    );
  } else if (cfg.dueMode === 'OFFSET_FROM_CARD_DUE' && typeof cfg.dueOffsetDays === 'number') {
    const n = cfg.dueOffsetDays;
    const dir = n >= 0 ? 'após' : 'antes';
    parts.push(
      <>
        com prazo{' '}
        <Strong>
          {Math.abs(n)} dia{Math.abs(n) === 1 ? '' : 's'} {dir} do prazo do card
        </Strong>
      </>,
    );
  } else if (cfg.dueMode === 'FIXED_DATE' && typeof cfg.dueDate === 'string') {
    parts.push(
      <>
        com prazo em <Strong>{cfg.dueDate}</Strong>
      </>,
    );
  }

  // ---- priority ----
  if (
    cfg.itemPriority === 'LOW' ||
    cfg.itemPriority === 'MEDIUM' ||
    cfg.itemPriority === 'HIGH' ||
    cfg.itemPriority === 'URGENT'
  ) {
    const PT: Record<string, string> = {
      LOW: 'baixa',
      MEDIUM: 'média',
      HIGH: 'alta',
      URGENT: 'urgente',
    };
    parts.push(
      <>
        com prioridade <Strong>{PT[cfg.itemPriority as string]}</Strong>
      </>,
    );
  }

  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i === 0 ? ', ' : i === parts.length - 1 ? ' e ' : ', '}
          {p}
        </span>
      ))}
    </>
  );
}
