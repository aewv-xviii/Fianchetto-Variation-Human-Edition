
// Canvas and UI elements
const canvas = document.getElementById('curveCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');
const coordsDisplay = document.getElementById('coordsDisplay');
const xmlOutput = document.getElementById('xmlOutput');
const bezierSamplesInput = document.getElementById('bezierSamples');
const bezierSamplesSlider = document.getElementById('bezierSamplesSlider');
const bezierControls = document.getElementById('bezierControls');

// State
let points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 }
]; // Array of {x, y} for manual mode

// Bezier Points
let bezierPoints = [
    { x: 0, y: 0, isCorner: false },    // Anchor 0
    { x: 0.5, y: 1 },  // Control 0-1
    { x: 0.5, y: 1 },  // Control 1-0 
    { x: 1, y: 1, isCorner: false }     // Anchor 1
];

let mode = 'manual'; // 'manual' or 'bezier'
let samplingMode = 'uniform'; // 'uniform' or 'curvature'
let scale = 300; // Pixels per unit (Zoomed in for 0-1 focus)
let offsetX = 0; // View offset X (pixels)
let offsetY = 0; // View offset Y (pixels)
let isDragging = false;
let dragPointIndex = -1;
let dragType = null; // 'point' or 'view'
let lastMouseX = 0;
let lastMouseY = 0;
let dragStartPos = { x: 0, y: 0 };
let dragStartMouse = { x: 0, y: 0 };
let lastClickTime = 0; // For double click detection
let dragGroup = []; // Array of { index, startX, startY }

// Init
function init() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    centerView();
    setupEventListeners();
    render();
    updateXML();
}

function resizeCanvas() {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    render();
}

function centerView() {
    offsetX = (canvas.width / 2) - (0.5 * scale);
    offsetY = (canvas.height / 2) - (0.5 * scale);
    render();
}

function worldToScreen(wx, wy) {
    return {
        x: (wx * scale) + offsetX,
        y: canvas.height - ((wy * scale) + offsetY)
    };
}

function screenToWorld(sx, sy) {
    return {
        x: (sx - offsetX) / scale,
        y: ((canvas.height - sy) - offsetY) / scale
    };
}

function setupEventListeners() {
    document.querySelectorAll('input[name="editMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            mode = e.target.value;
            bezierControls.style.display = mode === 'bezier' ? 'block' : 'none';
            render();
            updateXML();
        });
    });

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('dblclick', onDoubleClick);

    document.getElementById('clearBtn').addEventListener('click', () => {
        if (mode === 'manual') points = [];
        else {
            bezierPoints = [
                { x: 0, y: 0, isCorner: false },
                { x: 0.5, y: 0.5 },
                { x: 0.5, y: 0.5 },
                { x: 1, y: 1, isCorner: false }
            ];
        }
        render();
        updateXML();
    });

    document.getElementById('fitBtn').addEventListener('click', centerView);

    document.getElementById('copyBtn').addEventListener('click', () => {
        xmlOutput.select();
        document.execCommand('copy');
    });

    if (bezierSamplesInput && bezierSamplesSlider) {
        bezierSamplesInput.addEventListener('input', () => {
            let val = parseInt(bezierSamplesInput.value);
            if (val < 2) val = 2;
            if (val > 100) val = 100;
            bezierSamplesSlider.value = val;
            updateXML();
            render();
        });

        bezierSamplesSlider.addEventListener('input', () => {
            bezierSamplesInput.value = bezierSamplesSlider.value;
            updateXML();
            render();
        });
    }

    // サンプリングモード切り替え
    document.querySelectorAll('input[name="samplingMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            samplingMode = e.target.value;
            updateXML();
            render();
        });
    });
}

