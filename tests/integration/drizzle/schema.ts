import { relations } from 'drizzle-orm'
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core'

const stamp = (name: string) => integer(name, { mode: 'timestamp_ms' })

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull(),
  image: text('image'),
  createdAt: stamp('createdAt').notNull(),
  updatedAt: stamp('updatedAt').notNull()
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: stamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: stamp('createdAt').notNull(),
  updatedAt: stamp('updatedAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: stamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: stamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: stamp('createdAt').notNull(),
  updatedAt: stamp('updatedAt').notNull()
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: stamp('expiresAt').notNull(),
  createdAt: stamp('createdAt').notNull(),
  updatedAt: stamp('updatedAt').notNull()
})

export const roomActor = sqliteTable('roomActor', {
  id: text('id').primaryKey(),
  userId: text('userId').unique(),
  grantEpoch: integer('grantEpoch').notNull(),
  createdAt: stamp('createdAt').notNull()
})

export const room = sqliteTable('room', {
  id: text('id').primaryKey(),
  status: text('status', { enum: ['active', 'locked', 'closed'] }).notNull(),
  memberCount: integer('memberCount').notNull(),
  maxMembers: integer('maxMembers'),
  expiresAt: stamp('expiresAt'),
  createdBy: text('createdBy').references(() => roomActor.id, {
    onDelete: 'set null'
  }),
  createdAt: stamp('createdAt').notNull()
})

export const roomCode = sqliteTable('roomCode', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  roomId: text('roomId')
    .notNull()
    .references(() => room.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['active', 'grace', 'revoked'] }).notNull(),
  expiresAt: stamp('expiresAt'),
  revokedAt: stamp('revokedAt'),
  createdAt: stamp('createdAt').notNull()
})

export const roomMember = sqliteTable(
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
    joinedAt: stamp('joinedAt').notNull(),
    expiresAt: stamp('expiresAt'),
    leftAt: stamp('leftAt'),
    revokedAt: stamp('revokedAt'),
    occupancy: integer('occupancy').notNull(),
    releasedAt: stamp('releasedAt')
  },
  table => [
    uniqueIndex('room_member_room_actor_uidx').on(table.roomId, table.actorId)
  ]
)

export const roomAttempt = sqliteTable('roomAttempt', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastAttemptAt: stamp('lastAttemptAt').notNull()
})

export const roomActorRelations = relations(roomActor, ({ one }) => ({
  user: one(user, { fields: [roomActor.userId], references: [user.id] })
}))

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
