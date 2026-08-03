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

export function normalizePersonName(value: unknown, label: "Meno" | "Priezvisko"): string {
  if (typeof value !== "string") throw new Error(`${label} je povinné`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${label} je povinné`);
  if (normalized.length > 80) throw new Error(`${label} môže mať najviac 80 znakov`);
  if (/[\r\n\t]/.test(value)) throw new Error(`${label} obsahuje nepovolené znaky`);
  return normalized;
}

export function splitFullName(value: unknown) {
  const fullName = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const separatorIndex = fullName.indexOf(" ");
  if (separatorIndex < 0) return { firstName: fullName, lastName: "" };
  return {
    firstName: fullName.slice(0, separatorIndex),
    lastName: fullName.slice(separatorIndex + 1),
  };
}
