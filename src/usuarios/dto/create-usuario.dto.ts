import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsString() @IsNotEmpty() @Length(2, 120)
  nombre!: string;

  @IsEmail() @Length(5, 160)
  email!: string;

  @IsString() @Length(8, 200)
  hash!: string; // ya encriptado

  @IsOptional() @IsBoolean()
  activo?: boolean = true;

  @IsOptional() @IsString() @Length(0, 50)
  supervisorId?: string;

  // opcional: roles al crear (IDs de rol)
  @IsOptional()
  roles?: string[];
}
