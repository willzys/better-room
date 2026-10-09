import { isServerCall } from '@/plugin/http/carrier'

import type { GenericEndpointContext } from '@better-auth/core'

export const concealed = <Refusal extends string>(
  refusal: Refusal,
  ctx: Pick<GenericEndpointContext, 'request'>
): Refusal | 'not-a-member' =>
  refusal === 'unknown-room' && !isServerCall(ctx) ? 'not-a-member' : refusal
