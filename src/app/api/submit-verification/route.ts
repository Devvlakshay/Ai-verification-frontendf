import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// Helper to save base64 to disk
const saveFile = async (base64Data: string | null, userId: string, filename: string) => {
  if (!base64Data) return null;

  // Remove header
  const base64Image = base64Data.split(';base64,').pop();
  if (!base64Image) return null;

  // Define path: public/uploads/{user_id}/
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', userId);
  
  // Create folder
  if (!fs.existsSync(uploadDir)) {
    await fs.promises.mkdir(uploadDir, { recursive: true });
  }
  
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, base64Image, { encoding: 'base64' });
  
  // Return absolute path
  return path.resolve(filePath);
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 1. Destructure ALL fields explicitly
    const { 
      user_id, 
      dob,       // Check this value
      gender,    // Check this value
      selfie_photo, 
      passport_first, 
      passport_old 
    } = body;

    // Debug Log: Check what arrived from Frontend
    console.log("------------------------------------------------");
    console.log("Incoming Verification Request:");
    console.log("User ID:", user_id);
    console.log("DOB Input:", dob);
    console.log("Gender Input:", gender);
    console.log("------------------------------------------------");

    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // 2. Save Images locally
    const selfiePath = await saveFile(selfie_photo, user_id, 'selfie.jpg');
    const frontPath = await saveFile(passport_first, user_id, 'aadharfront.jpg');
    const backPath = await saveFile(passport_old, user_id, 'aadharback.jpg');

    if (!selfiePath || !frontPath || !backPath) {
      return NextResponse.json({ error: 'Failed to save images' }, { status: 500 });
    }

    // 3. Construct Python Payload (Strict Mapping)
    const backendPayload = {
      user_id: String(user_id),       // Ensure string
      dob: String(dob || ""),         // Ensure string (even if empty)
      gender: String(gender || ""),   // Ensure string
      passport_first: frontPath,
      passport_old: backPath,
      selfie_photo: selfiePath
    };

    console.log("Sending Payload to Python:", JSON.stringify(backendPayload, null, 2));

    // 4. Send to Python Backend
    const pythonResponse = await axios.post(
      'http://51.255.153.51:8101/verification/verify', 
      backendPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000 // 2 minutes timeout for OCR/AI
      }
    );

    console.log("Python Response Status:", pythonResponse.status);
    
    return NextResponse.json(pythonResponse.data);

  } catch (error: any) {
    console.error("API Route Error:", error.message);
    if (error.response) {
      console.error("Python Backend Error:", error.response.data);
      return NextResponse.json(error.response.data, { status: error.response.status });
    }
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
