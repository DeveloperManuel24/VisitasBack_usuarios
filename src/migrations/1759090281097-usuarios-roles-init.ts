import { MigrationInterface, QueryRunner } from "typeorm";

export class UsuariosRolesInit1759090281097 implements MigrationInterface {
    name = 'UsuariosRolesInit1759090281097'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "rol" ("id" character varying(50) NOT NULL, "nombre" character varying(60) NOT NULL, "descripcion" character varying(200), "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_rol_nombre" UNIQUE ("nombre"), CONSTRAINT "PK_c93a22388638fac311781c7f2dd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9792c580a992d554ee1621c5b4" ON "rol" ("nombre") `);
        await queryRunner.query(`CREATE TABLE "usuario_rol" ("id" character varying(50) NOT NULL, "usuarioId" character varying(50) NOT NULL, "rolId" character varying(50) NOT NULL, "asignadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_usuario_rol" UNIQUE ("usuarioId", "rolId"), CONSTRAINT "PK_6c336b0a51b5c4d22614cb02533" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e9d4d7ac50576e218783bbf1be" ON "usuario_rol" ("usuarioId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d55b4dbc2b4a0a42d95e71973c" ON "usuario_rol" ("rolId") `);
        await queryRunner.query(`CREATE TABLE "usuario" ("id" character varying(50) NOT NULL, "nombre" character varying(120) NOT NULL, "email" character varying(160) NOT NULL, "hash" character varying(200) NOT NULL, "activo" boolean NOT NULL DEFAULT true, "supervisorId" character varying(50), "creadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizadoEn" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "eliminadoEn" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a56c58e5cabaa04fb2c98d2d7e2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_usuario_supervisor" ON "usuario" ("supervisorId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_usuario_email" ON "usuario" ("email") `);
        await queryRunner.query(`ALTER TABLE "usuario_rol" ADD CONSTRAINT "FK_e9d4d7ac50576e218783bbf1bee" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuario_rol" ADD CONSTRAINT "FK_d55b4dbc2b4a0a42d95e71973cd" FOREIGN KEY ("rolId") REFERENCES "rol"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuario" ADD CONSTRAINT "FK_449aa3a6333e6c49e5848e62ff2" FOREIGN KEY ("supervisorId") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usuario" DROP CONSTRAINT "FK_449aa3a6333e6c49e5848e62ff2"`);
        await queryRunner.query(`ALTER TABLE "usuario_rol" DROP CONSTRAINT "FK_d55b4dbc2b4a0a42d95e71973cd"`);
        await queryRunner.query(`ALTER TABLE "usuario_rol" DROP CONSTRAINT "FK_e9d4d7ac50576e218783bbf1bee"`);
        await queryRunner.query(`DROP INDEX "public"."idx_usuario_email"`);
        await queryRunner.query(`DROP INDEX "public"."idx_usuario_supervisor"`);
        await queryRunner.query(`DROP TABLE "usuario"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d55b4dbc2b4a0a42d95e71973c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e9d4d7ac50576e218783bbf1be"`);
        await queryRunner.query(`DROP TABLE "usuario_rol"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9792c580a992d554ee1621c5b4"`);
        await queryRunner.query(`DROP TABLE "rol"`);
    }

}
