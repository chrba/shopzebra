import { useState, type ReactNode } from 'react'
import { QrCodeDummy } from './QrCodeDummy'
import { useToast } from './Toast'

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  )
}

type ShareButtonProps = {
  readonly icon: ReactNode
  readonly label: string
  readonly sub: string
  readonly onClick: () => void
}

/** One row of the "Einladung senden" section — WhatsApp, e-mail, … */
function ShareButton({ icon, label, sub, onClick }: ShareButtonProps) {
  return (
    <button
      className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-70"
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 text-[15px] font-semibold">{label}</span>
      <span className="text-muted-foreground text-[13px]">{sub}</span>
    </button>
  )
}

type InviteShareProps = {
  /** The full invite URL — copied, shared and shown verbatim. */
  readonly link: string
  /** Message body for WhatsApp and e-mail. */
  readonly invitationText: string
  readonly mailSubject: string
}

/**
 * QR dummy, copyable link and share buttons — the body of every invite
 * screen (list invites and friendship invites alike). The screens around it
 * differ only in header, texts and where the token comes from.
 */
export function InviteShare({ link, invitationText, mailSubject }: InviteShareProps) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  const handleCopy = () => {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      toast.show('Link kopiert')
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mx-5 flex flex-col items-center">
      <QrCodeDummy />
      <div className="mt-3.5 text-[15px] font-semibold">QR-Code scannen</div>
      <div className="text-muted-foreground mb-6 text-[13px]">
        oder Einladungslink teilen
      </div>

      <div className="bg-card flex w-full items-center gap-2 rounded-2xl px-4 py-3">
        <div className="text-muted-foreground min-w-0 flex-1 truncate text-[14px]">
          {link}
        </div>
        <button
          className="text-teal flex size-9 shrink-0 items-center justify-center rounded-full active:scale-[0.92]"
          aria-label="Einladungslink kopieren"
          onClick={handleCopy}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
      <div className="text-muted-foreground mt-2 mb-6 text-[12px]">
        Link gültig für 7 Tage
      </div>

      <div className="w-full">
        <div className="text-muted-foreground mb-2 pl-1 text-xs font-semibold tracking-wider uppercase">
          Einladung senden
        </div>
        <div className="flex flex-col gap-2.5">
          <ShareButton
            icon={<span className="text-[#25D366]"><WhatsAppIcon /></span>}
            label="Per WhatsApp"
            sub="Direkt senden"
            onClick={() =>
              window.open(`https://wa.me/?text=${encodeURIComponent(invitationText)}`)
            }
          />
          <ShareButton
            icon={<span className="text-teal"><MailIcon /></span>}
            label="Per E-Mail"
            sub="Einladungstext"
            onClick={() => {
              window.location.href = `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(invitationText)}`
            }}
          />
        </div>
      </div>

      {toast.element}
    </div>
  )
}
