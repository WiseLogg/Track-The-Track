(() => {
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csvCell(value) {
    let text = String(value ?? '');
    // Prevent spreadsheet formulas, including those hidden behind whitespace.
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
  window.TrackExport = {
    download,
    results(rows, filename = 'track-the-track-results.csv') {
      const fields = ['event', 'race_date', 'time_seconds', 'meet_name', 'notes'];
      const csv = [fields, ...rows.map((row) => fields.map((field) => row[field]))]
        .map((row) => row.map(csvCell).join(',')).join('\r\n');
      download('\uFEFF' + csv, filename, 'text/csv;charset=utf-8');
    },
  };
})();
