// src/auth/auth.controller.ts
import { Controller, Post, UseGuards, Request, Get, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from './decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Pública: login
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  // Protegida por guard global
  @Get('profile')
  async profile(@Request() req: any) {
    return req.user;
  }

  // Públicas: forgot/reset
  @Public()
  @Post('forgot-password')
  async forgot(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  async reset(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // Protegida por guard global
  @Post('change-password')
  async change(@Request() req: any, @Body() dto: ChangePasswordDto) {
    const userId = req.user?.sub ?? req.user?.userId; // compatible con tu JwtStrategy
    return this.authService.changePassword(userId, dto);
  }
}
