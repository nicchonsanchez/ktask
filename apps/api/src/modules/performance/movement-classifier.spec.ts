import type { PerformanceColumnConfig } from '@ktask/contracts';

import {
  classifyMovement,
  pickVersionAt,
  type PerformanceConfigVersionLike,
} from './movement-classifier';

/**
 * Exemplo da especificacao funcional (§5.1/§5.4): quadro Relacoes
 * Institucionais Kharis. ids = nomes pra leitura do teste.
 */
const col = (
  listId: string,
  category: PerformanceColumnConfig['category'],
  progressOrder: number | null,
  counted = true,
): PerformanceColumnConfig => ({ listId, category, progressOrder, counted });

const SPEC_VERSION: PerformanceConfigVersionLike = {
  effectiveFrom: new Date('2026-05-01T00:00:00Z'),
  columns: [
    col('novo-lead', 'ENTRADA', 1),
    col('ligando', 'EM_ANDAMENTO', 2),
    col('interatividade', 'EM_ANDAMENTO', 3),
    col('reuniao', 'EM_ANDAMENTO', 4),
    col('negociacao', 'EM_ANDAMENTO', 5),
    col('finalizado', 'CONCLUSAO_POSITIVA', 6),
    col('marketing', 'FLUXO_PARALELO', null),
    col('administrativo', 'FLUXO_PARALELO', null),
  ],
  transitionOverrides: [],
};

describe('classifyMovement — tabela da spec §5.4', () => {
  it.each([
    ['ligando', 'interatividade', 'AVANCO'],
    ['interatividade', 'reuniao', 'AVANCO'],
    ['reuniao', 'negociacao', 'AVANCO'],
    ['negociacao', 'finalizado', 'CONCLUSAO'],
    ['negociacao', 'ligando', 'RETROCESSO'],
    ['finalizado', 'marketing', 'TRANSFERENCIA'],
  ])('%s -> %s = %s', (from, to, expected) => {
    expect(classifyMovement(from, to, SPEC_VERSION).movementClass).toBe(expected);
  });

  it('exemplo §5.3: 3 -> 4 avanco e 5 -> 2 retrocesso', () => {
    expect(classifyMovement('interatividade', 'reuniao', SPEC_VERSION).movementClass).toBe(
      'AVANCO',
    );
    expect(classifyMovement('negociacao', 'ligando', SPEC_VERSION).movementClass).toBe(
      'RETROCESSO',
    );
  });
});

describe('classifyMovement — regras e bordas', () => {
  it('sem versao vigente: nao classifica (spec §5.8)', () => {
    expect(classifyMovement('ligando', 'interatividade', null).movementClass).toBe(
      'NAO_CLASSIFICADA',
    );
  });

  it('conclusao positiva x negativa', () => {
    const v: PerformanceConfigVersionLike = {
      ...SPEC_VERSION,
      columns: [...SPEC_VERSION.columns, col('perdido', 'CONCLUSAO_NEGATIVA', null)],
    };
    expect(classifyMovement('negociacao', 'finalizado', v)).toEqual({
      movementClass: 'CONCLUSAO',
      conclusion: 'POSITIVA',
      isReopen: false,
    });
    expect(classifyMovement('negociacao', 'perdido', v).conclusion).toBe('NEGATIVA');
  });

  it('reabertura (finalizado -> ligando) conta como retrocesso', () => {
    expect(classifyMovement('finalizado', 'ligando', SPEC_VERSION)).toEqual({
      movementClass: 'RETROCESSO',
      conclusion: null,
      isReopen: true,
    });
  });

  it('excecao de transicao vence a ordem', () => {
    const v: PerformanceConfigVersionLike = {
      ...SPEC_VERSION,
      transitionOverrides: [
        { fromListId: 'negociacao', toListId: 'ligando', movementClass: 'NEUTRA' },
      ],
    };
    expect(classifyMovement('negociacao', 'ligando', v).movementClass).toBe('NEUTRA');
    // outras transicoes seguem a regra normal
    expect(classifyMovement('reuniao', 'ligando', v).movementClass).toBe('RETROCESSO');
  });

  it('coluna com counted=false fica fora do progresso', () => {
    const v: PerformanceConfigVersionLike = {
      ...SPEC_VERSION,
      columns: SPEC_VERSION.columns.map((c) =>
        c.listId === 'ligando' ? { ...c, counted: false } : c,
      ),
    };
    expect(classifyMovement('novo-lead', 'ligando', v).movementClass).toBe('NEUTRA');
  });

  it('coluna configurada sem ordem (aguardando) e neutra', () => {
    const v: PerformanceConfigVersionLike = {
      ...SPEC_VERSION,
      columns: [...SPEC_VERSION.columns, col('aguardando', 'AGUARDANDO', null)],
    };
    expect(classifyMovement('negociacao', 'aguardando', v).movementClass).toBe('NEUTRA');
  });

  it('coluna fora da versao (criada depois / arquivada nao configurada): nao classifica', () => {
    expect(classifyMovement('coluna-nova', 'ligando', SPEC_VERSION).movementClass).toBe(
      'NAO_CLASSIFICADA',
    );
  });

  it('mesma ordem nas duas pontas e neutra', () => {
    const v: PerformanceConfigVersionLike = {
      ...SPEC_VERSION,
      columns: [...SPEC_VERSION.columns, col('ligando-2', 'EM_ANDAMENTO', 2)],
    };
    expect(classifyMovement('ligando', 'ligando-2', v).movementClass).toBe('NEUTRA');
  });
});

