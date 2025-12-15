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
Object.defineProperty(exports, "__esModule", { value: true });
exports.processUploadedVideo = void 0;
const admin = __importStar(require("firebase-admin"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const storage_1 = require("firebase-functions/v2/storage");
// fluent-ffmpeg CommonJS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require("fluent-ffmpeg");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegPath = require("ffmpeg-static");
if (admin.apps.length === 0)
    admin.initializeApp();
const db = admin.firestore();
try {
    if (ffmpegPath)
        ffmpeg.setFfmpegPath(ffmpegPath);
}
catch { }
const REGION = "europe-west3";
const RAW_PREFIX = "raw-uploads/";
exports.processUploadedVideo = (0, storage_1.onObjectFinalized)({ region: REGION, timeoutSeconds: 540, memory: "1GiB" }, async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name;
    const contentType = event.data.contentType || "";
    // sadece raw-uploads altı video
    if (!filePath ||
        !filePath.startsWith(RAW_PREFIX) ||
        !contentType.startsWith("video/")) {
        return;
    }
    const parts = filePath.split("/");
    if (parts.length !== 3)
        return;
    const userId = parts[1];
    const clipId = path.basename(filePath, path.extname(filePath));
    const rawExt = path.extname(filePath) || ".mp4";
    const tempFilePath = path.join(os.tmpdir(), `raw_${clipId}${rawExt}`);
    const targetTempFilePath = path.join(os.tmpdir(), `processed_${clipId}.mp4`);
    const bucket = admin.storage().bucket(fileBucket);
    try {
        await bucket.file(filePath).download({ destination: tempFilePath });
        await new Promise((resolve, reject) => {
            ffmpeg(tempFilePath)
                .outputOptions([
                "-c:v libx264",
                "-preset fast",
                "-crf 24",
                "-c:a aac",
                "-b:a 128k",
                "-vf",
                "scale=-2:720",
                "-movflags",
                "faststart"
            ])
                .on("end", () => resolve())
                .on("error", (err) => reject(err))
                .save(targetTempFilePath);
        });
        const destinationPath = `clips_media/${userId}/processed_${clipId}.mp4`;
        const [uploadedFile] = await bucket.upload(targetTempFilePath, {
            destination: destinationPath,
            metadata: { contentType: "video/mp4" }
        });
        let publicUrl = null;
        try {
            await uploadedFile.makePublic();
            publicUrl = uploadedFile.publicUrl();
        }
        catch {
            // Uniform bucket-level access açık olabilir; yine de URL’yi yazıyoruz.
            try {
                publicUrl = uploadedFile.publicUrl();
            }
            catch {
                publicUrl = null;
            }
        }
        await db.collection("clips").doc(clipId).set({ mediaUrl: publicUrl, status: "processed" }, { merge: true });
    }
    catch (error) {
        console.error("processUploadedVideo error:", error);
        await db.collection("clips").doc(clipId).set({ status: "error", errorMessage: String(error?.message || error) }, { merge: true });
    }
    finally {
        try {
            if (fs.existsSync(tempFilePath))
                fs.unlinkSync(tempFilePath);
        }
        catch { }
        try {
            if (fs.existsSync(targetTempFilePath))
                fs.unlinkSync(targetTempFilePath);
        }
        catch { }
        try {
            await bucket.file(filePath).delete();
        }
        catch { }
    }
});
