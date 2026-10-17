/**
 * profile.js — loaded only on the My Profile page.
 *
 * Wires [data-pw-toggle="<inputId>"] buttons to toggle the type
 * of the matching password input between "password" and "text".
 * No inline JS — CSP: script-src 'self'.
 */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-pw-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const inputId = btn.getAttribute('data-pw-toggle');
      const input   = document.getElementById(inputId);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
      }
      btn.setAttribute('aria-label',
        isHidden ? 'Hide password' : 'Show password');
    });
  });
});
