import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { selectAuthUser } from '../auth/authSlice'
import { performSignOut } from '../auth/authThunks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// --- Icons ---

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 fill-white">
      <path d="M12 12m-3.2 0a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9z" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 fill-[var(--text-dim,rgba(255,255,255,0.35))]">
      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  )
}

// --- Component ---

export function ProfilePage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const user = useAppSelector(selectAuthUser)

  const email = user?.email ?? ''
  const displayName = user?.name ?? ''
  const isFederated = user?.provider !== 'email'
  const initial = (displayName || email).charAt(0).toUpperCase() || '?'

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(displayName)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleSignOut = () => {
    dispatch(performSignOut())
  }

  const handleSaveName = () => {
    setEditingName(false)
  }

  return (
    <div className="flex min-h-screen flex-col pb-10">
      {/* Nav Header */}
      <header className="flex shrink-0 items-center justify-between px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="text-teal gap-1.5 px-0 text-[15px] font-semibold"
          onClick={() => navigate({ to: '/lists' })}
        >
          <BackIcon />
          Listen
        </Button>
        <h1 className="font-display text-[17px] font-bold">Profil</h1>
        <div className="w-[70px]" />
      </header>

      {/* Avatar + Foto ändern */}
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

      {/* Persönliche Daten */}
      <div className="mx-5 mb-4">
        <div className="text-muted-foreground mb-2 pl-1 text-xs font-semibold uppercase tracking-wider">
          Persönliche Daten
        </div>
        <div className="bg-card divide-border overflow-hidden rounded-2xl border divide-y">
          {/* Name */}
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:opacity-70"
            onClick={() => setEditingName(true)}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(78,157,166,0.12)] text-teal">
              <PersonIcon />
            </div>
            <div className="min-w-0 flex-1">
              {editingName ? (
                <Input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  autoFocus
                  className="h-auto rounded-xl border-input px-3.5 py-2.5 text-[15px] font-semibold focus:border-teal focus:ring-[rgba(78,157,166,0.3)]"
                />
              ) : (
                <div className="text-[15px] font-semibold">
                  {displayName || 'Name'}
                </div>
              )}
            </div>
            {!editingName && <ChevronRightIcon />}
          </button>

          {/* Email */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] text-muted-foreground">
              <EmailIcon />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">E-Mail</div>
              <div className="text-muted-foreground truncate text-[13px] font-medium">
                {email || 'Nicht verfügbar'}
              </div>
            </div>
          </div>

          {/* Passwort ändern — only for email/password accounts */}
          {!isFederated && (
            <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:opacity-70">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] text-muted-foreground">
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

      {/* Benachrichtigungen */}
      <div className="mx-5 mb-4">
        <div className="text-muted-foreground mb-2 pl-1 text-xs font-semibold uppercase tracking-wider">
          Benachrichtigungen
        </div>
        <div className="bg-card overflow-hidden rounded-2xl border">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(232,146,58,0.12)] text-[#E8923A]">
              <BellIcon />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">Push-Benachrichtigungen</div>
              <div className="text-muted-foreground text-[13px] font-medium">
                Listen-Updates, Einladungen
              </div>
            </div>
            <button
              className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300"
              style={{ background: notificationsEnabled ? 'var(--teal)' : 'rgba(255,255,255,0.06)' }}
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            >
              <div
                className="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.2)] transition-transform duration-300"
                style={{ transform: notificationsEnabled ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Konto */}
      <div className="mx-5 mb-4">
        <div className="text-muted-foreground mb-2 pl-1 text-xs font-semibold uppercase tracking-wider">
          Konto
        </div>
        <div className="bg-card overflow-hidden rounded-2xl border">
          <button
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:opacity-70"
            onClick={handleSignOut}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.04] text-muted-foreground">
              <LogoutIcon />
            </div>
            <div className="text-[15px] font-semibold">Abmelden</div>
          </button>
        </div>
      </div>

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

      {/* Konto löschen */}
      <button
        className="mx-auto pt-3 text-[13px] font-medium text-destructive opacity-50 transition-opacity hover:opacity-80"
        onClick={() => setDeleteDialogOpen(true)}
      >
        Konto löschen
      </button>

      {/* Version */}
      <div className="text-muted-foreground py-2 text-center text-xs font-medium opacity-60">
        ShopZebra v1.0.0
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Konto löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dein Konto und alle Daten werden unwiderruflich gelöscht. Diese
              Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
