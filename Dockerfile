FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install

# Copy the rest of the files
COPY . .

# Expose the application port
EXPOSE 3000

# Run the application with required environment variable
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENTRYPOINT ["bun", "index.ts"]

# Use CMD for default arguments, which can be overridden at runtime
CMD ["--config", "./clash.yaml", "--url", "https://example.com/clash"] 