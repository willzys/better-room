import type { Usable } from '@/types/absence'

export const writeOrConfirm = async <Outcome>(
  write: () => Promise<Outcome>,
  confirm: () => Promise<Usable<Outcome>>
): Promise<Outcome> => {
  try {
    return await write()
  } catch (error) {
    const confirmed = await confirm()

    if (confirmed === null) throw error

    return confirmed
  }
}
