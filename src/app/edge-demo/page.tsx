'use client';

/**
 * Edge Detection Demo Page
 * Tests on-device YOLO inference using ONNX Runtime Web
 */

import React, { useState, useRef } from 'react';
import EdgeDetector from '@/components/EdgeDetector';
import { InferenceResult } from '@/lib/edge-inference';

export default function EdgeDemoPage() {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<InferenceResult | null>(null);
  const [useSmallModel, setUseSmallModel] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      setImageUrl(URL.createObjectURL(file));
      setLastResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      setImageUrl(URL.createObjectURL(file));
      setLastResult(null);
    }
  };

  const handleDetectionComplete = (result: InferenceResult) => {
    setLastResult(result);
    console.log('Detection result:', result);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🚀 Edge-Based Aadhaar Detection
          </h1>
          <p className="text-gray-600">
            On-device ML inference using ONNX Runtime Web - No server required!
          </p>
          <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            All processing happens in your browser
          </div>
        </div>

        {/* Model Selection */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Model Settings</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useSmallModel}
                onChange={(e) => setUseSmallModel(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-gray-700">
                Use smaller model (320px) - Faster on mobile devices
              </span>
            </label>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Standard model (640px): ~100MB, higher accuracy<br />
            Small model (320px): ~100MB, faster inference
          </p>
        </div>

        {/* Image Upload */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Upload Image</h2>
          
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-lg mb-2">Drop your Aadhaar card image here</p>
              <p className="text-sm">or click to browse</p>
            </div>
          </div>

          {/* Camera Capture */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Choose Image
            </button>
          </div>
        </div>

        {/* Detection Component */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Detection Result</h2>
          
          <EdgeDetector
            image={selectedImage}
            useSmallModel={useSmallModel}
            onDetectionComplete={handleDetectionComplete}
            onModelLoaded={() => setModelLoaded(true)}
            showOverlay={true}
            showDebug={true}
            autoDetect={true}
          />
        </div>

        {/* Performance Stats */}
        {lastResult && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Performance Stats</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {lastResult.inferenceTime.toFixed(0)}ms
                </p>
                <p className="text-sm text-gray-500">Inference Time</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {lastResult.detections.length}
                </p>
                <p className="text-sm text-gray-500">Detections</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {(lastResult.frontConfidence * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-gray-500">Front Confidence</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">
                  {(lastResult.backConfidence * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-gray-500">Back Confidence</p>
              </div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">How it Works</h3>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start">
              <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-sm font-bold mr-3 mt-0.5">1</span>
              <span>Model is downloaded once and cached in your browser (~100MB)</span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-sm font-bold mr-3 mt-0.5">2</span>
              <span>ONNX Runtime Web loads the YOLO model using WebGL/WASM</span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-sm font-bold mr-3 mt-0.5">3</span>
              <span>All inference runs on your device - no data sent to server</span>
            </li>
            <li className="flex items-start">
              <span className="w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-sm font-bold mr-3 mt-0.5">4</span>
              <span>Works offline after first model download</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
