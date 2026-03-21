/* nav.js — nawigacja i stopka dla wszystkich podstron */

function injectNav(activePage) {
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  nav.innerHTML = `
    <a class="nav-logo" href="index.html"><span>Korepetycje</span> Kowalski</a>
    <ul class="nav-links" id="navLinks">
      <li><a href="index.html"         ${activePage==='home'          ?'class="active"':''}>Strona główna</a></li>
      <li><a href="o-mnie.html"        ${activePage==='o-mnie'        ?'class="active"':''}>O mnie</a></li>
      <li><a href="korepetytorzy.html" ${activePage==='korepetytorzy' ?'class="active"':''}>Korepetytorzy</a></li>
      <li><a href="cennik.html"        ${activePage==='cennik'        ?'class="active"':''}>Cennik</a></li>
      <li><a href="opinie.html"        ${activePage==='opinie'        ?'class="active"':''}>Opinie</a></li>
      <li class="nav-cta-li"><a href="index.html#contact">Kontakt</a></li>
    </ul>
    <button class="hamburger" id="hamburger" aria-label="Otwórz menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  `;

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

  // Close on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      navLinks.classList.remove('open');
      hbg.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
}

function injectFooter() {
  const ft = document.getElementById('mainFooter');
  if (!ft) return;
  ft.innerHTML = `
    <div class="footer-inner">
      <div class="footer-brand">
        <a class="nav-logo" href="index.html"><span>Korepetycje</span> Kowalski</a>
        <p>Profesjonalne korepetycje z matematyki i informatyki — online oraz stacjonarnie w Warszawie.</p>
      </div>
      <div class="footer-col">
        <h4>Nawigacja</h4>
        <ul>
          <li><a href="index.html">Strona główna</a></li>
          <li><a href="o-mnie.html">O mnie</a></li>
          <li><a href="korepetytorzy.html">Korepetytorzy</a></li>
          <li><a href="cennik.html">Cennik</a></li>
          <li><a href="opinie.html">Opinie</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Kontakt</h4>
        <ul>
          <li><a href="mailto:jan.kowalski@email.com">📧 jan.kowalski@email.com</a></li>
          <li><a href="tel:+48600000000">📱 +48 600 000 000</a></li>
          <li><a href="login.html">🔐 Panel ucznia</a></li>
          <li><a href="index.html#contact">✉️ Formularz kontaktowy</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">© 2025 Korepetycje Kowalski · Wszelkie prawa zastrzeżone</div>
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
