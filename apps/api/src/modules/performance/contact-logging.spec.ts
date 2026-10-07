import { interactionLabel, pickContactBoard } from './contact-logging.service';

/** Doc 52 (Fase 3, D9) — regra multi-fluxo do registro de contato. */
describe('pickContactBoard', () => {
  const rel = { boardId: 'rel', name: 'Relações Institucionais' };
  const com = { boardId: 'com', name: 'Comercial' };

  it('nenhum fluxo do card ligado: desligado (caixa de comentario igual)', () => {
    expect(pickContactBoard([], 'rel', 'rel')).toBeNull();
  });

  it('usa o fluxo pelo qual o card foi aberto, se ligado', () => {
    expect(pickContactBoard([rel, com], 'rel', 'com')).toBe('com');
  });

  it('aberto por fluxo desligado: cai no primario se ligado', () => {
    expect(pickContactBoard([rel, com], 'rel', 'redes')).toBe('rel');
  });

  it('primario desligado: primeiro ligado em ordem alfabetica', () => {
    expect(pickContactBoard([rel, com], 'redes', undefined)).toBe('com');
  });
});

describe('interactionLabel', () => {
  it('monta "Tipo · Resultado" com rotulos da spec', () => {
    expect(interactionLabel('CALL', 'NO_ANSWER')).toBe('Ligação · Não respondeu');
    expect(interactionLabel('PROPOSAL', 'SENT')).toBe('Proposta · Enviada');
  });

  it('"Outro" usa o rotulo livre', () => {
    expect(interactionLabel('OTHER', 'DONE', 'Visita presencial')).toBe(
      'Visita presencial · Realizado',
    );
  });
});
