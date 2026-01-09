# YOLOv8 Aadhar Card Detection - Test Script
# ============================================

import os
import cv2
import numpy as np
from ultralytics import YOLO
import matplotlib.pyplot as plt
from PIL import Image

# Step 1: Load the Trained Model
# -------------------------------
MODEL_PATH = '/Users/lakshyaborasi/Desktop/Ai-verification-frontendf/backend/models/best.pt'  # Path to your trained model
model = YOLO(MODEL_PATH)

print("Model loaded successfully!")
print(f"Model classes: {model.names}")

# Step 2: Define Image Paths
# ---------------------------
# Replace these with your actual image paths
FRONT_IMAGE_PATH = '/Users/lakshyaborasi/Desktop/Ai-verification-frontendf/public/models/gibbrish.png'  # Path to front image
BACK_IMAGE_PATH = '/Users/lakshyaborasi/Desktop/Ai-verification-frontendf/public/models/driving.jpg'    # Path to back image

# Step 3: Inference Function
# ---------------------------
def detect_aadhar(image_path, label="Image"):
    """
    Detect Aadhar card in an image
    
    Args:
        image_path: Path to the image file
        label: Label for the image (e.g., "Front" or "Back")
    
    Returns:
        results: Detection results
        annotated_image: Image with bounding boxes
    """
    print(f"\n{'='*60}")
    print(f"Processing {label} Image: {os.path.basename(image_path)}")
    print(f"{'='*60}")
    
    # Check if image exists
    if not os.path.exists(image_path):
        print(f"Error: Image not found at {image_path}")
        return None, None
    
    # Run inference
    results = model.predict(
        source=image_path,
        conf=0.25,              # Confidence threshold
        iou=0.45,               # NMS IOU threshold
        imgsz=640,              # Image size
        save=False,             # Don't auto-save
        verbose=False           # Reduce console output
    )
    
    # Get the annotated image
    annotated_image = results[0].plot()
    
    # Print detection details
    boxes = results[0].boxes
    print(f"\nDetections Found: {len(boxes)}")
    
    if len(boxes) == 0:
        print("⚠️  No Aadhar card detected in this image")
    else:
        for idx, box in enumerate(boxes):
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            coords = box.xyxy[0].tolist()
            
            print(f"\nDetection {idx + 1}:")
            print(f"  Class: {results[0].names[cls]}")
            print(f"  Confidence: {conf:.2%}")
            print(f"  Bounding Box: [x1={coords[0]:.0f}, y1={coords[1]:.0f}, x2={coords[2]:.0f}, y2={coords[3]:.0f}]")
            print(f"  Width: {coords[2]-coords[0]:.0f}px, Height: {coords[3]-coords[1]:.0f}px")
    
    return results, annotated_image

# Step 4: Process Both Images
# ----------------------------
print("\n" + "="*60)
print("AADHAR CARD DETECTION TEST")
print("="*60)

# Detect on front image
front_results, front_annotated = detect_aadhar(FRONT_IMAGE_PATH, "Front")

# Detect on back image
back_results, back_annotated = detect_aadhar(BACK_IMAGE_PATH, "Back")

# Step 5: Visualize Results
# --------------------------
def display_results(front_img, back_img, front_res, back_res):
    """
    Display both images side by side with detections
    """
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    
    # Front image
    if front_img is not None:
        axes[0].imshow(cv2.cvtColor(front_img, cv2.COLOR_BGR2RGB))
        axes[0].set_title(f'Front - Detections: {len(front_res[0].boxes) if front_res else 0}', 
                         fontsize=14, fontweight='bold')
        axes[0].axis('off')
    else:
        axes[0].text(0.5, 0.5, 'Front Image Not Found', 
                    ha='center', va='center', fontsize=16)
        axes[0].axis('off')
    
    # Back image
    if back_img is not None:
        axes[1].imshow(cv2.cvtColor(back_img, cv2.COLOR_BGR2RGB))
        axes[1].set_title(f'Back - Detections: {len(back_res[0].boxes) if back_res else 0}', 
                         fontsize=14, fontweight='bold')
        axes[1].axis('off')
    else:
        axes[1].text(0.5, 0.5, 'Back Image Not Found', 
                    ha='center', va='center', fontsize=16)
        axes[1].axis('off')
    
    plt.tight_layout()
    plt.savefig('aadhar_detection_results.png', dpi=150, bbox_inches='tight')
    print(f"\n✅ Results saved to: aadhar_detection_results.png")
    plt.show()

