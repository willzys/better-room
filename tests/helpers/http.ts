import { expect } from 'bun:test'

import * as z from 'zod'

import { ROOM_STATUSES } from '@/core/room'

const membershipReport = z.strictObject({
  id: z.string().min(1),
  roomId: z.string().min(1),
  actorId: z.string().min(1),
  role: z.string(),
  joinedAt: z.string(),
  expiresAt: z.string().nullable(),
  leftAt: z.string().nullable(),
  revokedAt: z.string().nullable()
})

const roomReport = z.strictObject({
  id: z.string().min(1),
  status: z.enum(ROOM_STATUSES),
  memberCount: z.number(),
  maxMembers: z.number().nullable(),
  expiresAt: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string()
})

const membershipResponse = z.strictObject({
  membership: membershipReport
})

const membershipsResponse = z.strictObject({
  memberships: z.array(
    z.strictObject({ membership: membershipReport, room: roomReport })
  ),
  complete: z.boolean(),
  next: z.string().nullable()
})

const errorResponse = z.object({ code: z.string(), message: z.string() })

export const codeOf = async (response: Response) =>
  errorResponse.parse(await response.json()).code

export const joinedMember = async (response: Response) => {
  expect(response.status).toBe(200)
  return membershipResponse.parse(await response.json()).membership
}

export const listedMemberships = async (response: Response) => {
  expect(response.status).toBe(200)
  return membershipsResponse.parse(await response.json())
}

export const reportedRoom = async (response: Response) => {
  expect(response.status).toBe(200)
  return roomReport.parse(
    z.object({ room: z.unknown() }).parse(await response.json()).room
  )
}

export const jarOf = (response: Response) => {
  expect(response.status).toBe(200)
  const cookies = response.headers.getSetCookie()
  expect(cookies.length).toBeGreaterThan(0)
  return cookies.map(cookie => cookie.slice(0, cookie.indexOf(';'))).join('; ')
}

export const onlyRow = <T>(rows: readonly T[]): T => {
  expect(rows).toHaveLength(1)
  const [row] = rows
  if (row === undefined) throw new Error('Expected exactly one row')
  return row
}

export const stringField = (row: Record<string, unknown>, field: string) =>
  z.string().min(1).parse(row[field])

type Handled = { handler: (request: Request) => Promise<Response> }

const ROUTES = 'http://localhost:3000/api/auth/better-room'

export const postRoute = (
  auth: Handled,
  route: string,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  auth.handler(
    new Request(`${ROUTES}/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    })
  )

export const getRoute = (
  auth: Handled,
  route: string,
  headers: Record<string, string> = {}
) => auth.handler(new Request(`${ROUTES}/${route}`, { headers }))
