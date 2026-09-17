// Local character feedback only: no chat submissions or runtime image generation.
const faces = new Map(['approval', 'surprised'].map(emotion => {
  const image = new Image();
  image.src = `/art/system-${emotion}.png`;
  const ready = image.decode().then(() => image.src).catch(() => null);
  return [emotion, ready];
}));

export function bindCompanion({floating, body, image, button, enabled = true}) {
  let active = enabled, reacting = false, count = 0, revision = 0, restoreTimer;
  let originalSrc = '', originalAlt = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function reset() {
    revision++;
    clearTimeout(restoreTimer);
    delete body.dataset.reaction;
    body.classList.remove('pointer-reaction');
    if (reacting) {
      image.src = originalSrc;
      image.alt = originalAlt;
    }
    reacting = false;
  }

  function setEnabled(value) {
    reset();
    active = value;
    button.hidden = !value;
    floating.classList.toggle('is-floating', value);
  }

  button.addEventListener('click', async event => {
    if (!active) return;
    // Keep the original story portrait, even when a second poke interrupts the first.
    if (!reacting) {
      originalSrc = image.getAttribute('src');
      originalAlt = image.alt;
    }
    reacting = true;
    const request = ++revision;
    const emotion = count++ % 2 === 0 ? 'approval' : 'surprised';
    clearTimeout(restoreTimer);
    body.dataset.reaction = emotion;
    body.classList.toggle('pointer-reaction', event.detail > 0 && !reduce.matches);
    restoreTimer = setTimeout(reset, 1200);
    const src = await faces.get(emotion);
    // A slow image must never overwrite a newer poke or the next speaking character.
    if (!src || request !== revision || !active) return;
    image.src = src;
    image.alt = emotion === 'approval' ? '系统精灵开心地眯起眼睛' : '系统精灵惊讶地张开小嘴';
  });

  document.addEventListener('visibilitychange', () => {
    floating.classList.toggle('motion-paused', document.hidden);
    if (document.hidden) reset();
  });
  reduce.addEventListener('change', () => {
    if (reduce.matches) body.classList.remove('pointer-reaction');
  });
  setEnabled(enabled);
  return {reset, setEnabled};
}
