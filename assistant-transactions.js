(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumAssistantTransactions = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 1;
  const DATABASE_OPERATION_TYPES = new Set([
    "create-database-row",
    "update-database-row",
    "update-database-rows",
    "relate-database-rows",
    "append-database-field",
    "set-database-checklist-state"
  ]);
  const DATABASE_STRUCTURE_OPERATION_TYPES = new Set(["create-inline-database"]);
  const NOTE_OPERATION_TYPES = new Set(["append-note-content", "replace-note-text"]);
  const DOCUMENT_OPERATION_TYPES = new Set(["append-document-section", "replace-document-section-text"]);
  const CANVAS_OPERATION_TYPES = new Set(["add-page-text-block", "replace-canvas-block-text"]);
  const PAGE_OPERATION_TYPES = new Set(["create-page"]);
  const SOURCE_TYPE_PRIORITY = new Map([
    ["page", 0],
    ["database-structure", 1],
    ["database", 2],
    ["note", 3],
    ["document", 4],
    ["canvas", 5]
  ]);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeString(value, max = 1000) {
    if (value === null || value === undefined) return "";
    return String(value).slice(0, max);
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function sourceTypeForOperation(operation = {}) {
    if (DATABASE_STRUCTURE_OPERATION_TYPES.has(operation.type)) return "database-structure";
    if (DATABASE_OPERATION_TYPES.has(operation.type)) return "database";
    if (NOTE_OPERATION_TYPES.has(operation.type)) return "note";
    if (DOCUMENT_OPERATION_TYPES.has(operation.type)) return "document";
    if (CANVAS_OPERATION_TYPES.has(operation.type)) return "canvas";
    if (PAGE_OPERATION_TYPES.has(operation.type)) return "page";
    return "";
  }

  function createEnvelope(preparedTransaction = {}) {
    if (!preparedTransaction || preparedTransaction.status !== "prepared") {
      throw new Error("Only a prepared transaction can be applied.");
    }
    const operations = asArray(preparedTransaction.operations).map((operation) => clone(operation));
    if (!operations.length) throw new Error("The prepared transaction has no operations.");
    const unsupported = operations.find((operation) => !sourceTypeForOperation(operation));
    if (unsupported) throw new Error(`Unsupported transaction operation: ${safeString(unsupported.type, 80) || "unknown"}.`);
    const seenOperations = new Map();
    operations.forEach((operation) => {
      const operationId = safeString(operation.id, 160).trim();
      if (!operationId || seenOperations.has(operationId)) {
        throw new Error("Every transaction operation needs a unique reviewed ID.");
      }
      const dependencyId = safeString(
        operation.parentOperationId
          || operation.createdPageOperationId
          || (safeString(operation.parentRef || operation.targetRef, 200).startsWith("@")
            ? safeString(operation.parentRef || operation.targetRef, 200).slice(1)
            : ""),
        160
      ).trim();
      if (dependencyId) {
        const dependency = seenOperations.get(dependencyId);
        if (!dependency || dependency.type !== "create-page") {
          throw new Error("Dependent operations must reference an earlier create-page operation.");
        }
      }
      seenOperations.set(operationId, operation);
    });
    return {
      version: VERSION,
      id: `transaction-${safeString(preparedTransaction.id || preparedTransaction.proposalId, 160)}-${Date.now()}`,
      proposalId: safeString(preparedTransaction.proposalId, 160),
      preparedTransactionId: safeString(preparedTransaction.id, 200),
      summary: safeString(preparedTransaction.summary, 600),
      status: "ready",
      operations,
      createdAt: Date.now()
    };
  }

  function groupOperations(operations = []) {
    const groups = new Map();
    asArray(operations).forEach((operation) => {
      const sourceType = sourceTypeForOperation(operation);
      if (!sourceType) throw new Error(`Unsupported transaction operation: ${safeString(operation?.type, 80) || "unknown"}.`);
      if (!groups.has(sourceType)) groups.set(sourceType, []);
      groups.get(sourceType).push(operation);
    });
    return new Map([...groups.entries()].sort((left, right) => (
      (SOURCE_TYPE_PRIORITY.get(left[0]) ?? 99) - (SOURCE_TYPE_PRIORITY.get(right[0]) ?? 99)
    )));
  }

  function requireAdapter(adapters = {}, sourceType = "") {
    const adapter = adapters?.[sourceType];
    if (!adapter) throw new Error(`No ${sourceType} transaction adapter is available.`);
    ["preflight", "snapshot", "apply", "restore", "fingerprint"].forEach((method) => {
      if (typeof adapter[method] !== "function") {
        throw new Error(`${sourceType} transaction adapter is missing ${method}().`);
      }
    });
    return adapter;
  }

  async function executePreparedTransaction(preparedTransaction, adapters = {}) {
    const envelope = createEnvelope(preparedTransaction);
    const groups = groupOperations(envelope.operations);
    const adapterEntries = [];

    for (const [sourceType, operations] of groups.entries()) {
      const adapter = requireAdapter(adapters, sourceType);
      await adapter.preflight(clone(operations));
      const snapshot = await adapter.snapshot(clone(operations));
      adapterEntries.push({
        sourceType,
        operations: clone(operations),
        snapshot: clone(snapshot),
        afterFingerprint: "",
        result: null
      });
    }

    const appliedEntries = [];
    try {
      for (const entry of adapterEntries) {
        const adapter = requireAdapter(adapters, entry.sourceType);
        entry.result = clone(await adapter.apply(clone(entry.operations)));
        appliedEntries.push(entry);
      }
      for (const entry of adapterEntries) {
        const adapter = requireAdapter(adapters, entry.sourceType);
        entry.afterFingerprint = safeString(await adapter.fingerprint(clone(entry.snapshot)), 4000);
      }
    } catch (error) {
      for (const entry of [...adapterEntries].reverse()) {
        try {
          const adapter = requireAdapter(adapters, entry.sourceType);
          await adapter.restore(clone(entry.snapshot));
        } catch (_rollbackError) {
          // The original error remains primary. Adapters should make restore idempotent.
        }
      }
      throw new Error(`Transaction was rolled back: ${safeString(error?.message || error, 800)}`);
    }

    return {
      version: VERSION,
      id: envelope.id,
      proposalId: envelope.proposalId,
      preparedTransactionId: envelope.preparedTransactionId,
      summary: envelope.summary,
      status: "applied",
      operations: clone(envelope.operations),
      adapters: clone(adapterEntries),
      appliedAt: Date.now(),
      undoneAt: 0,
      undoAvailable: true
    };
  }

  async function undoTransaction(receipt = {}, adapters = {}) {
    if (!receipt || receipt.status !== "applied" || receipt.undoAvailable !== true) {
      throw new Error("This transaction is not available to undo.");
    }
    const entries = asArray(receipt.adapters);
    if (!entries.length) throw new Error("The transaction has no undo snapshot.");

    for (const entry of entries) {
      const adapter = requireAdapter(adapters, entry.sourceType);
      const currentFingerprint = safeString(await adapter.fingerprint(clone(entry.snapshot)), 4000);
      if (!entry.afterFingerprint || currentFingerprint !== entry.afterFingerprint) {
        throw new Error("Undo was blocked because the affected data changed after this transaction.");
      }
    }

    const currentSnapshots = [];
    for (const entry of entries) {
      const adapter = requireAdapter(adapters, entry.sourceType);
      currentSnapshots.push({
        sourceType: entry.sourceType,
        snapshot: clone(await adapter.snapshot(clone(entry.operations)))
      });
    }

    try {
      for (const entry of [...entries].reverse()) {
        const adapter = requireAdapter(adapters, entry.sourceType);
        await adapter.restore(clone(entry.snapshot));
      }
    } catch (error) {
      for (const current of currentSnapshots) {
        try {
          const adapter = requireAdapter(adapters, current.sourceType);
          await adapter.restore(clone(current.snapshot));
        } catch (_rollbackError) {
          // Preserve the primary restore failure.
        }
      }
      throw new Error(`Undo could not be completed safely: ${safeString(error?.message || error, 800)}`);
    }

    return {
      ...clone(receipt),
      status: "undone",
      undoAvailable: false,
      undoneAt: Date.now()
    };
  }

  return {
    VERSION,
    DATABASE_OPERATION_TYPES: [...DATABASE_OPERATION_TYPES],
    DATABASE_STRUCTURE_OPERATION_TYPES: [...DATABASE_STRUCTURE_OPERATION_TYPES],
    NOTE_OPERATION_TYPES: [...NOTE_OPERATION_TYPES],
    DOCUMENT_OPERATION_TYPES: [...DOCUMENT_OPERATION_TYPES],
    CANVAS_OPERATION_TYPES: [...CANVAS_OPERATION_TYPES],
    PAGE_OPERATION_TYPES: [...PAGE_OPERATION_TYPES],
    sourceTypeForOperation,
    createEnvelope,
    executePreparedTransaction,
    undoTransaction
  };
});
