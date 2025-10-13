import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UsuarioRol } from './usuario-rol.entity';

@Entity('usuario')
@Index('uq_usuario_email_active', ['email'], {
  unique: true,
  where: '"eliminadoEn" IS NULL', // unique solo para usuarios activos
})
@Index('idx_usuario_supervisor', ['supervisorId'])
export class Usuario {
  @PrimaryColumn({ type: 'varchar', length: 50 }) // ULID
  id: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({
    type: 'varchar',
    length: 160,
    transformer: {
      // siempre guarda emails normalizados
      to: (v?: string) => (v ?? '').trim().toLowerCase(),
      from: (v?: string) => v ?? '',
    },
  })
  email: string;

  @Column({ type: 'varchar', length: 200 })
  hash: string; // hash (bcrypt)

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  supervisorId?: string | null;

  @ManyToOne(() => Usuario, (u) => u.subordinados, {
    nullable: true,
    onDelete: 'SET NULL', // si borran al supervisor, no rompe la jerarquía
  })
  @JoinColumn({ name: 'supervisorId' })
  supervisor?: Usuario | null;

  @OneToMany(() => Usuario, (u) => u.supervisor)
  subordinados: Usuario[];

  @OneToMany(() => UsuarioRol, (ur) => ur.usuario, { cascade: true })
  usuariosRoles: UsuarioRol[];

  @CreateDateColumn({ type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  actualizadoEn: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  eliminadoEn?: Date;
}