function onMouseDown(e) {
    const mouse = getMousePos(e);
    const worldMouse = screenToWorld(mouse.x, mouse.y);
    lastMouseX = mouse.x;
    lastMouseY = mouse.y;
    dragStartMouse = { x: mouse.x, y: mouse.y };

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
        isDragging = true;
        dragType = 'view';
        return;
    }

    if (e.button === 0) { // Left click
        const hit = hitTest(mouse.x, mouse.y);

        if (hit.index !== -1) {
            isDragging = true;
            dragType = 'point';
            dragPointIndex = hit.index;
            const pts = mode === 'bezier' ? bezierPoints : points;
            dragStartPos = { ...pts[dragPointIndex] };

            // Prepare drag group
            dragGroup = [];
            dragGroup.push({ index: hit.index, startX: pts[hit.index].x, startY: pts[hit.index].y });

            // If Anchor, add neighbors
            if (mode === 'bezier' && hit.index % 3 === 0) {
                if (hit.index > 0) {
                    dragGroup.push({
                        index: hit.index - 1,
                        startX: pts[hit.index - 1].x,
                        startY: pts[hit.index - 1].y
                    });
                }
                if (hit.index < pts.length - 1) {
                    dragGroup.push({
                        index: hit.index + 1,
                        startX: pts[hit.index + 1].x,
                        startY: pts[hit.index + 1].y
                    });
                }
            }

        } else {
            if (mode === 'manual') {
                points.push({ x: worldMouse.x, y: worldMouse.y });
                points.sort((a, b) => a.x - b.x);
                render();
                updateXML();
            } else if (mode === 'bezier') {
                if (e.ctrlKey) {
                    const splitInfo = getClosestPointOnBezier(worldMouse.x, worldMouse.y);
                    if (splitInfo && splitInfo.dist < 10 / scale) {
                        splitBezier(splitInfo.segmentIndex, splitInfo.t);
                        render();
                        updateXML();
                        return;
                    }
                }
            }
        }
    } else if (e.button === 2) { // Right click
        const hit = hitTest(mouse.x, mouse.y);
        if (hit.index !== -1) {
            if (mode === 'manual') {
                points.splice(hit.index, 1);
            } else {
                if (bezierPoints.length > 4 && hit.index % 3 === 0) {
                    if (hit.index === 0) bezierPoints.splice(0, 3);
                    else if (hit.index === bezierPoints.length - 1) bezierPoints.splice(bezierPoints.length - 3, 3);
                    else bezierPoints.splice(hit.index - 1, 3);
                }
            }
            render();
            updateXML();
        }
    }
}

function onDoubleClick(e) {
    if (mode !== 'bezier') return;
    const mouse = getMousePos(e);
    const hit = hitTest(mouse.x, mouse.y);
    if (hit.index !== -1 && hit.index % 3 === 0) { // Is Anchor
        const p = bezierPoints[hit.index];
        p.isCorner = !p.isCorner;
        if (!p.isCorner) {
            smoothAnchor(hit.index);
        }
        render();
    }
}

function smoothAnchor(index) {
    const hasPrev = index > 0;
    const hasNext = index < bezierPoints.length - 1;

    if (hasPrev && hasNext) {
        const prevC = bezierPoints[index - 1]; // Left handle
        const nextC = bezierPoints[index + 1]; // Right handle
        const anchor = bezierPoints[index];

        const dx1 = anchor.x - prevC.x;
        const dy1 = anchor.y - prevC.y;
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

        const dx2 = nextC.x - anchor.x;
        const dy2 = nextC.y - anchor.y;
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        const angle = Math.atan2(dy2, dx2);

        prevC.x = anchor.x - Math.cos(angle) * len1;
        prevC.y = anchor.y - Math.sin(angle) * len1;
    }
}

