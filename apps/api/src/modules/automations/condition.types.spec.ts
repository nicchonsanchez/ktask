import {
  evaluateConditions,
  type AutomationCondition,
  type CardForConditions,
} from './condition.types';

function card(overrides: Partial<CardForConditions> = {}): CardForConditions {
  return {
    priority: 'MEDIUM',
    leadId: null,
    dueDate: null,
    labels: [],
    ...overrides,
  };
}

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

describe('evaluateConditions', () => {
  it('null/empty conditions -> sempre passa', () => {
    expect(evaluateConditions(card(), null)).toBe(true);
    expect(evaluateConditions(card(), [])).toBe(true);
  });

  describe('tags', () => {
    const c = card({ labels: [{ labelId: 'l1' }, { labelId: 'l2' }] });

    it('containsAny: true se tem pelo menos uma', () => {
      const cond: AutomationCondition = {
        field: 'tags',
        operator: 'containsAny',
        value: ['l1', 'l9'],
      };
      expect(evaluateConditions(c, [cond])).toBe(true);
    });

    it('containsAny: false se nao tem nenhuma', () => {
      const cond: AutomationCondition = {
        field: 'tags',
        operator: 'containsAny',
        value: ['l9', 'l8'],
      };
      expect(evaluateConditions(c, [cond])).toBe(false);
    });

    it('notContainsAny: true se nao tem nenhuma', () => {
      const cond: AutomationCondition = {
        field: 'tags',
        operator: 'notContainsAny',
        value: ['l9', 'l8'],
      };
      expect(evaluateConditions(c, [cond])).toBe(true);
    });

    it('containsAll: true so se tem todas', () => {
      const ok: AutomationCondition = {
        field: 'tags',
        operator: 'containsAll',
        value: ['l1', 'l2'],
      };
      const fail: AutomationCondition = {
        field: 'tags',
        operator: 'containsAll',
        value: ['l1', 'l9'],
      };
      expect(evaluateConditions(c, [ok])).toBe(true);
      expect(evaluateConditions(c, [fail])).toBe(false);
    });
  });

  describe('priority', () => {
    it('is: matches exact', () => {
      const cond: AutomationCondition = {
        field: 'priority',
        operator: 'is',
        value: ['HIGH'],
      };
      expect(evaluateConditions(card({ priority: 'HIGH' }), [cond])).toBe(true);
      expect(evaluateConditions(card({ priority: 'MEDIUM' }), [cond])).toBe(false);
    });

    it('isAny: matches any in list', () => {
      const cond: AutomationCondition = {
        field: 'priority',
        operator: 'isAny',
        value: ['HIGH', 'URGENT'],
      };
      expect(evaluateConditions(card({ priority: 'URGENT' }), [cond])).toBe(true);
      expect(evaluateConditions(card({ priority: 'LOW' }), [cond])).toBe(false);
    });

    it('isNotAny: matches none in list', () => {
      const cond: AutomationCondition = {
        field: 'priority',
        operator: 'isNotAny',
        value: ['HIGH', 'URGENT'],
      };
      expect(evaluateConditions(card({ priority: 'LOW' }), [cond])).toBe(true);
      expect(evaluateConditions(card({ priority: 'HIGH' }), [cond])).toBe(false);
    });
  });

  describe('lead', () => {
    it('isSet: true so se tem lead', () => {
      const cond: AutomationCondition = { field: 'lead', operator: 'isSet' };
      expect(evaluateConditions(card({ leadId: 'u1' }), [cond])).toBe(true);
      expect(evaluateConditions(card({ leadId: null }), [cond])).toBe(false);
    });

    it('isNotSet: true so se nao tem lead', () => {
      const cond: AutomationCondition = { field: 'lead', operator: 'isNotSet' };
      expect(evaluateConditions(card({ leadId: null }), [cond])).toBe(true);
      expect(evaluateConditions(card({ leadId: 'u1' }), [cond])).toBe(false);
    });

    it('isAny: matches if lead in list', () => {
      const cond: AutomationCondition = {
        field: 'lead',
        operator: 'isAny',
        value: ['u1', 'u2'],
      };
      expect(evaluateConditions(card({ leadId: 'u1' }), [cond])).toBe(true);
      expect(evaluateConditions(card({ leadId: 'u9' }), [cond])).toBe(false);
      expect(evaluateConditions(card({ leadId: null }), [cond])).toBe(false);
    });
  });

  describe('dueDate', () => {
    it('hasDueDate / noDueDate', () => {
      const has: AutomationCondition = { field: 'dueDate', operator: 'hasDueDate' };
      const no: AutomationCondition = { field: 'dueDate', operator: 'noDueDate' };
      expect(evaluateConditions(card({ dueDate: new Date() }), [has])).toBe(true);
      expect(evaluateConditions(card({ dueDate: null }), [no])).toBe(true);
      expect(evaluateConditions(card({ dueDate: null }), [has])).toBe(false);
    });

    it('overdue: card vencido ontem retorna true', () => {
      const cond: AutomationCondition = { field: 'dueDate', operator: 'overdue' };
      expect(evaluateConditions(card({ dueDate: yesterday() }), [cond])).toBe(true);
      expect(evaluateConditions(card({ dueDate: tomorrow() }), [cond])).toBe(false);
    });

    it('dueWithinDays: card que vence amanha passa pra dueWithinDays=2', () => {
      const cond: AutomationCondition = {
        field: 'dueDate',
        operator: 'dueWithinDays',
        value: 2,
      };
      expect(evaluateConditions(card({ dueDate: tomorrow() }), [cond])).toBe(true);
    });
  });

  describe('AND combinacao', () => {
    it('todas precisam passar', () => {
      const c = card({ priority: 'HIGH', labels: [{ labelId: 'l1' }] });
      const conds: AutomationCondition[] = [
        { field: 'priority', operator: 'is', value: ['HIGH'] },
        { field: 'tags', operator: 'containsAny', value: ['l1'] },
      ];
      expect(evaluateConditions(c, conds)).toBe(true);
    });

    it('uma falha derruba o conjunto', () => {
      const c = card({ priority: 'HIGH', labels: [{ labelId: 'l1' }] });
      const conds: AutomationCondition[] = [
        { field: 'priority', operator: 'is', value: ['HIGH'] },
        { field: 'tags', operator: 'containsAny', value: ['l9'] }, // nao tem
      ];
      expect(evaluateConditions(c, conds)).toBe(false);
    });
  });
});
