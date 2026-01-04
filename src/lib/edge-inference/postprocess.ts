/**
 * Post-processing utilities for YOLO model output
 * Handles NMS and detection parsing
 */

import { Detection, BoundingBox, InferenceResult, ModelConfig } from './types';

/**
 * Process raw YOLO output tensor into detections
 * YOLO v8 output format: [batch, 4+num_classes, num_predictions]
 */
export function processYoloOutput(
  output: Float32Array,
  config: ModelConfig,
  originalWidth: number,
  originalHeight: number
): Detection[] {
  const { inputSize, classes, confidenceThreshold } = config;
  const numClasses = classes.length;
  const numPredictions = output.length / (4 + numClasses);
  
  const detections: Detection[] = [];
  
  // YOLO v8 output is transposed: [batch, 4+classes, predictions]
  // We need to parse it as [x, y, w, h, class1, class2, class3, ...]
  for (let i = 0; i < numPredictions; i++) {
    // Get box coordinates (center x, center y, width, height)
    const cx = output[i];
    const cy = output[numPredictions + i];
    const w = output[2 * numPredictions + i];
    const h = output[3 * numPredictions + i];
    
    // Get class probabilities
    let maxClassProb = 0;
    let maxClassId = 0;
    
    for (let c = 0; c < numClasses; c++) {
      const prob = output[(4 + c) * numPredictions + i];
      if (prob > maxClassProb) {
        maxClassProb = prob;
        maxClassId = c;
      }
    }
    
    // Filter by confidence
    if (maxClassProb < confidenceThreshold) continue;
    
    // Convert from center format to corner format and scale to original image
    const scale = Math.min(inputSize / originalWidth, inputSize / originalHeight);
    const padX = (inputSize - originalWidth * scale) / 2;
    const padY = (inputSize - originalHeight * scale) / 2;
    
    const x1 = ((cx - w / 2) - padX) / scale;
    const y1 = ((cy - h / 2) - padY) / scale;
    const boxWidth = w / scale;
    const boxHeight = h / scale;
    
    detections.push({
      class: classes[maxClassId],
      classId: maxClassId,
      confidence: maxClassProb,
      bbox: {
        x: Math.max(0, x1),
        y: Math.max(0, y1),
        width: Math.min(boxWidth, originalWidth - x1),
        height: Math.min(boxHeight, originalHeight - y1),
      },
    });
  }
  
  // Apply NMS
  return nonMaxSuppression(detections, 0.45);
}

/**
 * Non-Maximum Suppression to filter overlapping detections
 */
function nonMaxSuppression(detections: Detection[], iouThreshold: number): Detection[] {
  if (detections.length === 0) return [];
  
  // Sort by confidence
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const selected: Detection[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    
    const current = sorted[i];
    selected.push(current);
    
    // Suppress overlapping detections of same class
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      if (sorted[j].classId !== current.classId) continue;
      
      const iou = calculateIoU(current.bbox, sorted[j].bbox);
      if (iou > iouThreshold) {
        used.add(j);
      }
    }
  }
  
  return selected;
}

/**
 * Calculate Intersection over Union of two boxes
 */
function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
  const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
  
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = box1.width * box1.height;
  const area2 = box2.width * box2.height;
  const union = area1 + area2 - intersection;
  
  return intersection / union;
}

/**
 * Analyze detections and create inference result
 */
export function analyzeDetections(
  detections: Detection[],
  inferenceTime: number
): InferenceResult {
  // Find best detection for each class
  let frontDetection: Detection | null = null;
  let backDetection: Detection | null = null;
  let printDetection: Detection | null = null;
  
  for (const det of detections) {
    // Class ID mapping: 0=aadhaar_back, 1=aadhaar_front, 2=print_aadhaar
    if (det.class === 'aadhaar_front' || det.classId === 1) {
      if (!frontDetection || det.confidence > frontDetection.confidence) {
        frontDetection = det;
      }
    } else if (det.class === 'aadhaar_back' || det.classId === 0) {
      if (!backDetection || det.confidence > backDetection.confidence) {
        backDetection = det;
      }
    } else if (det.class === 'print_aadhaar' || det.classId === 2) {
      if (!printDetection || det.confidence > printDetection.confidence) {
        printDetection = det;
      }
    }
  }
  
  const frontDetected = frontDetection !== null;
  const backDetected = backDetection !== null;
  const printAadhaarDetected = printDetection !== null;
  
  return {
    success: !printAadhaarDetected && (frontDetected || backDetected),
    detections,
    frontDetected,
    backDetected,
    printAadhaarDetected,
    frontConfidence: frontDetection?.confidence ?? 0,
    backConfidence: backDetection?.confidence ?? 0,
    inferenceTime,
  };
}
