// Phase 2 stub (3D replaces this file): Add role delegates to the legacy pages until Phase 3.
// #/add -> Evaluate Offer · #/add/several -> Evaluate Multiple Jobs · #/add/scan -> Find Jobs
import { showLegacy } from '../shell.js';

const PAGE = { several: 'batch', scan: 'scan' };

export function mount(el, { params }) {
  return showLegacy(PAGE[params.mode] || 'evaluate');
}
