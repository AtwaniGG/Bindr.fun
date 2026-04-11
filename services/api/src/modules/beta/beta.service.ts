import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Resend } from 'resend';

@Injectable()
export class BetaService {
  private readonly logger = new Logger(BetaService.name);
  private readonly resend: Resend | null;

  constructor(private prisma: PrismaService) {
    const key = process.env.RESEND_API_KEY;
    this.resend = key ? new Resend(key) : null;
    if (!key) this.logger.warn('RESEND_API_KEY not set — emails will be skipped');
  }

  async signup(email: string): Promise<{ success: boolean; message: string }> {
    const normalized = email.trim().toLowerCase();

    try {
      await this.prisma.betaSignup.create({ data: { email: normalized } });
      this.logger.log(`Beta signup: ${normalized}`);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return { success: true, message: "You're already on the list!" };
      }
      throw err;
    }

    // Send welcome email (fire-and-forget)
    this.sendWelcomeEmail(normalized).catch((err) =>
      this.logger.error(`Failed to send email to ${normalized}: ${err.message}`),
    );

    return { success: true, message: "You're on the list!" };
  }

  private async sendWelcomeEmail(to: string): Promise<void> {
    if (!this.resend) return;

    await this.resend.emails.send({
      from: 'Bindr.fun <noreply@beta.bindr.fun>',
      to,
      subject: "You're on the list — Bindr.fun Beta",
      html: `
<!DOCTYPE html>
<html style="background-color:#2E3A3A;">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><style>:root{color-scheme:light only;}body,html{background-color:#2E3A3A !important;}</style></head>
<body style="margin:0;padding:0;background-color:#2E3A3A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;" bgcolor="#2E3A3A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#2E3A3A;" bgcolor="#2E3A3A">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://bindr.fun/logo.png" alt="Bindr.fun" width="280" style="display:block;height:auto;" />
        </td></tr>

        <!-- Content card -->
        <tr><td style="background-color:#354141;border:1px solid #3D4A4A;border-radius:16px;padding:40px 36px;" bgcolor="#354141">

          <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;color:#F2F4F3;letter-spacing:-0.5px;">
            You're in.
          </h1>

          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#8A9191;">
            Thanks for signing up for the Bindr.fun beta. We're building the ultimate toolkit for graded Pokemon card collectors — track your slabs, complete sets, and get live market pricing.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;background-color:#333F2A;border:1px solid #4A5A2A;border-radius:12px;padding:20px 24px;width:100%;" bgcolor="#333F2A">
            <tr><td>
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7A9A24;">
                Beta Launch
              </p>
              <p style="margin:0;font-size:22px;font-weight:900;color:#B1D235;letter-spacing:-0.5px;">
                Coming Soon
              </p>
            </td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#8A9191;">
            We'll email you as soon as access is ready. In the meantime, stay tuned — every digital binder is a reflection of a curator's journey.
          </p>

          <p style="margin:0;font-size:14px;color:#556060;">
            — The Bindr.fun Team
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:#445050;">
            &copy; 2026 Bindr.fun &middot; Collect. Connect. Complete.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    this.logger.log(`Welcome email sent to ${to}`);
  }
}
