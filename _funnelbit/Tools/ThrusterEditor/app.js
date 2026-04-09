/**
 * app.js - Main Application Logic for Thruster Editor
 */

// 1 Unit = 256 Pixels (High res visualization, Image width is 1.0 Unit)
const PPU = 256;

class App {
    constructor() {
        this.thrusters = [];
        this.textures = new Map();
        this.bgTexture = null;
        this.bgTexturePath = null;
        this.zoom = 1.0;
        this.pan = { x: 0, y: 0 }; // Center origin

        this.selectedThruster = null;
        this.dragState = null; // { mode: 'move'|'rotate', startMs: {x,y}, startVal: {x,y,z}, target: obj }

        // Simulation State
        this.simActive = false;
        this.simDir = { x: 0, y: 0 }; // Normalized direction vector (2D)
        this.simSpeed = 0;
        this.simMaxSpeed = 3;
        this.simAccel = 0;
        this.simMaxAccel = 0.25;

        this.pairMap = new Map(); // thruster object -> paired thruster object

        this.ui = {
            viewport: document.getElementById('viewport-world'),
            tree: document.getElementById('thruster-list'),
            props: document.getElementById('properties-content'),
            xmlInput: document.getElementById('xml-input'),
            zoomLabel: document.getElementById('zoom-level'),
            // Sim UI
            simToggle: document.getElementById('sim-toggle'),
            simPanel: document.getElementById('sim-panel'),
            joystickBase: document.getElementById('joystick-base'),
            joystickKnob: document.getElementById('joystick-knob'),
            simSpeed: document.getElementById('sim-speed'),
            simMaxSpeed: document.getElementById('sim-max-speed'),
            simAccel: document.getElementById('sim-accel'),
            simMaxAccel: document.getElementById('sim-max-accel')
        };

        // Bind Joystick Events
        this.initJoystick();

        this.init();
    }

    init() {
        // I/O
        document.getElementById('btn-load-tex').onclick = () => document.getElementById('file-input-tex').click();
        document.getElementById('file-input-tex').onchange = (e) => this.loadTextures(e.target.files);

        document.getElementById('btn-load-bg').onclick = () => document.getElementById('file-input-bg').click();
        document.getElementById('file-input-bg').onchange = (e) => this.loadBackgroundFile(e.target.files[0]);

        document.getElementById('btn-import').onclick = () => this.importXml();
        document.getElementById('btn-export').onclick = () => this.exportXml();

        // Modal
        document.getElementById('btn-close-modal').onclick = () => this.closeModal();

        // Sim Controls
        this.ui.simToggle.onchange = (e) => this.toggleSim(e.target.checked);

        // Speed
        this.ui.simSpeed.oninput = (e) => { this.simSpeed = parseFloat(e.target.value); this.render(); };
        this.ui.simMaxSpeed.onchange = (e) => {
            this.simMaxSpeed = parseFloat(e.target.value) || 3;
            this.ui.simSpeed.max = this.simMaxSpeed;
            if (this.simSpeed > this.simMaxSpeed) {
                this.simSpeed = this.simMaxSpeed;
                this.ui.simSpeed.value = this.simSpeed;
                this.render();
            }
        };

        // Accel
        if (this.ui.simAccel) {
            this.ui.simAccel.oninput = (e) => { this.simAccel = parseFloat(e.target.value); this.render(); };
            this.ui.simMaxAccel.onchange = (e) => {
                this.simMaxAccel = parseFloat(e.target.value) || 0.25;
                this.ui.simAccel.max = this.simMaxAccel;
                if (this.simAccel > this.simMaxAccel) {
                    this.simAccel = this.simMaxAccel;
                    this.ui.simAccel.value = this.simAccel;
                    this.render();
                }
            };
        }

        // View
        // View
        document.getElementById('btn-reset-view').onclick = () => { this.zoom = 1.0; this.autoPanCenter(); };

        // Controls
        document.getElementById('btn-add-thruster').onclick = () => this.addThruster();

        const container = document.getElementById('viewport-container');
        container.addEventListener('mousedown', (e) => this.onMouseDown(e));
        container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
        // Sim overrides mousemove for joystick if dragging, but we handle that in initJoystick global listeners
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        window.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Initial render
        this.autoPanCenter();
        this.render();
    }

