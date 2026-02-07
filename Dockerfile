FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run server
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}
