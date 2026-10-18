// Aplica o tema antes do primeiro paint (arquivo externo: a CSP do servidor não permite script inline).
try {
  var t = localStorage.getItem('argos-theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (e) {}
