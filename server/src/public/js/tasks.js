/* tasks.js — client-side behaviour for task create/edit forms.
 * No inline scripts or event handlers in views.
 * All behaviour driven by data- attributes.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Team quick-pick ──────────────────────────────────────────────────────────
  // The select#teamQuickPick has data-teams="[{id,name,members:[empId,...]}]"
  // Choosing a team ticks all member checkboxes that exist on the page.
  // The user can then manually untick any of them.
  // The submitted field is employee_ids (standard checkboxes) — unchanged.

  const teamPick = document.getElementById('teamQuickPick');
  if (teamPick) {
    let teams = [];
    try { teams = JSON.parse(teamPick.getAttribute('data-teams') || '[]'); } catch {}

    teamPick.addEventListener('change', () => {
      const teamId = +teamPick.value;
      if (!teamId) return;

      const team = teams.find(t => t.id === teamId);
      if (!team) return;

      // Tick all checkboxes whose data-emp-id is in this team's members list
      team.members.forEach(empId => {
        const cb = document.querySelector(`.emp-checkbox[data-emp-id="${empId}"]`);
        if (cb && !cb.checked) {
          cb.checked = true;
          // Update label background to match the checked style in _form.ejs
          const label = document.getElementById(`emp-label-${empId}`);
          if (label) label.style.background = '#eef2ff';
        }
      });

      // Reset selector so the same team can be applied again if needed
      teamPick.value = '';
    });
  }

  // ── Checkbox label highlight ─────────────────────────────────────────────────
  // Keep label background in sync when user manually toggles checkboxes.
  document.querySelectorAll('.emp-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const label = document.getElementById(`emp-label-${cb.getAttribute('data-emp-id')}`);
      if (label) label.style.background = cb.checked ? '#eef2ff' : '#fff';
    });
  });

  // ── Progress range live display ───────────────────────────────────────────────
  // The range input #progress-range drives the label #progress-value on the
  // task show page (Employee progress update form). No inline handlers needed.
  const progressRange = document.getElementById('progress-range');
  const progressValue = document.getElementById('progress-value');
  if (progressRange && progressValue) {
    progressRange.addEventListener('input', () => {
      progressValue.textContent = progressRange.value + '%';
    });
  }

});
