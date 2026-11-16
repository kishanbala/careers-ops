// Entry point (Phase 1 module split). Import order = original top-level statement order.
import './pdf.js';
import './router.js';
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

// ===== INIT =====
loadProfile();
renderDashboard();
renderStories();
updateBadges();
