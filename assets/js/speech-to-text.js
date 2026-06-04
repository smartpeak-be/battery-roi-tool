const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

let activeSession = null;
let modalEl = null;

export function isSpeechToTextSupported() {
  return Boolean(SpeechRecognitionCtor);
}

export function attachSpeechToText(textarea, opts = {}) {
  if (!textarea || !isSpeechToTextSupported()) return false;
  if (textarea.dataset.speechToTextWired === '1') return true;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = opts.className || 'btn btn-outline-secondary sp-speech-btn';
  button.title = opts.title || 'Dicteren in het Nederlands';
  button.setAttribute('aria-label', opts.ariaLabel || button.title);
  button.innerHTML = '<i class="fa-solid fa-microphone" aria-hidden="true"></i>';

  const insertAfter = textarea.nextSibling;
  textarea.parentNode.insertBefore(button, insertAfter);
  textarea.dataset.speechToTextWired = '1';

  const setRecording = (isRecording) => {
    button.classList.toggle('recording', isRecording);
    button.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
    button.title = isRecording ? 'Dicteren stoppen' : (opts.title || 'Dicteren in het Nederlands');
    button.innerHTML = isRecording
      ? '<i class="fa-solid fa-stop" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-microphone" aria-hidden="true"></i>';
  };

  button.addEventListener('click', () => {
    if (activeSession) {
      if (activeSession.textarea === textarea) return;
      closeDictation({ append: false });
    }
    openDictation(textarea, opts, setRecording);
  });

  return true;
}

function openDictation(textarea, opts, setRecording) {
  const modal = ensureModal();
  const state = {
    textarea,
    recognition: null,
    setRecording,
    finalText: '',
    interimText: '',
    opts,
    isClosing: false,
    isListening: false,
    heardSpeech: false,
    keepAliveUntil: 0,
    restartTimer: null,
  };
  activeSession = state;
  resetModal(modal, opts);
  modal.classList.add('open');
  modal.querySelector('[data-speech-cancel]').focus();
  startListening(state);
}

function startListening(state) {
  if (state.isListening) return;
  clearRestartTimer(state);
  const modal = ensureModal();
  const previousRecognition = state.recognition;
  if (previousRecognition) {
    try {
      previousRecognition.abort();
    } catch (_) {
      // Old recognition instance may already be closed.
    }
  }
  state.recognition = new SpeechRecognitionCtor();
  state.isListening = true;
  state.isClosing = false;
  state.setRecording(true);
  modal.classList.add('recording');
  modal.querySelector('[data-speech-resume]').classList.add('d-none');
  modal.querySelector('[data-speech-status]').textContent = state.heardSpeech
    ? 'Verder aan het luisteren...'
    : 'Luisteren naar Nederlands...';

  configureRecognition(state);

  try {
    state.recognition.start();
  } catch (err) {
    state.isListening = false;
    state.setRecording(false);
    modal.classList.remove('recording');
    state.textarea.dispatchEvent(new CustomEvent('speech-to-text-error', {
      bubbles: true,
      detail: {
        error: err && err.name ? err.name : 'start-failed',
        message: 'Dicteren kon niet gestart worden.',
      },
    }));
  }
}

function shouldHandleRecognitionEvent(active, state, recognition) {
  return active === state && state.recognition === recognition;
}

function isCurrentRecognition(state, recognition) {
  return shouldHandleRecognitionEvent(activeSession, state, recognition);
}

export const __speechToTextTest = {
  shouldHandleRecognitionEvent,
};

function configureRecognition(state) {
  const recognition = state.recognition;
  const modal = ensureModal();
  recognition.lang = state.opts.lang || 'nl-BE';
  recognition.continuous = state.opts.continuous !== undefined ? state.opts.continuous : true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('start', () => {
    if (!isCurrentRecognition(state, recognition)) return;
    modal.querySelector('[data-speech-status]').textContent = state.heardSpeech
      ? 'Verder aan het luisteren...'
      : 'Browser luistert. Begin te spreken...';
  });

  recognition.addEventListener('speechstart', () => {
    if (!isCurrentRecognition(state, recognition)) return;
    modal.querySelector('[data-speech-status]').textContent = 'Spraak gedetecteerd...';
    state.keepAliveUntil = Date.now() + 10000;
  });

  recognition.addEventListener('result', (event) => {
    if (!isCurrentRecognition(state, recognition)) return;
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result && result[0] ? result[0].transcript.trim() : '';
      if (!transcript) continue;
      if (result.isFinal) {
        state.finalText = joinSpeechText(state.finalText, transcript);
      } else {
        interim = joinSpeechText(interim, transcript);
      }
    }
    state.interimText = interim;
    state.heardSpeech = Boolean(state.finalText || state.interimText);
    state.keepAliveUntil = Date.now() + 10000;
    renderModalTranscript(state);
  });

  recognition.addEventListener('end', () => {
    if (!isCurrentRecognition(state, recognition)) return;
    state.isListening = false;
    state.setRecording(false);
    modal.classList.remove('recording');
    if (state.isClosing) return;

    if (state.heardSpeech && Date.now() < state.keepAliveUntil) {
      const remaining = Math.max(1, Math.ceil((state.keepAliveUntil - Date.now()) / 1000));
      modal.querySelector('[data-speech-status]').textContent = `Stilte gedetecteerd. We blijven nog ${remaining}s luisteren...`;
      state.restartTimer = setTimeout(() => startListening(state), 250);
      return;
    }

    modal.querySelector('[data-speech-status]').textContent = state.finalText || state.interimText
      ? 'Opname gestopt. Klik op "Verder luisteren" om aan te vullen.'
      : 'Opname gestopt zonder tekst. Klik op "Verder luisteren" om opnieuw te proberen.';
    modal.querySelector('[data-speech-resume]').classList.remove('d-none');
  });

  recognition.addEventListener('error', (event) => {
    if (!isCurrentRecognition(state, recognition)) return;
    if (event.error === 'no-speech' && state.heardSpeech && Date.now() < state.keepAliveUntil) return;
    const message = speechErrorMessage(event.error);
    modal.querySelector('[data-speech-status]').textContent = message;
    state.textarea.dispatchEvent(new CustomEvent('speech-to-text-error', {
      bubbles: true,
      detail: { error: event.error, message },
    }));
  });
}

