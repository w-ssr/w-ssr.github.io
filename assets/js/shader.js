(() => {
    const canvas = document.getElementById("shader");
    const gl =
        canvas.getContext("webgl", {
            antialias: false,
            alpha: false
        }) ||
        canvas.getContext("experimental-webgl", {
            antialias: false,
            alpha: false
        });

    if (!gl) return;

    const VERT = `
        attribute vec2 pos;
        void main() { gl_Position = vec4(pos, 0.0, 1.0); }
    `;

    const FRAG = `
        precision mediump float;

        uniform vec2  u_res;
        uniform float u_time;
        uniform vec2  u_mouse;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
            for (int i = 0; i < 5; i++) {
                v += a * noise(p);
                p = m * p;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_res;
            vec2 p  = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

            p *= 1.6;
            p += u_mouse * 0.12;

            float t = u_time * 0.06;

            vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3)));
            vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.9 * t),
                          fbm(p + 3.0 * q + vec2(8.3, 2.8) + 0.7 * t));
            float f = fbm(p + 3.0 * r);

            vec3 base  = vec3(0.024, 0.016, 0.036);
            vec3 plum  = vec3(0.16,  0.07,  0.24);
            vec3 lilac = vec3(0.55,  0.36,  0.95);
            vec3 rose  = vec3(1.00,  0.62,  0.79);

            vec3 col = base;
            col = mix(col, plum,  smoothstep(0.15, 0.85, f));
            col = mix(col, lilac, smoothstep(0.35, 1.05, length(q)) * 0.55);
            col = mix(col, rose,  smoothstep(0.55, 1.15, r.y) * 0.40);

            col += rose * 0.10 * pow(max(f - 0.45, 0.0), 2.0);

            col *= 0.62;
            float d = distance(uv, vec2(0.5));
            col *= smoothstep(1.05, 0.15, d);
            col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.022;

            gl_FragColor = vec4(max(col, 0.0), 1.0);
        }
    `;

    const compile = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.warn("shader:", gl.getShaderInfoLog(sh));
            return null;
        }
        return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    const mouse = {
        x: 0,
        y: 0,
        tx: 0,
        ty: 0
    };

    const resize = () => {
        const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
        canvas.width = Math.max(1, Math.round(window.innerWidth * scale));
        canvas.height = Math.max(1, Math.round(window.innerHeight * scale));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
    };

    window.addEventListener("resize", resize);
    resize();

    window.addEventListener("pointermove", (e) => {
        mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    });

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame = 0;

    const render = (now) => {
        frame = requestAnimationFrame(render);
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        gl.uniform2f(uMouse, mouse.x, mouse.y);
        gl.uniform1f(uTime, still ? 0 : (now - start) / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            cancelAnimationFrame(frame);
        } else {
            frame = requestAnimationFrame(render);
        }
    });

    frame = requestAnimationFrame(render);
})();