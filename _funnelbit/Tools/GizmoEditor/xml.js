/**
 * xml.js - Handles XML Parsing and Serialization for FunnelBitGizmoLayoutDef
 */


class XmlIO {
    static parse(xmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "application/xml");

        const errorNode = doc.querySelector("parsererror");
        if (errorNode) {
            console.error("XML Parse Error:", errorNode.textContent);
            throw new Error("Invalid XML");
        }

        let root = doc.querySelector("FunnelBitGizmoLayoutDef");

        // Handle namespace prefix or different root naming
        if (!root) {
            const allElements = doc.getElementsByTagName("*");
            for (let i = 0; i < allElements.length; i++) {
                if (allElements[i].nodeName.endsWith("FunnelBitGizmoLayoutDef")) {
                    root = allElements[i];
                    break;
                }
            }
        }

        if (!root) {
            // Check direct documentElement
            if (doc.documentElement.nodeName.endsWith("FunnelBitGizmoLayoutDef")) {
                return this.parseDef(doc.documentElement);
            }
            // Try to find if it's wrapped in something or direct
            if (doc.documentElement.nodeName === "Defs") {
                // Might handle multi-def later, for now assume single def
                // Try searching inside Defs
                const child = doc.querySelector("FunnelBitGizmoLayoutDef") ||
                    Array.from(doc.getElementsByTagName("*")).find(el => el.nodeName.endsWith("FunnelBitGizmoLayoutDef"));
                if (child) return this.parseDef(child);
            }
            throw new Error("No FunnelBitGizmoLayoutDef found.");
        }

