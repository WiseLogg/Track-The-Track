(() => {
  const auth = window.TrackAuth;
  const button = document.querySelector('#resend-confirmation');
  const email = document.querySelector('#email');
  const notice = document.querySelector('#login-notice, #signup-notice');
  let sending = false;
  let availableAt = 0;
  function update() {
    const seconds = Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
    button.disabled = !auth?.client || sending || seconds > 0;
    button.textContent = sending ? 'Sending…' : seconds ? `Resend in ${seconds}s` : 'Resend confirmation';
  }
  button.addEventListener('click', async () => {
    if (sending || Date.now() < availableAt || document.querySelector('form[aria-busy="true"]')) return;
    email.value = email.value.trim();
    if (!email.reportValidity()) return;
    sending = true;
    update();
    notice.hidden = true;
    try {
      const { error } = await auth.client.auth.resend({ type: 'signup', email: email.value, options: { emailRedirectTo: auth.pageUrl('login.html') } });
      if (error) throw error;
      availableAt = Date.now() + 60000;
      notice.textContent = 'If this address is waiting for confirmation, a new link is on its way. Check your inbox and spam folder.';
    } catch (error) {
      if (error.status === 429) availableAt = Date.now() + 60000;
      notice.textContent = auth.errorMessage(error);
    } finally {
      sending = false;
      notice.hidden = false;
      update();
    }
  });
  update();
  setInterval(update, 1000);
})();
