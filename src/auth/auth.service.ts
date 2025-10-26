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
    @InjectRepository(Usuario)
    private readonly userRepo: Repository<Usuario>,
    @InjectRepository(UsuarioRol)
    private readonly urRepo: Repository<UsuarioRol>,
    private readonly jwtService: JwtService,
    private readonly gmail: GmailService,
  ) {}

  // ------------------ Helpers / Login-related ------------------
  async validateUser(email: string, password: string) {
    const normalizedEmail = (email ?? '').trim().toLowerCase();

    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail, eliminadoEn: IsNull() },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const storedHash = user.hash ?? '';
    let valid = false;

    if (storedHash.startsWith('$2')) {
      // hash bcrypt normal
      valid = await bcrypt.compare(password, storedHash);
    } else if (process.env.ALLOW_PLAINTEXT_PASSWORDS === 'true') {
      // modo legacy (solo si lo permitiste explícitamente)
      valid = password === storedHash;
    }

    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Si la pass estaba en texto plano, la migramos a bcrypt de una vez
    if (!storedHash.startsWith('$2')) {
      const rehash = await bcrypt.hash(password, 10);
      await this.userRepo.update({ id: user.id }, { hash: rehash });
      (user as any).hash = rehash;
    }

    // roles del usuario
    const urs = await this.urRepo.find({
      where: { usuarioId: user.id },
      relations: ['rol'],
    });
    const roles = urs
      .map((x) => x.rol?.nombre)
      .filter(Boolean) as string[];

    // limpiamos hash antes de devolver
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hash, ...safe } = user as any;

    return {
      ...safe,
      roles,
    } as {
      id: string;
      email: string;
      nombre: string;
      roles: string[];
    };
  }

  async login(user: {
    id: string;
    email: string;
    nombre: string;
    roles: string[];
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.nombre,
      roles: user.roles,
    };

    const access_token = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    });

    return { access_token };
  }

  // ------------------ Forgot / Reset flows ------------------
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = (dto.email ?? '').trim().toLowerCase();

    const user = await this.userRepo.findOne({
      where: { email, eliminadoEn: IsNull() },
    });

    const secret =
      process.env.JWT_RESET_SECRET || process.env.JWT_SECRET!;
    const expiresIn = process.env.JWT_RESET_EXPIRES || '30m';

    // Base pública del frontend
    const frontendBase = (
      process.env.FRONTEND_URL || 'http://localhost:3002'
    ).replace(/\/+$/, '');

    // NO filtramos por "no existe". Decimos ok igual para no filtrar usuarios
    if (!user || !user.activo) {
      return { ok: true };
    }

    // token corto solo para reset password
    const payload = {
      sub: user.id,
      email: user.email,
      typ: 'password_reset',
    };

    const token = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
    });

    const link = `${frontendBase}/login/reset-password?token=${encodeURIComponent(
      token,
    )}`;

    await this.gmail.sendPasswordReset(
      user.email,
      user.nombre || user.email,
      link,
    );

    const expose =
      String(
        process.env.EXPOSE_RESET_LINK_IN_RESPONSE || 'false',
      ) === 'true';

    return expose
      ? { ok: true, resetLink: link, ttl: expiresIn }
      : { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const secret =
      process.env.JWT_RESET_SECRET || process.env.JWT_SECRET!;

    let decoded: any;
    try {
      decoded = await this.jwtService.verifyAsync(dto.token, {
        secret,
      });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    if (decoded?.typ !== 'password_reset' || !decoded?.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.userRepo.findOne({
      where: { id: decoded.sub, eliminadoEn: IsNull() },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('Token inválido');
    }

    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update({ id: user.id }, { hash });

    return { ok: true, message: 'Contraseña actualizada' };
  }

  // ------------------ Permisos helper ------------------
  /**
   * Devuelve true si el caller es considerado "admin real"
   * para efectos de poder cambiar contraseñas de OTROS usuarios.
   *
   * Reglas que alineamos con tu app:
   * - Debe tener el rol exactamente "ADMINISTRADOR"
   *   (tu front lo llama así, tu listado lo pinta así).
   *
   * Si quieres que SUPERVISOR también pueda,
   * descomenta la parte marcada.
   */
  private isAdminLike(roles: string[] | undefined): boolean {
    if (!roles) return false;

    const upper = roles.map((r) => (r ?? '').toUpperCase().trim());

    if (upper.includes('ADMINISTRADOR')) {
      return true;
    }

    // 👉 si quieres que un SUPERVISOR también pueda cambiar pass de cualquiera,
    //    descomenta esto:
    //
    // if (upper.includes('SUPERVISOR')) {
    //   return true;
    // }

    return false;
  }

  // ------------------ CHANGE PASSWORD ------------------
  /**
   * Reglas:
   * - Recibe { userId, newPassword }
   * - Si caller tiene rol ADMINISTRADOR -> puede cambiar la pass de cualquiera
   * - Si NO, solo puede cambiar su propia pass (callerId === userId)
   *
   * Si viola eso -> ForbiddenException (403)
   */
  async changePassword(
    callerUser: { sub?: string; userId?: string; roles?: string[] },
    dto: ChangePasswordDto,
  ) {
    const callerId = callerUser?.sub ?? callerUser?.userId;
    if (!callerId) {
      throw new ForbiddenException('Token inválido');
    }

    const { userId, newPassword } = dto;

    // buscar target user
    const target = await this.userRepo.findOne({
      where: { id: userId, eliminadoEn: IsNull() },
    });

    if (!target || !target.activo) {
      throw new NotFoundException('Usuario destino no disponible');
    }

    // quién tiene permiso:
    const callerRoles = callerUser.roles ?? [];
    const callerIsAdmin = this.isAdminLike(callerRoles);

    const isSelf = callerId === target.id;

    if (!callerIsAdmin && !isSelf) {
      // este mensaje aparece en tu modal, keep it
      throw new ForbiddenException(
        'No tienes permiso para cambiar la contraseña de este usuario.',
      );
    }

    // validación básica de la nueva pass
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña nueva debe tener al menos 8 caracteres',
      );
    }

    // opcional: evitar reutilizar la anterior
    const prevHash = target.hash ?? '';
    if (prevHash) {
      if (prevHash.startsWith('$2')) {
        const same = await bcrypt.compare(newPassword, prevHash);
        if (same) {
          throw new BadRequestException(
            'La nueva contraseña no puede ser igual a la anterior',
          );
        }
      } else if (
        process.env.ALLOW_PLAINTEXT_PASSWORDS === 'true' &&
        newPassword === prevHash
      ) {
        throw new BadRequestException(
          'La nueva contraseña no puede ser igual a la anterior',
        );
      }
    }

    // hash nueva pass y guardar
    const newHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.update({ id: target.id }, { hash: newHash });

    return {
      ok: true,
      message: 'Contraseña actualizada',
      changedUserId: target.id,
      by: callerId,
    };
  }
}