function onMouseMove(e) {
    const mouse = getMousePos(e);
    const useSnap = e.ctrlKey;
    const snapSize = 0.1;
    const useAxisLock = e.shiftKey;

    let worldPos = screenToWorld(mouse.x, mouse.y);
    coordsDisplay.textContent = `X: ${worldPos.x.toFixed(2)}, Y: ${worldPos.y.toFixed(2)}`;

    if (isDragging) {
        if (dragType === 'view') {
            offsetX += mouse.x - lastMouseX;
            offsetY -= mouse.y - lastMouseY;
        } else if (dragType === 'point') {
            const currentPoints = mode === 'bezier' ? bezierPoints : points;

            let newPos = { ...worldPos };

            if (useAxisLock) {
                if (Math.abs(newPos.x - dragStartPos.x) > Math.abs(newPos.y - dragStartPos.y)) {
                    newPos.y = dragStartPos.y;
                } else {
                    newPos.x = dragStartPos.x;
                }
            }

            if (useSnap) {
                newPos.x = Math.round(newPos.x / snapSize) * snapSize;
                newPos.y = Math.round(newPos.y / snapSize) * snapSize;
            }

            const totalDx = newPos.x - dragStartPos.x;
            const totalDy = newPos.y - dragStartPos.y;

            dragGroup.forEach(item => {
                if (currentPoints[item.index]) {
                    currentPoints[item.index].x = item.startX + totalDx;
                    currentPoints[item.index].y = item.startY + totalDy;
                }
            });

            // Handle Sync Logic For Controls (Rotation)
            if (mode === 'bezier' && dragPointIndex % 3 !== 0) {
                let parentIdx = -1;
                let siblingIdx = -1;

                if (dragPointIndex % 3 === 1) { // Right handle of P[i-1]
                    parentIdx = dragPointIndex - 1;
                    siblingIdx = parentIdx - 1;
                } else if (dragPointIndex % 3 === 2) { // Left handle of P[i+1]
                    parentIdx = dragPointIndex + 1;
                    siblingIdx = parentIdx + 1;
                }

                if (parentIdx >= 0 && bezierPoints[parentIdx] && !bezierPoints[parentIdx].isCorner) {
                    if (siblingIdx >= 0 && siblingIdx < bezierPoints.length) {
                        const parent = bezierPoints[parentIdx];
                        const current = bezierPoints[dragPointIndex];
                        const sibling = bezierPoints[siblingIdx];

                        const dx = current.x - parent.x;
                        const dy = current.y - parent.y;
                        const lenSibling = Math.sqrt(Math.pow(sibling.x - parent.x, 2) + Math.pow(sibling.y - parent.y, 2));

                        const lenCurrent = Math.sqrt(dx * dx + dy * dy);
                        if (lenCurrent > 0.0001) {
                            sibling.x = parent.x - (dx / lenCurrent) * lenSibling;
                            sibling.y = parent.y - (dy / lenCurrent) * lenSibling;
                        }
                    }
                }
            }
            updateXML();
        }
        render();
    }

    lastMouseX = mouse.x;
    lastMouseY = mouse.y;
}

function onMouseUp(e) {
    isDragging = false;
    dragPointIndex = -1;
    dragType = null;
    if (mode === 'manual') {
        points.sort((a, b) => a.x - b.x);
        render();
        updateXML();
    }
}

function onWheel(e) {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const scroll = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(scroll * zoomIntensity);

    const mouse = getMousePos(e);
    const worldMouseBefore = screenToWorld(mouse.x, mouse.y);

    scale *= zoomFactor;
    scale = Math.max(1, Math.min(scale, 1000));

    offsetX = mouse.x - (worldMouseBefore.x * scale);
    offsetY = (canvas.height - mouse.y) - (worldMouseBefore.y * scale);

    render();
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

function hitTest(x, y) {
    const threshold = 10;
    const currentPoints = mode === 'bezier' ? bezierPoints : points;

    for (let i = 0; i < currentPoints.length; i++) {
        const p = currentPoints[i];
        const sp = worldToScreen(p.x, p.y);
        const dx = x - sp.x;
        const dy = y - sp.y;
        if (dx * dx + dy * dy < threshold * threshold) {
            return { index: i };
        }
    }
    return { index: -1 };
}

function getClosestPointOnBezier(wx, wy) {
    let bestDist = Infinity;
    let bestT = 0;
    let bestSeg = -1;

    const numSegments = (bezierPoints.length - 1) / 3;
    const samples = 100;

    for (let s = 0; s < numSegments; s++) {
        const i = s * 3;
        const p0 = bezierPoints[i];
        const p1 = bezierPoints[i + 1];
        const p2 = bezierPoints[i + 2];
        const p3 = bezierPoints[i + 3];

        for (let j = 0; j <= samples; j++) {
            const t = j / samples;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            const x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
            const y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;

            const dist = Math.sqrt(Math.pow(x - wx, 2) + Math.pow(y - wy, 2));
            if (dist < bestDist) {
                bestDist = dist;
                bestT = t;
                bestSeg = s;
            }
        }
    }
    return { dist: bestDist, t: bestT, segmentIndex: bestSeg };
}

function splitBezier(segIdx, t) {
    const i = segIdx * 3;
    const p0 = bezierPoints[i];
    const p1 = bezierPoints[i + 1];
    const p2 = bezierPoints[i + 2];
    const p3 = bezierPoints[i + 3];

    const split = (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
    });

    const q0 = split(p0, p1, t);
    const q1 = split(p1, p2, t);
    const q2 = split(p2, p3, t);

    const r0 = split(q0, q1, t);
    const r1 = split(q1, q2, t);

    const s = split(r0, r1, t);

    const newItems = [
        q0, r0,
        { ...s, isCorner: false },
        r1, q2
    ];

    bezierPoints.splice(i + 1, 2, ...newItems);
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGrid();
    drawAxes();

    if (mode === 'manual') {
        drawPoints(points, '#3b82f6');
        drawLines(points, '#3b82f6');
    } else {
        drawTrueBezier();
        drawBezierControlPoints();
        drawBezierCurve();
    }
}

