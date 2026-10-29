# Reference

## Capture the code when you create the room

> [!IMPORTANT]
>
> Plaintext codes are returned only by `createRoom` and `rotateRoomCode`. A code is never readable afterwards, by you or by anyone holding the database.

The code is stored as an HMAC of its canonical form, keyed by a subkey derived from your Better Auth secret. No reversible copy exists anywhere, so no later request can report it. If you drop it, the only way to get a working code for that room is to rotate, which issues a different one.

This is deliberate: a room code is a secret that admits strangers, and a database dump should not hand an attacker a working key to every live room.

Four ways applications handle it, in rough order of how often they fit:

1. **Return it to the caller who created the room** and let the client hold it in component state for as long as the "waiting for people" screen lives. Enough for a code displayed once and read out loud.
2. **Store it next to your own room record**, encrypted with a key you control. Right when a host reopens the page days later and must see the same code.
3. **Rotate on demand** and show the new code. Right when the old one does not need to keep working; the previous code still admits for the grace window.
4. **Keep it out of persistence entirely** and have the host share it through your own channel, such as a link or an invitation email, at creation time.

## Operations

| Operation | Route | Reachable from |
| --- | --- | --- |
| `createRoom` | `POST /better-room/create` | `auth.api`, plus HTTP when `creation.overHttp` is on |
| `joinRoom` | `POST /better-room/join` | anyone |
| `getRoomAccess` | `GET /better-room/access` | anyone; the room is reported only to a caller related to it |
| `getRoomOccupancy` | `GET /better-room/occupancy` | members of the room, and `auth.api` for any room |
| `listRoomMemberships` | `GET /better-room/memberships` | anyone |
| `listRoomMembers` | `GET /better-room/members` | members of the room, and `auth.api` for any room |
| `renameRoomMember` | `POST /better-room/rename` | members of the room |
| `leaveRoom` | `POST /better-room/leave` | anyone |
| `promoteRoomActor` | `POST /better-room/promote` | anyone, and `auth.api` to resume one |
| `addRoomMember` | none | `auth.api` only |
| `rotateRoomCode` | none | `auth.api` only |
| `revokeRoomMember` | none | `auth.api` only |
| `lockRoom` | none | `auth.api` only |
| `unlockRoom` | none | `auth.api` only |
| `closeRoom` | none | `auth.api` only |
| `reconcileRoomCapacity` | none | `auth.api` only |
| `recountRoomCapacity` | none | `auth.api` only |
| `pruneRoomAttempts` | none | `auth.api` only |
| `retireRoomCodes` | none | `auth.api` only |

Administrative operations are server-only on purpose. The plugin has no permission engine and roles are an open set of opaque strings, so it cannot know which of your roles may rotate a code or add a member. That decision stays in your backend, where quota, plan and workspace policy already live.

Every id a caller passes, a `roomId`, an `actorId` or the room id inside a listing cursor, is checked against `advanced.database.generateId` before any query. An id that cannot exist there, one that is not a positive integer under `'serial'`, not a UUID under `'uuid'`, or empty or longer than 255 characters otherwise, is answered exactly as an id that names nothing, instead of reaching a database that would reject its type with a 500.

They are not routes at all. Better Auth never mounts them on its router, so an HTTP request to any path you might guess answers `404`, they are absent from the OpenAPI schema, and the client does not offer them. Your backend calls them through `auth.api`, after deciding the caller's authority itself. An application that wants a host to lock a room over HTTP writes its own endpoint and calls `auth.api.lockRoom` from it.

Self-service operations are public: joining, reading your own access, counting a room you are in, listing your own memberships, leaving and promoting. Each is confined to the caller's own actor and grants nothing the caller did not already hold.

### Creating a room

```ts
const { room, code } = await auth.api.createRoom({
  body: {
    userId: creator.id, // optional, recorded as provenance only
    maxMembers: 8, // optional, unbounded when absent
    expiresAt: new Date(Date.now() + 3_600_000) // optional, never when absent
  }
})
```

On the server, a `userId` must name an existing user and is refused as `UNKNOWN_USER` otherwise, before anything is written. Over HTTP, with `creation.overHttp` on, the caller must hold a session and is recorded as the creator; `userId` is ignored there. `maxMembers` is a positive integer, and an `expiresAt` that is not in the future is refused as `ROOM_EXPIRES_IN_THE_PAST` before anything is written, the creator's actor included. An `expiresAt` after `9999-12-31T23:59:59.999Z` is refused as `VALIDATION_ERROR`, since no supported database orders a later one correctly. When no free code can be issued the room is removed again and the call answers `CODE_SPACE_EXHAUSTED`; only the creator's actor may remain, and the next creation or join of that user reuses it.

Creation over HTTP has no quota of its own: a signed-in user can create rooms as fast as Better Auth's rate limit on the route allows. Where that matters, keep `creation.overHttp` off and create rooms from an endpoint of your own through `auth.api.createRoom`, after whatever check your plan or workspace needs, or tighten the route with a `rateLimit.customRules` entry that sets a window and a maximum.

A newly created room has no members at all. `room.createdBy` records which actor opened it and grants no authority inside it: there is no host here, only the roles your application names. It does make the creator related to the room, so a room created over HTTP stays readable through `getRoomAccess` by the caller who opened it, although that caller holds no membership there.

### Joining

```ts
const { data, error } = await client.betterRoom.join({ code: 'K7QD2M4P' })

if (error) throw new Error(error.message)

const { membership } = data
```

An anonymous caller gets a signed grant cookie naming their actor, `room_grant` under Better Auth's cookie prefix, valid for `grant.lifetime`. A caller with a Better Auth session resolves to that user's actor instead and carries no grant. Codes are matched after folding case and stripping spaces and dashes, so `k7qd-2m4p` is the same code.

With `join.requireSession` on, a caller without a Better Auth session is refused as `JOIN_NEEDS_A_SESSION`, including a server call that carries no session headers. The refusal comes after the code resolves, so an unknown code still answers `CODE_DID_NOT_RESOLVE` and counts against the attempt budgets, and before anything is written, so no actor, seat or grant is left behind. A locked room asks for the session too, since it tells a member joining again apart from a stranger by who the caller is. It only governs new joins: anonymous members admitted before it was switched on keep their access until it expires or is revoked.

A join the room refuses writes nothing for a caller the plugin has not seen before. The actor is created only after the room is known to admit joins and to have a free seat, so a closed, locked, expired or full room answers its refusal without leaving an actor row per attempt. Two callers racing for the last seat can still each create an actor, and the one turned away keeps it. A code longer than 1024 characters is refused as `VALIDATION_ERROR` before anything is read or counted.

Each anonymous identity holds a seat of its own. A caller who clears their cookies, or whose grant expires, comes back as a new actor and takes another seat, while the earlier membership keeps its seat until it leaves, is revoked or reaches its own deadline. Anyone holding the code can therefore fill a room's `maxMembers` from fresh browsers. Where that matters, turn on `join.requireSession` so each seat belongs to a user, or revoke the memberships you no longer want with `revokeRoomMember`.

`join.expireAnonymousSeats` bounds how long such a seat lasts. With it on, an anonymous actor's memberships and its grant all end `grant.lifetime` after the actor was created, and the grant is no longer extended by later joins. `reconcileRoomCapacity` then takes those seats back, so seats abandoned by cleared cookies return on their own. A caller whose actor has lapsed joins again as a new actor. A signed-in user's seat keeps no deadline.

