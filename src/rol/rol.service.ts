import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { Rol } from './entities/rol.entity';
import { CreateRolDto } from './dto/create-rol.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
import { genId } from 'src/common/ids';

@Injectable()
export class RolService {
  constructor(
    @InjectRepository(Rol)
    private readonly repo: Repository<Rol>,
  ) {}

  async create(dto: CreateRolDto): Promise<Rol> {
    const entity = this.repo.create({ ...dto, id: genId() });
    return this.repo.save(entity);
    }

  async findAll(q?: string): Promise<Rol[]> {
    const where = q?.trim()
      ? [{ nombre: ILike(`%${q.trim()}%`) }, { descripcion: ILike(`%${q.trim()}%`) }]
      : {};
    return this.repo.find({ where, order: { nombre: 'ASC' } });
  }

  async findOne(id: string): Promise<Rol> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Rol no encontrado');
    return found;
  }

  async update(id: string, dto: UpdateRolDto): Promise<Rol> {
    const found = await this.findOne(id);
    Object.assign(found, dto);
    return this.repo.save(found);
  }

  async remove(id: string): Promise<{ ok: true; id: string }> {
    const found = await this.findOne(id);
    await this.repo.remove(found);
    return { ok: true, id };
  }

  // Para uso desde Usuarios (sin acoplar repos directamente)
  async findByIds(ids: string[]): Promise<Rol[]> {
    if (!ids?.length) return [];
    return this.repo.find({ where: { id: In(ids) } });
  }
}