function drawGrid() {
    const tl = screenToWorld(0, 0);
    const br = screenToWorld(canvas.width, canvas.height);

    let step = 1;
    if (scale < 20) step = 5;
    if (scale < 5) step = 10;
    else if (scale > 100) step = 0.1;

    const startX = Math.floor(tl.x / step) * step;
    const endX = br.x;
    const startY = Math.floor(br.y / step) * step;
    const endY = tl.y;

    if ((endX - startX) / step > 2000 || (endY - startY) / step > 2000) return;

    const drawLineSet = (isVertical) => {
        const start = isVertical ? startX : startY;
        const end = isVertical ? endX : endY;

        for (let val = start; val <= end; val += step) {
            const isInteger = Math.abs(val - Math.round(val)) < 0.001;

            ctx.beginPath();
            ctx.strokeStyle = isInteger ? '#333' : '#222';
            ctx.lineWidth = isInteger ? 2 : 1;

            if (isVertical) {
                const sx = worldToScreen(val, 0).x;
                ctx.moveTo(sx, 0); ctx.lineTo(sx, canvas.height);
            } else {
                const sy = worldToScreen(0, val).y;
                ctx.moveTo(0, sy); ctx.lineTo(canvas.width, sy);
            }
            ctx.stroke();
        }
    };

    drawLineSet(true); drawLineSet(false);
}

function drawAxes() {
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.beginPath();
    const origin = worldToScreen(0, 0);
    ctx.moveTo(0, origin.y); ctx.lineTo(canvas.width, origin.y);
    ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, canvas.height);
    ctx.stroke();
}

function drawPoints(pts, color) {
    ctx.fillStyle = color;
    pts.forEach(p => {
        const sp = worldToScreen(p.x, p.y);
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.fill();
    });
}

function drawLines(pts, color) {
    if (pts.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    const start = worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < pts.length; i++) {
        const p = worldToScreen(pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
}

function drawBezierControlPoints() {
    ctx.strokeStyle = '#666'; ctx.setLineDash([5, 5]); ctx.beginPath();
    for (let i = 0; i < bezierPoints.length - 1; i += 3) {
        const p0 = worldToScreen(bezierPoints[i].x, bezierPoints[i].y);
        const p1 = worldToScreen(bezierPoints[i + 1].x, bezierPoints[i + 1].y);
        const p2 = worldToScreen(bezierPoints[i + 2].x, bezierPoints[i + 2].y);
        const p3 = worldToScreen(bezierPoints[i + 3].x, bezierPoints[i + 3].y);
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke(); ctx.setLineDash([]);

    for (let i = 0; i < bezierPoints.length; i++) {
        const isAnchor = (i % 3 === 0);
        const color = isAnchor ? '#3b82f6' : '#a855f7';
        const label = isAnchor ? (i === 0 ? 'S' : (i === bezierPoints.length - 1 ? 'E' : 'A')) : 'C';

        const p = bezierPoints[i];
        const sp = worldToScreen(p.x, p.y);
        ctx.fillStyle = color;
        ctx.beginPath();

        if (isAnchor && p.isCorner) {
            ctx.rect(sp.x - 5, sp.y - 5, 10, 10);
        } else {
            ctx.arc(sp.x, sp.y, isAnchor ? 6 : 4, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.fillStyle = '#fff'; ctx.font = '10px Inter';
        ctx.fillText(label, sp.x + 8, sp.y + 3);
    }
}

function drawBezierCurve() {
    const samples = parseInt(bezierSamplesInput.value) || 10;
    const curvePoints = generateBezierPoints(samples);
    drawLines(curvePoints, '#10b981');
    ctx.fillStyle = '#10b981';
    curvePoints.forEach(p => {
        const sp = worldToScreen(p.x, p.y);
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2); ctx.fill();
    });
}

function drawTrueBezier() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (bezierPoints.length < 4) return;

    const start = worldToScreen(bezierPoints[0].x, bezierPoints[0].y);
    ctx.moveTo(start.x, start.y);

    for (let i = 0; i < bezierPoints.length - 1; i += 3) {
        const cp1 = worldToScreen(bezierPoints[i + 1].x, bezierPoints[i + 1].y);
        const cp2 = worldToScreen(bezierPoints[i + 2].x, bezierPoints[i + 2].y);
        const end = worldToScreen(bezierPoints[i + 3].x, bezierPoints[i + 3].y);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
    }
    ctx.stroke();
}

function bezierPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    return {
        x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
        y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
    };
}

function bezierDerivative(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    return {
        x: 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
        y: 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y)
    };
}

function bezierSecondDerivative(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    return {
        x: 6 * mt * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
        y: 6 * mt * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y)
    };
}

