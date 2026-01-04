/**
 * Client-Side AI Validator
 * Provides lightweight image quality validation using TensorFlow.js
 * to filter bad images before upload (gatekeeping)
 */

export interface ImageQualityResult {
  isValid: boolean;
  sharpness: number;
  brightness: number;
  hasCard: boolean;
  confidence: number;
  issues: string[];
}

export interface ValidationConfig {
  minSharpness: number;
  minBrightness: number;
  maxBrightness: number;
  minConfidence: number;
}

const DEFAULT_CONFIG: ValidationConfig = {
  minSharpness: 50,      // Laplacian variance threshold
  minBrightness: 40,     // Minimum average brightness (0-255)
  maxBrightness: 220,    // Maximum average brightness (0-255)
  minConfidence: 0.5,    // Minimum detection confidence
};

/**
 * Calculate image sharpness using Laplacian variance approximation
 * Higher values = sharper image
 */
export function calculateSharpness(imageData: ImageData): number {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Convert to grayscale and calculate Laplacian variance
  const gray: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  
  // Apply Laplacian kernel approximation
  let variance = 0;
  let count = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Laplacian: center * 4 - neighbors
      const laplacian = 
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - width] -
        gray[idx + width];
      
      variance += laplacian * laplacian;
      count++;
    }
  }
  
  return count > 0 ? Math.sqrt(variance / count) : 0;
}

/**
 * Calculate average brightness of image
 */
export function calculateBrightness(imageData: ImageData): number {
  const data = imageData.data;
  let total = 0;
  const pixelCount = data.length / 4;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Luminance formula
    total += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  
  return total / pixelCount;
}

/**
 * Detect rectangular card-like shapes in image
 * Uses edge detection and contour approximation
 */
export function detectCardShape(imageData: ImageData): { hasCard: boolean; confidence: number } {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Simple edge detection (Sobel-like)
  const edges: number[] = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Get grayscale values
      const getGray = (i: number) => (data[i] + data[i + 1] + data[i + 2]) / 3;
      
      const center = getGray(idx);
      const left = getGray(idx - 4);
      const right = getGray(idx + 4);
      const top = getGray(idx - width * 4);
      const bottom = getGray(idx + width * 4);
      
      // Gradient magnitude
      const gx = Math.abs(right - left);
      const gy = Math.abs(bottom - top);
      const gradient = Math.sqrt(gx * gx + gy * gy);
      
      edges.push(gradient > 30 ? 1 : 0);
    }
  }
  
  // Count edge pixels in different regions
  const edgeCount = edges.reduce((a, b) => a + b, 0);
  const totalPixels = edges.length;
  const edgeRatio = edgeCount / totalPixels;
  
  // A card typically has edges covering 5-25% of the image
  // Too few edges = empty/solid image
  // Too many edges = cluttered background
  const hasCard = edgeRatio > 0.02 && edgeRatio < 0.30;
  
  // Confidence based on how well it matches expected card edge pattern
  const optimalEdgeRatio = 0.10; // ~10% is ideal
  const confidence = 1 - Math.min(1, Math.abs(edgeRatio - optimalEdgeRatio) * 5);
  
  return { hasCard, confidence: hasCard ? confidence : 0 };
}

/**
 * Validate image quality for upload
 */
export function validateImageQuality(
  canvas: HTMLCanvasElement,
  config: ValidationConfig = DEFAULT_CONFIG
): ImageQualityResult {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      isValid: false,
      sharpness: 0,
      brightness: 0,
      hasCard: false,
      confidence: 0,
      issues: ['Canvas context unavailable'],
    };
  }
  
  // Sample at a lower resolution for performance
  const sampleWidth = Math.min(canvas.width, 640);
  const sampleHeight = Math.floor(sampleWidth * (canvas.height / canvas.width));
  
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleCtx = sampleCanvas.getContext('2d')!;
  sampleCtx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
  
  const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight);
  
  const sharpness = calculateSharpness(imageData);
  const brightness = calculateBrightness(imageData);
  const { hasCard, confidence } = detectCardShape(imageData);
  
  const issues: string[] = [];
  
  if (sharpness < config.minSharpness) {
    issues.push('Image is too blurry');
  }
  
  if (brightness < config.minBrightness) {
    issues.push('Image is too dark');
  }
  
  if (brightness > config.maxBrightness) {
    issues.push('Image is too bright');
  }
  
  if (!hasCard) {
    issues.push('No card detected in frame');
  }
  
  const isValid = issues.length === 0;
  
  return {
    isValid,
    sharpness,
    brightness,
    hasCard,
    confidence,
    issues,
  };
}

/**
 * Validate image from base64 string
 */
export function validateBase64Image(
  base64: string,
  config: ValidationConfig = DEFAULT_CONFIG
): Promise<ImageQualityResult> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      
      resolve(validateImageQuality(canvas, config));
    };
    img.onerror = () => {
      resolve({
        isValid: false,
        sharpness: 0,
        brightness: 0,
        hasCard: false,
        confidence: 0,
        issues: ['Failed to load image'],
      });
    };
    img.src = base64;
  });
}

/**
 * Validate video frame directly (for live camera feed)
 */
export function validateVideoFrame(
  video: HTMLVideoElement,
  config: ValidationConfig = DEFAULT_CONFIG
): ImageQualityResult {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  
  return validateImageQuality(canvas, config);
}
