// Before any server identity exists, this device still needs to say who
// authored its events. The sentinel is that author; ensureIdentity rewrites
// it to the real Cognito sub the moment the shadow account is created.
// The value can never collide with a Cognito sub (subs are UUID-shaped).
export const LOCAL_USER_ID = 'local-user'
