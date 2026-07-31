import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectDeviceId } from '../../../app/appSlice'
import { store } from '../../../app/store'
import { selectAuthUser } from '../../auth/domain/authSlice'
import {
  selectListById,
  selectListMembers,
} from '../domain/listsSlice'
import { memberAvatarColor, memberInitial } from '../domain/memberAvatar'
import { removeMember, type ListInvite } from './memberCommands'
import { QrCodeDummy } from './QrCodeDummy'
import { Button } from '../../../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog'
import { syncEngine } from '../../../app/sync/syncEngine'

const NAME_FALLBACK = 'Mitglied'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  )
}

function MembersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  )
}

function InviteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}

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

type MembersPageProps = {
  readonly listId: string
  readonly invite: ListInvite | null
}

export function MembersPage({ listId, invite }: MembersPageProps) {
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const members = useAppSelector((state) => selectListMembers(state, listId))
  const me = useAppSelector(selectAuthUser)

  // Ephemeral view state only — which tab is open, what the toast says,
  // which removal is awaiting confirmation.
  const [tab, setTab] = useState<'members' | 'invite'>('members')
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{
    readonly id: string
    readonly name: string
  } | null>(null)

  const isOwner = me !== null && list?.ownerId === me.userId
  const inviteLink = invite
    ? `${window.location.origin}/join/${invite.token}`
    : ''
  const invitationText = `Komm in meine Einkaufsliste "${list?.name ?? ''}" bei ShopZebra: ${inviteLink}`

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2000)
  }

  const displayNameOf = (member: (typeof members)[number]): string => {
    if (member.name) return member.name
    if (me && member.id === me.userId) return me.name || me.email
    return NAME_FALLBACK
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true)
      showToast('Link kopiert')
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleConfirmRemoval = () => {
    const target = pendingRemoval
    setPendingRemoval(null)
    if (!target) return

    void removeMember(listId, target.id, {
      eventId: crypto.randomUUID(),
      deviceId: selectDeviceId(store.getState()),
    })
      .then(async () => {
        // The server writes listMemberRemoved; the fold arrives with the
        // next pull, so the card disappears once sync confirms it.
        await syncEngine.requestSync()
        showToast(`${target.name} wurde entfernt`)
      })
      .catch((error: unknown) => {
        console.warn('removing the member failed', error)
        showToast('Entfernen fehlgeschlagen')
      })
  }

  if (!list) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8 text-center">
        <p className="text-muted-foreground text-[15px]">
          Diese Liste gibt es nicht mehr.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col pb-10">
      {/* Nav Header */}
      <header className="flex shrink-0 items-center justify-between px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="text-teal gap-1.5 px-0 text-[15px] font-semibold"
          onClick={() => void navigate({ to: '/lists' })}
        >
          <BackIcon />
          Zurück
        </Button>
        <h1 className="font-display text-[17px] font-bold">Mitglieder</h1>
        <div className="w-[70px]" />
      </header>

      {/* Segmented Control */}
      <div className="bg-card mx-5 mb-5 flex gap-1 rounded-2xl p-1">
        <button
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold transition ${
            tab === 'members'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground'
          }`}
          onClick={() => setTab('members')}
        >
          <MembersIcon />
          Mitglieder
          <span className="bg-teal ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white">
            {members.length}
          </span>
        </button>
        {/* Only the owner mints invites (events.md owner model), so for
            everyone else there is nothing behind this tab. */}
        {isOwner && (
          <button
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold transition ${
              tab === 'invite'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
            onClick={() => setTab('invite')}
          >
            <InviteIcon />
            Einladen
          </button>
        )}
      </div>

      {tab === 'members' ? (
        <div className="mx-5 flex flex-col gap-2.5">
          {members.map((member) => {
            const name = displayNameOf(member)
            const isMe = me !== null && member.id === me.userId
            return (
              <div
                key={member.id}
                className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3.5"
              >
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
                  style={{ backgroundColor: memberAvatarColor(member.id) }}
                >
                  {memberInitial(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">
                    {name}
                  </div>
                  <div
                    className={`text-[13px] font-medium ${
                      member.isOwner ? 'text-teal' : 'text-muted-foreground'
                    }`}
                  >
                    {member.isOwner ? 'Admin' : 'Mitglied'}
                    {isMe ? ' · Du' : ''}
                  </div>
                </div>
                {isOwner && !isMe && (
                  <button
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive active:scale-[0.92]"
                    aria-label={`${name} entfernen`}
                    onClick={() => setPendingRemoval({ id: member.id, name })}
                  >
                    <RemoveIcon />
                  </button>
                )}
              </div>
            )
          })}

          {isOwner && (
            <button
              className="bg-card mt-2 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-6 active:opacity-70"
              onClick={() => setTab('invite')}
            >
              <span className="bg-teal/10 text-teal mb-1 flex size-11 items-center justify-center rounded-full">
                <InviteIcon />
              </span>
              <span className="text-[15px] font-semibold">
                Neues Mitglied einladen
              </span>
              <span className="text-muted-foreground text-[13px]">
                Per QR-Code, Link, WhatsApp oder E-Mail
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="mx-5 flex flex-col items-center">
          {/* QR */}
          <QrCodeDummy />
          <div className="mt-3.5 text-[15px] font-semibold">
            QR-Code scannen
          </div>
          <div className="text-muted-foreground mb-6 text-[13px]">
            oder Einladungslink teilen
          </div>

          {/* Link */}
          <div className="bg-card flex w-full items-center gap-2 rounded-2xl px-4 py-3">
            <div className="text-muted-foreground min-w-0 flex-1 truncate text-[14px]">
              {inviteLink}
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

          {/* Share */}
          <div className="w-full">
            <div className="text-muted-foreground mb-2 pl-1 text-xs font-semibold tracking-wider uppercase">
              Einladung senden
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-70"
                onClick={() =>
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(invitationText)}`,
                  )
                }
              >
                <span className="text-[#25D366]">
                  <WhatsAppIcon />
                </span>
                <span className="flex-1 text-[15px] font-semibold">
                  Per WhatsApp
                </span>
                <span className="text-muted-foreground text-[13px]">
                  Direkt senden
                </span>
              </button>
              <button
                className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-70"
                onClick={() => {
                  window.location.href = `mailto:?subject=${encodeURIComponent('Einladung zu ShopZebra')}&body=${encodeURIComponent(invitationText)}`
                }}
              >
                <span className="text-teal">
                  <MailIcon />
                </span>
                <span className="flex-1 text-[15px] font-semibold">
                  Per E-Mail
                </span>
                <span className="text-muted-foreground text-[13px]">
                  Einladungstext
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>
            {pendingRemoval?.name} entfernen?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRemoval?.name} hat dann keinen Zugriff mehr auf diese
            Einkaufsliste.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white"
              onClick={handleConfirmRemoval}
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-5 py-2.5 text-[14px] font-semibold text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
