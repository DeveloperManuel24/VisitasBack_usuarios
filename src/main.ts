import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import * as bodyParser from 'body-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // permitir JSON grande (fotos base64, etc.)
  app.use(bodyParser.json({ limit: '5mb' }))
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }))

  // CORS:
  // - En dev usabas localhost:3002
  // - En prod debe aceptar el dominio real del front
  // - Para no trabarnos ahora, habilitamos ambos: el FRONTEND_URL y fallback "*"
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002'

  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3002', 'http://127.0.0.1:3002', '*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  console.log(`API escuchando en puerto ${port}`)
}

bootstrap()
