import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, Not, Repository, SelectQueryBuilder } from 'typeorm';
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

  async create(dto: CreateUsuarioDto): Promise<Usuario> {
    const email = this.normalizeEmail(dto.email);

    // único entre activos
    const exists = await this.userRepo.findOne({
      where: { email, eliminadoEn: IsNull() },
      withDeleted: false,
    });
    if (exists) {
      throw new BadRequestException('El email ya está registrado');
    }

    // hash si viene en texto plano
    let passwordHash = dto.hash;
    if (passwordHash && !passwordHash.startsWith('$2')) {
      passwordHash = await bcrypt.hash(passwordHash, 10);
    }

    // supervisorId "" -> null y validación de existencia
    const supervisorId = this.normalizeSupervisorId(dto.supervisorId ?? null);
    if (supervisorId) {
      const sup = await this.userRepo.findOne({
        where: { id: supervisorId, eliminadoEn: IsNull() },
      });
      if (!sup) {
        throw new BadRequestException(
          'El supervisor indicado no existe o está eliminado',
        );
      }
    }

    const entity = this.userRepo.create({
      id: genId(),
      nombre: dto.nombre,
      email,
      hash: passwordHash,
      activo: dto.activo ?? true,
      supervisorId,
      // 👇 NUEVO
      fotoBase64: dto.fotoBase64 ?? null,
    });

    let saved: Usuario;
    try {
      saved = await this.userRepo.save(entity);
    } catch (e: any) {
      if (e?.code === '23505') {
        // protegido por unique parcial en DB
        throw new BadRequestException(
          'El email ya está en uso por un usuario activo.',
        );
      }
      throw e;
    }

    if (dto.roles?.length) {
      await this.setUserRoles(saved.id, dto.roles);
    }

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
    const incluirEliminados = Boolean((query as any)?.incluirEliminados);

    let qb = this.baseQuery(incluirEliminados);

    if (q?.trim()) {
      qb = qb.andWhere('(u.nombre ILIKE :q OR u.email ILIKE :q)', {
        q: `%${q.trim()}%`,
      });
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
      // búsqueda parcial por nombre de rol
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
    const qb = this.baseQuery(false).andWhere('u.id = :id', { id });
    const found = await qb.getOne();
    if (!found) throw new NotFoundException('Usuario no encontrado');
    return found;
  }

  // ---------- Update ----------

  async update(id: string, dto: UpdateUsuarioDto): Promise<Usuario> {
    const user = await this.userRepo.findOne({
      where: { id, eliminadoEn: IsNull() },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    // email único (activos)
    let newEmail = dto.email
      ? this.normalizeEmail(dto.email)
      : undefined;
    if (newEmail && newEmail !== user.email) {
      const emailTaken = await this.userRepo.findOne({
        where: { email: newEmail, id: Not(id), eliminadoEn: IsNull() },
      });
      if (emailTaken) {
        throw new BadRequestException(
          'El email ya está registrado por otro usuario',
        );
      }
    }

    // re-hash si llega un nuevo hash en texto plano
    let newHash = dto.hash;
    if (newHash && !newHash.startsWith('$2')) {
      newHash = await bcrypt.hash(newHash, 10);
    }

    // supervisorId: undefined -> mantener; "" -> null; validar si viene id
    const incomingSupervisorId =
      dto.supervisorId === undefined
        ? user.supervisorId ?? null
        : this.normalizeSupervisorId(dto.supervisorId);

    if (incomingSupervisorId) {
      const sup = await this.userRepo.findOne({
        where: { id: incomingSupervisorId, eliminadoEn: IsNull() },
      });
      if (!sup) {
        throw new BadRequestException(
          'El supervisor indicado no existe o está eliminado',
        );
      }
    }

    Object.assign(user, {
      nombre: dto.nombre ?? user.nombre,
      email: newEmail ?? user.email,
      hash: newHash ?? user.hash,
      activo:
        typeof dto.activo === 'boolean' ? dto.activo : user.activo,
      supervisorId: incomingSupervisorId,
      // 👇 NUEVO: si vino fotoBase64 en el DTO de update, actualizarla
      fotoBase64:
        dto.fotoBase64 !== undefined
          ? dto.fotoBase64
          : user.fotoBase64 ?? null,
    });

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

    if (dto.roles) {
      await this.setUserRoles(id, dto.roles);
    }

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
    if (!user) throw new NotFoundException('Usuario no encontrado');

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
    if (!user) throw new NotFoundException('Usuario no existe');

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

  async setUserRoles(usuarioId: string, rolesIds: string[]) {
    const user = await this.userRepo.findOne({
      where: { id: usuarioId, eliminadoEn: IsNull() },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const roles = await this.rolService.findByIds(rolesIds);
    const missing = rolesIds.filter(
      (rid) => !roles.find((r) => r.id === rid),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Roles inexistentes: ${missing.join(', ')}`,
      );
    }

    await this.urRepo.delete({ usuarioId });

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
