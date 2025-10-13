import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  Unique,
} from 'typeorm';
import { UsuarioRol } from '../../usuarios/entities/usuario-rol.entity'; // usa ruta relativa robusta

@Entity('rol')
@Unique('uq_rol_nombre', ['nombre'])
export class Rol {
  @PrimaryColumn({ type: 'varchar', length: 50 }) // ULID
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 60 })
  nombre: string; // 'ADMIN' | 'SUPERVISOR' | 'TECNICO'

  @Column({ type: 'varchar', length: 200, nullable: true })
  descripcion?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;

  @OneToMany(() => UsuarioRol, (ur) => ur.rol)
  usuariosRoles: UsuarioRol[];
}
