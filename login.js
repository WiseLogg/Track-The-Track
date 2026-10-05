const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const confirmPasswordInput = document.querySelector('#confirm-password');
const passwordToggle = document.querySelector('#password-toggle');
const rememberEmail = document.querySelector('#remember-email');
const notice = document.querySelector('#login-notice');
const capsLockNote = document.querySelector('#caps-lock-note');
const submit = document.querySelector('#login-submit');
const submitLabel = document.querySelector('#submit-label');
const rememberedEmailKey = 'track-the-track.remembered-email';
const recoveryKey = 'track-the-track.password-recovery';
const auth = window.TrackAuth;
const callbackParams = new URLSearchParams(window.location.hash.slice(1));
let mode = 'login';
let busy = false;
let recoverySession = false;

function setFieldError(input, message) {
  const error = document.querySelector(`#${input.id}-error`);
  error.textContent = message;
  error.hidden = !message;
  if (message) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function showNotice(message) {
  notice.hidden = !message;
  notice.textContent = message;
}

function updateRememberedEmail() {
  try {
    if (rememberEmail.checked) localStorage.setItem(rememberedEmailKey, emailInput.value.trim());
    else localStorage.removeItem(rememberedEmailKey);
  } catch { /* Remembering an email is optional. */ }
}

try {
  const savedEmail = localStorage.getItem(rememberedEmailKey);
  if (savedEmail) {
    emailInput.value = savedEmail;
    rememberEmail.checked = true;
  }
  recoverySession = sessionStorage.getItem(recoveryKey) === 'true';
} catch { /* Login remains usable when browser storage is unavailable. */ }

rememberEmail.addEventListener('change', () => {
  if (!rememberEmail.checked) updateRememberedEmail();
});

passwordToggle.addEventListener('click', () => {
  const willShow = passwordInput.type === 'password';
  passwordInput.type = willShow ? 'text' : 'password';
  passwordToggle.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
  passwordToggle.setAttribute('aria-pressed', String(willShow));
});

function updateCapsLock(event) {
  capsLockNote.hidden = !event.getModifierState?.('CapsLock');
}
passwordInput.addEventListener('keydown', updateCapsLock);
passwordInput.addEventListener('keyup', updateCapsLock);
passwordInput.addEventListener('blur', () => { capsLockNote.hidden = true; });

[emailInput, passwordInput, confirmPasswordInput].forEach((input) => {
  input.addEventListener('input', () => {
    setFieldError(input, '');
    if (input === passwordInput) setFieldError(confirmPasswordInput, '');
    showNotice('');
  });
});

function setMode(nextMode) {
  mode = nextMode;
  const reset = mode === 'reset';
  const update = mode === 'update';
  document.querySelector('#login-heading').textContent = update ? 'Set a new password.' : reset ? 'Forgot your password?' : 'Welcome back.';
  document.querySelector('#login-intro').textContent = update
    ? 'Choose a new password to get back to your season.'
    : reset ? 'Enter your email and we’ll send a password reset link.' : 'Ready for your next mark? Log in to your account.';
  document.querySelector('#email-field').hidden = update;
  emailInput.disabled = update;
  emailInput.required = !update;
  emailInput.autocomplete = reset ? 'email' : 'username';
  document.querySelector('#password-field').hidden = reset;
  passwordInput.disabled = reset;
  passwordInput.required = !reset;
  passwordInput.minLength = update ? 8 : 0;
  passwordInput.autocomplete = update ? 'new-password' : 'current-password';
  passwordInput.placeholder = update ? 'Use at least 8 characters' : 'Enter your password';
  document.querySelector('#confirm-password-field').hidden = !update;
  confirmPasswordInput.disabled = !update;
  confirmPasswordInput.required = update;
  document.querySelector('#forgot-password').hidden = update;
  document.querySelector('#remember-field').hidden = mode !== 'login';
  document.querySelector('#login-new').hidden = mode !== 'login';
  document.querySelector('#back-to-login').hidden = mode === 'login';
  submitLabel.textContent = update ? 'Save password' : reset ? 'Send reset link' : 'Log in';
  document.title = `${update ? 'New password' : reset ? 'Reset password' : 'Log in'} | Track The Track`;
  passwordInput.value = '';
  confirmPasswordInput.value = '';
  passwordInput.type = 'password';
  passwordToggle.setAttribute('aria-label', 'Show password');
  passwordToggle.setAttribute('aria-pressed', 'false');
  capsLockNote.hidden = true;
  [emailInput, passwordInput, confirmPasswordInput].forEach((input) => setFieldError(input, ''));
  showNotice('');
}

function markRecovery(active) {
  recoverySession = active;
  try {
    if (active) sessionStorage.setItem(recoveryKey, 'true');
    else sessionStorage.removeItem(recoveryKey);
  } catch { /* The in-memory state still handles the recovery link. */ }
}

function setBusy(active) {
  busy = active;
  submit.disabled = active || !auth?.client;
  loginForm.setAttribute('aria-busy', String(active));
  document.querySelector('#forgot-password').disabled = active;
  document.querySelector('#back-to-login').disabled = active;
  submitLabel.textContent = active ? 'Please wait…' : mode === 'update' ? 'Save password' : mode === 'reset' ? 'Send reset link' : 'Log in';
}

document.querySelector('#forgot-password').addEventListener('click', () => {
  if (busy) return;
  setMode('reset');
  document.querySelector('#login-heading').focus();
});
document.querySelector('#back-to-login').addEventListener('click', async () => {
  if (busy) return;
  if (mode === 'update') {
    setBusy(true);
    try {
      const { error } = await auth.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      markRecovery(false);
    } catch (error) {
      showNotice(auth.errorMessage(error));
      setBusy(false);
      return;
    }
  }
  setMode('login');
  setBusy(false);
  document.querySelector('#login-heading').focus();
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !auth?.client) return;
  showNotice('');
  emailInput.value = emailInput.value.trim();
  const emailError = mode === 'update' ? '' : !emailInput.value ? 'Enter your email address.' : !emailInput.validity.valid ? 'Enter a valid email address.' : '';
  const passwordError = mode === 'reset' ? '' : !passwordInput.value ? 'Enter your password.' : mode === 'update' && passwordInput.value.length < 8 ? 'Use at least 8 characters.' : '';
  const confirmError = mode === 'update' && confirmPasswordInput.value !== passwordInput.value ? 'Your passwords don’t match.' : '';
  setFieldError(emailInput, emailError);
  setFieldError(passwordInput, passwordError);
  setFieldError(confirmPasswordInput, confirmError);
  if (emailError || passwordError || confirmError) {
    (emailError ? emailInput : passwordError ? passwordInput : confirmPasswordInput).focus();
    return;
  }

  setBusy(true);
  try {
    if (mode === 'reset') {
      const { error } = await auth.client.auth.resetPasswordForEmail(emailInput.value, {
        redirectTo: auth.pageUrl('login.html'),
      });
      if (error) throw error;
      showNotice('If an account exists for this email, a reset link is on its way. Check your inbox and spam folder.');
    } else if (mode === 'update') {
      if (!recoverySession) throw new Error('Open the password reset link from your email first.');
      const { error } = await auth.client.auth.updateUser({ password: passwordInput.value });
      if (error) throw error;
      const { error: signOutError } = await auth.client.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      markRecovery(false);
      setMode('login');
      showNotice('Your password has been updated. Log in with your new password.');
      emailInput.focus();
    } else {
      const { error } = await auth.client.auth.signInWithPassword({ email: emailInput.value, password: passwordInput.value });
      if (error) throw error;
      updateRememberedEmail();
      markRecovery(false);
      window.location.replace('dashboard.html');
    }
  } catch (error) {
    showNotice(auth.errorMessage(error));
  } finally {
    setBusy(false);
  }
});

async function initializeLogin() {
  if (!auth?.client) {
    showNotice(auth?.unavailableMessage || 'Sign-in couldn’t load. Refresh the page and try again.');
    return;
  }
  setBusy(true);
  auth.client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      markRecovery(true);
      setMode('update');
    }
    if (event === 'SIGNED_OUT') markRecovery(false);
  });
  try {
    const { data: { session }, error } = await auth.client.auth.getSession();
    if (error) throw error;
    if (callbackParams.get('error_description')) {
      showNotice(callbackParams.get('error_description'));
      window.history.replaceState(null, '', window.location.pathname);
    } else if (session && (recoverySession || callbackParams.get('type') === 'recovery')) {
      markRecovery(true);
      setMode('update');
    } else if (session) {
      markRecovery(false);
      window.location.replace('dashboard.html');
    } else {
      markRecovery(false);
    }
  } catch (error) {
    showNotice(auth.errorMessage(error));
  } finally {
    setBusy(false);
  }
}
initializeLogin();
