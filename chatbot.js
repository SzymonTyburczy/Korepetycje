/* ═══════════════════════════════════════════════════════
   chatbot.js — Widget chatbota FAQ
   Dołącz do każdej strony: <script src="chatbot.js"></script>
   Wymaga: klucza API Claude (proxy przez Netlify/Vercel Functions)
   ═══════════════════════════════════════════════════════ */

(function () {

  // ── STAŁE ODPOWIEDZI FAQ (nie wymagają API) ──
  const FAQ = [
    {
      keywords: ['cena', 'cennik', 'ile kosztuje', 'koszt', 'ile płacę', 'stawka', 'zł'],
      answer: '💰 Nasze ceny zaczynają się od 100 zł/h dla matematyki podstawowej. Matura rozszerzona to 120 zł/h, a matematyka wyższa 140 zł/h. Szczegółowy cennik znajdziesz na stronie <a href="/cennik" style="color:var(--gold)">Cennik</a>.'
    },
    {
      keywords: ['kontakt', 'telefon', 'email', 'napisać', 'zadzwonić', 'whatsapp'],
      answer: '📞 Najłatwiej przez formularz na stronie <a href="/#contact" style="color:var(--gold)">Kontakt</a>. Możesz też napisać na <strong>szymontyburczy@protonmail.com</strong> lub zadzwonić: <strong>+48 789 142 398</strong>. Odpiszemy najczęściej w ciągu kilku godzin!'
    },
    {
      keywords: ['korepetytor', 'nauczyciel', 'kto uczy', 'team', 'zespół'],
      answer: '👨‍🏫 Mamy świetny zespół! Szymon Tyburczy (matematyka, informatyka, matura) oraz Adam Szymanek (matematyka, fizyka). Szczegóły na stronie <a href="/korepetytorzy" style="color:var(--gold)">Korepetytorzy</a>.'
    },
    {
      keywords: ['przedmiot', 'czego', 'co uczysz', 'matematyka', 'informatyka', 'programowanie', 'python', 'java', 'fizyka'],
      answer: '📚 Uczymy: matematyki podstawowej (kl. 4–8), matematyki licealnej i maturalnej, matematyki wyższej (analiza, algebra) oraz informatyki i programowania (Python, Java, C++, algorytmy, SQL). Więcej na stronie <a href="/#subjects" style="color:var(--gold)">Oferta</a>.'
    },
    {
      keywords: ['online', 'zoom', 'stacjonarnie', 'gdzie', 'jak', 'forma'],
      answer: '💻 Prowadzimy lekcje <strong>online przez Discord</strong> oraz <strong>stacjonarnie w Krakowie</strong>. Każda forma ma taką samą jakość — używamy tablic online, udostępniania ekranu i notatek w czasie rzeczywistym.'
    },
    {
      keywords: ['matura', 'egzamin', 'przygotowanie', 'zdać', 'wynik'],
      answer: '🎯 Specjalizujemy się w przygotowaniu do matury! Mamy <strong>100% zdawalność</strong> wśród naszych uczniów. Oferujemy intensywne kursy przedmaturalne (5 × 90 min) — możesz zacząć nawet 4–6 tygodni przed maturą. Skontaktuj się, żeby ustalić plan!'
    },
    {
      keywords: ['odwołanie', 'odwołać', 'przełożyć', 'zmienić termin', 'rezygnacja'],
      answer: '📋 Odwołanie lub zmiana terminu jest **bezpłatna** przy 24-godzinnym wyprzedzeniu. Przy krótszym terminie lekcja jest traktowana jako odbyta. Skontaktuj się jak najszybciej, a postaramy się znaleźć inne wyjście!'
    },
    {
      keywords: ['płatność', 'płacić', 'przelew', 'blik', 'faktura', 'rachunek'],
      answer: '💳 Przyjmujemy płatności **przelewem bankowym** i przez **BLIK**. Na życzenie wystawiamy fakturę. Przy pakietach możliwa jest płatność zaliczkowa lub jednorazowa — ustalamy indywidualnie.'
    },
    {
      keywords: ['rejestracja', 'konto', 'logowanie', 'zalogować', 'panel', 'dashboard'],
      answer: '🔐 Możesz założyć konto, żeby zarządzać lekcjami, widzieć historię, materiały i faktury. Wejdź na stronę <a href="login.html" style="color:var(--gold)">Logowania</a> i zarejestruj się — to zajmuje minutę!'
    },
    {
      keywords: ['pierwsza lekcja', 'zacząć', 'jak zacząć', 'start', 'konsultacja', 'gratis'],
      answer: '🎁 Pierwsza **15-minutowa konsultacja jest gratis** — bez żadnych zobowiązań! Pogadamy o Twoich celach i dopasujemy plan nauki. Napisz do nas lub użyj formularza kontaktowego. Czekamy!'
    },
  ];

  // ── INJECT CSS ──
  const style = document.createElement('style');
  style.textContent = `
    .chatbot-btn {
      position: fixed; bottom: 2rem; right: 2rem; z-index: 9000;
      width: 58px; height: 58px; border-radius: 50%;
      background: #1a2744; border: 2px solid #c9a84c;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 1.6rem;
      box-shadow: 0 4px 20px rgba(26,39,68,.35);
      transition: transform .2s, box-shadow .2s;
    }
    .chatbot-btn:hover { transform: scale(1.08); box-shadow: 0 8px 30px rgba(26,39,68,.45); }
    .chatbot-btn .cb-close { display: none; font-size: 1.2rem; color: #e8c97a; }
    .chatbot-btn.open .cb-icon { display: none; }
    .chatbot-btn.open .cb-close { display: block; }

    .chatbot-window {
      position: fixed; bottom: 5.5rem; right: 2rem; z-index: 8999;
      width: 360px; max-height: 540px;
      background: #fff; border-radius: 12px;
      box-shadow: 0 16px 60px rgba(26,39,68,.25);
      border: 1px solid #d8d0c0;
      display: flex; flex-direction: column;
      transform: translateY(12px) scale(.97); opacity: 0;
      pointer-events: none;
      transition: all .25s cubic-bezier(.4,0,.2,1);
    }
    .chatbot-window.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: all; }

    .cb-header {
      background: #1a2744;
      border-radius: 12px 12px 0 0;
      padding: 1rem 1.2rem;
      display: flex; align-items: center; gap: .8rem;
    }
    .cb-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: #c9a84c; color: #1a2744;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.2rem;
    }
    .cb-header-text .cb-name { color: #fff; font-weight: 600; font-size: .95rem; font-family: 'Playfair Display', serif; }
    .cb-header-text .cb-status { color: rgba(255,255,255,.55); font-size: .75rem; }
    .cb-online { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; display: inline-block; margin-right: .3rem; }

    .cb-messages {
      flex: 1; overflow-y: auto; padding: 1.2rem;
      display: flex; flex-direction: column; gap: .8rem;
      scroll-behavior: smooth;
    }

    .cb-msg {
      max-width: 85%;
      padding: .7rem 1rem;
      border-radius: 12px;
      font-size: .88rem;
      line-height: 1.55;
      font-family: 'Source Serif 4', Georgia, serif;
      animation: msgIn .2s ease;
    }
    @keyframes msgIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
    .cb-msg.bot { background: #f0f2f7; color: #2c2c2c; align-self: flex-start; border-bottom-left-radius: 3px; }
    .cb-msg.user { background: #1a2744; color: #fff; align-self: flex-end; border-bottom-right-radius: 3px; }
    .cb-msg.typing { background: #f0f2f7; align-self: flex-start; border-bottom-left-radius: 3px; }
    .cb-dots { display: flex; gap: 4px; padding: 4px 0; }
    .cb-dots span { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; animation: dot 1.2s infinite; }
    .cb-dots span:nth-child(2) { animation-delay: .2s; }
    .cb-dots span:nth-child(3) { animation-delay: .4s; }
    @keyframes dot { 0%,80%,100%{transform:scale(.8);opacity:.5} 40%{transform:scale(1.1);opacity:1} }

    .cb-quick {
      padding: 0 1rem .8rem;
      display: flex; flex-wrap: wrap; gap: .4rem;
    }
    .cb-q-btn {
      background: #f9f6f0; border: 1px solid #d8d0c0; border-radius: 20px;
      padding: .32rem .9rem; font-size: .78rem; cursor: pointer;
      font-family: 'Source Serif 4', serif; color: #1a2744;
      transition: background .15s, border-color .15s;
    }
    .cb-q-btn:hover { background: #f5edd8; border-color: #c9a84c; }

    .cb-input-row {
      padding: .8rem 1rem; border-top: 1px solid #d8d0c0;
      display: flex; gap: .6rem;
    }
    .cb-input {
      flex: 1; padding: .6rem .9rem;
      border: 1.5px solid #d8d0c0; border-radius: 20px;
      font-family: 'Source Serif 4', serif; font-size: .88rem;
      outline: none; color: #2c2c2c; background: #f9f6f0;
      transition: border-color .2s;
    }
    .cb-input:focus { border-color: #1a2744; background: #fff; }
    .cb-send {
      width: 36px; height: 36px; border-radius: 50%;
      background: #1a2744; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem; transition: background .2s;
    }
    .cb-send:hover { background: #243259; }

    @media(max-width:480px){
      .chatbot-window { width: calc(100vw - 2rem); right: 1rem; }
    }
  `;
  document.head.appendChild(style);

  // ── INJECT HTML ──
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button class="chatbot-btn" id="cbBtn" title="Czat z asystentem">
      <span class="cb-icon">💬</span>
      <span class="cb-close">✕</span>
    </button>
    <div class="chatbot-window" id="cbWindow">
      <div class="cb-header">
        <div class="cb-avatar">🤖</div>
        <div class="cb-header-text">
          <div class="cb-name">Asystent Tyburczy</div>
          <div class="cb-status"><span class="cb-online"></span>Online · odpowiada błyskawicznie</div>
        </div>
      </div>
      <div class="cb-messages" id="cbMessages"></div>
      <div class="cb-quick" id="cbQuick">
        <button class="cb-q-btn" onclick="cbAsk('Ile kosztują korepetycje?')">💰 Cennik</button>
        <button class="cb-q-btn" onclick="cbAsk('Jakie przedmioty oferujecie?')">📚 Przedmioty</button>
        <button class="cb-q-btn" onclick="cbAsk('Jak umówić pierwszą lekcję?')">🎁 Pierwsza lekcja</button>
        <button class="cb-q-btn" onclick="cbAsk('Czy lekcje są online?')">💻 Online/stacjonarnie</button>
        <button class="cb-q-btn" onclick="cbAsk('Kim są korepetytorzy?')">👥 Korepetytorzy</button>
      </div>
      <div class="cb-input-row">
        <input class="cb-input" id="cbInput" placeholder="Zadaj pytanie…" />
        <button class="cb-send" id="cbSend">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // ── LOGIC ──
  const btn     = document.getElementById('cbBtn');
  const win     = document.getElementById('cbWindow');
  const msgs    = document.getElementById('cbMessages');
  const input   = document.getElementById('cbInput');
  const sendBtn = document.getElementById('cbSend');

  btn.addEventListener('click', () => {
    btn.classList.toggle('open');
    win.classList.toggle('open');
    if (win.classList.contains('open') && msgs.children.length === 0) {
      addMsg('bot', 'Cześć! 👋 Jestem asystentem Korepetycji Szymon Tyburczy. Mogę odpowiedzieć na pytania o <strong>ceny, przedmioty, korepetytorów i rezerwacje</strong>. O co chcesz zapytać?');
    }
    if (win.classList.contains('open')) { input.focus(); }
  });

  function addMsg(from, html) {
    const div = document.createElement('div');
    div.className = `cb-msg ${from}`;
    div.innerHTML = html;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function addTyping() {
    const div = document.createElement('div');
    div.className = 'cb-msg typing';
    div.id = 'cbTyping';
    div.innerHTML = '<div class="cb-dots"><span></span><span></span><span></span></div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('cbTyping');
    if (t) t.remove();
  }

  function findFaqAnswer(text) {
    const t = text.toLowerCase();
    for (const item of FAQ) {
      if (item.keywords.some(k => t.includes(k))) return item.answer;
    }
    return null;
  }

  function showQuickButtons() {
    const quick = document.getElementById('cbQuick');
    if (quick) {
      quick.style.display = 'flex';
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  async function processMessage(text) {
    // 1. Najpierw sprawdź FAQ
    const faqAnswer = findFaqAnswer(text);
    if (faqAnswer) {
      addTyping();
      await delay(600);
      removeTyping();
      addMsg('bot', faqAnswer);
      showQuickButtons();
      return;
    }

    // 2. Fallback — ogólna odpowiedź
    addTyping();
    await delay(800);
    removeTyping();
    addMsg('bot', `Hmm, nie mam gotowej odpowiedzi na to pytanie 🤔 Najlepiej <a href="/#contact" style="color:#c9a84c">napisz do nas bezpośrednio</a> — odpowiemy w ciągu kilku godzin! Możesz też zadzwonić: <strong>+48 789 142 398</strong>`);
    showQuickButtons();
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('user', text);
    document.getElementById('cbQuick').style.display = 'none';
    await processMessage(text);
  }

  window.cbAsk = async function(text) {
    addMsg('user', text);
    document.getElementById('cbQuick').style.display = 'none';
    await processMessage(text);
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

})();
