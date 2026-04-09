/**
 * app.js - Main Application Logic
 */

class App {
    constructor() {
        this.data = null; // Current Def Object
        this.textures = new Map(); // path string -> blob url
        this.selectedElement = null; // Currently selected element object
        this.selectedVisual = null; // Currently selected visual node object (child of selectedElement)

        this.isTestMode = false; // Toggle with T

        this.zoom = 1.0;
        this.pan = { x: 100, y: 100 };

        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.dragStartObj = { x: 0, y: 0 }; // Stores pos or size
        this.dragStartMs = { x: 0, y: 0 };

        this.hiddenElements = new Set(); // For 'H' key toggling visibility in editor

        this.ui = {
            viewportWorld: document.getElementById('viewport-world'),
            treeView: document.getElementById('hierarchy-tree'),
            propsContent: document.getElementById('properties-content'),
            zoomLabel: document.getElementById('zoom-level'),
            xmlInput: document.getElementById('xml-input'),
            textureModal: document.getElementById('texture-picker-modal'),
            textureGrid: document.getElementById('texture-grid')
        };

        this.init();
    }

    init() {
        // Event Listeners
        document.getElementById('btn-load-tex').onclick = () => document.getElementById('file-input-tex').click();
        document.getElementById('file-input-tex').onchange = (e) => this.loadTextures(e.target.files);

        document.getElementById('btn-import').onclick = () => this.importXml();
        document.getElementById('btn-export').onclick = () => this.exportXml();
        document.getElementById('btn-reset-view').onclick = () => this.resetView();
        document.getElementById('btn-auto-width').onclick = () => this.autoWidth();

        // Helper to add Test Mode button if not exists
        if (!document.getElementById('btn-test-mode')) {
            const toolbars = document.querySelectorAll('.toolbar');
            if (toolbars.length > 0) {
                // Add Element Button
                const btnAdd = document.createElement('button');
                btnAdd.className = 'btn secondary';
                btnAdd.id = 'btn-add-element';
                btnAdd.textContent = '+ Add Element';
                btnAdd.style.marginRight = '8px';
                btnAdd.onclick = () => this.showAddElementMenu();
                toolbars[0].appendChild(btnAdd);

                // Test Mode Button
                const btn = document.createElement('button');
                btn.className = 'btn secondary';
                btn.id = 'btn-test-mode';
                btn.textContent = 'Test Mode (T)';
                btn.onclick = () => this.toggleTestMode();
                toolbars[0].appendChild(btn);
            }
        }

        document.getElementById('texture-search').oninput = (e) => this.filterTextures(e.target.value);
        this.ui.textureModal.querySelector('.close-modal').onclick = () => this.closeTextureModal();

        // Viewport Interaction
        const container = document.getElementById('viewport-container');
        container.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // Shortcuts
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Initial Data
        this.data = {
            defName: "NewLayout",
            windowWidth: 300,
            backgroundTexPath: "FunnelBit/UI/SomeBG.png",
            elements: []
        };
        this.render();
    }

    // --- Core Logic ---
    toggleTestMode() {
        this.isTestMode = !this.isTestMode;
        const btn = document.getElementById('btn-test-mode');
        if (btn) {
            if (this.isTestMode) {
                btn.classList.add('primary');
                btn.classList.remove('secondary');
                // Clear selection
                this.selectedElement = null;
                this.selectedVisual = null;
            } else {
                btn.classList.add('secondary');
                btn.classList.remove('primary');
            }
        }
        this.render();
    }

