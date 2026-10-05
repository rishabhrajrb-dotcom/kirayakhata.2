// Runs before paint: marks JS availability so reveal styles only apply when scripts work.
document.documentElement.classList.remove('no-js');
document.documentElement.classList.add('js');
try { var l = localStorage.getItem('kk:lang'); if (l === 'hi') document.documentElement.lang = 'hi'; } catch (e) {}
