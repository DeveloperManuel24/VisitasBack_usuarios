import { MigrationInterface, QueryRunner } from "typeorm";

export class ClienteNotnullIndices1759700181094 implements MigrationInterface {
    name = 'ClienteNotnullIndices1759700181094'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usuario" DROP CONSTRAINT "FK_449aa3a6333e6c49e5848e62ff2"`);
        await queryRunner.query(`ALTER TABLE "usuario" ADD CONSTRAINT "FK_449aa3a6333e6c49e5848e62ff2" FOREIGN KEY ("supervisorId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usuario" DROP CONSTRAINT "FK_449aa3a6333e6c49e5848e62ff2"`);
        await queryRunner.query(`ALTER TABLE "usuario" ADD CONSTRAINT "FK_449aa3a6333e6c49e5848e62ff2" FOREIGN KEY ("supervisorId") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
