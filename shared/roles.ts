export const USER_ROLES = ["player", "manager", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && USER_ROLES.includes(role as UserRole);
}

export function canManageTeam(role: unknown): boolean {
  return role === "admin" || role === "manager";
}

export function canAccessFinances(role: unknown): boolean {
  return role === "admin";
}

export function canViewPersonalPayments(role: unknown): boolean {
  return role === "admin" || role === "player";
}
