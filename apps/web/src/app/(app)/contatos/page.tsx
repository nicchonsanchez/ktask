'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import {
  contactsQueries,
  createContact,
  removeContact,
  updateContact,
  type ContactRow,
  type ContactType,
  type CreateContactInput,
} from '@/lib/queries/contacts';

/**
 * Agenda de contatos da Org. Filtros (Pessoa/Empresa, busca, "tem cards"),
 * criação inline, edição via modal, soft delete.
 */
export default function ContatosPage() {
  const [filterType, setFilterType] = useState<'ALL' | ContactType>('ALL');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const listQ = useQuery({
    ...contactsQueries.list({
      type: filterType === 'ALL' ? undefined : filterType,
      q: query.trim() || undefined,
    }),
  });
  const all = listQ.data ?? [];

  const counts = useMemo(() => {
    return {
      total: all.length,
      person: all.filter((c) => c.type === 'PERSON').length,
      company: all.filter((c) => c.type === 'COMPANY').length,
    };
  }, [all]);

  return (
    <div className="container mx-auto max-w-5xl py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Contatos</h1>
          <p className="text-fg-muted text-sm">
            Agenda de clientes, fornecedores e parceiros. {counts.total} cadastrados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <Plus size={14} />
          Novo contato
        </button>
      </header>

      <div className="border-border bg-bg-muted/20 mb-4 flex flex-wrap items-center gap-2 rounded-md border p-2">
        <FilterBtn active={filterType === 'ALL'} onClick={() => setFilterType('ALL')}>
          Todos ({counts.total})
        </FilterBtn>
        <FilterBtn
          active={filterType === 'PERSON'}
          onClick={() => setFilterType('PERSON')}
          icon={<UserIcon size={12} />}
        >
          Pessoas ({counts.person})
        </FilterBtn>
        <FilterBtn
          active={filterType === 'COMPANY'}
          onClick={() => setFilterType('COMPANY')}
          icon={<Building2 size={12} />}
        >
          Empresas ({counts.company})
        </FilterBtn>
        <div className="ml-auto flex items-center gap-1.5">
          <Search size={13} className="text-fg-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, email, telefone..."
            className="bg-bg border-border focus-visible:ring-primary w-64 rounded-md border px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </div>
      </div>

      {listQ.isLoading && (
        <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      )}

      {!listQ.isLoading && all.length === 0 && (
        <div className="border-border bg-bg-muted/20 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <UserIcon size={28} className="text-fg-muted" />
          <p className="text-sm font-medium">
            {query ? 'Nenhum contato bate com o filtro.' : 'Nenhum contato cadastrado.'}
          </p>
          {!query && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="text-primary text-xs hover:underline"
            >
              Criar primeiro contato
            </button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {all.map((c) => (
          <ContactRowItem key={c.id} contact={c} onClick={() => setDetailId(c.id)} />
        ))}
      </ul>

      {createOpen && <CreateContactModal onClose={() => setCreateOpen(false)} />}
      {detailId && <ContactDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active ? 'bg-primary text-primary-fg' : 'bg-bg text-fg-muted hover:bg-bg-emphasis'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function ContactRowItem({ contact, onClick }: { contact: ContactRow; onClick: () => void }) {
  const Icon = contact.type === 'COMPANY' ? Building2 : UserIcon;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="border-border bg-bg hover:border-border-strong flex w-full items-center gap-3 rounded-md border p-3 text-left shadow-sm transition-colors"
      >
        <span className="bg-bg-muted text-fg-muted inline-flex size-9 shrink-0 items-center justify-center rounded-full">
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-fg truncate text-sm font-medium">{contact.name}</span>
            {contact.parent && (
              <span className="text-fg-subtle truncate text-[11px]">· {contact.parent.name}</span>
            )}
            {contact.userMatch && (
              <span
                className="bg-primary-subtle/60 text-primary inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                title={`Tambem cadastrado como membro: ${contact.userMatch.name}`}
              >
                <Check size={9} />
                membro
              </span>
            )}
          </div>
          {(contact.email || contact.phone) && (
            <div className="text-fg-muted mt-0.5 flex items-center gap-3 text-[11px]">
              {contact.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail size={10} />
                  {contact.email}
                </span>
              )}
              {contact.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone size={10} />
                  {contact.phone}
                </span>
              )}
            </div>
          )}
        </div>
        {contact._count && contact._count.cards > 0 && (
          <span className="bg-bg-muted text-fg-muted shrink-0 rounded-full px-2 py-0.5 text-[11px]">
            {contact._count.cards} card{contact._count.cards !== 1 ? 's' : ''}
          </span>
        )}
      </button>
    </li>
  );
}

function CreateContactModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<ContactType>('PERSON');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [document, setDocument] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => {
      const input: CreateContactInput = {
        type,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        document: document.trim() || undefined,
      };
      return createContact(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar contato.');
    },
  });

  const canSubmit = name.trim().length > 0 && !mut.isPending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) mut.mutate();
        }}
        className="bg-bg border-border w-full max-w-md rounded-md border p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-base font-semibold">Novo contato</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-fg-muted mb-1 block text-[11px] font-medium">Tipo</label>
            <div className="flex gap-1">
              <FilterBtn
                active={type === 'PERSON'}
                onClick={() => setType('PERSON')}
                icon={<UserIcon size={12} />}
              >
                Pessoa
              </FilterBtn>
              <FilterBtn
                active={type === 'COMPANY'}
                onClick={() => setType('COMPANY')}
                icon={<Building2 size={12} />}
              >
                Empresa
              </FilterBtn>
            </div>
          </div>

          <Field label="Nome *">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
          </Field>
          <Field label="Telefone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
          </Field>
          <Field label={type === 'COMPANY' ? 'CNPJ' : 'CPF'}>
            <input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
          </Field>

          {error && (
            <p className="bg-danger-subtle text-danger rounded px-2 py-1 text-xs">{error}</p>
          )}

          <div className="border-border mt-2 flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={onClose}
              className="text-fg-muted hover:bg-bg-muted rounded-md px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mut.isPending && <Loader2 size={13} className="animate-spin" />}
              Criar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ContactDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const q = useQuery({ ...contactsQueries.detail(id), retry: false });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeMut = useMutation({
    mutationFn: () => removeContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover.');
    },
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-bg border-border flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border shadow-xl">
        <header className="border-border/60 flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-base font-semibold">Detalhes do contato</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {q.isLoading && (
            <div className="text-fg-muted flex items-center gap-2 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Carregando…
            </div>
          )}
          {q.data && !editing && <ContactDetailView contact={q.data} />}
          {q.data && editing && (
            <ContactEditForm
              contact={q.data}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: ['contacts'] });
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>

        {error && <p className="bg-danger-subtle text-danger px-5 py-2 text-xs">{error}</p>}

        {q.data && !editing && (
          <div className="border-border/60 flex justify-between border-t px-5 py-3">
            <button
              type="button"
              onClick={() => {
                if (confirm('Remover este contato?')) removeMut.mutate();
              }}
              disabled={removeMut.isPending}
              className="text-danger hover:bg-danger-subtle inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {removeMut.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              Remover
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="bg-primary text-primary-fg hover:bg-primary-hover rounded-md px-3 py-1.5 text-sm font-medium"
            >
              Editar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactDetailView({
  contact,
}: {
  contact: NonNullable<ReturnType<typeof contactsQueries.detail>['queryFn']> extends () => Promise<
    infer T
  >
    ? T
    : never;
}) {
  const Icon = contact.type === 'COMPANY' ? Building2 : UserIcon;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="bg-bg-muted text-fg-muted inline-flex size-12 items-center justify-center rounded-full">
          <Icon size={20} />
        </span>
        <div>
          <h3 className="text-lg font-semibold">{contact.name}</h3>
          <p className="text-fg-muted text-xs">
            {contact.type === 'COMPANY' ? 'Empresa' : 'Pessoa'}
            {contact.parent && ` · vinculada a ${contact.parent.name}`}
          </p>
        </div>
        {contact.userMatch && (
          <span className="bg-primary-subtle/60 text-primary ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium">
            <Check size={11} />
            Tambem é membro: {contact.userMatch.name}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        {contact.email && (
          <div>
            <dt className="text-fg-muted text-[11px]">Email</dt>
            <dd className="text-fg">{contact.email}</dd>
          </div>
        )}
        {contact.phone && (
          <div>
            <dt className="text-fg-muted text-[11px]">Telefone</dt>
            <dd className="text-fg">{contact.phone}</dd>
          </div>
        )}
        {contact.document && (
          <div>
            <dt className="text-fg-muted text-[11px]">Documento</dt>
            <dd className="text-fg">{contact.document}</dd>
          </div>
        )}
      </dl>

      {contact.note && (
        <div>
          <p className="text-fg-muted mb-1 text-[11px]">Observações</p>
          <p className="text-fg-muted bg-bg-muted/40 whitespace-pre-wrap rounded p-2 text-xs">
            {contact.note}
          </p>
        </div>
      )}

      {contact.children.length > 0 && (
        <section>
          <h4 className="text-fg-muted mb-2 text-[11px] font-semibold uppercase">
            Pessoas vinculadas
          </h4>
          <ul className="flex flex-col gap-1">
            {contact.children.map((p) => (
              <li key={p.id} className="bg-bg-muted/30 rounded px-2 py-1 text-xs">
                <span className="text-fg font-medium">{p.name}</span>
                {p.email && <span className="text-fg-muted"> · {p.email}</span>}
                {p.phone && <span className="text-fg-muted"> · {p.phone}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="text-fg-muted mb-2 text-[11px] font-semibold uppercase">
          Cards vinculados ({contact.cards.length})
        </h4>
        {contact.cards.length === 0 && (
          <p className="text-fg-subtle text-xs">Sem cards vinculados.</p>
        )}
        <ul className="flex flex-col gap-1">
          {contact.cards.map((cc) => (
            <li key={cc.cardId}>
              <a
                href={`/b/${cc.card.boardId}?card=${cc.cardId}`}
                className="hover:bg-bg-muted text-fg flex items-center gap-2 rounded px-2 py-1.5 text-xs"
              >
                {cc.card.shortCode && (
                  <span className="text-fg-subtle font-mono">#{cc.card.shortCode}</span>
                )}
                <span className="flex-1 truncate font-medium">{cc.card.title}</span>
                <span className="text-fg-muted text-[10px]">
                  {cc.card.board.name} · {cc.card.list.name}
                </span>
                <ExternalLink size={11} className="text-fg-muted" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ContactEditForm({
  contact,
  onSaved,
  onCancel,
}: {
  contact: {
    id: string;
    type: ContactType;
    name: string;
    email: string | null;
    phone: string | null;
    document: string | null;
    note: string | null;
  };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(contact.name);
  const [type, setType] = useState<ContactType>(contact.type);
  const [email, setEmail] = useState(contact.email ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [document, setDocument] = useState(contact.document ?? '');
  const [note, setNote] = useState(contact.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () =>
      updateContact(contact.id, {
        type,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        document: document.trim() || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: onSaved,
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) mut.mutate();
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex gap-1">
        <FilterBtn
          active={type === 'PERSON'}
          onClick={() => setType('PERSON')}
          icon={<UserIcon size={12} />}
        >
          Pessoa
        </FilterBtn>
        <FilterBtn
          active={type === 'COMPANY'}
          onClick={() => setType('COMPANY')}
          icon={<Building2 size={12} />}
        >
          Empresa
        </FilterBtn>
      </div>
      <Field label="Nome *">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
        />
      </Field>
      <Field label="Email">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
        />
      </Field>
      <Field label="Telefone">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
        />
      </Field>
      <Field label="Documento">
        <input
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
        />
      </Field>
      <Field label="Observações">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          className="border-border bg-bg w-full resize-none rounded-md border px-2 py-1.5 text-sm focus:outline-none"
        />
      </Field>
      {error && <p className="bg-danger-subtle text-danger rounded px-2 py-1 text-xs">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:bg-bg-muted rounded-md px-3 py-1.5 text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mut.isPending || !name.trim()}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {mut.isPending && <Loader2 size={13} className="animate-spin" />}
          Salvar
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-fg-muted mb-1 block text-[11px] font-medium">{label}</span>
      {children}
    </label>
  );
}
