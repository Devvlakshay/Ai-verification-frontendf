# �️ AI-Powered Identity Verification System
---

## 📋 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Security](#-security)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Environment Variables](#-environment-variables)
- [Usage](#-usage)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

This application provides a complete identity verification solution that:

1. **Captures user selfie** using device camera
2. **Scans Aadhaar cards** (front & back) using camera or file upload
3. **Verifies document authenticity** using AI-powered detection (YOLO model)
4. **Detects fraud** by identifying printed/photocopied documents
5. **Secures all communications** with JWT authentication and CORS protection

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Browser                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Next.js Frontend                          │   │
│  │  • Camera Capture    • File Upload    • State Management    │   │
│  │  • IndexedDB Storage • JWT Handling   • Responsive UI       │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ HTTPS + JWT (Authorization Header)
                               │ CORS Protected
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Next.js API Routes                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  /api/verify-image     │  /api/submit-verification          │   │
│  │  /api/save-selfie      │  /api/save-jwt-data                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ HTTP + JWT (Bearer Token)
                               │ Internal Network
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (Python)                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  • JWT Validation      • CORS Middleware                    │   │
│  │  • YOLO Model Inference • Image Processing                  │   │
│  │  • Aadhaar Detection   • Fraud Detection                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### Frontend (Next.js)
- 📱 **Responsive UI** - Works on all devices
- 📷 **Camera Integration** - Capture selfie and documents
- 📤 **File Upload** - Alternative to camera capture
- 💾 **IndexedDB Storage** - Persist data across steps
- 🔐 **JWT Token Handling** - Secure session management
- 🎨 **Modern UI** - Tailwind CSS with animations

### Backend (FastAPI)
- 🤖 **YOLO AI Model** - Real-time document detection
- 🛡️ **JWT Authentication** - Secure API endpoints
- 🌐 **CORS Protection** - Controlled origin access
- 🔍 **Fraud Detection** - Identifies printed/fake documents
- ⚡ **Async Processing** - High-performance image handling
- 🔧 **GPU Support** - CUDA acceleration when available

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

---

## 📁 Project Structure

```
ai-verification-frontend/
├── 📄 package.json              # Node.js dependencies
├── 📄 next.config.ts            # Next.js configuration
├── 📄 tsconfig.json             # TypeScript configuration
├── 📄 .env.local                # Frontend environment variables
├── 📄 .env.example              # Example environment template
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
│   │   │   └── 📂 save-jwt-data/     # JWT data storage
│   │   │
│   │   └── 📂 verify/           # Verification Flow Pages
│   │       ├── 📄 layout.tsx    # Verification layout
│   │       ├── 📂 details/      # User details form
│   │       ├── 📂 selfie/       # Selfie capture
│   │       ├── 📂 front/        # Front card capture
│   │       ├── 📂 back/         # Back card capture
│   │       └── 📂 result/       # Verification result
│   │
│   ├── 📂 components/
│   │   ├── 📄 CameraCapture.tsx      # Camera component
│   │   ├── 📄 FileUpload.tsx         # File upload component
│   │   ├── 📄 VerificationStore.ts   # State management
│   │   └── 📄 StoreResetter.tsx      # Reset utility
│   │
│   └── 📂 lib/
│       ├── 📄 jwt.ts            # JWT utilities
│       ├── 📄 db.ts             # IndexedDB wrapper
│       └── 📄 utils.ts          # Helper functions
│
├── 📂 backend/
│   ├── 📄 main.py               # FastAPI application
│   ├── 📄 requirements.txt      # Python dependencies
│   ├── 📄 .env                  # Backend environment variables
│   ├── 📄 .env.example          # Example environment template
│   │
│   ├── 📂 models/
│   │   └── 📄 best4.pt          # YOLO model weights
│   │
│   └── 📂 temp/
│       └── 📂 downloads/        # Temporary image storage
│
└── 📂 public/
    └── 📂 uploads/              # Uploaded files storage
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
  "password": "123569"
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
1. Details → 2. Selfie → 3. Front Card → 4. Back Card → 5. Result
```

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
