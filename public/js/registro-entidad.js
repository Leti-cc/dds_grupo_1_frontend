const form = document.querySelector('#entity-register-form');
if (form) {
  const panels = [...form.querySelectorAll('[data-register-step]')];
  const labels = [...document.querySelectorAll('[data-step-label]')];
  const previous = form.querySelector('[data-register-prev]');
  const next = form.querySelector('[data-register-next]');
  const submit = form.querySelector('[data-register-submit]');
  let current = 1;

  function showStep(step) {
    current = step;
    panels.forEach((panel) => { panel.hidden = Number(panel.dataset.registerStep) !== step; });
    labels.forEach((label) => {
      const number = Number(label.dataset.stepLabel);
      label.classList.toggle('is-current', number === step);
      label.classList.toggle('is-complete', number < step);
      if (number === step) label.setAttribute('aria-current', 'step');
      else label.removeAttribute('aria-current');
    });
    previous.hidden = step === 1;
    next.hidden = step === panels.length;
    submit.hidden = step !== panels.length;
    if (step === panels.length) fillSummary();
  }

  function validateStep(step) {
    const panel = panels[step - 1];
    const invalid = [...panel.querySelectorAll('input, select')].find((input) => !input.checkValidity());
    if (!invalid) return true;
    showStep(step);
    invalid.focus();
    invalid.reportValidity();
    return false;
  }

  function fillSummary() {
    const data = new FormData(form);
    const types = { COMEDOR: 'Comedor', ESCUELARURAL: 'Escuela rural', ESPACIOTUTORIA: 'Espacio de tutoría' };
    const values = {
      razonSocial: data.get('razonSocial'),
      tipoEntidad: types[data.get('tipoEntidad')] || '',
      cuit: data.get('cuit'),
      direccion: data.get('direccion'),
      email: data.get('email'),
      representante: `${data.get('representanteNombre')} ${data.get('representanteApellido')}`.trim(),
    };
    for (const [key, value] of Object.entries(values)) {
      document.querySelector(`[data-summary="${key}"]`).textContent = value;
    }
  }

  previous.addEventListener('click', () => showStep(current - 1));
  next.addEventListener('click', () => { if (validateStep(current)) showStep(current + 1); });
  form.addEventListener('submit', (event) => {
    for (let step = 1; step < panels.length; step += 1) {
      if (!validateStep(step)) { event.preventDefault(); return; }
    }
  });
  showStep(1);
}
