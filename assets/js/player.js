(() => {
    const player = document.getElementById("player");
    const audio = document.getElementById("audio");
    const button = document.getElementById("play");
    const progress = document.getElementById("progress");
    const seek = document.getElementById("seek");
    const time = document.getElementById("time");

    if (!player || !audio || !button || !progress || !seek || !time) return;

    const setPlaying = (playing) => {
        player.classList.toggle("playing", playing);
        button.setAttribute("aria-label", playing ? "Pause music" : "Play music");
    };

    button.addEventListener("click", () => {
        if (audio.paused) {
            audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
            audio.pause();
            setPlaying(false);
        }
    });

    const update = () => {
        const amount = audio.duration ? audio.currentTime / audio.duration : 0;
        progress.style.width = `${amount * 100}%`;
        const seconds = Math.floor(audio.currentTime % 60);
        time.textContent = `${Math.floor(audio.currentTime / 60)}:${String(seconds).padStart(2, "0")}`;
    };

    audio.addEventListener("loadedmetadata", resetToStart, {once: true});
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) resetToStart();

    audio.addEventListener("timeupdate", update);

    seek.addEventListener("click", (event) => {
        if (!audio.duration) return;
        const bounds = seek.getBoundingClientRect();
        audio.currentTime = ((event.clientX - bounds.left) / bounds.width) * audio.duration;
        update();
    });

    audio.addEventListener("ended", () => {
        resetToStart();
        setPlaying(false);
    });

    audio.addEventListener("pause", () => setPlaying(false));
})();
