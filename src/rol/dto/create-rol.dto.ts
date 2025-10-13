import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateRolDto {
  @IsString() @IsNotEmpty() @Length(2, 60)
  nombre!: string;

  @IsOptional() @IsString() @Length(0, 200)
  descripcion?: string;
}
