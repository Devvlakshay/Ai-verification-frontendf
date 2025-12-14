import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// Helper to save base64 to disk
const saveFile = async (base64Data: string | null, filename: string) => {
  if (!base64Data) throw new Error(`Missing image data for ${filename}`);

  // Remove header data (data:image/jpeg;base64,...)
  const base64Image = base64Data.split(';base64,').pop();
  
  // Define upload path (public/uploads)
  const uploadDir = path.join(process.cwd(), 'public/uploads');
  
  // Ensure directory exists
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  
  const filePath = path.join(uploadDir, filename);
  
  // Write file
  await fs.promises.writeFile(filePath, base64Image!, { encoding: 'base64' });
  
  // Return absolute path for Python backend
  return path.resolve(filePath);
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, dob, gender, selfie_photo, passport_first, passport_old } = body;

    // 1. Validation
    if (!user_id || !selfie_photo || !passport_first || !passport_old) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 2. Save images to local disk
    // Note: In Vercel production, this filesystem is ephemeral. 
    // This approach works because you are running the backend locally alongside Next.js.
    const selfiePath = await saveFile(selfie_photo, `${user_id}_selfie.jpg`);
    const frontPath = await saveFile(passport_first, `${user_id}_front.jpg`);
    const backPath = await saveFile(passport_old, `${user_id}_back.jpg`);

    // 3. Construct Payload for Python Backend
    const backendPayload = {
      user_id: user_id,
      dob: dob, // Expected: DD-MM-YYYY
      gender: gender,
      passport_first: frontPath, // Sending absolute local path
      passport_old: backPath,    // Sending absolute local path
      selfie_photo: selfiePath   // Sending absolute local path
    };

    console.log("Forwarding to Python Backend:", backendPayload);

    // 4. Call Python API
    const pythonResponse = await axios.post('http://localhost:8000/verification/verify', backendPayload);

    // 5. Return result
    return NextResponse.json(pythonResponse.data);

  } catch (error: any) {
    console.error("Verification Bridge Error:", error.message);
    
    // Handle Axios errors from Python backend
    if (error.response) {
      return NextResponse.json(error.response.data, { status: error.response.status });
    }
    
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}