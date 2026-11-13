// Fictional data only. Demo mode never reads or writes browser storage or Supabase.
window.TrackDemo = {
  user: { id: 'demo-athlete', email: '', user_metadata: { display_name: 'Alex' } },
  results() {
    const today = new Date();
    const year = today.getFullYear() - (today.getMonth() < 5 ? 1 : 0);
    return [
      ['100m', `${year - 1}-05-01`, 12.5, 'Last season'],
      ['100m', `${year}-03-01`, 12.2, 'Season opener'],
      ['200m', `${year}-03-01`, 24.8, 'Season opener'],
      ['100m', `${year}-03-20`, 12, 'City Invitational'],
      ['100m', `${year}-04-10`, 12.15, 'League meet'],
      ['200m', `${year}-04-10`, 24.4, 'League meet'],
      ['800m', `${year}-04-10`, 125.12, 'League meet'],
      ['100m', `${year}-05-01`, 11.84, 'Championships'],
    ].map(([event, race_date, time_seconds, meet_name], index) => ({
      id: `demo-${index}`, event, race_date, time_seconds, meet_name, notes: '',
    }));
  },
};
