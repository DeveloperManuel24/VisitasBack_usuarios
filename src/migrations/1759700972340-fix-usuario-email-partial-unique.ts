import { MigrationInterface, QueryRunner } from "typeorm";

export class FixUsuarioEmailPartialUnique1759702000000 implements MigrationInterface {
  name = 'FixUsuarioEmailPartialUnique1759702000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Quitar cualquier UNIQUE/INDEX global previo sobre email
    await queryRunner.query(`ALTER TABLE "usuario" DROP CONSTRAINT IF EXISTS "idx_usuario_email";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_usuario_email";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_usuario_email";`);

    // Crear UNIQUE PARCIAL solo para usuarios activos (eliminadoEn IS NULL)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_usuario_email_active"
      ON "usuario" ("email")
      WHERE "eliminadoEn" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_usuario_email_active";`);
    await queryRunner.query(`ALTER TABLE "usuario" ADD CONSTRAINT "idx_usuario_email" UNIQUE ("email");`);
  }
}
