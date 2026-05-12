// Mock data para as telas de /demo do KTask.
// Cenario ficticio realista: agencia criativa "Estudio Verde" atendendo
// uma padaria de bairro como cliente. Tudo aqui e ficticio.

export const DEMO_ORG = {
  id: 'org-demo',
  name: 'Estúdio Verde',
  slug: 'estudio-verde',
} as const;

export const DEMO_CLIENTE = {
  id: 'cli-aurora',
  name: 'Padaria Aurora',
} as const;

// ─── Usuários ───────────────────────────────────────────────────────────

export const DEMO_USERS = {
  marina: {
    id: 'u-marina',
    name: 'Marina Costa',
    firstName: 'Marina',
    email: 'marina@padariaaurora.com.br',
    role: 'MEMBER' as const,
    cargo: 'Cliente — Padaria Aurora',
    color: '#10b981',
    avatarInitials: 'MC',
  },
  beatriz: {
    id: 'u-beatriz',
    name: 'Beatriz Soares',
    firstName: 'Beatriz',
    email: 'bia@estudioverde.com.br',
    role: 'MEMBER' as const,
    cargo: 'Designer',
    color: '#8b5cf6',
    avatarInitials: 'BS',
  },
  rafael: {
    id: 'u-rafael',
    name: 'Rafael Lima',
    firstName: 'Rafael',
    email: 'rafael@estudioverde.com.br',
    role: 'MEMBER' as const,
    cargo: 'Copywriter',
    color: '#f59e0b',
    avatarInitials: 'RL',
  },
  carla: {
    id: 'u-carla',
    name: 'Carla Mendes',
    firstName: 'Carla',
    email: 'carla@estudioverde.com.br',
    role: 'GESTOR' as const,
    cargo: 'Gerente de Projeto',
    color: '#ec4899',
    avatarInitials: 'CM',
  },
} as const;

// Usuário "logado" nas telas demo — sempre a cliente (Marina, Member).
// Esse é o ponto de vista do tutorial.
export const DEMO_VIEWER = DEMO_USERS.marina;

// ─── Quadros ────────────────────────────────────────────────────────────

export const DEMO_BOARDS = [
  {
    id: 'b-redes',
    slug: 'redes-sociais',
    name: 'Redes Sociais — Padaria Aurora',
    color: '#7c3aed',
    icon: '📱',
    membersCount: 4,
    cardsCount: 12,
    columns: ['Briefing', 'Em produção', 'Aprovação do cliente', 'Aprovado', 'Publicado'],
  },
  {
    id: 'b-design',
    slug: 'design',
    name: 'Design — Padaria Aurora',
    color: '#2ee8b8',
    icon: '🎨',
    membersCount: 3,
    cardsCount: 6,
    columns: ['Briefing', 'Design em produção', 'Aprovação do cliente', 'Arte finalizada'],
  },
] as const;

// ─── Cards ──────────────────────────────────────────────────────────────

export const DEMO_CARDS = [
  {
    code: 'AURORA-42',
    title: 'Post — Promo café da manhã (dia das mães)',
    boardId: 'b-redes',
    boardName: 'Redes Sociais',
    column: 'Aprovação do cliente',
    status: 'ACTIVE',
    priority: 'HIGH',
    dueDate: '2026-05-14',
    description:
      'Post único pra feed e stories anunciando o combo café da manhã especial de dia das mães. Foco visual: produto + texto bem chamativo. Mensagem da Aurora: "queremos transmitir aconchego e celebração".',
    leadId: 'u-marina',
    assigneeIds: ['u-beatriz', 'u-rafael'],
    needsApprovalFrom: 'u-marina',
  },
  {
    code: 'AURORA-43',
    title: 'Carrossel — Top 5 pães da casa',
    boardId: 'b-redes',
    boardName: 'Redes Sociais',
    column: 'Em produção',
    status: 'ACTIVE',
    priority: 'NORMAL',
    dueDate: '2026-05-18',
    description: 'Carrossel de 5 slides destacando os pães mais vendidos da Aurora.',
    leadId: 'u-marina',
    assigneeIds: ['u-rafael'],
    needsApprovalFrom: null,
  },
  {
    code: 'AURORA-40',
    title: 'Logo institucional — versão monocromática',
    boardId: 'b-design',
    boardName: 'Design',
    column: 'Aprovação do cliente',
    status: 'ACTIVE',
    priority: 'NORMAL',
    dueDate: '2026-05-15',
    description: 'Variação monocromática do logo principal pra uso em fundos coloridos.',
    leadId: 'u-marina',
    assigneeIds: ['u-beatriz'],
    needsApprovalFrom: 'u-marina',
  },
  {
    code: 'AURORA-39',
    title: 'Banner — Cardápio do almoço executivo',
    boardId: 'b-design',
    boardName: 'Design',
    column: 'Aprovado',
    status: 'ACTIVE',
    priority: 'LOW',
    dueDate: '2026-05-10',
    description:
      'Banner pra colocar na vitrine da padaria, divulgando o almoço executivo de segunda a sexta.',
    leadId: 'u-marina',
    assigneeIds: ['u-beatriz'],
    needsApprovalFrom: null,
  },
  {
    code: 'AURORA-41',
    title: 'Reels — Tour pelas instalações',
    boardId: 'b-redes',
    boardName: 'Redes Sociais',
    column: 'Briefing',
    status: 'ACTIVE',
    priority: 'NORMAL',
    dueDate: '2026-05-22',
    description:
      'Vídeo curto (15s) mostrando o ambiente da padaria, os fornos, a área de atendimento.',
    leadId: 'u-marina',
    assigneeIds: ['u-rafael', 'u-beatriz'],
    needsApprovalFrom: null,
  },
  {
    code: 'AURORA-38',
    title: 'Post — Boas-vindas (já publicado)',
    boardId: 'b-redes',
    boardName: 'Redes Sociais',
    column: 'Publicado',
    status: 'COMPLETED',
    priority: 'NORMAL',
    dueDate: '2026-04-29',
    description: 'Post de boas-vindas anunciando a parceria com o estúdio. Já publicado.',
    leadId: 'u-marina',
    assigneeIds: ['u-rafael'],
    needsApprovalFrom: null,
  },
] as const;

