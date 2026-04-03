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

    const betaDate = new Date();
    betaDate.setDate(betaDate.getDate() + 14);
    const dateStr = betaDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    await this.resend.emails.send({
      from: 'Bindr.fun <noreply@beta.bindr.fun>',
      to,
      subject: "You're on the list — Bindr.fun Beta",
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#2E3A3A;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#2E3A3A;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:32px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                  <td style="width:4px;"></td>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                  <td style="width:4px;"></td>
                  <td style="width:14px;height:14px;border:1.5px solid #B1D235;border-radius:3px;"></td>
                </tr>
                <tr><td colspan="5" style="height:4px;"></td></tr>
                <tr>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                  <td style="width:4px;"></td>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                  <td style="width:4px;"></td>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                </tr>
                <tr><td colspan="5" style="height:4px;"></td></tr>
                <tr>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                  <td style="width:4px;"></td>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                  <td style="width:4px;"></td>
                  <td style="width:14px;height:14px;background:#B1D235;border-radius:3px;"></td>
                </tr>
              </table>
            </td>
            <td style="font-size:24px;font-weight:900;color:#F2F4F3;letter-spacing:-1px;">
              Bindr<span style="color:rgba(242,244,243,0.35)">.fun</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Content card -->
        <tr><td style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);border-radius:16px;padding:40px 36px;">

          <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;color:#F2F4F3;letter-spacing:-0.5px;">
            You're in.
          </h1>

          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:rgba(242,244,243,0.55);">
            Thanks for signing up for the Bindr.fun beta. We're building the ultimate toolkit for graded Pokemon card collectors — track your slabs, complete sets, and get live market pricing.
          </p>

          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:rgba(177,210,53,0.08);border:1px solid rgba(177,210,53,0.20);border-radius:12px;padding:20px 24px;width:100%;">
            <tr><td>
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(177,210,53,0.60);">
                Estimated Beta Launch
              </p>
              <p style="margin:0;font-size:22px;font-weight:900;color:#B1D235;letter-spacing:-0.5px;">
                ${dateStr}
              </p>
            </td></tr>
          </table>

          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:rgba(242,244,243,0.55);">
            We'll email you as soon as access is ready. In the meantime, stay tuned — every digital binder is a reflection of a curator's journey.
          </p>

          <p style="margin:0;font-size:14px;color:rgba(242,244,243,0.30);">
            — The Bindr.fun Team
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:12px;color:rgba(242,244,243,0.18);">
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
