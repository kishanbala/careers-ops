// Entry point. Phase 4A: the legacy v1 pages are retired; every route renders a view through the shell.
import './pdf.js';
import { start } from './router.js';
import './store.js';
import { initTheme } from './theme.js';
import { mountShell } from './shell.js';

// ===== INIT =====
initTheme();
mountShell();
start();
