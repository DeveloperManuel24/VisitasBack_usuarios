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
  hash!: string; // puede venir en texto plano y el service lo hashea si no empieza con $2

  @IsOptional() @IsBoolean()
  activo?: boolean = true;

  @IsOptional() @IsString() @Length(0, 50)
  supervisorId?: string;

  // ids de roles que le querés asignar al user al crear
  @IsOptional()
  roles?: string[];

  // 👇 NUEVO
  @IsOptional() @IsString()
  fotoBase64?: string;
}
