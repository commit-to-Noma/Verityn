/** Fixed L1 lesson pack, shared with the backend pack tests. */

import type { LessonPack } from './lesson'
import pack from '../../../src/verityn/lessons/l1.json'

export const L1: LessonPack = pack as unknown as LessonPack
