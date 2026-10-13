const SUPABASE_URL = 'https://eahptkwvjcnixlzlyznh.supabase.co';
// Publishable key intended for browser use; never place a service-role key here.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_MpskNH6FyBeuQmb3Y9V2Aw_7d2L9x00';

const status = document.querySelector('#authStatus');
const form = document.querySelector('#passwordForm');
const submitButton = document.querySelector('#savePasswordButton');
const query = new URLSearchParams(window.location.search);
const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const hasAuthLink = query.has('code') || query.has('token_hash') || query.has('error')
  || fragment.has('access_token') || fragment.has('error');

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `auth-status${kind ? ` ${kind}` : ''}`;
}
function clearAuthUrl() {
  window.history.replaceState(null, document.title, window.location.pathname);
}
function showInvalidLink() {
  form.hidden = true;
  clearAuthUrl();
  setStatus('رابط التعيين غير صالح أو انتهت صلاحيته. ارجع إلى شاشة دخول الموظفين واطلب رابطاً جديداً.', 'error');
}

async function initialize() {
  if (query.has('error') || fragment.has('error')) return showInvalidLink();
  if (!hasAuthLink) return showInvalidLink();

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.0');
    const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true },
    });

    const tokenHash = query.get('token_hash');
    if (tokenHash) {
      const type = query.get('type');
      if (!['invite', 'recovery'].includes(type)) return showInvalidLink();
      const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) return showInvalidLink();
    }

    const { data, error } = await client.auth.getSession();
    clearAuthUrl();
    if (error || !data.session) return showInvalidLink();

    form.hidden = false;
    setStatus('تم التحقق من الرابط. اختر كلمة مرور جديدة لحسابك.');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const password = form.elements.password.value;
      const confirmation = form.elements.passwordConfirmation.value;
      if (password.length < 8) {
        setStatus('يجب ألا تقل كلمة المرور عن 8 أحرف.', 'error');
        form.elements.password.focus();
        return;
      }
      if (password !== confirmation) {
        setStatus('كلمتا المرور غير متطابقتين. راجعهما وحاول مجدداً.', 'error');
        form.elements.passwordConfirmation.focus();
        return;
      }

      submitButton.disabled = true;
      setStatus('جارٍ حفظ كلمة المرور...');
      const { error: updateError } = await client.auth.updateUser({ password });
      submitButton.disabled = false;
      if (updateError) {
        const expired = updateError.status === 401 || /expired|invalid.*token|jwt/i.test(updateError.message || '');
        setStatus(expired
          ? 'انتهت صلاحية رابطك. اطلب رابط تعيين جديداً من شاشة دخول الموظفين.'
          : 'تعذّر حفظ كلمة المرور. جرّب كلمة أطول، أو أعد طلب الرابط إذا انتهت صلاحيته.', 'error');
        return;
      }

      form.reset();
      form.hidden = true;
      setStatus('تم تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بحساب الموظف.', 'success');
    });
  } catch {
    showInvalidLink();
  }
}

void initialize();
