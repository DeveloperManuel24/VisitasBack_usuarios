import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as bodyParser from 'body-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // ⬆ permitir JSON "grande" (para fotoBase64 en PATCH /usuarios)
  // - 5mb suele ser suficiente para una foto de perfil decente
  // - también ampliamos urlencoded por si en el futuro mandas forms
  app.use(bodyParser.json({ limit: '5mb' }))
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }))

  // permitir que el front en 3002 llame a este backend
  app.enableCors({
    origin: 'http://localhost:3002',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  console.log(`Usuarios/Roles API listening on http://localhost:${port}`)
}

bootstrap()
