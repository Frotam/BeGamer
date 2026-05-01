FROM python:3.11-alpine

# Install node for runner server
RUN apk add --no-cache nodejs npm

# Create non-root user
RUN adduser -D runner

WORKDIR /app

COPY server.js .

RUN npm install express

# Drop root privileges
USER runner

EXPOSE 3000

CMD ["node", "server.js"]