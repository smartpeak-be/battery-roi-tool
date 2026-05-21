const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

let activeSession = null;

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
    if (activeSession && activeSession.textarea === textarea) {
      activeSession.recognition.stop();
      return;
    }
    if (activeSession) activeSession.recognition.stop();

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = opts.lang || 'nl-BE';
    recognition.continuous = opts.continuous !== undefined ? opts.continuous : true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    activeSession = { textarea, recognition, button };
    setRecording(true);

    recognition.addEventListener('result', (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .map(result => result && result[0] ? result[0].transcript : '')
        .join(' ')
        .trim();
      appendTranscript(textarea, transcript);
    });

    recognition.addEventListener('end', () => {
      if (activeSession && activeSession.recognition === recognition) activeSession = null;
      setRecording(false);
    });

    recognition.addEventListener('error', (event) => {
      const message = speechErrorMessage(event.error);
      textarea.dispatchEvent(new CustomEvent('speech-to-text-error', {
        bubbles: true,
        detail: { error: event.error, message },
      }));
    });

    try {
      recognition.start();
    } catch (err) {
      if (activeSession && activeSession.recognition === recognition) activeSession = null;
      setRecording(false);
      textarea.dispatchEvent(new CustomEvent('speech-to-text-error', {
        bubbles: true,
        detail: {
          error: err && err.name ? err.name : 'start-failed',
          message: 'Dicteren kon niet gestart worden.',
        },
      }));
    }
  });

  return true;
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