        return this.parseDef(root);
    }

    static parseDef(node) {
        const def = {
            defName: this.getText(node, "defName") || "NewGizmoLayout",
            windowWidth: parseFloat(this.getText(node, "windowWidth") || "100"),
            backgroundTexPath: this.getText(node, "backgroundTexPath") || "",
            overlayTexPath: this.getText(node, "overlayTexPath") || "",
            drawWindowBackground: this.getBool(node, "drawWindowBackground", true),
            useInnerContentRect: this.getBool(node, "useInnerContentRect", false),
            innerPadding: parseFloat(this.getText(node, "innerPadding") || "0"),
            backgroundDrawOrder: parseFloat(this.getText(node, "backgroundDrawOrder") || "0"),
            overlayDrawOrder: parseFloat(this.getText(node, "overlayDrawOrder") || "10"),
            hideWhenMultiSelected: this.getBool(node, "hideWhenMultiSelected", false),
            mergeWhenMultiSelected: this.getBool(node, "mergeWhenMultiSelected", false),
            gizmoOrder: parseFloat(this.getText(node, "gizmoOrder") || "-90"),
            tooltipBackgroundTexPath: this.getText(node, "tooltipBackgroundTexPath") || "",
            tooltipTextColor: this.getText(node, "tooltipTextColor") || "",
            elements: []
        };

        const elementsNode = node.querySelector("elements");
        if (elementsNode) {
            for (const elNode of elementsNode.children) {
                // Determine class based on node name or attributes if polymorphic list
                // In RimWorld XML for generic Lists, it's usually <li><Class>...</Class>...</li> OR <li> (if type is known)
                // For FunnelBitGizmoLayoutDef it handles `FunnelGizmoElementConfig` subclasses.
                // We need to check if there is a Class attribute or deduce from structure.
                // Typically <li Class="FunnelBit.FunnelGizmoElement_SlotStateIcon">

                const type = elNode.getAttribute("Class") || "FunnelBit.FunnelGizmoElementConfig"; // Default?
                def.elements.push(this.parseElement(elNode, type));
            }
        }

        return def;
    }

    static parseElement(node, type) {
        const base = {
            type: type,
            // Vector2 parsing handles "(x,y)" string
            position: this.getVector2(node, "position"),
            size: this.getVector2(node, "size"),
            interactionSize: this.getVector2(node, "interactionSize", null),
            interactionOffset: this.getVector2(node, "interactionOffset", null),
            visuals: [],

            // SlotStateIcon specific
            slotIndex: parseInt(this.getText(node, "slotIndex") || "0"),
            defaultTexPath: this.getText(node, "defaultTexPath"),
            stateMappings: [],

            // Toggle specific
            iconTexPathOn: this.getText(node, "iconTexPathOn"),
            iconTexPathOff: this.getText(node, "iconTexPathOff"),
            iconTexPathOff: this.getText(node, "iconTexPathOff"),
            labelKey: this.getText(node, "labelKey"),
            target: this.getText(node, "target") || "Auto",
            clickSoundOn: this.getText(node, "clickSoundOn"),
            clickSoundOff: this.getText(node, "clickSoundOff"),

            // BarGauge specific
            backgroundTexPath: this.getText(node, "backgroundTexPath"),

            // Draw Order (optional)
            drawOrder: this.getNumber(node, "drawOrder"),
        };

        // Parse Visuals
        const visualsNode = node.querySelector("visuals");
        if (visualsNode) {
            for (const vNode of visualsNode.children) {
                const vType = vNode.getAttribute("Class") || "FunnelBit.FunnelGizmoVisualNode_Texture";
                base.visuals.push(this.parseVisual(vNode, vType));
            }
        }

        // Parse State Mappings for SlotStateIcon
        const mappingNode = node.querySelector("stateMappings");
        if (mappingNode) {
            for (const mNode of mappingNode.children) {
                base.stateMappings.push({
                    texPath: this.getText(mNode, "texPath"),
                    // Usually <states><li>...</li></states>
                    states: this.getList(mNode, "states")
                });
            }
        }

        return base;
    }

    static parseVisual(node, type) {
        return {
            type: type,
            offset: this.getVector2(node, "offset"),
            size: this.getVector2(node, "size"),
            texPath: this.getText(node, "texPath"),
            visibleWhenToggleOn: this.getBoolNullable(node, "visibleWhenToggleOn"),
            uvScrollSpeed: this.getVector2(node, "uvScrollSpeed", { x: 0, y: 0 }),
            color: this.getText(node, "color"),
            rotation: parseFloat(this.getText(node, "rotation") || "0"),

            // BarGauge specific
            targetType: this.getText(node, "targetType"),
            expandDirection: this.getText(node, "expandDirection"),
            minValue: parseFloat(this.getText(node, "minValue") || "0"),
            maxValue: parseFloat(this.getText(node, "maxValue") || "-1"),
            skewAngle: parseFloat(this.getText(node, "skewAngle") || "0"),
            skewAxis: this.getText(node, "skewAxis") || "Horizontal",

            // Draw Order (optional)
            drawOrder: this.getNumber(node, "drawOrder"),
        };
    }

    // --- Helpers ---

    static getText(parent, tag) {
        const el = parent.querySelector(`:scope > ${tag}`);
        return el ? el.textContent.trim() : null;
    }

    static getBool(parent, tag, def) {
        const txt = this.getText(parent, tag);
        if (txt === null) return def;
        return txt.toLowerCase() === "true";
    }

    static getBoolNullable(parent, tag) {
        const txt = this.getText(parent, tag);
        if (txt === null) return null;
        return txt.toLowerCase() === "true";
    }

    static getVector2(parent, tag, def = { x: 0, y: 0 }) {
        const txt = this.getText(parent, tag);
        if (!txt) return def;
        // Format: (1.0, 2.0)
        const parts = txt.replace(/[()]/g, '').split(',');
        if (parts.length === 2) {
            return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
        }
        return def;
    }

    static getNumber(parent, tag) {
        const txt = this.getText(parent, tag);
        if (txt === null) return null;
        const n = parseFloat(txt);
        return isNaN(n) ? null : n;
    }

    static getList(parent, tag) {
        const listNode = parent.querySelector(`:scope > ${tag}`);
        if (!listNode) return [];
        const res = [];
        for (const li of listNode.children) {
            res.push(li.textContent.trim());
        }
        return res;
    }

    // --- Export ---

    static toXml(data) {
        let xml = ``;
        xml += `<FunnelBit.FunnelBitGizmoLayoutDef>\n`;
        xml += `  <defName>${data.defName}</defName>\n`;
        xml += `  <windowWidth>${data.windowWidth}</windowWidth>\n`;
        if (data.backgroundTexPath) xml += `  <backgroundTexPath>${data.backgroundTexPath}</backgroundTexPath>\n`;
        if (data.overlayTexPath) xml += `  <overlayTexPath>${data.overlayTexPath}</overlayTexPath>\n`;
        xml += `  <drawWindowBackground>${data.drawWindowBackground}</drawWindowBackground>\n`;
        xml += `  <useInnerContentRect>${data.useInnerContentRect}</useInnerContentRect>\n`;
        xml += `  <innerPadding>${data.innerPadding}</innerPadding>\n`;
        xml += `  <backgroundDrawOrder>${data.backgroundDrawOrder}</backgroundDrawOrder>\n`;
        xml += `  <overlayDrawOrder>${data.overlayDrawOrder}</overlayDrawOrder>\n`;
        xml += `  <hideWhenMultiSelected>${data.hideWhenMultiSelected}</hideWhenMultiSelected>\n`;
        xml += `  <mergeWhenMultiSelected>${data.mergeWhenMultiSelected}</mergeWhenMultiSelected>\n`;
        if (data.gizmoOrder !== undefined && data.gizmoOrder !== -90) xml += `  <gizmoOrder>${data.gizmoOrder}</gizmoOrder>\n`;
        if (data.tooltipBackgroundTexPath) xml += `  <tooltipBackgroundTexPath>${data.tooltipBackgroundTexPath}</tooltipBackgroundTexPath>\n`;
        if (data.tooltipTextColor) xml += `  <tooltipTextColor>${data.tooltipTextColor}</tooltipTextColor>\n`;

        if (data.elements && data.elements.length > 0) {
            xml += `  <elements>\n`;
            data.elements.forEach(el => {
                xml += this.elementToXml(el);
            });
            xml += `  </elements>\n`;
        }

        xml += `</FunnelBit.FunnelBitGizmoLayoutDef>`;
        return xml;
    }

    static elementToXml(el) {
        let x = `    <li Class="${el.type}">\n`;
        x += `      <position>${this.vecStr(el.position)}</position>\n`;
        x += `      <size>${this.vecStr(el.size)}</size>\n`;
        if (el.interactionSize) x += `      <interactionSize>${this.vecStr(el.interactionSize)}</interactionSize>\n`;
        if (el.interactionOffset) x += `      <interactionOffset>${this.vecStr(el.interactionOffset)}</interactionOffset>\n`;
        if (el.drawOrder != null) x += `      <drawOrder>${el.drawOrder}</drawOrder>\n`;

        // Specifics
        if (el.type.includes("SlotStateIcon")) {
            x += `      <slotIndex>${el.slotIndex}</slotIndex>\n`;
            if (el.defaultTexPath) x += `      <defaultTexPath>${el.defaultTexPath}</defaultTexPath>\n`;
            if (el.stateMappings && el.stateMappings.length > 0) {
                x += `      <stateMappings>\n`;
                el.stateMappings.forEach(m => {
                    x += `        <li>\n`;
                    x += `          <texPath>${m.texPath}</texPath>\n`;
                    x += `          <states>\n`;
                    m.states.forEach(s => x += `            <li>${s}</li>\n`);
                    x += `          </states>\n`;
                    x += `        </li>\n`;
                });
                x += `      </stateMappings>\n`;
            }
        }

        if (el.type.includes("Toggle")) {
            if (el.iconTexPathOn) x += `      <iconTexPathOn>${el.iconTexPathOn}</iconTexPathOn>\n`;
            if (el.iconTexPathOff) x += `      <iconTexPathOff>${el.iconTexPathOff}</iconTexPathOff>\n`;
            if (el.labelKey) x += `      <labelKey>${el.labelKey}</labelKey>\n`;
            if (el.target && el.target !== "Auto") x += `      <target>${el.target}</target>\n`;
            if (el.clickSoundOn) x += `      <clickSoundOn>${el.clickSoundOn}</clickSoundOn>\n`;
            if (el.clickSoundOff) x += `      <clickSoundOff>${el.clickSoundOff}</clickSoundOff>\n`;
        }

        if (el.type.includes("BarGauge")) {
            if (el.slotIndex !== undefined) x += `      <slotIndex>${el.slotIndex}</slotIndex>\n`;
            if (el.backgroundTexPath) x += `      <backgroundTexPath>${el.backgroundTexPath}</backgroundTexPath>\n`;
        }

        if (el.visuals && el.visuals.length > 0) {
            x += `      <visuals>\n`;
            el.visuals.forEach(v => {
                x += `        <li Class="${v.type}">\n`;
                x += `          <offset>${this.vecStr(v.offset)}</offset>\n`;
                x += `          <size>${this.vecStr(v.size)}</size>\n`;
                if (v.texPath) x += `          <texPath>${v.texPath}</texPath>\n`;
                if (v.visibleWhenToggleOn === true || v.visibleWhenToggleOn === false) x += `          <visibleWhenToggleOn>${v.visibleWhenToggleOn}</visibleWhenToggleOn>\n`;
                if (v.uvScrollSpeed && (v.uvScrollSpeed.x !== 0 || v.uvScrollSpeed.y !== 0)) x += `          <uvScrollSpeed>${this.vecStr(v.uvScrollSpeed)}</uvScrollSpeed>\n`;
                if (v.color) x += `          <color>${v.color}</color>\n`;
                if (v.rotation && v.rotation !== 0) x += `          <rotation>${v.rotation}</rotation>\n`;
                if (v.drawOrder != null) x += `          <drawOrder>${v.drawOrder}</drawOrder>\n`;

                // BarGauge Visuals
                if (v.type.includes("BarGauge")) {
                    if (v.targetType) x += `          <targetType>${v.targetType}</targetType>\n`;
                    if (v.expandDirection) x += `          <expandDirection>${v.expandDirection}</expandDirection>\n`;
                    if (v.minValue !== undefined && v.minValue !== 0) x += `          <minValue>${v.minValue}</minValue>\n`;
                    if (v.maxValue !== undefined && v.maxValue !== -1) x += `          <maxValue>${v.maxValue}</maxValue>\n`;
                    if (v.skewAngle && v.skewAngle !== 0) x += `          <skewAngle>${v.skewAngle}</skewAngle>\n`;
                    if (v.skewAxis && v.skewAxis !== "Horizontal") x += `          <skewAxis>${v.skewAxis}</skewAxis>\n`;
                }
                x += `        </li>\n`;
            });
            x += `      </visuals>\n`;
        }

        x += `    </li>\n`;
        return x;
    }

    static vecStr(v) {
        return `(${v.x},${v.y})`;
    }
}
