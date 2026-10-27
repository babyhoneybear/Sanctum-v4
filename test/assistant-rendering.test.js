const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../smart-notes.js'), 'utf8');
const functions = new Map([...source.matchAll(/^  function (\w+)\([^]*?^  \}\r?$/gm)]
  .map(match => [match[1], match[0]]));

function proposalMessage(id, relation = false) {
  return {
    id, role: 'assistant', text: `Saved reply ${id}`, createdAt: 1,
    databaseProposal: {
      summary: `Saved proposal ${id}`,
      operations: [{
        id: `op-${id}`, type: 'update-database-row', databaseRef: 'db:source',
        changes: [{ propertyId: 'field', propertyName: relation ? 'Related' : 'Title',
          propertyType: relation ? 'relation' : 'text', oldValue: 'Before', newValue: relation ? ['row-1'] : 'After' }]
      }],
      review: { selectedOperationIds: [`op-${id}`] }
    }
  };
}

function harness(messages) {
  let builds = 0;
  let rowTitle = 'Current row';
  const host = { innerHTML: '', dataset: {}, scrollHeight: 100, scrollTop: 0 };
  const context = {
    activeAssistantOpen: false, activeAssistantBusy: false, activeAssistantStage: '',
    activeAssistantEditMessageId: '', activeAssistantTransactionMessageId: '',
    assistantRenderRevision: 0, activeUser: { displayName: 'You' }, chatMessages: messages,
    document: {
      getElementById: id => id === 'assistantMessages' ? host : null,
      body: { classList: { toggle() {} } }
    },
    escapeHTML: value => String(value ?? ''),
    getAssistantDisplayName: () => 'Warden',
    formatAssistantMessageText: value => value,
    formatAssistantTime: () => '12:00', formatDateTime: () => 'Today',
    normalizeAssistantTransactionReceipt: value => value || null,
    renderAssistantActions: () => '',
    buildSanctumContextCatalog() {
      builds++;
      return {
        schemas: [{ ref: 'db:source', properties: [{ id: 'field', relationTarget: { pageId: 'target' } }] }],
        records: [{ kind: 'database-row', parentRef: 'db:target', id: 'row-1', title: rowTitle }]
      };
    },
    SanctumAssistantOperations: {
      describeOperation: () => 'Update record',
      databaseRefFromSource: () => 'db:target'
    }
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ['formatProposalValue', 'findProposalSchema', 'getProposalRelationRows',
    'renderProposalRelationSelect', 'renderProposalChangeEditor', 'renderAssistantDatabaseProposal',
    'renderAssistantMessages', 'setAssistantOpen']) {
    assert.ok(functions.has(name), name);
    vm.runInContext(functions.get(name), context);
  }
  return { context, host, builds: () => builds, renameRow: value => { rowTitle = value; } };
}

test('closed Warden skips history rendering and vault indexing without losing saved proposals', () => {
  const messages = Array.from({ length: 25 }, (_, i) => proposalMessage(String(i), true));
  const before = JSON.stringify(messages);
  const h = harness(messages);
  h.context.renderAssistantMessages();
  assert.equal(h.builds(), 0);
  assert.equal(h.host.innerHTML, '');
  h.context.setAssistantOpen(true);
  assert.match(h.host.innerHTML, /Saved proposal 24/);
  assert.equal(JSON.stringify(messages), before);
});

test('opening ordinary saved proposals does not build the vault catalog', () => {
  const h = harness(Array.from({ length: 25 }, (_, i) => proposalMessage(String(i))));
  h.context.setAssistantOpen(true);
  assert.equal(h.builds(), 0);
  assert.match(h.host.innerHTML, /Saved reply 24/);
  assert.match(h.host.innerHTML, /Apply 1 change/);
  assert.match(h.host.innerHTML, /value="After"/);
});

test('all relationship editors share one catalog and reopening uses current vault records', () => {
  const relation = proposalMessage('direct');
  relation.databaseProposal.operations[0] = {
    id: 'op-direct', type: 'relate-database-rows', targetDatabaseRef: 'db:target', targetRowIds: ['row-1']
  };
  const h = harness([proposalMessage('first', true), proposalMessage('second', true), relation]);
  h.context.setAssistantOpen(true);
  assert.equal(h.builds(), 1);
  assert.equal((h.host.innerHTML.match(/Current row/g) || []).length, 3);
  assert.match(h.host.innerHTML, /value="row-1" selected/);
  h.context.renderAssistantMessages();
  assert.equal(h.builds(), 1, 'unchanged renders keep the editor intact');
  h.context.setAssistantOpen(false);
  h.renameRow('Renamed row');
  h.context.setAssistantOpen(true);
  assert.equal(h.builds(), 2);
  assert.equal((h.host.innerHTML.match(/Renamed row/g) || []).length, 3);
});

test('applied proposals retain their receipt and Undo when history opens', () => {
  const message = proposalMessage('applied');
  message.transactionReceipt = { status: 'applied', operations: [{}], adapters: [], undoAvailable: true };
  const h = harness([message]);
  h.context.setAssistantOpen(true);
  assert.match(h.host.innerHTML, /1 change completed/);
  assert.match(h.host.innerHTML, /Undo changes/);
  assert.doesNotMatch(h.host.innerHTML, /Apply 1 change/);
  assert.equal(h.builds(), 0);
});
