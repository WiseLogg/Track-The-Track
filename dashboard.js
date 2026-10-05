(() => {
  const auth = window.TrackAuth;
  const content = document.querySelector('#account-content');
  const status = document.querySelector('#account-status');
  const signOut = document.querySelector('#sign-out');
  const retry = document.querySelector('#retry-results');
  let user;
  let loading = false;
  let redirecting = false;

  function signedOut() {
    if (redirecting) return;
    redirecting = true;
    user = null;
    content.hidden = true;
    document.querySelector('#race-results').replaceChildren();
    window.location.replace('login.html');
  }

  async function loadResults() {
    if (!user || loading) return;
    loading = true;
    const resultStatus = document.querySelector('#results-status');
    const resultWrap = document.querySelector('#results-wrap');
    const rows = document.querySelector('#race-results');
    resultStatus.hidden = false;
    resultStatus.textContent = 'Loading your results…';
    resultWrap.hidden = true;
    retry.hidden = true;
    try {
      // RLS enforces ownership in the database; the filter also scopes the request.
      const { data, error } = await auth.client.from('race_results')
        .select('event,race_date,time_seconds,meet_name')
        .eq('user_id', user.id)
        .order('race_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      if (!user) return;
      rows.replaceChildren();
      if (!data.length) {
        resultStatus.textContent = 'No race results yet. Your account is ready for your season.';
        return;
      }
      data.forEach((race) => {
        const row = document.createElement('tr');
        [race.event || '—', race.race_date || '—', race.time_seconds == null ? '—' : `${race.time_seconds}s`, race.meet_name || '—'].forEach((value) => {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        });
        rows.append(row);
      });
      resultStatus.hidden = true;
      resultWrap.hidden = false;
    } catch (error) {
      if (!user) return;
      resultStatus.textContent = `Your results couldn’t load. ${auth.errorMessage(error)}`;
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }

  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    signOut.textContent = 'Signing out…';
    try {
      const { error } = await auth.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      signedOut();
    } catch (error) {
      status.hidden = false;
      status.textContent = auth.errorMessage(error);
      signOut.disabled = false;
      signOut.textContent = 'Sign out';
    }
  });
  retry.addEventListener('click', loadResults);

  async function initialize() {
    if (!auth?.client) {
      status.textContent = auth?.unavailableMessage || 'Your account couldn’t load. Refresh the page and try again.';
      return;
    }
    auth.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') signedOut();
    });
    try {
      // Validate the session with Supabase before displaying account information.
      const { data, error } = await auth.client.auth.getUser();
      if (error) {
        if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) return signedOut();
        throw error;
      }
      if (!data.user) return signedOut();
      user = data.user;
      document.querySelector('#account-email').textContent = user.email || '';
      const name = user.user_metadata?.display_name;
      document.querySelector('#welcome').textContent = name ? `Welcome back, ${name}.` : 'Welcome back.';
      status.hidden = true;
      content.hidden = false;
      signOut.disabled = false;
      await loadResults();
    } catch (error) {
      status.textContent = auth.errorMessage(error);
    }
  }
  initialize();
})();
