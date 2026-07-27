const test = require("node:test");
const assert = require("node:assert/strict");
const transactions = require("../assistant-transactions.js");

function prepared(operations) {
  return {
    id: "prepared-test",
    proposalId: "proposal-test",
    status: "prepared",
    summary: "Test transaction",
    operations
  };
}

function databaseOperation(overrides = {}) {
  return {
    id: "operation-1",
    type: "create-database-row",
    databaseRef: "database:page:test:",
    source: { kind: "page", pageId: "test", blockId: "" },
    values: { name: "New row" },
    ...overrides
  };
}

function makeAdapter(initial = { rows: [] }) {
  let state = structuredClone(initial);
  return {
    getState: () => structuredClone(state),
    setState: (next) => { state = structuredClone(next); },
    preflight(operations) {
      if (!operations.length) throw new Error("No operations");
      return true;
    },
    snapshot() {
      return structuredClone(state);
    },
    apply(operations) {
      operations.forEach((operation) => {
        if (operation.fail) throw new Error("Simulated adapter failure");
        state.rows.push({ id: operation.id, ...operation.values });
      });
      return { changedRowCount: operations.length };
    },
    restore(snapshot) {
      state = structuredClone(snapshot);
      return true;
    },
    fingerprint() {
      return JSON.stringify(state);
    }
  };
}

test("applies a prepared database transaction and creates an undo receipt", async () => {
  const adapter = makeAdapter();
  const receipt = await transactions.executePreparedTransaction(
    prepared([databaseOperation()]),
    { database: adapter }
  );

  assert.equal(receipt.status, "applied");
  assert.equal(receipt.undoAvailable, true);
  assert.equal(receipt.adapters.length, 1);
  assert.equal(adapter.getState().rows[0].name, "New row");
});

test("undo restores the exact pre-transaction snapshot", async () => {
  const adapter = makeAdapter({ rows: [{ id: "existing", name: "Existing" }] });
  const receipt = await transactions.executePreparedTransaction(
    prepared([databaseOperation()]),
    { database: adapter }
  );
  const undone = await transactions.undoTransaction(receipt, { database: adapter });

  assert.equal(undone.status, "undone");
  assert.equal(undone.undoAvailable, false);
  assert.deepEqual(adapter.getState(), { rows: [{ id: "existing", name: "Existing" }] });
});

test("undo refuses to overwrite changes made after apply", async () => {
  const adapter = makeAdapter();
  const receipt = await transactions.executePreparedTransaction(
    prepared([databaseOperation()]),
    { database: adapter }
  );
  adapter.setState({ rows: [...adapter.getState().rows, { id: "later", name: "Later edit" }] });

  await assert.rejects(
    transactions.undoTransaction(receipt, { database: adapter }),
    /changed after this transaction/
  );
  assert.equal(adapter.getState().rows.length, 2);
});

test("a failed apply restores the snapshot automatically", async () => {
  const adapter = makeAdapter({ rows: [{ id: "existing", name: "Existing" }] });
  await assert.rejects(
    transactions.executePreparedTransaction(
      prepared([
        databaseOperation(),
        databaseOperation({ id: "operation-2", fail: true })
      ]),
      { database: adapter }
    ),
    /rolled back/
  );
  assert.deepEqual(adapter.getState(), { rows: [{ id: "existing", name: "Existing" }] });
});

test("unsupported source operations never execute", async () => {
  assert.throws(
    () => transactions.createEnvelope(prepared([{ type: "delete-database-row" }])),
    /Unsupported transaction operation/
  );
});
