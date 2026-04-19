/**
 * mermaidSanitizer.js — Limpia código Mermaid generado por el modelo
 *
 * PROBLEMA:
 *   El modelo genera labels de nodos con espacios, paréntesis y caracteres
 *   especiales que Mermaid no acepta. Ej:
 *     C --> D1[Documentos (Docs)];     ← falla por espacio en "Docs)"
 *     A --> B[Mi Archivo]              ← falla por espacio en nodo
 *
 * FIX:
 *   1. Envuelve labels con comillas dobles si tienen espacios/especiales
 *   2. Corrige flechas con formato incorrecto
 *   3. Elimina caracteres problemáticos
 *   4. Agrega saltos de línea faltantes
 *
 * Uso:
 *   const { sanitizeMermaid } = require("./mermaidSanitizer");
 *   const clean = sanitizeMermaid(rawCode);
 */

"use strict";

/**
 * Sanitiza un bloque de código Mermaid para que sea válido.
 * @param {string} code - Código Mermaid crudo del modelo
 * @returns {string} - Código Mermaid limpio
 */
function sanitizeMermaid(code) {
    if (!code || typeof code !== "string") return code;

    let lines = code.split("\n");
    const result = [];

    for (let line of lines) {
        // 1. Quitar espacios al inicio/fin
        let l = line.trimEnd();

        // 2. Saltar líneas vacías y directivas de bloque
        if (!l.trim() || l.trim().startsWith("%%")) {
            result.push(l);
            continue;
        }

        // 3. Fix labels de nodos con espacios: Node[Label con espacios] → Node["Label con espacios"]
        //    También aplica a: Node(texto), Node{texto}, Node[(texto)], Node>texto]
        l = l.replace(
            /(\w[\w\d_]*)\s*(\[|\(|\{|\[\/|\[\\|\(\(|\>\[)\s*([^\])\}>]+?)\s*(\]|\)|\}|\/\]|\\\]|\)\)|\])/g,
            (match, nodeId, open, label, close) => {
                // Si el label tiene espacios, paréntesis, comillas u otros especiales → envolver con comillas dobles
                const needsQuotes = /[\s()\-,:;#@!?áéíóúüñÁÉÍÓÚÜÑ]/.test(label);
                if (needsQuotes && !label.startsWith('"') && !label.startsWith("'")) {
                    // Escapar comillas dobles internas
                    const safeLabel = label.replace(/"/g, "'");
                    return `${nodeId}${open}"${safeLabel}"${close}`;
                }
                return match;
            }
        );

        // 4. Fix flechas con texto: --> |texto con espacios| → --> |"texto"|
        l = l.replace(
            /-->\s*\|([^|]+)\|/g,
            (match, edgeLabel) => {
                const needsQuotes = /[\s()\-,:;#]/.test(edgeLabel);
                if (needsQuotes && !edgeLabel.startsWith('"')) {
                    return `--> |"${edgeLabel.replace(/"/g, "'")}"|`;
                }
                return match;
            }
        );

        // 5. Fix: eliminar punto y coma al final de líneas (Mermaid no los usa)
        l = l.replace(/;+$/, "");

        // 6. Fix: flechas dobles con espacio extra --> C - → --> C
        l = l.replace(/-->\s*([A-Za-z_][\w]*)\s*-\s*$/, "--> $1");

        // 7. Fix: "subgraph" sin ID — agregar uno genérico
        if (/^\s*subgraph\s*$/.test(l)) {
            l = l.replace(/subgraph\s*$/, "subgraph sub1");
        }

        // 8. Fix: eliminar caracteres de control
        l = l.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

        result.push(l);
    }

    return result.join("\n");
}

/**
 * Detecta si un error de Mermaid es por label inválido y lo reporta.
 */
function diagnoseMermaidError(code, errorMsg) {
    if (!errorMsg) return null;

    if (errorMsg.includes("Parse error") || errorMsg.includes("Syntax error")) {
        // Buscar línea problemática
        const lineMatch = errorMsg.match(/line (\d+)/i);
        if (lineMatch) {
            const lineNum = parseInt(lineMatch[1]) - 1;
            const lines = code.split("\n");
            const problematic = lines[lineNum] || "";
            return {
                type: "parse_error",
                line: lineNum + 1,
                content: problematic,
                suggestion: "Revisá que los labels de nodos no tengan espacios sin comillas",
            };
        }
    }

    return { type: "unknown", suggestion: "Verificá la sintaxis del diagrama" };
}

module.exports = { sanitizeMermaid, diagnoseMermaidError };