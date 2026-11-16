import { esc } from './escape.js';

// ===== EVAL BLOCKS =====
export function renderEvalBlocks(data) {
  const blockTitles = {
    roleSummary: 'Role Summary', cvMatch: 'CV Match', levelStrategy: 'Level Strategy',
    compResearch: 'Compensation', personalizationHook: 'Why You', interviewPrep: 'Interview Prep',
    gapsFraming: 'Gaps & How to Frame Them'
  };
  const blocks = data.blocks || {};
  let html = '';
  for (const [k, title] of Object.entries(blockTitles)) {
    if (blocks[k]) {
      html += `<div class="eval-block"><div class="eval-block-title">${title}</div><div class="eval-block-body">${esc(blocks[k])}</div></div>`;
    }
  }
  if (data.gaps?.length) {
    html += `<div class="eval-block"><div class="eval-block-title">Gaps & How to Frame Them</div>${data.gaps.map(g => `<div class="star-item" style="margin-bottom:8px;"><div class="star-q">${g.severity === 'blocker' ? '🔴' : '🟡'} ${esc(g.gap)} <span style="font-size:11px;opacity:.7;">(${esc(g.severity || '')})</span></div><div class="star-starter">${esc(g.why)}<br><strong>Bridge:</strong> ${esc(g.bridge)}</div></div>`).join('')}</div>`;
  }
  if (data.starStories?.length) {
    html += `<div class="eval-block"><div class="eval-block-title">STAR+R Story Starters</div>${data.starStories.map(s => `<div class="star-item" style="margin-bottom:8px;"><div class="star-q">❓ ${esc(s.question)}</div><div class="star-starter">💡 ${esc(s.starter)}${s.reflection ? `<br><strong>R:</strong> ${esc(s.reflection)}` : ''}</div></div>`).join('')}</div>`;
  }
  if (data.redFlagQuestions?.length) {
    html += `<div class="eval-block"><div class="eval-block-title">Red-Flag Questions</div>${data.redFlagQuestions.map(q => `<div class="star-item" style="margin-bottom:8px;"><div class="star-q">⚠️ ${esc(q.question)}</div><div class="star-starter">${esc(q.answer)}</div></div>`).join('')}</div>`;
  }
  if (data.keywords?.length) {
    html += `<div class="eval-block"><div class="eval-block-title">ATS Keywords</div><div class="eval-block-body">${data.keywords.map(k => `<span class="eval-meta-chip" style="display:inline-block;margin:2px 4px 2px 0;background:var(--bg);">${esc(k)}</span>`).join('')}</div></div>`;
  }
  if (data.draftAnswers?.length) {
    html += `<div class="eval-block"><div class="eval-block-title">Draft Application Answers</div>${data.draftAnswers.map(a => `<div class="star-item" style="margin-bottom:8px;"><div class="star-q">${esc(a.question)}</div><div class="star-starter">${esc(a.answer)}</div></div>`).join('')}</div>`;
  }
  return html;
}
