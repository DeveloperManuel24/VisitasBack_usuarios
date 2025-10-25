// src/app.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UsuariosModule } from './usuarios/usuarios.module'
import { RolModule } from './rol/rol.module'
import { AuthModule } from './auth/auth.module'
import { GmailModule } from './gmail/gmail.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST'),
        port: Number(cfg.get('DB_PORT')),
        database: cfg.get<string>('DB_NAME'),
        username: cfg.get<string>('DB_USER'),
        password: String(cfg.get('DB_PASS') ?? ''),
        autoLoadEntities: true,
        synchronize: false,
        ssl: false,
      }),
    }),
    UsuariosModule,
    RolModule,
    AuthModule,
    GmailModule,
  ],
  providers: [
    // ⛔ OJO: sacamos el APP_GUARD global para que no pida JWT
    // {
    //   provide: APP_GUARD,
    //   useClass: JwtAuthGuard,
    // },
  ],
})
export class AppModule {}
