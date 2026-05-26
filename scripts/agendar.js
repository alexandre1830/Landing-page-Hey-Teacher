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

  // ===== Pré-seleção de plano via ?plano=Essencial|Acelerador|Intensivo|Duplas%20ou%20Fam%C3%ADlias =====
  try {
    const params = new URLSearchParams(window.location.search);
    const planoParam = params.get('plano');
    if (planoParam) {
      const radio = form.querySelector(
        'input[name="plano"][value="' + planoParam.replace(/"/g, '\\"') + '"]'
      );
      if (radio) radio.checked = true;
    }
  } catch (_) { /* noop */ }

  // ===== Captura de UTMs e referrer (sessão atual) =====
  try {
    const params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => {
      const v = params.get(key);
      if (v) {
        const input = form.querySelector('input[name="' + key + '"]');
        if (input) input.value = v.slice(0, 200); // limita tamanho
      }
    });
    // Persiste em sessionStorage para sobreviver à navegação interna no site
    const stored = {};
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
      if (v.length > 10) {
        return v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
      }
      if (v.length > 6) {
        return v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
      }
      if (v.length > 2) {
        return v.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
      }
      if (v.length > 0) {
        return v.replace(/^(\d{0,2}).*/, '($1');
      }
      return '';
    };
    phoneInput.addEventListener('input', () => {
      phoneInput.value = applyMask(phoneInput.value);
    });
  }

  // ===== Helpers de erro inline =====
  const showError = (fieldName, message, anchorEl) => {
    const small = form.querySelector('[data-error-for="' + fieldName + '"]');
    if (small) {
      small.textContent = message;
      small.hidden = false;
    }
    if (anchorEl) anchorEl.setAttribute('aria-invalid', 'true');
  };
  const clearError = (fieldName, anchorEl) => {
    const small = form.querySelector('[data-error-for="' + fieldName + '"]');
    if (small) {
      small.textContent = '';
      small.hidden = true;
    }
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

    // WhatsApp — exige 11 dígitos (DDD + 9)
    const phoneDigits = (phoneInput.value || '').replace(/\D/g, '');
    if (!phoneDigits) {
      showError('whatsapp', 'Coloca seu WhatsApp aqui.', phoneInput);
      firstInvalid = firstInvalid || phoneInput;
    } else if (phoneDigits.length < 11) {
      showError(
        'whatsapp',
        phoneDigits.length < 10
          ? 'Falta o DDD no número.'
          : 'Falta um dígito — celulares têm 11 números (DDD + 9 dígitos).',
        phoneInput
      );
      firstInvalid = firstInvalid || phoneInput;
    } else {
      clearError('whatsapp', phoneInput);
    }

    // E-mail
    const emailEl = form.querySelector('#f-email');
    const emailVal = emailEl.value.trim();
    if (!emailVal) {
      showError('email', 'Coloca seu e-mail aqui.', emailEl);
      firstInvalid = firstInvalid || emailEl;
    } else if (!isValidEmail(emailVal)) {
      showError('email', 'Esse e-mail não parece válido. Confere o formato (nome@dominio.com).', emailEl);
      firstInvalid = firstInvalid || emailEl;
    } else {
      clearError('email', emailEl);
    }

    // Nível (radio obrigatório)
    const nivelChecked = form.querySelector('input[name="nivel"]:checked');
    const firstNivel = form.querySelector('input[name="nivel"]');
    if (!nivelChecked) {
      showError('nivel', 'Escolhe o seu nível atual.', null);
      firstInvalid = firstInvalid || firstNivel;
    } else {
      clearError('nivel', null);
    }

    // Objetivo (pelo menos um)
    const objetivosChecked = form.querySelectorAll('input[name="objetivo"]:checked');
    const firstObj = form.querySelector('input[name="objetivo"]');
    if (objetivosChecked.length === 0) {
      showError('objetivo', 'Marca ao menos um objetivo.', null);
      firstInvalid = firstInvalid || firstObj;
    } else {
      clearError('objetivo', null);
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
  const liveClear = (el, fieldName) => {
    el.addEventListener('input', () => clearError(fieldName, el));
    el.addEventListener('change', () => clearError(fieldName, el));
  };
  liveClear(form.querySelector('#f-nome'), 'nome');
  liveClear(form.querySelector('#f-whatsapp'), 'whatsapp');
  liveClear(form.querySelector('#f-email'), 'email');
  form.querySelectorAll('input[name="nivel"]').forEach((el) =>
    el.addEventListener('change', () => clearError('nivel', null))
  );
  form.querySelectorAll('input[name="objetivo"]').forEach((el) =>
    el.addEventListener('change', () => {
      if (form.querySelectorAll('input[name="objetivo"]:checked').length > 0) {
        clearError('objetivo', null);
      }
    })
  );
  form.querySelector('input[name="consent_lgpd"]').addEventListener('change', (e) =>
    clearError('consent_lgpd', e.target)
  );

  // ===== Reúne dados (concatena objetivos múltiplos) =====
  const buildPayload = () => {
    const data = new FormData(form);
    const objetivos = data.getAll('objetivo');
    data.delete('objetivo');
    if (objetivos.length) data.append('objetivo', objetivos.join(', '));
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

  // ===== Validação só da etapa 1 (usada pelo botão "Próximo") =====
  const validateStep1 = () => {
    let firstInvalid = null;

    const nomeEl = form.querySelector('#f-nome');
    if (!nomeEl.value.trim()) {
      showError('nome', 'Como posso te chamar?', nomeEl);
      firstInvalid = firstInvalid || nomeEl;
    } else {
      clearError('nome', nomeEl);
    }

    const phoneDigits = (phoneInput.value || '').replace(/\D/g, '');
    if (!phoneDigits) {
      showError('whatsapp', 'Coloca seu WhatsApp aqui.', phoneInput);
      firstInvalid = firstInvalid || phoneInput;
    } else if (phoneDigits.length < 11) {
      showError(
        'whatsapp',
        phoneDigits.length < 10
          ? 'Falta o DDD no número.'
          : 'Falta um dígito — celulares têm 11 números (DDD + 9 dígitos).',
        phoneInput
      );
      firstInvalid = firstInvalid || phoneInput;
    } else {
      clearError('whatsapp', phoneInput);
    }

    const emailEl = form.querySelector('#f-email');
    const emailVal = emailEl.value.trim();
    if (!emailVal) {
      showError('email', 'Coloca seu e-mail aqui.', emailEl);
      firstInvalid = firstInvalid || emailEl;
    } else if (!isValidEmail(emailVal)) {
      showError('email', 'Esse e-mail não parece válido. Confere o formato (nome@dominio.com).', emailEl);
      firstInvalid = firstInvalid || emailEl;
    } else {
      clearError('email', emailEl);
    }

    return firstInvalid;
  };

  // ===== Navegação entre etapas =====
  const steps = form.querySelectorAll('.form-step');
  const pills = document.querySelectorAll('.step-pill');
  const card = document.querySelector('.form-card');

  const goToStep = (n) => {
    steps.forEach((step) => {
      const sn = parseInt(step.dataset.step, 10);
      step.classList.toggle('is-active', sn === n);
    });
    pills.forEach((pill) => {
      const sn = parseInt(pill.dataset.step, 10);
      pill.classList.toggle('is-active', sn === n);
      pill.classList.toggle('is-done', sn < n);
    });
    if (card) {
      // Rola até o topo do card pra o usuário ver o novo cabeçalho
      const top = card.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const nextBtn = form.querySelector('[data-step-next]');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const firstInvalid = validateStep1();
      if (firstInvalid) {
        firstInvalid.focus({ preventScroll: false });
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      goToStep(2);
      // Foca no primeiro radio de "nível" pra acelerar o preenchimento
      const firstNivel = form.querySelector('input[name="nivel"]');
      if (firstNivel) firstNivel.focus({ preventScroll: true });
    });
  }

  const prevBtn = form.querySelector('[data-step-prev]');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => goToStep(1));
  }

  // ===== Submit =====
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const firstInvalid = validate();
    if (firstInvalid) {
      // Se o campo inválido está na etapa 1, volta pra etapa 1
      const stepEl = firstInvalid.closest('.form-step');
      if (stepEl && !stepEl.classList.contains('is-active')) {
        goToStep(parseInt(stepEl.dataset.step, 10) || 1);
        // Pequeno delay pro browser repintar antes do focus
        setTimeout(() => {
          firstInvalid.focus({ preventScroll: false });
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      } else {
        firstInvalid.focus({ preventScroll: false });
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