    showAddElementMenu() {
        // Simple prompt for now, can be improved to modal later
        // Using a makeshift modal or just a prompt sequence
        // Since we have a modal structure, let's reuse/abuse it or just use native prompt which is ugly but fast.
        // Actually, let's inject a simple choice list into the properties panel for UX.

        const p = this.ui.propsContent;
        p.innerHTML = '<h3>Add New Element</h3><p>Select type:</p>';

        const types = [
            { name: "Slot State Icon", type: "FunnelBit.FunnelGizmoElement_SlotStateIcon" },
            { name: "Toggle Button", type: "FunnelBit.FunnelGizmoElement_Toggle" },
            { name: "Bar Gauge", type: "FunnelBit.FunnelGizmoElement_BarGauge" }
        ];

        types.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'btn secondary';
            btn.style.width = '100%';
            btn.style.marginBottom = '8px';
            btn.textContent = t.name;
            btn.onclick = () => this.addElement(t.type);
            p.appendChild(btn);
        });

        const btnCancel = document.createElement('button');
        btnCancel.className = 'btn';
        btnCancel.style.width = '100%';
        btnCancel.textContent = 'Cancel';
        btnCancel.onclick = () => this.renderProperties(); // Restore previous view
        p.appendChild(btnCancel);
    }

    addElement(type) {
        const el = {
            type: type,
            position: { x: 50, y: 50 },
            size: { x: 64, y: 64 },
            visuals: []
        };

        // Defaults based on type
        if (type.includes("SlotStateIcon")) {
            el.slotIndex = 0;
            el.defaultTexPath = "UI/Gizmos/DefaultIcon";
        } else if (type.includes("Toggle")) {
            el.iconTexPathOn = "UI/Gizmos/ToggleOn";
            el.iconTexPathOff = "UI/Gizmos/ToggleOff";
            el.labelKey = "FunnelBit_Toggle_Auto";
        } else if (type.includes("BarGauge")) {
            el.size = { x: 100, y: 20 };
            el.backgroundTexPath = "UI/Widgets/BarBackground";
            el.visuals.push({
                type: "FunnelBit.FunnelGizmoVisualNode_BarGauge",
                offset: { x: 0, y: 0 },
                size: { x: 100, y: 20 },
                texPath: "UI/Widgets/BarFill",
                targetType: "Energy",
                expandDirection: "East"
            });
        }

        this.data.elements.push(el);
        this.selectElement(el);
    }

    // --- Texture Loading ---
    async loadTextures(fileList) {
        this.textures.clear();
        let count = 0;
        for (const file of fileList) {
            if (file.name.toLowerCase().endsWith('.png')) {
                let path = file.webkitRelativePath.replace(/\\/g, '/');
                if (path.startsWith('Textures/')) path = path.substring(9);
                const key = path.replace(/\.png$/i, '');
                const url = URL.createObjectURL(file);
                this.textures.set(key, url);
                count++;
            }
        }
        // alert(`Loaded ${count} textures.`); // Skipped as requested
        this.render();
    }

    resolveTexture(path) {
        if (!path) return null;
        return this.textures.get(path);
    }

    openTexturePicker(callback) {
        this.texturePickerCallback = callback;
        this.ui.textureModal.style.display = 'flex';
        this.filterTextures('');
    }

    closeTextureModal() {
        this.ui.textureModal.style.display = 'none';
        this.texturePickerCallback = null;
    }

    filterTextures(query) {
        const grid = this.ui.textureGrid;
        grid.innerHTML = '';
        const q = query.toLowerCase();

        for (const [key, url] of this.textures.entries()) {
            if (key.toLowerCase().includes(q)) {
                const item = document.createElement('div');
                item.className = 'texture-item';

                // Truncate name for display (start ellipsis)
                let displayKey = key;
                if (displayKey.length > 25) {
                    displayKey = '...' + displayKey.substring(displayKey.length - 22);
                }

                item.innerHTML = `<img src="${url}" class="texture-thumb"><div class="texture-name" title="${key}">${displayKey}</div>`;
                item.onclick = () => {
                    if (this.texturePickerCallback) this.texturePickerCallback(key);
                    this.closeTextureModal();
                };
                grid.appendChild(item);
            }
        }
    }

    // --- XML I/O ---
    importXml() {
        const text = this.ui.xmlInput.value;
        try {
            this.data = XmlIO.parse(text);
            this.selectedElement = null;
            this.selectedVisual = null;
            this.render();
        } catch (e) {
            alert("Error parsing XML: " + e.message);
        }
    }

    exportXml() {
        if (!this.data) return;
        const xml = XmlIO.toXml(this.data);
        this.ui.xmlInput.value = xml;
        navigator.clipboard.writeText(xml).then(() => alert("XML copied to clipboard!"));
    }

    // --- Rendering ---
    render() {
        this.updateTransform();
        this.renderElements();
        this.renderTree();
        this.renderProperties();
    }

    updateTransform() {
        this.ui.viewportWorld.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
        this.ui.zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
    }

    renderElements() {
        const world = this.ui.viewportWorld;
        world.innerHTML = '';

        // Prepare Draw List
        const drawList = [];

        // 1. Background
        if (this.data.drawWindowBackground && this.data.backgroundTexPath) {
            drawList.push({ type: 'bg', order: this.data.backgroundDrawOrder || 0, path: this.data.backgroundTexPath });
        }
        // 2. Overlay
        if (this.data.overlayTexPath) {
            drawList.push({ type: 'bg', order: this.data.overlayDrawOrder || 55, path: this.data.overlayTexPath });
        }
        // 3. Elements
        this.data.elements.forEach(el => {
            if (this.hiddenElements.has(el)) return;
            let order = 20;
            if (el.drawOrder != null) order = el.drawOrder;
            else if (el.type.includes("Toggle")) order = 30;
            drawList.push({ type: 'el', order: order, data: el });
        });

        drawList.sort((a, b) => a.order - b.order);

        drawList.forEach(item => {
            if (item.type === 'bg') {
                const img = document.createElement('img');
                img.style.position = 'absolute';
                img.style.left = '0'; img.style.top = '0';
                img.style.pointerEvents = 'none';
                const url = this.resolveTexture(item.path);
                if (url) img.src = url;
                if (this.data.windowWidth > 0 && item.order === (this.data.backgroundDrawOrder || 0)) {
                    img.style.width = this.data.windowWidth + 'px';
                }
                world.appendChild(img);
            } else {
                this.renderElement(world, item.data);
            }
        });
    }

    renderElement(container, el) {
        // Anchor - Represents the element's origin
        const anchor = document.createElement('div');
        anchor.className = 'gizmo-anchor';
        anchor.style.position = 'absolute';
        anchor.style.left = el.position.x + 'px';
        anchor.style.top = el.position.y + 'px';

        // --- Interaction Logic Separation ---

        // 1. Interaction Geometry
        let hW = el.size.x, hH = el.size.y, hX = 0, hY = 0;
        if (el.interactionSize) {
            hW = el.interactionSize.x; hH = el.interactionSize.y;
        }
        // Interaction Offset is relative to element origin
        if (el.interactionOffset) {
            hX = el.interactionOffset.x; hY = el.interactionOffset.y;
        }

        // 2. Interaction Box (The "Hitbox")
        const hitbox = document.createElement('div');
        hitbox.className = 'gizmo-hitbox';
        hitbox.style.left = hX + 'px';
        hitbox.style.top = hY + 'px';
        hitbox.style.width = hW + 'px';
        hitbox.style.height = hH + 'px';

        // 3. Element Box (Visual representation of element size, only if detailed interaction)
        let elBox = null;
        const isSelected = (el === this.selectedElement && !this.selectedVisual);

        // Logic:
        // - If Test Mode: Only Hitbox matters (interactable).
        // - If Edit Mode:
        //   - Unselected: Hitbox is dashed/faint (via CSS).
        //   - Selected:
        //     - Hitbox is dashed but highlighted.
        //     - If interactionSize is defined, show SOLID box for Element Size to distinguish.
        //     - Render Resize Handles.

        if (this.isTestMode) {
            hitbox.classList.add('test-mode-interactive');
            hitbox.onmousedown = (e) => {
                e.stopPropagation();
                this.simulateElementClick(el);
            };
        } else {
            // Edit Mode
            if (isSelected) {
                hitbox.classList.add('selected');

                // If specialized interaction size exists, show the true element size box
                if (el.interactionSize) {
                    elBox = document.createElement('div');
                    elBox.className = 'gizmo-element-box';
                    elBox.style.left = '0'; elBox.style.top = '0';
                    elBox.style.width = el.size.x + 'px';
                    elBox.style.height = el.size.y + 'px';

                    // Box handles resize ELEMENT SIZE
                    this.addResizeHandles(elBox, el, 'element_size');
                }

                // Hitbox handles resize INTERACTION AREA (if separated) or BOTH (if synced)
                // If interactionSize is null, it acts as legacy (hitbox = element size).
                const targetType = el.interactionSize ? 'interaction_size' : 'element_size';
                this.addResizeHandles(hitbox, el, targetType);
            }

            hitbox.onmousedown = (e) => {
                if (e.button === 0) {
                    e.stopPropagation();
                    if (!isSelected) this.selectElement(el);

                    // Drag Logic
                    if (e.shiftKey) {
                        // Shift+Drag interaction area -> Move Interaction Offset only
                        this.startDrag(e, el, 'interaction_offset');
                    } else {
                        // Normal Drag -> Move Element Position
                        this.startDrag(e, el, 'element');
                    }
                }
            };
        }

        // --- Visual Rendering ---
        const visRoot = document.createElement('div');
        visRoot.className = 'visuals-root';

        // 1. Element Main Visual (Simulation state)
        let texPath = el.defaultTexPath;
        if (el.type.includes("SlotStateIcon")) {
            const s = el._simState !== undefined ? el._simState : 1;
            const stateNames = ["Empty", "Docked", "Launched", "Returning", "Charging"];
            const curStateName = stateNames[s];
            if (el.stateMappings) {
                const map = el.stateMappings.find(m => m.states && m.states.includes(curStateName));
                if (map) texPath = map.texPath;
            }
        } else if (el.type.includes("Toggle")) {
            const on = el._simOn === true;
            texPath = on ? el.iconTexPathOn : el.iconTexPathOff;
        } else if (el.type.includes("BarGauge")) {
            texPath = el.backgroundTexPath;
        }

        if (texPath) {
            const img = this.makeVisualNodeDiv(texPath, el.size);
            img.style.left = '0'; img.style.top = '0';
            visRoot.appendChild(img);
        }

        // 2. Child Visuals
        if (el.visuals) {
            el.visuals.forEach(v => {
                let vPath = v.texPath;
                if (el.type.includes("Toggle")) {
                    if (v.visibleWhenToggleOn === true && el._simOn !== true) return;
                    if (v.visibleWhenToggleOn === false && el._simOn === true) return;
                }

                const vDiv = this.makeVisualNodeDiv(vPath, v.size);
                vDiv.style.left = v.offset.x + 'px';
                vDiv.style.top = v.offset.y + 'px';

                // skewAngle と skewAxis と rotation を組み合わせた transform を構築
                let transforms = [];
                if (v.skewAngle && v.skewAngle !== 0) {
                    const axis = v.skewAxis || "Horizontal";
                    if (axis === "Vertical") {
                        transforms.push(`skewX(${-v.skewAngle}deg)`);
                    } else {
                        transforms.push(`skewY(${-v.skewAngle}deg)`);
                    }
                }
                if (v.rotation) {
                    transforms.push(`rotate(${v.rotation}deg)`);
                }
                if (transforms.length > 0) {
                    vDiv.style.transform = transforms.join(' ');
                    vDiv.style.transformOrigin = 'left bottom';
                }

                // Visual Selection Logic (Strict: Selection ONLY via Tree, but Interaction enabled if selected)
                if (!this.isTestMode) {
                    if (v === this.selectedVisual) {
                        vDiv.classList.add('interactive'); // Enables pointer events

                        vDiv.onmousedown = (e) => {
                            e.stopPropagation();
                            this.startDrag(e, v, 'visual');
                        };

                        this.addResizeHandles(vDiv, v, 'visual');
                    } else {
                        // Unselected visuals are NOT interactable, as requested. 
                        // "Visual node can only be selected from the left element tree"
                    }
                }

                visRoot.appendChild(vDiv);
            });
        }

        anchor.appendChild(visRoot);
        if (elBox) anchor.appendChild(elBox);
        anchor.appendChild(hitbox); // Hitbox usually on top

        container.appendChild(anchor);
    }

    addResizeHandles(container, targetObj, targetType) {
        // targetType: 'element_size', 'interaction_size', 'visual'
        const handle = document.createElement('div');
        handle.className = 'resize-handle se';
        handle.style.pointerEvents = 'auto';
        handle.onmousedown = (e) => {
            e.stopPropagation();
            this.startResize(e, targetObj, 'se', targetType);
        };
        container.appendChild(handle);
    }

    makeVisualNodeDiv(path, size) {
        const d = document.createElement('div');
        d.className = 'visual-node';
        d.style.position = 'absolute';
        d.style.width = size.x + 'px';
        d.style.height = size.y + 'px';
        d.style.backgroundSize = 'contain';
        d.style.backgroundRepeat = 'no-repeat';
        const url = this.resolveTexture(path);
        if (url) d.style.backgroundImage = `url('${url}')`;
        // Apply rotation if present in data (passed down or set later?)
        // Since makeVisualNodeDiv is called with path and size, we need to apply rotation outside or pass it in.
        // Actually, let's just leave it here or modify call site.
        // Wait, makeVisualNodeDiv is helper. Let's update the call site in renderElement instead.
        return d;
    }

    // --- Simulation ---
    simulateElementClick(el) {
        if (el.type.includes("SlotStateIcon")) {
            // 1->2->3->4->1
            if (el._simState === undefined) el._simState = 1;
            el._simState++;
            if (el._simState > 4) el._simState = 1;
        } else if (el.type.includes("Toggle")) {
            el._simOn = !el._simOn;
        }
        this.renderElements();
    }

    // --- Tree View ---
    renderTree() {
        const tree = this.ui.treeView;
        tree.innerHTML = '';
        this.data.elements.forEach((el, i) => {
            const row = document.createElement('div');
            row.className = 'tree-node';
            if (el === this.selectedElement && !this.selectedVisual) row.classList.add('selected');
            const name = el.type.split('.').pop();
            const lbl = (el.type.includes("SlotStateIcon") ? `Slot ${el.slotIndex}` : name);
            row.textContent = `${i}: ${lbl}`;
            row.onclick = (e) => { e.stopPropagation(); this.selectElement(el); };
            tree.appendChild(row);

            if (el.visuals) {
                const sub = document.createElement('div');
                sub.className = 'tree-indent';
                el.visuals.forEach((v, vi) => {
                    const vRow = document.createElement('div');
                    vRow.className = 'tree-node';
                    if (v === this.selectedVisual) vRow.classList.add('selected');
                    vRow.textContent = `Visual: ${v.texPath.split('/').pop() || 'Texture'}`;

                    // Visual Node Selection ENABLED here
                    vRow.onclick = (e) => {
                        e.stopPropagation();
                        this.selectVisual(el, v);
                    };

                    sub.appendChild(vRow);
                });
                tree.appendChild(sub);
            }
        });
    }

    // --- Properties ---
    renderProperties() {
        const p = this.ui.propsContent;
        p.innerHTML = '';

        if (this.isTestMode) {
            p.innerHTML = '<div class="empty-state">Test Mode Active (Press T to exit)</div>';
            return;
        }

        if (this.selectedVisual) {
            this.renderVisualProperties(p, this.selectedVisual, this.selectedElement);
            return;
        }

        if (!this.selectedElement) {
            // Global Layout Settings
            p.innerHTML = `<h3>Layout Settings</h3>`;
            const d = this.data;
            if (!d) return;

            this.addPropText(p, "DefName", d.defName, v => d.defName = v);
            p.appendChild(document.createElement('hr'));

            this.addPropText(p, "Window Width", d.windowWidth, v => { d.windowWidth = parseFloat(v); this.renderElements(); });
            this.addPropText(p, "BG Texture", d.backgroundTexPath, v => { d.backgroundTexPath = v; this.renderElements(); }, true);
            this.addPropText(p, "Overlay Tex", d.overlayTexPath, v => { d.overlayTexPath = v; this.renderElements(); }, true);

            this.addPropBool(p, "Draw BG", d.drawWindowBackground, v => { d.drawWindowBackground = v; this.renderElements(); });
            this.addPropBool(p, "Hide MultiSel", d.hideWhenMultiSelected, v => d.hideWhenMultiSelected = v);
            this.addPropBool(p, "Merge MultiSel", d.mergeWhenMultiSelected, v => d.mergeWhenMultiSelected = v);
            this.addPropBool(p, "Use InnerRect", d.useInnerContentRect, v => { d.useInnerContentRect = v; this.renderElements(); });

            this.addPropText(p, "Inner Pad", d.innerPadding, v => { d.innerPadding = parseFloat(v); this.renderElements(); });
            this.addPropText(p, "BG Order", d.backgroundDrawOrder, v => { d.backgroundDrawOrder = parseFloat(v); this.renderElements(); });
            this.addPropText(p, "Overlay Order", d.overlayDrawOrder, v => { d.overlayDrawOrder = parseFloat(v); this.renderElements(); });
            this.addPropNumber(p, "Gizmo Order", d.gizmoOrder, v => { d.gizmoOrder = v !== null ? v : -90; });
            return;
        }

        const el = this.selectedElement;

        this.addPropVector2(p, "Position", el.position, (v) => { el.position = v; this.renderElements(); });
        this.addPropVector2(p, "Size", el.size, (v) => { el.size = v; this.renderElements(); });

        // Draw Order (描画順)
        this.addPropNumber(p, "Draw Order", el.drawOrder, (v) => { el.drawOrder = v; this.renderElements(); });

        // Interaction Size logic
        this.addPropVector2(p, "Int. Size", el.interactionSize || { x: 0, y: 0 }, (v) => {
            if (v.x === 0 && v.y === 0) el.interactionSize = null; else el.interactionSize = v;
            this.renderElements();
        });
        if (el.interactionSize) {
            this.addPropVector2(p, "Int. Offset", el.interactionOffset || { x: 0, y: 0 }, (v) => {
                el.interactionOffset = v; this.renderElements();
            });
        }

        if (el.type.includes("SlotStateIcon")) {
            this.addPropText(p, "Slot Index", el.slotIndex, (v) => el.slotIndex = parseInt(v));
            this.addPropText(p, "Default Tex", el.defaultTexPath, (v) => { el.defaultTexPath = v; this.renderElements(); }, true);
            const btnMap = document.createElement('button'); btnMap.className = 'btn secondary'; btnMap.textContent = `Edit State Mappings (${el.stateMappings?.length || 0})`;
            btnMap.onclick = () => this.renderMappingEditor(p, el);
            p.appendChild(btnMap);
        } else if (el.type.includes("Toggle")) {
            this.addPropText(p, "Label Key", el.labelKey, v => el.labelKey = v);

            const targetOpts = [
                "Auto",
                "TurretFocusFire",
                "TurretAutoFireAtFocus",
                "TurretAutoFire",
                "TurretOnlyAutoFireWhileDraft",
                "TurretDroneWorkEnabled"
            ];
            this.addPropSelect(p, "Target", el.target || "Auto", targetOpts, v => {
                el.target = v;
                el.labelKey = "FunnelBit_Toggle_" + v;
                this.renderProperties(); // Re-render to show updated label key
            });

            this.addPropText(p, "Icon On", el.iconTexPathOn, v => { el.iconTexPathOn = v; this.renderElements(); }, true);
            this.addPropText(p, "Icon Off", el.iconTexPathOff, v => { el.iconTexPathOff = v; this.renderElements(); }, true);
            this.addPropText(p, "Snd On", el.clickSoundOn, v => el.clickSoundOn = v);
            this.addPropText(p, "Snd Off", el.clickSoundOff, v => el.clickSoundOff = v);

        } else if (el.type.includes("BarGauge")) {
            this.addPropText(p, "Slot Index", el.slotIndex, v => el.slotIndex = parseInt(v));
            this.addPropText(p, "BG Tex", el.backgroundTexPath, v => { el.backgroundTexPath = v; this.renderElements(); }, true);
        }

        const btnAddV = document.createElement('button');
        btnAddV.className = 'btn secondary';
        btnAddV.textContent = 'Add Visual Node';
        btnAddV.onclick = () => this.addVisualNode(el);
        p.appendChild(document.createElement('hr'));
        p.appendChild(btnAddV);

        const btnDup = document.createElement('button'); btnDup.className = 'btn secondary'; btnDup.textContent = 'Duplicate Element'; btnDup.onclick = () => this.duplicateElement(el);
        const btnDel = document.createElement('button'); btnDel.className = 'btn secondary'; btnDel.style.borderColor = '#f44'; btnDel.textContent = 'Delete Element'; btnDel.onclick = () => this.deleteElement(el);
        p.appendChild(btnDup); p.appendChild(btnDel);
    }

    renderVisualProperties(p, v, parent) {
        p.innerHTML = '<h3>Visual Node</h3>';

        // Visual Node Class selector
        const visualTypes = [
            { name: "Texture", type: "FunnelBit.FunnelGizmoVisualNode_Texture" },
            { name: "UV Scroll Texture", type: "FunnelBit.FunnelGizmoVisualNode_UVScrollTexture" },
            { name: "Bar Gauge", type: "FunnelBit.FunnelGizmoVisualNode_BarGauge" }
        ];
        const currentTypeName = visualTypes.find(t => v.type.includes(t.type.split('.').pop()))?.name || "Texture";
        this.addPropSelect(p, "Class", currentTypeName, visualTypes.map(t => t.name), val => {
            const newType = visualTypes.find(t => t.name === val);
            if (newType) {
                v.type = newType.type;
                this.renderVisualProperties(p, v, parent); // Re-render to show/hide type-specific fields
            }
        });
        this.addPropVector2(p, "Offset", v.offset, val => { v.offset = val; this.renderElements(); });
        this.addPropVector2(p, "Size", v.size, val => { v.size = val; this.renderElements(); });

        this.addPropText(p, "Texture", v.texPath, val => { v.texPath = val; this.renderElements(); }, true);

        // Draw Order (描画順)
        this.addPropNumber(p, "Draw Order", v.drawOrder, val => { v.drawOrder = val; });

        // Detailed Visual Properties
        this.addPropVector2(p, "UV Scroll", v.uvScrollSpeed || { x: 0, y: 0 }, val => {
            v.uvScrollSpeed = val;
            // Note: Visual preview of UV scrolling not supported yet, but data is saved.
        });
        this.addPropText(p, "Color", v.color, val => {
            v.color = val;
            // Note: Visual preview of tinting not supported yet
        });
        this.addPropText(p, "Rotation", v.rotation, val => {
            v.rotation = parseFloat(val) || 0;
            this.renderElements();
        });

        if (v.type.includes("BarGauge")) {
            p.appendChild(document.createElement('hr'));
            this.addPropSelect(p, "Target", v.targetType || "Energy", ["Energy", "Speed", "Acceleration", "LifeTime"], val => { v.targetType = val; });
            this.addPropSelect(p, "Direction", v.expandDirection || "East", ["North", "East", "South", "West"], val => { v.expandDirection = val; });
            this.addPropText(p, "Min Value", v.minValue, val => { v.minValue = parseFloat(val); });
            this.addPropText(p, "Max Value", v.maxValue, val => { v.maxValue = parseFloat(val); });
            this.addPropNumber(p, "Skew Angle", v.skewAngle, val => { v.skewAngle = val || 0; this.renderElements(); });
            this.addPropSelect(p, "Skew Axis", v.skewAxis || "Horizontal", ["Horizontal", "Vertical"], val => { v.skewAxis = val; this.renderElements(); });
        }

        const btnDel = document.createElement('button');
        btnDel.className = 'btn secondary';
        btnDel.style.borderColor = '#f44';
        btnDel.textContent = 'Delete Visual';
        btnDel.onclick = () => {
            const idx = parent.visuals.indexOf(v);
            if (idx > -1) {
                parent.visuals.splice(idx, 1);
                this.selectedVisual = null;
                this.render();
            }
        };

        const btnDup = document.createElement('button');
        btnDup.className = 'btn secondary';
        btnDup.textContent = 'Duplicate Visual';
        btnDup.onclick = () => this.duplicateVisual(parent, v);

        p.appendChild(btnDup); p.appendChild(btnDel);

        const btnBack = document.createElement('button');
        btnBack.className = 'btn primary';
        btnBack.textContent = 'Back to Element';
        btnBack.onclick = () => { this.selectedVisual = null; this.renderProperties(); };
        p.appendChild(btnBack);
    }

    renderMappingEditor(p, el) {
        p.innerHTML = '<h3>State Mappings</h3>';
        (el.stateMappings || []).forEach((map, i) => {
            const div = document.createElement('div'); div.style.border = '1px solid #444'; div.style.padding = '4px'; div.style.marginBottom = '4px';

            // Allow editing states
            this.addPropText(div, "States", (map.states || []).join(', '), v => {
                map.states = v.split(',').map(s => s.trim()).filter(s => s);
            });
            this.addPropText(div, "Tex", map.texPath, v => { map.texPath = v; this.renderElements(); }, true);
            const btnRem = document.createElement('button'); btnRem.textContent = 'Remove'; btnRem.onclick = () => { el.stateMappings.splice(i, 1); this.renderMappingEditor(p, el); this.renderElements(); };
            div.appendChild(btnRem);
            p.appendChild(div);
        });
        const btnAdd = document.createElement('button'); btnAdd.textContent = 'Add Mapping';
        btnAdd.onclick = () => {
            if (!el.stateMappings) el.stateMappings = [];
            el.stateMappings.push({ states: ['Docked'], texPath: '' });
            this.renderMappingEditor(p, el);
        };
        p.appendChild(btnAdd);
        const btnBack = document.createElement('button'); btnBack.textContent = 'Done'; btnBack.className = 'btn primary';
        btnBack.onclick = () => this.renderProperties();
        p.appendChild(btnBack);
    }

    // --- Helpers ---
    addPropVector2(p, l, val, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;
        const grp = document.createElement('div'); grp.className = 'prop-group-h';
        const x = document.createElement('input'); x.type = 'number'; x.className = 'prop-input'; x.value = val.x;
        const y = document.createElement('input'); y.type = 'number'; y.className = 'prop-input'; y.value = val.y;
        const f = () => cb({ x: parseFloat(x.value) || 0, y: parseFloat(y.value) || 0 });
        x.oninput = f; y.oninput = f;
        grp.appendChild(x); grp.appendChild(y); row.appendChild(grp); p.appendChild(row);
    }

    addPropText(p, l, val, cb, isTex = false) {
        const row = document.createElement('div'); row.className = 'prop-row';
        const lbl = document.createElement('span'); lbl.className = 'prop-label'; lbl.textContent = l;
        row.appendChild(lbl);
        const grp = document.createElement('div'); if (isTex) grp.className = 'texture-input-group';
        const inp = document.createElement('input'); inp.className = 'prop-input'; inp.value = val || '';
        inp.onchange = () => cb(inp.value);
        grp.appendChild(inp);
        if (isTex) {
            const btn = document.createElement('button'); btn.textContent = '...';
            btn.onclick = () => this.openTexturePicker((path) => { inp.value = path; cb(path); });
            grp.appendChild(btn);
        }
        row.appendChild(grp); p.appendChild(row);
    }

    addPropSelect(p, l, val, options, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;
        const sel = document.createElement('select'); sel.className = 'prop-input';
        options.forEach(o => {
            const opt = document.createElement('option'); opt.value = o; opt.textContent = o;
            if (o === val) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = () => cb(sel.value);
        row.appendChild(sel); p.appendChild(row);
    }

    addPropBool(p, l, val, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'space-between';
        row.innerHTML = `<span class="prop-label" style="margin:0">${l}</span>`;
        const chk = document.createElement('input'); chk.type = 'checkbox';
        chk.checked = !!val;
        chk.onchange = () => cb(chk.checked);
        row.appendChild(chk); p.appendChild(row);
    }

    // 省略可能な数値入力（空欄でnull/undefined）
    addPropNumber(p, l, val, cb) {
        const row = document.createElement('div'); row.className = 'prop-row';
        row.innerHTML = `<span class="prop-label">${l}</span>`;
        const inp = document.createElement('input'); inp.type = 'number'; inp.className = 'prop-input';
        inp.value = (val !== null && val !== undefined) ? val : '';
        inp.placeholder = 'default';
        inp.onchange = () => {
            const v = inp.value.trim();
            cb(v === '' ? null : parseFloat(v));
        };
        row.appendChild(inp); p.appendChild(row);
    }

    addVisualNode(el) {
        if (!el.visuals) el.visuals = [];
        let vType = "FunnelBit.FunnelGizmoVisualNode_Texture";
        if (el.type.includes("BarGauge")) vType = "FunnelBit.FunnelGizmoVisualNode_BarGauge";

        const v = { type: vType, offset: { x: 0, y: 0 }, size: { x: 50, y: 20 }, texPath: "" };
        el.visuals.push(v);
        this.selectVisual(el, v);
    }

    selectElement(el) {
        this.selectedElement = el;
        this.selectedVisual = null;
        this.render();
    }

    selectVisual(el, v) {
        this.selectedElement = el;
        this.selectedVisual = v;
        this.render();
    }

    duplicateElement(el) {
        const c = JSON.parse(JSON.stringify(el)); c.position.x += 10; c.position.y += 10;
        this.data.elements.push(c); this.selectElement(c);
    }

    duplicateVisual(parent, v) {
        const c = JSON.parse(JSON.stringify(v));
        c.offset.x += 5; c.offset.y += 5;
        parent.visuals.push(c);
        this.selectVisual(parent, c);
    }

    deleteElement(el) {
        const i = this.data.elements.indexOf(el);
        if (i > -1) { this.data.elements.splice(i, 1); this.selectedElement = null; this.render(); }
    }

    // --- Mouse Handling ---
    handleMouseDown(e) {
        if (e.button === 0 && e.target.id === 'viewport-container') {
            this.selectedElement = null; this.selectedVisual = null; this.render();
        }
    }

    handleMouseMove(e) {
        if (e.buttons === 4 || (e.buttons === 1 && e.altKey)) { // Pan
            this.pan.x += e.movementX; this.pan.y += e.movementY; this.updateTransform(); return;
        }

        if (this.isDragging) {
            const dx = (e.clientX - this.dragStartMs.x) / this.zoom;
            const dy = (e.clientY - this.dragStartMs.y) / this.zoom;

            if (this.dragType === 'element' && this.selectedElement) {
                this.selectedElement.position.x = Math.round(this.dragStartObj.x + dx);
                this.selectedElement.position.y = Math.round(this.dragStartObj.y + dy);
            }
            else if (this.dragType === 'interaction_offset' && this.selectedElement) {
                if (!this.selectedElement.interactionOffset) this.selectedElement.interactionOffset = { x: 0, y: 0 };
                this.selectedElement.interactionOffset.x = Math.round(this.dragStartObj.x + dx);
                this.selectedElement.interactionOffset.y = Math.round(this.dragStartObj.y + dy);
            }
            else if (this.dragType === 'visual' && this.selectedVisual) {
                this.selectedVisual.offset.x = Math.round(this.dragStartObj.x + dx);
                this.selectedVisual.offset.y = Math.round(this.dragStartObj.y + dy);
            }
            this.renderElements(); this.renderProperties();
        }

        if (this.isResizing) {
            const dx = (e.clientX - this.dragStartMs.x) / this.zoom;
            const dy = (e.clientY - this.dragStartMs.y) / this.zoom;
            const target = this.resizeTarget;

            let nw = this.dragStartObj.x + dx;
            let nh = this.dragStartObj.y + dy;
            if (nw < 1) nw = 1; if (nh < 1) nh = 1;

            if (this.resizeTargetType === 'visual') {
                this.selectedVisual.size.x = Math.round(nw);
                this.selectedVisual.size.y = Math.round(nh);
            }
            else if (this.resizeTargetType === 'interaction_size') {
                if (!target.interactionSize) target.interactionSize = { x: target.size.x, y: target.size.y };
                target.interactionSize.x = Math.round(nw);
                target.interactionSize.y = Math.round(nh);
            }
            else if (this.resizeTargetType === 'element_size') {
                target.size.x = Math.round(nw);
                target.size.y = Math.round(nh);
            }
            this.renderElements(); this.renderProperties();
        }
    }

    handleMouseUp(e) { this.isDragging = false; this.isResizing = false; }

    startDrag(e, obj, type) {
        if (this.isResizing || this.isTestMode) return;
        this.isDragging = true;
        this.dragType = type;
        this.dragStartMs = { x: e.clientX, y: e.clientY };

        if (type === 'element') this.dragStartObj = { x: obj.position.x, y: obj.position.y };
        else if (type === 'interaction_offset') {
            if (!obj.interactionOffset) obj.interactionOffset = { x: 0, y: 0 };
            this.dragStartObj = { x: obj.interactionOffset.x, y: obj.interactionOffset.y };
        }
        else if (type === 'visual') this.dragStartObj = { x: obj.offset.x, y: obj.offset.y };
    }

    startResize(e, target, handle, type) {
        if (this.isTestMode) return;
        this.isResizing = true;
        this.resizeHandle = handle;
        this.resizeTarget = target;
        this.resizeTargetType = type;
        this.dragStartMs = { x: e.clientX, y: e.clientY };

        if (type === 'visual') {
            this.dragStartObj = { x: target.size.x, y: target.size.y };
        }
        else if (type === 'interaction_size') {
            if (target.interactionSize) this.dragStartObj = { x: target.interactionSize.x, y: target.interactionSize.y };
            else this.dragStartObj = { x: target.size.x, y: target.size.y };
        }
        else if (type === 'element_size') {
            this.dragStartObj = { x: target.size.x, y: target.size.y };
        }
    }

    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // T for Test Mode
        if (e.key.toLowerCase() === 't') {
            this.toggleTestMode();
        }

        // Nudge
        if (!this.selectedElement || this.isTestMode) return;

        const step = e.shiftKey ? 10 : 1;
        const target = this.selectedVisual ? this.selectedVisual.offset : this.selectedElement.position;

        let changed = false;
        if (e.key === 'ArrowLeft') { target.x -= step; changed = true; }
        if (e.key === 'ArrowRight') { target.x += step; changed = true; }
        if (e.key === 'ArrowUp') { target.y -= step; changed = true; }
        if (e.key === 'ArrowDown') { target.y += step; changed = true; }

        if (changed) {
            e.preventDefault();
            this.renderElements(); this.renderProperties();
        }

        // H key handlers
        if (e.code === 'KeyH') {
            // Shift+H: Toggle Visibility of ALL OTHERS (Isolate)
            if (e.shiftKey) {
                if (!this.hiddenElements) this.hiddenElements = new Set();

                // Get all other elements
                const others = this.data.elements.filter(el => el !== this.selectedElement);
                if (others.length === 0) return;

                const allOthersHidden = others.every(el => this.hiddenElements.has(el));

                if (allOthersHidden) {
                    // Show all others
                    others.forEach(el => this.hiddenElements.delete(el));
                } else {
                    // Hide all others
                    others.forEach(el => this.hiddenElements.add(el));
                }
                this.renderElements();
            }
            // h (no shift): Toggle Visibility of SELECTED
            else if (!e.ctrlKey && !e.altKey && !this.selectedVisual) {
                if (!this.hiddenElements) this.hiddenElements = new Set();
                if (this.hiddenElements.has(this.selectedElement)) this.hiddenElements.delete(this.selectedElement);
                else this.hiddenElements.add(this.selectedElement);
                this.renderElements();
            }
        }
    }

    autoWidth() {
        if (!this.data.backgroundTexPath) return;
        const url = this.resolveTexture(this.data.backgroundTexPath);
        if (url) {
            const img = new Image();
            img.onload = () => {
                this.data.windowWidth = img.naturalWidth;
                this.render();
                alert("Window Width set to " + img.naturalWidth);
            };
            img.src = url;
        } else alert("BG Texture not loaded");
    }

    resetView() {
        this.zoom = 1.0; this.pan = { x: 100, y: 100 }; this.updateTransform();
    }

    handleWheel(e) {
        try {
            if (e.buttons === 4) return;
            e.preventDefault();
            const delta = -Math.sign(e.deltaY) * 0.1;
            this.zoom = Math.max(0.1, Math.min(5.0, this.zoom + delta));
            this.updateTransform();
        } catch (err) {
            console.error(err);
            alert("Wheel Error: " + err.message);
        }
    }
}
// Init
const app = new App();
