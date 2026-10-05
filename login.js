const loginForm = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const rememberEmail = document.querySelector("#remember-email");
const notice = document.querySelector("#login-notice");
const capsLockNote = document.querySelector("#caps-lock-note");
const rememberedEmailKey = "track-the-track.remembered-email";
let isPasswordReset = false;

function setFieldError(input, message) {
  const error = document.querySelector(`#${input.id}-error`);
  error.textContent = message;
  error.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

function clearNotice() {
  notice.hidden = true;
  notice.textContent = "";
}

function updateRememberedEmail() {
  try {
    if (rememberEmail.checked) {
      localStorage.setItem(rememberedEmailKey, emailInput.value.trim());
    } else {
      localStorage.removeItem(rememberedEmailKey);
    }
  } catch {
    // Login remains usable when the browser blocks local storage.
  }
}

try {
  const savedEmail = localStorage.getItem(rememberedEmailKey);
  if (savedEmail) {
    emailInput.value = savedEmail;
    rememberEmail.checked = true;
  }
} catch {
  // Remembering an email is optional.
}

rememberEmail.addEventListener("change", () => {
  if (!rememberEmail.checked) updateRememberedEmail();
});

passwordToggle.addEventListener("click", () => {
  const willShow = passwordInput.type === "password";
  passwordInput.type = willShow ? "text" : "password";
  passwordToggle.setAttribute("aria-label", willShow ? "Hide password" : "Show password");
  passwordToggle.setAttribute("aria-pressed", String(willShow));
});

function updateCapsLock(event) {
  capsLockNote.hidden = !event.getModifierState?.("CapsLock");
}

passwordInput.addEventListener("keydown", updateCapsLock);
passwordInput.addEventListener("keyup", updateCapsLock);
passwordInput.addEventListener("blur", () => {
  capsLockNote.hidden = true;
});

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener("input", () => {
    setFieldError(input, "");
    clearNotice();
  });
});

function setResetMode(resetMode) {
  isPasswordReset = resetMode;
  document.querySelector("#login-heading").textContent = resetMode ? "Forgot your password?" : "Welcome back.";
  document.querySelector("#login-intro").textContent = resetMode
    ? "Enter your email to get back to your season."
    : "Ready for your next mark? Log in to your account.";
  document.querySelector("#password-field").hidden = resetMode;
  document.querySelector("#remember-field").hidden = resetMode;
  document.querySelector("#login-new").hidden = resetMode;
  document.querySelector("#back-to-login").hidden = !resetMode;
  document.querySelector("#submit-label").textContent = resetMode ? "Send reset link" : "Log in";
  document.title = `${resetMode ? "Reset password" : "Log in"} | Track The Track`;
  emailInput.autocomplete = resetMode ? "email" : "username";
  passwordInput.disabled = resetMode;
  passwordInput.required = !resetMode;
  passwordInput.value = "";
  passwordInput.type = "password";
  passwordToggle.setAttribute("aria-label", "Show password");
  passwordToggle.setAttribute("aria-pressed", "false");
  capsLockNote.hidden = true;
  setFieldError(emailInput, "");
  setFieldError(passwordInput, "");
  clearNotice();
  document.querySelector("#login-heading").focus();
}

document.querySelector("#forgot-password").addEventListener("click", () => setResetMode(true));
document.querySelector("#back-to-login").addEventListener("click", () => setResetMode(false));

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearNotice();
  emailInput.value = emailInput.value.trim();

  const emailError = !emailInput.value
    ? "Enter your email address."
    : !emailInput.validity.valid
      ? "Enter a valid email address."
      : "";
  const passwordError = !isPasswordReset && !passwordInput.value ? "Enter your password." : "";

  setFieldError(emailInput, emailError);
  setFieldError(passwordInput, passwordError);

  if (emailError || passwordError) {
    (emailError ? emailInput : passwordInput).focus();
    return;
  }

  if (!isPasswordReset) updateRememberedEmail();

  // No account service is configured. Do not send credentials or claim success.
  notice.hidden = false;
  notice.textContent = isPasswordReset
    ? "Password reset isn’t available yet. Please try again once accounts are enabled."
    : "Sign-in isn’t available yet. Please try again once accounts are enabled.";
});

document.querySelector("#login-submit").disabled = false;
