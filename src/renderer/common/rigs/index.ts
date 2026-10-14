// Известные «куклы»: имя в character.json → класс.

import { BlackCatRig } from './blackCat'
import { BunnyRig } from './bunny'

export const RIGS = { blackcat: BlackCatRig, bunny: BunnyRig } as const
export type RigName = keyof typeof RIGS
