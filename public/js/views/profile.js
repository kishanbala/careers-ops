// Phase 2 stub (3D replaces this file): delegates to the legacy My Profile page until Phase 3.
import { showLegacy } from '../shell.js';

export function mount() {
  return showLegacy('profile');
}
