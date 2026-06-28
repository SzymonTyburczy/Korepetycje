/* nav.js — nawigacja i stopka dla wszystkich podstron */

/* nav.js — nawigacja i stopka dla wszystkich podstron */

function injectNav(activePage) {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  nav.innerHTML = `
    <a class="nav-logo" href="/"><span>Korepetycje</span> Szymon Tyburczy</a>
    <ul class="nav-links" id="navLinks">
      <li><a href="/"                  ${activePage==='home'          ?'class="active"':''}>Strona główna</a></li>
      <li><a href="/o-mnie"            ${activePage==='o-mnie'        ?'class="active"':''}>O mnie</a></li>
      <li><a href="/korepetytorzy"     ${activePage==='korepetytorzy' ?'class="active"':''}>Korepetytorzy</a></li>
      <li><a href="/cennik"            ${activePage==='cennik'        ?'class="active"':''}>Cennik</a></li>
      <li><a href="/opinie"            ${activePage==='opinie'        ?'class="active"':''}>Opinie</a></li>
      
      <li id="navDashboardTab" style="display:none;">
        <a href="dashboard.html" style="color: var(--gold); font-weight: 700;">🚀 Mój Panel</a>
      </li>

      <li class="nav-cta-li"><a href="/#contact">Kontakt</a></li>
      <li class="nav-auth-li" id="navAuthBtn" style="display:none">
        <a href="login.html" id="navAuthLink">🔐 Zaloguj się</a>
      </li>
    </ul>
    <button class="hamburger" id="hamburger" aria-label="Otwórz menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  `;

  _updateAuthButton();

  const hbg      = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  hbg.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    hbg.classList.toggle('open', open);
    hbg.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });

  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hbg.classList.remove('open');
      hbg.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      navLinks.classList.remove('open');
      hbg.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
}

async function _updateAuthButton() {
  const btn  = document.getElementById('navAuthBtn');
  const link = document.getElementById('navAuthLink');
  const dashboardTab = document.getElementById('navDashboardTab'); // Łapiemy nową zakładkę

  if (!btn || !link) return;

  btn.style.display = 'block';

  if (typeof initSupabase !== 'function') return;

  try {
    await initSupabase();
    // Używamy supabaseClient!
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
      // POKAŻ ZAKŁADKĘ "Mój Panel" W MENU
      if (dashboardTab) dashboardTab.style.display = 'block';

      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single();

      const name  = profile?.full_name?.split(' ')[0] || 'Uczeń';
      const emoji = profile?.role === 'admin' ? '🔑' : '👤';

      link.href        = 'dashboard.html';
      link.textContent = `${emoji} ${name}`;
      link.style.cssText = 'background:rgba(201,168,76,.15)!important;border:1px solid var(--gold)!important;color:var(--gold-light)!important;border-radius:3px;padding:.35rem .9rem;';
    } else {
      // UKRYJ ZAKŁADKĘ JEŚLI UŻYTKOWNIK NIE JEST ZALOGOWANY
      if (dashboardTab) dashboardTab.style.display = 'none';
      link.href        = 'login.html';
      link.textContent = '🔐 Zaloguj się';
    }
  } catch(e) {
    if (dashboardTab) dashboardTab.style.display = 'none';
    link.href        = 'login.html';
    link.textContent = '🔐 Zaloguj się';
  }
}

function injectFooter() {
  const ft = document.getElementById('mainFooter');
  if (!ft) return;
  ft.innerHTML = `
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="nav-logo" href="/"><span>Korepetycje</span> Szymon Tyburczy</a>
        <p>Profesjonalne korepetycje z matematyki i informatyki i innych — online oraz stacjonarnie w Krakowie.</p>
      </div>
      <div class="footer-col">
        <h4>Nawigacja</h4>
        <ul>
          <li><a href="/">Strona główna</a></li>
          <li><a href="/o-mnie">O mnie</a></li>
          <li><a href="/korepetytorzy">Korepetytorzy</a></li>
          <li><a href="/cennik">Cennik</a></li>
          <li><a href="/opinie">Opinie</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Kontakt</h4>
        <ul>
          <li><a href="mailto:szymontyburczy@protonmail.com">📧 szymontyburczy@protonmail.com</a></li>
          <li><a href="tel:+48789142398">📱 +48 789 142 398</a></li>
          <li><a href="login.html">🔐 Panel ucznia</a></li>
          <li><a href="/#contact">✉️ Formularz kontaktowy</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">© 2025 Korepetycje Szymon Tyburczy · Wszelkie prawa zastrzeżone</div>
  `;
}

function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  els.forEach(el => obs.observe(el));
}





