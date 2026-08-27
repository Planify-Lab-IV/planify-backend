import bcrypt from "bcrypt"; // --> Libreria hashing

export interface PasswordHasher {
  hash(plain: string): Promise<string>; // --> recibe texto plano y devuelve el hash
  compare(plain: string, hash: string): Promise<boolean>; // --> compara password contra un hash
}

export function createPasswordHasher(): PasswordHasher {
  const SALT_ROUNDS = 10; // --> Para que para una misma contraseña el hash sea diferente

  return {
    async hash(plain) {
      return bcrypt.hash(plain, SALT_ROUNDS);
    },
    async compare(plain, hash) {
      return bcrypt.compare(plain, hash);
    },
  };
}
