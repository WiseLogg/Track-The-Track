(() => {
  const client = window.TrackAuth?.client;
  if (!client) return;
  const links = [...document.querySelectorAll('a[href="login.html"]')];
  const loginLink = document.querySelector('.site-nav > a[href="login.html"]');
  function updateLinks(session) {
    links.forEach((link) => { link.href = session ? 'dashboard.html' : 'login.html'; });
    if (loginLink) loginLink.textContent = session ? 'My dashboard' : 'Log in';
  }
  client.auth.onAuthStateChange((_event, session) => updateLinks(session));
  client.auth.getSession().then(({ data }) => updateLinks(data.session)).catch(() => {});
})();
