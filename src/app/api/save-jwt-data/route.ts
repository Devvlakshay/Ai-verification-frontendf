import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_id, name, dob, gender, timestamp } = body;

    // Define path: public/uploads/{user_id}/ (same as images)
    const dataDir = path.join(process.cwd(), 'public', 'uploads', user_id);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      await fs.promises.mkdir(dataDir, { recursive: true });
    }

    // Create filename
    const filename = 'jwt_data.json';
    const filePath = path.join(dataDir, filename);

    // Prepare data to save
    const jwtData = {
      user_id,
      name,
      dob,
      gender,
      timestamp,
      verified_at: new Date().toISOString()
    };

    // Save to JSON file
    await fs.promises.writeFile(
      filePath, 
      JSON.stringify(jwtData, null, 2),
      'utf-8'
    );

    console.log(`✅ JWT data saved: public/uploads/${user_id}/${filename}`);

    return NextResponse.json({ 
      success: true, 
      message: 'JWT data saved successfully',
      path: `/uploads/${user_id}/${filename}`
    });

  } catch (error: any) {
    console.error('❌ Error saving JWT data:', error);
    return NextResponse.json(
      { error: 'Failed to save JWT data', details: error.message },
      { status: 500 }
    );
  }
}
