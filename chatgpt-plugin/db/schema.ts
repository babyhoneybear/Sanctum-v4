import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const bridges = sqliteTable('bridges', {
  owner: text('owner').primaryKey(),
  id: text('id').notNull().unique(),
  seen: integer('seen').notNull(),
});

export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(),
  owner: text('owner').notNull(),
  bridge: text('bridge').notNull(),
  method: text('method').notNull(),
  args: text('args').notNull(),
  state: text('state').notNull(),
  result: text('result'),
  created: integer('created').notNull(),
  expires: integer('expires').notNull(),
}, table => [index('commands_owner_bridge').on(table.owner, table.bridge, table.state)]);
