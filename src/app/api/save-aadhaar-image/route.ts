import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, image, side } = body;

    console.log(`📥 Received save-aadhaar-image request: user_id=${user_id}, side=${side}, imageLength=${image?.length || 0}`);

    if (!image || !user_id || !side) {
      console.error('❌ Missing required fields:', { hasImage: !!image, hasUserId: !!user_id, hasSide: !!side });
      return NextResponse.json({ error: 'Missing image, user_id, or side' }, { status: 400 });
    }

    if (side !== 'front' && side !== 'back') {
      return NextResponse.json({ error: 'Side must be "front" or "back"' }, { status: 400 });
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
    
    const filename = `aadhaar_${side}.jpg`;
    const filePath = path.join(uploadDir, filename);
    
    // Save file
    await fs.promises.writeFile(filePath, base64Image, { encoding: 'base64' });
    
    // Verify file was saved
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`✅ Aadhaar ${side} saved: public/uploads/${user_id}/${filename} (${stats.size} bytes)`);
    }

    return NextResponse.json({ 
      success: true, 
      message: `Aadhaar ${side} saved successfully`,
      path: `/uploads/${user_id}/${filename}`
    });

  } catch (error: any) {
    console.error('❌ Error saving Aadhaar image:', error);
    return NextResponse.json(
      { error: 'Failed to save Aadhaar image', details: error.message },
      { status: 500 }
    );
  }
}