The grant cookie is `Secure` only when Better Auth's cookies are: an `https` `baseURL`, or `advanced.useSecureCookies`, turns it into `__Secure-better-auth.room_grant`. Better Auth does not read the scheme from `X-Forwarded-Proto`, so behind a proxy that terminates TLS while `baseURL` says `http`, the grant travels without `Secure`. Set an `https` `baseURL` in production.

Better Auth checks a request's `Origin` only when it carries cookies, so a join from another site without cookies is accepted like any other anonymous join. A browser cannot send one as JSON without a CORS preflight your server does not answer, and the endpoint does not accept form encodings, so another site cannot make a visitor's browser join a room.

### Reading access

```ts
const { data, error } = await client.betterRoom.access({ query: { roomId } })

if (error) throw new Error(error.message)

const { authorized, room, membership } = data
```

`authorized` says whether the caller may act in the room right now. `room` is the room's report, and `membership` the caller's own membership there, or `null` when it holds none.

Over HTTP, the room is reported only to a caller related to it: one that holds or once held a membership there, including one that left or was revoked, or the actor that created it. Anyone else gets `{ authorized: false, room: null, membership: null }`, and gets exactly that whether the room exists or not, so room ids cannot be walked to learn which rooms exist, how full they are or who opened them. A former member still reads the room, so it can see that the room closed. Someone holding a code learns the room's state by joining, which names the reason once the code resolves.

Called through `auth.api` from your server, `getRoomAccess` reports any room in full and throws `UNKNOWN_ROOM` for one that does not exist. That answer is for your backend: do not forward it as is to a caller who could not have read it over HTTP.

### Counting who is in a room

```ts
const { data, error } = await client.betterRoom.occupancy({
  query: { roomId }
})

if (error) throw new Error(error.message)

const { occupied, maxMembers } = data
```

`occupied` is the number of memberships that hold the room right now: joined, not left, not revoked and not past their own deadline. It is counted from the memberships themselves, so it is exact once concurrent changes settle, unlike `room.memberCount`, which is the admission gate and may sit above real occupancy after a departure that failed halfway. Show `occupied`, not `memberCount`, as the number of people in a room. It is read as two counts, one for memberships without a deadline and one for those with a future deadline, so a membership that leaves and is readmitted between them can be counted twice or not at all for that one read.

It counts memberships, not presence. Someone who joined and closed the tab days ago still occupies the room until they leave, are revoked or expire; who is online right now belongs to your own realtime transport.

Only someone `access` would authorize can read it over HTTP, so a caller outside the room gets `403 NOT_A_MEMBER`, and so does a caller naming a room that does not exist. The server reads any room through `auth.api.getRoomOccupancy({ query: { roomId } })`, and gets `UNKNOWN_ROOM` for a missing one.

### Listing your memberships

```ts
const { data, error } = await client.betterRoom.memberships()

if (error) throw new Error(error.message)

const { memberships, complete, next } = data
```

Each entry pairs a membership with its room. Every listed entry is one `access` for that room would report as `authorized: true`, because both decide through the same predicate, and once you have read every page, every such membership has been listed. A single partial page makes only the first of those promises. A membership you left, that was revoked, that expired, or whose room has closed or expired is not listed. A locked room still is, since locking preserves the memberships already in place.

`complete` is `false` when you hold more standing memberships than one answer covers. That read is bounded at 200 rather than scanning an unbounded history, and a partial answer carries `next`, an opaque cursor. Pass it back as `before` to read the following page, and stop when `next` is `null`:

```ts
const pages = []
let before: string | undefined

do {
  const { data, error } = await client.betterRoom.memberships({
    query: { before }
  })

  if (error) throw new Error(error.message)

  pages.push(...data.memberships)
  before = data.next ?? undefined
} while (before !== undefined)
```

Pages follow the id of each membership's room, not recency, so the order is stable but carries no meaning; sort a page yourself if you want the newest first. Memberships without a deadline come first, then those with one.

The 200 bound applies to the memberships read, before rooms that have closed or expired are filtered out. A page can therefore hold fewer than 200 entries, or none, while `next` still points forward; keep following `next` rather than stopping at an empty page.

A value that is not shaped like a cursor is refused as `400 UNREADABLE_CURSOR`, and so is one naming a room id that cannot exist under your `generateId` mode. The cursor is not signed, so a well-shaped value you build yourself is accepted and resumes after the room id it names; it can only skip your own memberships, never reveal anyone else's. Rows that join, leave or are revoked between two pages can shift what a later page holds, as with any cursor over live data.

### Adding a member with a role

```ts
const { membership } = await auth.api.addRoomMember({
  body: { roomId, userId: invitee.id, role: 'facilitator' }
})
```

Name the member by exactly one of `userId` or `actorId`; both or neither is a `BAD_REQUEST`. `userId` resolves that user's actor and creates it when there is none. `actorId` resolves nothing and is refused as `UNKNOWN_ACTOR` when no such actor exists.

