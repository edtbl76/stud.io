'use client'

import * as React from 'react'
import { VendorMappingsSection } from '@/components/tables/scanner/rules/VendorMappingsSection'
import { NameMappingsSection } from '@/components/tables/scanner/rules/NameMappingsSection'
import { NamePatternsSection } from '@/components/tables/scanner/rules/NamePatternsSection'

export function PluginScannerRulesPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <div>
        <h1 className="text-xl font-bold">Plugin Scanner Rules</h1>
        <p className="text-sm text-muted-foreground">Manage vendor, name, and pattern normalization rules.</p>
      </div>
      <VendorMappingsSection />
      <NameMappingsSection />
      <NamePatternsSection />
    </div>
  )
}
