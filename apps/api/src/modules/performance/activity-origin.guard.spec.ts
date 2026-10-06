import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Doc 52 — guarda contra regressao (teste estatico).
 *
 * O relatorio de Desempenho da Equipe so conta Activities com
 * origin = USER. Activity.origin tem default USER, entao qualquer caminho
 * nao-humano que esquecer de marcar a origem passa a contar como acao de
 * uma pessoa (na engine, actorId = criador da automacao). Estes testes
 * falham se alguem adicionar uma gravacao de Activity sem a marca.
 */

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

/** Corpo de cada chamada `activity.create(...)` / `.createMany(...)` (ate o `data: {` + 3 linhas). */
function activityWrites(src: string): string[] {
  const out: string[] = [];
  const re = /activity\s*\.\s*create(?:Many)?\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(src.slice(m.index, m.index + 400));
  return out;
}

describe('Activity.origin — caminhos nao-humanos marcam a origem', () => {
  it('engine de automacoes: toda Activity usa automationOrigin()', () => {
    const writes = activityWrites(read('automations/automations.engine.ts'));
    expect(writes.length).toBeGreaterThanOrEqual(8);
    for (const w of writes) expect(w).toContain('...this.automationOrigin()');
  });

  it('status auto-sync: origin SYSTEM', () => {
    const writes = activityWrites(read('cards/card-status-sync.ts'));
    expect(writes.length).toBeGreaterThanOrEqual(1);
    for (const w of writes) expect(w).toContain("origin: 'SYSTEM'");
  });

  it('importador: origin IMPORT', () => {
    const writes = activityWrites(read('importer/importer.service.ts'));
    expect(writes.length).toBeGreaterThanOrEqual(3);
    for (const w of writes) expect(w).toContain("origin: 'IMPORT'");
  });

  it('aprovacoes: moves gravados com origin APPROVAL', () => {
    const src = read('approvals/approvals.service.ts');
    expect(src).toContain("origin: 'APPROVAL' as const");
  });

  it('undo de aprovacao so considera interferencia humana (origin USER)', () => {
    const src = read('approvals/approvals.service.ts');
    const i = src.indexOf('const humanInterference');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 900)).toContain("origin: 'USER'");
  });
});
