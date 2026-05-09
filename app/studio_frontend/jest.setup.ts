import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'

// Increase waitFor timeout for CI environments where the event loop is under load.
configure({ asyncUtilTimeout: 5000 })
