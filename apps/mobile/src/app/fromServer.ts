// Wraps an action to mark it as coming from the server (via WebSocket).
//
// Without this marker, the syncMiddleware would send the action right back
// to the API — creating an infinite loop: server → dispatch → API → server → ...
// With the marker, the middleware knows "this already came from the server,
// don't sync it back" and skips the API call.
//
// Usage:  dispatch(fromServer(listCreated(payload)))

type ServerOriginatedAction<A> = A & { readonly meta: { readonly remote: true } }

export function fromServer<A extends { readonly type: string }>(action: A): ServerOriginatedAction<A> {
  return { ...action, meta: { remote: true } }
}
