import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { BetaService } from './beta.service';

@Controller('beta')
export class BetaController {
  constructor(private betaService: BetaService) {}

  @Post('signup')
  async signup(@Body() body: { email?: string }) {
    const email = body?.email?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Please enter a valid email address.');
    }
    return this.betaService.signup(email);
  }
}
