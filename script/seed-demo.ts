// Local demo seed: one admin, a squad of players and a few payment identities
// with mixed paid / pending / overdue states, so the admin payment screens have
// something realistic to show. Run with: npx tsx script/seed-demo.ts
import { users } from "@shared/schema";
import { TERMS_VERSION } from "@shared/terms";
import { db } from "../server/storage/db";
import { storage } from "../server/storage";
import { hashPassword } from "../server/auth";

const ADMIN_EMAIL = "admin@o5my.local";
const ADMIN_PASSWORD = "Admin123!";
const PLAYER_PASSWORD = "Hraci123!";

const PLAYERS = [
  "Jan Novák",
  "Petr Svoboda",
  "Lukáš Horník",
  "Braňo Dubec",
  "Martin Krupa",
  "Tomáš Varga",
  "Filip Marek",
  "Adam Pospíšil",
  "David Sova",
  "Michal Reich",
  "Ondřej Bílek",
];

function emailFor(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z]+/g, ".");
  return `${slug}@o5my.local`;
}

async function main() {
  if (db.select().from(users).all().length > 0) {
    console.log("data.db already contains users - nothing was seeded.");
    console.log("Delete data.db, data.db-wal and data.db-shm to reseed from scratch.");
    return;
  }

  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const playerHash = await hashPassword(PLAYER_PASSWORD);
  const termsAcceptedAt = new Date().toISOString();

  const created = [
    storage.createUser({
      email: ADMIN_EMAIL,
      password: adminHash,
      name: "Martin Krsak",
      firstName: "Martin",
      lastName: "Krsak",
      nickname: "Krsi",
      phone: null,
      role: "admin",
      termsVersion: TERMS_VERSION,
      termsAcceptedAt,
    }),
    ...PLAYERS.map(name => {
      const [firstName, lastName] = name.split(" ");
      return storage.createUser({
        email: emailFor(name),
        password: playerHash,
        name,
        firstName,
        lastName,
        nickname: null,
        phone: null,
        role: "player",
        termsVersion: TERMS_VERSION,
        termsAcceptedAt,
      });
    }),
  ];

  // Logging in requires a verified e-mail and there is no mail server locally.
  db.update(users).set({ emailVerified: true }).run();
  console.log(`Created ${created.length} users, all with a verified e-mail.`);

  // Account details behind the payment QR code on the payment detail page.
  storage.setAppSetting("payment_iban", "CZ6508000000192000145399");
  storage.setAppSetting("payment_recipient_name", "O5MY Futsal");
  storage.setAppSetting("payment_currency", "CZK");

  const ids = created.map(user => user.id);
  const nameById = new Map(created.map(user => [user.id, user.name]));
  const idByName = new Map(created.map(user => [user.name, user.id]));

  function createGroup(options: {
    identity: string | null;
    description: string;
    userIds: number[];
    amount: number;
    dueDate: string;
  }) {
    const { identity, description, userIds, amount, dueDate } = options;
    return storage.createPayments(
      userIds.map(userId => ({
        userId,
        amount,
        fullPrice: amount * userIds.length,
        identity,
        dueDate,
        variableSymbol: null,
        description: `${description} ${nameById.get(userId)}`,
        status: "pending",
      })),
    );
  }

  function markPaid(paymentIds: number[]) {
    for (const id of paymentIds) storage.updatePaymentStatus(id, "paid");
  }

  // 1. Everybody paid -> green "everyone paid" row.
  const dues = createGroup({
    identity: "Členské 2026/2027",
    description: "Členský poplatok",
    userIds: ids,
    amount: 600,
    dueDate: "2026-09-30",
  });
  markPaid(dues.map(payment => payment.id));

  // 2. Partly paid, still before the due date -> yellow row.
  const tournament = createGroup({
    identity: "Turnaj Brno 2026",
    description: "Startovné turnaj Brno",
    userIds: ids.slice(0, 10),
    amount: 350,
    dueDate: "2026-10-12",
  });
  markPaid(tournament.slice(0, 7).map(payment => payment.id));

  // A wallet credit is applied automatically to the next payment created for
  // that member, so Tomáš shows a wallet contribution and a smaller remainder.
  storage.createWalletTransaction({
    userId: idByName.get("Tomáš Varga")!,
    bankTransactionId: null,
    paymentId: null,
    amount: 200,
    description: "Preplatok z minulej sezóny",
  });

  // 3. One member past the due date -> red row.
  const jerseys = createGroup({
    identity: "Dresy a rozlišky",
    description: "Dres a rozlišky",
    userIds: ids.slice(0, 8),
    amount: 450,
    dueDate: "2026-07-15",
  });
  markPaid(jerseys.slice(0, 5).map(payment => payment.id));
  storage.updatePaymentStatus(jerseys[7].id, "overdue");

  // 4. One identity created in two batches with different due dates, so the
  // list shows a due-date range instead of a single date.
  const trainingA = createGroup({
    identity: "Tréning 09/2026",
    description: "Tréning 5. 9.",
    userIds: ids.slice(0, 9),
    amount: 120,
    dueDate: "2026-09-05",
  });
  const trainingB = createGroup({
    identity: "Tréning 09/2026",
    description: "Tréning 19. 9.",
    userIds: ids.slice(3, 12),
    amount: 120,
    dueDate: "2026-09-19",
  });
  markPaid(trainingA.slice(0, 4).map(payment => payment.id));
  markPaid(trainingB.slice(0, 2).map(payment => payment.id));

  // 5. Payments created without an identity -> "without identity" group.
  const fines = createGroup({
    identity: null,
    description: "Pokuta za neúčasť",
    userIds: [idByName.get("David Sova")!, idByName.get("Michal Reich")!],
    amount: 100,
    dueDate: "2026-08-20",
  });
  markPaid([fines[0].id]);

  const all = storage.getAllPayments();
  const summary = new Map<string, { paid: number; total: number }>();
  for (const payment of all) {
    const key = payment.identity ?? "(without identity)";
    const entry = summary.get(key) ?? { paid: 0, total: 0 };
    entry.total += 1;
    if (payment.status === "paid") entry.paid += 1;
    summary.set(key, entry);
  }

  console.log(`\nCreated ${all.length} payments across ${summary.size} identities:`);
  for (const [identity, { paid, total }] of summary) {
    console.log(`  ${identity}: ${paid}/${total} paid`);
  }
  console.log(`\nAdmin login:  ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Player login: ${emailFor(PLAYERS[0])} / ${PLAYER_PASSWORD}`);
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  },
);
