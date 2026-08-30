// Payments are created in bulk for a group of members and share a payment
// "identity" (e.g. "Clenske 2026"). The admin payment screens treat that
// identity as the payment itself and the per-member rows as its participants.

export interface PaymentWithUser {
  id: number;
  userId: number;
  amount: number;
  fullPrice: number;
  identity: string | null;
  walletAppliedAmount: number;
  dueDate: string;
  variableSymbol: string | null;
  description: string;
  status: string;
  user: { id: number; name: string };
}

/** Route for payments that were created without an identity. */
export const UNASSIGNED_IDENTITY_PATH = "/admin/payments/unassigned";

export type IdentityStatus = "paid" | "pending" | "overdue";

export interface PaymentIdentityGroup {
  /** `null` for payments created without an identity. */
  identity: string | null;
  href: string;
  payments: PaymentWithUser[];
  memberCount: number;
  paidCount: number;
  /** Everyone who was supposed to pay has paid. */
  everyonePaid: boolean;
  status: IdentityStatus;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  /** Earliest and latest due date across the group's payments. */
  dueDateFrom: string;
  dueDateTo: string;
}

export function getOutstandingAmount(payment: Pick<PaymentWithUser, "amount" | "walletAppliedAmount">) {
  return Math.max(0, payment.amount - payment.walletAppliedAmount);
}

export function identityHref(identity: string | null) {
  return identity === null
    ? UNASSIGNED_IDENTITY_PATH
    : `/admin/payments/identity/${encodeURIComponent(identity)}`;
}

/** Matches a raw (possibly still URL-encoded) wouter route param against an identity. */
export function matchesIdentityParam(identity: string | null, rawParam: string) {
  if (identity === null) return false;
  if (identity === rawParam || encodeURIComponent(identity) === rawParam) return true;
  try {
    return identity === decodeURIComponent(rawParam);
  } catch {
    return false;
  }
}

function normalizeIdentity(identity: string | null) {
  const trimmed = identity?.trim();
  return trimmed ? trimmed : null;
}

export function groupPaymentsByIdentity(payments: PaymentWithUser[]): PaymentIdentityGroup[] {
  const buckets = new Map<string, PaymentWithUser[]>();
  for (const payment of payments) {
    const identity = normalizeIdentity(payment.identity);
    // A leading space cannot occur in a normalized identity, so it is a safe
    // bucket key for the payments that have none.
    const key = identity === null ? " unassigned" : identity;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(payment);
    else buckets.set(key, [payment]);
  }

  const groups = Array.from(buckets.values()).map(bucketPayments => {
    const identity = normalizeIdentity(bucketPayments[0].identity);
    const paidCount = bucketPayments.filter(payment => payment.status === "paid").length;
    const everyonePaid = paidCount === bucketPayments.length;
    const dueDates = bucketPayments.map(payment => payment.dueDate).sort();
    const group: PaymentIdentityGroup = {
      identity,
      href: identityHref(identity),
      payments: bucketPayments,
      memberCount: bucketPayments.length,
      paidCount,
      everyonePaid,
      status: everyonePaid
        ? "paid"
        : bucketPayments.some(payment => payment.status === "overdue")
          ? "overdue"
          : "pending",
      totalAmount: bucketPayments.reduce((sum, payment) => sum + payment.amount, 0),
      paidAmount: bucketPayments
        .filter(payment => payment.status === "paid")
        .reduce((sum, payment) => sum + payment.amount, 0),
      outstandingAmount: bucketPayments
        .filter(payment => payment.status !== "paid")
        .reduce((sum, payment) => sum + getOutstandingAmount(payment), 0),
      dueDateFrom: dueDates[0],
      dueDateTo: dueDates[dueDates.length - 1],
    };
    return group;
  });

  // Newest due date first, matching the order the API returns payments in.
  return groups.sort((a, b) => b.dueDateTo.localeCompare(a.dueDateTo));
}
