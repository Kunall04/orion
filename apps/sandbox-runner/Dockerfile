FROM node:22-bookworm-slim

# Install git, bash, and ca-certificates for agent shell command execution
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root monorepo configuration
COPY package.json package-lock.json tsconfig.base.json ./

# Copy packages and sandbox-runner workspace definitions
COPY packages/shared/package.json ./packages/shared/
COPY apps/sandbox-runner/package.json ./apps/sandbox-runner/

# Install dependencies for sandbox-runner and shared package
RUN npm ci --workspace @cloud-agent/sandbox-runner --include-workspace-root

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/sandbox-runner ./apps/sandbox-runner

# Project workspace directory where agent runs commands and edits code
RUN mkdir -p /workspace
ENV WORKSPACE_DIR=/workspace
WORKDIR /workspace

# Expose port and open network binding for host backend
ENV HOST=0.0.0.0
ENV PORT=5000
EXPOSE 5000

# Start sandbox runner server
CMD ["npm", "run", "start", "--prefix", "/app", "--workspace", "@cloud-agent/sandbox-runner"]
