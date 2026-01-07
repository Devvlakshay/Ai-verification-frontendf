# 🛡️ AI-Powered Identity Verification System
---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [On-Device AI (Edge Inference)](#-on-device-ai-edge-inference)
- [Memory Optimization](#-memory-optimization)
- [Security](#-security)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Environment Variables](#-environment-variables)
- [Usage](#-usage)
- [Technology Stack](#️-technology-stack)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

This application provides a complete identity verification solution that:

1. **Captures user selfie** using device camera with face alignment AI
2. **Scans Aadhaar cards** (front & back) using camera or file upload
3. **Real-time document detection** using on-device ONNX model (edge inference)
4. **Verifies document authenticity** using AI-powered detection (YOLO model)
5. **Detects fraud** by identifying printed/photocopied documents
6. **Secures all communications** with JWT authentication and CORS protection
7. **INT8 Quantization** for optimized mobile performance (~4x smaller model)

---

## 🏗️ Architecture

### Edge-First Architecture (with Backend Fallback)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Browser                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Next.js Frontend                          │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │           ON-DEVICE AI (Primary)                     │    │   │
│  │  │  • ONNX Runtime Web (WASM)                          │    │   │
│  │  │  • Real-time Aadhaar Detection                       │    │   │
│  │  │  • MediaPipe Face Detection (Selfie)                 │    │   │
│  │  │  • Singleton Model Manager (Memory Optimized)        │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │  • Camera Capture    • File Upload    • State Management    │   │
│  │  • IndexedDB Storage • JWT Handling   • Responsive UI       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ (Optional Fallback)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  FastAPI Backend (Fallback Only)                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • Server-side YOLO verification (if edge fails)            │   │
│  │  • Manual review queue for flagged submissions              │   │
│  │  • JWT validation for secure API access                     │   │
│  │  • GPU-accelerated inference (CUDA)                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Current Flow (Edge-Only)

```
┌──────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│  Selfie  │───▶│  Front   │───▶│   Back    │───▶│  Result  │
│  Page    │    │  Card    │    │   Card    │    │  Page    │
└──────────┘    └──────────┘    └───────────┘    └──────────┘
     │               │                │
     ▼               ▼                ▼
┌──────────┐    ┌──────────────────────────┐
│MediaPipe │    │  ONNX Runtime Web        │
│Face Det. │    │  (Aadhaar Detection)     │
└──────────┘    └──────────────────────────┘

✅ All AI runs in browser - No server calls needed!
```

### Backend Fallback (When Needed)

The backend APIs remain available for:
- **Manual review** - Flag suspicious submissions for human verification
- **Server-side re-verification** - Double-check edge results if needed
- **Audit logging** - Store verification attempts for compliance
- **Future features** - Ready for additional verification steps

---

## ✨ Features

### Frontend (Next.js)
- 📱 **Responsive UI** - Works on all devices (mobile-first design)
- 📷 **Camera Integration** - Capture selfie and documents
- 🤖 **On-Device AI** - Real-time detection without server calls
- 📤 **File Upload** - Alternative to camera capture
- 💾 **IndexedDB Storage** - Persist data across steps
- 🔐 **JWT Token Handling** - Secure session management
- 🎨 **Modern UI** - Tailwind CSS with animations
- ⚡ **Memory Optimized** - Singleton model management
- 👤 **Advanced Face Detection** - Eyes open, full face visibility checks
- 💾 **Auto-Save Images** - Selfie and Aadhaar images saved to server
- 🔄 **Multi-User Support** - Automatic data clearing on user switch

### On-Device AI (Primary)
- 🧠 **ONNX Runtime Web** - Browser-based ML inference
- 👤 **MediaPipe Face Detection** - Real-time face alignment for selfies
  - Eye blink detection (ensures eyes are open)
  - Face visibility validation (mouth, nose, chin must be visible)
  - Face centering and angle checks
  - Auto-capture with 3-second countdown when aligned
- 🎯 **YOLOv8 Detection** - Aadhaar card front/back/print detection
- 🔄 **Shared Model Instance** - Memory-efficient singleton pattern
- 📊 **Live Feedback** - Real-time detection status during capture

### Backend (Fallback Only)
- 🤖 **YOLO AI Model** - Server-side document verification
- 🛡️ **JWT Authentication** - Secure API endpoints
- 🌐 **CORS Protection** - Controlled origin access
- 🔍 **Fraud Detection** - Identifies printed/fake documents
- ⚡ **Async Processing** - High-performance image handling
- 🔧 **GPU Support** - CUDA acceleration when available
- 📝 **Available for** - Manual review, audit logs, re-verification

---

## 🧠 On-Device AI (Edge Inference)

### How It Works

The application uses **ONNX Runtime Web** to run YOLOv8 models directly in the browser:

1. **Model Loading**: ONNX model (~99MB) loaded once via singleton manager
2. **Preprocessing**: Video frames resized to 640x640 with letterboxing
3. **Inference**: WASM-based inference runs on device
4. **Postprocessing**: Detection results parsed and displayed in real-time

### Model Manager Architecture

```typescript
// Singleton pattern prevents duplicate model loading
const manager = getAadhaarModelManager();

// Single shared ONNX session across all components
await manager.loadModel();

// Detect from video (CameraCapture)
const result = await manager.detectVideo(videoElement);

// Detect from image (FileUpload)
const result = await manager.detectImage(imageBase64);

// Cleanup when done (Result page)
await unloadAadhaarModel();
```

### Face Detection Validation (Selfie)

The selfie capture uses **MediaPipe Face Landmarker** with multiple validation rules:

| Rule | Check | Status Message |
|------|-------|----------------|
| **Face Count** | Exactly 1 face detected | "Find face..." / "One person only" |
| **Face Size** | Area > 6% of frame | "Come closer" |
| **Centering** | Face center at X: 35-65%, Y: 25-65% | "Center your face" |
| **Front Facing** | Nose-to-ear ratio 0.4-2.5 | "Look straight" |
| **Eyes Open** | Blink score < 0.5 for both eyes | "Open your eyes" |
| **Face Visible** | 6+ key landmarks in frame | "Show full face" |
| **Mouth Visible** | Mouth blendshapes detected | "Show full face" |

When all checks pass → **"Holding... 3"** → Auto-capture after countdown.

### Detection Classes

| Class | Description |
|-------|-------------|
| `aadhaar_front` | Front side of Aadhaar card (with photo) |
| `aadhaar_back` | Back side of Aadhaar card (with QR code) |
| `print_aadhaar` | Printed/photocopied Aadhaar (fraud indicator) |

### Model Variants

| Variant | Size | Input | Best For |
|---------|------|-------|----------|
| `full` | ~99MB | 640px | Desktop, high accuracy |
| `small` | ~99MB | 320px | Desktop, faster inference |
| `int8` | ~25MB | 640px | Mobile, good accuracy |
| `int8_small` | ~25MB | 320px | Mobile, fastest |

```typescript
// Auto-detect best model for device
await manager.loadModel('auto');

// Or explicitly load INT8 for mobile
await manager.loadModel('int8');

// Use helper functions
import { preloadInt8Model, loadBestModel } from '@/lib/aadhaar-model-manager';
await preloadInt8Model();  // For mobile optimization
await loadBestModel();     // Auto-detect best option
```

---

## 📱 INT8 Quantization for Mobile

### Benefits
- **~4x smaller model** - From ~99MB to ~25MB
- **2-4x faster inference** - Better for mobile CPUs
- **Lower memory usage** - Runs smoothly on low-end devices
- **Better battery life** - Reduced computational load

### Generate INT8 Model

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Quantize all models (dynamic quantization)
python quantize_to_int8.py --all

# Or quantize specific model with static quantization (better accuracy)
python quantize_to_int8.py -i ../public/models/aadhaar_detector.onnx -m static

# Options:
#   --input, -i    : Input ONNX model path
#   --method, -m   : 'dynamic' (default) or 'static'
#   --size, -s     : Input size (640 or 320)
#   --all, -a      : Quantize all models
```

### Output Files
```
public/models/
├── aadhaar_detector.onnx           # Original FP32 (~99MB)
├── aadhaar_detector_int8.onnx      # INT8 quantized (~25MB)
├── aadhaar_detector_small.onnx     # Small FP32 (~99MB)
├── aadhaar_detector_small_int8.onnx # Small INT8 (~25MB)
└── model_info.json                 # Model metadata
```

---

## 🚀 Memory Optimization

### Problem
Running ML models in browser can consume 1GB+ of memory, causing crashes on mobile devices.

### Solution
Implemented several optimizations to reduce memory to ~300-400MB:

| Optimization | Memory Saved | Description |
|--------------|--------------|-------------|
| **INT8 Quantization** | ~75MB | 4x smaller model size (~99MB → ~25MB) |
| **Singleton Model** | ~200MB | One shared ONNX session instead of per-component |
| **Reusable Canvas** | ~20MB | Single canvas with `willReadFrequently` optimization |
| **Reduced Detection** | CPU -33% | 750ms interval + visibility check |
| **Image Compression** | ~40% | Max 1280px, JPEG quality 0.8 |
| **Tensor Disposal** | ~50MB | Explicit cleanup after each inference |
| **DB Caching** | ~5MB | Single cached IndexedDB connection |

### Key Files

- [`src/lib/aadhaar-model-manager.ts`](src/lib/aadhaar-model-manager.ts) - Singleton model manager
- [`src/hooks/useAadhaarDetection.ts`](src/hooks/useAadhaarDetection.ts) - React hook using manager
- [`src/components/CameraCapture.tsx`](src/components/CameraCapture.tsx) - Optimized capture component

---

## 🔒 Security

### JWT Authentication
- All backend API calls require valid JWT tokens
- Tokens expire in **5 minutes** for security
- Each request gets a unique `request_id`
- Token validation checks issuer, expiration, and signature

### CORS Protection
- Only allowed origins can access the backend
- Configurable via environment variables
- Preflight requests cached for 10 minutes

### Data Security
- Sensitive files excluded from git via `.gitignore`
- Environment variables for all secrets
- Temporary files cleaned up after processing

### Multi-User Session Handling
- When a new `user_id` is detected from JWT, old cached images are automatically cleared
- Each user gets isolated storage in `public/uploads/{user_id}/`
- IndexedDB data is reset when switching users
- Prevents data leakage between different verification sessions

---

## 📁 Project Structure

```
ai-verification-frontend/
├── 📄 package.json              # Node.js dependencies
├── 📄 next.config.ts            # Next.js configuration
├── 📄 tsconfig.json             # TypeScript configuration
├── 📄 .env.local                # Frontend environment variables
├── 📄 .env.example              # Example environment template
├── 📄 docker-compose.yml        # Docker orchestration
├── 📄 Dockerfile.frontend       # Frontend container
│
├── 📂 src/
│   ├── 📂 app/
│   │   ├── 📄 page.tsx          # Landing page (JWT handler)
│   │   ├── 📄 layout.tsx        # Root layout
│   │   ├── 📄 globals.css       # Global styles
│   │   │
│   │   ├── 📂 api/              # API Routes
│   │   │   ├── 📂 verify-image/      # Document verification
│   │   │   ├── 📂 submit-verification/ # Final submission
│   │   │   ├── 📂 save-selfie/       # Selfie storage
│   │   │   ├── 📂 save-aadhaar-image/ # Aadhaar front/back storage
│   │   │   └── 📂 save-jwt-data/     # JWT data storage
│   │   │
│   │   ├── 📂 edge-demo/        # Edge inference demo page
│   │   │
│   │   └── 📂 verify/           # Verification Flow Pages
│   │       ├── 📄 layout.tsx    # Verification layout
│   │       ├── 📂 selfie/       # Selfie capture (MediaPipe)
│   │       ├── 📂 front/        # Front card capture (ONNX)
│   │       ├── 📂 back/         # Back card capture (ONNX)
│   │       ├── 📂 details/      # User details form
│   │       └── 📂 result/       # Verification result + cleanup
│   │
│   ├── 📂 components/
│   │   ├── 📄 CameraCapture.tsx      # Camera + AI detection
│   │   ├── 📄 FileUpload.tsx         # File upload + compression
│   │   ├── 📄 EdgeDetector.tsx       # Edge inference component
│   │   ├── 📄 VerificationStore.ts   # Zustand state management
│   │   └── 📄 StoreResetter.tsx      # Reset + memory cleanup
│   │
│   ├── 📂 hooks/
│   │   ├── 📄 useAadhaarDetection.ts # Aadhaar detection hook
│   │   └── 📄 useEdgeInference.ts    # Generic edge inference hook
│   │
│   └── 📂 lib/
│       ├── 📄 aadhaar-model-manager.ts  # 🆕 Singleton model manager
│       ├── 📄 jwt.ts                    # JWT utilities
│       ├── 📄 db.ts                     # IndexedDB wrapper
│       ├── 📄 utils.ts                  # Helper functions
│       ├── 📄 clientAI.ts               # Client-side AI utilities
│       │
│       └── 📂 edge-inference/           # Edge ML utilities
│           ├── 📄 index.ts              # Exports
│           ├── 📄 engine.ts             # Inference engine
│           ├── 📄 image-utils.ts        # Image preprocessing
│           ├── 📄 postprocess.ts        # Detection postprocessing
│           └── 📄 types.ts              # Type definitions
│
├── 📂 public/
│   ├── 📂 models/               # ONNX models for edge inference
│   │   ├── 📄 aadhaar_detector.onnx       # Full model (~99MB)
│   │   ├── 📄 aadhaar_detector_small.onnx # Small model (~99MB)
│   │   └── 📄 model_info.json             # Model metadata
│   │
│   ├── 📂 onnx/                 # ONNX Runtime Web files
│   │   └── 📄 ort.*.mjs         # WASM runtime files
│   │
│   └── 📂 uploads/              # Uploaded files storage
│       └── 📂 {user_id}/        # Per-user directory
│           ├── 📄 jwt_data.json     # User JWT data
│           ├── 📄 selfie.jpg        # Selfie image
│           ├── 📄 aadhaar_front.jpg # Aadhaar front image
│           └── 📄 aadhaar_back.jpg  # Aadhaar back image
│
├── 📂 backend/
│   ├── 📄 main.py               # FastAPI application
│   ├── 📄 main_stateless.py     # Stateless API version
│   ├── 📄 onnx_detector.py      # ONNX-based detection
│   ├── 📄 convert_to_onnx.py    # Model conversion script
│   ├── 📄 requirements.txt      # Python dependencies
│   ├── 📄 Dockerfile            # Backend container
│   │
│   ├── 📂 models/
│   │   └── 📄 best4.pt          # YOLO model weights
│   │
│   └── 📂 temp/
│       └── 📂 downloads/        # Temporary image storage
│
├── 📂 tests/                    # Load testing
│   └── 📂 k6/
│       ├── 📄 load_test.js
│       └── 📄 load_test_with_jwt.js
│
└── 📂 data/
    └── 📂 jwt-logs/             # JWT logging for debugging
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 20.x
- **Python** >= 3.11
- **npm** or **yarn**
- **CUDA** (optional, for GPU acceleration)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ai-verification-frontend.git
cd ai-verification-frontend
```

### 2. Setup Frontend

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Edit .env.local with your JWT secret
```

### 3. Setup Backend

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux
# or
venv\Scripts\activate     # On Windows

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env

# Edit .env with the SAME JWT secret as frontend
```

### 4. Add YOLO Model

Place your trained YOLO model at:
```
backend/models/best4.pt
```

### 5. Start the Servers

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate
python main.py
# Server runs at http://127.0.0.1:8109
```

**Terminal 2 - Frontend:**
```bash
npm run dev
# Server runs at http://localhost:3000
```

---

## 📡 API Reference

### Backend Endpoints (FastAPI)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/detect` | JWT | Detect Aadhaar cards in images |
| `GET` | `/health` | No | Health check endpoint |
| `GET` | `/` | No | API information |

#### POST /detect

**Request:**
```json
{
  "user_id": "string",
  "passport_first": "https://example.com/front.jpg",
  "passport_old": "https://example.com/back.jpg",
  "confidence_threshold": 0.50
}
```

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Response:**
```json
{
  "success": true,
  "detected": true,
  "message": "Both Aadhaar cards detected successfully.",
  "data": {
    "user_id": "string",
    "front_detected": true,
    "back_detected": true,
    "front_confidence": 0.95,
    "back_confidence": 0.92,
    "both_detected": true,
    "print_aadhar_detected": false
  }
}
```

### Frontend API Routes (Next.js)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/verify-image` | Verify document images |
| `POST` | `/api/submit-verification` | Submit final verification |
| `POST` | `/api/save-selfie` | Save selfie image |
| `POST` | `/api/save-jwt-data` | Save JWT decoded data |

---

## ⚙️ Environment Variables

### Frontend (`.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET_KEY` | Secret key for JWT signing | Required |
| `JWT_ISSUER` | JWT issuer identifier | `ai-verification-frontend` |
| `BACKEND_API_URL` | Backend API URL | `http://127.0.0.1:8109` |
| `NODE_ENV` | Environment mode | `development` |

### Backend (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET_KEY` | Secret key for JWT (must match frontend) | Required |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_ISSUER` | JWT issuer identifier | `ai-verification-frontend` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins | `http://localhost:3000` |
| `MODEL1_PATH` | Path to YOLO model | `models/best4.pt` |
| `DOWNLOAD_DIR` | Temporary download directory | `temp/downloads` |
| `CONFIDENCE_THRESHOLD` | Detection confidence threshold | `0.15` |

> ⚠️ **Important:** `JWT_SECRET_KEY` must be identical in both frontend and backend!

---

## 📱 Usage

### Method 1: Direct URL with JWT Token

1. Generate a JWT token with user data:
```json
{
  "user_id": "123456789",
  "name": "John Doe",
  "dob": "15-08-1995",
  "gender": "Male",
  "password": ""
}
```

2. Access the app with token:
```
http://localhost:3000/?token=<your-jwt-token>
```

### Method 2: Manual Entry

1. Navigate to `http://localhost:3000/verify/details`
2. Fill in user details manually
3. Proceed through the verification flow

### Verification Flow

```
1. Selfie → 2. Front Card → 3. Back Card → 4. Result
```

### Detailed Step Flow

| Step | Page | AI Used | Description |
|------|------|---------|-------------|
| 1 | `/verify/selfie` | MediaPipe (GPU) | Face detection + auto-capture when aligned |
| 2 | `/verify/front` | ONNX (WASM) | Real-time front card detection |
| 3 | `/verify/back` | ONNX (WASM) | Real-time back card detection |
| 4 | `/verify/result` | - | Shows status + cleans up memory |

---

## 🛠️ Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.x | React framework with App Router |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| ONNX Runtime Web | 1.17.x | Browser ML inference |
| MediaPipe | 0.10.x | Face detection |
| IndexedDB | - | Client-side storage |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.115.x | Python API framework |
| Ultralytics | 8.x | YOLOv8 inference |
| PyJWT | 2.x | JWT authentication |
| Python | 3.11+ | Runtime |

---

## 🧪 Testing

### Test Backend Health
```bash
curl http://127.0.0.1:8109/health
```

### Test with JWT
```bash
# Generate a test token first, then:
curl -X POST http://127.0.0.1:8109/detect \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "passport_first": "http://localhost:3000/uploads/test/front.jpg"}'
```

---

## 🐳 Docker (Coming Soon)

```yaml
# docker-compose.yml
version: '3.8'
services:
  frontend:
    build: .
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      
  backend:
    build: ./backend
    ports:
      - "8109:8109"
    environment:
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - ALLOWED_ORIGINS=http://frontend:3000
```

---

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 📬 Contact

Project Link: [https://github.com/your-username/ai-verification-frontend](https://github.com/your-username/ai-verification-frontend)

---

<p align="center">
  Made with ❤️ for secure identity verification
</p>
