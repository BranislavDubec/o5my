import type { Payment } from "@shared/schema";

export interface PaymentAccountSettings {
  iban: string;
  recipientName: string;
  currency: string;
}

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidIban(value: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(normalizeIban(value));
}

function sanitizeSpaydValue(value: string, maxLength: number): string {
  return value
    .replace(/[\r\n*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function createPaymentQrPayload(
  payment: Payment,
  settings: PaymentAccountSettings,
): string {
  const fields = [
    "SPD*1.0",
    `ACC:${normalizeIban(settings.iban)}`,
    `AM:${payment.amount.toFixed(2)}`,
    `CC:${settings.currency.toUpperCase()}`,
    `X-VS:${payment.variableSymbol}`,
  ];

  const message = sanitizeSpaydValue(payment.description, 60);
  const recipientName = sanitizeSpaydValue(settings.recipientName, 35);
  if (message) fields.push(`MSG:${message}`);
  if (recipientName) fields.push(`RN:${recipientName}`);

  return fields.join("*");
}
