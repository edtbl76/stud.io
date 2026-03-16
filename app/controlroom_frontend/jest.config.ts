import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!jest.config.ts',
    '!jest.setup.ts',
    '!tailwind.config.ts',
    '!types/**',
  ],
  coverageReporters: ['lcov', 'text-summary'],
  coverageDirectory: 'coverage',
}

export default createJestConfig(config)
