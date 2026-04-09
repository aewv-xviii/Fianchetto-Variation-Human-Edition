/**
 * xml.js - XML Input/Output for Thruster Editor
 */
class XmlIO {
    static parse(xmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "application/xml");
        const errorNode = doc.querySelector("parsererror");
        if (errorNode) {
            console.error(errorNode.textContent);
            throw new Error("Invalid XML");
        }

        let bgPath = null;
        let thrusters = [];

        // 1. Try to find graphicData.texPath for background
        const texNode = doc.querySelector("graphicData > texPath");
        if (texNode) bgPath = texNode.textContent.trim();

        // 2. Find thrusters list
        const thrustersNode = doc.querySelector("thrusters");
        if (thrustersNode) {
            for (const child of thrustersNode.children) {
                const t = this.parseThruster(child);
                if (t) thrusters.push(t);
            }
        }

        return { bgPath, thrusters };
    }

    static parseThruster(node) {
        const getVal = (tag) => {
            const el = node.querySelector(`:scope > ${tag}`);
            return el ? el.textContent.trim() : null;
        };
        const getVec3 = (tag) => {
            const s = getVal(tag);
            if (!s) return null;
            const parts = s.replace(/[()]/g, '').split(',');
            if (parts.length >= 3) return { x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parseFloat(parts[2]) };
            return null;
        };
        const getFloat = (tag, def) => {
            const s = getVal(tag);
            return s ? parseFloat(s) : def;
        };
        const getBool = (tag, def) => {
            const s = getVal(tag);
            return s ? (s.toLowerCase() === 'true') : def;
        };

        const t = {
            localOffset: getVec3("localOffset") || { x: 0, y: 0, z: 0 },
            localFlameDir: getVec3("localFlameDir") || { x: 0, y: 0, z: -1 },
            minSize: getFloat("minSize", 0),
            cruiseMaxSize: getFloat("cruiseMaxSize", 3),
            boostMaxSize: getFloat("boostMaxSize", 5.5),
            jitterWidth: getFloat("jitterWidth", 0.2),
            cruiseMaxSpeed: getFloat("cruiseMaxSpeed", 0.2),
            accelMin: getFloat("accelMin", 0.09),
            accelMax: getFloat("accelMax", 0.25),
            omniThruster: getBool("omniThruster", false),
            texPath: null,
            graphicClass: null,
            shaderType: null
        };

        // GraphicData
        const gd = node.querySelector("graphicData");
        if (gd) {
            const tp = gd.querySelector("texPath");
            if (tp) t.texPath = tp.textContent.trim();
            const gc = gd.querySelector("graphicClass");
            if (gc) t.graphicClass = gc.textContent.trim();
            const st = gd.querySelector("shaderType");
            if (st) t.shaderType = st.textContent.trim();
        }

        return t;
    }

    static toXml(thrusters) {
        let xml = `<thrusters>\n`;
        thrusters.forEach(t => {
            xml += `  <li>\n`;
            xml += `    <localOffset>${this.fmtVec3(t.localOffset)}</localOffset>\n`;
            xml += `    <localFlameDir>${this.fmtVec3(t.localFlameDir)}</localFlameDir>\n`;

            if (t.minSize !== 0) xml += `    <minSize>${t.minSize}</minSize>\n`;
            if (t.cruiseMaxSize !== 3) xml += `    <cruiseMaxSize>${t.cruiseMaxSize}</cruiseMaxSize>\n`;
            if (t.boostMaxSize !== 5.5) xml += `    <boostMaxSize>${t.boostMaxSize}</boostMaxSize>\n`;
            if (t.jitterWidth !== 0.2) xml += `    <jitterWidth>${t.jitterWidth}</jitterWidth>\n`;
            if (t.cruiseMaxSpeed !== 0.2) xml += `    <cruiseMaxSpeed>${t.cruiseMaxSpeed}</cruiseMaxSpeed>\n`;
            if (t.accelMin !== 0.09) xml += `    <accelMin>${t.accelMin}</accelMin>\n`;
            if (t.accelMax !== 0.25) xml += `    <accelMax>${t.accelMax}</accelMax>\n`;
            if (t.omniThruster) xml += `    <omniThruster>true</omniThruster>\n`;

            if (t.texPath || t.graphicClass || t.shaderType) {
                xml += `    <graphicData>\n`;
                if (t.texPath) xml += `      <texPath>${t.texPath}</texPath>\n`;
                if (t.graphicClass) xml += `      <graphicClass>${t.graphicClass}</graphicClass>\n`;
                if (t.shaderType) xml += `      <shaderType>${t.shaderType}</shaderType>\n`;
                xml += `    </graphicData>\n`;
            }

            xml += `  </li>\n`;
        });
        xml += `</thrusters>`;
        return xml;
    }

    static fmtVec3(v) {
        return `(${v.x},${v.y},${v.z})`;
    }
}
