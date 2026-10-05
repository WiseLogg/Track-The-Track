const signupForm = document.querySelector("#signup-form");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const confirmPasswordInput = document.querySelector("#confirm-password");
const notice = document.querySelector("#signup-notice");
const auth = window.TrackAuth;
const submit = document.querySelector('#signup-submit');
let busy = false;
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

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !auth?.client) return;
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

  busy = true;
  submit.disabled = true;
  signupForm.setAttribute("aria-busy", "true");
  document.querySelector("#submit-label").textContent = "Creating account…";
  try {
    const { data, error } = await auth.client.auth.signUp({
      email: emailInput.value,
      password: passwordInput.value,
      options: {
        data: { display_name: nameInput.value },
        emailRedirectTo: auth.pageUrl("login.html"),
      },
    });
    if (error) throw error;
    passwordInput.value = "";
    confirmPasswordInput.value = "";
    if (data.session) {
      window.location.replace("dashboard.html");
    } else {
      notice.hidden = false;
      notice.textContent = "Check your inbox for a confirmation link. Confirm your email, then log in. If you already have an account, log in or reset your password.";
    }
  } catch (error) {
    notice.hidden = false;
    notice.textContent = auth.errorMessage(error);
  } finally {
    busy = false;
    submit.disabled = false;
    signupForm.setAttribute("aria-busy", "false");
    document.querySelector("#submit-label").textContent = "Create account";
  }
});

if (auth?.client) {
  submit.disabled = false;
  auth.client.auth.getSession().then(({ data }) => {
    if (data.session && !busy) window.location.replace("dashboard.html");
  }).catch(() => {});
} else {
  notice.hidden = false;
  notice.textContent = auth?.unavailableMessage || "Sign-up couldn’t load. Refresh the page and try again.";
}
