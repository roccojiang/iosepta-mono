FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    git \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY scripts/sample-images/requirements.txt /tmp/requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r /tmp/requirements.txt

# Set up build directory
WORKDIR /build

# Copy package files and install Node dependencies
COPY scripts/sample-images/package.json scripts/sample-images/package-lock.json ./scripts/sample-images/
RUN cd scripts/sample-images && npm ci --production=false

# Copy the rest of the build context
COPY .iosevka-version private-build-plans.toml ./
COPY scripts/sample-images/ ./scripts/sample-images/

# Make entrypoint executable
RUN chmod +x scripts/sample-images/docker-entrypoint.sh

# Output directory (mount point)
VOLUME ["/out"]

ENTRYPOINT ["/build/scripts/sample-images/docker-entrypoint.sh"]