# Display results
display_results(front_annotated, back_annotated, front_results, back_results)

# Step 6: Save Individual Annotated Images
# -----------------------------------------
if front_annotated is not None:
    cv2.imwrite('aadhar_front_detected.jpg', front_annotated)
    print("✅ Front image saved: aadhar_front_detected.jpg")

if back_annotated is not None:
    cv2.imwrite('aadhar_back_detected.jpg', back_annotated)
    print("✅ Back image saved: aadhar_back_detected.jpg")

# Step 7: Summary Report
# -----------------------
print("\n" + "="*60)
print("DETECTION SUMMARY")
print("="*60)

front_count = len(front_results[0].boxes) if front_results else 0
back_count = len(back_results[0].boxes) if back_results else 0

print(f"\n📄 Front Image:")
print(f"   Detections: {front_count}")
if front_count > 0 and front_results:
    avg_conf = np.mean([float(box.conf[0]) for box in front_results[0].boxes])
    print(f"   Average Confidence: {avg_conf:.2%}")

print(f"\n📄 Back Image:")
print(f"   Detections: {back_count}")
if back_count > 0 and back_results:
    avg_conf = np.mean([float(box.conf[0]) for box in back_results[0].boxes])
    print(f"   Average Confidence: {avg_conf:.2%}")

print(f"\n📊 Total Detections: {front_count + back_count}")

if front_count > 0 and back_count > 0:
    print("\n✅ SUCCESS: Both front and back Aadhar cards detected!")
elif front_count > 0 or back_count > 0:
    print("\n⚠️  WARNING: Only one side detected. Check image quality.")
else:
    print("\n❌ ERROR: No Aadhar cards detected. Check images and model.")

print("\n" + "="*60)

# Step 8: Alternative - Test with Custom Function
# ------------------------------------------------
def test_aadhar_pair(front_path, back_path, save_dir='test_results'):
    """
    Complete test function for Aadhar card pair
    
    Args:
        front_path: Path to front image
        back_path: Path to back image
        save_dir: Directory to save results
    """
    os.makedirs(save_dir, exist_ok=True)
    
    results = {
        'front': {'detected': False, 'confidence': 0, 'count': 0},
        'back': {'detected': False, 'confidence': 0, 'count': 0}
    }
    
    # Process front
    front_res = model.predict(front_path, conf=0.15, save=False, verbose=False)
    if len(front_res[0].boxes) > 0:
        results['front']['detected'] = True
        results['front']['count'] = len(front_res[0].boxes)
        results['front']['confidence'] = float(front_res[0].boxes[0].conf[0])
        
        # Save annotated image
        annotated = front_res[0].plot()
        cv2.imwrite(f'{save_dir}/front_detected.jpg', annotated)
    
    # Process back
    back_res = model.predict(back_path, conf=0.15, save=False, verbose=False)
    if len(back_res[0].boxes) > 0:
        results['back']['detected'] = True
        results['back']['count'] = len(back_res[0].boxes)
        results['back']['confidence'] = float(back_res[0].boxes[0].conf[0])
        
        # Save annotated image
        annotated = back_res[0].plot()
        cv2.imwrite(f'{save_dir}/back_detected.jpg', annotated)
    
    return results

# Example usage:
# results = test_aadhar_pair('/Users/lakshyaborasi/Desktop/Ai-verification-frontendf/public/uploads/front.jpg', '/Users/lakshyaborasi/Desktop/Ai-verification-frontendf/public/uploads/back.jpg')
# print(results)