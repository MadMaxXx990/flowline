/* app.js — shared client-side behaviour for all EJS pages.
 * No inline scripts or event handlers anywhere in views.
 * All behaviour is driven by data- attributes on elements.
 *
 * Confirm modal protocol (Part B):
 *   Any <form> may carry:
 *     data-confirm-title="…"      — modal heading
 *     data-confirm-message="…"    — body paragraph
 *     data-confirm-ok="…"         — confirm button label (default "Confirm")
 *     data-confirm-variant="…"    — "danger" | "primary" (default "danger")
 *   On submit: if the form has HTML5 validation, it is checked first.
 *   If valid (or no validation), the modal opens and only submits when
 *   the confirm button is pressed. Double-submit is prevented.
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
  document.querySelectorAll('[data-go-back]').forEach(btn => {
    btn.addEventListener('click', () => history.back());
  });

  // ── Confirm modal ────────────────────────────────────────────────────────────
  // Wire every form that has data-confirm-title to the shared #confirmModal.
  const confirmModalEl = document.getElementById('confirmModal');
  if (confirmModalEl && typeof bootstrap !== 'undefined') {
    const bsModal      = new bootstrap.Modal(confirmModalEl);
    const titleEl      = document.getElementById('confirmModalTitle');
    const descEl       = document.getElementById('confirmModalDesc');
    const okBtn        = document.getElementById('confirmOkBtn');
    const cancelBtn    = document.getElementById('confirmCancelBtn');

    let pendingForm    = null;   // the form waiting for confirmation
    let pendingSubmit  = false;  // prevent double-submit

    // Return focus to the element that triggered the dialog
    let triggerEl = null;
    confirmModalEl.addEventListener('hidden.bs.modal', () => {
      pendingForm   = null;
      pendingSubmit = false;
      // Re-enable the ok button in case it was disabled
      okBtn.disabled = false;
      if (triggerEl) { triggerEl.focus(); triggerEl = null; }
    });

    // Move focus to the confirm button when the modal opens
    confirmModalEl.addEventListener('shown.bs.modal', () => {
      okBtn.focus();
    });

    // The confirm button submits the stored form
    okBtn.addEventListener('click', () => {
      if (!pendingForm || pendingSubmit) return;
      pendingSubmit = true;
      okBtn.disabled = true;
      bsModal.hide();
      pendingForm.submit();
    });

    document.querySelectorAll('form[data-confirm-title]').forEach(form => {
      form.addEventListener('submit', e => {
        e.preventDefault();

        // For forms with HTML5 required fields, validate first.
        // If invalid, let the browser show its native validation UI and bail.
        if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
          form.reportValidity();
          return;
        }

        // Populate modal text using textContent (never innerHTML) to escape
        // any user data embedded via data attributes.
        const title   = form.getAttribute('data-confirm-title')   || 'Are you sure?';
        const message = form.getAttribute('data-confirm-message') || '';
        const okLabel = form.getAttribute('data-confirm-ok')      || 'Confirm';
        const variant = form.getAttribute('data-confirm-variant') || 'danger';

        titleEl.textContent = title;
        descEl.textContent  = message;
        okBtn.textContent   = okLabel;

        // Swap button colour class
        okBtn.className = okBtn.className.replace(/\bbtn-(danger|primary|warning|success)\b/, '');
        okBtn.classList.add(`btn-${variant}`);

        pendingForm   = form;
        pendingSubmit = false;
        okBtn.disabled = false;
        triggerEl = document.activeElement;

        bsModal.show();
      });
    });
  }

  // ── Bootstrap edit modals — dept, position ───────────────────────────────────
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
      empTeamSel.querySelectorAll('option[data-dept]').forEach(opt => {
        const match = !deptId || String(opt.getAttribute('data-dept')) === String(deptId);
        opt.hidden = !match;
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

  // ── Sidebar profile link: hover style (progressive enhancement) ──────────────
  const profLink = document.querySelector('[data-sidebar-profile-link]');
  if (profLink) {
    profLink.addEventListener('mouseenter', () => {
      if (!profLink.style.background.includes('rgba(255,255,255,.12)')) {
        profLink.style.background = 'rgba(255,255,255,.07)';
      }
    });
    profLink.addEventListener('mouseleave', () => {
      // Restore active or transparent
      const isActive = profLink.style.borderLeft.includes('4f46e5');
      profLink.style.background = isActive ? 'rgba(255,255,255,.12)' : 'transparent';
    });
  }

  // ── Task create: build dynamic confirm message from form fields ─────────────
  // The create-task form carries data-confirm-title; we populate
  // data-confirm-message just before it submits by reading the live fields.
  const taskForm = document.getElementById('task-form');
  if (taskForm && taskForm.getAttribute('data-confirm-title')) {
    taskForm.addEventListener('submit', () => {
      // This fires BEFORE the modal-confirm handler (both on the same event),
      // so we update the message attribute here for the modal to pick up.
      // The modal handler also listens for submit and will stop propagation,
      // but data attrs are already updated.
      const title     = taskForm.querySelector('[name="task_title"]')?.value?.trim() || '(untitled)';
      const due       = taskForm.querySelector('[name="due_date"]')?.value    || '';
      const checked   = taskForm.querySelectorAll('[name="employee_ids"]:checked');
      const n         = checked.length;
      const dueText   = due ? `Due ${due}.` : '';
      const empText   = n === 0 ? 'No employees assigned.' :
                        n === 1 ? '1 employee will be notified.' :
                        `${n} employees will be notified.`;
      // Build message safely using textContent assignment in the modal handler.
      // Pass it as a data attribute string — the modal reads it via textContent.
      taskForm.setAttribute('data-confirm-message',
        `Task: "${title}". ${dueText} ${empText}`);
    }, true);  // capture phase so we run before the modal listener
  }

});
