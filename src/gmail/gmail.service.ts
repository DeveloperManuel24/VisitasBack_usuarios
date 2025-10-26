import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 465), // 465 SSL, 587 STARTTLS
      secure: String(process.env.SMTP_SECURE ?? 'true') === 'true', // true => 465
      auth: {
        user: process.env.GMAIL_USER,     // cuenta real / workspace
        pass: process.env.GMAIL_APP_PASS, // app password con 2FA
      },
    });
  }

  async sendPasswordReset(to: string, name: string, link: string) {
    const from =
      process.env.MAIL_FROM ||
      `SkyNet Visitas <${process.env.GMAIL_USER}>`;

    const subject = 'Restablecer contraseña - SkyNet Visitas';

    const html = this.template(name, link);

    const text =
`Hola ${name},

Recibimos una solicitud para restablecer tu contraseña.
Enlace (vigencia limitada): ${link}

Si no fuiste tú, ignora este mensaje.
`;

    const info = await this.transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    this.logger.log(`Reset mail sent -> ${info.messageId}`);
  }

  private template(name: string, link: string) {
    return `
      <div style="background:#f6f7fb;padding:24px;font-family:Arial,sans-serif;color:#111;">
        <table width="100%" style="max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.06)">
          <tr>
            <td style="padding:24px;text-align:center;font-weight:700;font-size:20px">
              SkyNet Visitas
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px"><hr style="border:none;border-top:1px solid #eef2f7"></td>
          </tr>

          <tr>
            <td style="padding:24px">
              <p style="font-size:16px;margin:0 0 12px">
                Hola <strong>${this.escape(name || 'usuario')}</strong>,
              </p>

              <p style="font-size:14px;color:#374151;margin:0 0 16px">
                Usa el siguiente enlace para <strong>restablecer tu contraseña</strong> (tiempo limitado):
              </p>

              <div style="text-align:center;margin:24px 0">
                <a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1d4ed8;color:#fff;font-weight:700;text-decoration:none">
                  Restablecer contraseña
                </a>
              </div>

              <p style="font-size:12px;color:#6b7280;margin:0 0 8px">
                Si el botón no funciona, copia este enlace:
              </p>

              <p style="word-break:break-all;font-size:12px">
                <a href="${link}" style="color:#1d4ed8;text-decoration:none">
                  ${link}
                </a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#f9fafb;padding:16px;text-align:center;color:#6b7280;font-size:12px">
              © ${new Date().getFullYear()} SkyNet Visitas
            </td>
          </tr>
        </table>
      </div>`;
  }

  private escape(s: string) {
    return s.replace(/[&<>"']/g, (m) =>
      (
        {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        } as Record<string, string>
      )[m]!,
    );
  }
}
