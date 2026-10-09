import {
  admissionContract,
  refusalContract,
  backoffContract,
  additionContract,
  readmissionContract,
  enrolmentRaceContract,
  roomStateRaceContract
} from './contract/admission'
import {
  occupancyContract,
  leaveContract,
  leaveRefusalContract,
  revocationContract,
  reconciliationContract,
  capacityRaceContract
} from './contract/capacity'
import { rotationContract } from './contract/codes'
import {
  promotionContract,
  promotionRefusalContract,
  erasureContract
} from './contract/identity'
import {
  erasureRaceContract,
  forgettingRaceContract
} from './contract/identity-race'
import {
  accessContract,
  accessRefusalContract,
  membershipsContract,
  membershipsRefusalContract,
  listingPagesContract,
  occupancyReadContract
} from './contract/reads'
import { lifecycleContract } from './contract/rooms'
import { schemaContract, uniquenessContract } from './contract/schema'
import { trafficContract } from './contract/traffic'

import type { Harness } from './contract/harness'

export type { Auth, Harness } from './contract/harness'

export const contract = (harness: Harness) => {
  schemaContract(harness)
  uniquenessContract(harness)
  admissionContract(harness)
  refusalContract(harness)
  rotationContract(harness)
  backoffContract(harness)
  additionContract(harness)
  readmissionContract(harness)
  accessContract(harness)
  accessRefusalContract(harness)
  membershipsContract(harness)
  membershipsRefusalContract(harness)
  listingPagesContract(harness)
  occupancyContract(harness)
  leaveContract(harness)
  occupancyReadContract(harness)
  leaveRefusalContract(harness)
  lifecycleContract(harness)
  revocationContract(harness)
  reconciliationContract(harness)
  promotionContract(harness)
  promotionRefusalContract(harness)
  erasureContract(harness)
  capacityRaceContract(harness)
  enrolmentRaceContract(harness)
  roomStateRaceContract(harness)
  erasureRaceContract(harness)
  forgettingRaceContract(harness)
  trafficContract(harness)
}