function ensureModal() {
  if (modalEl) return modalEl;
  modalEl = document.createElement('div');
  modalEl.className = 'sp-speech-modal';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'spSpeechTitle');
  modalEl.innerHTML = `
    <div class="sp-speech-dialog">
      <div class="sp-speech-header">
        <div>
          <h5 class="mb-1" id="spSpeechTitle">Dicteren</h5>
          <div class="text-muted small" data-speech-status>Luisteren naar Nederlands...</div>
        </div>
        <button type="button" class="btn-close" aria-label="Annuleren" data-speech-cancel></button>
      </div>
      <div class="sp-speech-body">
        <div class="sp-speech-wave" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
        </div>
        <div class="sp-speech-preview" data-speech-preview>Begin te spreken...</div>
      </div>
      <div class="sp-speech-actions">
        <button type="button" class="btn btn-outline-secondary" data-speech-cancel>Annuleren</button>
        <button type="button" class="btn btn-outline-primary d-none" data-speech-resume>
          <i class="fa-solid fa-microphone me-1" aria-hidden="true"></i> Verder luisteren
        </button>
        <button type="button" class="btn btn-primary" data-speech-submit>
          <i class="fa-solid fa-paper-plane me-1" aria-hidden="true"></i> Versturen
        </button>
      </div>
    </div>
  `;
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl || e.target.closest('[data-speech-cancel]')) {
      closeDictation({ append: false });
      return;
    }
    if (e.target.closest('[data-speech-submit]')) {
      closeDictation({ append: true });
      return;
    }
    if (e.target.closest('[data-speech-resume]') && activeSession) {
      startListening(activeSession);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeSession) closeDictation({ append: false });
  });
  document.body.appendChild(modalEl);
  return modalEl;
}

function resetModal(modal, opts) {
  modal.classList.add('recording');
  modal.querySelector('#spSpeechTitle').textContent = opts.modalTitle || 'Dicteren';
  modal.querySelector('[data-speech-status]').textContent = 'Luisteren naar Nederlands...';
  modal.querySelector('[data-speech-preview]').textContent = 'Begin te spreken...';
  modal.querySelector('[data-speech-resume]').classList.add('d-none');
}

function renderModalTranscript(state) {
  const text = joinSpeechText(state.finalText, state.interimText);
  modalEl.querySelector('[data-speech-preview]').textContent = text || 'Begin te spreken...';
  modalEl.querySelector('[data-speech-status]').textContent = text
    ? 'Aan het opnemen...'
    : 'Luisteren naar Nederlands...';
}

function closeDictation({ append }) {
  const session = activeSession;
  if (!session) return;
  session.isClosing = true;
  activeSession = null;
  clearRestartTimer(session);
  try {
    if (session.recognition) session.recognition.stop();
  } catch (_) {
    // Some browsers throw when stop() is called after recognition already ended.
  }
  session.setRecording(false);
  if (modalEl) modalEl.classList.remove('open', 'recording');

  if (append) {
    appendTranscript(session.textarea, joinSpeechText(session.finalText, session.interimText));
  }
}

function clearRestartTimer(state) {
  if (!state.restartTimer) return;
  clearTimeout(state.restartTimer);
  state.restartTimer = null;
}

function joinSpeechText(...parts) {
  return parts
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function appendTranscript(textarea, transcript) {
  const clean = String(transcript || '').trim();
  if (!clean) return;

  const current = textarea.value || '';
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  const nextValue = current + separator + clean;
  const maxLength = textarea.maxLength > 0 ? textarea.maxLength : null;
  textarea.value = maxLength ? nextValue.slice(0, maxLength) : nextValue;
  if (maxLength && nextValue.length > maxLength) {
    textarea.dispatchEvent(new CustomEvent('speech-to-text-error', {
      bubbles: true,
      detail: {
        error: 'maxlength',
        message: `De tekst is afgekapt op maximaal ${maxLength} tekens.`,
      },
    }));
  }
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function speechErrorMessage(errorCode) {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microfoontoegang is geweigerd.';
    case 'no-speech':
      return 'Geen spraak gedetecteerd.';
    case 'audio-capture':
      return 'Geen microfoon gevonden.';
    case 'network':
      return 'Spraakherkenning is tijdelijk niet bereikbaar.';
    default:
      return 'Dicteren is gestopt door een browserfout.';
  }
}
