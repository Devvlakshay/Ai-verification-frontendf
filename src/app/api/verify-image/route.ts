import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// This helper saves the file where it can be publicly accessed by the backend service
const saveFile = async (base64Data: string | null, userId: string, filename: string) => {
  if (!base64Data) return null;

  const base64Image = base64Data.split(';base64,').pop();
  if (!base64Image) return null;

  // Define path: public/uploads/{user_id}/
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', userId);
  
  if (!fs.existsSync(uploadDir)) {
    await fs.promises.mkdir(uploadDir, { recursive: true });
  }
  
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, base64Image, { encoding: 'base64' });
  
  // Return public URL path, not filesystem path
  return `/uploads/${userId}/${filename}`;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      user_id = 'string', // Default user_id for folder structure
      image, 
      side 
    } = body;

    if (!image || !side || (side !== 'front' && side !== 'back')) {
      return NextResponse.json({ error: 'Image and a valid side (front/back) are required' }, { status: 400 });
    }

    const filename = side === 'front' ? 'front.jpg' : 'back.jpg';
    // Save file and get back a URL path
    const urlPath = await saveFile(image, user_id, filename);

    if (!urlPath) {
      return NextResponse.json({ error: 'Failed to save image' }, { status: 500 });
    }

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const imageUrl = `${protocol}://${host}${urlPath}`;

    // Construct payload with the single image URL and an empty string for the other
    const backendPayload = {
        user_id: String(user_id),
        passport_first: side === 'front' ? imageUrl : "",
        passport_old: side === 'back' ? imageUrl : "",
    };

    const pythonResponse = await axios.post(
      'http://0.0.0.0:8109/detect', 
      backendPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000 // 1 minute timeout
      }
    );

    const backendData = pythonResponse.data;
    let detected = false;
    
    // Check the correct detection flag based on the side
    if (side === 'front') {
      detected = backendData.data?.front_detected || false;
    } else { // side === 'back'
      detected = backendData.data?.back_detected || false;
    }
    
    // Optional: Clean up the uploaded file after verification
    const localFilePath = path.join(process.cwd(), 'public', urlPath);
    if (fs.existsSync(localFilePath)) {
        // Not awaiting this, let it run in the background
        fs.promises.unlink(localFilePath);
    }

    if (detected) {
      return NextResponse.json({ success: true, detected: true, message: backendData.message });
    } else {
      // Provide a more specific message if the backend sends one
      const message = backendData.message || `Aadhaar ${side} card not detected. Please try again.`;
      return NextResponse.json({ success: false, detected: false, message: message });
    }

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
