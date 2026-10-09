import { betterAuth } from 'better-auth'

import { betterRoom } from '@/plugin'

import { jarOf } from './http'

import type { BetterAuthOptions } from 'better-auth/types'

import type { RoomOptions } from '@/plugin/options'

export const SECRET = 'better-room-test-secret-long-enough'

type Extra = Pick<BetterAuthOptions, 'advanced' | 'databaseHooks' | 'secret'>

export const authOptions = (
  database: BetterAuthOptions['database'],
  room?: RoomOptions,
  extra: Extra = {}
) => ({
  secret: SECRET,
  baseURL: 'http://localhost:3000',
  database,
  emailAndPassword: { enabled: true },
  user: { deleteUser: { enabled: true } },
  ...extra,
  plugins: [betterRoom(room)]
})

export const roomAuth = (
  database: BetterAuthOptions['database'],
  room?: RoomOptions,
  extra?: Extra
) => betterAuth(authOptions(database, room, extra))

type RoomAuth = Pick<ReturnType<typeof roomAuth>, 'api'>

export const account = (email: string) => ({
  email,
  password: 'a-long-enough-password',
  name: 'Someone'
})

export const signedIn = async (auth: RoomAuth, email: string) =>
  jarOf(await auth.api.signUpEmail({ body: account(email), asResponse: true }))

export const registered = async (auth: RoomAuth, email: string) =>
  (await auth.api.signUpEmail({ body: account(email) })).user.id
