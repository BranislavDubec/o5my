const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

export function validateNewPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Heslo musí mať aspoň ${MIN_PASSWORD_LENGTH} znakov`);
  }
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) {
    throw new Error("Heslo je príliš dlhé");
  }
  return value;
}
