const signupForm = document.querySelector("#signup-form");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const notice = document.querySelector("#signup-notice");
const signupInputs = [nameInput, emailInput, passwordInput, confirmPasswordInput];

function setFieldError(input, message) {
  const error = document.querySelector(`#${input.id}-error`);
  error.textContent = message;
  error.hidden = !message;
  if (message) input.setAttribute("aria-invalid", "true");
  else input.removeAttribute("aria-invalid");
}

signupInputs.forEach((input) => {
  input.addEventListener("input", () => {
    setFieldError(input, "");
    if (input === passwordInput) setFieldError(confirmPasswordInput, "");
    notice.hidden = true;
    notice.textContent = "";
  });
});

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  const input = document.getElementById(button.getAttribute("aria-controls"));
  const label = input === passwordInput ? "password" : "confirmation password";
  button.addEventListener("click", () => {
    const willShow = input.type === "password";
    input.type = willShow ? "text" : "password";
    button.setAttribute("aria-label", `${willShow ? "Hide" : "Show"} ${label}`);
    button.setAttribute("aria-pressed", String(willShow));
  });
});

[passwordInput, confirmPasswordInput].forEach((input) => {
  const capsLockNote = document.querySelector(`#${input.id}-caps-lock`);
  function updateCapsLock(event) {
    capsLockNote.hidden = !event.getModifierState?.("CapsLock");
  }
  input.addEventListener("keydown", updateCapsLock);
  input.addEventListener("keyup", updateCapsLock);
  input.addEventListener("blur", () => {
    capsLockNote.hidden = true;
  });
});

signupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  notice.hidden = true;
  notice.textContent = "";
  nameInput.value = nameInput.value.trim();
  emailInput.value = emailInput.value.trim();

  const errors = [
    !nameInput.value ? "Enter your name." : "",
    !emailInput.value
      ? "Enter your email address."
      : !emailInput.validity.valid
        ? "Enter a valid email address."
        : "",
    !passwordInput.value
      ? "Create a password."
      : passwordInput.value.length < passwordInput.minLength
        ? `Use at least ${passwordInput.minLength} characters.`
        : "",
    !confirmPasswordInput.value
      ? "Confirm your password."
      : confirmPasswordInput.value !== passwordInput.value
        ? "Your passwords don’t match."
        : "",
  ];

  signupInputs.forEach((input, index) => setFieldError(input, errors[index]));
  const firstError = errors.findIndex(Boolean);
  if (firstError !== -1) {
    signupInputs[firstError].focus();
    return;
  }

  // Account creation needs an authentication service. Never store credentials locally.
  notice.hidden = false;
  notice.textContent = "Account creation isn’t available yet. Please try again once accounts are enabled.";
});

document.querySelector("#signup-submit").disabled = false;
