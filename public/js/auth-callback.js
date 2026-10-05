// OAuth return page. Supabase redirects here with tokens in the URL fragment. We hand them to
// the window that opened the popup (same origin only), then clear the URL and close.
(function () {
  var params = new URLSearchParams(location.hash.replace(/^#/, ''));
  var payload = {
    access_token: params.get('access_token'), refresh_token: params.get('refresh_token'),
    expires_in: Number(params.get('expires_in') || 3600), provider_token: params.get('provider_token'),
    error: params.get('error_description') || params.get('error') || new URLSearchParams(location.search).get('error_description'),
  };
  history.replaceState(null, '', location.pathname); // never leave tokens in the address bar
  var msg = document.getElementById('msg');
  var sameOrigin = false;
  try { sameOrigin = !!window.opener && window.opener.location.origin === location.origin; } catch (e) { sameOrigin = false; }
  if (sameOrigin) {
    window.opener.postMessage({ type: 'kk-google-auth', payload: payload }, location.origin);
    msg.textContent = payload.error ? 'Could not connect: ' + payload.error : 'Connected. You can close this window.';
    setTimeout(function () { window.close(); }, payload.error ? 4000 : 300);
  } else {
    msg.innerHTML = 'Please return to <a href="/app#/settings">KirayaKhata</a> and try again.';
  }
})();
