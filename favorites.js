/* Favorites integration. Does not change generation, engraving or playback functions. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const status = $('fg-auth-status'), msg = $('fg-favorites-message');
  const signIn = $('fg-sign-in'), signOut = $('fg-sign-out');
  const save = $('fg-save'), load = $('fg-load'), del = $('fg-delete');
  const key = window.FG_SUPABASE_PUBLISHABLE_KEY;
  if (!window.supabase || !key || key.includes('PASTE_')) {
    msg.textContent = 'Add your Supabase publishable key to favorites-config.js.';
    signIn.disabled = true;
    return;
  }
  const client = window.supabase.createClient(window.FG_SUPABASE_URL, key);
  let user = null;
  function message(s) { msg.textContent = s; }
  function snapshot() {
    return JSON.parse(JSON.stringify({version:1, ro, sel, notes, melodicStyle, contourDirections}));
  }
  function valid(data) {
    return data && data.version === 1 &&
      Array.isArray(data.ro) && data.ro.length === 24 &&
      Array.isArray(data.sel) && data.sel.length === 24 &&
      Array.isArray(data.notes) && data.notes.length === 24 &&
      data.notes.every((n,i) => (i === 5 || i === 20) ? n === null : Array.isArray(n)) &&
      ['angular','smooth','triadic','quartal'].includes(data.melodicStyle) &&
      Array.isArray(data.contourDirections);
  }
  function restore(data) {
    if (!valid(data)) throw new Error('Saved chart is incompatible with this generator version.');
    stopPlayback();
    ro = structuredClone(data.ro);
    sel = structuredClone(data.sel);
    notes = structuredClone(data.notes);
    melodicStyle = data.melodicStyle;
    contourDirections = structuredClone(data.contourDirections);
    render();
    document.querySelectorAll('.fg-style-buttons button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.style === melodicStyle));
    });
  }
  async function refresh() {
    const chosen = load.value;
    load.replaceChildren(new Option('Load Favorite…', ''));
    if (!user) { load.disabled = save.disabled = del.disabled = true; return; }
    const {data,error} = await client.from('favorite_charts').select('id,name,created_at').order('created_at',{ascending:false});
    if (error) { message(error.message); return; }
    data.forEach(row => load.add(new Option(row.name, row.id)));
    load.value = data.some(x=>x.id===chosen) ? chosen : '';
    load.disabled = false; save.disabled = false; del.disabled = !load.value;
  }
  async function setUser() {
    const {data:{user:current},error} = await client.auth.getUser();
    if (error && error.name !== 'AuthSessionMissingError') message(error.message);
    user = current;
    status.textContent = user ? `Signed in: ${user.email}` : 'Favorites: not signed in';
    signIn.hidden = !!user; signOut.hidden = !user;
    await refresh();
  }
  signIn.addEventListener('click', async () => {
    const email = prompt('Email address for Falling Grace favorites:');
    if (!email) return;
    const password = prompt('Password (existing account: sign in; new account: sign up):');
    if (!password) return;
    let {error} = await client.auth.signInWithPassword({email,password});
    if (error && /invalid login credentials/i.test(error.message)) {
      if (!confirm('No matching login. Create an account with this email and password?')) return;
      ({error} = await client.auth.signUp({email,password}));
      if (!error) message('Account created. If email confirmation is enabled, confirm your email before signing in.');
    }
    if (error) message(error.message);
    await setUser();
  });
  signOut.addEventListener('click', async () => { const {error}=await client.auth.signOut(); if(error)message(error.message); await setUser(); });
  save.addEventListener('click', async () => {
    if (!user) return;
    const name = prompt('Name this favorite chart:');
    if (!name || !name.trim()) return;
    const {error} = await client.from('favorite_charts').insert({user_id:user.id,name:name.trim().slice(0,120),chart_data:snapshot()});
    message(error ? error.message : 'Favorite saved.');
    if (!error) await refresh();
  });
  load.addEventListener('change', async () => {
    del.disabled = !load.value;
    if (!load.value || !user) return;
    const {data,error} = await client.from('favorite_charts').select('chart_data').eq('id',load.value).single();
    if (error) {message(error.message);return;}
    try { restore(data.chart_data); message('Favorite loaded.'); } catch(e) { message(e.message); }
  });
  del.addEventListener('click', async () => {
    if (!user || !load.value) return;
    if (!confirm(`Delete favorite "${load.selectedOptions[0].textContent}"?`)) return;
    const {error} = await client.from('favorite_charts').delete().eq('id',load.value);
    message(error ? error.message : 'Favorite deleted.');
    if (!error) await refresh();
  });
  client.auth.onAuthStateChange(() => { setTimeout(setUser,0); });
  setUser();
})();
