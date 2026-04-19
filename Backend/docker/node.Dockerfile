FROM node:20-alpine

WORKDIR /app

RUN adduser -D coder

USER coder

CMD ["node"]