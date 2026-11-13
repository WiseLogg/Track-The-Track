(() => {
  const $ = (selector) => document.querySelector(selector);
  const auth = window.TrackAuth;
  const dialog = $('#delete-account-dialog');
  let user, busy = false, redirecting = false;
  function feedback(message) {
    $('#settings-feedback').textContent = message;
    $('#settings-feedback').hidden = !message;
  }
  function setBusy(active) {
    busy = active;
    document.querySelectorAll('button, input').forEach((control) => { control.disabled = active; });
    $('#account-content').setAttribute('aria-busy', String(active));
  }
  function signedOut() {
    if (redirecting) return;
    redirecting = true;
    user = null;
    $('#account-content').hidden = true;
    dialog.close();
    window.location.replace('login.html');
  }
  $('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !user) return;
    const name = $('#display-name').value.trim();
    if (!name) { $('#display-name').setCustomValidity('Enter your display name.'); $('#display-name').reportValidity(); return; }
    setBusy(true);
    try {
      const { error } = await auth.client.auth.updateUser({ data: { display_name: name } });
      if (error) throw error;
      if (!redirecting) {
        user.user_metadata = { ...user.user_metadata, display_name: name };
        $('#display-name').value = name;
        $('#profile-name').textContent = name;
        $('#profile-initials').textContent = name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase();
        feedback('Your display name has been updated.');
      }
    } catch (error) { if (!redirecting) feedback(auth.errorMessage(error)); }
    finally { if (!redirecting) setBusy(false); }
  });
  $('#display-name').addEventListener('input', () => $('#display-name').setCustomValidity(''));
  $('#request-password-reset').addEventListener('click', async () => {
    if (busy || !user) return;
    setBusy(true);
    try {
      const { error } = await auth.client.auth.resetPasswordForEmail(user.email, { redirectTo: auth.pageUrl('login.html') });
      if (error) throw error;
      feedback('Password reset email requested. Check your inbox and spam folder.');
    } catch (error) { if (!redirecting) feedback(auth.errorMessage(error)); }
    finally { if (!redirecting) setBusy(false); }
  });

  async function ownRows(table, fields, order = 'id') {
    const actor = user.id;
    const all = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await auth.client.from(table).select(fields).eq('user_id', actor).order(order).range(offset, offset + 999);
      if (error) throw error;
      if (redirecting || user?.id !== actor) throw new Error('Your account changed. Please sign in again.');
      all.push(...data);
      if (data.length < 1000) return all;
    }
  }
  $('#export-account').addEventListener('click', async () => {
    if (busy || !user) return;
    setBusy(true);
    feedback('Preparing your download…');
    try {
      const tables = [
        ['race_results', 'id,event,race_date,time_seconds,meet_name,notes'],
        ['workouts', 'id,title,description,category,difficulty,duration_minutes,steps,created_at,author_name'],
        ['workout_comments', 'id,workout_id,body,created_at,author_name'],
        ['workout_likes', 'workout_id', 'workout_id'], ['workout_favorites', 'workout_id', 'workout_id'],
      ];
      const rows = await Promise.all(tables.map(([table, fields, order]) => ownRows(table, fields, order)));
      if (redirecting) return;
      const data = { exported_at: new Date().toISOString(), profile: { email: user.email, display_name: user.user_metadata?.display_name || '' }, ...Object.fromEntries(tables.map(([table], index) => [table, rows[index]])) };
      window.TrackExport.download(JSON.stringify(data, null, 2), 'track-the-track-account.json', 'application/json');
      feedback('Your account data has been downloaded. Keep this file somewhere private.');
    } catch (error) { if (!redirecting) feedback(`Your data couldn’t be exported. ${auth.errorMessage(error)}`); }
    finally { if (!redirecting) setBusy(false); }
  });

  $('#open-delete-account').addEventListener('click', () => {
    $('#delete-account-form').reset();
    $('#delete-account-error').hidden = true;
    dialog.showModal();
  });
  ['#close-delete-account', '#cancel-delete-account'].forEach((selector) => $(selector).addEventListener('click', () => { if (!busy) dialog.close(); }));
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => $('#delete-account-form').reset());
  $('#delete-account-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !user || $('#delete-confirmation').value !== 'DELETE') return;
    const password = $('#delete-password').value;
    setBusy(true);
    $('#delete-account-error').hidden = true;
    try {
      const { data, error } = await auth.client.functions.invoke('delete-account', { body: { password } });
      if (error || !data?.deleted) throw new Error('Your account couldn’t be deleted. Check your password and connection, then try again.');
      // Clear this device even if the now-deleted server session cannot sign out.
      try { localStorage.removeItem('track-the-track.auth'); localStorage.removeItem('track-the-track.remembered-email'); sessionStorage.removeItem('track-the-track.password-recovery'); } catch { /* Optional browser storage. */ }
      try { await auth.client.auth.signOut({ scope: 'local' }); } catch { /* The server account is already deleted. */ }
      signedOut();
    } catch (error) {
      if (!redirecting) { $('#delete-account-error').textContent = error.message; $('#delete-account-error').hidden = false; }
    } finally {
      $('#delete-password').value = '';
      if (!redirecting) setBusy(false);
    }
  });

  $('#sign-out').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try { const { error } = await auth.client.auth.signOut({ scope: 'local' }); if (error) throw error; signedOut(); }
    catch (error) { if (!redirecting) { feedback(auth.errorMessage(error)); setBusy(false); } }
  });
  async function initialize() {
    if (!auth?.client) { $('#account-status').textContent = auth?.unavailableMessage || 'Sign-in couldn’t load.'; return; }
    auth.client.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || (user && session?.user && session.user.id !== user.id)) signedOut(); });
    try {
      const { data, error } = await auth.client.auth.getUser();
      if (error) {
        if (error.name === 'AuthSessionMissingError' || [401, 403].includes(error.status)) return signedOut();
        throw error;
      }
      if (!data.user) return signedOut();
      if (redirecting) return;
      user = data.user;
      const name = typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : 'Athlete';
      $('#display-name').value = name; $('#profile-name').textContent = name;
      $('#account-email').textContent = user.email;
      $('#account-status').hidden = true; $('#account-content').hidden = false;
      setBusy(false);
    } catch (error) { if (!redirecting) $('#account-status').textContent = auth.errorMessage(error); }
  }
  initialize();
})();
