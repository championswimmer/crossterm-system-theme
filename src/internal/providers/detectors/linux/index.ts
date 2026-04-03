import type { ThemeDetector } from '../../types.js'
import { linuxPortalDetector } from './portal.js'
import { linuxGnomeDetector } from './gnome.js'
import { linuxKdeDetector } from './kde.js'
import { linuxXfconfDetector } from './xfconf.js'

export const linuxDetectors: readonly ThemeDetector[] = [
  linuxPortalDetector,
  linuxGnomeDetector,
  linuxKdeDetector,
  linuxXfconfDetector
]
