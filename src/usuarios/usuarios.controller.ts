import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { QueryUsuarioDto } from './dto/query-usuario.dto';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Post()
  create(@Body() body: any) {
    // log defensivo para confirmar qué llega realmente
    // console.log('>> POST /usuarios body =', body);
    return this.service.create(body);
  }

  @Get()
  findAll(@Query() query: QueryUsuarioDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUsuarioDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/roles')
  setRoles(
    @Param('id') id: string,
    @Body() body: { roles: string[] },
  ) {
    return this.service.setUserRoles(id, body?.roles ?? []);
  }

  @Post(':id/foto')
  async setFoto(
    @Param('id') id: string,
    @Body() body: { fotoBase64?: string },
  ) {
    if (!body?.fotoBase64 || body.fotoBase64.trim() === '') {
      throw new BadRequestException('fotoBase64 requerida');
    }
    return this.service.updateFoto(id, body.fotoBase64);
  }
}
