const SUPABASE_URL = 'https://eahptkwvjcnixlzlyznh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MpskNH6FyBeuQmb3Y9V2Aw_7d2L9x00';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/visitor-questions`;
const BOT_URL = 'https://t.me/PortSaidSchoolLibrariesBot';
const STORAGE_KEY = 'borsaid-visitor-question-tickets-v1';
const form = document.querySelector('#visitorQuestionForm');
const questionField = document.querySelector('#visitorQuestionText');
const consentField = document.querySelector('#visitorQuestionConsent');
const honeypotField = document.querySelector('#visitorQuestionWebsite');
const statusField = document.querySelector('#visitorQuestionStatus');
const ticketList = document.querySelector('#visitorQuestionTickets');
const submitButton = document.querySelector('#visitorQuestionSubmit');

if (form && questionField && statusField && ticketList && submitButton) {
  let tickets = readTickets();
  const activePolls = new Set();

  function readTickets() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter(ticket => ticket
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticket.id || '')
        && /^[0-9a-f]{64}$/i.test(ticket.token || '')
        && typeof ticket.question === 'string')
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  function saveTickets() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tickets.slice(0, 5)));
    } catch {
      statusField.textContent = 'تعذر حفظ مفتاح هذه الصفحة في المتصفح؛ أبقِ الصفحة مفتوحة حتى ظهور الرد.';
    }
  }

  function makeTicketCard(ticket) {
    const card = document.createElement('article');
    card.className = 'visitor-ticket';
    const question = document.createElement('p');
    question.className = 'visitor-ticket-question';
    question.dir = 'auto';
    question.textContent = ticket.question;
    const state = document.createElement('p');
    state.className = ticket.reply ? 'visitor-ticket-reply' : 'visitor-ticket-pending';
    state.dir = 'auto';
    state.textContent = ticket.reply
      ? `الرد: ${ticket.reply}`
      : ticket.autoAnswered === false
        ? 'تعذّر الرد الآلي؛ وصل السؤال لفريق المكتبة عبر البوت. سيظهر الرد هنا فقط.'
        : 'جارٍ إعداد الإجابة؛ ستظهر هنا فقط لصاحب السؤال.';
    card.append(question, state);
    return card;
  }

  function renderTickets() {
    ticketList.replaceChildren();
    for (const ticket of tickets) ticketList.append(makeTicketCard(ticket));
  }

  async function pollTicket(ticket) {
    if (activePolls.has(ticket.id) || document.hidden) return;
    activePolls.add(ticket.id);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        cache: 'no-store',
        body: JSON.stringify({ action: 'poll', question_id: ticket.id, access_token: ticket.token }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok && result.answered && typeof result.reply === 'string' && result.reply !== ticket.reply) {
        ticket.reply = result.reply;
        ticket.answeredAt = result.answered_at || null;
        saveTickets();
        renderTickets();
        statusField.textContent = 'وصل رد جديد لصاحب هذا السؤال في هذه الصفحة.';
      }
    } catch {
      // A later poll can retry without exposing the ticket token in the URL.
    } finally {
      activePolls.delete(ticket.id);
    }
  }

  function pollAll() {
    for (const ticket of tickets) void pollTicket(ticket);
  }

  renderTickets();
  pollAll();
  window.setInterval(pollAll, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pollAll(); });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = questionField.value.trim();
    if (!question) {
      questionField.focus();
      return;
    }
    if (!consentField?.checked) {
      consentField?.focus();
      statusField.textContent = 'وافق على معالجة السؤال آليًا قبل الإرسال.';
      return;
    }
    submitButton.disabled = true;
    statusField.textContent = 'جارٍ إعداد إجابة خاصة من معلومات الموقع العامة…';
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
        cache: 'no-store',
        body: JSON.stringify({ action: 'submit', question, website: honeypotField?.value || '', consent: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        const messages = {
          owner_not_linked: 'خدمة الرسائل لم تكتمل تهيئتها بعد. حاول لاحقًا.',
          assistant_unavailable: 'المساعد الآلي وقناة المتابعة غير متاحين مؤقتًا. حاول لاحقًا.',
          consent_required: 'وافق على معالجة السؤال آليًا قبل الإرسال.',
          rate_limited: 'أرسلت أسئلة كثيرة خلال وقت قصير؛ انتظر قليلًا ثم حاول مجددًا.',
          notification_failed: 'تعذر إرسال السؤال الآن. لم يُسجّل السؤال؛ حاول مرة أخرى بعد قليل.',
          service_not_ready: 'خدمة الرسائل غير متاحة مؤقتًا. حاول لاحقًا.',
        };
        statusField.textContent = messages[result?.error] || 'تعذر إرسال السؤال الآن. تحقق من الاتصال وحاول مجددًا.';
        return;
      }
      if (!result.question_id || !result.access_token) {
        statusField.textContent = 'تم استلام الطلب.';
        questionField.value = '';
        return;
      }
      tickets.unshift({
        id: result.question_id,
        token: result.access_token,
        question: typeof result.question_display === 'string' ? result.question_display : question,
        reply: typeof result.reply === 'string' ? result.reply : '',
        autoAnswered: result.auto_answered !== false,
        createdAt: new Date().toISOString(),
      });
      tickets = tickets.slice(0, 5);
      saveTickets();
      renderTickets();
      questionField.value = '';
      if (consentField) consentField.checked = false;
      statusField.textContent = result.auto_answered
        ? 'أجابك المساعد تلقائيًا؛ الرد محفوظ ويظهر لك وحدك هنا.'
        : 'تعذّر الرد الآلي؛ وصل سؤالك لفريق المكتبة عبر Telegram. احتفظ بعلامة التبويب نفسها، فالرد سيظهر لك وحدك هنا.';
      const newest = tickets[0];
      if (newest) void pollTicket(newest);
    } catch {
      statusField.textContent = 'تعذر الاتصال بالخدمة. تحقق من الإنترنت وحاول مجددًا.';
    } finally {
      submitButton.disabled = false;
    }
  });

  const botLink = document.querySelector('#visitorTelegramLink');
  if (botLink) botLink.href = BOT_URL;
}
