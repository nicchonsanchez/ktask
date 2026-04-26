import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * OG image dinâmica do KTask.
 *
 * Renderizada como PNG 1200×630 — formato padrão do Open Graph e do
 * Twitter summary_large_image. WhatsApp / LinkedIn / Discord / Slack /
 * Telegram / Facebook usam este preview ao desumbnail um link.
 *
 * Reaproveita a identidade visual real do KTask: lockup oficial
 * (`/brand/lockup.png`) sobre fundo violet escuro da marca, com tagline
 * em bold + assinatura Kharis no rodapé.
 */

export const alt = 'KTask — Sistema de gestão de tarefas e fluxos da Kharis';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  // Lê o lockup do disco no momento da geração e embute como data URL.
  // Funciona em Node runtime (default do App Router); evita dependência
  // de URL absoluta (que pode não estar configurada em todos ambientes).
  const lockupBuffer = await readFile(path.join(process.cwd(), 'public/brand/lockup.png'));
  const lockupSrc = `data:image/png;base64,${lockupBuffer.toString('base64')}`;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 80px',
        background: '#1E1B4B', // tom violet-950 do design system, casa com o lockup
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Acento decorativo: bolha teal grande borrada no canto */}
      <div
        style={{
          position: 'absolute',
          top: -160,
          right: -160,
          width: 480,
          height: 480,
          borderRadius: 999,
          background: '#2EE8B8',
          opacity: 0.12,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -200,
          left: -100,
          width: 460,
          height: 460,
          borderRadius: 999,
          background: '#7C3AED',
          opacity: 0.18,
        }}
      />

      {/* Lockup oficial centralizado */}
      <img
        src={lockupSrc}
        alt="KTask"
        width={760}
        style={{ marginBottom: 40, objectFit: 'contain' }}
      />

      {/* Tagline */}
      <div
        style={{
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          textAlign: 'center',
          maxWidth: 980,
          color: '#FFFFFF',
        }}
      >
        Gestão de tarefas e fluxos operacionais
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 400,
          opacity: 0.7,
          textAlign: 'center',
          marginTop: 18,
          maxWidth: 920,
        }}
      >
        Kanban, automações, cronômetro e colaboração em tempo real.
      </div>

      {/* Rodapé com assinatura */}
      <div
        style={{
          position: 'absolute',
          bottom: 36,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontSize: 20,
          opacity: 0.55,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: '#2EE8B8',
          }}
        />
        <span>Sistema interno · Kharis</span>
      </div>
    </div>,
    { ...size },
  );
}
