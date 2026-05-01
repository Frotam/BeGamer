FROM gcc:13

# Install node (for the runner server)
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m runner

WORKDIR /app

COPY server.js .

RUN npm install express

# Drop root privileges
USER runner

EXPOSE 3000

CMD ["node", "server.js"]