import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '@/config/env';

/**
 * Doc 34: servico central de envio de email. Usa nodemailer com SMTP do
 * env (mail.agenciakharis.com.br:465+SSL em prod, Mailpit em dev).
 *
 * Falha gracioso: se o SMTP nao responde, loga erro e NAO propaga
 * exception — fluxos que dependem de email (convite) nao quebram por
 * causa de servidor SMTP indisponivel; o link copiavel continua sendo
 * fallback.
 */
@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  async onModuleInit() {
    try {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth:
          env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        // 5s timeout — server lento nao deve bloquear request HTTP do
        // usuario que pediu o convite.
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 10_000,
      });
      this.logger.log(
        `SMTP configurado: ${env.SMTP_HOST}:${env.SMTP_PORT} secure=${env.SMTP_SECURE}`,
      );
    } catch (err) {
      this.logger.error(`Falha ao criar transporter SMTP: ${(err as Error).message}`);
      this.transporter = null;
    }
  }

  onModuleDestroy() {
    this.transporter?.close();
  }

  /**
   * Envia email. Retorna true se entregue, false se falhou (sem throw).
   * Subir excecao quebraria fluxos secundarios (convite tem link
   * copiavel como fallback).
   */
  async send(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('SMTP nao configurado — email nao enviado.');
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: env.EMAIL_FROM,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      this.logger.log(`Email enviado pra ${params.to}: "${params.subject}"`);
      return true;
    } catch (err) {
      this.logger.error(`Falha ao enviar email pra ${params.to}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Doc 34: email de convite com link tokenizado pra signup ou aceite.
   * Template HTML simples + plain text fallback. Inclui:
   *   - Nome da Org
   *   - Quem convidou (opcional)
   *   - Botao com link
   *   - Validade do convite
   */
  async sendInvitation(params: {
    to: string;
    inviteUrl: string;
    organizationName: string;
    invitedByName?: string | null;
    roleLabel: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const { to, inviteUrl, organizationName, invitedByName, roleLabel, expiresAt } = params;
    const expiresStr = expiresAt.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const inviter = invitedByName ? `${invitedByName} convidou você` : 'Você foi convidado';

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Convite KTask</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; margin:0; padding:24px;">
  <div style="max-width:480px; margin:0 auto; background:#fff; border-radius:8px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:24px;">
      <div style="width:40px; height:40px; background:#6D28D9; color:#fff; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:18px;">K</div>
      <h1 style="margin:0; font-size:18px; color:#111;">Convite para KTask</h1>
    </div>
    <p style="color:#333; line-height:1.6; margin:0 0 16px;">
      ${escapeHtml(inviter)} para entrar em <strong>${escapeHtml(organizationName)}</strong> como <strong>${escapeHtml(roleLabel)}</strong>.
    </p>
    <p style="color:#555; line-height:1.6; margin:0 0 24px;">
      Clique no botão abaixo para aceitar o convite. Se você ainda não tem conta, vai poder criar uma agora.
    </p>
    <p style="text-align:center; margin:0 0 24px;">
      <a href="${inviteUrl}" style="display:inline-block; background:#6D28D9; color:#fff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600;">Aceitar convite</a>
    </p>
    <p style="color:#888; font-size:12px; line-height:1.5; margin:0 0 8px;">
      Ou copie e cole este link no navegador:<br>
      <a href="${inviteUrl}" style="color:#6D28D9; word-break:break-all;">${inviteUrl}</a>
    </p>
    <p style="color:#888; font-size:12px; margin:24px 0 0;">
      Este convite expira em ${expiresStr}.
    </p>
  </div>
</body>
</html>`.trim();

    const text = [
      `${inviter} para entrar em ${organizationName} como ${roleLabel}.`,
      '',
      'Aceite o convite:',
      inviteUrl,
      '',
      `Este convite expira em ${expiresStr}.`,
    ].join('\n');

    return this.send({
      to,
      subject: `Convite para ${organizationName} no KTask`,
      html,
      text,
    });
  }

  /**
   * Doc 43: email com link tokenizado pra resetar senha. TTL 1h, single-use.
   */
  async sendPasswordReset(params: {
    to: string;
    name: string;
    resetUrl: string;
    expiresAt: Date;
  }): Promise<boolean> {
    const { to, name, resetUrl, expiresAt } = params;
    const expiresStr = expiresAt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Redefinir senha — KTask</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; margin:0; padding:24px;">
  <div style="max-width:480px; margin:0 auto; background:#fff; border-radius:8px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:24px;">
      <div style="width:40px; height:40px; background:#6D28D9; color:#fff; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:18px;">K</div>
      <h1 style="margin:0; font-size:18px; color:#111;">Redefinir sua senha</h1>
    </div>
    <p style="color:#333; line-height:1.6; margin:0 0 16px;">
      Olá, <strong>${escapeHtml(name)}</strong>.
    </p>
    <p style="color:#555; line-height:1.6; margin:0 0 24px;">
      Recebemos um pedido pra redefinir a senha da sua conta KTask. Se foi você, clique no botão abaixo. O link vale até <strong>${expiresStr}</strong>.
    </p>
    <p style="text-align:center; margin:0 0 24px;">
      <a href="${resetUrl}" style="display:inline-block; background:#6D28D9; color:#fff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:600;">Redefinir senha</a>
    </p>
    <p style="color:#888; font-size:12px; line-height:1.5; margin:0 0 8px;">
      Ou copie e cole este link no navegador:<br>
      <a href="${resetUrl}" style="color:#6D28D9; word-break:break-all;">${resetUrl}</a>
    </p>
    <p style="color:#888; font-size:12px; margin:24px 0 0;">
      Se você não pediu, pode ignorar este email — sua senha continua a mesma.
    </p>
  </div>
</body>
</html>`.trim();

    const text = [
      `Olá ${name},`,
      '',
      'Recebemos um pedido pra redefinir a senha da sua conta KTask.',
      'Se foi você, abra o link abaixo (vale até ' + expiresStr + '):',
      '',
      resetUrl,
      '',
      'Se não pediu, ignore este email — sua senha continua a mesma.',
    ].join('\n');

    return this.send({
      to,
      subject: 'Redefinir sua senha do KTask',
      html,
      text,
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
