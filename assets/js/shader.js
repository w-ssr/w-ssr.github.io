(() => {
    const canvas = document.getElementById("shader");

    const start = async () => {
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: "high-performance"
        });
        if (!adapter) return;

        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu");
        const format = navigator.gpu.getPreferredCanvasFormat();

        const response = await fetch("assets/backdrop.jpg");
        if (!response.ok) {
            throw new Error(`Backdrop request failed with status ${response.status}`);
        }
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const textureAspect = bitmap.width / bitmap.height;

        const texture = device.createTexture({
            label: "backdrop",
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT
        });

        device.queue.copyExternalImageToTexture(
            {source: bitmap},
            {texture},
            [bitmap.width, bitmap.height]
        );
        bitmap.close();

        const sampler = device.createSampler({
            magFilter: "linear",
            minFilter: "linear"
        });

        const shader = device.createShaderModule({
            label: "wssr background shader",
            code: `
                struct Uniforms {
                    resolution: vec2f,
                    pointer: vec2f,
                    clickPosition: vec2f,
                    time: f32,
                    clickTime: f32,
                    imageAspect: f32,
                    intensity: f32,
                    padding: vec2f,
                }

                @group(0) @binding(0) var<uniform> uniforms: Uniforms;
                @group(0) @binding(1) var backdrop: texture_2d<f32>;
                @group(0) @binding(2) var backdropSampler: sampler;

                fn cover(input: vec2f) -> vec2f {
                    var uv = input;
                    let screenAspect = uniforms.resolution.x / uniforms.resolution.y;

                    if (screenAspect > uniforms.imageAspect) {
                        uv.y = (uv.y - 0.5) * uniforms.imageAspect / screenAspect + 0.5;
                    } else {
                        uv.x = (uv.x - 0.5) * screenAspect / uniforms.imageAspect + 0.5;
                    }

                    return uv;
                }

                fn hash(point: vec2f) -> f32 {
                    return fract(sin(dot(point, vec2f(12.9898, 78.233))) * 43758.5453);
                }

                @vertex
                fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
                    var positions = array<vec2f, 3>(
                        vec2f(-1.0, -1.0),
                        vec2f(3.0, -1.0),
                        vec2f(-1.0, 3.0)
                    );
                    return vec4f(positions[index], 0.0, 1.0);
                }

                @fragment
                fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
                    let uv = position.xy / uniforms.resolution;
                    let aspect = uniforms.resolution.x / uniforms.resolution.y;

                    let cursorDelta = uv - uniforms.pointer;
                    let correctedCursor = vec2f(cursorDelta.x * aspect, cursorDelta.y);
                    let cursorDistance = length(correctedCursor);
                    let focus = exp(-cursorDistance * cursorDistance * 19.0);

                    var warped = uv;
                    warped += cursorDelta * focus * 0.075 * uniforms.intensity;
                    warped += vec2f(-cursorDelta.y, cursorDelta.x)
                        * focus * sin(uniforms.time * 0.65) * 0.012 * uniforms.intensity;

                    warped.x += sin(uv.y * 13.0 + uniforms.time * 0.32) * 0.0024;
                    warped.y += cos(uv.x * 11.0 - uniforms.time * 0.27) * 0.0017;

                    let age = max(0.0, uniforms.time - uniforms.clickTime);
                    let clickDelta = uv - uniforms.clickPosition;
                    let correctedClick = vec2f(clickDelta.x * aspect, clickDelta.y);
                    let clickDistance = length(correctedClick);
                    let ringPosition = age * 0.48;

                    var rippleActive = 0.0;
                    if (age < 2.0) {
                        rippleActive = 1.0;
                    }

                    var ripple = sin((clickDistance - ringPosition) * 95.0);
                    ripple *= exp(-abs(clickDistance - ringPosition) * 22.0);
                    ripple *= exp(-age * 1.25) * rippleActive;

                    warped += normalize(clickDelta + vec2f(0.0001))
                        * ripple * 0.025 * uniforms.intensity;

                    let imageUv = cover(warped);
                    let splitDirection = normalize(cursorDelta + vec2f(0.0001));
                    let split = (focus * 0.007 + abs(ripple) * 0.012) * uniforms.intensity;
                    let splitOffset = splitDirection * split;

                    let red = textureSample(
                        backdrop,
                        backdropSampler,
                        clamp(imageUv + splitOffset, vec2f(0.001), vec2f(0.999))
                    ).r;
                    let green = textureSample(
                        backdrop,
                        backdropSampler,
                        clamp(imageUv, vec2f(0.001), vec2f(0.999))
                    ).g;
                    let blue = textureSample(
                        backdrop,
                        backdropSampler,
                        clamp(imageUv - splitOffset, vec2f(0.001), vec2f(0.999))
                    ).b;

                    var color = vec3f(red, green, blue);
                    let luma = dot(color, vec3f(0.299, 0.587, 0.114));
                    color = mix(vec3f(luma), color, 1.08);

                    let vignetteDistance = distance(uv, vec2f(0.5));
                    let vignette = smoothstep(0.84, 0.18, vignetteDistance);
                    color *= 0.48 + vignette * 0.34;
                    color *= 1.0 + focus * 0.08;

                    let scanline = sin(position.y * 1.55) * 0.009;
                    let grain = (hash(position.xy + fract(uniforms.time) * 80.0) - 0.5) * 0.035;
                    color += vec3f(scanline + grain);

                    return vec4f(max(color, vec3f(0.0)), 1.0);
                }
            `
        });

        const pipeline = await device.createRenderPipelineAsync({
            label: "wssr background pipeline",
            layout: "auto",
            vertex: {
                module: shader,
                entryPoint: "vertexMain"
            },
            fragment: {
                module: shader,
                entryPoint: "fragmentMain",
                targets: [{format}]
            },
            primitive: {
                topology: "triangle-list"
            }
        });

        const uniformBuffer = device.createBuffer({
            label: "background uniforms",
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const bindGroup = device.createBindGroup({
            label: "background bindings",
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                {binding: 0, resource: {buffer: uniformBuffer}},
                {binding: 1, resource: texture.createView()},
                {binding: 2, resource: sampler}
            ]
        });

        const state = {
            x: 0.5,
            y: 0.5,
            targetX: 0.5,
            targetY: 0.5,
            clickX: 0.5,
            clickY: 0.5,
            clickAt: -10
        };

        const uniformData = new Float32Array(12);
        const startedAt = performance.now();

        const configure = () => {
            const scale = Math.min(devicePixelRatio || 1, 1.5);
            canvas.width = Math.max(1, Math.round(innerWidth * scale));
            canvas.height = Math.max(1, Math.round(innerHeight * scale));
            context.configure({
                device,
                format,
                alphaMode: "opaque"
            });
        };

        const locate = (event) => ({
            x: event.clientX / innerWidth,
            y: event.clientY / innerHeight
        });

        addEventListener("resize", configure);
        addEventListener("pointermove", (event) => {
            const point = locate(event);
            state.targetX = point.x;
            state.targetY = point.y;
        });
        addEventListener("pointerdown", (event) => {
            const point = locate(event);
            state.clickX = point.x;
            state.clickY = point.y;
            state.clickAt = (performance.now() - startedAt) / 1000;
        });

        configure();
        document.body.classList.add("shader-ready");

        const render = (now) => {
            state.x += (state.targetX - state.x) * 0.055;
            state.y += (state.targetY - state.y) * 0.055;

            uniformData[0] = canvas.width;
            uniformData[1] = canvas.height;
            uniformData[2] = state.x;
            uniformData[3] = state.y;
            uniformData[4] = state.clickX;
            uniformData[5] = state.clickY;
            uniformData[6] = (now - startedAt) / 1000;
            uniformData[7] = state.clickAt;
            uniformData[8] = textureAspect;
            uniformData[9] = 1;

            device.queue.writeBuffer(uniformBuffer, 0, uniformData);

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: context.getCurrentTexture().createView(),
                    clearValue: {r: 0, g: 0, b: 0, a: 1},
                    loadOp: "clear",
                    storeOp: "store"
                }]
            });

            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();

            device.queue.submit([encoder.finish()]);
            requestAnimationFrame(render);
        };

        requestAnimationFrame(render);
    };

    start().catch((error) => {
        console.error("WebGPU background failed:", error);
    });
})();
