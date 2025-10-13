import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Usuario } from './entities/usuario.entity';
import { UsuarioRol } from './entities/usuario-rol.entity';

import { UsuariosService } from './usuarios.service';
import { UsuariosController } from './usuarios.controller';

import { RolModule } from 'src/rol/rol.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, UsuarioRol]),
    RolModule, // usa el servicio de roles exportado
  ],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [TypeOrmModule, UsuariosService],
})
export class UsuariosModule {}
