import {
  Controller,
  Post,
  UseGuards,
  Request,
  Body,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { Public } from './decorators/public.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // login público (passport local)
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  // perfil (protegido)
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async profile(@Request() req: any) {
    return req.user;
  }

  // forgot/reset públicos
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

  // cambio de password (protegido con JWT)
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async change(@Request() req: any, @Body() dto: ChangePasswordDto) {
    // req.user viene de JwtStrategy -> { sub, email, roles, ... }
    return this.authService.changePassword(req.user, dto);
  }
}
