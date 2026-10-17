/**
 * employee-form.js
 *
 * Loaded only on the "Add Employee" page (new.ejs appends the <script> tag).
 * Provides:
 *   1. Username auto-suggest from first + last name (300 ms debounce).
 *      Calls GET /admin/employees/username-check?u=<candidate> and shows
 *      an "Available" / "Taken — suggestion: …" status under the field.
 *      Stops auto-filling once the admin edits the username field manually.
 *
 *   2. Password generator on page load.
 *      10 chars, at least one lower, upper, digit. No ambiguous characters.
 *      Buttons: Show/Hide · Copy · Regenerate.
 *
 * No inline scripts — CSP is maintained (script-src 'self').
 * Uses crypto.getRandomValues so the password is cryptographically random.
 */

(function () {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Build a username base from first + last name:
   *   - NFD-decompose to strip combining accents
   *   - lowercase, keep only a-z and 0-9
   *   - join as firstname.lastname
   * Mirrors the server-side buildUsernameBase in employeeController.js.
   */
  function buildBase(first, last) {
    function clean(s) {
      return (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // strip combining accents
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');         // keep letters + digits only
    }
    const f = clean(first);
    const l = clean(last);
    if (!f && !l) return '';
    if (!l) return f;
    if (!f) return l;
    return f + '.' + l;
  }

  /** Simple debounce — calls fn after `ms` ms of silence. */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── Password generator ───────────────────────────────────────────────────────

  // Exclude ambiguous characters: 0 O o 1 l I
  const LOWER  = 'abcdefghjkmnpqrstuvwxyz';   // no i, l, o
  const UPPER  = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // no I, O
  const DIGITS = '23456789';                   // no 0, 1
  const ALL    = LOWER + UPPER + DIGITS;
  const PWD_LEN = 10;

  function generatePassword() {
    // Guarantee the character-class requirements:
    const required = [
      LOWER [cryptoRand(LOWER.length)],
      UPPER [cryptoRand(UPPER.length)],
      DIGITS[cryptoRand(DIGITS.length)],
    ];
    // Fill the rest from the full set
    const rest = [];
    for (let i = required.length; i < PWD_LEN; i++) {
      rest.push(ALL[cryptoRand(ALL.length)]);
    }
    // Shuffle required + rest together
    const chars = required.concat(rest);
    shuffle(chars);
    return chars.join('');
  }

  /** Return a cryptographically random integer in [0, max). */
  function cryptoRand(max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }

  /** Fisher-Yates shuffle in-place. */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = cryptoRand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ── DOM wiring ───────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {

    const firstInput    = document.getElementById('empFirstName');
    const lastInput     = document.getElementById('empLastName');
    const userInput     = document.getElementById('empUsername');
    const statusEl      = document.getElementById('usernameStatus');
    const pwdInput      = document.getElementById('empPassword');
    const toggleBtn     = document.querySelector('[data-pw-toggle]');
    const toggleIcon    = document.getElementById('pwToggleIcon');
    const copyBtn       = document.querySelector('[data-pw-copy]');
    const regenBtn      = document.querySelector('[data-pw-regen]');

    // ── 1. Password: generate on load ─────────────────────────────────────────
    if (pwdInput) {
      pwdInput.value = generatePassword();
    }

    // Show / Hide
    if (toggleBtn && pwdInput) {
      toggleBtn.addEventListener('click', function () {
        const isHidden = pwdInput.type === 'password';
        pwdInput.type  = isHidden ? 'text' : 'password';
        if (toggleIcon) {
          toggleIcon.className = isHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
        }
      });
    }

    // Copy
    if (copyBtn && pwdInput) {
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(pwdInput.value).then(function () {
          copyBtn.title = 'Copied!';
          setTimeout(function () { copyBtn.title = 'Copy password'; }, 1500);
        }).catch(function () {
          // Clipboard API not available (non-HTTPS in dev) — silently ignore
        });
      });
    }

    // Regenerate
    if (regenBtn && pwdInput) {
      regenBtn.addEventListener('click', function () {
        pwdInput.value = generatePassword();
        // If the field is in "show" mode keep it visible, otherwise leave type alone
      });
    }

    // ── 2. Username auto-suggest ───────────────────────────────────────────────
    if (!userInput || !userInput.hasAttribute('data-username-suggest')) return;

    // Track whether the admin has manually edited the username field.
    // We detect a manual edit as any keydown event that isn't part of the
    // auto-fill mechanism; we reset this flag whenever the name fields change
    // so that rotyping a name re-enables auto-fill.
    let manuallyEdited = false;

    // If the field already has a value on page load (re-render after error),
    // treat it as manually edited so we don't stomp it.
    if (userInput.value) {
      manuallyEdited = true;
    }

    userInput.addEventListener('input', function () {
      manuallyEdited = true;
      // Still run the check so the admin sees availability for what they typed
      debouncedCheck(userInput.value.trim().toLowerCase());
    });

    // When name fields change, clear the manual-edit flag and trigger suggestion
    function onNameInput() {
      manuallyEdited = false;
      debouncedSuggest();
    }

    if (firstInput) firstInput.addEventListener('input', onNameInput);
    if (lastInput)  lastInput.addEventListener('input',  onNameInput);

    function currentBase() {
      const f = firstInput  ? firstInput.value.trim()  : '';
      const l = lastInput   ? lastInput.value.trim()   : '';
      return buildBase(f, l);
    }

    // Runs after debounce: compute the base, auto-fill if not manually edited,
    // then call the server availability check.
    function suggest() {
      const base = currentBase();
      if (!base) {
        setStatus('');
        return;
      }
      if (!manuallyEdited) {
        userInput.value = base;
      }
      // Check whatever is now in the field
      checkAvailability(userInput.value.trim().toLowerCase());
    }

    // Runs after manual edit debounce: just check availability
    function checkForManualEdit(val) {
      if (!val) { setStatus(''); return; }
      checkAvailability(val);
    }

    const debouncedSuggest    = debounce(suggest,          300);
    const debouncedCheck      = debounce(checkForManualEdit, 300);

    let lastChecked = '';
    let inFlight    = false;

    function checkAvailability(candidate) {
      if (!candidate || candidate === lastChecked) return;
      lastChecked = candidate;
      inFlight = true;
      setStatus('<span class="text-muted">Checking…</span>');

      fetch('/admin/employees/username-check?u=' + encodeURIComponent(candidate), {
        credentials: 'same-origin',
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
          inFlight = false;
          if (data.available) {
            setStatus('<span class="text-success"><i class="bi bi-check-circle-fill me-1"></i>Available</span>');
          } else {
            let msg = '<span class="text-warning"><i class="bi bi-exclamation-circle-fill me-1"></i>Taken';
            if (data.suggestion) {
              msg += ' — suggested: <strong>' + escHtml(data.suggestion) + '</strong>';
              // Only auto-accept the suggestion if the admin has not edited manually
              if (!manuallyEdited) {
                userInput.value = data.suggestion;
                lastChecked = data.suggestion;
              }
            }
            msg += '</span>';
            setStatus(msg);
          }
        })
        .catch(function () {
          inFlight = false;
          setStatus('<span class="text-muted">Could not check availability.</span>');
        });
    }

    function setStatus(html) {
      if (statusEl) statusEl.innerHTML = html;
    }

    /** Minimal HTML escape for the suggestion string (only printable ASCII from server). */
    function escHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  });

}());
