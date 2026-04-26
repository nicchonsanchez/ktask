import { renderTemplate } from './automations.engine';

describe('renderTemplate (motor de template das actions de automacao)', () => {
  it('substitui placeholder simples', () => {
    expect(renderTemplate('Card: {{card.title}}', { 'card.title': 'Bug X' })).toBe('Card: Bug X');
  });

  it('substitui multiplos placeholders na mesma string', () => {
    const out = renderTemplate('{{actor.name}} comentou em "{{card.title}}"', {
      'actor.name': 'Nicchon',
      'card.title': 'Refactor',
    });
    expect(out).toBe('Nicchon comentou em "Refactor"');
  });

  it('aceita whitespace dentro das chaves', () => {
    expect(renderTemplate('Hello, {{ user.name }}!', { 'user.name': 'Mundo' })).toBe(
      'Hello, Mundo!',
    );
  });

  it('placeholder sem var no mapa vira string vazia', () => {
    // Garantia importante: nao quebra automacao se template referenciar
    // variavel inexistente. Reportamos vazio em vez de jogar erro.
    expect(renderTemplate('{{missing}} aqui', {})).toBe(' aqui');
  });

  it('preserva texto sem placeholders intacto', () => {
    expect(renderTemplate('texto puro 100%', {})).toBe('texto puro 100%');
  });

  it('repete substituicao se a mesma var aparece mais de uma vez', () => {
    expect(renderTemplate('{{x}}/{{x}}/{{x}}', { x: 'a' })).toBe('a/a/a');
  });

  it('NAO suporta nested objects (apenas paths planos no mapa)', () => {
    // Por design o motor recebe vars achatadas tipo "card.title" -> string,
    // nao um objeto aninhado. Isso testa que a chave plana funciona.
    const vars = { 'card.title': 'X', 'card.list.name': 'Y', 'card.board.name': 'Z' };
    expect(renderTemplate('{{card.title}} > {{card.list.name}} > {{card.board.name}}', vars)).toBe(
      'X > Y > Z',
    );
  });

  it('placeholders mal-formados ficam intactos no output', () => {
    // O regex exige chaves duplas + 1+ caracteres de chave dentro.
    // {single} (1 chave) e {{ }} (vazio) nao casam → ficam literais.
    expect(renderTemplate('{single} ou {{ }}', {})).toBe('{single} ou {{ }}');
  });
});
