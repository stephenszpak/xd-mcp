"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchXDFile = fetchXDFile;
exports.bufferToTempFile = bufferToTempFile;
exports.cleanupTempFile = cleanupTempFile;
const node_fetch_1 = __importDefault(require("node-fetch"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
/**
 * Fetches an XD file from a URL or reads from a local path.
 * Returns a Buffer of the raw ZIP bytes.
 */
async function fetchXDFile(source) {
    if (source.startsWith('http://') || source.startsWith('https://')) {
        const response = await (0, node_fetch_1.default)(source);
        if (!response.ok) {
            throw new Error(`Failed to fetch XD file: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    // Local file path
    const resolved = path.resolve(source);
    if (!fs.existsSync(resolved)) {
        throw new Error(`XD file not found at path: ${resolved}`);
    }
    return fs.readFileSync(resolved);
}
/**
 * Writes a buffer to a temp file and returns the path.
 * Useful if adm-zip needs a file path rather than a buffer.
 */
function bufferToTempFile(buffer, filename = 'design.xd') {
    const tmpPath = path.join(os.tmpdir(), `xd-mcp-${Date.now()}-${filename}`);
    fs.writeFileSync(tmpPath, buffer);
    return tmpPath;
}
function cleanupTempFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    catch {
        // Best-effort cleanup
    }
}
//# sourceMappingURL=fetch-xd.js.map