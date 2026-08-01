// The placeholder pattern from design/pure/invite.html. A real QR code is
// deliberately out of scope: the invite link sits right next to it and
// carries the same token, so nothing depends on this being scannable.

const PATTERN: readonly number[] = [
  1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1,
  1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0,
  1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0,
  0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1,
  0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1,
]

export function QrCodeDummy() {
  return (
    <div className="flex size-[160px] items-center justify-center rounded-[20px] bg-white p-3.5">
      <div className="grid size-full grid-cols-11 grid-rows-11 gap-0">
        {PATTERN.map((cell, index) => (
          <div
            key={index}
            className={cell === 1 ? 'bg-[#1a1a2e]' : 'bg-white'}
            aria-hidden
          />
        ))}
      </div>
    </div>
  )
}
