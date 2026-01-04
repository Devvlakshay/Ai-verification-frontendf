import { NextResponse } from 'next/server';
import axios from 'axios';
import { getSecureHeaders } from '@/lib/jwt';

/**
 * Stateless Image Verification API Route
 * 
 * Key changes from previous version:
 * - NO disk writes - images sent directly as base64
 * - Supports force_upload flag for three-strike rule bypass
 * - Handles pending_review status for manual review queue
 */

// Backend URL - use stateless endpoint
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8109';

interface VerifyImageRequest {
  user_id?: string;
  image?: string;        // Single image (old flow)
  side?: 'front' | 'back' | 'both';
  front_image?: string;  // Front image (new flow)
  back_image?: string;   // Back image (new flow)
  force_upload?: boolean; // Three-strike bypass flag
}

export async function POST(req: Request) {
  try {
    const body: VerifyImageRequest = await req.json();
    const { 
      user_id = 'anonymous',
      image, 
      side,
      front_image,
      back_image,
      force_upload = false
    } = body;

    // Handle both images (new stateless flow)
    if (side === 'both' && front_image && back_image) {
      console.log('🔍 Stateless verification: both front and back images...');
      
      // Send base64 images directly to backend - NO DISK WRITES
      const backendPayload = {
        user_id: String(user_id),
        front_image: front_image,  // Base64 string
        back_image: back_image,    // Base64 string
        force_upload: force_upload
      };

      try {
        const secureHeaders = await getSecureHeaders(String(user_id));
        
        const pythonResponse = await axios.post(
          `${BACKEND_URL}/detect`, 
          backendPayload,
          {
            headers: secureHeaders,
            timeout: 60000,
            maxBodyLength: Infinity,  // Allow large base64 payloads
            maxContentLength: Infinity
          }
        );

        const backendData = pythonResponse.data;
        const frontDetected = backendData.data?.front_detected || false;
        const backDetected = backendData.data?.back_detected || false;
        const status = backendData.data?.status || 'rejected';

        console.log('✅ Stateless backend response:', {
          frontDetected,
          backDetected,
          status,
          message: backendData.message
        });

        // Handle pending_review status
        if (status === 'pending_review') {
          return NextResponse.json({ 
            success: true,
            front_detected: frontDetected,
            back_detected: backDetected,
            status: 'pending_review',
            message: 'Your document has been submitted for manual review. You will be notified once verified.'
          });
        }

        return NextResponse.json({ 
          success: frontDetected && backDetected, 
          front_detected: frontDetected,
          back_detected: backDetected,
          status: status,
          message: backendData.message 
        });
      } catch (error: unknown) {
        const axiosError = error as { code?: string; message?: string; response?: { data?: unknown; status?: number } };
        console.error('❌ Stateless backend error:', axiosError.message);
        
        if (axiosError.code === 'ECONNREFUSED') {
          return NextResponse.json({ 
            error: 'Python backend is not running. Please start the backend server.',
            message: 'Backend connection refused',
            front_detected: false,
            back_detected: false
          }, { status: 503 });
        }
        
        if (axiosError.response) {
          console.error('Backend response error:', axiosError.response.data);
          return NextResponse.json({
            error: 'Backend verification failed',
            message: (axiosError.response.data as { message?: string })?.message || 'Unknown error',
            front_detected: false,
            back_detected: false
          }, { status: axiosError.response.status });
        }
        throw error;
      }
    }

    // Handle single image (backwards compatibility)
    if (!image || !side || (side !== 'front' && side !== 'back')) {
      return NextResponse.json({ error: 'Image and a valid side (front/back/both) are required' }, { status: 400 });
    }

    // Send single image directly as base64 - NO DISK WRITES
    const backendPayload = {
      user_id: String(user_id),
      front_image: side === 'front' ? image : undefined,
      back_image: side === 'back' ? image : undefined,
      force_upload: force_upload
    };

    const secureHeaders = await getSecureHeaders(String(user_id));

    const pythonResponse = await axios.post(
      `${BACKEND_URL}/detect`, 
      backendPayload,
      {
        headers: secureHeaders,
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    const backendData = pythonResponse.data;
    let detected = false;
    
    if (side === 'front') {
      detected = backendData.data?.front_detected || false;
    } else {
      detected = backendData.data?.back_detected || false;
    }
    
    const status = backendData.data?.status || 'rejected';

    if (detected) {
      return NextResponse.json({ 
        success: true, 
        detected: true, 
        status: status,
        message: backendData.message 
      });
    } else {
      const message = backendData.message || `Aadhaar ${side} card not detected. Please try again.`;
      return NextResponse.json({ 
        success: false, 
        detected: false, 
        status: status,
        message: message 
      });
    }

  } catch (error: unknown) {
    const err = error as { message?: string; response?: { data?: unknown; status?: number } };
    console.error("API Route Error:", err.message);
    if (err.response) {
      console.error("Python Backend Error:", err.response.data);
      return NextResponse.json(err.response.data, { status: err.response.status });
    }
    return NextResponse.json(
      { error: 'Internal Server Error', details: err.message },
      { status: 500 }
    );
  }
}
