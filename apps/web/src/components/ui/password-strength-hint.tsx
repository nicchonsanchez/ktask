'use client';

/**
 * Indicador visual de senha pra forms de criacao/troca. NAO bloqueia
 * submit — quem bloqueia eh o schema Zod do form (min 8). Aqui apenas
 * mostra contagem + barra colorida + label fraca/media/forte pro user
 * decidir se quer melhorar.
 *
 * Score: length + 2 (maiuscula) + 2 (digito) + 3 (especial) + 2 (>=12 chars).
 *   - len < min          -> "Muito curta" (vermelho)
 *   - score < 12         -> "Fraca"        (vermelho)
 *   - 12 <= score < 17   -> "Media"        (warning)
 *   - score >= 17        -> "Forte"        (success)
 */
export function PasswordStrengthHint({
  password,
  minLength = 8,
}: {
  password: string;
  minLength?: number;
}) {
  const len = password.length;
  if (len === 0) return null;

  const meetsMin = len >= minLength;

  let score = len;
  if (/[A-Z]/.test(password)) score += 2;
  if (/[0-9]/.test(password)) score += 2;
  if (/[^A-Za-z0-9]/.test(password)) score += 3;
  if (len >= 12) score += 2;

  let label: string;
  let barClass: string;
  let textClass: string;
  let widthPct: number;

  if (!meetsMin) {
    label = 'Muito curta';
    barClass = 'bg-danger';
    textClass = 'text-danger';
    widthPct = Math.max(10, Math.round((len / minLength) * 50));
  } else if (score < 12) {
    label = 'Fraca';
    barClass = 'bg-danger';
    textClass = 'text-danger';
    widthPct = 50;
  } else if (score < 17) {
    label = 'Média';
    barClass = 'bg-warning';
    textClass = 'text-warning';
    widthPct = 75;
  } else {
    label = 'Forte';
    barClass = 'bg-success';
    textClass = 'text-success';
    widthPct = 100;
  }

  const countText = meetsMin ? `${len} caracteres` : `${len} / ${minLength} caracteres`;

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className="bg-bg-muted h-1 w-full overflow-hidden rounded-full">
        <div
          className={`h-full transition-all duration-200 ${barClass}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={meetsMin ? 'text-fg-muted' : 'text-danger'}>{countText}</span>
        <span className={`font-medium ${textClass}`}>{label}</span>
      </div>
    </div>
  );
}
