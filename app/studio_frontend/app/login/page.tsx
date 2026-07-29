'use client'

import * as React from 'react'
import Script from 'next/script'
import { useAuth } from '@/lib/auth'
import { Loader2 } from 'lucide-react'

// Read at call time (not a module-level const captured at import) so the value
// is evaluated per render. Next.js inlines process.env.NEXT_PUBLIC_* textually,
// so production behavior is unchanged; this also makes the Google-button gating
// unit-testable without module resets. See page.google.test.tsx.
const getGoogleClientId = (): string => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

function useGoogleSignIn(loginGoogle: (credential: string) => Promise<void>) { // skipcq: JS-0067 -- module-scope hook, not a browser global
  const googleButtonRef = React.useRef<HTMLDivElement>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const initGoogle = React.useCallback(() => {
    const clientId = getGoogleClientId()
    const gApi = globalThis.window?.google
    if (!clientId || !gApi || !googleButtonRef.current) return
    gApi.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        void (async () => {
          setError(null)
          setLoading(true)
          try {
            await loginGoogle(response.credential)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Google login failed')
          } finally {
            setLoading(false)
          }
        })()
      },
    })
    gApi.accounts.id.renderButton(googleButtonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 352,
    })
  }, [loginGoogle])

  // If the GSI script was already loaded from a previous page visit (e.g. after
  // logout), onLoad won't fire again. Calling initGoogle() on mount covers that case.
  React.useEffect(() => {
    initGoogle()
  }, [initGoogle])

  return { googleButtonRef, initGoogle, error, loading }
}

// Presentational sub-components. Declared as const-arrow components (not `function`
// declarations) so they don't trip DeepSource JS-0067 the way module-scope function
// declarations do — see getGoogleClientId above. Extracting them keeps LoginPage's JSX
// tree at <= 4 levels deep (JS-0415) and removes the duplicated username/password markup.
interface LoginFieldProps {
  id: string
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  wrapperClassName?: string
}

const LoginField = ({
  id, label, type, value, onChange, autoComplete, wrapperClassName,
}: Readonly<LoginFieldProps>) => (
  <div className={wrapperClassName}>
    <label htmlFor={id} className="block text-xs text-muted-foreground mb-1.5">
      {label}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      required
      className="w-full rounded border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
    />
  </div>
)

const OrDivider = () => (
  <div className="relative my-5">
    <div className="absolute inset-0 flex items-center">
      <div className="w-full border-t border-border" />
    </div>
    <div className="relative flex justify-center">
      <span className="bg-card px-2 text-xs text-muted-foreground">or</span>
    </div>
  </div>
)

const SubmitButton = ({ loading, children }: Readonly<{ loading: boolean; children: React.ReactNode }>) => (
  <button
    type="submit"
    disabled={loading}
    className="w-full flex items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
  >
    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
    {children}
  </button>
)

interface GoogleSignInProps {
  clientId: string
  onLoad: () => void
  buttonRef: React.RefObject<HTMLDivElement | null>
}

// Self-gating: renders nothing when Google login is disabled. Bundling the GSI
// script + divider + button here gives LoginPage a single render site instead of
// two separate `googleClientId &&` branches (which pushed its complexity over 5).
const GoogleSignIn = ({ clientId, onLoad, buttonRef }: Readonly<GoogleSignInProps>) => {
  if (!clientId) return null
  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={onLoad}
      />
      <OrDivider />
      <div ref={buttonRef} className="flex justify-center" />
    </>
  )
}

export default function LoginPage() { // skipcq: JS-0067 -- Next.js page component, not a browser global
  const { login, loginGoogle } = useAuth()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [formError, setFormError] = React.useState<string | null>(null)
  const [formLoading, setFormLoading] = React.useState(false)
  const { googleButtonRef, initGoogle, error: googleError, loading: googleLoading } = useGoogleSignIn(loginGoogle)

  const error = formError ?? googleError
  const loading = formLoading || googleLoading
  const googleClientId = getGoogleClientId()

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    setFormLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-1">
            STUD.io
          </div>
          <div className="text-xl font-semibold text-foreground">ControlRoom</div>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e) }} className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-medium text-foreground mb-5">Sign in</h2>

          <LoginField
            id="login-username"
            label="Username"
            type="text"
            value={username}
            onChange={setUsername}
            autoComplete="username"
            wrapperClassName="mb-4"
          />

          <LoginField
            id="login-password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            wrapperClassName="mb-5"
          />

          {error && (
            <p className="mb-4 text-xs text-destructive">{error}</p>
          )}

          <SubmitButton loading={loading}>Sign in</SubmitButton>

          <GoogleSignIn clientId={googleClientId} onLoad={initGoogle} buttonRef={googleButtonRef} />
        </form>
      </div>
    </div>
  )
}
