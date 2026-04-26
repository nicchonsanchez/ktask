import { ImageResponse } from 'next/og';

/**
 * OG image dinâmica do KTask.
 *
 * Renderizada como PNG 1200×630 — formato padrão do Open Graph e do
 * Twitter summary_large_image. WhatsApp / LinkedIn / Discord / Slack /
 * Telegram / Facebook usam este preview ao desumbnail um link.
 *
 * Tudo aqui é JSX-flex (subset de CSS suportado por @vercel/og).
 * Reaproveita as cores do design system: violet primário + teal accent.
 */

export const alt = 'KTask — Sistema de gestão de tarefas e fluxos da Kharis';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '80px',
        background: 'linear-gradient(135deg, #6D28D9 0%, #4C1D95 60%, #1E1B4B 100%)',
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      {/* Top: brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div
          style={{
            width: 88,
            height: 88,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 20,
            background: '#FFFFFF',
            color: '#6D28D9',
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: '-0.05em',
          }}
        >
          K
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            opacity: 0.85,
          }}
        >
          KTask
        </div>
      </div>

      {/* Middle: tagline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div
          style={{
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            maxWidth: 920,
          }}
        >
          Gestão de tarefas e fluxos
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 400,
            opacity: 0.8,
            lineHeight: 1.3,
            maxWidth: 920,
          }}
        >
          Kanban, automações, cronômetro e colaboração em tempo real.
        </div>
      </div>

      {/* Bottom: brand stripe */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 24,
            opacity: 0.7,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: '#2EE8B8',
            }}
          />
          <span>Kharis · ktask.agenciakharis.com.br</span>
        </div>
        <div style={{ fontSize: 22, opacity: 0.55 }}>Sistema interno</div>
      </div>
    </div>,
    { ...size },
  );
}
