import { z } from 'zod';

import { PhoneNullableSchema } from './phone-schema';

describe('PhoneNullableSchema', () => {
  const Schema = z.object({ name: z.string().optional(), phone: PhoneNullableSchema });

  it('campo ausente continua ausente (PATCH parcial nao apaga o phone)', () => {
    expect(Schema.parse({ name: 'x' }).phone).toBeUndefined();
  });

  it('null e "" limpam o phone', () => {
    expect(Schema.parse({ phone: null }).phone).toBeNull();
    expect(Schema.parse({ phone: '' }).phone).toBeNull();
  });

  it('normaliza formatado pra digitos', () => {
    expect(Schema.parse({ phone: '+55 (28) 99957-0977' }).phone).toBe('5528999570977');
  });

  it('rejeita tamanho invalido', () => {
    expect(() => Schema.parse({ phone: '1234' })).toThrow();
  });
});
