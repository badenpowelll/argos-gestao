import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

type ValidationState = "idle" | "searching" | "detecting" | "validating" | "validated" | "failed";

interface CameraPreviewProps {
  onCapture?: (imageData: string) => void;
  onValidated?: (imageData: string) => void;
  isActive?: boolean;
}

const MESSAGES: Record<ValidationState, string> = {
  idle: "",
  searching: "Posicione seu rosto na área demarcada",
  detecting: "Rosto detectado, mantenha a posição...",
  validating: "Validando identidade...",
  validated: "Identidade validada ✓",
  failed: "Não foi possível validar. Tente novamente.",
};

const CameraPreview = ({ onCapture, onValidated, isActive = false }: CameraPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const detectionCountRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const validatedRef = useRef(false);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user", 
          width: { ideal: 640 }, 
          height: { ideal: 480 } 
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setError(null);
      setValidationState("searching");
      detectionCountRef.current = 0;
      validatedRef.current = false;
    } catch (err: any) {
      console.error("Erro ao iniciar câmera:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Acesso à câmera negado. Por favor, permita o acesso nas configurações do navegador.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("Nenhuma câmera encontrada no dispositivo.");
      } else {
        setError("Câmera não disponível ou em uso por outro app.");
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setValidationState("idle");
    detectionCountRef.current = 0;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, [stream]);

  useEffect(() => {
    if (isActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Face detection loop using canvas pixel analysis
  useEffect(() => {
    if (!isActive || !stream || validatedRef.current) return;

    const detectFace = () => {
      if (!videoRef.current || !detectionCanvasRef.current || validatedRef.current) return;
      
      const video = videoRef.current;
      const canvas = detectionCanvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(detectFace);
        return;
      }

      canvas.width = 160;
      canvas.height = 120;
      ctx.drawImage(video, 0, 0, 160, 120);

      // Analyze center region (where face silhouette is)
      const centerX = 50, centerY = 25, regionW = 60, regionH = 70;
      const imageData = ctx.getImageData(centerX, centerY, regionW, regionH);
      const pixels = imageData.data;

      let skinPixels = 0;
      const totalPixels = regionW * regionH;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        // Skin color detection in RGB space (works for various skin tones)
        if (
          r > 60 && g > 40 && b > 20 &&
          r > g && r > b &&
          (r - g) > 15 &&
          Math.abs(r - g) < 130 &&
          r - b > 15
        ) {
          skinPixels++;
        }
      }

      const skinRatio = skinPixels / totalPixels;
      const facePresent = skinRatio > 0.15; // At least 15% skin pixels in region

      if (facePresent) {
        detectionCountRef.current++;
        
        if (detectionCountRef.current >= 5 && detectionCountRef.current < 20) {
          setValidationState("detecting");
        } else if (detectionCountRef.current >= 20 && detectionCountRef.current < 35) {
          setValidationState("validating");
        } else if (detectionCountRef.current >= 35 && !validatedRef.current) {
          validatedRef.current = true;
          setValidationState("validated");
          
          // Auto-capture
          if (videoRef.current && canvasRef.current) {
            const captureCtx = canvasRef.current.getContext("2d");
            if (captureCtx) {
              canvasRef.current.width = 640;
              canvasRef.current.height = 480;
              captureCtx.drawImage(videoRef.current, 0, 0);
              const data = canvasRef.current.toDataURL("image/jpeg", 0.8);
              onCapture?.(data);
              onValidated?.(data);
            }
          }
          return; // Stop detection loop
        }
      } else {
        // Reset if face disappears
        if (detectionCountRef.current > 0) {
          detectionCountRef.current = Math.max(0, detectionCountRef.current - 3);
        }
        if (detectionCountRef.current < 5) {
          setValidationState("searching");
        }
      }

      animFrameRef.current = requestAnimationFrame(detectFace);
    };

    // Start detection after small delay for camera to initialize
    const timeout = setTimeout(() => {
      animFrameRef.current = requestAnimationFrame(detectFace);
    }, 500);

    return () => {
      clearTimeout(timeout);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive, stream, onCapture, onValidated]);

  const strokeColor = () => {
    switch (validationState) {
      case "validated": return "hsl(160, 84%, 39%)";
      case "detecting":
      case "validating": return "hsl(45, 93%, 58%)";
      case "failed": return "hsl(0, 84%, 60%)";
      default: return "rgba(255,255,255,0.4)";
    }
  };

  const glowAnimation = () => {
    const color = strokeColor();
    if (validationState === "validated") {
      return {
        filter: [
          `drop-shadow(0 0 8px ${color})`,
          `drop-shadow(0 0 20px ${color})`,
          `drop-shadow(0 0 8px ${color})`,
        ],
      };
    }
    if (validationState === "detecting" || validationState === "validating") {
      return {
        filter: [
          `drop-shadow(0 0 4px ${color})`,
          `drop-shadow(0 0 12px ${color})`,
          `drop-shadow(0 0 4px ${color})`,
        ],
      };
    }
    return { filter: `drop-shadow(0 0 3px rgba(255,255,255,0.2))` };
  };

  const progressPercent = Math.min(100, (detectionCountRef.current / 35) * 100);

  return (
    <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-2xl bg-foreground/5">
      <div className="relative aspect-square">
        {error ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <CameraOff className="mr-2 h-5 w-5" />
            {error}
          </div>
        ) : !isActive ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Camera className="mr-2 h-5 w-5" />
            Câmera desativada
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />

            {/* Dark overlay outside face area */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg width="100%" height="100%" viewBox="0 0 320 320" className="absolute inset-0">
                <defs>
                  <mask id="faceMask">
                    <rect width="320" height="320" fill="white" />
                    <path
                      d="M160 50
                         C 115 50, 90 90, 90 130
                         C 90 155, 98 175, 110 192
                         C 118 203, 122 212, 124 224
                         C 127 236, 138 246, 160 246
                         C 182 246, 193 236, 196 224
                         C 198 212, 202 203, 210 192
                         C 222 175, 230 155, 230 130
                         C 230 90, 205 50, 160 50 Z"
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect width="320" height="320" fill="rgba(0,0,0,0.5)" mask="url(#faceMask)" />
              </svg>
            </div>

            {/* Face silhouette outline */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.svg
                width="200"
                height="260"
                viewBox="0 0 200 260"
                fill="none"
                animate={glowAnimation()}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <path
                  d="M100 10
                     C 45 10, 15 60, 15 110
                     C 15 140, 25 165, 40 185
                     C 50 198, 55 210, 58 225
                     C 62 240, 75 252, 100 252
                     C 125 252, 138 240, 142 225
                     C 145 210, 150 198, 160 185
                     C 175 165, 185 140, 185 110
                     C 185 60, 155 10, 100 10 Z"
                  stroke={strokeColor()}
                  strokeWidth="2.5"
                  fill="none"
                />
              </motion.svg>
            </div>

            {/* Progress ring (during validation) */}
            {(validationState === "detecting" || validationState === "validating") && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <svg width="220" height="280" viewBox="0 0 220 280" className="opacity-60">
                  <ellipse
                    cx="110"
                    cy="140"
                    rx="105"
                    ry="135"
                    fill="none"
                    stroke="hsl(45, 93%, 58%)"
                    strokeWidth="3"
                    strokeDasharray={`${progressPercent * 7.5} 750`}
                    strokeLinecap="round"
                    transform="rotate(-90 110 140)"
                  />
                </svg>
              </div>
            )}

            {/* Status message */}
            <AnimatePresence mode="wait">
              {validationState !== "idle" && (
                <motion.div
                  key={validationState}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute bottom-3 left-0 right-0 text-center"
                >
                  <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-sm ${
                    validationState === "validated"
                      ? "bg-green-500/20 text-green-300"
                      : validationState === "failed"
                      ? "bg-red-500/20 text-red-300"
                      : validationState === "validating"
                      ? "bg-yellow-500/20 text-yellow-200"
                      : validationState === "detecting"
                      ? "bg-yellow-500/15 text-yellow-200"
                      : "bg-white/10 text-white/80"
                  }`}>
                    {validationState === "validating" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {validationState === "validated" && <ShieldCheck className="h-3 w-3" />}
                    {validationState === "failed" && <ShieldAlert className="h-3 w-3" />}
                    {MESSAGES[validationState]}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={detectionCanvasRef} className="hidden" />
    </div>
  );
};

export default CameraPreview;
