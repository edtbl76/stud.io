import * as React from 'react' // skipcq: JS-C1003 -- React namespace import is idiomatic
import { render, waitFor } from '@testing-library/react'
import LoginPage from '@/app/login/page'

// BUG-2 regression: "Google login option missing after logout".
//
// Logout does a soft SPA navigation (router.replace('/login')), so the GSI
// script stays loaded from the previous visit and next/script's onLoad does NOT
// fire again. In that case the ONLY thing that can render the Google button is
// the on-mount initGoogle() effect in LoginPage. We simulate that by mocking
// next/script to render nothing (no onLoad) while window.google is already
// present, and asserting the button is still rendered.
//
// LoginPage now reads the client id via getGoogleClientId() at render time, so
// setting the env in beforeEach controls the gating without module resets.

jest.mock('next/script', () => ({ __esModule: true, default: () => null }))

const loginGoogle = jest.fn()
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ login: jest.fn(), loginGoogle }),
}))

const initialize = jest.fn()
const renderButton = jest.fn()

// Access window.google through a loose alias so the test can install/remove a
// partial GSI mock without satisfying the full @types/google.accounts shape.
const win = globalThis.window as unknown as { google?: unknown }

function installGoogleMock() { // skipcq: JS-0067 -- module-scope test helper, not a browser global
  win.google = { accounts: { id: { initialize, renderButton, prompt: jest.fn(), cancel: jest.fn() } } }
}

describe('LoginPage Google button — after-logout re-init (BUG-2)', () => {
  const OLD_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  beforeEach(() => {
    initialize.mockClear()
    renderButton.mockClear()
    installGoogleMock()
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'test-google-client'
  })

  afterEach(() => {
    if (OLD_ID === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    else process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = OLD_ID
    win.google = undefined
  })

  it('renders the Google button on mount when the GSI script is already loaded (script onLoad does not fire)', async () => {
    render(<LoginPage />)
    // The on-mount effect must call renderButton even though next/script's
    // onLoad never fired (the after-logout case).
    await waitFor(() => expect(renderButton).toHaveBeenCalledTimes(1))
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'test-google-client' }),
    )
  })

  it('does not attempt to render the Google button when the GSI script has not loaded yet', () => {
    win.google = undefined
    render(<LoginPage />)
    expect(renderButton).not.toHaveBeenCalled()
  })
})
