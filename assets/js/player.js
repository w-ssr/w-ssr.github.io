const TRACKS = [{
    title: "Beamer Boy",
    artist: "Lil Peep",
    src: "assets/music/beamerboy.mp3"
}];

(() => {
    const el = (id) => document.getElementById(id);
    const player = el("player");
    const audio = el("audio");
    const art = el("art");
    const title = el("title");
    const artist = el("artist");
    const seek = el("seek");
    const fill = el("fill");
    const knob = el("knob");
    const cur = el("cur");
    const dur = el("dur");
    const playBtn = el("play");
    const prevBtn = el("prev");
    const nextBtn = el("next");
    const vol = el("vol");
    const hint = el("hint");

    const FALLBACK_ART = art.src;

    if (!TRACKS.length) {
        title.textContent = "no music added?!";
        artist.textContent = "no music added!?";
        [playBtn, prevBtn, nextBtn].forEach((b) => (b.disabled = true));
        hint.hidden = true;
        return;
    }

    let index = 0;
    let scrubbing = false;

    const time = (s) =>
        !isFinite(s) ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

    const paint = (ratio) => {
        const pct = `${Math.min(Math.max(ratio, 0), 1) * 100}%`;
        fill.style.width = pct;
        knob.style.left = pct;
    };

    const load = (i, autoplay) => {
        index = (i + TRACKS.length) % TRACKS.length;
        const track = TRACKS[index];
        audio.src = track.src;
        art.src = track.art || FALLBACK_ART;
        title.textContent = track.title || "untitled";
        artist.textContent = track.artist || "unknown artist";
        cur.textContent = dur.textContent = "0:00";
        paint(0);
        if (autoplay) play();
    };

    const play = () =>
        audio.play().then(
            () => {
                player.classList.add("playing");
                playBtn.setAttribute("aria-label", "Pause");
                hint.style.opacity = 0;
                setTimeout(() => (hint.hidden = true), 500);
            },
            () => player.classList.remove("playing")
        );

    const pause = () => {
        audio.pause();
        player.classList.remove("playing");
        playBtn.setAttribute("aria-label", "Play");
    };

    playBtn.addEventListener("click", () => (audio.paused ? play() : pause()));
    prevBtn.addEventListener("click", () =>
        load(audio.currentTime > 3 ? index : index - 1, !audio.paused)
    );
    nextBtn.addEventListener("click", () => load(index + 1, !audio.paused));

    audio.addEventListener("loadedmetadata", () => (dur.textContent = time(audio.duration)));
    audio.addEventListener("timeupdate", () => {
        if (scrubbing) return;
        cur.textContent = time(audio.currentTime);
        if (audio.duration) paint(audio.currentTime / audio.duration);
    });
    audio.addEventListener("ended", () => load(index + 1, true));
    audio.addEventListener("pause", () => player.classList.remove("playing"));
    audio.addEventListener("error", () => {
        artist.textContent = "couldn't load this track";
        pause();
    });

    const ratioFrom = (e) => {
        const r = seek.getBoundingClientRect();
        return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    };

    seek.addEventListener("pointerdown", (e) => {
        scrubbing = true;
        seek.classList.add("active");
        seek.setPointerCapture(e.pointerId);
        const ratio = ratioFrom(e);
        paint(ratio);
        if (audio.duration) cur.textContent = time(ratio * audio.duration);
    });

    seek.addEventListener("pointermove", (e) => {
        if (!scrubbing) return;
        const ratio = ratioFrom(e);
        paint(ratio);
        if (audio.duration) cur.textContent = time(ratio * audio.duration);
    });

    const endScrub = (e) => {
        if (!scrubbing) return;
        scrubbing = false;
        seek.classList.remove("active");
        if (audio.duration) audio.currentTime = ratioFrom(e) * audio.duration;
    };

    seek.addEventListener("pointerup", endScrub);
    seek.addEventListener("pointercancel", () => {
        scrubbing = false;
        seek.classList.remove("active");
    });

    audio.volume = vol.value / 100;
    vol.addEventListener("input", () => (audio.volume = vol.value / 100));

    document.addEventListener("keydown", (e) => {
        if (e.target.matches("input, a, button")) return;
        if (e.code === "Space") {
            e.preventDefault();
            audio.paused ? play() : pause();
        }
        if (e.code === "ArrowRight") load(index + 1, !audio.paused);
        if (e.code === "ArrowLeft") load(index - 1, !audio.paused);
    });

    const unlock = (e) => {
        document.removeEventListener("pointerdown", unlock);
        document.removeEventListener("keydown", unlock);

        if (e.target.closest && e.target.closest("#player")) return;
        if (audio.paused && audio.currentTime === 0) play();
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);

    load(0, false);
    play();
})();