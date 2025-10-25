import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { Usuario } from '../usuarios/entities/usuario.entity';
import { UsuarioRol } from '../usuarios/entities/usuario-rol.entity';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GmailService } from '../gmail/gmail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly userRepo: Repository<Usuario>,
    @InjectRepository(UsuarioRol) private readonly urRepo: Repository<UsuarioRol>,
    private readonly jwtService: JwtService,
    private readonly gmail: GmailService,
  ) {}

  // ------------------ Helpers / Login-related ------------------
  async validateUser(email: string, password: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();
    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail, eliminadoEn: IsNull() },
    });
    if (!user || !user.activo) throw new UnauthorizedException('Credenciales inválidas');

    const storedHash = user.hash ?? '';
    let valid = false;
    if (storedHash.startsWith('$2')) {
      valid = await bcrypt.compare(password, storedHash);
    } else if (process.env.ALLOW_PLAINTEXT_PASSWORDS === 'true') {
      valid = password === storedHash;
    }
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    // Auto rehash si venía sin bcrypt
    if (!storedHash.startsWith('$2')) {
      const rehash = await bcrypt.hash(password, 10);
      await this.userRepo.update({ id: user.id }, { hash: rehash });
      (user as any).hash = rehash;
    }

    const urs = await this.urRepo.find({ where: { usuarioId: user.id }, relations: ['rol'] });
    const roles = urs.map((x) => x.rol?.nombre).filter(Boolean) as string[];

    const { hash, ...safe } = user as any;
    return { ...safe, roles } as { id: string; email: string; nombre: string; roles: string[] };
  }

  async login(user: { id: string; email: string; nombre: string; roles: string[] }) {
    const payload = { sub: user.id, email: user.email, name: user.nombre, roles: user.roles };
    const access_token = await this.jwtService.signAsync(payload);
    return { access_token };
  }

  // ------------------ Forgot / Reset flows ------------------
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = (dto.email ?? '').trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email, eliminadoEn: IsNull() } });

    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    const secret = process.env.JWT_RESET_SECRET || process.env.JWT_SECRET!;
    const expiresIn = process.env.JWT_RESET_EXPIRES || '30m';

    if (!user || !user.activo) return { ok: true };

    const payload = { sub: user.id, email: user.email, typ: 'password_reset' };
    const token = await this.jwtService.signAsync(payload, { secret, expiresIn });
    const link = `${frontend.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    await this.gmail.sendPasswordReset(user.email, user.nombre || user.email, link);

    const expose = String(process.env.EXPOSE_RESET_LINK_IN_RESPONSE || 'false') === 'true';
    return expose ? { ok: true, resetLink: link, ttl: expiresIn } : { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const secret = process.env.JWT_RESET_SECRET || process.env.JWT_SECRET!;
    let decoded: any;
    try {
      decoded = await this.jwtService.verifyAsync(dto.token, { secret });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (decoded?.typ !== 'password_reset' || !decoded?.sub) throw new UnauthorizedException('Token inválido');

    const user = await this.userRepo.findOne({ where: { id: decoded.sub, eliminadoEn: IsNull() } });
    if (!user || !user.activo) throw new UnauthorizedException('Token inválido');

    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update({ id: user.id }, { hash });

    return { ok: true, message: 'Contraseña actualizada' };
  }

  // ------------------ Permisos helper ------------------
  private isAdminLike(roles: string[] | undefined): boolean {
    if (!roles) return false;
    return roles.includes('admin') || roles.includes('ADMIN') || roles.includes('supervisor') || roles.includes('SUPERVISOR');
  }

  // ------------------ CHANGE PASSWORD (minimal DTO: userId + newPassword) ------------------
  /**
   * Reglas:
   * - El endpoint recibe solo { userId, newPassword } (ChangePasswordDto)
   * - Si caller tiene rol admin/supervisor -> puede cambiar ANY user
   * - Si caller NO tiene rol admin -> solo puede cambiar su propia contraseña (callerId === userId)
   */
  async changePassword(callerUser: { sub?: string; userId?: string; roles?: string[] }, dto: ChangePasswordDto) {
    const callerId = callerUser?.sub ?? callerUser?.userId;
    if (!callerId) throw new ForbiddenException('Token inválido');

    // cargar target
    const target = await this.userRepo.findOne({ where: { id: dto.userId, eliminadoEn: IsNull() } });
    if (!target || !target.activo) throw new NotFoundException('Usuario destino no disponible');

    // permiso: admin puede cambiar cualquiera; no-admin solo su propia cuenta
    const callerRoles = callerUser.roles ?? [];
    const callerIsAdmin = this.isAdminLike(callerRoles);
    if (!callerIsAdmin && callerId !== target.id) {
      throw new ForbiddenException('No tienes permiso para cambiar la contraseña de otro usuario');
    }

    // validación de newPassword
    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('La contraseña nueva debe tener al menos 8 caracteres');
    }

    // evitar misma contraseña que actualmente tenga el target
    const prevHash = target.hash ?? '';
    if (prevHash) {
      if (prevHash.startsWith('$2')) {
        const same = await bcrypt.compare(dto.newPassword, prevHash);
        if (same) throw new BadRequestException('La nueva contraseña no puede ser igual a la anterior');
      } else if (process.env.ALLOW_PLAINTEXT_PASSWORDS === 'true' && dto.newPassword === prevHash) {
        throw new BadRequestException('La nueva contraseña no puede ser igual a la anterior');
      }
    }

    // hashear y guardar
    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update({ id: target.id }, { hash: newHash });

    return { ok: true, message: 'Contraseña actualizada', changedUserId: target.id, by: callerId };
  }
}
