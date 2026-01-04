# Dockerfile for Stateless AI Verification Backend
# Zero disk I/O - all processing in memory
# Optimized for high concurrency (10k-20k concurrent users)

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create models directory (model will be mounted or copied separately)
RUN mkdir -p models

# Expose port
EXPOSE 8109

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8109/health')" || exit 1

# Run the stateless backend
CMD ["uvicorn", "main_stateless:app", "--host", "0.0.0.0", "--port", "8109", "--workers", "4"]
