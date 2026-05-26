(function () {
  const form = document.getElementById('agendar-form');
  if (!form) return;

  // =====================================================================
  // CONFIG — endpoint do Formspree
  // =====================================================================
  // 1. https://formspree.io → conta grátis
  // 2. New form → modo AJAX
  // 3. Confirme o e-mail de destino (contato@heyteacher.com.br)
  // 4. Copie o endpoint (formato https://formspree.io/f/abcd1234) e cole abaixo
  // Enquanto vazio, o submit cai num fallback que abre o cliente de e-mail
  // do usuário com os dados pré-preenchidos.
  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xbdbzobp';
  // =====================================================================

  const phoneInput = form.querySelector('#f-whatsapp');
  const errorEl = form.querySelector('.form-status-error');
  const successEl = document.querySelector('.form-success');
  const submitBtn = form.querySelector('button[type="submit"]');

  // ===== Pré-seleção de plano via ?plano=Essencial|Acelerador|Intensivo =====
  try {
    const params = new URLSearchParams(window.location.search);
    const planoParam = params.get('plano');
    if (planoParam) {
      const planoSelect = form.querySelector('#f-plano');
      if (planoSelect) {
        const match = Array.from(planoSelect.options).find(
          (opt) => opt.value === planoParam
        );
        if (match) planoSelect.value = planoParam;
      }
    }
  } catch (_) { /* noop */ }

  // ===== Captura de UTMs e referrer =====
  try {
    const params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => {
      const v = params.get(key);
      if (v) {
        const input = form.querySelector('input[name="' + key + '"]');
        if (input) input.value = v.slice(0, 200);
      }
    });
    // Persiste em sessionStorage para sobreviver à navegação interna
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => {
      const input = form.querySelector('input[name="' + key + '"]');
      if (!input) return;
      if (input.value) {
        sessionStorage.setItem('ht_' + key, input.value);
      } else {
        const saved = sessionStorage.getItem('ht_' + key);
        if (saved) input.value = saved;
      }
    });
    const refInput = form.querySelector('input[name="referrer"]');
    if (refInput) refInput.value = (document.referrer || '').slice(0, 300);
  } catch (_) { /* noop */ }

  // ===== Máscara de telefone BR =====
  if (phoneInput) {
    const applyMask = (v) => {
      v = v.replace(/\D/g, '').slice(0, 11);
      if (v.length > 10) return v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
      if (v.length > 6)  return v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
      if (v.length > 2)  return v.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
      if (v.length > 0)  return v.replace(/^(\d{0,2}).*/, '($1');
      return '';
    };
    phoneInput.addEventListener('input', () => {
      phoneInput.value = applyMask(phoneInput.value);
    });
  }

  // ===== Contador de caracteres do textarea =====
  const descricaoEl = form.querySelector('#f-descricao');
  const charCountEl = form.querySelector('[data-char-count]');
  if (descricaoEl && charCountEl) {
    const max = parseInt(descricaoEl.getAttribute('maxlength'), 10) || 500;
    const updateCount = () => {
      const len = descricaoEl.value.length;
      charCountEl.textContent = len;
      const counter = charCountEl.parentElement;
      if (counter) counter.classList.toggle('is-near-limit', len >= max * 0.9);
    };
    descricaoEl.addEventListener('input', updateCount);
    updateCount();
  }

  // ===== Helpers de erro inline =====
  const showError = (fieldName, message, anchorEl) => {
    const small = form.querySelector('[data-error-for="' + fieldName + '"]');
    if (small) { small.textContent = message; small.hidden = false; }
    if (anchorEl) anchorEl.setAttribute('aria-invalid', 'true');
  };
  const clearError = (fieldName, anchorEl) => {
    const small = form.querySelector('[data-error-for="' + fieldName + '"]');
    if (small) { small.textContent = ''; small.hidden = true; }
    if (anchorEl) anchorEl.removeAttribute('aria-invalid');
  };

  // ===== Validação amigável =====
  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  const validate = () => {
    let firstInvalid = null;

    // Nome
    const nomeEl = form.querySelector('#f-nome');
    if (!nomeEl.value.trim()) {
      showError('nome', 'Como posso te chamar?', nomeEl);
      firstInvalid = firstInvalid || nomeEl;
    } else {
      clearError('nome', nomeEl);
    }

    // E-mail
    const emailEl = form.querySelector('#f-email');
    const emailVal = emailEl.value.trim();
    if (!emailVal) {
      showError('email', 'Coloca seu e-mail aqui.', emailEl);
      firstInvalid = firstInvalid || emailEl;
    } else if (!isValidEmail(emailVal)) {
      showError('email', 'Esse e-mail não parece válido.', emailEl);
      firstInvalid = firstInvalid || emailEl;
    } else {
      clearError('email', emailEl);
    }

    // WhatsApp (11 dígitos)
    const phoneDigits = (phoneInput.value || '').replace(/\D/g, '');
    if (!phoneDigits) {
      showError('whatsapp', 'Coloca seu WhatsApp aqui.', phoneInput);
      firstInvalid = firstInvalid || phoneInput;
    } else if (phoneDigits.length < 11) {
      showError(
        'whatsapp',
        phoneDigits.length < 10
          ? 'Falta o DDD no número.'
          : 'Falta um dígito (DDD + 9 dígitos).',
        phoneInput
      );
      firstInvalid = firstInvalid || phoneInput;
    } else {
      clearError('whatsapp', phoneInput);
    }

    // Nível (select obrigatório)
    const nivelEl = form.querySelector('#f-nivel');
    if (!nivelEl.value) {
      showError('nivel', 'Escolhe seu nível atual.', nivelEl);
      firstInvalid = firstInvalid || nivelEl;
    } else {
      clearError('nivel', nivelEl);
    }

    // LGPD (obrigatório)
    const lgpdEl = form.querySelector('input[name="consent_lgpd"]');
    if (!lgpdEl.checked) {
      showError(
        'consent_lgpd',
        'Preciso da sua autorização pra entrar em contato.',
        lgpdEl
      );
      firstInvalid = firstInvalid || lgpdEl;
    } else {
      clearError('consent_lgpd', lgpdEl);
    }

    return firstInvalid;
  };

  // ===== Limpa erro ao interagir =====
  const liveClear = (selector, fieldName) => {
    const el = form.querySelector(selector);
    if (!el) return;
    el.addEventListener('input', () => clearError(fieldName, el));
    el.addEventListener('change', () => clearError(fieldName, el));
  };
  liveClear('#f-nome', 'nome');
  liveClear('#f-email', 'email');
  liveClear('#f-whatsapp', 'whatsapp');
  liveClear('#f-nivel', 'nivel');
  const lgpd = form.querySelector('input[name="consent_lgpd"]');
  if (lgpd) lgpd.addEventListener('change', (e) => clearError('consent_lgpd', e.target));

  // ===== Reúne dados =====
  const buildPayload = () => {
    const data = new FormData(form);
    data.append('_subject', 'Nova aula diagnóstica — ' + (data.get('nome') || 'sem nome'));
    return data;
  };

  // ===== Fallback mailto enquanto Formspree não está configurado =====
  const submitViaMailto = (data) => {
    const lines = [];
    for (const [k, v] of data.entries()) {
      if (k.startsWith('_') || !v) continue;
      const label = k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
      lines.push(label + ': ' + v);
    }
    const subject = encodeURIComponent('Nova aula diagnóstica — ' + (data.get('nome') || ''));
    const body = encodeURIComponent(lines.join('\n'));
    window.location.href =
      'mailto:contato@heyteacher.com.br?subject=' + subject + '&body=' + body;
  };

  // ===== Submit =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const firstInvalid = validate();
    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: false });
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const data = buildPayload();

    // Honeypot — se foi preenchido, é bot. Fingimos sucesso e abortamos.
    if (data.get('_gotcha')) {
      form.hidden = true;
      if (successEl) successEl.hidden = false;
      return;
    }

    if (!FORMSPREE_ENDPOINT) {
      submitViaMailto(data);
      return;
    }

    form.classList.add('is-submitting');
    submitBtn.disabled = true;

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      form.hidden = true;
      if (successEl) {
        successEl.hidden = false;
        successEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      errorEl.hidden = false;
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.classList.remove('is-submitting');
      submitBtn.disabled = false;
    }
  });
})();
