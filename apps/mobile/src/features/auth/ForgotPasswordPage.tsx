import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../app/store'
import {
  authLoading,
  authErrorCleared,
  selectAuthStatus,
  selectAuthError,
  selectResetPending,
  selectPendingEmail,
} from './authSlice'
import { performForgotPassword, performResetPassword } from './authThunks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function ErrorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  )
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function RequestCodeForm() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const status = useAppSelector(selectAuthStatus)
  const serverError = useAppSelector(selectAuthError)
  const loading = status === 'loading'

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState(false)

  const handleSubmit = () => {
    dispatch(authErrorCleared())

    if (!email || !validateEmail(email)) {
      setEmailError(true)
      return
    }

    dispatch(authLoading())
    dispatch(performForgotPassword({ email }))
  }

  return (
    <>
      <div className="mb-6 text-center">
        <div className="mb-2 text-lg font-bold text-foreground">
          Passwort zurücksetzen
        </div>
        <div className="text-sm text-muted-foreground">
          Wir senden dir einen Code per E-Mail
        </div>
      </div>

      {/* Server error */}
      {serverError && (
        <div className="mb-3.5 flex items-center gap-1.5 rounded-xl bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          <ErrorIcon />
          <span>{serverError}</span>
        </div>
      )}

      {/* Email */}
      <div className="mb-5">
        <Input
          type="email"
          placeholder="E-Mail-Adresse"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setEmailError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          aria-invalid={emailError}
          className="h-auto rounded-2xl px-[18px] py-4 text-base font-medium"
        />
        {emailError && (
          <div className="mt-1.5 flex items-center gap-[5px] pl-1 text-[13px] font-medium text-destructive">
            <ErrorIcon />
            <span>Bitte gib eine gültige E-Mail-Adresse ein</span>
          </div>
        )}
      </div>

      {/* Submit */}
      <Button
        disabled={loading}
        onClick={handleSubmit}
        className="h-auto w-full rounded-2xl py-[17px] text-base font-bold text-white shadow-[0_4px_20px_rgba(78,157,166,0.3)]"
        style={{
          background: 'linear-gradient(135deg, var(--teal), #3A8A92)',
        }}
      >
        {loading ? (
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-[2.5px] border-white/30 border-t-white" />
        ) : (
          'Code senden'
        )}
      </Button>

      {/* Sign in footer */}
      <div className="mt-5 text-center text-sm font-medium text-muted-foreground">
        Zurück zur{' '}
        <Button
          variant="link"
          className="h-auto p-0 text-sm font-bold text-teal"
          onClick={() => void navigate({ to: '/signin' })}
        >
          Anmeldung
        </Button>
      </div>
    </>
  )
}

function ResetPasswordForm() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const status = useAppSelector(selectAuthStatus)
  const serverError = useAppSelector(selectAuthError)
  const pendingEmail = useAppSelector(selectPendingEmail)
  const resetPending = useAppSelector(selectResetPending)
  const loading = status === 'loading'

  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [confirmError, setConfirmError] = useState(false)

  // Navigate to sign-in after successful reset
  if (!resetPending && status === 'idle' && !serverError) {
    void navigate({ to: '/signin' })
  }

  const handleSubmit = () => {
    dispatch(authErrorCleared())
    let hasError = false

    if (!code || code.length !== 6) {
      setCodeError(true)
      hasError = true
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordError(true)
      hasError = true
    }
    if (newPassword !== confirmPassword) {
      setConfirmError(true)
      hasError = true
    }

    if (hasError) return

    dispatch(authLoading())
    dispatch(
      performResetPassword({
        email: pendingEmail ?? '',
        code,
        newPassword,
      }),
    )
  }

  return (
    <>
      <div className="mb-6 text-center">
        <div className="mb-2 text-lg font-bold text-foreground">
          Neues Passwort setzen
        </div>
        <div className="text-sm text-muted-foreground">
          Wir haben einen Code an{' '}
          <span className="font-semibold text-foreground">{pendingEmail}</span>{' '}
          geschickt
        </div>
      </div>

      {/* Server error */}
      {serverError && (
        <div className="mb-3.5 flex items-center gap-1.5 rounded-xl bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          <ErrorIcon />
          <span>{serverError}</span>
        </div>
      )}

      {/* Code */}
      <div className="mb-3.5">
        <Input
          type="text"
          placeholder="6-stelliger Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            setCode(digits)
            setCodeError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          aria-invalid={codeError}
          className="h-auto rounded-2xl px-[18px] py-4 text-center text-xl font-bold tracking-[0.3em] placeholder:text-base placeholder:font-medium placeholder:tracking-normal"
        />
        {codeError && (
          <div className="mt-1.5 flex items-center gap-[5px] pl-1 text-[13px] font-medium text-destructive">
            <ErrorIcon />
            <span>Bitte gib den 6-stelligen Code ein</span>
          </div>
        )}
      </div>

      {/* New password */}
      <div className="mb-3.5">
        <Input
          type="password"
          placeholder="Neues Passwort"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value)
            setPasswordError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          aria-invalid={passwordError}
          className="h-auto rounded-2xl px-[18px] py-4 text-base font-medium"
        />
        {passwordError && (
          <div className="mt-1.5 flex items-center gap-[5px] pl-1 text-[13px] font-medium text-destructive">
            <ErrorIcon />
            <span>Passwort muss mindestens 8 Zeichen lang sein</span>
          </div>
        )}
      </div>

      {/* Confirm password */}
      <div className="mb-5">
        <Input
          type="password"
          placeholder="Passwort bestätigen"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value)
            setConfirmError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          aria-invalid={confirmError}
          className="h-auto rounded-2xl px-[18px] py-4 text-base font-medium"
        />
        {confirmError && (
          <div className="mt-1.5 flex items-center gap-[5px] pl-1 text-[13px] font-medium text-destructive">
            <ErrorIcon />
            <span>Passwörter stimmen nicht überein</span>
          </div>
        )}
      </div>

      {/* Submit */}
      <Button
        disabled={loading}
        onClick={handleSubmit}
        className="h-auto w-full rounded-2xl py-[17px] text-base font-bold text-white shadow-[0_4px_20px_rgba(78,157,166,0.3)]"
        style={{
          background: 'linear-gradient(135deg, var(--teal), #3A8A92)',
        }}
      >
        {loading ? (
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-[2.5px] border-white/30 border-t-white" />
        ) : (
          'Passwort zurücksetzen'
        )}
      </Button>
    </>
  )
}

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const resetPending = useAppSelector(selectResetPending)

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* Back header */}
      <header className="flex shrink-0 items-center px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="gap-1.5 px-0 text-[15px] font-semibold text-teal"
          onClick={() => void navigate({ to: '/signin' })}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Anmelden
        </Button>
      </header>

      {/* Branding (compact) */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-2">
          <div
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-4xl"
            style={{
              background: 'linear-gradient(135deg, var(--teal), #3A8A92)',
              boxShadow: '0 8px 32px rgba(78,157,166,0.25)',
            }}
          >
            🦓
          </div>
        </div>
        <div className="mt-4 font-display text-[28px] font-extrabold tracking-tight">
          ShopZebra
        </div>
      </div>

      {/* Form Area */}
      <div className="shrink-0 px-6 pb-10">
        {resetPending ? <ResetPasswordForm /> : <RequestCodeForm />}
      </div>
    </div>
  )
}
