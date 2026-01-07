// Web Worker for image processing - runs in separate thread
// This prevents UI freezing during heavy image operations

// Helper to get rotated bounding box dimensions
const getRotatedBoundingBox = (width, height, rotation) => {
  const rotRad = Math.abs((rotation * Math.PI) / 180);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
};

// Create cropped image from ImageBitmap
const createCroppedImageFromBitmap = async (imageBitmap, pixelCrop, rotation = 0) => {
  // Calculate bounding box of the rotated image
  const { width: bBoxWidth, height: bBoxHeight } = getRotatedBoundingBox(
    imageBitmap.width,
    imageBitmap.height,
    rotation
  );

  // Create OffscreenCanvas for rotation
  const canvas = new OffscreenCanvas(bBoxWidth, bBoxHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // Translate to center, rotate, then translate back
  const rotRad = (rotation * Math.PI) / 180;
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-imageBitmap.width / 2, -imageBitmap.height / 2);

  // Draw the image
  ctx.drawImage(imageBitmap, 0, 0);

  // Set cropped canvas size (max 1280px)
  const MAX_SIZE = 1280;
  let finalWidth = pixelCrop.width;
  let finalHeight = pixelCrop.height;

  if (finalWidth > MAX_SIZE || finalHeight > MAX_SIZE) {
    if (finalWidth > finalHeight) {
      finalHeight = Math.round((finalHeight * MAX_SIZE) / finalWidth);
      finalWidth = MAX_SIZE;
    } else {
      finalWidth = Math.round((finalWidth * MAX_SIZE) / finalHeight);
      finalHeight = MAX_SIZE;
    }
  }

  // Create cropped canvas
  const croppedCanvas = new OffscreenCanvas(finalWidth, finalHeight);
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) throw new Error('Canvas context not available');

  // Fill white background
  croppedCtx.fillStyle = '#FFFFFF';
  croppedCtx.fillRect(0, 0, finalWidth, finalHeight);

  // Draw the cropped portion
  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    finalWidth,
    finalHeight
  );

  // Convert to blob and then to base64
  const blob = await croppedCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return blob;
};

// Resize image for cropper
const resizeImageFromBitmap = async (imageBitmap, maxSize = 1200) => {
  // If image is already small enough, return null to indicate no resize needed
  if (imageBitmap.width <= maxSize && imageBitmap.height <= maxSize) {
    return null;
  }

  // Calculate new dimensions
  let newWidth = imageBitmap.width;
  let newHeight = imageBitmap.height;

  if (newWidth > newHeight) {
    newHeight = Math.round((newHeight / newWidth) * maxSize);
    newWidth = maxSize;
  } else {
    newWidth = Math.round((newWidth / newHeight) * maxSize);
    newHeight = maxSize;
  }

  // Create canvas and resize
  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
  
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return blob;
};

// Convert blob to base64
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Message handler
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'CROP_IMAGE': {
        const { imageBitmap, pixelCrop, rotation } = payload;
        const blob = await createCroppedImageFromBitmap(imageBitmap, pixelCrop, rotation);
        const base64 = await blobToBase64(blob);
        self.postMessage({ type: 'CROP_COMPLETE', payload: { base64 } });
        break;
      }

      case 'RESIZE_IMAGE': {
        const { imageBitmap, maxSize } = payload;
        const blob = await resizeImageFromBitmap(imageBitmap, maxSize);
        if (blob) {
          const base64 = await blobToBase64(blob);
          self.postMessage({ type: 'RESIZE_COMPLETE', payload: { base64, resized: true } });
        } else {
          self.postMessage({ type: 'RESIZE_COMPLETE', payload: { base64: null, resized: false } });
        }
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      payload: { message: error.message || 'Processing failed' } 
    });
  }
};
