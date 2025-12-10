#!/bin/bash

echo "🚀 Preparing for Vercel deployment..."

# 1. Install dependencies
echo "1. Installing dependencies..."
npm install

# 2. Build TypeScript
echo "2. Building TypeScript..."
npm run build

# 3. Check if pg is installed
echo "3. Checking pg package..."
if npm list pg | grep -q "pg"; then
    echo "✅ pg package is installed"
else
    echo "❌ pg package not found, installing..."
    npm install pg --save
fi

# 4. Test build
echo "4. Testing build..."
if [ -f "dist/index.js" ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo "📦 Ready for deployment!"
echo "Run: vercel --prod"