/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as dripDay1 } from './drip-day1-welcome.tsx'
import { template as dripDay3 } from './drip-day3-quickwins.tsx'
import { template as dripDay5 } from './drip-day5-usecases.tsx'
import { template as dripDay7 } from './drip-day7-trial-reminder.tsx'
import { template as trialExtended } from './trial-extended.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'drip-day1-welcome': dripDay1,
  'drip-day3-quickwins': dripDay3,
  'drip-day5-usecases': dripDay5,
  'drip-day7-trial-reminder': dripDay7,
  'trial-extended': trialExtended,
}
