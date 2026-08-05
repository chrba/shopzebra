// The name this device goes by — drawn once, kept forever.
//
// Nobody is asked for it. A question at the door would look like a
// registration, and registering is the one thing this app never does
// (architecture/accountless-first-planned.md). So the app names itself and
// says so; changing it is a setting, not a step.

import { getItem, setItem } from '../../../app/clientStorage'
import { randomZebraName } from './zebraNames'

const DEVICE_NAME_KEY = 'shopzebra_device_name'

/**
 * The stored name, or a freshly drawn one on the very first start. Called
 * once per boot, before the identity is restored — a name Cognito knows
 * wins over this one, because that is what other people already see.
 */
export async function ensureDeviceName(): Promise<string> {
  const stored = await getItem(DEVICE_NAME_KEY)
  if (stored !== null && stored !== '') return stored

  const drawn = randomZebraName()
  await setItem(DEVICE_NAME_KEY, drawn)
  return drawn
}

/**
 * Keeps a name the user chose. Called when the profile renames — without
 * it the next start would fall back to the drawn one, and a device whose
 * name changes behind your back is worse than one that never had a name.
 */
export async function rememberDeviceName(name: string): Promise<void> {
  await setItem(DEVICE_NAME_KEY, name)
}
