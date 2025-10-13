// Generador de IDs "matemáticos" sin secuencias (ULID, 26 chars ordenables por tiempo)
import { ulid } from 'ulid';

export const genId = (): string => ulid();
