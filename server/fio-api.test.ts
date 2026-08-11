import { test } from "node:test";
import assert from "node:assert/strict";
import { FIO_AUTO_SYNC_INTERVAL_MS, isFioAutoSyncDue } from "./fio-sync-policy";

const fioModule = import("./fio-model");

test("preserves leading zeroes in Fio payment symbols", async () => {
  const { normalizeFioTransaction } = await fioModule;
  const transaction = normalizeFioTransaction({
    column22: { value: 1152125620 },
    column0: { value: 1343685600000 },
    column1: { value: 123.45 },
    column14: { value: "CZK" },
    column4: { value: "0558" },
    column5: { value: "0001" },
    column6: { value: "0002" },
  });

  assert.equal(transaction.constantSymbol, "0558");
  assert.equal(transaction.variableSymbol, "0001");
  assert.equal(transaction.specificSymbol, "0002");
  assert.equal(transaction.amountMinor, 12_345);
});

test("parses a foreign transaction so its raw JSON can be logged and rejected", async () => {
  const { normalizeFioTransaction } = await fioModule;
  const transaction = normalizeFioTransaction({
    column22: { value: 1152125621 },
    column0: { value: 1343685600000 },
    column1: { value: 1.234 },
    column14: { value: "EUR" },
  });

  assert.equal(transaction.currency, "EUR");
  assert.equal(transaction.amountMinor, 123);
});

test("stores the domestic counter-account separately and derives its Czech IBAN", async () => {
  const { normalizeCounterpartyAccount } = await fioModule;
  assert.deepEqual(
    normalizeCounterpartyAccount("19-2000145399", "0800"),
    {
      account: "19-2000145399",
      bankCode: "0800",
      iban: "CZ6508000000192000145399",
    },
  );
});

test("automatic Fio sync becomes due seven days after the last successful sync", () => {
  const lastSync = "2026-08-01T12:00:00.000Z";
  const lastSyncTime = Date.parse(lastSync);

  assert.equal(isFioAutoSyncDue(lastSync, lastSyncTime + FIO_AUTO_SYNC_INTERVAL_MS - 1), false);
  assert.equal(isFioAutoSyncDue(lastSync, lastSyncTime + FIO_AUTO_SYNC_INTERVAL_MS), true);
  assert.equal(isFioAutoSyncDue(undefined, lastSyncTime), true);
  assert.equal(isFioAutoSyncDue("invalid date", lastSyncTime), true);
});
