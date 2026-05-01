FROM node:20-alpine

# Create non-root user
RUN adduser -D runner

WORKDIR /app

COPY server.js .

RUN npm install express

# Drop root privileges
USER runner

# Important: only expose needed port
EXPOSE 3000

CMD ["node", "server.js"]