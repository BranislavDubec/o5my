export function normalizeNickname(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Prezývka je povinná");
  }
  const nickname = value.trim().replace(/\s+/g, " ");
  if (!nickname) throw new Error("Prezývka je povinná");
  if (nickname.length > 30) throw new Error("Prezývka môže mať najviac 30 znakov");
  if (/[\r\n\t]/.test(value)) throw new Error("Prezývka obsahuje nepovolené znaky");
  return nickname;
}