// 曲率を計算: κ = |v × a| / |v|³
function computeCurvature(p0, p1, p2, p3, t) {
    const d1 = bezierDerivative(p0, p1, p2, p3, t);
    const d2 = bezierSecondDerivative(p0, p1, p2, p3, t);
    
    const cross = d1.x * d2.y - d1.y * d2.x;
    const speed = Math.sqrt(d1.x * d1.x + d1.y * d1.y);
    
    if (speed < 0.0001) return 0;
    return Math.abs(cross) / (speed * speed * speed);
}

function generateCurvatureSampledPoints(totalSamples) {
    const numSegments = (bezierPoints.length - 1) / 3;
    if (numSegments < 1) return [];
    
    const curvatureResolution = 100; 
    const curvatureSamples = [];
    
    for (let s = 0; s < numSegments; s++) {
        const i = s * 3;
        const p0 = bezierPoints[i];
        const p1 = bezierPoints[i + 1];
        const p2 = bezierPoints[i + 2];
        const p3 = bezierPoints[i + 3];
        
        for (let j = 0; j <= curvatureResolution; j++) {
            const t = j / curvatureResolution;
            if (s > 0 && j === 0) continue; 
            
            const curvature = computeCurvature(p0, p1, p2, p3, t);
            const point = bezierPoint(p0, p1, p2, p3, t);
            curvatureSamples.push({
                segment: s,
                t: t,
                curvature: curvature,
                x: point.x,
                y: point.y
            });
        }
    }
    
    if (curvatureSamples.length === 0) return [];
    
    const minK = 0.1;
    const weights = curvatureSamples.map(s => minK + s.curvature);
    
    const cumulative = [0];
    for (let i = 0; i < weights.length; i++) {
        cumulative.push(cumulative[i] + weights[i]);
    }
    const totalWeight = cumulative[cumulative.length - 1];
    
    const result = [];
    for (let i = 0; i < totalSamples; i++) {
        const targetWeight = (i / (totalSamples - 1)) * totalWeight;
        
        let lo = 0, hi = curvatureSamples.length - 1;
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (cumulative[mid + 1] < targetWeight) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        
        const sample = curvatureSamples[lo];
        result.push({ x: sample.x, y: sample.y });
    }
    
    return result;
}

function generateUniformSampledPoints(totalSamples) {
    const result = [];
    const numSegments = (bezierPoints.length - 1) / 3;
    if (numSegments < 1) return [];
    const samplesPerSegment = Math.ceil(totalSamples / numSegments);
    const step = 1 / samplesPerSegment;

    for (let s = 0; s < numSegments; s++) {
        const i = s * 3;
        const p0 = bezierPoints[i];
        const p1 = bezierPoints[i + 1];
        const p2 = bezierPoints[i + 2];
        const p3 = bezierPoints[i + 3];

        for (let tVal = 0; tVal < 1; tVal += step) {
            if (s > 0 && tVal === 0) continue;
            const point = bezierPoint(p0, p1, p2, p3, tVal);
            result.push(point);
        }
    }
    const last = bezierPoints[bezierPoints.length - 1];
    result.push({ x: last.x, y: last.y });
    return result;
}

function generateBezierPoints(totalSamples) {
    if (samplingMode === 'curvature') {
        return generateCurvatureSampledPoints(totalSamples);
    } else {
        return generateUniformSampledPoints(totalSamples);
    }
}

function updateXML() {
    let pts = [];
    if (mode === 'manual') pts = [...points];
    else {
        const samples = parseInt(bezierSamplesInput.value) || 10;
        pts = generateBezierPoints(samples);
        pts.sort((a, b) => a.x - b.x);
    }
    const lines = pts.map(p => `<li>(${p.x.toFixed(2)}, ${p.y.toFixed(2)})</li>`);
    const xml = `<points>\n  ${lines.join('\n  ')}\n</points>`;
    xmlOutput.value = xml;
}

// Start
init();
