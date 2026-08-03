import type { AuthProvider, EstablishedIdentity } from './authSlice'

/**
 * Maps a restored Cognito session to an identity. Called by the root
 * beforeLoad on every app start. The email attribute is the discriminator:
 * a shadow account signs up without one, so only linking ever sets it.
 */
export function restoredIdentity(
  userId: string,
  attributes: {
    readonly email?: string | undefined
    readonly name?: string | undefined
    readonly provider?: string | undefined
  },
): EstablishedIdentity {
  const name = attributes.name ?? ''
  if (attributes.email === undefined) {
    return { kind: 'guest', userId, name }
  }
  const provider: AuthProvider =
    attributes.provider === 'google'
      ? 'google'
      : attributes.provider === 'apple'
        ? 'apple'
        : 'email'
  return { kind: 'linked', userId, name, email: attributes.email, provider }
}
