import { isServerCall } from '@/plugin/http/carrier'

import type { GenericEndpointContext } from '@better-auth/core'

import type { JoinRefusal } from '@/core/operations/admission/join'

export const concealed = <Refusal extends string>(
  refusal: Refusal,
  ctx: Pick<GenericEndpointContext, 'request'>
): Refusal | 'not-a-member' =>
  refusal === 'unknown-room' && !isServerCall(ctx) ? 'not-a-member' : refusal

const STATE_REFUSALS = ['locked', 'closed', 'expired', 'at-capacity'] as const

export const disclosed = (refusal: JoinRefusal, conceal: boolean) =>
  conceal && STATE_REFUSALS.some(name => name === refusal)
    ? 'unresolved'
    : refusal
