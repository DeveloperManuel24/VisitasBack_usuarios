import { PartialType } from '@nestjs/mapped-types';
import { CreateGmailDto } from './create-gmail.dto';

export class UpdateGmailDto extends PartialType(CreateGmailDto) {}
