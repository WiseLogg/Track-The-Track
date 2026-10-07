(() => {
  const auth = window.TrackAuth;
  const $ = (selector) => document.querySelector(selector);
  const content = $('#account-content');
  const status = $('#account-status');
  const signOut = $('#sign-out');
  const retry = $('#retry-results');
  const season = $('#season-filter');
  const chartEvent = $('#chart-event');
  const resultsEvent = $('#results-event');
  const dialog = $('#result-dialog');
  const form = $('#result-form');
  const timeInput = $('#result-time');
  const fields = 'event,race_date,time_seconds,meet_name';
  let user;
  let races = [];
  let loading = false;
  let saving = false;
  let redirecting = false;
  let loaded = false;

  const validTime = (race) => race.time_seconds != null && Number.isFinite(Number(race.time_seconds)) && Number(race.time_seconds) > 0;
  const chronological = (a, b) => (a.race_date || '9999').localeCompare(b.race_date || '9999');
  const dated = (race) => /^\d{4}-\d{2}-\d{2}$/.test(race.race_date || '');
  const dateLabel = (date) => dated({ race_date: date })
    ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No date';

  function formatTime(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return '—';
    if (value < 60) return `${Number(value.toFixed(2))}s`;
    const hundredths = Math.round(value * 100);
    return `${Math.floor(hundredths / 6000)}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function signedOut() {
    if (redirecting) return;
    redirecting = true;
    user = null;
    races = [];
    if (dialog.open) dialog.close();
    content.hidden = true;
    $('#race-results').replaceChildren();
    $('#personal-bests').replaceChildren();
    window.location.replace('login.html');
  }

  function seasonRaces() {
    return races.filter((race) => season.value === 'all' || race.race_date?.slice(0, 4) === season.value);
  }

  function personalRecords() {
    const bests = new Map();
    const records = new Set();
    [...races].sort(chronological).forEach((race) => {
      if (!validTime(race) || !race.event) return;
      const earlier = bests.get(race.event);
      if (!earlier || Number(race.time_seconds) < Number(earlier.time_seconds)) {
        // A first performance establishes a baseline; later improvements are new PRs.
        if (earlier && dated(race) && dated(earlier)) records.add(race);
        bests.set(race.event, race);
      }
    });
    return { bests, records };
  }

  function setOptions(select, items, firstOption) {
    const previous = select.value;
    select.replaceChildren();
    if (firstOption) select.add(new Option(firstOption.label, firstOption.value));
    items.forEach((item) => select.add(new Option(item.label || item, item.value || item)));
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    select.disabled = !items.length;
  }

  function updateSeasons() {
    const years = [...new Set(races.filter(dated).map((race) => race.race_date.slice(0, 4)))].sort().reverse();
    const hasDatedResults = years.length > 0;
    if (!years.length) years.push(String(new Date().getFullYear()));
    setOptions(season, years.map((year) => ({ label: `${year} season`, value: year })), { label: 'All seasons', value: 'all' });
    if (!loaded) season.value = races.length && !hasDatedResults ? 'all' : years[0];
    season.disabled = false;
  }

  function renderBests(bests) {
    const list = $('#personal-bests');
    list.replaceChildren();
    if (!bests.size) {
      list.append(element('p', 'Your first result is your starting point. Log a race to see your bests here.', 'panel-empty'));
      return;
    }
    [...bests].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).forEach(([event, race]) => {
      const row = element('div', null, 'best-row');
      const info = element('div');
      info.append(element('strong', event), element('small', dateLabel(race.race_date)));
      row.append(info, element('span', formatTime(race.time_seconds)));
      list.append(row);
    });
  }

  function svgNode(tag, attributes, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text != null) node.textContent = text;
    return node;
  }

  function renderChart() {
    const results = seasonRaces().filter((race) => race.event === chartEvent.value && validTime(race) && dated(race)).sort(chronological);
    $('#chart-wrap').hidden = !results.length;
    $('#progress-metrics').hidden = !results.length;
    $('#chart-empty').hidden = !!results.length;
    $('#chart-empty').textContent = 'Log a dated race result to start seeing your progress here.';
    if (!results.length) return;
    const times = results.map((race) => Number(race.time_seconds));
    const best = Math.min(...times);
    const first = times[0];
    const gain = ((first - best) / first) * 100;
    $('#chart-best').textContent = formatTime(best);
    $('#chart-improvement').textContent = results.length < 2 ? 'Your starting point' : gain > 0 ? `↗ ${gain.toFixed(1)}% faster than your first race` : 'Building your season';
    const svg = $('#performance-chart');
    const width = Math.max(260, Math.round($('#chart-wrap').clientWidth) || 640);
    svg.setAttribute('viewBox', `0 0 ${width} 250`);
    svg.replaceChildren(svgNode('title', { id: 'chart-title' }, `${chartEvent.value} race times`), svgNode('desc', { id: 'chart-description' }, results.map((race) => `${dateLabel(race.race_date)}: ${formatTime(race.time_seconds)}`).join('; ')));
    const min = Math.min(...times), max = Math.max(...times);
    const padding = Math.max((max - min) * .25, min * .01, .05);
    const low = min - padding, high = max + padding;
    const left = 65, right = width - 25, top = 22, bottom = 202;
    const start = new Date(`${results[0].race_date}T12:00:00`).getTime();
    const end = new Date(`${results.at(-1).race_date}T12:00:00`).getTime();
    const points = results.map((race) => ({
      x: end === start ? (left + right) / 2 : left + (new Date(`${race.race_date}T12:00:00`).getTime() - start) / (end - start) * (right - left),
      y: top + (Number(race.time_seconds) - low) / (high - low) * (bottom - top), race,
    }));
    for (let i = 0; i < 4; i++) {
      const y = top + i / 3 * (bottom - top);
      svg.append(svgNode('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#e6e8df', 'stroke-dasharray': '3 5' }));
      svg.append(svgNode('text', { x: left - 12, y: y + 4, 'text-anchor': 'end' }, formatTime(low + i / 3 * (high - low))));
    }
    const coords = points.map(({ x, y }) => `${x},${y}`).join(' ');
    if (points.length > 1) {
      svg.append(svgNode('polygon', { points: `${points[0].x},${bottom} ${coords} ${points.at(-1).x},${bottom}`, fill: '#e4502f', opacity: '.07' }));
      svg.append(svgNode('polyline', { points: coords, fill: 'none', stroke: '#e4502f', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
    points.forEach(({ x, y, race }) => {
      const dot = svgNode('circle', { cx: x, cy: y, r: 5, fill: '#fffdf8', stroke: '#e4502f', 'stroke-width': 2.5 });
      dot.append(svgNode('title', {}, `${dateLabel(race.race_date)} · ${formatTime(race.time_seconds)}`));
      svg.append(dot);
    });
    [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].forEach((index) => {
      const { x, race } = points[index];
      const label = new Date(`${race.race_date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      svg.append(svgNode('text', { x, y: 232, 'text-anchor': 'middle' }, label));
    });
  }

  function renderResults(records = personalRecords().records) {
    const selected = seasonRaces().filter((race) => resultsEvent.value === 'all' || race.event === resultsEvent.value).sort((a, b) => chronological(b, a));
    $('#race-results').replaceChildren();
    $('#results-wrap').hidden = !selected.length;
    $('#results-status').hidden = !!selected.length;
    $('#results-status').textContent = races.length ? 'No results for this season and event. Try another filter or log a result.' : 'Your season starts here. Log your first race result to see your progress.';
    $('#results-count').textContent = selected.length;
    $('#results-summary').textContent = `${selected.length} ${selected.length === 1 ? 'result' : 'results'} · Saved to your account`;
    selected.forEach((race) => {
      const row = element('tr');
      [race.event || '—', race.meet_name || '—', dateLabel(race.race_date), validTime(race) ? formatTime(race.time_seconds) : '—'].forEach((value) => row.append(element('td', value)));
      const milestone = element('td');
      milestone.append(records.has(race) ? element('span', '↗ New PR', 'pr-tag') : element('span', '—'));
      row.append(milestone);
      $('#race-results').append(row);
    });
  }

  function render() {
    const selected = seasonRaces();
    const { bests, records } = personalRecords();
    const events = [...new Set(selected.map((race) => race.event).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    setOptions(chartEvent, events);
    setOptions(resultsEvent, events, { label: 'All events', value: 'all' });
    $('#stat-meets').textContent = new Set(selected.filter(dated).map((race) => JSON.stringify([race.race_date, (race.meet_name || '').trim().toLowerCase()]))).size;
    $('#stat-results').textContent = selected.length;
    $('#stat-prs').textContent = selected.filter((race) => records.has(race)).length;
    $('#stat-events').textContent = events.length;
    $('#season-summary').setAttribute('aria-busy', 'false');
    renderBests(bests);
    renderChart();
    renderResults(records);
  }

  async function loadResults() {
    if (!user || loading || saving) return;
    loading = true;
    const accountId = user.id;
    $('#results-status').hidden = false;
    $('#results-status').textContent = 'Loading your results…';
    $('#results-wrap').hidden = true;
    retry.hidden = true;
    try {
      // Page the scoped query so totals and bests include the complete history.
      const fetched = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await auth.client.from('race_results')
          .select(fields).eq('user_id', accountId)
          .order('race_date', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (!user || user.id !== accountId) return;
        fetched.push(...data);
        if (data.length < pageSize) break;
      }
      races = fetched;
      updateSeasons();
      loaded = true;
      render();
      $('#log-result').disabled = false;
      $('#log-another').disabled = false;
    } catch (error) {
      if (!user || user.id !== accountId) return;
      $('#results-status').textContent = `Your results couldn’t load. ${auth.errorMessage(error)}`;
      retry.hidden = false;
      $('#chart-empty').textContent = 'Your chart will appear when your results are available.';
      $('#personal-bests').replaceChildren(element('p', 'Your personal bests will appear when your results load.', 'panel-empty'));
      $('#season-summary').setAttribute('aria-busy', 'false');
    } finally {
      loading = false;
    }
  }

  function openResultForm() {
    if (!user || saving || loading || !loaded) return;
    form.reset();
    timeInput.setCustomValidity('');
    $('#save-error').hidden = true;
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    $('#result-date').value = localDate;
    $('#result-date').max = localDate;
    if ([...$('#result-event').options].some((option) => option.value === chartEvent.value)) $('#result-event').value = chartEvent.value;
    dialog.showModal();
  }

  ['#log-result', '#log-another'].forEach((selector) => $(selector).addEventListener('click', openResultForm));
  ['#close-dialog', '#cancel-result'].forEach((selector) => $(selector).addEventListener('click', () => { if (!saving) dialog.close(); }));
  dialog.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); });
  timeInput.addEventListener('input', () => timeInput.setCustomValidity(''));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !user) return;
    const text = timeInput.value.trim();
    const match = /^(?:(\d+):)?(\d+(?:\.\d{1,2})?)$/.exec(text);
    const seconds = match ? Number(match[1] || 0) * 60 + Number(match[2]) : NaN;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400 || (match?.[1] && Number(match[2]) >= 60)) {
      timeInput.setCustomValidity('Enter a positive time in seconds (11.84) or minutes:seconds (5:12.34), up to 24 hours.');
      timeInput.reportValidity();
      return;
    }
    const meet = $('#result-meet');
    meet.value = meet.value.trim();
    if (!form.reportValidity()) return;
    const accountId = user.id;
    const race = { user_id: accountId, event: $('#result-event').value, race_date: $('#result-date').value, time_seconds: Math.round(seconds * 100) / 100, meet_name: meet.value };
    saving = true;
    $('#save-error').hidden = true;
    form.setAttribute('aria-busy', 'true');
    [...form.elements, $('#close-dialog'), signOut].forEach((control) => { control.disabled = true; });
    $('#save-result').textContent = 'Saving…';
    try {
      // RLS checks ownership on insert; the account ID never comes from the form.
      const { data, error } = await auth.client.from('race_results').insert(race).select(fields).single();
      if (error) throw error;
      if (!user || user.id !== accountId) return;
      races.push(data);
      updateSeasons();
      season.value = race.race_date.slice(0, 4);
      resultsEvent.value = 'all';
      render();
      chartEvent.value = race.event;
      renderChart();
      dialog.close();
      $('#dashboard-feedback').textContent = `${race.event} result saved. Your season is up to date.`;
      $('#dashboard-feedback').hidden = false;
    } catch (error) {
      if (!user || user.id !== accountId) return;
      $('#save-error').textContent = `Your result couldn’t be saved. ${auth.errorMessage(error)}`;
      $('#save-error').hidden = false;
    } finally {
      saving = false;
      form.setAttribute('aria-busy', 'false');
      [...form.elements, $('#close-dialog'), signOut].forEach((control) => { control.disabled = false; });
      $('#save-result').textContent = 'Save result ↗';
    }
  });

  season.addEventListener('change', render);
  chartEvent.addEventListener('change', renderChart);
  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (loaded && user) renderChart(); });
  });
  resultsEvent.addEventListener('change', () => renderResults());
  $('.dashboard-nav').querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    $('.dashboard-nav').querySelectorAll('a').forEach((item) => { item.classList.remove('is-active'); item.removeAttribute('aria-current'); });
    link.classList.add('is-active');
    link.setAttribute('aria-current', 'location');
  }));
  signOut.addEventListener('click', async () => {
    if (saving) return;
    signOut.disabled = true;
    try {
      const { error } = await auth.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      signedOut();
    } catch (error) {
      status.hidden = false;
      status.textContent = auth.errorMessage(error);
      signOut.disabled = false;
    }
  });
  retry.addEventListener('click', loadResults);

  async function initialize() {
    if (!auth?.client) {
      status.textContent = auth?.unavailableMessage || 'Your account couldn’t load. Refresh the page and try again.';
      return;
    }
    auth.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (user && session?.user && session.user.id !== user.id)) signedOut();
    });
    try {
      // Validate with the auth server before displaying private account data.
      const { data, error } = await auth.client.auth.getUser();
      if (error) {
        if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) return signedOut();
        throw error;
      }
      if (!data.user || redirecting) return signedOut();
      user = data.user;
      $('#account-email').textContent = user.email || '';
      const name = typeof user.user_metadata?.display_name === 'string' ? user.user_metadata.display_name.trim() : '';
      $('#welcome').textContent = name ? `Welcome back, ${name}.` : 'Welcome back.';
      $('#profile-name').textContent = name || 'My account';
      $('#profile-initials').textContent = name ? name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase() : 'TT';
      status.hidden = true;
      content.hidden = false;
      signOut.disabled = false;
      await loadResults();
    } catch (error) {
      if (redirecting) return;
      status.textContent = auth.errorMessage(error);
    }
  }
  initialize();
})();
