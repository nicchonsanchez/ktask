import { configMentionsUser, higherBoardRole, replaceUserInConfig } from './responsibility-config';

/** Doc 55 — troca de usuario no actionConfig das automacoes. */
describe('replaceUserInConfig', () => {
  it('troca SET_LEAD (userId)', () => {
    expect(replaceUserInConfig({ userId: 'a', replaceMode: 'KEEP' }, 'a', 'b')).toEqual({
      userId: 'b',
      replaceMode: 'KEEP',
    });
  });

  it('troca ADD_TEAM (userIds) sem duplicar', () => {
    expect(replaceUserInConfig({ userIds: ['a', 'x', 'b'] }, 'a', 'b')).toEqual({
      userIds: ['b', 'x'],
    });
  });

  it('troca assigneeUserId em itens aninhados', () => {
    const cfg = {
      assigneeMode: 'SPECIFIC_USER',
      assigneeUserId: 'a',
      items: [
        { text: 'Ligar', assigneeUserId: 'a', itemAutomation: { actionConfig: { userId: 'a' } } },
        { text: 'Outra', assigneeUserId: 'z' },
      ],
    };
    expect(replaceUserInConfig(cfg, 'a', 'b')).toEqual({
      assigneeMode: 'SPECIFIC_USER',
      assigneeUserId: 'b',
      items: [
        { text: 'Ligar', assigneeUserId: 'b', itemAutomation: { actionConfig: { userId: 'b' } } },
        { text: 'Outra', assigneeUserId: 'z' },
      ],
    });
  });

  it('nao mexe em texto livre igual ao id', () => {
    const cfg = { body: 'a', template: 'a', userId: 'c' };
    expect(replaceUserInConfig(cfg, 'a', 'b')).toEqual(cfg);
  });

  it('nao altera o objeto original', () => {
    const cfg = { userIds: ['a'] };
    replaceUserInConfig(cfg, 'a', 'b');
    expect(cfg).toEqual({ userIds: ['a'] });
  });
});

describe('configMentionsUser', () => {
  it('detecta em qualquer nivel', () => {
    expect(configMentionsUser({ items: [{ assigneeUserId: 'a' }] }, 'a')).toBe(true);
    expect(configMentionsUser({ userIds: ['a'] }, 'a')).toBe(true);
  });
  it('ignora texto livre e config vazia', () => {
    expect(configMentionsUser({ body: 'a' }, 'a')).toBe(false);
    expect(configMentionsUser({}, 'a')).toBe(false);
    expect(configMentionsUser(null, 'a')).toBe(false);
  });
});

describe('higherBoardRole', () => {
  it('mantem o papel mais alto', () => {
    expect(higherBoardRole('VIEWER', 'EDITOR')).toBe('EDITOR');
    expect(higherBoardRole('ADMIN', 'EDITOR')).toBe('ADMIN');
  });
});
