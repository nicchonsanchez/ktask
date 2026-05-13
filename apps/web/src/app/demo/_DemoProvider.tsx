'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import type { User } from '@ktask/contracts';
import { DEMO_TAREFAS_MARINA } from './_data';

/**
 * Wrapper das telas /demo. Responsabilidades:
 *
 *   1. Cria QueryClient isolado com retry:false + staleTime:Infinity pra
 *      qualquer query nao mockada falhar silenciosa.
 *   2. Pre-popula cache do React Query com mocks (tarefas, aprovacoes,
 *      org corrente etc) que os componentes reais consomem.
 *   3. Hidrata o auth store com Marina (Member) — ou null se `auth="none"`.
 *
 * Light mode e forcado pelo DemoLightTheme no demo/layout.tsx (precisa
 * envolver tambem a tela de indice que nao usa esse provider).
 */
export function DemoProvider({
  children,
  auth = 'marina',
}: {
  children: ReactNode;
  auth?: 'marina' | 'none';
}) {
  const [client] = useState(() => makeDemoQueryClient());

  // Hidrata auth store
  useEffect(() => {
    if (auth === 'marina') {
      useAuthStore.setState({
        user: DEMO_MARINA_USER,
        accessToken: 'demo-token',
        initialized: true,
      });
    } else {
      useAuthStore.setState({
        user: null,
        accessToken: null,
        initialized: true,
      });
    }
    return () => {
      useAuthStore.setState({
        user: null,
        accessToken: null,
        initialized: false,
      });
    };
  }, [auth]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// ─── Usuario "logado" nas telas demo (Marina, Member) ──────────────────

const DEMO_MARINA_USER: User = {
  id: 'u-marina',
  email: 'marina@padariaaurora.com.br',
  name: 'Marina Costa',
  avatarUrl: null,
  phone: null,
  notifyApprovalsOnWhatsApp: false,
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  twoFactorEnabled: false,
  createdAt: '2026-04-01T00:00:00.000Z',
};

// ─── Factory do QueryClient com cache pre-populado ─────────────────────

function makeDemoQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        retry: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });

  // ─ Org corrente do usuario logado
  client.setQueryData(['org', 'current'], {
    id: 'org-demo',
    myRole: 'MEMBER',
  });

  // ─ Aprovacoes pendentes (badge da topbar mostra o `length`)
  // Marina tem 2 aprovacoes pendentes hoje.
  client.setQueryData(
    ['me', 'pending-approvals'],
    [
      { id: 'ap-1', cardCode: 'AURORA-42', cardTitle: 'Post — Promo café da manhã' },
      { id: 'ap-2', cardCode: 'AURORA-40', cardTitle: 'Logo institucional — versão monocromática' },
    ],
  );

  // ─ Tarefas da home (TarefasPanel real consome essa shape)
  client.setQueryData(['me', 'tasks'], {
    overdue: [],
    today: DEMO_TAREFAS_MARINA.filter((t) => t.due === 'Hoje').map(toMockTask),
    next7days: DEMO_TAREFAS_MARINA.filter((t) => t.due !== 'Hoje').map(toMockTask),
    noDate: [],
  });

  // ─ Cards recentes
  client.setQueryData(['me', 'recent-cards'], []);

  // ─ Calendar / eventos (vazios em demo)
  client.setQueryData(['me', 'calendar', 'days-with-tasks'], []);
  client.setQueryData(['me', 'events'], []);

  return client;
}

// Converte tarefa mockada (do _data) pro shape MeTask (do contracts).
// Mantemos minimo pra UI renderizar — campos que TarefasPanel/TarefaRow leem.
function toMockTask(tarefa: (typeof DEMO_TAREFAS_MARINA)[number]) {
  return {
    id: tarefa.id,
    kind: 'checklist' as const,
    text: tarefa.title,
    isDone: false,
    position: 0,
    dueDate:
      tarefa.due === 'Hoje' ? '2026-05-12' : tarefa.due === 'Amanhã' ? '2026-05-13' : '2026-05-15',
    assigneeId: 'u-marina',
    doneAt: null,
    doneById: null,
    checklistId: `cl-${tarefa.id}`,
    checklist: {
      id: `cl-${tarefa.id}`,
      title: 'Aprovações',
      cardId: `card-${tarefa.cardCode}`,
      card: {
        id: `card-${tarefa.cardCode}`,
        title: tarefa.cardTitle,
        boardId: tarefa.boardName === 'Design' ? 'b-design' : 'b-redes',
        cardColor: null,
        list: { id: 'l-aprov', name: 'Aprovação do cliente' },
        board: {
          id: tarefa.boardName === 'Design' ? 'b-design' : 'b-redes',
          name: tarefa.boardName,
          color: tarefa.boardName === 'Design' ? '#2ee8b8' : '#7c3aed',
        },
      },
    },
  };
}