An optional `expiresAt` gives the membership its own deadline, and one that is not in the future is refused as `MEMBERSHIP_EXPIRES_IN_THE_PAST`. One after `9999-12-31T23:59:59.999Z` is refused as `VALIDATION_ERROR`, as it is for a room. Addition takes a seat like a join and is refused when the room is full, closed or expired, but not when it is locked: locking stops codes, not your backend. An actor who still holds a membership there is refused as `ALREADY_A_MEMBER`, and one whose membership was revoked as `MEMBERSHIP_REVOKED`, since revocation is permanent. An actor who left is readmitted on the same membership: it takes a seat again and carries the role, `name` and `expiresAt` this call names, not the ones it had before. `name` is optional and follows the rules under [Names in a room](#names-in-a-room).

An elevated role can only come from server-side addition, never from presenting a code. That is what keeps discovery and privilege separate.

### Names in a room

```ts
await client.betterRoom.join({ code: 'K7QD2M4P', name: 'Ana' })
await client.betterRoom.rename({ roomId, name: 'Ana Clara' }) // null clears it
```

A membership can carry a name of its own, `displayName`, which only that room shows. It is optional everywhere: `join` and `addRoomMember` take it as `name`, a rejoin that passes one replaces the name it had, and `renameRoomMember` changes or clears it for the caller's own membership, which must still authorize, answering as `leaveRoom` does otherwise. A change raises `renamed`.

A signed-in member without a name of its own is shown by the name on their account, read when the room is listed, so renaming the account renames them everywhere they have not chosen a name. An anonymous member without one has no name, and your interface picks what to show, such as "Guest".

A name is caller input, so it is normalised to NFC, runs of spaces collapse to one, and it is trimmed. One that is empty or longer than 48 characters, or holds a line break, a control character or an invisible formatting character such as a zero-width space or a bidirectional override, is refused as `VALIDATION_ERROR`. Names are not unique and are not checked against roles, so an anonymous member can call itself "Host": show `anonymous` beside a name wherever that matters.

### Listing who holds a room

```ts
const { data } = await client.betterRoom.members({ query: { roomId } })

for (const { name, anonymous, membership } of data.members) {
  // name: the member's own name, else the account's, else null
}
```

Each entry pairs a membership with the name to show and whether its actor is anonymous; a user id is never reported. The listing holds the memberships `getRoomOccupancy` counts: joined, not left, not revoked and not past their own deadline, which is not the same as who is online. It pages 100 entries at a time with `complete` and `next` exactly like `listRoomMemberships`, following the id of each member's actor. Over HTTP only a member the room authorizes may read it, and anyone else gets `403 NOT_A_MEMBER` whether the room exists or not; called through `auth.api` it lists any room and throws `UNKNOWN_ROOM` for one that does not exist.

### Leaving, and being revoked

```ts
const { error } = await client.betterRoom.leave({ roomId })

if (error) throw new Error(error.message)

await auth.api.revokeRoomMember({ body: { roomId, actorId } })
```

Both return the seat the membership occupied, and both preserve the membership row. Leaving lets the same actor rejoin later; revoking is what makes a later join refuse. Leaving never overrides a revocation or an expiry, so it is refused on a membership that already carries one. Over HTTP, leaving a room you hold nothing in is refused as `403 NOT_A_MEMBER`, whether or not that room exists.

Leaving a membership already left answers with it again and returns no second seat; revoking one already revoked is refused as `ALREADY_REVOKED`. When two of these race on one membership, the one that loses answers exactly as it would have arriving second: a leave overtaken by a revocation is refused as `MEMBERSHIP_REVOKED`, and the second of two revocations as `ALREADY_REVOKED`.

### Signing in without losing the room

```ts
const { data, error } = await client.betterRoom.promote()

if (error) throw new Error(error.message)

const { carried, discarded, complete, merged } = data
```

Someone who joined with a code holds an anonymous actor. When they sign in, the session resolves to a different actor that holds nothing in that room, so promotion merges the first into the second and carries its memberships across. It needs both carriers on the request, and it is never inferred from the two merely arriving together.

Where both actors already hold a membership in one room, the authenticated one is kept and the anonymous one discarded, by a fixed rule rather than by role, so promotion cannot become a way to acquire one.

`complete` is `false` when the actor held more memberships than one call carries, which is up to 10000. The anonymous actor and its remaining memberships are left in place, and `merged` names it so the application can finish the merge from its backend:

```ts
await auth.api.promoteRoomActor({ body: { actorId: merged, userId } })
```

That form is server-only, because the grant is already invalid by then: promotion kills every grant naming the actor before it moves anything.

Signing out through Better Auth expires the grant cookie too. Without that, the next person to sign in on the same browser would still carry the previous visitor's grant and could promote that anonymous actor into their own account.

### Locking, closing and reconciling

```ts
await auth.api.lockRoom({ body: { roomId } })
await auth.api.unlockRoom({ body: { roomId } })
await auth.api.closeRoom({ body: { roomId } })

const { owing, released } = await auth.api.reconcileRoomCapacity({
  body: { batch: 200 } // optional, 1 to 1000
})
```

Locking refuses joins by code and keeps the memberships already in place; `addRoomMember` still adds to a locked room. A member who joins a locked room again is answered with the membership it holds, as in an open room, while a member who left is refused as `ROOM_LOCKED`. Closing ends the room and cannot be undone. Lock, unlock and close each return `{ room }`, and asking for the state a room already has succeeds without a write. Reconciling runs in bounded batches of `batch` memberships, 200 when absent, so a schedule can call it repeatedly until `owing` comes back `0`. It collects memberships that still hold a seat while no longer occupying one: a deadline that passed, and a revocation that marked its membership but stopped before returning the seat. A departure needs no collecting, because leaving marks the membership and gives up its seat in one write. A seat is taken back only while its membership still owes it when the write lands, so a membership readmitted after a batch was read keeps its seat.

```ts
await auth.api.lockRoom({ body: { roomId } })
const { before, after } = await auth.api.recountRoomCapacity({
  body: { roomId }
})
await auth.api.unlockRoom({ body: { roomId } })
```

`recountRoomCapacity` sets `memberCount` to the seats the room's memberships hold, which repairs the drift described below. It needs the room locked and answers `ROOM_NOT_LOCKED` otherwise, because a join between taking its seat and writing its membership holds a seat no membership shows yet, and counting then would set the gate below occupancy. Lock the room, let requests already in flight finish, recount, then unlock. An addition still reaches a locked room, so pause `addRoomMember` for that room while you recount. The recount raises no event.

Concurrent requests never move the counter away from real occupancy: two joins of one actor, a join racing a revocation, a lock or a user deletion all settle with `memberCount` equal to the seats held. Only a write that fails partway can leave it above, when the connection drops or the process stops between two writes: after taking a seat and before writing the membership that holds it, or after a membership gave up its seat and before the room's counter was lowered. Reconciling recollects what a membership still owes; in both of those cases no membership is marked as owing anything, so the seat stays counted. Drift in that direction refuses a free seat rather than admitting past the limit, which is the direction the gate is built to fail in.

### Rotating a code

```ts
const { code } = await auth.api.rotateRoomCode({ body: { roomId } })
```

The previous code keeps admitting for the grace window, so a code already shared does not break the moment you rotate. Only one generation is kept in grace: rotating again revokes the code still in its window. A closed or expired room cannot be rotated, since no code could admit anyone there; a locked one can.

### Retiring spent codes

```ts
const { retired, complete } = await auth.api.retireRoomCodes()
```

A revoked code, or one whose grace window has passed, can never admit anyone again, yet its row keeps its value out of the code space, because the uniqueness of `roomCode.identifier` is permanent. `retireRoomCodes` deletes those rows in bounded pages; when it answers `complete: false`, call it again. With `numeric` codes this is what keeps the space from running out, so schedule it alongside `reconcileRoomCapacity` and `pruneRoomAttempts`.

A retired value can be issued again to a new room, so someone who still remembers an old code would reach whichever room draws it next. With the default 8 Crockford symbols that is negligible; with short numeric codes, it is the price of reusing the space.

Rooms, memberships and actors are never deleted by the plugin. A closed room and the memberships in it are your application's history, and removing them is a decision about your data that belongs to your backend.

## Options

```ts
betterRoom({
  code: {
    format: 'crockford', // or 'numeric'
    length: 8, // numeric defaults to 6
    grace: 120 // seconds the replaced code keeps admitting
  },
  grant: { lifetime: 60 * 60 * 24 * 7 },
  creation: { overHttp: false },
  join: {
    requireSession: false,
    concealRefusals: false, // answer a refused room as CODE_DID_NOT_RESOLVE
    expireAnonymousSeats: false // end anonymous seats with their grant
  },
  attempts: {
    window: 60,
    perIp: 10,
    everyone: 600,
    progressive: false, // pace an address's failures inside its window
    reserve: false // count an attempt before the code resolves
  },
  schema: {
    // rename tables and columns; room and roomMember also take additionalFields
  },
  hooks: {
    onEvent: event => {
      // forward room changes to your realtime transport, see Realtime
    }
  }
})
```

An option the plugin does not know, such as `attempts.perIP` or `code.lenght`, throws a `TypeError` that names it and lists the accepted ones, instead of being ignored while its default applies. The numeric options below are checked when the plugin is constructed, so a value outside its range throws a `RangeError` from `betterRoom()` rather than surfacing later on the request that first uses it. `creation.overHttp` and `join.requireSession` must be real booleans, so a JavaScript caller passing `'false'` gets a `TypeError` instead of an enabled flag. Each group, `code`, `grant`, `creation`, `join` and `attempts`, must be an object when given, and only an absent value takes its default, so `null` is refused like any other wrong type. `code.format` must name a known format, and `hooks` must be an object whose keys are hook names and whose values are functions; anything else is a `TypeError` too, so a misspelled hook such as `onJoin` fails at construction instead of silently falling through to `onEvent`. Passing the removed `onChange` throws a `TypeError` that points at `hooks.onEvent`. An `additionalFields` entry named after a field the plugin owns, such as `occupancy` or `id`, throws a `TypeError` too, because it would silently replace the plugin's definition. So does a renamed field, or an additional field's `fieldName`, that lands on a column another field of the same table already uses, `id` included, since two fields would then read and write one column; a renamed table or a malformed field of your own still surfaces through Better Auth's schema handling.

Each duration has a ceiling as well as a floor, because a value large enough to overflow date arithmetic yields an invalid date, every comparison against it is false, and the mechanism it configures stops working while still looking configured. An attempt window past its ceiling would stop counting attempts at all.

| Option              | Default               | Range                 |
| ------------------- | --------------------- | --------------------- |
| `code.grace`        | 120                   | 1 to 86400 seconds    |
| `grant.lifetime`    | 604800                | 1 to 34560000 seconds |
| `attempts.window`   | 60                    | 1 to 86400 seconds    |
| `attempts.perIp`    | 10                    | 1 to `everyone`       |
| `attempts.everyone` | 600                   | 1 to 2147483647       |
| `code.length`       | 8, or 6 for `numeric` | 1 to 64 symbols       |

A ceiling per address set above the ceiling for everyone could never be reached, so `betterRoom()` refuses it with a `RangeError`; setting only `everyone` below the default `perIp` is accepted. The attempt ceilings and the `maxMembers` a room is created with stop at 2147483647, the largest value a PostgreSQL `integer` column stores. `createRoom` refuses a larger `maxMembers` with 400 rather than letting the database fail.

Call `betterRoom()` once per `betterAuth()` instance. The code subkey is derived from the secret of the instance the plugin first binds to, so handing the same plugin object to a second instance with another secret throws when that instance initialises.

Changing the Better Auth `secret` changes every key the plugin derives from it. Every live code stops resolving, every anonymous grant stops verifying, so anonymous members lose the memberships they held, and every address budget starts again. Treat a secret rotation as that event: rotate the code of each room you keep, and expect anonymous members to join again.

A code's identifier is the HMAC of its format and its canonical form, so `123456` under `numeric` and under a 6-symbol `crockford` are two different codes, and switching `code.format` stops every code issued under the old one. Codes issued before identifiers named their format are stored under the older identifier, which joins still look up, so they keep working until they are rotated or retired; a new code is never drawn where it would collide with one of them.

`crockford` draws from a 32-symbol alphabet without the letters that look like digits, and folds `I` and `L` to `1` and `O` to `0` on input. `numeric` is digits only, for keypads and phone prompts.

The length of a code is its security parameter, because a code resolves a room on its own and an attacker sweeps the space rather than one room. 8 Crockford symbols span about 1.1e12 values. 6 digits span 1e6, so with a thousand live rooms, guesses spread across enough addresses land in one of them half the time within about 700 tries, whatever the ceilings say. When a code space is below a billion values and `join.requireSession` is off, the plugin logs a warning when it starts. Prefer a longer code, or require a session, before shipping short numeric codes to strangers. A CAPTCHA in front of joins works as well: Better Auth's `captcha` plugin verifies the routes in its `endpoints` option, so add `/better-room/join` there.

`attempts.progressive` slows an address down inside its window instead of only stopping it at the ceiling. From its second failure, an address waits 1, 2, 4 and then twice as many seconds after its window opened before another attempt is read, never past the window itself, and an attempt that arrives sooner is refused as `TOO_MANY_ATTEMPTS` without being counted. With a 60 second window that holds an address to about eight guesses whatever `perIp` says.

### Brute force

A failed code is counted twice: against the caller's address and against a global budget. Each budget counts in a fixed window that opens with its first failure and closes `attempts.window` seconds later, whatever arrives in between, so failures trickling in from many addresses cannot keep the global budget spent past its window. An address that spends its own ceiling is refused until its window closes. The global ceiling only gates an address that has a failure of its own on record, so a flood cannot lock out callers who never guessed anything. There is no per-room lockout, because that would let anyone who knows a room exists lock its members out of it.

The gate in front of the join is a read and the count behind it is the guarded write, so failures that arrive together are let through before any of them is counted. The ceilings bound failures that follow one another; a burst sent at once is bounded by Better Auth's own rate limit on the route, and the count stays exact either way.

`attempts.reserve` closes that gap. Each attempt from an address is counted before its code is looked up, and an attempt whose count passes `perIp` is refused before it can learn anything; a code that resolves gives its reservation back. A burst of guesses then gets at most `perIp` answers. The cost is the case the default protects: a crowd behind one address presenting the right code at once can be refused while its reservations are in flight, and every attempt, refused or not, writes to `roomAttempt`.

An address is stored as an HMAC keyed by a subkey of your Better Auth secret, never in the clear, so `roomAttempt` holds no address a database dump reveals.

The address comes from Better Auth's `getIP`, which reads the headers in `advanced.ipAddress.ipAddressHeaders` and strips the proxies listed in `advanced.ipAddress.trustedProxies`. When it resolves none, for instance behind a proxy that appends to `x-forwarded-for` without being trusted, the failure is counted only against the global budget, and a caller without an address is gated on the global ceiling alone. Every such caller then shares one budget, and one sweep can refuse everyone's join until the window closes. Configure `advanced.ipAddress` so each caller resolves to its own address; Better Auth logs that it could not determine a client IP when it does not.

A failure that finishes after a later one is still counted and never moves its budget's window back. A server whose clock runs behind the others therefore cannot shorten a lockout, while one whose clock runs ahead lengthens it.

```ts
const { pruned, complete } = await auth.api.pruneRoomAttempts()
```

A budget whose window has passed is removed whenever any budget starts a new window, so under steady traffic `roomAttempt` stays small, but once failures stop, the addresses that tried once and never returned stay there. `pruneRoomAttempts` removes every budget past `attempts.window` in bounded pages and leaves alone one that fails again while it runs. Schedule it alongside `reconcileRoomCapacity`; when it answers `complete: false`, call it again.

Every failure to resolve a code is the same `CODE_DID_NOT_RESOLVE`, whether the code never existed, fell out of its grace window or was revoked. Distinguishing them would answer "is this code live?" without entering the room and without any side effect of joining, which roughly halves the work of sweeping the code space.

Once a code has resolved, the refusal is specific: `ROOM_LOCKED`, `ROOM_CLOSED`, `ROOM_EXPIRED`, `ROOM_AT_CAPACITY`, `MEMBERSHIP_REVOKED` or `MEMBERSHIP_EXPIRED`, and `UNKNOWN_ACTOR` or `ROOM_CONTENDED` in the rare race described under [How it stays correct](#how-it-stays-correct). The caller has already proved the code is good, so naming the reason leaks nothing further. The uniformity is deliberate and looks like a developer experience bug; it covers one half of the flow, not both.

`join.concealRefusals` extends it to the other half. With it on, a code that resolves to a locked, closed, expired or full room is answered as `CODE_DID_NOT_RESOLVE` and counted against the attempt budgets like a code that did not resolve, and so is a caller without a session when `join.requireSession` is on. A guess then learns nothing from the state of the room it hit. Your own members get the same answer, so say in your interface that a code may be wrong or its room unavailable. A member's own refusals, `MEMBERSHIP_REVOKED` and `MEMBERSHIP_EXPIRED`, stay specific, since only the holder of that membership can see them.

## Realtime

Commands travel over HTTP and live updates travel over a socket. Creating, joining, adding, revoking and rotating are one-off commands that need a definite answer, an atomic write and a specific refusal, and `/better-room/join` also counts and throttles every attempt against a code. A request and a response give each of those a natural home, along with Better Auth's cookies, sessions and rate limiting. What happens once someone is inside, such as presence, messages and "someone joined", is a stream, and that is the part a WebSocket is for.

```
client ── POST join ───────────▶ better-room ── hooks ─────▶ your broker ──▶ your sockets
client ── open socket (cookies) ─▶ your server ── getRoomAccess ──▶ better-room
```

The plugin owns no transport. Who is connected right now belongs to your WebSocket server, your SSE stream or your realtime provider, because only that layer knows when a socket opens and closes. What the plugin offers is the two halves every realtime integration needs: a way to authorize a connection, and a signal for every change worth broadcasting.

### Authorizing a connection

Check the room when the connection opens, with the headers the upgrade request carried. Cookies travel on a same-origin upgrade, so an anonymous member's grant and a signed-in user's session both resolve exactly as they do over HTTP:

```ts
const access = await auth.api.getRoomAccess({
  query: { roomId },
  headers: request.headers
})

if (!access.authorized) {
  // refuse the upgrade, or close the socket with your own code
}

// access.membership.actorId names the actor this socket speaks for
```

A room that does not exist throws `UNKNOWN_ROOM` rather than answering `authorized: false`, so treat a thrown `APIError` as a refused connection too.

Authorization is decided when you ask. A membership revoked or a room closed after the socket opened does not close it for you; react to the matching event below.

### Closing sockets when access ends

Authorization is checked once, at the upgrade, so a revoked member keeps a live socket until you close it. Keep each socket's `roomId` and `actorId`, and close on the events that end access:

```ts
betterRoom({
  hooks: {
    onRevoked: event => {
      sockets.close({ roomId: event.roomId, actorId: event.membership.actorId })
    },
    onLeft: event => {
      sockets.close({ roomId: event.roomId, actorId: event.membership.actorId })
    },
    onClosed: event => sockets.close({ roomId: event.roomId })
  }
})
```

`sockets.close` stands for whatever your server uses to find and drop connections. For a locked room, existing members stay; `locked` only refuses new joins.

### Broadcasting changes

Pass `hooks`, and the plugin calls one of them after every change it saves. Each event has a hook named after it, `on` followed by its capitalised `type`, such as `onJoined` for `joined` and `onRevoked` for `revoked`, and `onEvent` catches every event that has no hook of its own:

```ts
betterRoom({
  hooks: {
    onRevoked: event => {
      sockets.close({ roomId: event.roomId, actorId: event.membership.actorId })
    },
    onEvent: event => {
      if ('roomId' in event) sockets.to(event.roomId).emit(event.type, event)
    }
  }
})
```

In the example above, `onEvent` broadcasts room events that have no configured event-specific hook. Since `onRevoked` handles `revoked`, that event closes the socket without being broadcast. This is a choice of the example, not a restriction of the plugin: to broadcast revocations too, call the same broadcast logic from `onRevoked`.

Exactly one hook runs per event. When the event's own hook is given, only it runs and `onEvent` does not; otherwise `onEvent` runs; with neither, the event goes nowhere. A hook set to `undefined` counts as absent, so `onJoined: production ? notify : undefined` falls back to `onEvent`. Hooks are all optional, so `hooks: { onEvent }` alone hears everything. To run shared logic as well as a specific one, call it from the specific hook.

| `type` | Hook | Fields | Raised when |
| --- | --- | --- | --- |
| `joined` | `onJoined` | `roomId`, `membership` | a code admitted an actor, including a rejoin after leaving |
| `added` | `onAdded` | `roomId`, `membership` | `addRoomMember` added one |
| `renamed` | `onRenamed` | `roomId`, `membership` | a member changed or cleared the name it shows in the room |
| `left` | `onLeft` | `roomId`, `membership` | a member left |
| `revoked` | `onRevoked` | `roomId`, `membership` | a membership was revoked |
| `expired` | `onExpired` | `roomId`, `membership` | `reconcileRoomCapacity` took back the seat of a membership whose deadline passed |
| `created` | `onCreated` | `roomId`, `room` | a room was created; its code is never part of an event |
| `locked`, `unlocked`, `closed` | `onLocked`, `onUnlocked`, `onClosed` | `roomId`, `room` | the room changed state |
| `rotated` | `onRotated` | `roomId` | the code was rotated; the new code is never part of an event |
| `promoted` | `onPromoted` | `actorId`, `merged` | an anonymous actor was merged into `actorId` |
| `erased` | `onErased` | `actorId` | the actor of a deleted user was erased |

`membership` and `room` are the same reports the endpoints return, and each hook receives its own copy, so changing it, its dates included, changes neither the response nor the stored row. Every hook receives the whole event, `type` included, typed to the one it is named after: `onJoined` gets `RoomEventOf<'joined'>`, so `event.membership` needs no narrowing, while `onEvent` gets the `RoomEvent` union, which a `switch` on `event.type` narrows. `RoomHooks` types the `hooks` object, which helps when you build it apart from `betterRoom()`.

A handler kept in its own module names its event with `RoomEventOf`, and a whole set of hooks with `RoomHooks`:

```ts
import type { RoomEventOf, RoomHooks } from 'better-room'

const closeMember = (event: RoomEventOf<'revoked' | 'left'>) => {
  sockets.close({ roomId: event.roomId, actorId: event.membership.actorId })
}

export const hooks = {
  onRevoked: closeMember,
  onLeft: closeMember,
  onEvent: event => {
    if ('roomId' in event) sockets.to(event.roomId).emit(event.type, event)
  }
} satisfies RoomHooks
```

`satisfies RoomHooks` checks the names and types each handler, while `hooks` keeps its exact shape for `betterRoom({ hooks })`.

What the signal guarantees, and what it does not:

- It fires once per change that was saved, after the write landed, never for a refusal and never for a call that changed nothing: a second join by a member, leaving twice and locking a locked room are all silent.
- It runs in the process that handled the request, and the request waits for it, so hand anything slow to a queue. With several instances, publish the event to your own broker, such as Redis pub/sub, and fan it out from there.
- A hook that throws never undoes the change or fails the request. The error is logged through Better Auth's logger, and the event is not retried.
- A deadline raises nothing when it passes. A membership or a room expires by the clock, not by a write, so schedule your own timer from `expiresAt` if your clients must hear about it at that moment. `expired` arrives later, when `reconcileRoomCapacity` takes the seat back, carries the membership as that write found it rather than as the batch read it, and only for a membership that neither left nor was revoked: a seat that reconciliation recollects after a revocation raises nothing new, because `revoked` already announced it.
- A change made directly in the database, outside Better Auth, raises nothing.

### Migrating from `onChange`

`onChange` was replaced by `hooks` and no longer exists. A listener that handled every event moves to `onEvent` unchanged, since `onEvent` receives every event that has no hook of its own:

```ts
// before
betterRoom({
  onChange: event => {
    if ('roomId' in event) sockets.to(event.roomId).emit(event.type, event)
  }
})

// after
betterRoom({
  hooks: {
    onEvent: event => {
      if ('roomId' in event) sockets.to(event.roomId).emit(event.type, event)
    }
  }
})
```

A branch on `event.type` can then move into the hook named after it, one at a time. Once an event has its own hook, `onEvent` no longer receives it, so take its branch out of `onEvent` in the same change. `RoomEventListener` is gone too: type the callback with `RoomEvent` or `RoomEventOf`, or the object with `RoomHooks`. Passing `onChange` still throws a `TypeError` at construction, so a missed upgrade fails at startup instead of silently dropping events.

### Planned

These are not shipped. They are recorded so the direction is visible; none changes the plugin's contract today.

- **`better-room/realtime`, a separate entry point or package.** A helper that validates a connection against the plugin so each integrator stops rewriting the upgrade check: read the grant or session from the upgrade headers, call the access check, and return the `roomId`, `actorId` and membership the socket speaks for, or a refusal to close with. It would stay outside `core/` and depend on no particular WebSocket library, taking the headers and giving back a result, so it fits `ws`, Bun, Hono, Socket.IO and others through thin adapters.
- **Revalidation on a timer.** A helper that rechecks a live connection when `expiresAt` passes, since deadlines raise no event.
- **A broadcast adapter.** A typed bridge from `hooks` to a broker such as Redis pub/sub, so several instances fan the same event out without each application writing the glue.
- **A client subscription atom.** A client-side helper that opens the socket, reconnects after a refusal and exposes the room's events as an atom.

The transport itself stays outside the plugin. A helper will validate and bridge; it will not own connections, retries or fan-out.

## Reports and types

Endpoints return reports, not database rows: each response body is built field by field. A column the plugin adds later stays invisible until a report names it, and fields you add through `schema.room.additionalFields` or `schema.roomMember.additionalFields` are not read through either. The endpoint bodies are fixed schemas, so the plugin neither writes nor reads your own columns; query them yourself.

`RoomReport`, `MembershipReport`, `MemberReport`, `OccupancyReport`, `PromotionReport`, `ReconciliationReport`, `PruningReport`, `RecountReport` and `RetirementReport` are exported, and the client infers the ones its routes return.

The server entry point also exports the types an integration names:

| Type | What it is |
| --- | --- |
| `RoomOptions` | the options `betterRoom()` takes |
| `RoomSchemaOption` | the `schema` option: renamed tables and columns, and `additionalFields` for `room` and `roomMember` |
| `CodeFormatName` | `'crockford'` or `'numeric'` |
| `RoomEvent`, `RoomEventOf` | every event the hooks receive, and the one event of a given `type`, such as `RoomEventOf<'joined'>` |
| `RoomHooks` | the `hooks` option: one optional hook per event, plus `onEvent` |
| `Room`, `RoomStatus`, `Membership`, `Actor`, `RoomCode`, `RoomCodeStatus`, `Held` | the domain shapes the reports are built from |
| `Absent`, `Unlinked`, `Perpetual`, `Unbounded`, `Pending`, `Unnamed` | the names for a value that may be `null`: no link, no deadline, no limit, not happened yet, no name |

## Error codes

Reachable as `auth.$ERROR_CODES` on the server and as the `ROOM_ERROR_CODES` export of both entry points. On the client, follow the same split as Better Auth's own plugins, which export `ORGANIZATION_ERROR_CODES` and its siblings beside their clients: `client.$ERROR_CODES` is for types, and `ROOM_ERROR_CODES` is for values. Reading a value through `client.$ERROR_CODES` does not work, because Better Auth's client proxy returns a function for it at runtime.

```ts
import { ROOM_ERROR_CODES } from 'better-room/client'

type RoomErrorCode = keyof typeof client.$ERROR_CODES

if (error?.code === ROOM_ERROR_CODES.ROOM_AT_CAPACITY.code) {
  // show that the room is full
}
```

| Code | Status | Raised when |
| --- | --- | --- |
| `CODE_DID_NOT_RESOLVE` | 400 | the presented code matched no live room |
| `EXACTLY_ONE_IDENTITY` | 400 | a member was named by both `userId` and `actorId`, or neither |
| `NO_GRANT_TO_PROMOTE` | 400 | promotion arrived without a grant to merge |
| `RESUME_NEEDS_BOTH_NAMES` | 400 | resuming a promotion named only one of the two |
| `MEMBERSHIP_EXPIRES_IN_THE_PAST` | 400 | an added membership would expire before it began |
| `ROOM_EXPIRES_IN_THE_PAST` | 400 | a created room would expire before it began |
| `PROMOTION_NEEDS_A_SESSION` | 401 | promotion arrived without a session |
| `CREATION_NEEDS_A_SESSION` | 401 | creation over HTTP arrived without a session |
| `JOIN_NEEDS_A_SESSION` | 401 | a join arrived without a session while `join.requireSession` is on |
| `ROOM_LOCKED` | 403 | the room refuses joins by code |
| `ROOM_NOT_LOCKED` | 409 | a recount was asked of a room that is not locked |
| `ROOM_CLOSED` | 403 | the room has ended |
| `ROOM_EXPIRED` | 403 | the room's deadline passed |
| `MEMBERSHIP_REVOKED` | 403 | the membership was withdrawn |
| `MEMBERSHIP_EXPIRED` | 403 | the membership's own window closed |
| `CREATION_IS_SERVER_ONLY` | 403 | creation was called over HTTP while `overHttp` is off |
| `RESUME_IS_SERVER_ONLY` | 403 | resuming a promotion was called over HTTP |
| `UNREADABLE_CURSOR` | 400 | a listing cursor that the listing never wrote |
| `UNKNOWN_ROOM` | 404 | no room has that id; over HTTP, reading access, reading occupancy and leaving answer a missing room as they answer a foreign one instead |
| `UNKNOWN_ACTOR` | 404 | no actor has that id, or the caller's actor was erased while the request ran |
| `UNKNOWN_USER` | 404 | a server-side creation named a `userId` that no user has |
| `ROOM_AT_CAPACITY` | 409 | the room has no seat left |
| `ROOM_CONTENDED` | 409 | the room or the membership kept changing while the request tried to settle it |
| `ALREADY_A_MEMBER` | 409 | the actor already holds a membership there |
| `NOT_A_MEMBER` | 403 or 404 | nobody holds the membership the call names: 403 when a caller tries to leave a room it is not in or reads the occupancy of one, including one that does not exist, 404 when a revocation names an actor with no membership there |
| `ALREADY_LINKED` | 409 | the actor already belongs to a user |
| `ALREADY_REVOKED` | 409 | the membership was already revoked |
| `GRANT_IS_STALE` | 409 | the grant no longer matches the actor it names |
| `TOO_MANY_ATTEMPTS` | 429 | the caller's attempt budget is spent |
| `CODE_SPACE_EXHAUSTED` | 503 | no free code was found for this room |

Input that does not match an endpoint's schema, such as a `maxMembers` above 2147483647 or a malformed listing cursor, never reaches the plugin: Better Auth refuses it as `400 VALIDATION_ERROR`, a code of its own rather than one of these.

## Database

Five tables: `roomActor`, `room`, `roomCode`, `roomMember` and `roomAttempt`. All five are declared through Better Auth's plugin schema, so the official migration and schema generators create them.

`roomAttempt` is not optional. It holds the brute-force budget the join flow reads and writes for every presented code, and joining does not work without it.

Five indexes carry behaviour rather than only speed, and four of them are uniqueness the plugin depends on:

- `roomMember` has a **unique** index on `(roomId, actorId)`. It is what makes two simultaneous joins by one actor collapse into one membership instead of two.
- `roomCode` has a **unique** column `identifier`, the HMAC a presented code is looked up by. It is what makes two rooms drawing the same code collide instead of sharing it.
- `roomAttempt` has a **unique** column `key`, the address or `global` budget an attempt is counted against. It is what keeps two concurrent failures counting against one row.
- `roomCode` has an index on `(roomId, status)`, which every rotation walks.
- `roomActor` has a **unique** index on `userId`. One user owns one actor, which is what lets two simultaneous requests resolve the same user to the same actor instead of writing two.

Five more carry speed only, so a schema that lacks one is slower, never wrong:

- `room_created_by_idx` on `room (createdBy)`. Deleting an actor makes the database find the rooms that name it, and without this index every promotion and every user deletion scans every room ever created.
- `room_member_actor_idx` on `roomMember (actorId)`, read by the membership listing, promotion and user deletion.
- `room_member_expires_at_idx` on `roomMember (expiresAt)`, read by reconciliation.
- `room_member_revoked_at_idx` on `roomMember (revokedAt)`, read by reconciliation when it collects the seat of a revocation that stopped halfway.
- `room_attempt_last_attempt_at_idx` on `roomAttempt (lastAttemptAt)`, read when stale attempt budgets are pruned. The column keeps its name for compatibility and holds the moment the budget's current window opened.

One foreign key carries behaviour as well. `roomMember.actorId` references `roomActor.id` with `onDelete: 'restrict'` (`onDelete: Restrict` in a Prisma relation), so a database refuses to remove an actor while a membership still names it, instead of deleting a membership that holds a seat without returning it. `roomActor.userId` deliberately references nothing; [Deleting a user](#deleting-a-user) says why.

Row ids are Better Auth's to generate. The plugin never writes an id of its own, so every `advanced.database.generateId` mode works, including `'serial'` and `'uuid'`.

Drizzle and Kysely emit these indexes from the declaration, and so does Better Auth's Prisma schema generation (`npx auth generate`, checked against 1.7.7), which writes all four uniqueness constraints:

```prisma
model RoomCode {
  // ...
  @@unique([identifier])
}

model RoomAttempt {
  // ...
  @@unique([key])
}

model RoomMember {
  // ...
  @@unique([roomId, actorId], map: "room_member_room_actor_uidx")
}

model RoomActor {
  // ...
  @@unique([userId])
}
```

> [!WARNING]
>
> A Prisma schema written or edited by hand has to carry the same four. Without `identifier` two rooms can share one code, and without `(roomId, actorId)` two concurrent joins by one actor can both succeed, with no error in either case.

MongoDB creates every index the schema declares at table level, which covers every index above except `roomActor.userId`.

> [!WARNING]
>
> It does not create `roomActor.userId`, and that one cannot be declared at table level: `userId` is nullable, and Better Auth refuses a table-level unique index over a field that is not required, so the declaration stays on the field where only SQL reads it. Provision it by hand, and make it **partial**: a plain unique index treats every anonymous actor's missing `userId` as one value and refuses the second anonymous join.

```js
db.roomActor.createIndex(
  { userId: 1 },
  {
    unique: true,
    name: 'room_actor_user_uidx',
    partialFilterExpression: { userId: { $type: 'string' } }
  }
)
```

### Deleting a user

When Better Auth deletes a user, the plugin erases the actor that user owned after the deletion lands, then raises an `erased` event: it returns every seat its memberships occupied, removes them, clears the actor from the rooms it created, and removes the actor. Nothing is written before that, so a `user.delete.before` hook of your own that vetoes the deletion leaves the actor and its memberships exactly as they were.

`roomActor.userId` is a unique column, not a foreign key, so the link survives the user row and the erasure finds the actor by it once the deletion has landed. `roomMember.actorId` references the actor with `onDelete: 'restrict'`, so no database removes a membership behind the plugin's back.

Requests the same user still has in flight are settled too. A join or an addition checks, after it writes, that its actor and that actor's user still exist; when they do not, it erases the actor itself and answers `UNKNOWN_ACTOR`. The erasure reads the actor's memberships again after removing the actor, so a membership written just before that removal is released as well. Whichever of the two looks last sees the other's write, on every database.

> [!WARNING]
>
> A process that stops in the middle of an erasure, after the user row is gone, leaves the actor linked to a user id that no longer exists, still holding its seats. Nothing authorizes it, and reconciliation does not recover it. Remove it by hand, in this order, because deleting the actor first would orphan its memberships:
>
> 1. For every `roomActor` whose `userId` matches no user, settle its memberships: claim each one exclusively with `UPDATE roomMember SET occupancy = 0, releasedAt = now() WHERE id = ? AND occupancy > 0`, lower `room.memberCount` by one for each row that update actually changed, then delete the membership rows.
> 2. Delete those actors.
> 3. Delete any `roomMember` row whose `actorId` now matches no `roomActor`, settling it the same way first.
>
> The guard on `occupancy > 0` is what makes the release exactly once, so a recovery that is interrupted and re-run never lowers a counter twice. Run it with writes to the affected rooms quiesced: the steps are not atomic against a join arriving between them.

Capacity is admitted through a guarded counter on `room.memberCount`, incremented only while the row still satisfies the limit, so a seat is taken atomically rather than checked and then taken.

### Upgrading a schema created by a pre-release build

Better Auth's migration adds missing tables, columns and indexes. It does not backfill a new required column, and it does not change a foreign key that already exists. A database created before this version needs these changes by hand:

1. **`roomCode.identifier`:** add the column, copy `id` into it for every existing row (the old id was the HMAC), then make it `NOT NULL` and unique.
2. **`roomAttempt.key`:** add the column, copy `id` into it, then make it `NOT NULL` and unique. Emptying the table instead is also safe, because it only holds brute-force budgets that expire within the attempt window.
3. **`roomActor.userId`:** drop its foreign key to `user.id` and keep the unique index. A foreign key that nulls or cascades destroys the link the erasure follows to find the actor.
4. **`roomMember.actorId`:** recreate its foreign key to `roomActor.id` with `ON DELETE RESTRICT` instead of `CASCADE`. A cascade deletes a membership that still holds a seat without returning it.
5. **Departures that kept their seat:** an early build could leave a membership marked as left while still holding a seat, and reconciliation no longer looks for that state. `SELECT count(*) FROM "roomMember" WHERE "leftAt" IS NOT NULL AND occupancy > 0` must answer `0`; settle any row it finds with the claim under [Deleting a user](#deleting-a-user), step 1, keeping the row.
6. **Old index names:** once the migration has created the indexes listed above, drop `roomMember_actorId_idx`, `roomMember_expiresAt_idx` and `roomAttempt_lastAttemptAt_idx` if they exist. They cover the same columns as their replacements.

MongoDB needs only the two backfills and the check in step 5; the adapter creates the indexes and has no foreign keys.

Upgrading from 0.3 needs no migration of its own beyond the new `room_member_revoked_at_idx`, which Better Auth's migration creates. `roomAttempt` keys change from the address to its HMAC, so the budgets on record start again once and the old rows are removed by `pruneRoomAttempts` or by the next window that restarts. New codes are stored under an identifier that names their format; codes issued before keep working through the older identifier until they are rotated or retired.

### Constraints the schema cannot declare

Better Auth's schema has no `CHECK` constraint, so the database accepts a status or a counter the plugin would never write. The plugin refuses an unknown status as it reads the row, but a constraint stops a hand edit before it lands. On PostgreSQL:

```sql
ALTER TABLE "room" ADD CONSTRAINT room_status_check
  CHECK ("status" IN ('active', 'locked', 'closed'));
ALTER TABLE "room" ADD CONSTRAINT room_member_count_check
  CHECK ("memberCount" >= 0);
ALTER TABLE "room" ADD CONSTRAINT room_max_members_check
  CHECK ("maxMembers" IS NULL OR "maxMembers" > 0);
ALTER TABLE "roomCode" ADD CONSTRAINT room_code_status_check
  CHECK ("status" IN ('active', 'grace', 'revoked'));
ALTER TABLE "roomMember" ADD CONSTRAINT room_member_occupancy_check
  CHECK ("occupancy" IN (0, 1));
ALTER TABLE "roomAttempt" ADD CONSTRAINT room_attempt_count_check
  CHECK ("count" >= 1);
```

`roomMember.role` is left free on purpose, since roles are your application's strings. Rename the tables and columns to match your `schema` option if you changed them.

### Removing the tables

Better Auth generates and applies migrations but never reverses one. To remove the plugin's tables, drop them in an order no foreign key blocks, which destroys every room, membership and code for good:

```sql
DROP TABLE "roomMember";
DROP TABLE "roomCode";
DROP TABLE "roomAttempt";
DROP TABLE "room";
DROP TABLE "roomActor";
```

## How it stays correct

The plugin runs on whatever adapter Better Auth is given, with no transaction spanning two writes, and several requests can reach the same row at once. Every guarantee above rests on a handful of rules. They are listed here because each one looks like an oversight or an excess from the outside, and undoing any of them breaks a guarantee without breaking a build.

### Capacity

- **A seat is claimed, never checked and then taken.** Admission increments `room.memberCount` only while the row still satisfies `memberCount < maxMembers`, in one guarded write. Two joins racing for the last seat cannot both pass, on any database.
- **A seat is returned exactly once.** Each membership carries an `occupancy` of `1` or `0`. Leaving, revocation, expiry, promotion and user deletion all release through the same guarded write, which only succeeds while `occupancy > 0`, and only the call that flips it lowers the counter. However many of them notice the same membership, one seat comes back.
- **One actor never pays twice.** A new membership is written vacant first, and its seat is taken by the same guarded write that takes a seat back on a rejoin, the one that flips `occupancy` from `0` to `1`. Two joins or additions of one actor both find that single row, and only one of them flips it; the other returns the seat it claimed at the gate.
- **The room's state is part of the gate.** The guarded increment only matches a room that still admits: `active` for a join, `active` or `locked` for an addition. A lock or a close that lands after the room was read refuses the join without counting it.
- **The counter is a gate, not a tally.** It may sit above the memberships holding the room after a write that failed halfway, and never below them. That is the direction that refuses a free seat instead of admitting past the limit. The same holds for a moment while a seat is being returned, so joins and leaves of one actor sent at once may see a `ROOM_AT_CAPACITY` that a join sent afterwards does not. `getRoomOccupancy` counts the memberships themselves, so it is exact once concurrent changes settle, and reconciliation recollects what a membership still owes.

### Writes that race or fail

- **A refused guard is answered from a fresh read.** When another request changed a membership between the read and the write, the answer comes from the row as it is now, never from the row read earlier. A leave overtaken by a revocation is refused as revoked, the second of two revocations as already revoked, a rejoin racing a revocation is refused without taking the seat, and a join turned away at the gate by its own actor's concurrent join answers with that membership, unless the room it reads again no longer admits joins, which it answers instead.
- **A writer checks its actor after writing, and an eraser reads after erasing.** A join, an addition or a promotion confirms after its write that the actor it wrote for, and that actor's user, still exist; the erasure of an actor reads its memberships again after removing it. Either the writer sees the actor gone and releases what it took, or the eraser sees the membership and releases it. On SQL databases `roomMember.actorId` restricts the removal while any membership names the actor, and the erasure drains and tries again.
- **A failed write is never an outcome by itself.** A write whose acknowledgement was lost may still have landed, so the plugin reads the one row that would prove it: the code it issued, the membership it enrolled, the actor it created, the budget it opened. Only that row may turn the failure into an answer; when the read finds nothing, the original error is raised.
- **Retried writes report what still did not land.** A guarded write that keeps refusing under contention is retried a bounded number of times, and a failed attempt that could not be counted is logged instead of silently dropped.

### Queries

- **No query relies on `OR`.** The SQL adapters and MongoDB group a `where` as all `AND` clauses joined to all `OR` clauses, but the memory adapter folds the list left to right, so a single `OR` would match rows belonging to other rooms there. Every disjunction is one query per branch, merged afterwards.
- **Pages follow a unique column, never a timestamp.** Two writes in a row land in the same millisecond on a fast database, so a timestamp cursor skips rows. The membership listing pages by the room id, which is unique among one actor's memberships, reads memberships without a deadline and those with one as separate branches, and lets the database order each branch instead of comparing strings in JavaScript, where collation differs. It does not page by the membership's own id, because the MongoDB adapter does not apply a sort on `id`.
- **Expiry has one boundary.** A deadline equal to the current instant has already passed, in every check and every query.
- **Every read is bounded, and a set the plugin acts on is read in full.** A listing says when it is partial and hands back a cursor. A rotation reads every active code page by page and demotes them in batches, so no code beyond a page stays active and no `in` list grows without limit. Each operation declares its own bound; the database layer only applies it.

### Storage

- **Ids are Better Auth's.** The `'serial'` and `'uuid'` id modes rewrite explicit ids, so the code HMAC lives in `roomCode.identifier` and the attempt budget in `roomAttempt.key`, each behind its own unique index, and the plugin never writes an id.
- **An id is checked before it reaches the database.** A `roomId`, an `actorId` or a cursor that cannot exist under the configured `generateId` mode is answered as one that names nothing, so a malformed value never turns into a type error from PostgreSQL.
- **A row is checked as it leaves the database.** A room or code status the plugin does not know, such as one edited by hand, is refused with an error naming the row instead of entering the domain as an invalid state.
- **Deleting a user writes only after it lands.** The actor is found through `roomActor.userId` once the deletion can no longer be vetoed. That column is unique but not a foreign key, so the link outlives the user row instead of being nulled or cascaded away before the seats are returned.

### Codes and secrets

- **The code key is derived per instance.** It is derived once from the instance's secret and kept by that plugin object alone, never in shared module state, so two auth instances never share a key and the secret is not held as a cache key for the life of the process.
- **Codes are folded through an explicit ASCII table.** Unicode case mapping changes length and merges distinct characters, so a code is canonicalised by a fixed table and any character absent from it is refused.
- **Every unresolved code looks the same.** Revealing why a code failed would answer whether it is live without joining, which halves the work of a sweep.
- **A room is invisible to strangers over HTTP.** A caller with no relation to a room gets the same answer whether it exists or not, so serial room ids cannot be walked. A report is returned whole or not at all; the reports themselves are never trimmed per caller.

### Inputs and outputs

- **Options fail at construction.** Ranges, runtime types, unknown keys and reserved schema fields are checked when `betterRoom()` runs, and every duration has a ceiling, because a value large enough to overflow date arithmetic yields an invalid date that silently disables what it configures.
- **Responses are reports.** Each body is built field by field, so a column added to a table, by the plugin or by your `additionalFields`, never leaks into a response.
- **Events follow writes.** A hook fires after a change has landed and only when something changed, and a hook that fails cannot undo the change or fail the request.

## Deliberately not here

A permission engine, a realtime transport owned by the plugin, roles carried by a code, a reversible stored form of the code, a per-room lockout, and a `metadata` JSON column. Each was considered and left out for a recorded reason rather than forgotten. A permission engine is deferred rather than rejected. Change signalling arrived as `hooks`, which leaves the transport yours; helpers around it are listed under [Planned](#planned).
