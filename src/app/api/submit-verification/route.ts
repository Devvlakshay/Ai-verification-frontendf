import { NextResponse } from 'next/server';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { getSecureHeaders } from '@/lib/jwt';

/**
 * Submit Verification API Route
 * 
 * Key changes:
 * - Saves images to disk in public/uploads/{user_id}/
 * - Supports force_upload flag for three-strike rule bypass
 * - Handles pending_review status for manual review queue
 */

// Backend URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8109';

// Helper function to save base64 image to disk
async function saveImageToDisk(base64Image: string, userId: string, filename: string): Promise<string> {
  try {
    // Extract base64 data (remove data:image/...;base64, prefix if present)
    const base64Data = base64Image.includes(';base64,') 
      ? base64Image.split(';base64,').pop()! 
      : base64Image;
    
    // Define path: public/uploads/{user_id}/
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', userId);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      await fs.promises.mkdir(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, filename);
    
    // Save file
    await fs.promises.writeFile(filePath, base64Data, { encoding: 'base64' });
    
    console.log(`✅ Saved: public/uploads/${userId}/${filename}`);
    return `/uploads/${userId}/${filename}`;
  } catch (error) {
    console.error(`❌ Failed to save ${filename}:`, error);
    throw error;
  }
}

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

    // Save images to disk (public/uploads/{user_id}/)
    console.log("💾 Saving images to disk...");
    const savedPaths: { front?: string; back?: string } = {};
    
    try {
      // Save front and back images in parallel
      const [frontPath, backPath] = await Promise.all([
        saveImageToDisk(passport_first, String(user_id), 'aadhaar_front.jpg'),
        saveImageToDisk(passport_old, String(user_id), 'aadhaar_back.jpg')
      ]);
      
      savedPaths.front = frontPath;
      savedPaths.back = backPath;
      console.log("✅ Images saved:", savedPaths);
    } catch (saveError) {
      console.warn("⚠️ Failed to save images to disk, continuing with verification:", saveError);
      // Continue with verification even if saving fails
    }

    // Send base64 images directly to backend
    const backendPayload = {
      user_id: String(user_id),
      front_image: passport_first,  // Base64 string
      back_image: passport_old,     // Base64 string
      force_upload: force_upload
    };

    console.log("Sending payload to Python backend...");

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
      saved_paths: savedPaths,  // Include saved paths in response
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
