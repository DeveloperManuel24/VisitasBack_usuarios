import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Min, Max } from 'class-validator';

export class QueryUsuarioDto {
  @IsOptional() @IsString()
  q?: string; // nombre o email

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 10;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  activo?: boolean;

  @IsOptional() @IsString() @Length(0, 50)
  supervisorId?: string;

  @IsOptional() @IsString() @Length(0, 60)
  rolNombre?: string; // filtro por nombre de rol (ej. 'TECNICO')
}