// ─── Tarefas do viewer (Marina) — aparecem na home ─────────────────────

export const DEMO_TAREFAS_MARINA = [
  {
    id: 't-1',
    title: 'Aprovar copy',
    cardCode: 'AURORA-42',
    cardTitle: 'Post — Promo café da manhã (dia das mães)',
    boardName: 'Redes Sociais',
    due: 'Hoje',
    dueColor: 'rose',
    status: 'pending',
  },
  {
    id: 't-2',
    title: 'Aprovar arte',
    cardCode: 'AURORA-40',
    cardTitle: 'Logo institucional — versão monocromática',
    boardName: 'Design',
    due: 'Amanhã',
    dueColor: 'amber',
    status: 'pending',
  },
  {
    id: 't-3',
    title: 'Revisar briefing',
    cardCode: 'AURORA-41',
    cardTitle: 'Reels — Tour pelas instalações',
    boardName: 'Redes Sociais',
    due: 'Sex',
    dueColor: 'muted',
    status: 'pending',
  },
] as const;

// ─── Timeline / atividades de um card (AURORA-42 — o card que abriremos) ─

export const DEMO_TIMELINE_CARD_42 = [
  {
    id: 'a-1',
    type: 'system',
    actor: 'ktask-bot',
    message: 'Card movido para Aprovação do cliente.',
    when: 'há 12 minutos',
  },
  {
    id: 'a-2',
    type: 'system',
    actor: 'ktask-bot',
    message: 'Tarefa Aprovar copy atribuída a Marina Costa.',
    when: 'há 12 minutos',
  },
  {
    id: 'a-3',
    type: 'comment',
    actor: 'Rafael Lima',
    actorId: 'u-rafael',
    message:
      'Marina, segue a copy pra sua aprovação. Caprichamos no chamado emocional ("para todas as mães que começaram o dia com pão quentinho da gente"). Se quiser ajustar algo, é só comentar aqui.',
    when: 'há 14 minutos',
  },
  {
    id: 'a-4',
    type: 'system',
    actor: 'ktask-bot',
    message: 'Beatriz Soares adicionou um anexo: arte-post-mae.png',
    when: 'há 28 minutos',
  },
  {
    id: 'a-5',
    type: 'system',
    actor: 'ktask-bot',
    message: 'Rafael Lima adicionou um anexo: copy-final.txt',
    when: 'há 38 minutos',
  },
  {
    id: 'a-6',
    type: 'comment',
    actor: 'Carla Mendes',
    actorId: 'u-carla',
    message: 'Briefing aprovado internamente, vamos pra produção.',
    when: 'ontem',
  },
] as const;

// ─── Schermos do índice /demo ─────────────────────────────────────────

export const DEMO_SCREENS = [
  {
    slug: 'entrar',
    titulo: 'Tela de Login',
    descricao: 'Tela /entrar com e-mail, senha e "Permanecer logado".',
    icon: '🔐',
    grupo: 'Acesso',
  },
  {
    slug: 'convite/exemplo-abc123',
    titulo: 'Aceitar convite',
    descricao: 'Tela onde a pessoa convidada define sua senha.',
    icon: '✉️',
    grupo: 'Acesso',
  },
  {
    slug: 'home',
    titulo: 'Painel inicial',
    descricao: 'Tela inicial com topbar completa e bloco de tarefas pendentes.',
    icon: '🏠',
    grupo: 'Visão do cliente',
  },
] as const;

export type DemoScreen = (typeof DEMO_SCREENS)[number];
