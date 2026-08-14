/* ═══════════════════════════════════════════════════════
   cookies-banner.js — RODO-compliant cookie consent banner
   Dołącz do każdej strony: <script src="cookies-banner.js"></script>
   ═══════════════════════════════════════════════════════ */

(function () {
  const CONSENT_KEY = 'cookie-consent';
  const CONSENT_EXPIRY_DAYS = 365;

  // Sprawdź czy zgoda już została udzielona
  function getConsent() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Sprawdź ważność (12 miesięcy)
      if (data.expires && Date.now() > data.expires) {
        localStorage.removeItem(CONSENT_KEY);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function setConsent(level) {
    const data = {
      level: level, // 'all' lub 'necessary'
      timestamp: new Date().toISOString(),
      expires: Date.now() + CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(data));
  }

  // ── Google Analytics (załaduj tylko po zgodzie) ──
  function loadAnalytics() {
    // Sprawdź czy już załadowane (unikaj duplikatów)
    if (window._gaLoaded) return;
    window._gaLoaded = true;

    var GA_ID = 'G-KWTJSRZX5W';
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(script);

    script.onload = function () {
      window.dataLayer = window.dataLayer || [];
      function gtag(){ dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', GA_ID, { anonymize_ip: true });
    };
  }

  // ── Globalna funkcja do resetowania zgody (link w stopce) ──
  window.resetCookieConsent = function () {
    localStorage.removeItem(CONSENT_KEY);

    // Cofnięcie zgody musi także usunąć istniejące cookies Google Analytics.
    const hostParts = window.location.hostname.split('.');
    const baseDomain = hostParts.length >= 2 ? `.${hostParts.slice(-2).join('.')}` : null;
    document.cookie.split(';').forEach(function (item) {
      const name = item.split('=')[0].trim();
      if (name === '_ga' || name.startsWith('_ga_')) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
        if (baseDomain) {
          document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${baseDomain}; SameSite=Lax`;
        }
      }
    });

    location.reload();
  };

  // Jeśli zgoda już jest — nie pokazuj bannera
  if (getConsent()) {
    if (getConsent().level === 'all') {
      loadAnalytics();
    }
    return;
  }

  // ── INJECT CSS ──
  var style = document.createElement('style');
  style.textContent = `
    .cookie-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      background: #1a2744;
      border-top: 2px solid #c9a84c;
      padding: 1.2rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      box-shadow: 0 -8px 40px rgba(0,0,0,.35);
      animation: cookieSlideUp .4s ease;
    }
    @keyframes cookieSlideUp {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .cookie-banner-inner {
      max-width: 1060px;
      margin: 0 auto;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    @media (min-width: 768px) {
      .cookie-banner-inner {
        flex-direction: row;
        align-items: center;
        gap: 2rem;
      }
    }
    .cookie-text {
      flex: 1;
      color: rgba(255,255,255,.78);
      font-size: .88rem;
      line-height: 1.65;
      font-family: 'Source Serif 4', Georgia, serif;
    }
    .cookie-text a {
      color: #e8c97a;
      text-decoration: none;
    }
    .cookie-text a:hover {
      text-decoration: underline;
    }
    .cookie-text strong {
      color: #fff;
    }
    .cookie-buttons {
      display: flex;
      gap: .6rem;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .cookie-btn {
      padding: .6rem 1.4rem;
      border-radius: 3px;
      font-family: 'Source Serif 4', serif;
      font-size: .88rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .2s;
      border: none;
      white-space: nowrap;
      min-height: 44px;
    }
    .cookie-btn-accept {
      background: #c9a84c;
      color: #1a2744;
    }
    .cookie-btn-accept:hover {
      background: #e8c97a;
    }
    .cookie-btn-necessary {
      background: rgba(255,255,255,.1);
      color: rgba(255,255,255,.8);
      border: 1px solid rgba(255,255,255,.2);
    }
    .cookie-btn-necessary:hover {
      background: rgba(255,255,255,.18);
    }
  `;
  document.head.appendChild(style);

  // ── INJECT HTML ──
  var banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.id = 'cookieBanner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Zgoda na cookies');
  banner.innerHTML = `
    <div class="cookie-banner-inner">
      <div class="cookie-text">
        🍪 <strong>Szanujemy Twoją prywatność.</strong>
        Używamy plików cookies i technologii localStorage, aby zapewnić prawidłowe działanie strony
        (m.in. logowanie, zapamiętywanie preferencji). Wykorzystujemy również cookies analityczne
        (Google Analytics) do poprawy jakości serwisu.
        Więcej informacji znajdziesz w naszej
        <a href="/polityka-prywatnosci">Polityce Prywatności</a>.
      </div>
      <div class="cookie-buttons">
        <button type="button" class="cookie-btn cookie-btn-accept" id="cookieAcceptAll">Akceptuję wszystkie</button>
        <button type="button" class="cookie-btn cookie-btn-necessary" id="cookieNecessary">Tylko niezbędne</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  // ── LOGIKA ──
  document.getElementById('cookieAcceptAll').addEventListener('click', function () {
    setConsent('all');
    closeBanner();
    loadAnalytics();
  });

  document.getElementById('cookieNecessary').addEventListener('click', function () {
    setConsent('necessary');
    closeBanner();
  });

  function closeBanner() {
    var b = document.getElementById('cookieBanner');
    if (b) {
      b.style.animation = 'cookieSlideUp .3s ease reverse forwards';
      setTimeout(function () { b.remove(); }, 300);
    }
  }

})();
