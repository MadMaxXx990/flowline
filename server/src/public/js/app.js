/* app.js — shared client-side behaviour for all EJS pages.
 * No inline scripts or event handlers anywhere in views.
 * All behaviour is driven by data- attributes on elements.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Topbar date ─────────────────────────────────────────────────────────────
  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  // ── data-go-back: CSP-safe history.back() for error pages ───────────────────
  // Usage: <button data-go-back>Go back</button>
  document.querySelectorAll('[data-go-back]').forEach(btn => {
    btn.addEventListener('click', () => history.back());
  });

  // ── data-confirm: intercept any form with data-confirm before submitting ────
  // Usage: <form data-confirm="Are you sure?"> ... </form>
  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', e => {
      const msg = form.getAttribute('data-confirm');
      if (!confirm(msg)) {
        e.preventDefault();
      }
    });
  });

  // ── Bootstrap edit modals — dept, position ───────────────────────────────────
  // Dept edit modal
  const editDeptModal = document.getElementById('editDeptModal');
  if (editDeptModal) {
    editDeptModal.addEventListener('show.bs.modal', event => {
      const btn  = event.relatedTarget;
      const id   = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      const desc = btn.getAttribute('data-desc');
      const form = document.getElementById('editDeptForm');
      form.action = `/admin/departments/${id}?_method=PUT`;
      document.getElementById('editDeptName').value = name || '';
      document.getElementById('editDeptDesc').value = desc || '';
    });
  }

  // Position edit modal
  const editPosModal = document.getElementById('editPosModal');
  if (editPosModal) {
    editPosModal.addEventListener('show.bs.modal', event => {
      const btn  = event.relatedTarget;
      const id   = btn.getAttribute('data-id');
      const name = btn.getAttribute('data-name');
      const desc = btn.getAttribute('data-desc');
      const form = document.getElementById('editPosForm');
      form.action = `/admin/positions/${id}?_method=PUT`;
      document.getElementById('editPosName').value = name || '';
      document.getElementById('editPosDesc').value = desc || '';
    });
  }

  // ── Team edit modal ──────────────────────────────────────────────────────────
  const editTeamModal = document.getElementById('editTeamModal');
  if (editTeamModal) {
    editTeamModal.addEventListener('show.bs.modal', event => {
      const btn    = event.relatedTarget;
      const id     = btn.getAttribute('data-id');
      const name   = btn.getAttribute('data-name');
      const deptId = btn.getAttribute('data-dept');
      const leadId = btn.getAttribute('data-lead') || '';

      const form = document.getElementById('editTeamForm');
      form.action = `/admin/teams/${id}?_method=PUT`;
      document.getElementById('editTeamName').value = name || '';

      const deptSel = document.getElementById('editTeamDept');
      const leadSel = document.getElementById('editTeamLead');

      if (deptSel) {
        deptSel.value = deptId;
        populateLeadSelect(deptSel, leadSel, leadId);
      }
    });
  }

  // ── Team-lead dropdown population ───────────────────────────────────────────
  function populateLeadSelect(deptSelect, leadSelect, currentLeadId) {
    if (!leadSelect) return;
    let employees = [];
    try { employees = JSON.parse(deptSelect.getAttribute('data-employees-json') || '[]'); } catch {}
    const deptId = deptSelect.value;
    const filtered = deptId
      ? employees.filter(e => String(e.dept) === String(deptId))
      : [];

    leadSelect.innerHTML = '<option value="">None</option>';
    filtered.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      if (String(e.id) === String(currentLeadId)) opt.selected = true;
      leadSelect.appendChild(opt);
    });
    leadSelect.disabled = filtered.length === 0;
  }

  document.querySelectorAll('[data-team-dept-select]').forEach(deptSel => {
    const targetId = deptSel.getAttribute('data-target-lead');
    const leadSel  = targetId
      ? document.getElementById(targetId)
      : deptSel.closest('form')?.querySelector('[data-team-lead-select]');

    if (deptSel.value && leadSel) {
      populateLeadSelect(deptSel, leadSel, leadSel.value);
    }

    deptSel.addEventListener('change', () => {
      if (leadSel) populateLeadSelect(deptSel, leadSel, '');
    });
  });

  // ── Employee form: team dropdown filtered by department ──────────────────────
  const empDeptSel = document.getElementById('empDeptSelect');
  const empTeamSel = document.getElementById('empTeamSelect');
  if (empDeptSel && empTeamSel) {
    function filterTeamOptions() {
      const deptId = empDeptSel.value;
      let hasVisible = false;
      empTeamSel.querySelectorAll('option[data-dept]').forEach(opt => {
        const match = !deptId || String(opt.getAttribute('data-dept')) === String(deptId);
        opt.hidden = !match;
        if (match) hasVisible = true;
      });
      const selected = empTeamSel.querySelector('option:checked');
      if (selected && selected.hidden) empTeamSel.value = '';
      empTeamSel.disabled = !deptId;
    }
    empDeptSel.addEventListener('change', filterTeamOptions);
    filterTeamOptions();
  }

  // ── Attendance edit modal ─────────────────────────────────────────────────────
  const editAttModal = document.getElementById('editAttModal');
  if (editAttModal) {
    editAttModal.addEventListener('show.bs.modal', event => {
      const btn     = event.relatedTarget;
      const id      = btn.getAttribute('data-id');
      const timeIn  = btn.getAttribute('data-time-in')  || '';
      const timeOut = btn.getAttribute('data-time-out') || '';
      const status  = btn.getAttribute('data-status')   || '';
      const prefix  = window.location.pathname.replace(/\/attendance.*$/, '');
      document.getElementById('editAttForm').action  = `${prefix}/attendance/${id}?_method=PUT`;
      document.getElementById('editTimeIn').value    = timeIn;
      document.getElementById('editTimeOut').value   = timeOut;
      document.getElementById('editAttStatus').value = status;
    });
  }

});
