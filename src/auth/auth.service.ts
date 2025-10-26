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
      // fallback legacy sin hash (solo si lo permitís explícitamente)
      valid = password === storedHash;
    }

    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // si guardaba texto plano antes, rehash inmediato con bcrypt
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

    // sacamos hash del objeto que devolvemos
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

    // Base pública del frontend.
    // ej dev:  http://localhost:3002
    // ej prod: https://tu-dominio.com
    // le quitamos cualquier slash final para evitar //reset-password
    const frontendBase = (
      process.env.FRONTEND_URL || 'http://localhost:3002'
    ).replace(/\/+$/, '');

    // Si el usuario no existe o está inactivo, respondemos ok igual
    // (para no revelar si el correo es válido)
    if (!user || !user.activo) {
      return { ok: true };
    }

    // token especial SOLO para reset password
    const payload = {
      sub: user.id,
      email: user.email,
      typ: 'password_reset',
    };

    const token = await this.jwtService.signAsync(payload, {
      secret,
      expiresIn,
    });

    // URL que va en el correo.
    // Esta ruta ya la creamos en Next: /reset-password/page.tsx
    // y esa página lee ?token=<...> del query.
    const link = `${frontendBase}/reset-password?token=${encodeURIComponent(
      token,
    )}`;

    // mandar correo
    await this.gmail.sendPasswordReset(
      user.email,
      user.nombre || user.email,
      link,
    );

    // En dev puedes querer ver el link sin abrir inbox
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

    // validamos que sea un token de tipo "password_reset"
    if (decoded?.typ !== 'password_reset' || !decoded?.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    // buscamos el usuario
    const user = await this.userRepo.findOne({
      where: { id: decoded.sub, eliminadoEn: IsNull() },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('Token inválido');
    }

    // validación básica de nueva pass
    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres',
      );
    }

    // hash nueva pass y guardamos
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update({ id: user.id }, { hash });

    return { ok: true, message: 'Contraseña actualizada' };
  }

  // ------------------ Permisos helper ------------------
  private isAdminLike(roles: string[] | undefined): boolean {
    if (!roles) return false;
    return (
      roles.includes('admin') ||
      roles.includes('ADMIN') ||
      roles.includes('supervisor') ||
      roles.includes('SUPERVISOR')
    );
  }

  // ------------------ CHANGE PASSWORD (minimal DTO: userId + newPassword) ------------------
  /**
   * Reglas:
   * - El endpoint recibe solo { userId, newPassword } (ChangePasswordDto)
   * - Si caller tiene rol admin/supervisor -> puede cambiar ANY user
   * - Si caller NO tiene rol admin -> solo puede cambiar su propia contraseña (callerId === userId)
   */
  async changePassword(
    callerUser: { sub?: string; userId?: string; roles?: string[] },
    dto: ChangePasswordDto,
  ) {
    const callerId = callerUser?.sub ?? callerUser?.userId;
    if (!callerId) {
      throw new ForbiddenException('Token inválido');
    }

    // usuario target al que le queremos cambiar la pass
    const target = await this.userRepo.findOne({
      where: { id: dto.userId, eliminadoEn: IsNull() },
    });

    if (!target || !target.activo) {
      throw new NotFoundException(
        'Usuario destino no disponible',
      );
    }

    // permisos:
    // - admin/supervisor puede cambiar la pass de cualquiera
    // - user normal solo la suya propia
    const callerRoles = callerUser.roles ?? [];
    const callerIsAdmin = this.isAdminLike(callerRoles);

    if (!callerIsAdmin && callerId !== target.id) {
      throw new ForbiddenException(
        'No tienes permiso para cambiar la contraseña de otro usuario',
      );
    }

    // validación de newPassword
    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña nueva debe tener al menos 8 caracteres',
      );
    }

    // evitar reusar la misma contraseña anterior
    const prevHash = target.hash ?? '';
    if (prevHash) {
      if (prevHash.startsWith('$2')) {
        const same = await bcrypt.compare(
          dto.newPassword,
          prevHash,
        );
        if (same) {
          throw new BadRequestException(
            'La nueva contraseña no puede ser igual a la anterior',
          );
        }
      } else if (
        process.env.ALLOW_PLAINTEXT_PASSWORDS === 'true' &&
        dto.newPassword === prevHash
      ) {
        throw new BadRequestException(
          'La nueva contraseña no puede ser igual a la anterior',
        );
      }
    }

    // hasheamos y guardamos
    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update({ id: target.id }, { hash: newHash });

    return {
      ok: true,
      message: 'Contraseña actualizada',
      changedUserId: target.id,
      by: callerId,
    };
  }
}
