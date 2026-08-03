/**
 * Membership as every shared aggregate carries it (sharing-model.md): a
 * list and a recipe are owned and joined in exactly the same way.
 */
type Membership = {
  readonly ownerId: string
  readonly memberIds: readonly string[]
  readonly memberNames?: Readonly<Record<string, string>>
}

/**
 * The same membership with one user id replaced by another. Called by every
 * aggregate slice when the device attaches to its identity
 * (auth/identityAttached): what a guest owned, the account owns now.
 *
 * Returns only the membership fields, so the caller spreads it over its own
 * aggregate and nothing else can be clobbered by accident.
 */
export function withRewrittenMembership(
  membership: Membership,
  previousUserId: string,
  userId: string,
): Membership {
  const rewritten = (id: string): string =>
    id === previousUserId ? userId : id

  const names = membership.memberNames
  return {
    ownerId: rewritten(membership.ownerId),
    memberIds: membership.memberIds.map(rewritten),
    ...(names === undefined
      ? {}
      : {
          memberNames: Object.fromEntries(
            Object.entries(names).map(([memberId, name]) => [
              rewritten(memberId),
              name,
            ]),
          ),
        }),
  }
}
