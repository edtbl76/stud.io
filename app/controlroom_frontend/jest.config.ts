import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/.next-e2e*/**',
    '!**/.next-perf/**',
    '!**/coverage/**',
    '!**/__tests__/**',
    '!jest.config.ts',
    '!jest.setup.ts',
    '!playwright*.config.ts',
    '!e2e/**',
    '!tailwind.config.ts',
    '!next.config.mjs',
    '!postcss.config.mjs',
    '!types/**',
    // Next.js boilerplate — no testable logic
    '!app/layout.tsx',
    '!app/providers.tsx',
    '!app/page.tsx',
    // Thin TablePage wrappers — logic lives in components/
    '!app/catalog/**',
    '!app/session/**',
    '!app/tools/**',
    '!app/config/**',
    // shadcn/ui primitives — no custom logic
    '!components/ui/**',
    // Thin layout shell — conditional rendering only, logic lives in Sidebar
    '!components/layout/LayoutShell.tsx',
    // TanStack Table column definitions — thin view config, logic tested via Modal tests
    '!components/tables/**/columns.tsx',
  ],
  coverageReporters: ['lcov', 'text-summary'],
  coverageDirectory: 'coverage',
}

export default createJestConfig(config)