    // --- Joystick Logic ---
    initJoystick() {
        let dragging = false;
        const base = this.ui.joystickBase;
        const knob = this.ui.joystickKnob;
        const radius = 40;

        const updateStick = (clientX, clientY) => {
            const rect = base.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            let dx = clientX - cx;
            let dy = clientY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const maxRadius = 35;

            let nx = dx;
            let ny = dy;

            if (dist > maxRadius) {
                const angle = Math.atan2(dy, dx);
                nx = Math.cos(angle) * maxRadius;
                ny = Math.sin(angle) * maxRadius;
            }

            knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;

            // Updates simDir (Normalized)
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                this.simDir.x = dx / len;
                this.simDir.y = -dy / len;
            } else {
                this.simDir.x = 0;
                this.simDir.y = 0;
            }

            this.render();
        };

        knob.onmousedown = (e) => {
            e.preventDefault();
            this.dragState = { mode: 'joystick' };
            updateStick(e.clientX, e.clientY);
        };
    }

    toggleSim(active) {
        this.simActive = active;
        if (active) {
            this.ui.simPanel.classList.remove('disabled');
            this.selectedThruster = null; // Deselect
        } else {
            this.ui.simPanel.classList.add('disabled');
        }
        this.render();
    }

    // --- Texture Loading ---
    async loadTextures(files) {
        // ... (truncated for brevity, logic unchanged from working version)
        let count = 0;
        for (const file of files) {
            if (file.name.toLowerCase().endsWith('.png')) {
                let path = file.webkitRelativePath.replace(/\\/g, '/');
                if (path.startsWith('Textures/')) path = path.substring(9);
                if (path.indexOf('/') > -1 && path.startsWith('FunnelBit/')) {
                    // Normalize
                }
                const key = path.replace(/\.png$/i, '');
                const url = URL.createObjectURL(file);
                this.textures.set(key, url);
                count++;
            }
        }
        if (this.bgTexturePath) this.resolveBackground(this.bgTexturePath);
        this.render();
    }

    loadBackgroundFile(file) {
        if (!file) return;
        const url = URL.createObjectURL(file);
        this.bgTexture = url;
        this.bgTexturePath = null;
        this.render();
    }

    // --- XML Logic ---
    importXml() {
        try {
            const res = XmlIO.parse(this.ui.xmlInput.value);
            if (res.bgPath) {
                this.bgTexturePath = res.bgPath;
                this.resolveBackground(res.bgPath);
            }
            this.thrusters = res.thrusters;
            this.detectPairs();
            this.selectedThruster = null;
            this.render();
        } catch (e) {
            alert(e.message);
        }
    }

    exportXml() {
        const xml = XmlIO.toXml(this.thrusters);
        this.ui.xmlInput.value = xml;
        navigator.clipboard.writeText(xml).then(() => alert("Copied to clipboard"));
    }

    resolveBackground(path) {
        if (!path) return;
        const url = this.textures.get(path);
        if (url) {
            this.bgTexture = url;
            this.render();
        }
    }

    // --- Modal Logic ---
    openTextureModal(callback) {
        const modal = document.getElementById('modal-overlay');
        const grid = document.getElementById('texture-grid');
        grid.innerHTML = '';

        if (this.textures.size === 0) {
            grid.innerHTML = '<div style="color:#888; text-align:center; padding:20px;">No textures loaded.<br>Use "Load Textures" first.</div>';
        } else {
            for (const [key, url] of this.textures.entries()) {
                const item = document.createElement('div');
                item.className = 'tex-item';
                item.innerHTML = `<img src="${url}"><span>${key.split('/').pop()}</span>`;
                item.title = key;
                item.onclick = () => {
                    callback(key);
                    this.closeModal();
                };
                grid.appendChild(item);
            }
        }
        modal.style.display = 'flex';
    }

    closeModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }

    // --- Logic ---
    addThruster() {
        if (this.simActive) return;
        const t = {
            localOffset: { x: 0, y: 0, z: 0 },
            localFlameDir: { x: 0, y: 0, z: -1 },
            minSize: 0, cruiseMaxSize: 3, boostMaxSize: 5.5,
            jitterWidth: 0.2, cruiseMaxSpeed: 0.2, accelMin: 0.09,
            accelMax: 0.25, omniThruster: false,
            texPath: "FunnelBit/Thrusters/DefaultFlame",
            graphicClass: "Graphic_Single",
            shaderType: "TransparentPostLight"
        };
        this.thrusters.push(t);
        this.selectThruster(t);
    }

    duplicateThruster(t) {
        if (this.simActive) return;
        const dup = JSON.parse(JSON.stringify(t));
        // Slight offset
        dup.localOffset.x += 0.1;
        dup.localOffset.z -= 0.1;
        this.thrusters.push(dup);
        this.selectThruster(dup);
    }

    deleteThruster(t) {
        const idx = this.thrusters.indexOf(t);
        if (idx > -1) {
            if (this.pairMap.has(t)) this.unpair(t);
            this.thrusters.splice(idx, 1);
            if (this.selectedThruster === t) this.selectedThruster = null;
            this.render();
        }
    }

    // Symmetry Logic
    detectPairs() {
        this.pairMap.clear();
        for (let i = 0; i < this.thrusters.length; i++) {
            if (this.pairMap.has(this.thrusters[i])) continue;
            for (let j = i + 1; j < this.thrusters.length; j++) {
                if (this.pairMap.has(this.thrusters[j])) continue;

                const a = this.thrusters[i];
                const b = this.thrusters[j];

                if (Math.abs(a.localOffset.x) < 0.001) continue;

                if (Math.abs(a.localOffset.x + b.localOffset.x) < 0.001 &&
                    Math.abs(a.localOffset.z - b.localOffset.z) < 0.001) {
                    this.pair(a, b);
                    break;
                }
            }
        }
    }

    pair(a, b) {
        this.pairMap.set(a, b);
        this.pairMap.set(b, a);
    }

    unpair(t) {
        const other = this.pairMap.get(t);
        if (other) {
            this.pairMap.delete(other);
            this.pairMap.delete(t);
            this.render();
        }
    }

    createPair(t) {
        const mirror = JSON.parse(JSON.stringify(t));
        mirror.localOffset.x = -t.localOffset.x;
        mirror.localFlameDir.x = -t.localFlameDir.x;
        this.thrusters.push(mirror);
        this.pair(t, mirror);
        this.render();
    }

    syncPair(source) {
        const target = this.pairMap.get(source);
        if (!target) return;
        target.localOffset.x = -source.localOffset.x;
        target.localOffset.z = source.localOffset.z;

        target.localFlameDir.x = -source.localFlameDir.x;
        target.localFlameDir.z = source.localFlameDir.z;

        target.minSize = source.minSize;
        target.cruiseMaxSize = source.cruiseMaxSize;
        target.boostMaxSize = source.boostMaxSize;
        target.jitterWidth = source.jitterWidth;
        target.cruiseMaxSpeed = source.cruiseMaxSpeed;
        target.accelMin = source.accelMin;
        target.accelMax = source.accelMax;
        target.omniThruster = source.omniThruster;
        target.texPath = source.texPath;
        target.graphicClass = source.graphicClass;
        target.shaderType = source.shaderType;
    }

    // --- Rendering ---
    render() {
        this.updateTransform();
        const v = this.ui.viewport;
        v.innerHTML = '';

        if (this.bgTexture) {
            const img = document.createElement('img');
            img.src = this.bgTexture;
            img.style.position = 'absolute';
            img.style.transform = 'translate(-50%, -50%)';
            img.style.pointerEvents = 'none';
            img.style.opacity = '0.7';
            img.style.width = (1 * PPU) + 'px';
            v.appendChild(img);
        }

        const axis = document.createElement('div');
        axis.style.position = 'absolute';
        axis.style.borderLeft = '1px dashed #444';
        axis.style.height = '2000px'; axis.style.top = '-1000px'; axis.style.left = '0';
        v.appendChild(axis);
        const axisH = document.createElement('div');
        axisH.style.position = 'absolute';
        axisH.style.borderTop = '1px dashed #444';
        axisH.style.width = '2000px'; axisH.style.left = '-1000px'; axisH.style.top = '0';
        v.appendChild(axisH);


        if (this.simActive) {
            this.renderSimulation(v);
        } else {
            this.renderEditor(v);
        }

        this.renderTree();
        this.renderProperties();
    }

    renderEditor(v) {
        this.thrusters.forEach(t => {
            const g = document.createElement('div');
            g.className = 'thruster-gizmo';

            const px = t.localOffset.x * PPU;
            const py = -t.localOffset.z * PPU;

            const pt = document.createElement('div');
            pt.className = 'thruster-point';
            if (t === this.selectedThruster) pt.classList.add('selected');
            if (this.pairMap.has(t)) pt.classList.add('paired');
            pt.style.left = px + 'px';
            pt.style.top = py + 'px';

            pt.onmousedown = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (this.simActive) return;

                if (e.button === 0) {
                    this.selectThruster(t);
                    if (e.shiftKey) {
                        this.dragState = {
                            mode: 'rotate',
                            startMs: { x: e.clientX, y: e.clientY },
                            target: t,
                            startDir: { ...t.localFlameDir }
                        };
                    } else {
                        this.dragState = {
                            mode: 'move',
                            startMs: { x: e.clientX, y: e.clientY },
                            target: t,
                            startVal: { ...t.localOffset }
                        };
                    }
                }
            };
            v.appendChild(pt);

            const arrow = document.createElement('div');
            arrow.className = 'thruster-arrow';
            arrow.style.left = px + 'px';
            arrow.style.top = py + 'px';

            const angle = Math.atan2(-t.localFlameDir.z, t.localFlameDir.x) * 180 / Math.PI;
            arrow.style.width = '45px';
            arrow.style.transform = `rotate(${angle}deg)`;

            v.appendChild(arrow);
        });
    }

    renderSimulation(v) {
        this.thrusters.forEach(t => {
            const px = t.localOffset.x * PPU;
            const py = -t.localOffset.z * PPU;

            // Velocity Vector (World/Sim Unit Space)
            const velX = this.simDir.x * this.simSpeed;
            const velZ = this.simDir.y * this.simSpeed;

            // Thrust Direction (World Space). Force is opposite to flame.
            const thrustX = -t.localFlameDir.x;
            const thrustZ = -t.localFlameDir.z;

            // --- 1. Cruise Size (Speed Based) ---
            let vMetric = 0;
            if (t.omniThruster) {
                vMetric = this.simSpeed;
            } else {
                // Dot Product: Speed projected onto Thrust Direction
                const dot = velX * thrustX + velZ * thrustZ;
                vMetric = Math.max(0, dot);
            }

            let speedNorm = 0;
            const maxSpd = t.cruiseMaxSpeed || 0.2;

            if (maxSpd > 0.001) {
                speedNorm = Math.min(1.0, vMetric / maxSpd);
            } else {
                speedNorm = vMetric > 0.001 ? 1.0 : 0.0;
            }

            // Cruise Size
            const cruiseSize = t.minSize + (t.cruiseMaxSize - t.minSize) * speedNorm;

            // --- 2. Boost Size (Accel Based) ---
            let accelScalar = 0;
            if (t.omniThruster) {
                accelScalar = this.simAccel;
            } else {
                // Accel vector projected onto Thrust Direction
                // Assuming simAccel happens in simDir direction
                const accX = this.simDir.x * this.simAccel;
                const accZ = this.simDir.y * this.simAccel;
                const dot = accX * thrustX + accZ * thrustZ;
                accelScalar = Math.max(0, dot);
            }

            // InverseLerp(accelMin, accelMax, accelScalar)
            const aMin = t.accelMin || 0.09;
            const aMax = t.accelMax || 0.25;
            let boostNorm = 0;
            if (aMax > aMin) {
                boostNorm = Math.max(0, Math.min(1, (accelScalar - aMin) / (aMax - aMin)));
            }

            // Final Size: Lerp from CruiseSize to BoostMaxSize
            const finalSize = cruiseSize + (t.boostMaxSize - cruiseSize) * boostNorm;

            if (t.texPath && finalSize > 0.05) {
                const img = document.createElement('img');
                // Resolve texture URL
                let texUrl = this.textures.get(t.texPath);
                if (!texUrl) texUrl = this.textures.get(t.texPath.split('/').pop());

                if (texUrl) {
                    img.src = texUrl;
                    img.style.position = 'absolute';
                    img.style.pointerEvents = 'none';

                    // C# Logic: Graphics.DrawMesh(MeshPool.plane10, matrix...)
                    // plane10 is a square center-pivoted 1x1 mesh.
                    const pxSize = finalSize * PPU;
                    img.style.width = pxSize + 'px';
                    img.style.height = pxSize + 'px';

                    // Rotation
                    const angle = Math.atan2(-t.localFlameDir.z, t.localFlameDir.x) * 180 / Math.PI;

                    img.style.left = px + 'px';
                    img.style.top = py + 'px';

                    // Center Pivot
                    img.style.transform = `translate(-50%, -50%) rotate(${angle + 90}deg)`;

                    v.appendChild(img);
                }
            }

            // Small dot ref
            const pt = document.createElement('div');
            pt.className = 'thruster-point';
            pt.style.left = px + 'px';
            pt.style.top = py + 'px';
            pt.style.background = 'rgba(255,255,255,0.1)';
            pt.style.border = 'none';
            pt.style.width = '4px'; pt.style.height = '4px';
            v.appendChild(pt);
        });
    }

    renderTree() {
        const t = this.ui.tree;
        t.innerHTML = '';
        this.thrusters.forEach((th, i) => {
            const row = document.createElement('div');
            row.className = 'tree-node';
            if (th === this.selectedThruster) row.classList.add('selected');

            const isPaired = this.pairMap.has(th);

            row.innerHTML = `<span>Thruster ${i}</span> ${isPaired ? '<span class="pair-icon">∞</span>' : ''}`;
            row.onclick = () => { if (!this.simActive) this.selectThruster(th); };
            t.appendChild(row);
        });
    }

    renderProperties() {
        const p = this.ui.props;
        p.innerHTML = '';

        if (this.simActive) {
            p.innerHTML = '<div class="empty-state">Simulation Mode Active<br>Editing Disabled</div>';
            return;
        }

        if (!this.selectedThruster) {
            p.innerHTML = '<div class="empty-state">Select a thruster</div>';
            return;
        }

        const t = this.selectedThruster;
        const isPaired = this.pairMap.has(t);

        // Pair/Unpair Button
        if (!isPaired) {
            const btnPair = document.createElement('button');
            btnPair.className = 'btn secondary';
            btnPair.textContent = 'Create Symmetry Pair';
            btnPair.onclick = () => this.createPair(t);
            p.appendChild(btnPair);
        } else {
            const btnUnpair = document.createElement('button');
            btnUnpair.className = 'btn secondary';
            btnUnpair.textContent = 'Unpair Sibling';
            btnUnpair.style.borderColor = '#00e5ff';
            btnUnpair.onclick = () => this.unpair(t);
            p.appendChild(btnUnpair);
        }

        this.addVec3(p, "Offset", t.localOffset, v => { t.localOffset = v; if (isPaired) this.syncPair(t); this.render(); });
        this.addVec3(p, "Direction", t.localFlameDir, v => { t.localFlameDir = v; if (isPaired) this.syncPair(t); this.render(); });

        // Params
        this.addFloat(p, "Min Size", t.minSize, v => { t.minSize = v; if (isPaired) this.syncPair(t); });
        this.addFloat(p, "Cruise Size", t.cruiseMaxSize, v => { t.cruiseMaxSize = v; if (isPaired) this.syncPair(t); });
        this.addFloat(p, "Boost Size", t.boostMaxSize, v => { t.boostMaxSize = v; if (isPaired) this.syncPair(t); });
        this.addFloat(p, "Jitter", t.jitterWidth, v => { t.jitterWidth = v; if (isPaired) this.syncPair(t); });

        this.addFloat(p, "Cruise Speed", t.cruiseMaxSpeed, v => { t.cruiseMaxSpeed = v; if (isPaired) this.syncPair(t); });
        this.addFloat(p, "Accel Min", t.accelMin, v => { t.accelMin = v; if (isPaired) this.syncPair(t); });
        this.addFloat(p, "Accel Max", t.accelMax, v => { t.accelMax = v; if (isPaired) this.syncPair(t); });

        this.addBool(p, "Omni", t.omniThruster, v => { t.omniThruster = v; if (isPaired) this.syncPair(t); });

        // Graphic
        const grp = document.createElement('div'); grp.className = 'section-title'; grp.style.marginTop = '10px'; grp.textContent = 'Graphic'; p.appendChild(grp);

        // Custom texture input with SELECT button
        this.addTexInput(p, "Texture", t.texPath, v => { t.texPath = v; if (isPaired) this.syncPair(t); });

        this.addText(p, "Class", t.graphicClass, v => { t.graphicClass = v; if (isPaired) this.syncPair(t); });
        this.addText(p, "Shader", t.shaderType, v => { t.shaderType = v; if (isPaired) this.syncPair(t); });

        const btnDup = document.createElement('button');
        btnDup.className = 'btn secondary';
        btnDup.style.marginTop = '20px';
        btnDup.textContent = 'Duplicate';
        btnDup.onclick = () => this.duplicateThruster(t);
        p.appendChild(btnDup);

        const btnDel = document.createElement('button');
        btnDel.className = 'btn secondary';
        btnDel.style.borderColor = '#f44';
        btnDel.style.marginTop = '10px';
        btnDel.textContent = 'Delete';
        btnDel.onclick = () => this.deleteThruster(t);
        p.appendChild(btnDel);
    }

    // --- Inputs Helpers ---
    addTexInput(p, l, val, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;

        const wrap = document.createElement('div');
        wrap.style.display = 'flex'; wrap.style.flex = '1'; wrap.style.gap = '4px';

        const i = document.createElement('input'); i.className = 'prop-input'; i.value = val || '';
        i.onchange = () => cb(i.value);

        const btn = document.createElement('button');
        btn.textContent = 'Select';
        btn.className = 'btn';
        btn.style.padding = '2px 6px';
        btn.style.fontSize = '10px';
        btn.onclick = () => {
            this.openTextureModal((path) => {
                i.value = path;
                cb(path);
            });
        };

        wrap.appendChild(i);
        wrap.appendChild(btn);
        row.appendChild(wrap);
        p.appendChild(row);
    }

    addVec3(p, l, val, cb) {
        // Only showing X and Z for 2D editing convinience, but we store full Vec3
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;
        const g = document.createElement('div'); g.className = 'prop-group-h';
        const x = this.numIn(val.x, v => cb({ ...val, x: v }));
        const z = this.numIn(val.z, v => cb({ ...val, z: v }));
        g.appendChild(x); g.appendChild(z); row.appendChild(g); p.appendChild(row);
    }

    numIn(val, cb) {
        const i = document.createElement('input'); i.type = 'number'; i.step = '0.05'; i.className = 'prop-input'; i.value = Math.round(val * 1000) / 1000;
        i.oninput = () => cb(parseFloat(i.value) || 0);
        return i;
    }
    addFloat(p, l, val, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;
        const i = this.numIn(val, cb); i.style.flex = '1';
        row.appendChild(i); p.appendChild(row);
    }
    addText(p, l, val, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;
        const i = document.createElement('input'); i.className = 'prop-input'; i.value = val || '';
        i.onchange = () => cb(i.value);
        row.appendChild(i); p.appendChild(row);
    }

    addBool(p, l, val, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;
        const i = document.createElement('input'); i.type = 'checkbox'; i.checked = val;
        i.onchange = () => cb(i.checked);
        row.appendChild(i); p.appendChild(row);
    }

    selectThruster(t) {
        this.selectedThruster = t;
        this.render();
    }

    updateTransform() {
        this.ui.viewport.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
        this.ui.zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
    }

    autoPanCenter() {
        const c = document.getElementById('viewport-container');
        if (c) {
            this.pan.x = c.clientWidth / 2;
            this.pan.y = c.clientHeight / 2;
            this.updateTransform();
        }
    }

    // --- Interaction ---
    onMouseDown(e) {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            // Pan
            this.dragState = { mode: 'pan', startMs: { x: e.clientX, y: e.clientY }, startPan: { ...this.pan } };
        } else if (e.button === 0 && !this.dragState && e.target.id === 'viewport-world') {
            this.selectedThruster = null;
            this.render();
        }
    }

    onMouseMove(e) {
        // Joystick Handling globally if dragging
        if (this.dragState && this.dragState.mode === 'joystick') {
            const base = this.ui.joystickBase;
            const knob = this.ui.joystickKnob;
            const maxRadius = 35;

            const rect = base.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            let dx = e.clientX - cx;
            let dy = e.clientY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // const maxRadius = 35; // REMOVED DUPLICATE

            let nx = dx;
            let ny = dy;
            if (dist > maxRadius) {
                const angle = Math.atan2(dy, dx);
                nx = Math.cos(angle) * maxRadius;
                ny = Math.sin(angle) * maxRadius;
            }
            knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;

            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                this.simDir.x = dx / len;
                this.simDir.y = -dy / len;
            } else {
                this.simDir.x = 0; this.simDir.y = 0;
            }
            this.render();
            return;
        }

        if (!this.dragState) return;
        const d = this.dragState;
        const dx = e.clientX - d.startMs.x;
        const dy = e.clientY - d.startMs.y;

        if (d.mode === 'pan') {
            this.pan.x = d.startPan.x + dx;
            this.pan.y = d.startPan.y + dy;
            this.updateTransform();
            return;
        }

        if (d.mode === 'move') {
            const wx = dx / this.zoom;
            const wy = dy / this.zoom;
            // Unit X+ is right, Unit Z+ is Up (Screen Y-)
            const unitDx = wx / PPU;
            const unitDz = -wy / PPU;

            let nx = d.startVal.x + unitDx;
            let nz = d.startVal.z + unitDz;

            if (e.ctrlKey) {
                nx = Math.round(nx / 0.05) * 0.05;
                nz = Math.round(nz / 0.05) * 0.05;
            }

            d.target.localOffset.x = nx;
            d.target.localOffset.z = nz;

            if (this.pairMap.has(d.target)) this.syncPair(d.target);
            this.render();
        }

        if (d.mode === 'rotate') {
            const t = d.target;
            const px = t.localOffset.x * PPU;
            const py = -t.localOffset.z * PPU;

            const worldMouseX = (e.clientX - this.ui.viewport.getBoundingClientRect().left) / this.zoom;
            const worldMouseY = (e.clientY - this.ui.viewport.getBoundingClientRect().top) / this.zoom;

            const ox = px;
            const oy = py;
            const vx = worldMouseX - ox;
            const vy = worldMouseY - oy;

            let nDirX = vx;
            let nDirZ = -vy;

            const len = Math.sqrt(nDirX * nDirX + nDirZ * nDirZ);
            if (len > 0.001) {
                nDirX /= len; nDirZ /= len;

                if (e.ctrlKey) {
                    let deg = Math.atan2(nDirZ, nDirX) * 180 / Math.PI;
                    const step = 2.5;
                    deg = Math.round(deg / step) * step;
                    const rad = deg * Math.PI / 180;
                    nDirX = Math.cos(rad);
                    nDirZ = Math.sin(rad);
                }

                d.target.localFlameDir.x = nDirX;
                d.target.localFlameDir.z = nDirZ;

                if (this.pairMap.has(d.target)) this.syncPair(d.target);
                this.render();
            }
        }
    }

    onMouseUp(e) { this.dragState = null; }

    onWheel(e) {
        if (e.buttons === 4) return;
        e.preventDefault();
        const delta = -Math.sign(e.deltaY) * 0.1;
        this.zoom = Math.max(0.1, Math.min(5.0, this.zoom + delta));
        this.updateTransform();
    }

    onKeyDown(e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Delete' && this.selectedThruster) this.deleteThruster(this.selectedThruster);
        if (e.key === 'r') this.autoPanCenter();
    }
}

// Global Error Handler
window.onerror = function (msg, url, line, col, error) {
    alert(`Error: ${msg}\nLine: ${line}`);
    return false;
};

// Initialize App when DOM is ready
window.onload = function () {
    try {
        window.app = new App();
    } catch (e) {
        alert("Failed to initialize App: " + e.message);
        console.error(e);
    }
};
