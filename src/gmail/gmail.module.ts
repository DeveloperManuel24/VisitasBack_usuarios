// src/gmail/gmail.module.ts
import { Module } from '@nestjs/common';
import { GmailService } from './gmail.service';

@Module({
  providers: [GmailService],
  exports: [GmailService], // <- necesario para que otros módulos lo usen
})
export class GmailModule {}
