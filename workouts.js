(() => {
  const auth = window.TrackAuth;
  const $ = (selector) => document.querySelector(selector);
  const pageSize = 12;
  const commentPageSize = 20;
  const commentFields = 'id,workout_id,user_id,author_name,body,created_at';
  const dashboardNav = $('.dashboard-nav');
  const createDialog = $('#create-dialog');
  const detailDialog = $('#detail-dialog');
  const locks = new Set();
  let user, displayName, selected, detailOpener;
  let rows = [], comments = [];
  let collection = 'all', offset = 0, total = 0;
  let libraryRequest = 0, commentsRequest = 0;
  let commentTotal = 0, publishing = false, posting = false, deleting = false, redirecting = false;

  function revealWorkoutsTab() {
    if (dashboardNav.scrollWidth > dashboardNav.clientWidth) dashboardNav.scrollLeft = dashboardNav.scrollWidth;
  }
  window.addEventListener('resize', revealWorkoutsTab);
  revealWorkoutsTab();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  const dateLabel = (date) => new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const hasFilters = () => $('#workout-search').value.trim() || $('#category-filter').value || $('#difficulty-filter').value;

  function feedback(message, detail = false) {
    const target = $(detail ? '#detail-feedback' : '#workout-feedback');
    target.textContent = message;
    target.hidden = !message;
  }

  function signedOut() {
    if (redirecting) return;
    redirecting = true;
    libraryRequest++;
    commentsRequest++;
    user = selected = null;
    rows = comments = [];
    createDialog.close();
    detailDialog.close();
    $('#account-content').hidden = true;
    $('#workout-grid').replaceChildren();
    $('#comment-list').replaceChildren();
    window.location.replace('login.html');
  }

  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', kind === 'like' ? 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'
      : kind === 'save' ? 'M6 3h12v18l-6-4-6 4Z' : 'M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z');
    svg.append(path);
    return svg;
  }

  function action(workout, kind, compact = false) {
    const button = element('button', null, `workout-action${compact && kind === 'save' ? ' workout-save' : ''}`);
    button.type = 'button';
    button.dataset.workout = workout.id;
    button.dataset.action = kind;
    const active = kind === 'like' ? workout.liked : workout.saved;
    if (kind !== 'comments') button.setAttribute('aria-pressed', String(Boolean(active)));
    button.setAttribute('aria-label', kind === 'like' ? `${workout.liked ? 'Unlike' : 'Like'} ${workout.title}`
      : kind === 'save' ? `${workout.saved ? 'Unsave' : 'Save'} ${workout.title}` : `Comments on ${workout.title}`);
    button.disabled = locks.has(`${workout.id}:${kind}`);
    button.append(icon(kind));
    if (!(compact && kind === 'save')) {
      button.append(element('span', kind === 'like' ? `${workout.like_count}${compact ? '' : ' likes'}`
        : kind === 'comments' ? String(workout.comment_count) : workout.saved ? 'Saved' : 'Save workout'));
    }
    button.addEventListener('click', () => kind === 'comments' ? openDetails(workout, true) : toggle(workout, kind));
    return button;
  }

  function metadata(workout) {
    const meta = element('div', null, 'workout-meta');
    meta.append(element('span', `${workout.duration_minutes} min`), element('span', workout.difficulty));
    return meta;
  }

  function renderCards() {
    const focused = document.activeElement;
    const focusId = focused?.dataset.workout, focusAction = focused?.dataset.action;
    const fragment = document.createDocumentFragment();
    rows.forEach((workout) => {
      const card = element('article', null, 'workout-card');
      card.dataset.id = workout.id;
      const top = element('div', null, 'workout-card-top');
      top.append(element('span', workout.category, `workout-type type-${workout.category.toLowerCase().replaceAll(' ', '-')}`), action(workout, 'save', true));
      const heading = element('h3');
      const title = element('button', workout.title, 'workout-title-button');
      title.type = 'button';
      title.dataset.workout = workout.id;
      title.dataset.action = 'view';
      title.addEventListener('click', () => openDetails(workout));
      heading.append(title);
      const bottom = element('div', null, 'workout-card-bottom');
      bottom.append(metadata(workout), element('p', `${workout.is_builtin ? 'Library session' : 'Community session'} · ${workout.author_name}`, 'workout-byline'));
      const actions = element('div', null, 'workout-card-actions');
      const view = element('button', 'View session ↗', 'workout-view');
      view.type = 'button';
      view.dataset.workout = workout.id;
      view.dataset.action = 'session';
      view.addEventListener('click', () => openDetails(workout));
      actions.append(action(workout, 'like', true), action(workout, 'comments', true), view);
      bottom.append(actions);
      card.append(top, heading, element('p', workout.description, 'workout-description'), bottom);
      fragment.append(card);
    });
    $('#workout-grid').replaceChildren(fragment);
    // Replacing cards must not strand keyboard focus after a like/save toggle.
    if (focusId && !detailDialog.open) {
      const button = [...$('#workout-grid').querySelectorAll('button')].find((node) => node.dataset.workout === focusId && node.dataset.action === focusAction);
      if (button && !button.disabled) button.focus({ preventScroll: true });
    }
  }

  function renderDetailActions() {
    if (!selected || !detailDialog.open) return;
    const focused = document.activeElement;
    const focusAction = focused?.closest('#detail-actions') ? focused.dataset.action : null;
    $('#detail-actions').replaceChildren(action(selected, 'like'), action(selected, 'save'));
    $('#comment-count').textContent = `${selected.comment_count} total`;
    if (focusAction) $('#detail-actions').querySelector(`[data-action="${focusAction}"]:not(:disabled)`)?.focus({ preventScroll: true });
  }

  async function loadLibrary() {
    const request = ++libraryRequest;
    $('#workout-results').setAttribute('aria-busy', 'true');
    $('#library-status').textContent = 'Loading workouts…';
    $('#library-status').hidden = false;
    $('#retry-workouts').hidden = true;
    $('#clear-filters').hidden = true;
    $('#workout-pagination').hidden = true;
    $('#workout-count').textContent = '';
    // Do not leave results from an old query displayed under new filters.
    rows = [];
    renderCards();
    try {
      const { data, error } = await auth.client.rpc('browse_workouts', {
        search_text: $('#workout-search').value.trim(), category_filter: $('#category-filter').value,
        difficulty_filter: $('#difficulty-filter').value, collection, sort_order: $('#sort-order').value,
        page_offset: offset, page_size: pageSize,
      });
      if (request !== libraryRequest || redirecting) return;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Unexpected workout response');
      rows = data;
      total = Number(rows[0]?.total_count || 0);
      if (!rows.length && offset > 0) { offset = 0; return loadLibrary(); }
      renderCards();
      $('#library-status').hidden = rows.length > 0;
      $('#library-status').textContent = hasFilters() ? 'No workouts match your search. Try another word or clear your filters.'
        : collection === 'saved' ? 'Your favorites live here. Save a workout in Explore to come back to it later.'
          : collection === 'mine' ? 'Your first session starts here. Create a workout to share it with the community.' : 'No workouts yet. Be the first to share a session.';
      $('#clear-filters').hidden = rows.length > 0 || !hasFilters();
      $('#workout-count').textContent = `${total} ${total === 1 ? 'workout' : 'workouts'}`;
      $('#workout-pagination').hidden = total <= pageSize;
      $('#previous-page').disabled = offset === 0;
      $('#next-page').disabled = offset + pageSize >= total;
      $('#page-label').textContent = `Page ${Math.floor(offset / pageSize) + 1} of ${Math.max(1, Math.ceil(total / pageSize))}`;
    } catch {
      if (request !== libraryRequest || redirecting) return;
      $('#library-status').textContent = 'We couldn’t load workouts. Check your connection and try again.';
      $('#retry-workouts').hidden = false;
    } finally {
      if (request === libraryRequest && !redirecting) $('#workout-results').setAttribute('aria-busy', 'false');
    }
  }

  async function toggle(workout, kind) {
    const key = `${workout.id}:${kind}`;
    if (!user || locks.has(key)) return;
    const actor = user.id;
    const property = kind === 'like' ? 'liked' : 'saved';
    const table = kind === 'like' ? 'workout_likes' : 'workout_favorites';
    const active = Boolean(workout[property]);
    locks.add(key);
    document.querySelectorAll('button[data-workout]').forEach((button) => {
      if (button.dataset.workout === workout.id && button.dataset.action === kind) button.disabled = true;
    });
    feedback('');
    feedback('', true);
    try {
      const query = auth.client.from(table);
      const { error } = active
        ? await query.delete().eq('workout_id', workout.id).eq('user_id', actor)
        : await query.insert({ workout_id: workout.id, user_id: actor });
      // A unique key makes repeated likes/saves (including other tabs) idempotent.
      if (error && !(error.code === '23505' && !active)) throw error;
      if (redirecting) return;
      const update = (row) => {
        row[property] = !active;
        if (kind === 'like') row.like_count = Math.max(0, Number(row.like_count) + (active ? -1 : 1));
      };
      update(workout);
      rows.filter((row) => row.id === workout.id && row !== workout).forEach(update);
      if (selected?.id === workout.id && selected !== workout) update(selected);
      feedback(kind === 'save' ? active ? 'Removed from your saved workouts.' : 'Saved for later. Find it in Saved.' : active ? 'Like removed.' : 'Workout liked.', detailDialog.open);
    } catch {
      if (!redirecting) feedback(`We couldn’t ${kind === 'save' ? 'update your saved workouts' : 'update your like'}. Please try again.`, detailDialog.open);
    } finally {
      locks.delete(key);
      if (!redirecting) {
        renderCards();
        renderDetailActions();
        if (kind === 'save' && active && !workout.saved && collection === 'saved') await loadLibrary();
      }
    }
  }

  function openDetails(workout, focusComments = false) {
    if (selected?.id === workout.id && detailDialog.open) {
      if (focusComments) $('#comment-body').focus();
      return;
    }
    detailOpener = { id: document.activeElement?.dataset.workout, action: document.activeElement?.dataset.action };
    selected = workout;
    commentsRequest++;
    comments = [];
    $('#comment-list').replaceChildren();
    $('#comment-form').reset();
    feedback('', true);
    $('#detail-title').textContent = workout.title;
    $('#detail-category').textContent = workout.category;
    $('#detail-author').textContent = `${workout.is_builtin ? 'Library session' : 'Shared by'} · ${workout.author_name}`;
    $('#detail-description').textContent = workout.description;
    $('#detail-meta').replaceChildren(...metadata(workout).childNodes);
    $('#detail-steps').replaceChildren(...workout.steps.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => element('li', line)));
    $('#delete-workout').hidden = workout.user_id !== user.id;
    detailDialog.showModal();
    detailDialog.scrollTop = 0;
    renderDetailActions();
    loadComments();
    if (focusComments) $('#comment-body').focus();
  }

  function renderComments() {
    $('#comment-list').replaceChildren(...comments.map((comment) => {
      const item = element('article', null, 'comment');
      const heading = element('header');
      heading.append(element('strong', comment.author_name), element('span', dateLabel(comment.created_at)));
      item.append(heading, element('p', comment.body));
      if (comment.user_id === user.id) {
        const remove = element('button', 'Delete my comment');
        remove.type = 'button';
        remove.addEventListener('click', () => deleteComment(comment, remove));
        item.append(remove);
      }
      return item;
    }));
  }

  async function loadComments(more = false) {
    if (!selected || redirecting) return;
    const id = selected.id;
    const request = ++commentsRequest;
    const start = more ? comments.length : 0;
    $('#comments-status').textContent = 'Loading comments…';
    $('#retry-comments').hidden = true;
    $('#more-comments').hidden = true;
    $('#comment-list').setAttribute('aria-busy', 'true');
    try {
      const { data, error, count } = await auth.client.from('workout_comments').select(commentFields, { count: 'exact' })
        .eq('workout_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + commentPageSize - 1);
      if (request !== commentsRequest || selected?.id !== id || redirecting) return;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Unexpected comments response');
      comments = more ? [...comments, ...data.filter((row) => !comments.some((existing) => existing.id === row.id))] : data;
      commentTotal = count ?? Math.max(Number(selected.comment_count), comments.length);
      selected.comment_count = commentTotal;
      rows.filter((row) => row.id === id).forEach((row) => { row.comment_count = commentTotal; });
      renderComments();
      renderCards();
      renderDetailActions();
      $('#comments-status').textContent = comments.length ? '' : 'No comments yet. Start the conversation.';
      $('#more-comments').hidden = comments.length >= commentTotal;
    } catch {
      if (request !== commentsRequest || redirecting) return;
      $('#comments-status').textContent = 'We couldn’t load comments. Please try again.';
      $('#retry-comments').hidden = false;
    } finally {
      if (request === commentsRequest && !redirecting) $('#comment-list').setAttribute('aria-busy', 'false');
    }
  }

  function trimmedField(selector, min) {
    const field = $(selector);
    field.setCustomValidity('');
    const value = field.value.trim();
    if (value.length < min) { field.setCustomValidity(`Enter at least ${min} characters, not just spaces.`); field.reportValidity(); return null; }
    return value;
  }

  $('#create-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (publishing || !user) return;
    const title = trimmedField('#workout-title', 3);
    const description = trimmedField('#workout-description', 10);
    const steps = trimmedField('#workout-steps', 20);
    if (title == null || description == null || steps == null || !event.currentTarget.reportValidity()) return;
    publishing = true;
    $('#create-error').hidden = true;
    createDialog.querySelectorAll('button, input, select, textarea').forEach((control) => { control.disabled = true; });
    $('#publish-workout').textContent = 'Publishing…';
    try {
      const { error } = await auth.client.from('workouts').insert({
        user_id: user.id, author_name: displayName, title, description, steps,
        category: $('#workout-category').value, difficulty: $('#workout-difficulty').value,
        duration_minutes: Number($('#workout-duration').value),
      });
      if (error) throw error;
      if (redirecting) return;
      createDialog.close();
      $('#create-form').reset();
      clearFilters();
      $('#sort-order').value = 'newest';
      setCollection('mine');
      feedback('Workout published! Other athletes can now find, save, and comment on your session.');
    } catch {
      if (redirecting) return;
      $('#create-error').textContent = 'We couldn’t publish your workout. Your draft is still here; please try again.';
      $('#create-error').hidden = false;
    } finally {
      publishing = false;
      createDialog.querySelectorAll('button, input, select, textarea').forEach((control) => { control.disabled = false; });
      $('#publish-workout').textContent = 'Publish workout ↗';
    }
  });

  $('#comment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (posting || !selected || !user) return;
    const body = trimmedField('#comment-body', 1);
    if (!body) return;
    const workout = selected;
    posting = true;
    $('#post-comment').disabled = true;
    $('#comment-body').disabled = true;
    feedback('', true);
    try {
      const { error } = await auth.client.from('workout_comments').insert({ workout_id: workout.id, user_id: user.id, author_name: displayName, body });
      if (error) throw error;
      if (redirecting) return;
      workout.comment_count = Number(workout.comment_count) + 1;
      if (selected?.id === workout.id) {
        $('#comment-form').reset();
        feedback('Comment posted.', true);
        await loadComments();
      }
      renderCards();
    } catch {
      if (!redirecting && selected?.id === workout.id) feedback('We couldn’t post your comment. Your text is still here; please try again.', true);
    } finally {
      posting = false;
      $('#post-comment').disabled = false;
      $('#comment-body').disabled = false;
    }
  });

  async function deleteComment(comment, button) {
    if (!user || comment.user_id !== user.id) return;
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    button.disabled = true;
    try {
      const { error } = await auth.client.from('workout_comments').delete().eq('id', comment.id).eq('user_id', user.id);
      if (error) throw error;
      if (redirecting || selected?.id !== comment.workout_id) return;
      selected.comment_count = Math.max(0, Number(selected.comment_count) - 1);
      feedback('Your comment was deleted.', true);
      await loadComments();
    } catch { if (!redirecting) feedback('We couldn’t delete your comment. Please try again.', true); }
    finally { button.disabled = false; }
  }

  $('#delete-workout').addEventListener('click', async () => {
    if (deleting || !selected || selected.user_id !== user?.id) return;
    if (!window.confirm('Delete your workout and its likes, saves, and comments? This cannot be undone.')) return;
    deleting = true;
    $('#delete-workout').disabled = true;
    try {
      const { error } = await auth.client.from('workouts').delete().eq('id', selected.id).eq('user_id', user.id);
      if (error) throw error;
      if (redirecting) return;
      detailDialog.close();
      offset = 0;
      await loadLibrary();
      feedback('Your workout and its discussion were deleted.');
    } catch { if (!redirecting) feedback('We couldn’t delete your workout. Please try again.', true); }
    finally { deleting = false; $('#delete-workout').disabled = false; }
  });

  function clearFilters() {
    $('#workout-search').value = '';
    $('#category-filter').value = '';
    $('#difficulty-filter').value = '';
    offset = 0;
  }

  function setCollection(value) {
    collection = value;
    offset = 0;
    document.querySelectorAll('[data-collection]').forEach((button) => {
      const active = button.dataset.collection === value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#collection-heading').textContent = value === 'saved' ? 'Saved for your next session' : value === 'mine' ? 'Your shared workouts' : 'Explore workouts';
    feedback('');
    return loadLibrary();
  }

  document.querySelectorAll('[data-collection]').forEach((button) => button.addEventListener('click', () => setCollection(button.dataset.collection)));
  $('#search-form').addEventListener('submit', (event) => { event.preventDefault(); offset = 0; loadLibrary(); });
  $('#workout-search').addEventListener('search', () => { offset = 0; loadLibrary(); });
  ['#category-filter', '#difficulty-filter', '#sort-order'].forEach((selector) => $(selector).addEventListener('change', () => { offset = 0; loadLibrary(); }));
  $('#clear-filters').addEventListener('click', () => { clearFilters(); loadLibrary(); });
  $('#retry-workouts').addEventListener('click', loadLibrary);
  $('#previous-page').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); loadLibrary(); });
  $('#next-page').addEventListener('click', () => { offset += pageSize; loadLibrary(); });
  $('#retry-comments').addEventListener('click', () => loadComments());
  $('#more-comments').addEventListener('click', () => loadComments(true));
  $('#create-workout').addEventListener('click', () => { $('#create-error').hidden = true; createDialog.showModal(); });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.close === 'create-dialog' && publishing) return;
    if (button.dataset.close === 'detail-dialog' && (posting || deleting)) return;
    document.getElementById(button.dataset.close).close();
  }));
  createDialog.addEventListener('cancel', (event) => { if (publishing) event.preventDefault(); });
  detailDialog.addEventListener('cancel', (event) => { if (posting || deleting) event.preventDefault(); });
  detailDialog.addEventListener('close', () => {
    selected = null;
    commentsRequest++;
    // Comment/like updates may replace the original card while the dialog is open.
    const opener = [...$('#workout-grid').querySelectorAll('button')].find((button) => button.dataset.workout === detailOpener?.id && button.dataset.action === detailOpener?.action);
    (opener || $('#create-workout')).focus({ preventScroll: true });
    detailOpener = null;
  });
  document.querySelectorAll('input, textarea').forEach((field) => field.addEventListener('input', () => field.setCustomValidity('')));

  $('#sign-out').addEventListener('click', async () => {
    $('#sign-out').disabled = true;
    try {
      const { error } = await auth.client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      signedOut();
    } catch (error) {
      if (!redirecting) { feedback(auth.errorMessage(error)); $('#sign-out').disabled = false; }
    }
  });

  async function initialize() {
    if (!auth?.client) { $('#account-status').textContent = auth?.unavailableMessage || 'Sign-in couldn’t load. Refresh and try again.'; return; }
    auth.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (user && session?.user.id && session.user.id !== user.id)) signedOut();
    });
    try {
      const { data, error } = await auth.client.auth.getUser();
      if (redirecting) return;
      if (error || !data.user) { signedOut(); return; }
      user = data.user;
      // Display metadata only; database ownership is always checked with auth.uid().
      const name = user.user_metadata?.display_name;
      displayName = (typeof name === 'string' && name.trim() ? name.trim() : 'Athlete').slice(0, 80);
      $('#profile-name').textContent = displayName;
      $('#profile-initials').textContent = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
      $('#account-email').textContent = user.email || '';
      $('#sign-out').disabled = false;
      $('#account-status').hidden = true;
      $('#account-content').hidden = false;
      await loadLibrary();
    } catch { $('#account-status').textContent = 'We couldn’t check your account. Refresh and try again.'; }
  }
  initialize();
})();
