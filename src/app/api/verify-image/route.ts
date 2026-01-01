import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

// This helper saves the file where it can be publicly accessed by the backend service
const saveFile = async (base64Data: string | null, userId: string, filename: string) => {
  try {
    if (!base64Data) {
      console.error('❌ No base64 data provided');
      return null;
    }

    const base64Image = base64Data.split(';base64,').pop();
    if (!base64Image) {
      console.error('❌ Failed to extract base64 image data');
      return null;
    }

    // Define path: public/uploads/{user_id}/
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', userId);
    
    console.log('📁 Creating directory:', uploadDir);
    if (!fs.existsSync(uploadDir)) {
      await fs.promises.mkdir(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, filename);
    console.log('💾 Saving file to:', filePath);
    await fs.promises.writeFile(filePath, base64Image, { encoding: 'base64' });
    
    // Verify file was saved
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✅ File saved: ${filename} (${stats.size} bytes)`);
    } else {
      console.error('❌ File not found after save attempt');
    }
    
    // Return public URL path, not filesystem path
    return `/uploads/${userId}/${filename}`;
  } catch (error) {
    console.error('❌ Error saving file:', error);
    return null;
  }
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      user_id = 'string', // Default user_id for folder structure
      image, 
      side,
      front_image,
      back_image
    } = body;

    // Handle both images (new flow)
    if (side === 'both' && front_image && back_image) {
      console.log('🔍 Verifying both front and back images...');
      
      // Save both files
      const frontUrlPath = await saveFile(front_image, user_id, 'front.jpg');
      const backUrlPath = await saveFile(back_image, user_id, 'back.jpg');

      if (!frontUrlPath || !backUrlPath) {
        console.error('❌ Failed to save images');
        return NextResponse.json({ error: 'Failed to save images' }, { status: 500 });
      }

      const host = req.headers.get('host') || 'localhost:3000';
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      const frontImageUrl = `${protocol}://${host}${frontUrlPath}`;
      const backImageUrl = `${protocol}://${host}${backUrlPath}`;

      console.log('📤 Sending to Python backend:', {
        front: frontImageUrl,
        back: backImageUrl
      });

      // Send both images to backend for verification
      const backendPayload = {
        user_id: String(user_id),
        passport_first: frontImageUrl,
        passport_old: backImageUrl,
      };

      try {
        const pythonResponse = await axios.post(
          'http://127.0.0.1:8109/detect', 
          backendPayload,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
          }
        );

        const backendData = pythonResponse.data;
        const frontDetected = backendData.data?.front_detected || false;
        const backDetected = backendData.data?.back_detected || false;

        console.log('✅ Python backend response:', {
          frontDetected,
          backDetected,
          message: backendData.message
        });

        // Cleanup disabled for debugging - files will remain in public/uploads
        // setTimeout(() => {
        //   if (frontUrlPath) {
        //     const frontFilePath = path.join(process.cwd(), 'public', frontUrlPath);
        //     if (fs.existsSync(frontFilePath)) fs.promises.unlink(frontFilePath);
        //   }
        //   if (backUrlPath) {
        //     const backFilePath = path.join(process.cwd(), 'public', backUrlPath);
        //     if (fs.existsSync(backFilePath)) fs.promises.unlink(backFilePath);
        //   }
        // }, 5000);

        return NextResponse.json({ 
          success: frontDetected && backDetected, 
          front_detected: frontDetected,
          back_detected: backDetected,
          message: backendData.message 
        });
      } catch (error: any) {
        console.error('❌ Python backend error:', error.message);
        console.error('Full error:', error);
        if (error.code === 'ECONNREFUSED') {
          return NextResponse.json({ 
            error: 'Python backend is not running. Please start the backend server.',
            message: 'Backend connection refused',
            front_detected: false,
            back_detected: false
          }, { status: 503 });
        }
        if (error.response) {
          console.error('Backend response error:', error.response.data);
          return NextResponse.json({
            error: 'Backend verification failed',
            message: error.response.data?.message || 'Unknown error',
            front_detected: false,
            back_detected: false
          }, { status: error.response.status });
        }
        throw error;
      }
    }

    // Handle single image (old flow, kept for compatibility)
    if (!image || !side || (side !== 'front' && side !== 'back')) {
      return NextResponse.json({ error: 'Image and a valid side (front/back/both) are required' }, { status: 400 });
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
    if (urlPath) {
      const localFilePath = path.join(process.cwd(), 'public', urlPath);
      if (fs.existsSync(localFilePath)) {
          // Not awaiting this, let it run in the background
          fs.promises.unlink(localFilePath);
      }
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
