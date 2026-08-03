// Pre-signup trigger: auto-confirm every user.
// Production would use the same trigger — sign-up without email has no
// confirmation code, so users must be confirmed at creation time.
exports.handler = async (event) => {
  event.response.autoConfirmUser = true
  return event
}