describe('classifyMovement — nivel basico (so coluna de finalizado, D8)', () => {
  const BASIC: PerformanceConfigVersionLike = {
    effectiveFrom: new Date('2026-05-01T00:00:00Z'),
    columns: [col('finalizado', 'CONCLUSAO_POSITIVA', null)],
    transitionOverrides: [],
  };

  it('detecta conclusao', () => {
    expect(classifyMovement('negociacao', 'finalizado', BASIC).movementClass).toBe('CONCLUSAO');
  });

  it('saida do finalizado pra coluna nao configurada: nao infere (pode ser transferencia)', () => {
    // Caso real: FINALIZADO -> MARKETING antes de Marketing ser marcado como paralelo
    expect(classifyMovement('finalizado', 'marketing', BASIC)).toMatchObject({
      movementClass: 'NAO_CLASSIFICADA',
      isReopen: false,
    });
  });

  it('nao infere avanco/retrocesso entre colunas comuns', () => {
    expect(classifyMovement('ligando', 'interatividade', BASIC).movementClass).toBe(
      'NAO_CLASSIFICADA',
    );
  });

  it('caso real: isFinalList "Concluido" nao conta se o Lucas apontou outra coluna', () => {
    // "concluido-sistema" nao esta na config -> nao e conclusao gerencial
    expect(classifyMovement('negociacao', 'concluido-sistema', BASIC).movementClass).toBe(
      'NAO_CLASSIFICADA',
    );
  });
});

describe('pickVersionAt — vigencia (spec §18: sem reclassificacao silenciosa)', () => {
  const v1 = { id: 'v1', effectiveFrom: new Date('2026-05-01T00:00:00Z') };
  const v2 = { id: 'v2', effectiveFrom: new Date('2026-09-01T00:00:00Z') };

  it('evento antes de qualquer versao: null', () => {
    expect(pickVersionAt([v1, v2], new Date('2026-04-30T23:59:59Z'))).toBeNull();
  });

  it('evento entre versoes usa a anterior', () => {
    expect(pickVersionAt([v2, v1], new Date('2026-08-15T12:00:00Z'))?.id).toBe('v1');
  });

  it('evento depois da nova versao usa a nova', () => {
    expect(pickVersionAt([v1, v2], new Date('2026-09-02T00:00:00Z'))?.id).toBe('v2');
  });

  it('empate de vigencia: vale a versao salva por ultimo', () => {
    const basic = {
      id: 'basic',
      effectiveFrom: v1.effectiveFrom,
      createdAt: new Date('2026-10-06T10:00:00Z'),
    };
    const full = {
      id: 'full',
      effectiveFrom: v1.effectiveFrom,
      createdAt: new Date('2026-10-06T11:00:00Z'),
    };
    expect(pickVersionAt([full, basic], new Date('2026-06-01T00:00:00Z'))?.id).toBe('full');
    expect(pickVersionAt([basic, full], new Date('2026-06-01T00:00:00Z'))?.id).toBe('full');
  });

  it('limite inclusivo: evento exatamente no effectiveFrom usa a versao', () => {
    expect(pickVersionAt([v1, v2], new Date('2026-09-01T00:00:00Z'))?.id).toBe('v2');
  });
});
