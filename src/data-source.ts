import 'dotenv/config';
import { DataSource } from 'typeorm';
import { join } from 'path';

const usingUrl = !!process.env.DATABASE_URL;

export default new DataSource({
  type: 'postgres',
  ...(usingUrl
    ? { url: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
      }),
  // schema: 'public', // o 'skynet' si lo separas
  entities: [join(__dirname, '/**/*.entity.{ts,js}')],
  migrations: [join(__dirname, '/migrations/*.{ts,js}')],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: true,
  ssl: false,
});
