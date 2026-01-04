import { NextResponse } from 'next/server';
import axios from 'axios';
import { getSecureHeaders } from '@/lib/jwt';

/**
 * Stateless Submit Verification API Route
 * 
 * Key changes:
 * - NO disk writes - images sent directly as base64
 * - Supports force_upload flag for three-strike rule bypass
 * - Handles pending_review status for manual review queue
 */

// Backend URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8109';

interface SubmitVerificationRequest {
  user_id: string;
  dob?: string;
  gender?: string;
  selfie_photo?: string;
  passport_first?: string;
  passport_old?: string;
  force_upload?: boolean;
}

export async function POST(req: Request) {
  try {
    const body: SubmitVerificationRequest = await req.json();
    
    const { 
      user_id, 
      dob,
      gender,
      selfie_photo, 
      passport_first, 
      passport_old,
      force_upload = false
    } = body;

    console.log("------------------------------------------------");
    console.log("Stateless Verification Request:");
    console.log("User ID:", user_id);
    console.log("DOB Input:", dob);
    console.log("Gender Input:", gender);
    console.log("Force Upload:", force_upload);
    console.log("------------------------------------------------");

    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!passport_first || !passport_old) {
      return NextResponse.json({ error: 'Both front and back images are required' }, { status: 400 });
    }

    // Send base64 images directly to backend - NO DISK WRITES
    const backendPayload = {
      user_id: String(user_id),
      front_image: passport_first,  // Base64 string
      back_image: passport_old,     // Base64 string
      force_upload: force_upload
    };

    console.log("Sending stateless payload to Python backend...");

    const secureHeaders = await getSecureHeaders(String(user_id));
    
    const pythonResponse = await axios.post(
      `${BACKEND_URL}/detect`, 
      backendPayload,
      {
        headers: secureHeaders,
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    console.log("Python Response Status:", pythonResponse.status);
    
    const backendData = pythonResponse.data;
    const status = backendData.data?.status || 'rejected';

    let final_decision = 'REJECTED';
    let reason = backendData.message || 'Verification failed.';

    // Determine final decision based on status
    if (status === 'approved' && backendData.success && backendData.data?.both_detected) {
      final_decision = 'APPROVED';
    } else if (status === 'pending_review') {
      final_decision = 'PENDING_REVIEW';
      reason = 'Your document has been submitted for manual review.';
    }

    const frontendResponse = {
      final_decision: final_decision,
      reason: reason,
      status: status,
      details: backendData 
    };

    return NextResponse.json(frontendResponse);

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
