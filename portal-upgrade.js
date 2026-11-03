import { hasPublicAssistantAiConsent, setPublicAssistantAiConsent } from './visitor-public-ai-consent.mjs?v=f135b25f77f9d29a';

(() => {
  'use strict';
  if (typeof document === 'undefined') return;

  const actions = [
    { key: 'paper', icon: '▤', title: 'الكتب الورقية', text: 'فهرس الكتب الموجودة بالفروع ومكان الرف والإتاحة.', target: 'discoverTab' },
    { key: 'digital', icon: '▥', title: 'الكتب الرقمية', text: 'قراءة المصادر المفتوحة والكتب المتاحة أونلاين.', target: 'globalReadingTab' },
    { key: 'news', icon: '✦', title: 'الإعلانات والمسابقات', text: 'آخر أخبار المكتبة والفعاليات والمسابقات الطلابية.', target: 'announcementsTab' },
    { key: 'visitors', icon: '؟', title: 'الزائرون', text: 'ترحيب بالزائر وإرشاده إلى المساعد الذكي.', target: 'headerVisitorChatShortcut' },
    { key: 'support', icon: 'م', title: 'الدعم الفني الذكي', text: 'إجابة إرشادية عن استخدام الموقع والكتب واللوحة.', target: 'headerVisitorChatShortcut' },
    { key: 'control', icon: '⚙', title: 'لوحة التحكم', text: 'إدارة المدرسة والقيادات والوسائط بصلاحيات آمنة.', target: 'staffOpen' },
  ];

  const css = `
    .portal-upgrade-dock{width:min(1180px,calc(100% - 48px));margin:18px auto 0;padding:18px;border:1px solid #e6eaf2;border-radius:22px;background:linear-gradient(135deg,#fbfcff 0%,#f4f7ff 100%);box-shadow:0 14px 34px rgba(30,55,105,.07)}
    .portal-upgrade-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:14px}.portal-upgrade-head h2{margin:4px 0 0;font-size:clamp(20px,2.2vw,28px);color:#182744}.portal-upgrade-head p{margin:0;color:#66758f;font-size:13px}.portal-upgrade-badge{display:inline-flex;align-items:center;gap:7px;color:#23845a;font-size:12px;font-weight:700}.portal-upgrade-badge i{width:8px;height:8px;border-radius:50%;background:#55b782;box-shadow:0 0 0 4px rgba(85,183,130,.14)}
    .portal-upgrade-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.portal-upgrade-card{border:1px solid #e5e9f1;background:#fff;border-radius:15px;padding:14px 12px;text-align:right;min-height:138px;display:flex;flex-direction:column;align-items:flex-start;transition:transform .18s,box-shadow .18s,border-color .18s}.portal-upgrade-card:hover{transform:translateY(-3px);border-color:#b9c8ef;box-shadow:0 12px 24px rgba(36,73,173,.11)}.portal-upgrade-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#edf2ff;color:#385dcc;font-size:18px;font-weight:700;margin-bottom:10px}.portal-upgrade-card:nth-child(2n) .portal-upgrade-icon{background:#fff0f0;color:#db5864}.portal-upgrade-card:nth-child(3n) .portal-upgrade-icon{background:#fff9e7;color:#b88412}.portal-upgrade-card strong{font-size:13px;color:#263858}.portal-upgrade-card span{display:block;margin-top:4px;color:#78859a;font-size:10px;line-height:1.65}.portal-upgrade-card button{margin-top:auto;border:0;background:transparent;color:#385dcc;padding:6px 0 0;font-size:11px;font-weight:700}.portal-upgrade-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid #e8edf4;color:#6d7b91;font-size:11px}.portal-upgrade-foot strong{color:#182744}.portal-upgrade-security{color:#23845a}
    .portal-programs{width:min(1180px,calc(100% - 48px));margin:30px auto 0;display:grid;grid-template-columns:1.15fr .85fr;gap:16px}.portal-program-card{border-radius:20px;padding:22px;background:#182744;color:#fff;position:relative;overflow:hidden}.portal-program-card:after{content:'✦';position:absolute;left:25px;bottom:-18px;font-size:100px;color:rgba(255,255,255,.06)}.portal-program-card.alt{background:#fff9e7;color:#4d3b10;border:1px solid #f2df9c}.portal-program-card h3{margin:0 0 5px;font-size:19px}.portal-program-card p{margin:0;color:rgba(255,255,255,.75);font-size:12px;max-width:620px}.portal-program-card.alt p{color:#79632c}.portal-program-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}.portal-program-links button{border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.1);color:#fff;border-radius:9px;padding:8px 11px;font-size:11px;font-weight:700}.portal-program-card.alt .portal-program-links button{border-color:#dfc66f;background:#fff;color:#6c5310}.portal-upgrade-dialog-note{margin-top:12px;padding:10px 12px;border-radius:10px;background:#f7f9fd;color:#66758f;font-size:11px}
    #visitorChatDialog .visitor-support{margin:0;border:0;border-top:1px solid #e5eaf2;border-radius:0;background:transparent;box-shadow:none;padding:22px 0 0;display:block}
    #visitorChatDialog .visitor-support-copy{margin-bottom:14px}
    #visitorChatDialog .visitor-support-copy h2{font-size:20px}
    #visitorChatDialog .visitor-question-form{margin-top:14px}
    .portal-provider-strip{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 14px}.portal-provider-strip span{border:1px solid #dce5f3;border-radius:999px;padding:5px 9px;background:#fff;color:#566783;font-size:10px}.portal-provider-strip span:first-child{border-color:#b9d8c6;color:#28734c;background:#f1fbf4}
    .visitor-assistant-persistent-consent{display:flex;align-items:flex-start;gap:9px;margin:12px 0 4px;padding:11px 12px;border:1px solid #c9d9cc;border-radius:12px;background:#f4fbf5;color:#344b3a;font-size:12px;line-height:1.7}.visitor-assistant-persistent-consent input{flex:0 0 auto;margin-top:4px;accent-color:#28734c}.visitor-assistant-persistent-consent input:focus-visible{outline:3px solid rgba(40,116,76,.35);outline-offset:2px}.visitor-assistant-consent-status{min-height:1.5em;margin:4px 2px;color:#526b5a;font-size:11px;line-height:1.6}
    @media(max-width:1000px){.portal-upgrade-grid{grid-template-columns:repeat(3,1fr)}.portal-programs{grid-template-columns:1fr 1fr}}
    @media(max-width:620px){.portal-upgrade-dock,.portal-programs{width:calc(100% - 28px)}.portal-upgrade-head{display:block}.portal-upgrade-badge{margin-top:8px}.portal-upgrade-grid{grid-template-columns:repeat(2,1fr)}.portal-programs{grid-template-columns:1fr}.portal-upgrade-card{min-height:130px}.portal-upgrade-foot{display:block}.portal-upgrade-foot span{display:block;margin-top:5px}}
  `;

  function clickTarget(id) {
    const element = document.getElementById(id);
    if (!element) return;
    element.click();
    if (id === 'headerVisitorChatShortcut') {
      const dialog = document.getElementById('visitorChatDialog');
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    }
  }

  function init() {
    if (document.getElementById('portalUpgradeDock')) return;
    const style = document.createElement('style');
    style.id = 'portalUpgradeStyles';
    style.textContent = css;
    document.head.appendChild(style);

    const dock = document.createElement('section');
    dock.id = 'portalUpgradeDock';
    dock.className = 'portal-upgrade-dock';
    dock.setAttribute('aria-labelledby', 'portalUpgradeTitle');
    dock.innerHTML = `
      <div class="portal-upgrade-head">
        <div><span class="eyebrow">مسارات المكتبة الجديدة</span><h2 id="portalUpgradeTitle">كل ما تحتاجه في مكان واحد</h2><p>وصول سريع للكتب والخدمات والإعلانات ولوحة الإدارة.</p></div>
        <span class="portal-upgrade-badge"><i aria-hidden="true"></i> يعمل مع نظام المكتبة الحالي</span>
      </div>
      <div class="portal-upgrade-grid">${actions.map((item) => `<article class="portal-upgrade-card" data-upgrade-key="${item.key}"><span class="portal-upgrade-icon" aria-hidden="true">${item.icon}</span><strong>${item.title}</strong><span>${item.text}</span><button type="button" data-upgrade-target="${item.target}">فتح القسم ←</button></article>`).join('')}</div>
      <div class="portal-upgrade-foot"><span><strong>حقوق الموقع محفوظة باسم محمد حامد</strong> · مكتبة مدرسية رقمية لخدمة الطلاب والزائرين</span><span class="portal-upgrade-security">تسجيل آمن عبر صلاحيات Supabase</span></div>
    `;
    const tabs = document.getElementById('visitorTabs');
    tabs?.insertAdjacentElement('afterend', dock);

    const programs = document.createElement('section');
    programs.id = 'portalPrograms';
    programs.className = 'portal-programs';
    programs.innerHTML = `
      <article class="portal-program-card"><span class="eyebrow eyebrow-light">إعلانات ومسابقات المدرسة</span><h3>شارك، اقرأ، واكتشف موهبتك</h3><p>مساحة جاهزة لإعلانات المكتبة والمسابقات والأنشطة الورقية والرقمية. تُربط لاحقًا ببيانات الإعلانات من لوحة التحكم.</p><div class="portal-program-links"><button type="button" data-upgrade-target="announcementsTab">مشاهدة الإعلانات</button><button type="button" data-upgrade-target="educationResearchTab">أخبار وأبحاث</button></div></article>
      <article class="portal-program-card alt"><span class="eyebrow">ترحيب بالزائر</span><h3>اسأل المساعد الذكي</h3><p>اكتب سؤالك عن البحث أو القراءة أو استخدام الموقع، وسيقودك المساعد إلى القسم المناسب.</p><div class="portal-program-links"><button type="button" data-upgrade-target="headerVisitorChatShortcut">ابدأ الحوار</button></div></article>
    `;
    document.getElementById('homeView')?.querySelector('.portal-hero')?.insertAdjacentElement('afterend', programs);

    const dialog = document.getElementById('visitorChatDialog');
    const questions = document.getElementById('visitorQuestions');
    const assistant = document.getElementById('visitorAssistant');
    const consentToggle = document.getElementById('visitorAssistantPersistentConsent');
    const consentStatus = document.getElementById('visitorAssistantConsentStatus');
    if (consentToggle && !consentToggle.dataset.bound) {
      consentToggle.checked = hasPublicAssistantAiConsent();
      consentStatus.textContent = consentToggle.checked
        ? 'الموافقة محفوظة على هذا الجهاز؛ يمكنك إلغاؤها بإزالة العلامة.'
        : 'الموافقة غير مفعّلة؛ لن يُرسل السؤال إلى نموذج خارجي دون إذنك.';
      consentToggle.addEventListener('change', () => {
        const result = setPublicAssistantAiConsent(consentToggle.checked);
        consentStatus.textContent = consentToggle.checked
          ? result.persisted
            ? 'حُفظت الموافقة على هذا الجهاز؛ يمكنك إلغاؤها بإزالة العلامة.'
            : 'تعذر حفظ الاختيار في المتصفح؛ ستبقى الموافقة فعّالة حتى إغلاق الصفحة.'
          : 'أُلغيت الموافقة؛ لن تُرسل الأسئلة التالية إلى Qwen عبر Groq إلا بعد موافقة جديدة.';
      });
      consentToggle.dataset.bound = 'true';
    }
    if (dialog && questions && assistant && !dialog.contains(questions)) {
      const strip = document.createElement('div');
      strip.className = 'portal-provider-strip';
      strip.innerHTML = '<span>Qwen عبر Groq · الخطة المجانية فقط</span><span>موافقة محفوظة لهذا الجهاز وقابلة للإلغاء</span><span>إجابة محلية عند غياب الإعداد أو الموافقة</span><span>Telegram · متابعة المالك في مسار السؤال</span>';
      assistant.insertAdjacentElement('afterend', strip);
      dialog.appendChild(questions);
      const title = dialog.querySelector('#visitorChatDialogTitle');
      if (title) title.textContent = 'المساعد الذكي';
      const eyebrow = assistant.querySelector('.visitor-assistant-copy .eyebrow');
      if (eyebrow) eyebrow.textContent = 'المساعد الذكي · معلومات عامة منشورة';
      const assistantTitle = assistant.querySelector('.visitor-assistant-copy h2');
      if (assistantTitle) assistantTitle.textContent = 'اسأل عن الموقع أو كتاب منشور';
      const assistantCopy = assistant.querySelector('.visitor-assistant-copy > p');
      if (assistantCopy) assistantCopy.textContent = 'يجيب الموقع محليًا من المعلومات العامة المنشورة. يمكنك حفظ موافقتك على هذا الجهاز لإرسال الأسئلة العامة إلى Qwen عبر Groq دون تأكيد منفصل لكل سؤال.';
      const assistantNotice = assistant.querySelector('#visitorAssistantPrivacy');
      if (assistantNotice) assistantNotice.textContent = 'لا تُدخل بيانات شخصية أو سرية؛ قد لا تلتقط حواجز الخصوصية كل الحالات. لا يُرسل السؤال إلى Qwen عبر Groq إلا عند تفعيل الموافقة المحفوظة على هذا الجهاز وتوافر إعداد الخطة المجانية. تُحفظ الموافقة محليًا في هذا المتصفح فقط، ويمكن إلغاؤها بإزالة العلامة. لا تُحفظ هذه المحادثة في قاعدة البيانات ولا تُرسل عبر Telegram.';
      const questionTitle = questions.querySelector('.visitor-support-copy h2');
      if (questionTitle) questionTitle.textContent = 'أرسل سؤالًا للمساعد الذكي أو اطلب متابعة المكتبة';
      questions.querySelector('.visitor-telegram-link')?.setAttribute('aria-label', 'فتح قناة Telegram للمساعد الموحد');
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-upgrade-target]');
      if (button) clickTarget(button.dataset.upgradeTarget);
    });

    const staffOpen = document.getElementById('staffOpen');
    if (staffOpen && !document.getElementById('portalUpgradeSecurityNote')) {
      const note = document.createElement('p');
      note.id = 'portalUpgradeSecurityNote';
      note.className = 'portal-upgrade-dialog-note';
      note.textContent = 'لوحة التحكم تستخدم دخول الموظفين والصلاحيات الآمنة الموجودة في المشروع. لا تُحفظ كلمات مرور ثابتة داخل ملفات الموقع.';
      document.getElementById('staffDialog')?.querySelector('.dialog-header')?.insertAdjacentElement('afterend', note);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
