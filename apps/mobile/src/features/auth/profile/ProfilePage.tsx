import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectIdentity } from '../domain/authSlice'
import { isDrawnName } from '../domain/zebraNames'
import { performChangeDisplayName, performSignOut } from '../domain/authThunks'
import { PageHeader } from '@/components/PageHeader'
import { DangerConfirmDialog } from '@/components/DangerConfirmDialog'
import { Input } from '@/components/ui/input'

// --- Icons ---

/** Silhouette avatar for the "Name" settings row. */
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  )
}

/** Envelope icon for the email settings row. */
function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  )
}

/** Padlock icon for the "change password" row. */
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
    </svg>
  )
}

/** Door-with-arrow icon for the sign-out button. */
function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  )
}

/** Camera badge overlaid on the avatar to indicate photo change. */
function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
      <path d="M12 12m-3.2 0a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9z" />
    </svg>
  )
}

/** Dimmed right-pointing arrow indicating a tappable row. */
function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px] shrink-0 fill-[var(--text-dim,rgba(255,255,255,0.35))]"
    >
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  )
}

// --- Component ---

/**
 * User profile screen — avatar, personal data,
 * notifications, sign-out, account deletion.
 */
export function ProfilePage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const identity = useAppSelector(selectIdentity)

  // Guests own no email, no password and nowhere to sign back in to —
  // those rows return with M2/M3. A device without any identity has no
  // name to show either: it is asked for one at the first share.
  const linked = identity.kind === 'linked' ? identity : null
  const email = linked?.email ?? ''
  // Never empty: the device named itself at its first start.
  const displayName = identity.name
  const isFederated = linked !== null && linked.provider !== 'email'
  const initial = (displayName || email).charAt(0).toUpperCase() || '?'

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(displayName)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleSignOut = () => {
    dispatch(performSignOut())
  }

  const handleSaveName = () => {
    setEditingName(false)
    if (nameInput.trim() !== displayName) {
      void dispatch(performChangeDisplayName({ name: nameInput }))
    }
  }

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <PageHeader
        title="Profil"
        backLabel="Listen"
        onBack={() => void navigate({ to: '/lists' })}
      />

      {/* Avatar + change photo */}
      <div className="flex flex-col items-center px-6 pt-2 pb-7">
        <div className="relative mb-3.5 active:scale-[0.96]">
          <div className="flex size-[88px] items-center justify-center rounded-full bg-[#6BBF6B] text-4xl font-extrabold text-white">
            {initial}
          </div>
          <div className="border-background bg-teal absolute right-0 bottom-0 flex size-[30px] items-center justify-center rounded-full border-[3px]">
            <CameraIcon />
          </div>
        </div>
        <span className="text-muted-foreground -mt-1 mb-1 text-xs font-medium">
          Foto ändern
        </span>
      </div>

      {/* Personal data — the name exists from the first start, so this
          section is never empty. */}
      <div className="mx-5 mb-4">
        <div className="text-muted-foreground mb-2 pl-1 text-xs font-semibold tracking-wider uppercase">
          Persönliche Daten
        </div>
        <div className="bg-card divide-border divide-y overflow-hidden rounded-2xl border">
          {/* Name */}
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:opacity-70"
            onClick={() => setEditingName(true)}
          >
            <div className="text-teal flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(78,157,166,0.12)]">
              <PersonIcon />
            </div>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <Input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                  autoFocus
                  className="border-input focus:border-teal h-auto rounded-xl px-3.5 py-2.5 text-[15px] font-semibold focus:ring-[rgba(78,157,166,0.3)]"
                />
              ) : (
                <>
                  <div className="text-[15px] font-semibold">
                    {displayName || 'Name'}
                  </div>
                  {/* A drawn name is a placeholder with a face, not a
                      choice — say so, or people take it for their own. */}
                  {isDrawnName(displayName) && (
                    <div className="text-muted-foreground text-[13px] font-medium">
                      Automatisch vergeben
                    </div>
                  )}
                </>
              )}
            </div>
            {!editingName && <ChevronRightIcon />}
          </button>

          {/* Email — a guest has none until M2 links one */}
          {linked !== null && (
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04]">
                <EmailIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">E-Mail</div>
                <div className="text-muted-foreground truncate text-[13px] font-medium">
                  {email || 'Nicht verfügbar'}
                </div>
              </div>
            </div>
          )}

          {/* Change password — only for email/password accounts */}
          {linked !== null && !isFederated && (
            <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:opacity-70">
              <div className="text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04]">
                <LockIcon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">Passwort ändern</div>
              </div>
              <ChevronRightIcon />
            </button>
          )}
        </div>
      </div>

      {/* Account — signing out a guest would throw away their only copy */}
      {linked !== null && (
        <div className="mx-5 mb-4">
          <div className="text-muted-foreground mb-2 pl-1 text-xs font-semibold tracking-wider uppercase">
            Konto
          </div>
          <div className="bg-card overflow-hidden rounded-2xl border">
            <button
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:opacity-70"
              onClick={handleSignOut}
            >
              <div className="text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04]">
                <LogoutIcon />
              </div>
              <div className="text-[15px] font-semibold">Abmelden</div>
            </button>
          </div>
        </div>
      )}

      {/* Legal Footer */}
      <div className="mt-auto flex justify-center gap-5 px-6 pt-6">
        <button className="text-muted-foreground text-xs font-medium opacity-60 transition-opacity hover:opacity-80">
          Impressum
        </button>
        <button className="text-muted-foreground text-xs font-medium opacity-60 transition-opacity hover:opacity-80">
          Datenschutz
        </button>
        <button className="text-muted-foreground text-xs font-medium opacity-60 transition-opacity hover:opacity-80">
          AGB
        </button>
      </div>

      {/* Delete account */}
      {linked !== null && (
        <button
          className="text-destructive mx-auto pt-3 text-[13px] font-medium opacity-50 transition-opacity hover:opacity-80"
          onClick={() => setDeleteDialogOpen(true)}
        >
          Konto löschen
        </button>
      )}

      {/* Version */}
      <div className="text-muted-foreground py-2 text-center text-xs font-medium opacity-60">
        ShopZebra v1.0.0
      </div>

      {/* Delete Confirmation Dialog */}
      <DangerConfirmDialog
        open={deleteDialogOpen}
        title="Konto löschen?"
        message="Dein Konto und alle Daten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        onConfirm={() => setDeleteDialogOpen(false)}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  )
}
