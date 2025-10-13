import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Usuario } from './usuario.entity';
import { Rol } from '../../rol/entities/rol.entity'; // ruta relativa para evitar baseUrl

@Entity('usuario_rol')
@Unique('uq_usuario_rol', ['usuarioId', 'rolId'])
export class UsuarioRol {
  @PrimaryColumn({ type: 'varchar', length: 50 }) // ULID
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  usuarioId: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  rolId: string;

  @ManyToOne(() => Usuario, (u) => u.usuariosRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuarioId' })
  usuario: Usuario;

  @ManyToOne(() => Rol, (r: Rol) => r.usuariosRoles, { onDelete: 'CASCADE' }) // <- tipado para evitar 'unknown'
  @JoinColumn({ name: 'rolId' })
  rol: Rol;

  @CreateDateColumn({ type: 'timestamptz' })
  asignadoEn: Date;
}
