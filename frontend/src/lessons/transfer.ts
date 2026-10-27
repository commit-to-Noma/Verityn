/** Solo transfer challenge pack, shared with the backend pack tests. */

import type { Challenge } from './lesson'
import pack from '../../../src/verityn/lessons/transfer.json'

export const TRANSFER: Challenge = pack as unknown as Challenge
