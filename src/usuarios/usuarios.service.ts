import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsNull,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Usuario } from './entities/usuario.entity';
import { UsuarioRol } from './entities/usuario-rol.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { QueryUsuarioDto } from './dto/query-usuario.dto';
import { genId } from 'src/common/ids';
import { RolService } from 'src/rol/rol.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly userRepo: Repository<Usuario>,
    @InjectRepository(UsuarioRol)
    private readonly urRepo: Repository<UsuarioRol>,
    private readonly rolService: RolService,
  ) {}

  // ---------- Helpers ----------

  private normalizeEmail(v?: string) {
    return (v ?? '').trim().toLowerCase();
  }

  private normalizeSupervisorId(
    v: string | null | undefined,
  ): string | null {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s.length ? s : null; // "" -> null
  }

  private baseQuery(
    includeDeleted = false,
    qb?: SelectQueryBuilder<Usuario>,
  ) {
    const query =
      qb ??
      this.userRepo
        .createQueryBuilder('u')
        .leftJoinAndSelect('u.supervisor', 'sup')
        .leftJoinAndSelect('u.usuariosRoles', 'ur')
        .leftJoinAndSelect('ur.rol', 'rol');

    if (!includeDeleted) {
      query.where('u.eliminadoEn IS NULL');
    }
    return query;
  }

  // ---------- Create ----------

  async create(
    rawDto: CreateUsuarioDto | null | undefined,
  ): Promise<Usuario> {
    if (!rawDto) {
      throw new BadRequestException('Body requerido');
    }

    const dto: CreateUsuarioDto = rawDto as any;

    // ===== email obligatorio y único =====
    const email = this.normalizeEmail(dto.email);
    if (!email) {
      throw new BadRequestException('Email requerido');
    }

    const exists = await this.userRepo.findOne({
      where: { email, eliminadoEn: IsNull() },
      withDeleted: false,
    });
    if (exists) {
      throw new BadRequestException('El email ya está registrado');
    }

    // ===== password/hash obligatorio =====
    let passwordHash = dto.hash;
    if (!passwordHash || !String(passwordHash).trim()) {
      throw new BadRequestException('Contraseña requerida');
    }
    if (!passwordHash.startsWith('$2')) {
      passwordHash = await bcrypt.hash(passwordHash, 10);
    }

    // ===== supervisorId (relajado) =====
    let finalSupervisorId = this.normalizeSupervisorId(
      dto.supervisorId ?? null,
    );

    if (finalSupervisorId) {
      // buscamos incluso soft-deleted para no romper creación
      const sup = await this.userRepo.findOne({
        where: { id: finalSupervisorId },
        withDeleted: true,
      });

      if (!sup) {
        // si no existe en absoluto, en vez de tirar error lo dejamos null
        finalSupervisorId = null;
      }
    }

    // ===== crear entidad base =====
    const entity = this.userRepo.create({
      id: genId(),
      nombre: dto.nombre ?? '',
      email,
      hash: passwordHash,
      activo:
        typeof dto.activo === 'boolean' ? dto.activo : true,
      supervisorId: finalSupervisorId,
      fotoBase64:
        dto.fotoBase64 !== undefined && dto.fotoBase64 !== null
          ? dto.fotoBase64
          : null,
    });

    // ===== guardar user base =====
    let saved: Usuario;
    try {
      saved = await this.userRepo.save(entity);
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new BadRequestException(
          'El email ya está en uso por un usuario activo.',
        );
      }
      throw e;
    }

    // ===== roles iniciales =====
    if (Array.isArray(dto.roles) && dto.roles.length) {
      await this.setUserRoles(saved.id, dto.roles);
    }

    // ===== devolver usuario con joins =====
    return this.findOne(saved.id);
  }

  // ---------- Read/List ----------

  async findAll(query: QueryUsuarioDto) {
    const {
      q,
      page = 1,
      limit = 10,
      activo,
      supervisorId,
      rolNombre,
    } = query;

    // soporta ?incluirEliminados=true aunque tu DTO aún no lo tenga
    const incluirEliminados = Boolean(
      (query as any)?.incluirEliminados,
    );

    let qb = this.baseQuery(incluirEliminados);

    if (q?.trim()) {
      qb = qb.andWhere(
        '(u.nombre ILIKE :q OR u.email ILIKE :q)',
        { q: `%${q.trim()}%` },
      );
    }

    if (typeof activo === 'boolean') {
      qb = qb.andWhere('u.activo = :activo', { activo });
    }

    if (supervisorId?.trim()) {
      qb = qb.andWhere('u.supervisorId = :sid', {
        sid: supervisorId.trim(),
      });
    }

    if (rolNombre?.trim()) {
      qb = qb.andWhere('rol.nombre ILIKE :rn', {
        rn: `%${rolNombre.trim()}%`,
      });
    }

    qb = qb
      .orderBy('u.creadoEn', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<Usuario> {
    const qb = this.baseQuery(false).andWhere('u.id = :id', {
      id,
    });
    const found = await qb.getOne();
    if (!found)
      throw new NotFoundException('Usuario no encontrado');
    return found;
  }

  // ---------- Update ----------

  async update(
    id: string,
    dto?: UpdateUsuarioDto | null,
  ): Promise<Usuario> {
    const safeDto: UpdateUsuarioDto = dto ?? {};

    // buscar usuario vivo
    const user = await this.userRepo.findOne({
      where: { id, eliminadoEn: IsNull() },
    });
    if (!user)
      throw new NotFoundException('Usuario no encontrado');

    // EMAIL (único entre activos) -> solo si vino en el body
    let newEmail: string | undefined = undefined;
    if (safeDto.email !== undefined) {
      const normalized = this.normalizeEmail(
        safeDto.email,
      );

      if (!normalized) {
        throw new BadRequestException(
          'Email no puede ser vacío',
        );
      }

      newEmail = normalized;

      if (newEmail !== user.email) {
        const emailTaken = await this.userRepo.findOne({
          where: {
            email: newEmail,
            id: Not(id),
            eliminadoEn: IsNull(),
          },
        });
        if (emailTaken) {
          throw new BadRequestException(
            'El email ya está registrado por otro usuario',
          );
        }
      }
    }

    // HASH (password) -> si vino hash y no es bcrypt, lo hasheamos
    let newHash = safeDto.hash;
    if (newHash) {
      if (!newHash.startsWith('$2')) {
        newHash = await bcrypt.hash(newHash, 10);
      }
    }

    // SUPERVISOR (relajado):
    // - undefined  -> deja el actual
    // - ""         -> null
    // - "algo"     -> si no existe, lo bajamos a null (no rompemos)
    let incomingSupervisorId: string | null;
    if (safeDto.supervisorId === undefined) {
      incomingSupervisorId = user.supervisorId ?? null;
    } else {
      incomingSupervisorId = this.normalizeSupervisorId(
        safeDto.supervisorId,
      );
    }

    if (incomingSupervisorId) {
      const sup = await this.userRepo.findOne({
        where: { id: incomingSupervisorId },
        withDeleted: true,
      });
      if (!sup) {
        // si no existe de verdad, lo forzamos null
        incomingSupervisorId = null;
      }
    }

    // FOTO:
    const nuevaFoto =
      safeDto.fotoBase64 !== undefined
        ? safeDto.fotoBase64
        : user.fotoBase64 ?? null;

    // aplicar cambios sobre la entidad cargada
    Object.assign(user, {
      nombre: safeDto.nombre ?? user.nombre,
      email: newEmail ?? user.email,
      hash: newHash ?? user.hash,
      activo:
        typeof safeDto.activo === 'boolean'
          ? safeDto.activo
          : user.activo,
      supervisorId: incomingSupervisorId,
      fotoBase64: nuevaFoto,
    });

    // guardar
    try {
      await this.userRepo.save(user);
    } catch (e: any) {
      if (e?.code === '23505') {
        throw new BadRequestException(
          'El email ya está en uso por un usuario activo.',
        );
      }
      throw e;
    }

    // ROLES:
    // si mando "roles" en el patch, actualizo roles.
    // si NO lo mando, no toco roles existentes.
    if (safeDto.roles !== undefined) {
      await this.setUserRoles(id, safeDto.roles);
    }

    // devolver usuario ya con joins
    return this.findOne(id);
  }

  // ---------- Update foto solamente ----------

  async updateFoto(
    id: string,
    fotoBase64: string,
  ): Promise<{ ok: true; id: string }> {
    const user = await this.userRepo.findOne({
      where: { id, eliminadoEn: IsNull() },
    });
    if (!user)
      throw new NotFoundException('Usuario no encontrado');

    user.fotoBase64 = fotoBase64 ?? null;

    await this.userRepo.save(user);

    return { ok: true, id };
  }

  // ---------- Delete (soft) ----------

  async remove(
    id: string,
  ): Promise<{
    ok: true;
    id: string;
    eliminadoEn: string;
    alreadyDeleted?: boolean;
  }> {
    // permite borrar aunque ya esté eliminado
    const user = await this.userRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!user)
      throw new NotFoundException('Usuario no existe');

    if (!user.eliminadoEn) {
      await this.userRepo.softRemove(user);
      return {
        ok: true,
        id,
        eliminadoEn: new Date().toISOString(),
        alreadyDeleted: false,
      };
    }

    // ya estaba eliminado
    return {
      ok: true,
      id,
      eliminadoEn: user.eliminadoEn.toISOString(),
      alreadyDeleted: true,
    };
  }

  // ---------- Roles ----------

  async setUserRoles(
    usuarioId: string,
    rolesIds: string[],
  ) {
    const user = await this.userRepo.findOne({
      where: { id: usuarioId, eliminadoEn: IsNull() },
    });
    if (!user)
      throw new NotFoundException('Usuario no encontrado');

    if (!Array.isArray(rolesIds)) {
      rolesIds = [];
    }

    const roles = rolesIds.length
      ? await this.rolService.findByIds(rolesIds)
      : [];

    const missing = rolesIds.filter(
      (rid) => !roles.find((r) => r.id === rid),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Roles inexistentes: ${missing.join(', ')}`,
      );
    }

    // limpiamos roles actuales
    await this.urRepo.delete({ usuarioId });

    // insertamos nuevos
    if (roles.length) {
      const nuevos = roles.map((r) =>
        this.urRepo.create({
          id: genId(),
          usuarioId,
          rolId: r.id,
        }),
      );
      await this.urRepo.save(nuevos);
    }
  }
}
