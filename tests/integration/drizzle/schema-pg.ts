import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull()
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', {
    withTimezone: true
  }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', {
    withTimezone: true
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull()
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull()
})

export const roomActor = pgTable('roomActor', {
  id: text('id').primaryKey(),
  userId: text('userId').unique(),
  grantEpoch: integer('grantEpoch').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull()
})

export const room = pgTable('room', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  memberCount: integer('memberCount').notNull(),
  maxMembers: integer('maxMembers'),
  expiresAt: timestamp('expiresAt', { withTimezone: true }),
  createdBy: text('createdBy').references(() => roomActor.id, {
    onDelete: 'set null'
  }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull()
})

export const roomCode = pgTable('roomCode', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  roomId: text('roomId')
    .notNull()
    .references(() => room.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull()
})

export const roomMember = pgTable(
  'roomMember',
  {
    id: text('id').primaryKey(),
    roomId: text('roomId')
      .notNull()
      .references(() => room.id, { onDelete: 'cascade' }),
    actorId: text('actorId')
      .notNull()
      .references(() => roomActor.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    joinedAt: timestamp('joinedAt', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }),
    leftAt: timestamp('leftAt', { withTimezone: true }),
    revokedAt: timestamp('revokedAt', { withTimezone: true }),
    occupancy: integer('occupancy').notNull(),
    releasedAt: timestamp('releasedAt', { withTimezone: true })
  },
  table => [
    uniqueIndex('room_member_room_actor_uidx').on(table.roomId, table.actorId)
  ]
)

export const roomAttempt = pgTable('roomAttempt', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastAttemptAt: timestamp('lastAttemptAt', { withTimezone: true }).notNull()
})

export const schema = {
  user,
  session,
  account,
  verification,
  roomActor,
  room,
  roomCode,
  roomMember,
  roomAttempt
}
