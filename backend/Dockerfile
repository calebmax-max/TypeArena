# --- Base image ---
FROM python:3.12-slim

# Prevents Python from writing .pyc files and buffers stdout (better logs)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps needed by some Python packages (build tools, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Fly.io routes traffic to the internal_port set in fly.toml (default 8000 here)
EXPOSE 8000

# Run with uvicorn. Adjust "main:app" to match your entrypoint module:app_instance
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]