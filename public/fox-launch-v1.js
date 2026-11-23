(() => {
  'use strict';

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let active = null;
  let wasHidden = false;
  window.foxLaunchReady = Promise.resolve();

  function launch() {
    if (active || motion.matches || document.hidden || typeof HTMLDialogElement === 'undefined') return;

    const dialog = document.createElement('dialog');
    dialog.className = 'fox-launch';
    dialog.setAttribute('aria-label', 'FOX opening film');
    const film = document.createElement('video');
    film.className = 'fox-launch-film';
    film.muted = film.defaultMuted = true;
    film.playsInline = true;
    film.disablePictureInPicture = true;
    film.preload = 'auto';
    film.poster = './fox-opening-poster.webp?v=2';
    film.setAttribute('aria-hidden', 'true');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'fox-launch-skip';
    skip.textContent = 'Skip intro';
    skip.autofocus = true;
    dialog.append(film, skip);
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch {
      dialog.remove();
      return;
    }

    let resolveLaunch;
    window.foxLaunchReady = new Promise(resolve => { resolveLaunch = resolve; });
    const useLite = navigator.connection?.saveData === true;
    const sources = useLite ? ['./fox-opening-hd.mp4?v=2'] : ['./fox-opening-4k.mp4?v=2', './fox-opening-hd.mp4?v=2'];
    let source = 0;
    let attempt = 0;
    let timer;
    const hardStop = setTimeout(finish, 14000);

    function finish() {
      if (active !== finish) return;
      active = null;
      clearTimeout(timer);
      clearTimeout(hardStop);
      film.pause();
      film.removeAttribute('src');
      film.load();
      dialog.close();
      dialog.remove();
      resolveLaunch();
    }

    function advance(playAttempt) {
      if (active !== finish || playAttempt !== attempt) return;
      if (source + 1 < sources.length && film.currentTime < .25) {
        source++;
        play();
      } else {
        finish();
      }
    }

    function play() {
      const playAttempt = ++attempt;
      clearTimeout(timer);
      timer = setTimeout(() => advance(playAttempt), 3000);
      film.src = sources[source];
      film.play().catch(error => {
        if (error.name === 'NotAllowedError') finish();
        else if (error.name !== 'AbortError') advance(playAttempt);
      });
    }

    active = finish;
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
    skip.addEventListener('click', finish);
    film.addEventListener('playing', () => clearTimeout(timer));
    film.addEventListener('ended', finish);
    film.addEventListener('error', () => {
      if (film.error) advance(attempt);
    });
    play();
  }

  motion.addEventListener?.('change', event => { if (event.matches) active?.(); });
  window.addEventListener('pagehide', () => active?.());
  window.addEventListener('pageshow', event => { if (event.persisted) launch(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wasHidden = true;
      active?.();
    } else if (wasHidden) {
      wasHidden = false;
      if (standalone) launch();
    }
  });
  launch();
})();
