import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, image } = body;

    if (!image || !user_id) {
      return NextResponse.json({ error: 'Missing image or user_id' }, { status: 400 });
    }

    // Extract base64 data
    const base64Image = image.split(';base64,').pop();
    if (!base64Image) {
      return NextResponse.json({ error: 'Invalid image data' }, { status: 400 });
    }

    // Define path: public/uploads/{user_id}/
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', user_id);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      await fs.promises.mkdir(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, 'selfie.jpg');
    
    // Save file
    await fs.promises.writeFile(filePath, base64Image, { encoding: 'base64' });
    
    // Verify file was saved
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✅ Selfie saved: public/uploads/${user_id}/selfie.jpg (${stats.size} bytes)`);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Selfie saved successfully',
      path: `/uploads/${user_id}/selfie.jpg`
    });

  } catch (error: any) {
    console.error('❌ Error saving selfie:', error);
    return NextResponse.json(
      { error: 'Failed to save selfie', details: error.message },
      { status: 500 }
    );
  }
}
