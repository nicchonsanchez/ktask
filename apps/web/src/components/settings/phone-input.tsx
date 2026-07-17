'use client';

import { forwardRef, useMemo } from 'react';

/**
 * Input de telefone com seletor de pais + mascara local.
 *
 * Uso tipico: convite de membro. O usuario ve um campo separado pra pais
 * (default Brasil) e um input pra DDD + numero, com mascara aplicada quando
 * for pais suportado. O componente eh "controlled" — o pai guarda `country`
 * e `local` separados; on-submit chama `toE164(country, local)` pra montar
 * o numero completo (E.164 sem `+`, formato aceito pelo backend).
 *
 * Adicionar novos paises: entrada em `COUNTRIES` com dialCode + limites de
 * digitos + funcao de mascara (ou null pra input livre).
 */

export interface Country {
  code: string; // ISO 3166-1 alpha-2 (BR, US, PT). Aparece no select.
  name: string;
  dialCode: string; // sem '+', ex: '55'
  minDigits: number; // minimo apos DDI (DDD + numero)
  maxDigits: number;
  mask?: (digits: string) => string; // formatador local (opcional)
  placeholder: string;
}

/** Aplica mascara BR: (XX) XXXX-XXXX ou (XX) XXXXX-XXXX. */
function maskBR(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const COUNTRIES: Country[] = [
  {
    code: 'BR',
    name: 'Brasil',
    dialCode: '55',
    minDigits: 10,
    maxDigits: 11,
    mask: maskBR,
    placeholder: '(11) 99999-9999',
  },
  {
    code: 'US',
    name: 'Estados Unidos',
    dialCode: '1',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '2125551234',
  },
  {
    code: 'PT',
    name: 'Portugal',
    dialCode: '351',
    minDigits: 9,
    maxDigits: 9,
    placeholder: '912345678',
  },
  {
    code: 'AR',
    name: 'Argentina',
    dialCode: '54',
    minDigits: 10,
    maxDigits: 11,
    placeholder: '1123456789',
  },
  {
    code: 'ES',
    name: 'Espanha',
    dialCode: '34',
    minDigits: 9,
    maxDigits: 9,
    placeholder: '612345678',
  },
  {
    code: 'MX',
    name: 'México',
    dialCode: '52',
    minDigits: 10,
    maxDigits: 10,
    placeholder: '5512345678',
  },
];

export function getCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]!;
}

/** Junta DDI + digitos locais e retorna E.164 sem '+'. */
export function toE164(countryCode: string, local: string): string {
  const country = getCountry(countryCode);
  return country.dialCode + local.replace(/\D/g, '');
}

/** Extrai apenas os digitos locais, respeitando o limite max do pais. */
export function sanitizeLocal(countryCode: string, raw: string): string {
  const country = getCountry(countryCode);
  return raw.replace(/\D/g, '').slice(0, country.maxDigits);
}

interface PhoneInputProps {
  country: string;
  onCountryChange: (code: string) => void;
  value: string; // digitos locais (sem mascara)
  onChange: (digits: string) => void;
  error?: boolean;
  id?: string;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { country, onCountryChange, value, onChange, error, id },
  ref,
) {
  const c = useMemo(() => getCountry(country), [country]);
  const display = c.mask ? c.mask(value) : value;

  return (
    <div
      className={
        'border-border bg-bg flex h-9 items-center rounded-md border ' +
        (error ? 'border-danger' : '')
      }
    >
      <select
        value={country}
        onChange={(e) => onCountryChange(e.target.value)}
        aria-label="País"
        className="text-fg border-border/70 bg-bg hover:bg-bg-muted h-full appearance-none rounded-l-md border-r px-1.5 text-sm focus:outline-none"
        // width fixo pra estabilidade visual — emoji + ddi eh compacto
        style={{ minWidth: 78 }}
      >
        {COUNTRIES.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.code} +{opt.dialCode}
          </option>
        ))}
      </select>
      <input
        ref={ref}
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        value={display}
        onChange={(e) => onChange(sanitizeLocal(country, e.target.value))}
        placeholder={c.placeholder}
        className="text-fg h-full flex-1 rounded-r-md bg-transparent px-2 text-sm focus:outline-none"
      />
    </div>
  );
});
