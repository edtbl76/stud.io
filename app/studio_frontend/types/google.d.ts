interface CredentialResponse {
  credential: string
  select_by: string
}

interface IdConfiguration {
  client_id: string
  callback: (response: CredentialResponse) => void
  auto_select?: boolean
  cancel_on_tap_outside?: boolean
}

interface GsiButtonConfiguration {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  shape?: 'rectangular' | 'pill' | 'circle' | 'square'
  width?: number
}

interface Google {
  accounts: {
    id: {
      initialize: (config: IdConfiguration) => void
      renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void
      prompt: (momentListener?: (notification: PromptMomentNotification) => void) => void
      cancel: () => void
    }
  }
}

interface PromptMomentNotification {
  isDisplayMoment: () => boolean
  isDisplayed: () => boolean
  isNotDisplayed: () => boolean
  getNotDisplayedReason: () => string
  isSkippedMoment: () => boolean
  getSkippedReason: () => string
  isDismissedMoment: () => boolean
  getDismissedReason: () => string
  getMomentType: () => string
}

declare global {
  interface Window {
    google: Google
  }
}

export {}
