// Sign-in dialog for the connection proof. No libraries: authorisation code flow with PKCE,
// the method Microsoft recommends for browser apps. Runs in an Office dialog opened by the panel.
// 1st visit (?tenant=&client=): make a secret, send the user to Microsoft's sign-in page.
// 2nd visit (?code=): swap the code for a token at Microsoft's token endpoint, hand it to the panel.
(function () {
  'use strict';
  var SCOPES = 'openid profile offline_access User.Read Sites.Selected';
  var here = location.origin + location.pathname;
  function b64url(bytes) {
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function random(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  var inTeams = false;   // set when the sign-in was started from a Teams tab
  function send(obj) {
    var text = JSON.stringify(obj);
    if (inTeams && window.microsoftTeams) {
      microsoftTeams.app.initialize().then(function () {
        if (obj.ok) microsoftTeams.authentication.notifySuccess(text); else microsoftTeams.authentication.notifyFailure(text);
      });
    } else if (window.Office && Office.context && Office.context.ui && Office.context.ui.messageParent) Office.context.ui.messageParent(text);
    else if (window.opener) window.opener.postMessage(text, location.origin);   // browser test without Office
    document.getElementById('msg').textContent = obj.ok ? 'Signed in. You can close this window.' : 'Sign-in failed: ' + obj.error;
  }
  async function start(q) {
    var verifier = random(48), state = random(16);
    var digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    sessionStorage.setItem('pkce', JSON.stringify({ verifier: verifier, state: state, tenant: q.get('tenant'), client: q.get('client'), teams: q.get('teams') === '1' }));
    var p = new URLSearchParams({
      client_id: q.get('client'), response_type: 'code', redirect_uri: here, response_mode: 'query',
      scope: SCOPES, state: state, code_challenge: b64url(digest), code_challenge_method: 'S256'
    });
    if (q.get('hint')) p.set('login_hint', q.get('hint'));
    location.replace('https://login.microsoftonline.com/' + encodeURIComponent(q.get('tenant')) + '/oauth2/v2.0/authorize?' + p);
  }
  async function finish(q) {
    var saved = JSON.parse(sessionStorage.getItem('pkce') || 'null');
    sessionStorage.removeItem('pkce');
    inTeams = !!(saved && saved.teams);
    if (!saved || saved.state !== q.get('state')) return send({ ok: false, error: 'state did not match (sign-in started in another window?)' });
    var body = new URLSearchParams({
      client_id: saved.client, grant_type: 'authorization_code', code: q.get('code'),
      redirect_uri: here, code_verifier: saved.verifier, scope: SCOPES
    });
    var r = await fetch('https://login.microsoftonline.com/' + encodeURIComponent(saved.tenant) + '/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body
    });
    var j = await r.json();
    if (!r.ok) return send({ ok: false, error: (j.error || r.status) + ': ' + (j.error_description || '').split('\r\n')[0] });
    send({ ok: true, access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in, scope: j.scope });
  }
  function go() {
    var q = new URLSearchParams(location.search);
    try { inTeams = q.get('teams') === '1' || !!JSON.parse(sessionStorage.getItem('pkce') || '{}').teams; } catch (e) { inTeams = false; }
    var run = q.get('error') ? Promise.resolve(send({ ok: false, error: q.get('error') + ': ' + (q.get('error_description') || '') }))
      : q.get('code') ? finish(q) : start(q);
    run.catch(function (e) { send({ ok: false, error: String(e && e.message || e) }); });
  }
  if (window.Office && Office.onReady) Office.onReady(go); else go();
})();
