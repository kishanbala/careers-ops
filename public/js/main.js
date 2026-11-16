// Entry point. Import order = original top-level statement order (Phase 1), plus the Phase 2 shell.
import './pdf.js';
import { start } from './router.js';
import './render/toast.js';
import './store.js';
import { renderDashboard, updateBadges } from './pages/dashboard.js';
import './pages/evaluate.js';
import './pages/scan.js';
import './pages/batch.js';
import './pages/cv.js';
import { renderStories } from './pages/stories.js';
import './pages/negotiate.js';
import './pages/research.js';
import './pages/outreach.js';
import { loadProfile } from './pages/profile.js';
import { initTheme } from './theme.js';
import { mountShell } from './shell.js';

// ===== INIT =====
initTheme();
mountShell();
start();
loadProfile();
renderDashboard();
renderStories();
updateBadges();
