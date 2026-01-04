/**
 * Image preprocessing utilities for ONNX inference
 */

/**
 * Preprocess image for YOLO model input
 * Converts canvas image data to normalized tensor format
 */
export function preprocessImage(
  imageData: ImageData,
  targetSize: number
): Float32Array {
  const { width, height, data } = imageData;
  
  // Calculate scaling and padding for letterbox resize
  const scale = Math.min(targetSize / width, targetSize / height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);
  const padX = Math.floor((targetSize - newWidth) / 2);
  const padY = Math.floor((targetSize - newHeight) / 2);
  
  // Create canvas for resizing
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d')!;
  
  // Fill with gray (114/255 ≈ 0.447) - YOLO default padding
  ctx.fillStyle = 'rgb(114, 114, 114)';
  ctx.fillRect(0, 0, targetSize, targetSize);
  
  // Create temporary canvas with original image
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imageData, 0, 0);
  
  // Draw resized image centered
  ctx.drawImage(tempCanvas, padX, padY, newWidth, newHeight);
  
  // Get resized image data
  const resizedData = ctx.getImageData(0, 0, targetSize, targetSize);
  
  // Convert to CHW format (channels first) and normalize to 0-1
  const tensor = new Float32Array(3 * targetSize * targetSize);
  const pixelCount = targetSize * targetSize;
  
  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 4;
    // RGB channels normalized to 0-1
    tensor[i] = resizedData.data[srcIdx] / 255.0;                    // R
    tensor[i + pixelCount] = resizedData.data[srcIdx + 1] / 255.0;   // G
    tensor[i + 2 * pixelCount] = resizedData.data[srcIdx + 2] / 255.0; // B
  }
  
  return tensor;
}

/**
 * Load image from various sources and return ImageData
 */
export async function loadImageData(
  source: string | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | Blob
): Promise<ImageData> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  let img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
  
  if (typeof source === 'string') {
    // URL or base64 string
    img = await loadImageFromUrl(source);
  } else if (source instanceof Blob) {
    // Blob/File
    const url = URL.createObjectURL(source);
    img = await loadImageFromUrl(url);
    URL.revokeObjectURL(url);
  } else {
    img = source;
  }
  
  if (img instanceof HTMLVideoElement) {
    canvas.width = img.videoWidth;
    canvas.height = img.videoHeight;
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
  }
  
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Load image from URL
 */
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Convert base64 data URL to ImageData
 */
export async function base64ToImageData(base64: string): Promise<ImageData> {
  // Ensure proper format
  const dataUrl = base64.startsWith('data:') 
    ? base64 
    : `data:image/jpeg;base64,${base64}`;
  
  return loadImageData(dataUrl);
}
