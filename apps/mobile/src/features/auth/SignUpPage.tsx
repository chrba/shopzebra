import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { signInWithRedirect } from 'aws-amplify/auth'
import { useAppDispatch, useAppSelector } from '../../app/store'
import {
  authLoading,
  authErrorCleared,
  selectAuthStatus,
  selectAuthError,
  selectConfirmationPending,
  selectPendingEmail,
} from './state/authSlice'
import { performSignUp, performConfirmSignUp } from './state/authThunks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5 shrink-0">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  )
}

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

function SignUpForm() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const status = useAppSelector(selectAuthStatus)
  const serverError = useAppSelector(selectAuthError)
  const loading = status === 'loading'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [confirmError, setConfirmError] = useState(false)

  const handleSubmit = () => {
    dispatch(authErrorCleared())
    let hasError = false

    if (!email || !validateEmail(email)) {
      setEmailError(true)
      hasError = true
    }
    if (!password || password.length < 8) {
      setPasswordError(true)
      hasError = true
    }
    if (password !== confirmPassword) {
      setConfirmError(true)
      hasError = true
    }

    if (hasError) return

    dispatch(authLoading())
    dispatch(performSignUp({ email, password }))
  }

  const handleGoogleSignUp = () => {
    void signInWithRedirect({ provider: 'Google' })
  }

  return (
    <>
      {/* Social Login */}
      <div className="mb-1 flex flex-col gap-2.5">
        <Button
          variant="outline"
          className="h-auto w-full gap-2.5 rounded-2xl py-[15px] text-[15px] font-semibold"
          onClick={handleGoogleSignUp}
        >
          <GoogleIcon />
          Mit Google registrieren
        </Button>
        <Button
          variant="outline"
          className="h-auto w-full gap-2.5 rounded-2xl py-[15px] text-[15px] font-semibold"
        >
          <AppleIcon />
          Mit Apple registrieren
        </Button>
      </div>

      {/* Divider */}
      <div className="my-[18px] flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[13px] font-semibold text-muted-foreground">
          oder mit E-Mail
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Server error */}
      {serverError && (
        <div className="mb-3.5 flex items-center gap-1.5 rounded-xl bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
          <ErrorIcon />
          <span>{serverError}</span>
        </div>
      )}

      {/* Email */}
      <div className="mb-3.5">
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

      {/* Password */}
      <div className="mb-3.5">
        <Input
          type="password"
          placeholder="Passwort"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
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
          'Konto erstellen'
        )}
      </Button>

      {/* Sign in footer */}
      <div className="mt-5 text-center text-sm font-medium text-muted-foreground">
        Schon ein Konto?{' '}
        <Button
          variant="link"
          className="h-auto p-0 text-sm font-bold text-teal"
          onClick={() => void navigate({ to: '/signin' })}
        >
          Anmelden
        </Button>
      </div>
    </>
  )
}

function ConfirmationForm() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const status = useAppSelector(selectAuthStatus)
  const serverError = useAppSelector(selectAuthError)
  const pendingEmail = useAppSelector(selectPendingEmail)
  const loading = status === 'loading'

  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(false)

  const handleConfirm = () => {
    dispatch(authErrorCleared())

    if (!code || code.length !== 6) {
      setCodeError(true)
      return
    }

    dispatch(authLoading())
    dispatch(performConfirmSignUp({ email: pendingEmail ?? '', code }))
  }

  // Navigate to sign-in after successful confirmation
  const confirmationPending = useAppSelector(selectConfirmationPending)
  if (!confirmationPending && status === 'idle' && !serverError) {
    void navigate({ to: '/signin' })
  }

  return (
    <>
      <div className="mb-6 text-center">
        <div className="mb-2 text-lg font-bold text-foreground">
          Bestätigungscode eingeben
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

      {/* Code input */}
      <div className="mb-5">
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
            if (e.key === 'Enter') handleConfirm()
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

      {/* Submit */}
      <Button
        disabled={loading}
        onClick={handleConfirm}
        className="h-auto w-full rounded-2xl py-[17px] text-base font-bold text-white shadow-[0_4px_20px_rgba(78,157,166,0.3)]"
        style={{
          background: 'linear-gradient(135deg, var(--teal), #3A8A92)',
        }}
      >
        {loading ? (
          <div className="mx-auto h-5 w-5 animate-spin rounded-full border-[2.5px] border-white/30 border-t-white" />
        ) : (
          'Bestätigen'
        )}
      </Button>

    </>
  )
}

export function SignUpPage() {
  const navigate = useNavigate()
  const confirmationPending = useAppSelector(selectConfirmationPending)

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

      {/* Branding */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-8">
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
        {!confirmationPending && (
          <div className="mt-1.5 text-[15px] font-medium text-muted-foreground">
            Konto erstellen
          </div>
        )}
      </div>

      {/* Form Area */}
      <div className="shrink-0 px-6 pb-10">
        {confirmationPending ? <ConfirmationForm /> : <SignUpForm />}
      </div>
    </div>
  )
}
