/**
 * Shown while an invite token is being redeemed. The only wait local-first
 * cannot argue away: until the server accepts the join, this device is not
 * a member and the list does not exist here — there is nothing local to
 * render instead. Same centred layout the join result uses, so the screen
 * does not jump when the answer arrives.
 */
export function JoiningScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="font-display text-[19px] font-bold">Du trittst bei …</h1>
      <p className="text-muted-foreground text-[15px] leading-relaxed">
        Einen Moment, die Liste wird geholt.
      </p>
    </div>
  )
}
