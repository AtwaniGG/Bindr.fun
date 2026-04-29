import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Guards admin routes by requiring `x-admin-api-key` to match
 * `ADMIN_API_KEY` in env. If `ADMIN_API_KEY` is not set, ALL admin
 * requests are rejected (fail closed) so a missing env var never
 * silently exposes the surface.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || expected.length < 16) {
      this.logger.warn('ADMIN_API_KEY not set or too short — rejecting admin request');
      throw new UnauthorizedException('Admin access not configured');
    }
    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-admin-api-key'];
    if (typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException('Missing x-admin-api-key header');
    }
    if (!constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }
}

/** Constant-time string comparison; prevents timing attacks on the key. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
